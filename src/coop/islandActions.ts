import { UNIT_META } from '../game/hdbDungeon';
import { arriveIslandInterior, fleeIslandInterior, islandInteriorUnit, startIslandInterior } from './islandBuildings';
import { nearestStation } from '../game/mrt';
import { samplePolyline } from '../game/route';
import { ITEMS } from '../game/loot';
import { PRACTICE_XP } from '../game/skills';
import { discoverIslandTunnels, planIslandTunnel } from './islandSystems';
import { OCCUPATIONS } from '../game/occupations';
import { Rng } from '../game/rng';
import { rollWeather } from '../game/weather';
import { checkDeath } from '../game/survival';
import { ISLAND_SIGHT_M } from './islandModel';
import { createTrekSite, initializeIsland, planIslandTravel, revealNearby, type IslandCatalog } from './islandWorld';
import { addExpeditionItem, applyExpeditionCommand, cancelExpeditionCraft, completeExpeditionCraft, consumeRescueMedical, createExpeditionSurvivor, damageExpedition, expeditionAttack, expeditionDefense, expeditionHp, expeditionTravelSpeed, generateExpeditionLoot, medicalCount, practiceExpedition, reviveExpedition, tickExpedition } from './expeditionSurvivor';
import type { Action, Command, RoomState, Survivor } from './model';

export function initializeIslandSurvivor(room: RoomState, p: Survivor, occupation = 'student', starter = true) {
  if (!room.world) return;
  p.site = room.world.spawn;
  p.expedition = createExpeditionSurvivor(p.name, occupation, `${room.seed}:${p.id}:${p.life}`, starter);
  p.hp = expeditionHp(p.expedition); p.medical = medicalCount(p.expedition); p.food = 0;
}
export function cancelIslandAction(room: RoomState, p: Survivor) {
  if (p.expedition && p.action?.craft) {
    room.sites[p.site].items!.push(...cancelExpeditionCraft(p.expedition, p.action.craft));
  }
  p.action = null;
}
export function dropIslandBelongings(room: RoomState, p: Survivor) {
  if (!p.expedition) return;
  cancelIslandAction(room, p);
  const items = room.sites[p.site].items ??= [];
  items.push(...p.expedition.items, ...Object.values(p.expedition.equipment).filter((i) => i !== null));
  p.expedition.items = [];
  for (const slot of Object.keys(p.expedition.equipment) as (keyof typeof p.expedition.equipment)[]) p.expedition.equipment[slot] = null;
}
export function hurtIsland(room: RoomState, p: Survivor, amount: number): void {
  if (!p.expedition) return;
  damageExpedition(p.expedition, amount, `${room.seed}:${p.id}:${room.simMs}:${p.hp}`);
  p.hp = expeditionHp(p.expedition);
  if (checkDeath(p.expedition.meters, p.expedition.bodyParts)) p.hp = 0;
}
export function tickIslandSurvivors(room: RoomState, elapsedMs: number) {
  if (!room.world) return;
  room.world.weather = rollWeather(new Rng(room.seed), 1 + Math.floor(room.simMs / 1440000));
  for (const p of room.players) {
    if (p.status !== 'active' || !p.expedition) continue;
    tickExpedition(p.expedition, elapsedMs / 60000, p.action?.kind === 'rest', room.world.weather);
    p.hp = expeditionHp(p.expedition); p.medical = medicalCount(p.expedition);
    if (checkDeath(p.expedition.meters, p.expedition.bodyParts)) p.hp = 0;
  }
}
export function islandAttack(p: Survivor) {
  const s = p.expedition;
  if (!s) return 8;
  const effect = s.equipment.mainHand && ITEMS[s.equipment.mainHand.defId]?.effect;
  // Scalar melee resolution cannot fire guns without consuming authoritative ammo.
  return expeditionAttack(effect && effect.kind === 'weapon' && effect.ranged
    ? { ...s, equipment: { ...s.equipment, mainHand: null } } : s);
}
export function islandDefense(p: Survivor) { return p.expedition ? expeditionDefense(p.expedition) : 0; }

