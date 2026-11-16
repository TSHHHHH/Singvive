import { practiceExpedition } from './expeditionSurvivor';
import { PRACTICE_XP } from '../game/skills';
import { Rng } from '../game/rng';
import { MAX_PLAYERS, SITES } from './model';
import type { Action, Command, RoomState, SiteId, Survivor } from './model';
import type { IslandCatalog } from './islandWorld';
import { applyIslandCommand, cancelIslandAction, completeIslandAction, dropIslandBelongings, hurtIsland, initializeIslandSurvivor, islandAttack, islandDefense, islandFlee, rescueIsland, tickIslandSurvivors } from './islandActions';

const BEAT = 2000;
const DOWNED_MS = 30000;
const isActive = (p: Survivor) => p.status === 'active';
const here = (room: RoomState, p: Survivor) => room.sites[p.site];
const maxHp = (p: Survivor) => Math.max(40, 100 - p.wounds * 15);

function note(room: RoomState, text: string) {
  room.log.push({ at: room.simMs, text });
  if (room.log.length > 60) room.log.shift();
}
function fresh(id: string, name: string, life = 1): Survivor {
  return { id, name, connected: false, status: 'active', site: 'shelter', hp: 100,
    wounds: 0, medical: life === 1 ? 1 : 0, food: life === 1 ? 2 : 0,
    stance: 'guarded', action: null, fighting: false, downedUntil: null, life, kills: 0 };
}
export function createRoom(code: string, seed: string, now: number): RoomState {
  return { version: 1, code, seed, revision: 0, phase: 'lobby', hostId: '', simMs: 0,
    wallAt: now, nextCombatAt: BEAT, pause: null, ready: [], resumeAt: null, players: [], log: [],
    sites: {
      shelter: { searches: 0, medical: 0, food: 0, enemyHp: 0, round: 0 },
      pharmacy: { searches: 3, medical: 0, food: 0, enemyHp: 0, round: 0 },
      market: { searches: 4, medical: 0, food: 0, enemyHp: 100, round: 0 },
      evac: { searches: 0, medical: 0, food: 0, enemyHp: 0, round: 0 },
    } };
}
export function joinRoom(room: RoomState, id: string, name: string): string | null {
  if (room.phase === 'ended') return 'This expedition has ended.';
  if (room.players.length >= MAX_PLAYERS) return 'This room is full (four survivors).';
  if (room.players.some((p) => p.id === id)) return 'Already joined.';
  if (!name.trim() || name.trim().length > 24) return 'Use a name of 1–24 characters.';
  if (room.phase === 'running' && !room.players.some(isActive)) return 'No active survivor remains.';
  room.players.push(fresh(id, name.trim()));
  if (room.world) initializeIslandSurvivor(room,room.players[room.players.length - 1]);
  if (!room.hostId) room.hostId = id;
  room.ready = []; room.resumeAt = null;
  note(room, `${name.trim()} joined the expedition.`);
  return null;
}
function die(room: RoomState, p: Survivor) {
  const cache = here(room, p);
  if (room.world) dropIslandBelongings(room,p);
  else { cache.medical += p.medical; cache.food += p.food; }
  p.medical = 0; p.food = 0; p.hp = 0; p.status = 'dead';
  p.action = null; p.fighting = false; p.downedUntil = null;
  note(room, `${p.name} died. Their supplies remain at ${p.site}.`);
}
function finishIfEmpty(room: RoomState) {
  if (room.phase !== 'running' || room.players.some(isActive)) return;
  // A downed team has nobody able to rescue or sponsor a replacement.
  for (const p of room.players) if (p.status === 'downed') die(room, p);
  room.phase = 'ended'; room.pause = null; room.resumeAt = null; room.ready = [];
  note(room, 'Expedition ended. Everyone has extracted or died.');
}
function hurt(room: RoomState, p: Survivor, amount: number) {
  if (!isActive(p)) return;
  if (room.world) hurtIsland(room,p,amount);
  else p.hp = Math.max(0, p.hp - amount);
  if (p.action?.kind === 'rescue' || p.action?.kind === 'rest' || p.action?.kind === 'search' || p.action?.kind === 'craft') {
    note(room, `${p.name}'s ${p.action.kind} was interrupted.`);
    cancelIslandAction(room,p);
  }
  if (p.hp === 0) {
    p.status = 'downed'; p.downedUntil = room.simMs + DOWNED_MS;
    p.action = null; p.fighting = false;
    note(room, `${p.name} is down! Reach them with a medical charge within 30 seconds.`);
  }
}
function startAction(room: RoomState, p: Survivor, kind: Action['kind'], duration: number, target?: string) {
  p.action = { kind, startedAt: room.simMs, endsAt: room.simMs + duration, ...(target ? { target } : {}) };
}
function completeAction(room: RoomState, p: Survivor, catalog?: IslandCatalog) {
  const action = p.action;
  if (!action || action.endsAt > room.simMs || !isActive(p)) return;
  p.action = null;
  switch (action.kind) {
    case 'travel':
      p.site = action.target as SiteId;
      note(room, `${p.name} arrived at ${p.site}.`);
      break;
    case 'search':
      if (!room.world) {
        here(room, p).medical += p.site === 'pharmacy' ? 1 : 0;
        here(room, p).food += p.site === 'market' ? 2 : 1;
      }
      note(room, `${p.name} uncovered supplies in the shared cache.`);
      break;
    case 'rest':
      if (!room.world) p.hp = Math.min(maxHp(p), p.hp + 20);
      note(room, `${p.name} finished resting.`);
      break;
    case 'rescue': {
      const target = room.players.find((other) => other.id === action.target);
      if (target?.status !== 'downed' || target.site !== p.site || p.medical < 1) break;
      if (room.world) { if (!rescueIsland(p,target)) break; }
      else { p.medical--; target.hp = 30; }
      target.status = 'active'; target.wounds++;
      target.downedUntil = null;
      note(room, `${p.name} rescued ${target.name}. Lasting injuries remain.`);
      break;
    }
    case 'extract':
      p.status = 'extracted'; p.fighting = false;
      note(room, `${p.name} extracted alive on life ${p.life}.`);
      break;
  }
  if (room.world) {
    completeIslandAction(room,p,action,catalog);
    if (isActive(p) && p.hp <= 0) hurt(room,p,0);
  }
}
function combatBeat(room: RoomState) {
  const occupied = new Set(room.players.filter((p) => p.status === 'active').map((p) => p.site));
  const sites = room.world ? [...occupied].map((id) => room.world!.locations[id]) : SITES;
  for (const site of sites) {
    const state = room.sites[site.id];
    const exposed = room.players.filter((p) => isActive(p) && p.site === site.id && p.action?.kind !== 'travel');
    if (state.enemyHp <= 0 || !exposed.length) continue;
    state.round++;
    for (const p of exposed.filter((p) => p.fighting)) {
      const rng = new Rng(room.seed).fork(`coop:${site.id}:${state.round}:${p.id}`);
      const base = room.world ? islandAttack(p) : 8;
      const damage = base + (p.stance === 'aggressive' ? 5 : p.stance === 'precision' ? 3 : 0) + rng.int(0, 4);
      state.enemyHp = Math.max(0, state.enemyHp - damage);
      if (room.world && p.expedition) practiceExpedition(p.expedition, 'fighting', PRACTICE_XP.meleeHit);
      if (state.enemyHp === 0) {
        p.kills++;
        if (room.world && p.expedition) practiceExpedition(p.expedition, 'fighting', PRACTICE_XP.meleeKill);
        note(room, `${p.name} landed the final hit. ${site.name} is clear.`);
        for (const ally of exposed) ally.fighting = false;
        break;
      }
    }
    if (state.enemyHp > 0) {
      const target = exposed[(state.round - 1) % exposed.length];
      hurt(room, target, Math.max(1,(target.stance === 'guarded' ? 10 : 15) - (room.world ? islandDefense(target) : 0)));
    }
  }
  if (!room.world && room.simMs % 60000 === 0) {
    for (const p of room.players) if (isActive(p)) hurt(room, p, 2);
  }
}

