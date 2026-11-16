// Against the LOCAL dev server only. Creates one disposable room; no production data.
import assert from 'node:assert/strict';
const origin = process.env.COOP_TEST_ORIGIN || 'http://localhost:5190';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Local smoke tests only');
async function post(path, body) {
  const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const created = await post('/api/coop', { name: 'Alpha' });
assert.equal(created.status, 201, JSON.stringify(created.body));
const credentials = [created.body];
for (const name of ['Bravo', 'Charlie', 'Delta']) {
  const joined = await post(`/api/coop/${created.body.room}/join`, { name });
  assert.equal(joined.status, 200, JSON.stringify(joined.body)); credentials.push(joined.body);
}
assert.equal((await post(`/api/coop/${created.body.room}/join`, { name: 'Fifth' })).status, 409);
const sockets = [];
// WebSocket transport test uses ws, already supplied by the existing Vite tooling.
const { WebSocket } = await import('ws');
function openClient(c) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${origin.replace('http', 'ws')}/api/coop/${c.room}/ws?playerId=${c.playerId}&token=${c.token}`, { origin });
    const timeout = setTimeout(() => { ws.terminate(); reject(new Error('Socket handshake timed out')); }, 12000);
    const client = { ws, state: null, messages: [], seq: c.nextSeq };
    ws.on('error', (error) => { clearTimeout(timeout); reject(error); });
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString()); client.messages.push(message);
      if (message.type === 'snapshot') { clearTimeout(timeout); client.state = message.room; client.seq = message.nextSeq; resolve(client); }
    });
    sockets.push(ws);
  });
}
const clients = [];
try {
  assert.equal((await fetch(origin + '/api/coop', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Denied' }) })).status, 403);
  // The Vite WebSocket proxy may close a denied upgrade instead of forwarding its 403.
  await assert.rejects(openClient({ ...credentials[0], token: '0'.repeat(64) }), /403|socket hang up/);
  for (const c of credentials) clients.push(await openClient(c));
  async function until(predicate) {
    const end = Date.now() + 30000;
    while (!predicate()) { if (Date.now() > end) throw new Error('Timed out waiting for room state'); await new Promise((r) => setTimeout(r, 50)); }
  }
  async function command(client, payload) {
    const seq = client.seq;
    client.ws.send(JSON.stringify({ type: 'command', seq, command: payload }));
    await until(() => client.messages.some((m) => m.type === 'ack' && m.seq === seq));
    const ack = client.messages.find((m) => m.type === 'ack' && m.seq === seq);
    assert.equal(ack.error, undefined, ack.error);
    await until(() => client.seq > seq);
    return seq;
  }
  await until(() => clients.every((c) => c.state.players.filter((p) => p.connected).length === 4));
  await command(clients[0], { type: 'start' });
  if (clients[0].state.world) {
    await command(clients[0], { type: 'search' });
    await command(clients[1], { type: 'rest' });
    const site = clients[0].state.players[0].site;
    await until(() => clients[0].state.sites[site].items.length > 0);
    assert.equal(clients[0].state.players[1].action.kind, 'rest');
    const uid = clients[0].state.sites[site].items[0].uid;
    const seq = await command(clients[0], { type: 'takeItem', uid });
    clients[0].ws.send(JSON.stringify({ type: 'command', seq, command: { type: 'takeItem', uid } }));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(clients[0].state.players[0].expedition.items.filter((item) => item.uid === uid).length, 1);
    assert(!clients[0].state.sites[site].items.some((item) => item.uid === uid));
  } else {
  await command(clients[0], { type: 'travel', site: 'pharmacy' });
  await command(clients[1], { type: 'rest' });
  await until(() => clients[0].state.players[0].site === 'pharmacy');
  assert.equal(clients[0].state.players[1].action.kind, 'rest');
  await command(clients[0], { type: 'search' });
  await until(() => clients[0].state.sites.pharmacy.medical === 1);
  const seq = await command(clients[0], { type: 'take', item: 'medical' });
  clients[0].ws.send(JSON.stringify({ type: 'command', seq, command: { type: 'take', item: 'medical' } }));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(clients[0].state.players[0].medical, 2, 'Duplicate command must not mint supplies');
  }
  const medical = clients[0].state.players[0].medical;
  await command(clients[2], { type: 'pause' });
  const frozen = clients[2].state.simMs;
  await new Promise((r) => setTimeout(r, 2200));
  assert.equal(clients[2].state.simMs, frozen);
  for (const client of clients) await command(client, { type: 'ready' });
  await until(() => !clients[0].state.pause);
  clients[3].ws.close();
  await until(() => clients[0].state.pause?.reason.includes('disconnected'));
  const returned = await openClient(credentials[3]);
  assert.equal(returned.state.players.length, 4, 'Reconnect must reuse the seat');
  assert.equal(returned.state.players[0].medical, medical, 'Reconnect must recover authoritative supplies');
  const replaced = new Promise((resolve) => returned.ws.once('close', (code) => resolve(code)));
  await openClient(credentials[3]);
  assert.equal(await replaced, 4001, 'A duplicate seat must replace the old connection');
  assert(!JSON.stringify(clients[0].state).includes(credentials[0].token), 'Snapshot leaked a token');
  console.log('PASS: four clients, capacity, independent actions, shared loot, idempotency, pause/readiness, disconnect/reconnect, seat replacement, credentials and origin checks.');
  if (process.env.COOP_RESTART_CHECK === '1') {
    const { writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const checkpoint = join(tmpdir(), 'singvive-coop-restart.local.json');
    const snapshot = clients[0].state;
    await writeFile(checkpoint, JSON.stringify({ credentials: credentials[0], medical,
      island: snapshot.world ? { world: snapshot.world, sites: snapshot.sites,
        expedition: snapshot.players[0].expedition } : undefined }));
    console.log('Restart checkpoint saved to OS temp; credentials not printed.');
  }
} finally { for (const ws of sockets) ws.close(); }
