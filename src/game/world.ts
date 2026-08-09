import type { LocationSize, LocationState, PoiCategory } from './types';
import type { Rng } from './rng';
import { haversine, type RawPoi } from './overpass';
import { POI_CONFIG, POI_CATEGORIES } from './poi';
import { assignFaction } from './factions';

// With fog of war, undiscovered locations aren't rendered — so the world can
// be much denser than what's ever on screen at once. Render cost grows only
// with what the player has actually explored.
const MAX_LOCATIONS = 220;
const MAX_RESIDENTIAL = 100; // keep void decks from burying shops/amenities

const SEARCHES_BY_SIZE: Record<LocationSize, number> = {
  small: 2,
  medium: 3,
  large: 5,
};

/** Rough m² area of a lat/lng polygon ring (shoelace on a local plane). */
function ringArea(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring[0][0];
  const mPerDegLat = 111000;
  const mPerDegLng = 111000 * Math.cos((lat0 * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [aLat, aLng] = ring[i];
    const [bLat, bLng] = ring[(i + 1) % ring.length];
    const ax = aLng * mPerDegLng;
    const ay = aLat * mPerDegLat;
    const bx = bLng * mPerDegLng;
    const by = bLat * mPerDegLat;
    area += ax * by - bx * ay;
  }
  return Math.abs(area) / 2;
}

function sizeFor(category: PoiCategory, outline?: [number, number][]): LocationSize {
  if (outline) {
    const a = ringArea(outline);
    if (a > 1500) return 'large';
    if (a > 400) return 'medium';
    return 'small';
  }
  // fallback by category footprint expectations
  if (category === 'hospital' || category === 'police' || category === 'supermarket') return 'large';
  if (category === 'residential' || category === 'foodcourt' || category === 'hardware') return 'medium';
  return 'small';
}

/**
 * Build the run's clickable world from raw OSM POIs as full LocationStates:
 * dedupe, assign seeded size/danger/searches/faction, compute distance from the
 * original spawn, sort by distance and cap the count.
 */
export function buildLocations(
  rng: Rng,
  spawn: { lat: number; lng: number },
  raw: RawPoi[],
): LocationState[] {
  const dangerRng = rng.fork('danger');
  const factionRng = rng.fork('faction');
  const seen = new Set<string>();
  const out: LocationState[] = [];

  for (const r of raw) {
    const key = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const cfg = POI_CONFIG[r.category];
    const baseDanger = Math.max(1, Math.min(5, cfg.baseDanger + dangerRng.int(-1, 1)));
    const size = sizeFor(r.category, r.outline);
    const factionId = assignFaction(factionRng.fork(r.osmId), r.category);

    out.push({
      id: r.osmId,
      name: r.name,
      category: r.category,
      lat: r.lat,
      lng: r.lng,
      outline: r.outline,
      size,
      baseDanger,
      currentDanger: baseDanger,
      remainingSearches: SEARCHES_BY_SIZE[size],
      exhausted: false,
      cleared: false,
      looted: false,
      factionId,
      isFactionRevealed: false,
      isMrtStation: r.category === 'mrt',
      discovered: false,
      lastSeen: null,
      distanceFromSpawn: Math.round(haversine(spawn.lat, spawn.lng, r.lat, r.lng)),
    });
  }

  out.sort((a, b) => a.distanceFromSpawn - b.distanceFromSpawn);

  // Keep all non-residential; cap void decks to the nearest MAX_RESIDENTIAL so
  // the estates are populated without crowding out shops. Re-sort by distance.
  const kept: LocationState[] = [];
  let residentialCount = 0;
  for (const loc of out) {
    if (loc.category === 'residential') {
      if (residentialCount >= MAX_RESIDENTIAL) continue;
      residentialCount += 1;
    }
    kept.push(loc);
  }
  return kept.sort((a, b) => a.distanceFromSpawn - b.distanceFromSpawn).slice(0, MAX_LOCATIONS);
}

// Rough weight for how often each category appears in a Singapore town.
const FALLBACK_MIX: [PoiCategory, number][] = [
  ['residential', 10],
  ['convenience', 6],
  ['foodcourt', 4],
  ['supermarket', 3],
  ['pharmacy', 3],
  ['fuel', 2],
  ['hardware', 2],
  ['mrt', 2],
  ['hospital', 1],
  ['police', 1],
];

/**
 * Procedurally synthesise plausible locations around the spawn when Overpass
 * is unavailable. Deterministic for a given seed.
 */
export function generateFallbackWorld(
  rng: Rng,
  spawn: { lat: number; lng: number },
  radiusM: number,
  count = 70,
): LocationState[] {
  const gen = rng.fork('fallback');
  const raw: RawPoi[] = [];
  for (let i = 0; i < count; i++) {
    const category = gen.weighted(FALLBACK_MIX);
    const angle = gen.next() * Math.PI * 2;
    const dist = Math.sqrt(gen.next()) * radiusM;
    const dLat = (dist * Math.cos(angle)) / 111000;
    const dLng = (dist * Math.sin(angle)) / (111000 * Math.cos((spawn.lat * Math.PI) / 180));
    raw.push({
      osmId: `fallback/${i}`,
      name: POI_CONFIG[category].label,
      category,
      lat: spawn.lat + dLat,
      lng: spawn.lng + dLng,
    });
  }
  return buildLocations(rng, spawn, raw);
}

export const ALL_POI_CATEGORIES = POI_CATEGORIES;