/** Advance from server wall time. No browser timers, I/O or unseeded randomness. */
export function advanceRoom(room: RoomState, now: number, catalog?: IslandCatalog): void {
  now = Math.max(room.wallAt, now);
  let elapsed = now - room.wallAt;
  if (room.phase !== 'running') { room.wallAt = now; return; }
  if (room.pause) {
    if (room.resumeAt === null || now < room.resumeAt || !room.players.some((p) => p.connected)) {
      room.wallAt = now; return;
    }
    elapsed = now - Math.max(room.wallAt, room.resumeAt);
    room.pause = null; room.resumeAt = null; room.ready = [];
    note(room, 'Everyone ready. Expedition resumed.');
  }
  room.wallAt = now;
  const target = room.simMs + elapsed;
  while (room.simMs < target && room.phase === 'running') {
    const deadlines = room.players.flatMap((p) => [p.action?.endsAt ?? Infinity, p.downedUntil ?? Infinity]);
    const before = room.simMs;
    room.simMs = Math.min(target, room.nextCombatAt, ...deadlines);
    tickIslandSurvivors(room,room.simMs - before);
    for (const p of room.players) if (p.status === 'active' && p.hp <= 0) hurt(room,p,0);
    // Expiry wins a same-instant race with rescue completion.
    for (const p of room.players) if (p.status === 'downed' && p.downedUntil! <= room.simMs) die(room, p);
    for (const p of room.players) completeAction(room, p, catalog);
    if (room.simMs >= room.nextCombatAt) { combatBeat(room); room.nextCombatAt += BEAT; }
    finishIfEmpty(room);
  }
}
export function setConnected(room: RoomState, id: string, connected: boolean, now: number, catalog?: IslandCatalog): void {
  advanceRoom(room, now, catalog);
  const player = room.players.find((p) => p.id === id);
  if (!player || player.connected === connected) return;
  player.connected = connected;
  room.ready = []; room.resumeAt = null;
  if (room.phase === 'running' && !connected) {
    room.pause = {
      reason: `${player.name} disconnected. Reconnect grace period.`,
      by: room.pause?.by ?? null,
      graceUntil: Math.max(room.pause?.graceUntil ?? 0, now + 15000),
    };
    note(room, `${player.name} disconnected. The room is paused.`);
  }
  if (room.phase === 'lobby' && !room.players.some((p) => p.id === room.hostId && p.connected)) {
    room.hostId = room.players.find((p) => p.connected)?.id ?? room.hostId;
  }
}

