import type { Command, CommandEnvelope, Credentials, RoomState, ServerMessage } from './model';

const SESSION_KEY = 'singvive.coop.v1';
const MAX_RETRIES = 7;
interface Session { credentials: Credentials; pending: CommandEnvelope | null }
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';
export interface ClientState {
  connection: ConnectionState;
  room: RoomState | null;
  pending: CommandEnvelope | null;
  error: string | null;
  retries: number;
  serverOffset: number;
}

function validCredentials(value: unknown): value is Credentials {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.room === 'string' && /^[A-Z0-9]{4,12}$/.test(record.room)
    && typeof record.playerId === 'string' && typeof record.token === 'string'
    && Number.isSafeInteger(record.nextSeq) && (record.nextSeq as number) >= 1;
}

export function readSession(): Session | null {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || !('credentials' in raw) || !validCredentials(raw.credentials)) return null;
    const candidate = 'pending' in raw ? raw.pending : null;
    const pending = candidate && typeof candidate === 'object' && 'type' in candidate
      && candidate.type === 'command' && 'seq' in candidate && Number.isSafeInteger(candidate.seq)
      && candidate.seq === raw.credentials.nextSeq && 'command' in candidate && candidate.command
      && typeof candidate.command === 'object' && 'type' in candidate.command
      ? candidate as CommandEnvelope : null;
    return { credentials: raw.credentials, pending };
  } catch {
    return null;
  }
}

function persistSession(session: Session): void {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* Reconnection still works in memory. */ }
}

export function forgetSession(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ }
}

export async function enterRoom(name: string, code?: string): Promise<Credentials> {
  const path = code ? `/api/coop/${encodeURIComponent(code)}/join` : '/api/coop';
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
  } catch {
    throw new Error('The room service could not be reached. Check your connection and try again.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error : 'The room service is unavailable on this host.');
  }
  if (!validCredentials(payload)) throw new Error('The room service returned an invalid seat. Please try again.');
  persistSession({ credentials: payload, pending: null });
  return payload;
}

/** One outstanding command, persisted before send; the server owns sequence advancement. */
export class CoopClient {
  private credentials: Credentials;
  private state: ClientState;
  private readonly listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private sentSeq: number | null = null;

  constructor(credentials: Credentials) {
    this.credentials = { ...credentials };
    const saved = readSession();
    this.state = {
      connection: 'connecting', room: null,
      pending: saved?.credentials.token === credentials.token ? saved.pending : null,
      error: null, retries: 0, serverOffset: 0,
    };
  }

  getSnapshot = (): ClientState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<ClientState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private persist(): void {
    persistSession({ credentials: this.credentials, pending: this.state.pending });
  }

  start = (): void => {
    if (this.running) return;
    this.running = true;
    this.update({ connection: this.state.room ? 'reconnecting' : 'connecting', retries: 0, error: null });
    this.open();
  };

  stop = (): void => {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.watchdog) clearTimeout(this.watchdog);
    this.timer = this.watchdog = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  };

  reconnect = (): void => {
    this.stop();
    this.start();
  };

  clearError = (): void => { this.update({ error: null }); };

  send = (command: Command): boolean => {
    if (this.state.connection !== 'connected' || this.state.pending || this.socket?.readyState !== WebSocket.OPEN) return false;
    const pending: CommandEnvelope = { type: 'command', seq: this.credentials.nextSeq, command };
    this.update({ pending, error: null });
    this.persist();
    this.transmit(pending);
    return true;
  };

  private transmit(envelope: CommandEnvelope): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.sentSeq = envelope.seq;
    try {
      this.socket.send(JSON.stringify(envelope));
      if (this.watchdog) clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => { this.socket?.close(); }, 12_000);
    } catch {
      this.socket.close();
    }
  }

  private open(): void {
    if (!this.running) return;
    const url = new URL(`/api/coop/${encodeURIComponent(this.credentials.room)}/ws`, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('playerId', this.credentials.playerId);
    url.searchParams.set('token', this.credentials.token);
    const socket = new WebSocket(url);
    this.socket = socket;
    this.sentSeq = null;
    this.watchdog = setTimeout(() => { socket.close(); }, 12_000);
    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (this.socket !== socket || typeof event.data !== 'string') return;
      let message: ServerMessage;
      try { message = JSON.parse(event.data) as ServerMessage; } catch { return; }
      if (message.type === 'snapshot') {
        if (message.playerId !== this.credentials.playerId || message.room.code !== this.credentials.room) return;
        this.credentials.nextSeq = message.nextSeq;
        let pending = this.state.pending;
        let error = this.state.error;
        if (pending && pending.seq < message.nextSeq) pending = null;
        if (pending && pending.seq > message.nextSeq) {
          pending = null;
          error = 'The room restored an earlier command sequence. Review your survivor before acting again.';
        }
        if (!pending || this.sentSeq === null) {
          if (this.watchdog) clearTimeout(this.watchdog);
          this.watchdog = null;
        }
        this.update({ room: message.room, connection: 'connected', retries: 0, pending, error,
          serverOffset: message.serverNow - Date.now() });
        this.persist();
        if (pending && this.sentSeq !== pending.seq) this.transmit(pending);
      } else if (message.type === 'ack') {
        if (message.error) this.update({ error: message.error });
        // Keep controls locked until the following authoritative snapshot.
      } else if (message.type === 'error') {
        this.update({ error: message.error });
      }
    };
    socket.onerror = () => { socket.close(); };
    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket || !this.running) return;
      this.socket = null;
      if (this.watchdog) clearTimeout(this.watchdog);
      this.watchdog = null;
      // Retrying a replaced seat would evict its new tab and create a reconnect loop.
      if (event.code === 4001 || event.code === 4004) {
        this.running = false;
        this.update({ connection: 'offline', error: event.code === 4001
          ? 'Your seat was opened in another tab. Automatic reconnection has stopped. Reconnect here only if you want to move the seat back.'
          : 'This room has expired. Return to the lobby to create or join another expedition.' });
        return;
      }
      const retries = this.state.retries + 1;
      if (retries > MAX_RETRIES) {
        this.update({ connection: 'offline', error: this.state.error ?? 'Connection lost. Your seat is saved in this tab. Reconnect to continue.' });
        return;
      }
      this.update({ connection: 'reconnecting', retries });
      this.timer = setTimeout(() => { this.open(); }, Math.min(750 * 2 ** (retries - 1), 10_000));
    };
  }
}
