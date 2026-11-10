import type { Poi } from '../game/types';
import { FACTION_CONFIG } from '../game/factions';
import { pxPerMetre } from './geo';

/**
 * Landmark beacons for the 3D run map: a column of light over the places a
 * player navigates by — the extraction zone and each faction's outposts — so
 * they read from across the island once the camera is tilted.
 *
 * The pillar is a DOM marker (components/Beacons3d.tsx + index.css .beacon),
 * not an extrusion, so it stays lit over towers, fog and night alike. Its
 * height follows the camera here; everything else is CSS. The site's own
 * badge rides the top of its beam (MapMarker `beacon`, index.css .on-beacon).
 */

export type BeaconKind = 'evac' | 'outpost';

export interface Beacon {
  id: string;
  lat: number;
  lng: number;
  color: string;
  kind: BeaconKind;
}

/** The extraction zone's light: the same cyan as its badge. */
export const EVAC_BEACON_COLOR = '#2bc4d9';

/** How tall the light would stand in the world, in metres. */
export const BEACON_M = 300;
/** Never shorter than this on screen, so a far zoom still shows a mark. */
export const BEACON_MIN_PX = 72;
/** Never taller than this on screen, so a close zoom doesn't wall the view. */
export const BEACON_MAX_PX = 560;

/**
 * Screen height of a beacon: its world height at this zoom, foreshortened by
 * the camera's tilt, clamped so it neither vanishes zoomed out nor swallows
 * the screen zoomed in.
 */
export function beaconHeightPx(zoom: number, lat: number, pitchDeg: number): number {
  const tall = BEACON_M * pxPerMetre(zoom, lat) * Math.sin((Math.max(0, pitchDeg) * Math.PI) / 180);
  return Math.min(BEACON_MAX_PX, Math.max(BEACON_MIN_PX, tall));
}

/**
 * The beacon a site carries, if any: evac wins over outpost. Only outposts the
 * player knows about get one.
 */
export function beaconKindOf(poi: Poi, evacZoneId: string | null): BeaconKind | null {
  if (poi.id === evacZoneId) return 'evac';
  if (poi.isFactionOutpost && poi.factionId && poi.discovered) return 'outpost';
  return null;
}

/**
 * Which sites carry a beacon: the extraction zone, then every known faction
 * outpost in its faction's colour. A site that is both gets the evac light.
 */
export function landmarkBeacons(pois: readonly Poi[], evacZoneId: string | null): Beacon[] {
  const out: Beacon[] = [];
  const evac = evacZoneId ? pois.find((p) => p.id === evacZoneId) : undefined;
  if (evac) out.push({ id: evac.id, lat: evac.lat, lng: evac.lng, color: EVAC_BEACON_COLOR, kind: 'evac' });
  for (const p of pois) {
    if (beaconKindOf(p, evacZoneId) !== 'outpost' || !p.factionId) continue;
    out.push({ id: p.id, lat: p.lat, lng: p.lng, color: FACTION_CONFIG[p.factionId].color, kind: 'outpost' });
  }
  return out;
}

/** A stable string for a beacon set, so the map only rebuilds them on a real change. */
export function beaconsKey(beacons: readonly Beacon[]): string {
  return beacons.map((b) => `${b.kind}:${b.id}:${b.color}:${b.lat.toFixed(6)},${b.lng.toFixed(6)}`).join('|');
}
