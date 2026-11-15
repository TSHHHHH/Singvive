import { DurableObject } from 'cloudflare:workers';
import { advanceRoom, applyCommand, createRoom, joinRoom, setConnected } from '../src/coop/simulation';
import { parseEnvelope } from '../src/coop/protocol';
import type { RoomState, ServerMessage } from '../src/coop/model';
import { coopJson, readName } from './coop';

interface Identity { digest: number[]; seq: number; error?: string; connection: string }
interface SavedRoom { room: RoomState; identities: Record<string, Identity>; expiresAt: number }
interface Attachment { playerId: string; connection: string; window: number; count: number }
const RETENTION = 24 * 60 * 60 * 1000;

/** One bounded expedition. SQL writes synchronously serialize state and command receipts. */
export class CoopRoom extends DurableObject<Env> {
  private saved: SavedRoom | null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)');
    const rows = ctx.storage.sql.exec<{ value: string }>('SELECT value FROM room WHERE id = 1').toArray();
    this.saved = rows[0] ? JSON.parse(rows[0].value) as SavedRoom : null;
    if (this.saved) {
      const { room } = this.saved;
      const sockets = ctx.getWebSockets();
      const live = room.players.filter((p) => sockets.some((ws) => {
        const a = this.attachment(ws);
        return a?.playerId === p.id && a.connection === this.saved?.identities[p.id]?.connection && ws.readyState === 1;
      }));
      if (room.phase === 'running' && (!live.length || Date.now() - room.wallAt > 30000)) {
        // Do not simulate a server outage or an abandoned session as unattended deaths.
        room.pause ??= { reason: 'Session saved. Reconnect and ready up to resume.', by: null, graceUntil: 0 };
        room.resumeAt = null; room.ready = []; room.wallAt = Date.now();
      }
      // Preserve transition side effects: host succession, readiness and disconnect grace.
      for (const p of room.players) setConnected(room, p.id, live.includes(p), Date.now());
    }
  }

  private attachment(ws: WebSocket): Attachment | null {
    const data: unknown = ws.deserializeAttachment();
    if (!data || typeof data !== 'object' || !('playerId' in data) || !('connection' in data)) return null;
    return data as Attachment;
  }
  private send(ws: WebSocket, message: ServerMessage) {
    try { ws.send(JSON.stringify(message)); } catch { /* The close/error handler reconciles membership. */ }
  }
  private snapshot(ws: WebSocket) {
    const a = this.attachment(ws);
    if (!this.saved || !a) return;
    const identity = this.saved.identities[a.playerId];
    if (!identity || identity.connection !== a.connection) return;
    this.send(ws, { type: 'snapshot', room: this.saved.room, playerId: a.playerId, nextSeq: identity.seq + 1, serverNow: Date.now() });
  }
  private persist() {
    if (!this.saved) return;
    this.saved.room.revision++;
    this.ctx.storage.sql.exec('INSERT INTO room (id, value) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value', JSON.stringify(this.saved));
  }
  private broadcast() { for (const ws of this.ctx.getWebSockets()) this.snapshot(ws); }
  private async schedule() {
    if (!this.saved) { await this.ctx.storage.deleteAlarm(); return; }
    const { room, expiresAt } = this.saved;
    const next = room.phase === 'running' && !room.pause ? Date.now() + 2000 : room.resumeAt ?? expiresAt;
    await this.ctx.storage.setAlarm(Math.min(next, expiresAt));
  }
  private advance(now: number) {
    if (!this.saved) return;
    const room = this.saved.room;
    if (room.phase === 'running' && !room.pause && now - room.wallAt > 30000) {
      room.pause = { reason: 'Connection to the room was interrupted. Ready up to resume.', by: null, graceUntil: 0 };
      room.ready = []; room.resumeAt = null;
    }
    advanceRoom(room, now);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (this.saved && this.saved.expiresAt <= Date.now()) return coopJson({ error: 'This room expired.' }, 410);
    if (url.pathname === '/create' || url.pathname === '/join') {
      if (request.method !== 'POST') return coopJson({ error: 'Method not allowed.' }, 405);
      const name = await readName(request);
      if (!name) return coopJson({ error: 'Invalid survivor name.' }, 400);
      const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
      const now = Date.now();
      if (url.pathname === '/create') {
        if (this.saved) return coopJson({ error: 'Room already exists.' }, 409);
        this.saved = { room: createRoom(url.searchParams.get('code')!, crypto.randomUUID(), now), identities: {}, expiresAt: now + RETENTION };
      }
      if (!this.saved) return coopJson({ error: 'Room not found.' }, 404);
      this.advance(now);
      const playerId = crypto.randomUUID();
      const error = joinRoom(this.saved.room, playerId, name);
      if (error) return coopJson({ error }, 409);
      this.saved.identities[playerId] = { digest, seq: 0, connection: '' };
      this.saved.expiresAt = now + RETENTION;
      this.persist(); this.broadcast(); await this.schedule();
      return coopJson({ room: this.saved.room.code, playerId, token, nextSeq: 1 }, url.pathname === '/create' ? 201 : 200);
    }
    if (url.pathname !== '/ws' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return coopJson({ error: 'WebSocket upgrade required.' }, 426);
    const playerId = url.searchParams.get('playerId') ?? '';
    const token = url.searchParams.get('token') ?? '';
    if (!/^[a-f0-9-]{36}$/.test(playerId)) return coopJson({ error: 'Invalid reconnect credentials.' }, 403);
    const identity = this.saved?.identities[playerId];
    if (!identity || !/^[a-f0-9]{64}$/.test(token)) return coopJson({ error: 'Invalid reconnect credentials.' }, 403);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    if (!crypto.subtle.timingSafeEqual(digest, new Uint8Array(identity.digest))) return coopJson({ error: 'Invalid reconnect credentials.' }, 403);
    if (!this.saved) return coopJson({ error: 'Room not found.' }, 404);
    this.advance(Date.now());
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    identity.connection = crypto.randomUUID();
    for (const old of this.ctx.getWebSockets(playerId)) old.close(4001, 'Connected from another tab.');
    server.serializeAttachment({ playerId, connection: identity.connection, window: Date.now(), count: 0 } satisfies Attachment);
    this.ctx.acceptWebSocket(server, [playerId]);
    setConnected(this.saved.room, playerId, true, Date.now());
    this.saved.expiresAt = Date.now() + RETENTION;
    this.persist(); this.broadcast(); await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const a = this.attachment(ws);
    const identity = a && this.saved?.identities[a.playerId];
    if (!this.saved || !a || !identity || identity.connection !== a.connection) { ws.close(4001, 'Replaced connection.'); return; }
    const now = Date.now();
    if (now - a.window >= 1000) { a.window = now; a.count = 0; }
    a.count++; ws.serializeAttachment(a);
    if (a.count > 12) { ws.close(4008, 'Too many commands.'); return; }
    const envelope = typeof message === 'string' ? parseEnvelope(message) : null;
    if (!envelope) { this.send(ws, { type: 'error', error: 'Invalid command.' }); return; }
    if (envelope.seq <= identity.seq) {
      this.send(ws, { type: 'ack', seq: envelope.seq, ...(envelope.seq === identity.seq && identity.error ? { error: identity.error } : {}) });
      this.snapshot(ws); return;
    }
    if (envelope.seq !== identity.seq + 1) { this.send(ws, { type: 'error', error: 'Command sequence out of order. Reconnect to synchronize.' }); this.snapshot(ws); return; }
    this.advance(now);
    const error = applyCommand(this.saved.room, a.playerId, envelope.command, now);
    identity.seq = envelope.seq; identity.error = error ?? undefined;
    this.saved.expiresAt = now + RETENTION;
    this.persist();
    this.send(ws, { type: 'ack', seq: envelope.seq, ...(error ? { error } : {}) });
    this.broadcast(); await this.schedule();
  }
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    void code; void reason; void wasClean;
    const a = this.attachment(ws);
    if (!this.saved || !a || this.saved.identities[a.playerId]?.connection !== a.connection) return;
    this.advance(Date.now());
    setConnected(this.saved.room, a.playerId, false, Date.now());
    this.persist(); this.broadcast(); await this.schedule();
    try { ws.close(1000, 'Disconnected.'); } catch { /* Already closed. */ }
  }
  async webSocketError(ws: WebSocket): Promise<void> { await this.webSocketClose(ws, 1011, '', false); }
  async alarm(): Promise<void> {
    if (!this.saved) return;
    if (Date.now() >= this.saved.expiresAt) {
      for (const ws of this.ctx.getWebSockets()) ws.close(4004, 'Room expired.');
      this.saved = null; await this.ctx.storage.deleteAll(); return;
    }
    this.advance(Date.now()); this.persist(); this.broadcast(); await this.schedule();
  }
}