export function completeIslandAction(room: RoomState, p: Survivor, action: Action, catalog?: IslandCatalog): void {
  if (!room.world || !p.expedition) return;
  if (action.kind === 'travel' && action.mode === 'interior') {
    hurtIsland(room,p,arriveIslandInterior(room,p));
  } else if (action.kind === 'travel' && catalog) {
    const location = room.world.locations[p.site];
    if (action.route && action.mode !== 'tunnel') {
      for (const point of samplePolyline(action.route, 200)) revealNearby(room, catalog, point);
    }
    revealNearby(room, catalog, location);
    discoverIslandTunnels(room, catalog, p.site);
    practiceExpedition(p.expedition, 'fitness', Math.max(1, Math.round((action.travelHours ?? (action.endsAt - action.startedAt) / 60000) * PRACTICE_XP.trekHour)));
    if (!location.visited && p.site !== room.world.spawn) {
      const rng = new Rng(room.seed).fork(`arrival:${p.site}`);
      if (location.category !== 'waypoint' && rng.chance(location.danger * 0.11)) room.sites[p.site].enemyHp = 25 + location.danger * 12;
    }
    location.visited = true;
  } else if (action.kind === 'search') {
    const location = room.world.locations[p.site];
    practiceExpedition(p.expedition, 'scavenging', PRACTICE_XP.searchComplete);
    const state = room.sites[p.site];
    state.items ??= [];
    const unit = islandInteriorUnit(room,p.site);
    if (unit && UNIT_META[unit.type].searchHp) hurtIsland(room,p,UNIT_META[unit.type].searchHp!);
    state.items.push(...generateExpeditionLoot(location.category, `${room.seed}:${p.site}:${action.target}`, unit ? UNIT_META[unit.type].lootMod : 0));
  } else if (action.kind === 'craft' && action.craft) {
    (room.sites[p.site].items ??= []).push(...completeExpeditionCraft(p.expedition, action.craft));
  }
  p.hp = checkDeath(p.expedition.meters,p.expedition.bodyParts) ? 0 : expeditionHp(p.expedition); p.medical = medicalCount(p.expedition);
}
export function rescueIsland(p: Survivor, target: Survivor): boolean {
  if (!p.expedition || !target.expedition || !consumeRescueMedical(p.expedition)) return false;
  reviveExpedition(target.expedition); target.hp = expeditionHp(target.expedition);
  p.medical = medicalCount(p.expedition);
  return true;
}
function startTravel(room: RoomState, p: Survivor, target: string): string | null {
  const location = room.world!.locations[target];
  if (location?.interior || room.world!.locations[p.site]?.interior) return 'Use the building stairs and doors before travelling outdoors.';
  if (!location || !p.expedition) return 'Choose a discovered destination.';
  const plan = planIslandTravel(room, p.site, location, expeditionTravelSpeed(p.expedition));
  if (!plan) return 'No walkable route within 1.2 km. Choose a closer point.';
  p.previousSite = p.site;
  p.fighting = false;
  p.action = { kind: 'travel', startedAt: room.simMs, endsAt: room.simMs + plan.durationMs, target, route: plan.route, mode: 'surface', travelHours: plan.durationMs / 60000 };
  return null;
}
/** Undefined means the legacy/common command handler owns this command. */
export function applyIslandCommand(room: RoomState, p: Survivor, command: Command, catalog?: IslandCatalog): string | null | undefined {
  if (!room.world || !p.expedition) return undefined;
  if (command.type === 'spawn') {
    if (room.phase !== 'lobby' || p.id !== room.hostId || !catalog) return 'Only the host can select the starting district in the lobby.';
    try { initializeIsland(room, catalog, command.district); } catch { return 'That starting district is unavailable.'; }
    return null;
  }
  if (command.type === 'occupation') {
    if (room.phase !== 'lobby') return 'Choose your occupation before starting.';
    if (!OCCUPATIONS.some((o) => o.id === command.occupationId)) return 'Unknown occupation.';
    initializeIslandSurvivor(room,p,command.occupationId); return null;
  }
  if (room.phase !== 'running' || room.pause || p.status !== 'active' || p.action) return undefined;
  const state = room.sites[p.site];
  const interiorResult = startIslandInterior(room,p,command);
  if (interiorResult !== undefined) return interiorResult;
  if (room.world.locations[p.site]?.interior && ['travel','trek','tunnel'].includes(command.type)) return 'Use the building stairs and doors before travelling outdoors.';
  if (command.type === 'tunnel') {
    if (state.enemyHp > 0) return 'Flee to disengage from this encounter.';
    const plan = catalog && planIslandTunnel(room,catalog,p.site,command.stationId,expeditionTravelSpeed(p.expedition));
    if (!plan) return 'Choose an adjacent station from this platform.';
    p.previousSite = p.site; p.fighting = false;
    p.action = {kind:'travel',mode:'tunnel',startedAt:room.simMs,endsAt:room.simMs+plan.durationMs,target:plan.target,travelHours:plan.hours};
    return null;
  }
  if (command.type === 'travel') {
    if (state.enemyHp > 0) return 'Flee to disengage from this encounter.';
    return startTravel(room,p,command.site);
  }
  if (command.type === 'trek') {
    if (state.enemyHp > 0) return 'Flee to disengage from this encounter.';
    const plan = planIslandTravel(room,p.site,command,expeditionTravelSpeed(p.expedition));
    if (!plan) return 'No walkable route within 1.2 km. Choose a closer point.';
    const id = createTrekSite(room,command);
    return startTravel(room,p,id);
  }
  if (command.type === 'takeItem') {
    const index = state.items?.findIndex((i) => i.uid === command.uid) ?? -1;
    if (index < 0) return 'That item is no longer in the shared cache.';
    const error = addExpeditionItem(p.expedition, state.items![index]);
    if (error) return error;
    state.items!.splice(index,1); p.medical = medicalCount(p.expedition); return null;
  }
  if (command.type === 'giveItem') {
    const target = room.players.find((other) => other.id === command.playerId);
    if (!target?.expedition || target.id === p.id || target.status !== 'active' || target.site !== p.site || target.action?.kind === 'travel') return 'Reach an active teammate to transfer supplies.';
    const index = p.expedition.items.findIndex((i) => i.uid === command.uid);
    if (index < 0) return 'You do not carry that item.';
    const error = addExpeditionItem(target.expedition,p.expedition.items[index]);
    if (error) return error;
    p.expedition.items.splice(index,1);
    p.medical = medicalCount(p.expedition); target.medical = medicalCount(target.expedition); return null;
  }
  if (['eat','take','give'].includes(command.type)) return 'Use your inventory or the shared item cache.';
  if (command.type === 'useItem' || command.type === 'dropItem' || command.type === 'equipItem' || command.type === 'craft') {
    if (state.enemyHp > 0 && command.type === 'craft') return 'Clear the encounter before crafting.';
    const result = applyExpeditionCommand(p.expedition,command,`${room.seed}:${p.id}:${room.revision}`);
    if (result.error) return result.error;
    if (result.dropped) (state.items ??= []).push(result.dropped);
    if (result.craft && result.durationMs) p.action = { kind: 'craft', startedAt: room.simMs, endsAt: room.simMs + result.durationMs, craft: result.craft };
    else if (result.durationMs) {
      p.fighting = false;
      p.action = { kind: 'treat', startedAt: room.simMs, endsAt: room.simMs + result.durationMs };
    }
    p.hp = expeditionHp(p.expedition); p.medical = medicalCount(p.expedition); return null;
  }
  return undefined;
}
export function islandFlee(room: RoomState, p: Survivor, catalog?: IslandCatalog): string | null {
  if (room.world!.locations[p.site]?.interior) return fleeIslandInterior(room,p);
  const target = p.previousSite && room.world!.locations[p.previousSite] ? p.previousSite : room.world!.spawn;
  const destination = room.world!.locations[target];
  const station = catalog?.mrt && destination.category === 'mrt' ? nearestStation(catalog.mrt,destination.lat,destination.lng) : null;
  const tunnel = station && catalog && p.expedition ? planIslandTunnel(room,catalog,p.site,station.id,expeditionTravelSpeed(p.expedition)) : null;
  if (tunnel) {
    p.previousSite = p.site; p.fighting = false;
    p.action = {kind:'travel',mode:'tunnel',startedAt:room.simMs,endsAt:room.simMs+tunnel.durationMs,target,travelHours:tunnel.hours};
    return null;
  }
  return startTravel(room,p,target);
}
export { ISLAND_SIGHT_M };
