import type { HdbFloor } from '../game/hdbDungeon';
import type { FactionId, PoiCategory, WeatherKind } from '../game/types';

export interface IslandPoint { lat: number; lng: number }
export interface IslandTunnelExit { stationId: string; site: string; name: string; line: string; meters: number }
export interface IslandInterior { parent:string; level:number; unit?:string; storey:number }
export interface IslandLocation extends IslandPoint {
  id: string; name: string; category: PoiCategory; danger: number;
  faction: FactionId; visited: boolean;
  interior?: IslandInterior; building?: { floors:HdbFloor[] };
  mrtStationId?: string; tunnelExits?: IslandTunnelExit[];
}
export interface IslandWorld {
  version: 1; revision: string; spawn: string; evac: string;
  locations: Record<string, IslandLocation>;
  explored: IslandPoint[];
  weather: WeatherKind;
}
export const ISLAND_SIGHT_M = 400;
export const ISLAND_HOP_M = 1200;
export const SPAWN_DISTRICTS = [
  { id: 'bishan', name: 'Bishan', lat: 1.3508, lng: 103.8483 },
  { id: 'tampines', name: 'Tampines', lat: 1.3533, lng: 103.9451 },
  { id: 'jurong', name: 'Jurong East', lat: 1.3331, lng: 103.7422 },
  { id: 'woodlands', name: 'Woodlands', lat: 1.4369, lng: 103.7865 },
  { id: 'chinatown', name: 'Chinatown', lat: 1.2844, lng: 103.8439 },
] as const;
