// Run after smoke-coop with COOP_RESTART_CHECK=1, then restarting the local dev server.
import assert from 'node:assert/strict';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
const origin = process.env.COOP_TEST_ORIGIN || 'http://localhost:5190';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Local smoke tests only');
const checkpoint = join(tmpdir(), 'singvive-coop-restart.local.json');
const { credentials: c, medical } = JSON.parse(await readFile(checkpoint, 'utf8'));
const ws = new WebSocket(`${origin.replace('http', 'ws')}/api/coop/${c.room}/ws?playerId=${c.playerId}&token=${c.token}`, { origin });
try {
  const snapshot = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Reconnect timed out after server restart')), 12000);
    ws.on('error', (error) => { clearTimeout(timeout); reject(error); });
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'snapshot') { clearTimeout(timeout); resolve(message); }
    });
  });
  assert.equal(snapshot.room.players.length, 4);
  assert.equal(snapshot.room.players.find((p) => p.id === c.playerId).medical, medical);
  assert.equal(snapshot.room.phase, 'running');
  assert(snapshot.room.pause, 'An empty/restarted room must stay paused');
  assert(snapshot.nextSeq > 1, 'Command receipts must survive restart');
  console.log('PASS: server restart retained room, supplies, player identity, pause and command sequence.');
} finally { ws.close(); await unlink(checkpoint); }
