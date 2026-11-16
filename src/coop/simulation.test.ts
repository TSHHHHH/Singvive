import { describe, expect, it } from 'vitest';
import { advanceRoom, applyCommand, createRoom, joinRoom, setConnected } from './simulation';
import type { Command, RoomState } from './model';

function fixture(count = 2) {
  const room = createRoom('ABCDEF12', 'seed', 0);
  for (let i = 0; i < count; i++) {
    expect(joinRoom(room, `p${i}`, `Survivor ${i}`)).toBeNull();
    setConnected(room, `p${i}`, true, 0);
  }
  expect(applyCommand(room, 'p0', { type: 'start' }, 0)).toBeNull();
  return room;
}
function act(room: RoomState, id: string, command: Command, now = room.wallAt) {
  expect(applyCommand(room, id, command, now)).toBeNull();
}

describe('co-op expedition', () => {
  it('lets a connected survivor host when the creator never opened a socket', () => {
    const room = createRoom('ABCDEF12', 'seed', 0);
    joinRoom(room, 'creator', 'Creator');
    joinRoom(room, 'guest', 'Guest');
    setConnected(room, 'guest', true, 0);
    expect(room.hostId).toBe('guest');
    expect(applyCommand(room, 'guest', { type: 'start' }, 0)).toBeNull();
  });
  it('admits four players and rejects a fifth without altering the roster', () => {
    const room = fixture(4);
    expect(joinRoom(room, 'p4', 'Fifth')).toMatch(/full/i);
    expect(room.players).toHaveLength(4);
  });
  it('lets different actions finish independently on the same clock', () => {
    const room = fixture();
    act(room, 'p0', { type: 'travel', site: 'pharmacy' });
    act(room, 'p1', { type: 'rest' });
    advanceRoom(room, 8000);
    expect(room.players[0].site).toBe('pharmacy');
    expect(room.players[0].action).toBeNull();
    expect(room.players[1].action?.kind).toBe('rest');
    advanceRoom(room, 20000);
    expect(room.players[1].action).toBeNull();
    expect(room.simMs).toBe(20000);
  });
  it('continues the clock while players are idle', () => {
    const room = fixture();
    advanceRoom(room, 60000);
    expect(room.simMs).toBe(60000);
    expect(room.players[0].hp).toBeLessThan(100);
  });
  it('prevents taking the same final medical charge twice', () => {
    const room = fixture();
    room.sites.shelter.medical = 1;
    act(room, 'p0', { type: 'take', item: 'medical' });
    expect(applyCommand(room, 'p1', { type: 'take', item: 'medical' }, 0)).toMatch(/empty/i);
    expect(room.players.map((p) => p.medical)).toEqual([2, 1]);
  });
  it('reserves finite searches and prevents searching twice while busy', () => {
    const room = fixture();
    room.players.forEach((p) => { p.site = 'pharmacy'; });
    room.sites.pharmacy.searches = 1;
    act(room, 'p0', { type: 'search' });
    expect(applyCommand(room, 'p1', { type: 'search' }, 0)).toMatch(/searched|search/i);
    expect(applyCommand(room, 'p0', { type: 'search' }, 0)).toMatch(/busy/i);
    advanceRoom(room, 6000);
    expect(room.sites.pharmacy.medical).toBeGreaterThan(0);
  });
  it('freezes actions and combat until everyone readies and countdown ends', () => {
    const room = fixture();
    act(room, 'p0', { type: 'travel', site: 'market' });
    act(room, 'p1', { type: 'pause' }, 2000);
    const frozen = room.simMs;
    advanceRoom(room, 10000);
    expect(room.simMs).toBe(frozen);
    expect(applyCommand(room, 'p0', { type: 'eat' }, 10000)).toMatch(/paused/i);
    act(room, 'p0', { type: 'ready' });
    expect(room.resumeAt).toBeNull();
    act(room, 'p1', { type: 'ready' });
    advanceRoom(room, 12999);
    expect(room.simMs).toBe(frozen);
    advanceRoom(room, 14000);
    expect(room.simMs).toBe(frozen + 1000);
  });
  it('offers disconnect grace and requires remaining players to resume', () => {
    const room = fixture();
    setConnected(room, 'p1', false, 1000);
    expect(room.pause?.graceUntil).toBe(16000);
    expect(applyCommand(room, 'p0', { type: 'ready' }, 1000)).toMatch(/reconnect/i);
    act(room, 'p0', { type: 'ready' }, 16000);
    advanceRoom(room, 20000);
    expect(room.pause).toBeNull();
    expect(room.players[1].connected).toBe(false);
  });
  it('keeps an empty room paused', () => {
    const room = fixture();
    setConnected(room, 'p0', false, 0);
    setConnected(room, 'p1', false, 0);
    advanceRoom(room, 100000);
    expect(room.simMs).toBe(0);
    expect(room.pause).not.toBeNull();
  });
  it('preserves and extends reconnect grace across manual pauses and later disconnects', () => {
    const room = fixture(3);
    act(room, 'p0', { type: 'pause' });
    setConnected(room, 'p1', false, 1000);
    expect(room.pause?.graceUntil).toBe(16000);
    setConnected(room, 'p2', false, 15000);
    expect(room.pause?.graceUntil).toBe(30000);
    act(room, 'p0', { type: 'pause' }, 16000);
    expect(applyCommand(room, 'p0', { type: 'ready' }, 16000)).toMatch(/reconnect/i);
  });
  it('ends a last-survivor failed retreat before a pause can freeze a full wipe', () => {
    const room = fixture(1);
    room.players[0].site = 'market'; room.players[0].hp = 8;
    act(room, 'p0', { type: 'flee' });
    expect(room.phase).toBe('ended');
    expect(applyCommand(room, 'p0', { type: 'pause' }, 0)).toMatch(/ended/i);
  });
  it('requires a nearby living rescuer with a medical charge', () => {
    const room = fixture();
    const [rescuer, target] = room.players;
    target.status = 'downed'; target.hp = 0; target.downedUntil = 30000;
    rescuer.medical = 0;
    expect(applyCommand(room, 'p0', { type: 'rescue', playerId: 'p1' }, 0)).toMatch(/medical/i);
    rescuer.medical = 1; rescuer.site = 'pharmacy';
    expect(applyCommand(room, 'p0', { type: 'rescue', playerId: 'p1' }, 0)).toMatch(/near|same|reach/i);
    rescuer.site = 'shelter';
    act(room, 'p0', { type: 'rescue', playerId: 'p1' });
    expect(rescuer.medical).toBe(1);
    advanceRoom(room, 5000);
    expect(target.status).toBe('active');
    expect(target.hp).toBe(30);
    expect(target.wounds).toBe(1);
    expect(rescuer.medical).toBe(0);
  });
  it('interrupts exposed rescue when enemies hit the rescuer without spending the kit', () => {
    const room = fixture();
    const [rescuer, target] = room.players;
    rescuer.site = target.site = 'market';
    target.status = 'downed'; target.hp = 0; target.downedUntil = 30000;
    act(room, 'p0', { type: 'rescue', playerId: 'p1' });
    advanceRoom(room, 2000);
    expect(rescuer.action).toBeNull();
    expect(rescuer.medical).toBe(1);
    expect(target.status).toBe('downed');
  });
  it('shares enemy damage among participants and preserves seeded results across reload', () => {
    const room = fixture();
    room.players.forEach((p) => { p.site = 'market'; });
    act(room, 'p0', { type: 'fight' }); act(room, 'p1', { type: 'fight' });
    const restored: RoomState = JSON.parse(JSON.stringify(room));
    advanceRoom(room, 6000); advanceRoom(restored, 6000);
    expect(room).toEqual(restored);
    expect(room.sites.market.enemyHp).toBeLessThan(100);
    expect(room.sites.market.round).toBe(3);
  });
  it('drops inventory at death, replaces only beside an active survivor, and grants no new kits', () => {
    const room = fixture();
    const dead = room.players[1];
    dead.status = 'downed'; dead.hp = 0; dead.downedUntil = 1000;
    advanceRoom(room, 1000);
    expect(dead.status).toBe('dead');
    expect(room.sites.shelter.medical).toBe(1);
    act(room, 'p1', { type: 'replace' });
    expect(room.players[1].status).toBe('active');
    expect(room.players[1].medical).toBe(0);
    expect(room.players[1].life).toBe(2);
  });
  it('ends on a full downed team when nobody can perform a rescue', () => {
    const room = fixture();
    room.players.forEach((p) => { p.hp = 1; p.site = 'market'; });
    advanceRoom(room, 2000);
    advanceRoom(room, 4000);
    expect(room.phase).toBe('ended');
    expect(applyCommand(room, 'p0', { type: 'replace' }, 4000)).toMatch(/ended/i);
  });
  it('allows individual extraction and closes after the last survivor extracts', () => {
    const room = fixture();
    room.players[0].site = 'evac';
    act(room, 'p0', { type: 'extract' }); advanceRoom(room, 5000);
    expect(room.players[0].status).toBe('extracted'); expect(room.phase).toBe('running');
    expect(applyCommand(room, 'p0', { type: 'replace' }, 5000)).not.toBeNull();
    room.players[1].site = 'evac'; act(room, 'p1', { type: 'extract' });
    advanceRoom(room, 10000);
    expect(room.phase).toBe('ended');
  });
  it('rejects unknown players, invalid destinations and actions while travelling', () => {
    const room = fixture();
    expect(applyCommand(room, 'intruder', { type: 'pause' }, 0)).not.toBeNull();
    expect(applyCommand(room, 'p0', { type: 'travel', site: 'evac' }, 0)).not.toBeNull();
    act(room, 'p0', { type: 'travel', site: 'market' });
    expect(applyCommand(room, 'p0', { type: 'take', item: 'medical' }, 0)).toMatch(/busy/i);
  });
});
