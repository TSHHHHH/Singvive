import { nearestStation, neighbours, type MrtStation } from '../game/mrt';
import type { IslandTunnelExit } from './islandModel';
import { revealSite, type IslandCatalog } from './islandWorld';
import type { RoomState } from './model';

/** Tunnels are on foot: navigating dark tracks costs 50% more time. */
export const TUNNEL_CRAWL_MULT = 1.5;
function stationAt(room: RoomState, catalog: IslandCatalog, siteId: string): MrtStation | null {
  const location = room.world?.locations[siteId];
  if (!location || location.category !== 'mrt' || !catalog.mrt) return null;
  // Always match authoritative coordinates, even if stored metadata was edited or stale.
  return nearestStation(catalog.mrt, location.lat, location.lng);
}
/** Safe with existing island1 saves that predate tunnel metadata. */
export function availableIslandTunnels(room: RoomState, siteId: string): readonly IslandTunnelExit[] {
  return room.world?.locations[siteId]?.tunnelExits ?? [];
}
export function discoverIslandTunnels(room: RoomState, catalog: IslandCatalog, siteId: string): void {
  const station = stationAt(room,catalog,siteId);
  if (!station || !catalog.mrt) return;
  const location = room.world!.locations[siteId];
  location.mrtStationId = station.id;
  location.tunnelExits = neighbours(catalog.mrt,station.id).map(segment => {
    const next = segment.station;
    // Canonical synthetic platforms avoid depending on OSM having a surface POI.
    const site = `mrt:${next.id}`;
    revealSite(room,{osmId:site,name:next.name,category:'mrt',lat:next.lat,lng:next.lng});
    room.world!.locations[site].mrtStationId = next.id;
    return {stationId:next.id,site,name:next.name,line:segment.line.name,meters:segment.meters};
  });
}
export function planIslandTunnel(room: RoomState, catalog: IslandCatalog, fromId: string, stationId: string, speed: number) {
  const from = stationAt(room,catalog,fromId);
  if (!from || !catalog.mrt || !Number.isFinite(speed) || speed <= 0) return null;
  const segment = neighbours(catalog.mrt,from.id).find(s=>s.station.id === stationId);
  if (!segment) return null;
  discoverIslandTunnels(room,catalog,fromId);
  const hours = segment.meters / speed * TUNNEL_CRAWL_MULT;
  return {target:`mrt:${stationId}`,durationMs:Math.max(3000,Math.ceil(hours*60000)),hours};
}