export function applyCommand(room: RoomState, id: string, command: Command, now: number, catalog?: IslandCatalog): string | null {
  advanceRoom(room, now, catalog);
  const p = room.players.find((player) => player.id === id);
  if (!p || !p.connected) return 'Connect to the room before acting.';
  if (room.phase === 'ended') return 'This expedition has ended.';
  if (command.type === 'spawn' || command.type === 'occupation') return applyIslandCommand(room,p,command,catalog) ?? (room.world ? null : 'This is a legacy room.');
  if (command.type === 'start') {
    if (room.phase !== 'lobby' || room.hostId !== id) return 'Only the host can start the lobby.';
    room.phase = 'running'; room.wallAt = now;
    note(room, 'Expedition started. Idle players remain in the world.');
    return null;
  }
  if (room.phase !== 'running') return 'Wait for the host to start.';
  if (command.type === 'pause') {
    room.pause = { reason: `${p.name} paused the expedition.`, by: p.id, graceUntil: room.pause?.graceUntil ?? 0 };
    room.ready = []; room.resumeAt = null; return null;
  }
  if (command.type === 'ready') {
    if (!room.pause) return 'The room is already running.';
    if (room.pause.graceUntil > now && room.players.some((player) => !player.connected)) return 'Wait for the reconnect grace period.';
    if (!room.ready.includes(id)) room.ready.push(id);
    if (room.resumeAt === null && room.players.filter((player) => player.connected).every((player) => room.ready.includes(player.id))) room.resumeAt = now + 3000;
    return null;
  }
  if (room.pause) return 'The room is paused.';
  if (command.type === 'replace') {
    if (p.status !== 'dead') return 'Only a dead survivor can be replaced.';
    if (!room.players.some((other) => other.id !== id && isActive(other) && other.site === (room.world?.spawn ?? 'shelter') && !other.action)) return 'An active teammate must wait at the rendezvous.';
    const occupation = p.expedition?.character.occupationId;
    Object.assign(p, fresh(id, p.name, p.life + 1), { connected: true });
    if (room.world) initializeIslandSurvivor(room,p,occupation,false);
    note(room, `${p.name} returned as a new survivor, without replenished supplies.`);
    return null;
  }
  if (!isActive(p)) return 'Your survivor cannot act.';
  if (command.type === 'cancel') {
    if (p.action?.kind === 'travel') return 'Finish travelling before changing direction.';
    if (p.action?.kind === 'treat') return 'Finish treatment before taking another action.';
    cancelIslandAction(room,p); return null;
  }
  if (command.type === 'stance') { p.stance = command.stance; return null; }
  if (command.type === 'flee') {
    if (p.action?.kind === 'travel') return 'Already travelling.';
    if (p.action?.kind === 'treat') return 'Finish treatment before taking another action.';
    if (here(room, p).enemyHp <= 0) return 'There is no encounter to flee.';
    cancelIslandAction(room,p);
    if (room.world) { const error = islandFlee(room,p,catalog); if (error) return error; }
    p.fighting = false; hurt(room, p, 8);
    if (isActive(p) && !room.world) startAction(room, p, 'travel', 8000, 'shelter');
    finishIfEmpty(room);
    return null;
  }
  if (p.action) return 'Your survivor is busy. Wait or cancel first.';
  const islandResult = applyIslandCommand(room,p,command,catalog);
  if (islandResult !== undefined) return islandResult;
  const site = here(room, p);
  switch (command.type) {
    case 'fight':
      if (site.enemyHp <= 0) return 'There are no enemies here.';
      p.fighting = true; return null;
    case 'travel': {
      if (site.enemyHp > 0) return 'Flee to disengage from this encounter.';
      const links: readonly string[] = SITES.find((s) => s.id === p.site)!.links;
      if (!links.includes(command.site)) return 'Choose a connected destination.';
      p.fighting = false; startAction(room, p, 'travel', 8000, command.site); return null;
    }
    case 'rescue': {
      const other = room.players.find((player) => player.id === command.playerId);
      if (p.medical < 1) return 'You need a medical charge to rescue someone.';
      if (!other || other.status !== 'downed') return 'Choose a downed teammate.';
      if (other.site !== p.site) return 'Reach the same location as your teammate.';
      p.fighting = false; startAction(room, p, 'rescue', 5000, other.id); return null;
    }
    case 'take':
      if (site[command.item] < 1) return 'That shared cache is empty.';
      site[command.item]--; p[command.item]++; return null;
    case 'give': {
      const other = room.players.find((player) => player.id === command.playerId);
      if (!other || other.id === id || !isActive(other) || other.site !== p.site || other.action?.kind === 'travel') return 'Choose an active nearby teammate.';
      if (p[command.item] < 1) return 'You do not have that supply.';
      p[command.item]--; other[command.item]++; return null;
    }
    case 'eat':
      if (p.food < 1) return 'You have no food.';
      if (p.hp >= maxHp(p)) return 'You are already at your current health limit.';
      p.food--; p.hp = Math.min(maxHp(p), p.hp + 10); return null;
    case 'search':
      if (site.enemyHp > 0) return 'Clear the encounter before searching.';
      if (site.searches < 1) return 'This site has already been searched.';
      site.searches--; startAction(room, p, 'search', room.world ? 15000 : 6000, room.world ? String(site.searches) : undefined); return null;
    case 'rest':
      if (site.enemyHp > 0) return 'Clear the encounter before resting.';
      p.fighting = false; startAction(room, p, 'rest', room.world ? 240000 : 20000); return null;
    case 'extract':
      if (p.site !== (room.world?.evac ?? 'evac')) return 'Reach extraction before boarding.';
      if (site.enemyHp > 0) return 'Clear the encounter before boarding.';
      startAction(room, p, 'extract', 5000); return null;
    default: return 'This action is unavailable in this room.';
  }
}
