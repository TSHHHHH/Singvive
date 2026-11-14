import registry from './data/verifiedHdb.json' with { type: 'json' };
import type { LocationState } from './types';

const sites: Readonly<Record<string, readonly number[]>> = registry.sites;

/** Only independently verified OSM buildings can open an HDB dungeon. */
export function isVerifiedHdb(id: string, lat: number, lng: number): boolean {
  const point = sites[id];
  // Allow the difference between an OSM bbox centre and the baked ring centre.
  // An ID reused at a different position must be reviewed again.
  return !!point && Math.hypot(lat - point[0], lng - point[1]) * 111000 <= 60;
}

/** Preserve IDs, positions and stashes in v7 saves without preserving ghost buildings. */
export function repairUnverifiedSites(locations: Record<string, LocationState>): Record<string, LocationState> {
  let next: Record<string, LocationState> | null = null;
  for (const [id, loc] of Object.entries(locations)) {
    const syntheticBuilding = id.startsWith('fallback/') && loc.category !== 'waypoint';
    if (!syntheticBuilding && (loc.category !== 'residential' || isVerifiedHdb(id, loc.lat, loc.lng))) continue;
    next ??= { ...locations };
    next[id] = { ...loc, category: 'waypoint', name: 'Open ground', outline: undefined,
      factionId: null, factionServices: undefined, isFactionOutpost: false,
      isMrtStation: false, mrtStationId: undefined, remainingSearches: 0, exhausted: true };
  }
  return next ?? locations;
}
