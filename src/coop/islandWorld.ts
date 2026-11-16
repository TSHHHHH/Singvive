import { assignFaction } from '../game/factions';
import type { MrtNetwork } from '../game/mrt';
import { discoverIslandTunnels } from './islandSystems';
import { haversine, type RawPoi } from '../game/overpass';
import { isWalkable, isZonesLoaded } from '../game/playable';
import { routeLandPath } from '../game/route';
import { POI_CONFIG } from '../game/poi';
import { Rng } from '../game/rng';
import { rollWeather, weatherTravelMult } from '../game/weather';
import { ISLAND_HOP_M, ISLAND_SIGHT_M, SPAWN_DISTRICTS, type IslandPoint } from './islandModel';
import type { RoomState } from './model';

const CELL = 0.005;
const cellKey = (lat: number, lng: number) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;
export interface IslandCatalog { revision: string; pois: ReadonlyMap<string, RawPoi>; cells: ReadonlyMap<string, readonly RawPoi[]>; mrt?: MrtNetwork }
export function buildIslandCatalog(pois: readonly RawPoi[], revision: string, mrt?: MrtNetwork): IslandCatalog {
  const byId = new Map<string, RawPoi>();
  const cells = new Map<string, RawPoi[]>();
  for (const p of pois) {
    if (!p.osmId || !POI_CONFIG[p.category] || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    // Static metadata only: geometry stays in the immutable map assets.
    const poi = { osmId: p.osmId, name: p.name, lat: p.lat, lng: p.lng, category: p.category };
    if (byId.has(p.osmId)) continue;
    byId.set(p.osmId, poi);
    const key = cellKey(p.lat, p.lng);
    const list = cells.get(key) ?? []; list.push(poi); cells.set(key, list);
  }
  return { revision, pois: byId, cells, mrt };
}
export function nearbyPois(catalog: IslandCatalog, point: IslandPoint, radius = ISLAND_SIGHT_M): RawPoi[] {
  const result: RawPoi[] = [];
  const d = radius / 110000;
  for (let x = Math.floor((point.lat - d) / CELL); x <= Math.floor((point.lat + d) / CELL); x++) {
    for (let y = Math.floor((point.lng - d) / CELL); y <= Math.floor((point.lng + d) / CELL); y++) {
      for (const poi of catalog.cells.get(`${x}:${y}`) ?? []) {
        if (haversine(point.lat, point.lng, poi.lat, poi.lng) <= radius && isWalkable(poi.lat, poi.lng)) result.push(poi);
      }
    }
  }
  return result.sort((a,b) => a.osmId.localeCompare(b.osmId));
}
export function revealSite(room: RoomState, poi: RawPoi) {
  const world = room.world!;
  if (world.locations[poi.osmId]) return;
  const rng = new Rng(room.seed).fork(`island:${poi.osmId}`);
  const danger = Math.max(1, Math.min(5, POI_CONFIG[poi.category].baseDanger + rng.int(-1, 1)));
  world.locations[poi.osmId] = { id: poi.osmId, name: poi.name, lat: poi.lat, lng: poi.lng, category: poi.category, danger, faction: assignFaction(new Rng(room.seed).fork(`faction:${poi.osmId}`), poi.category), visited: false };
  room.sites[poi.osmId] = { searches: poi.category === 'waypoint' ? 0 : rng.int(1, 3), medical: 0, food: 0, enemyHp: 0, round: 0, items: [] };
}
export function revealNearby(room: RoomState, catalog: IslandCatalog, point: IslandPoint): void {
  if (!room.world) return;
  for (const poi of nearbyPois(catalog, point)) revealSite(room, poi);
  // Overlapping exploration discs are sampled at a useful spacing, not on each alarm.
  if (!room.world.explored.some((p) => haversine(p.lat,p.lng,point.lat,point.lng) < 180)) {
    room.world.explored.push({ lat: point.lat, lng: point.lng });
  }
}
export function initializeIsland(room: RoomState, catalog: IslandCatalog, district = 'bishan'): void {
  const spawn = SPAWN_DISTRICTS.find((p) => p.id === district);
  if (!spawn) throw new Error('Unknown starting district.');
  if (!isZonesLoaded()) throw new Error('Island walkability is not ready.');
  const candidates = nearbyPois(catalog, spawn, 1500);
  const closest = candidates.sort((a,b) => haversine(a.lat,a.lng,spawn.lat,spawn.lng) - haversine(b.lat,b.lng,spawn.lat,spawn.lng))[0];
  if (!closest) throw new Error('No walkable start in this district.');
  room.sites = {};
  room.world = { version: 1, revision: catalog.revision, spawn: closest.osmId, evac: '', locations: {}, explored: [], weather: rollWeather(new Rng(room.seed), 1) };
  revealSite(room, closest);
  revealNearby(room, catalog, closest);
  room.world.locations[closest.osmId].visited = true;
  discoverIslandTunnels(room, catalog, closest.osmId);
  room.sites[closest.osmId].enemyHp = 0;
  // One bounded island scan at room setup, never on alarm ticks or renders.
  const evacCandidates = [...catalog.pois.values()].filter((p) => {
    const distance = haversine(p.lat,p.lng,closest.lat,closest.lng);
    return distance >= 4000 && distance <= 12000 && ['hospital','school','community','park'].includes(p.category) && isWalkable(p.lat,p.lng);
  }).sort((a,b) => a.osmId.localeCompare(b.osmId));
  const fallback = [...catalog.pois.values()].filter((p) => p.osmId !== closest.osmId && isWalkable(p.lat,p.lng));
  const choices = evacCandidates.length ? evacCandidates : fallback;
  const evac = choices.length ? choices[new Rng(room.seed).fork('island-evac').int(0, choices.length - 1)] : closest;
  revealSite(room, evac); room.world.evac = evac.osmId;
  for (const p of room.players) { p.site = closest.osmId; p.previousSite = undefined; }
}
export function planIslandTravel(room: RoomState, fromId: string, target: IslandPoint, speedMPerHour: number) {
  const from = room.world?.locations[fromId];
  if (!from || from.interior || !isZonesLoaded() || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)
    || !Number.isFinite(speedMPerHour) || speedMPerHour <= 0) return null;
  const direct = haversine(from.lat,from.lng,target.lat,target.lng);
  if (direct > ISLAND_HOP_M || direct < 1) return null;
  const path = routeLandPath(from, target);
  if (!path || path.lengthM > ISLAND_HOP_M * 2) return null;
  const minutes = path.lengthM / speedMPerHour * 60 * weatherTravelMult(room.world!.weather);
  return { route: path.points, durationMs: Math.max(3000, Math.ceil(minutes * 1000)), lengthM: path.lengthM };
}
export function createTrekSite(room: RoomState, point: IslandPoint): string {
  const id = `trek:${point.lat.toFixed(6)}:${point.lng.toFixed(6)}`;
  revealSite(room, { ...point, osmId: id, name: 'Street waypoint', category: 'waypoint' });
  return id;
}
/** Only the viewer's current sight contains live site state. Discovery is shared. */
export function projectIslandRoom(room: RoomState, playerId: string): RoomState {
  if (!room.world) return room;
  const player = room.players.find((p) => p.id === playerId);
  const center = player && room.world.locations[player.site];
  if (!center) return { ...room, sites: {} };
  const sites: RoomState['sites'] = {};
  for (const [id, state] of Object.entries(room.sites)) {
    const site = room.world.locations[id];
    if (site && (site.interior ? id === player?.site : haversine(center.lat,center.lng,site.lat,site.lng) <= ISLAND_SIGHT_M)) sites[id] = state;
  }
  return { ...room, sites };
}
