import { haversine } from './overpass';
import { NEIGHBOURHOODS } from './singapore';
import { Rng } from './rng';
import type { LocationState, PoiCategory } from './types';

/**
 * Geographic doom — neighbourhood pressure as a spatial field.
 *
 * Ground zero is picked from the run seed (not the spawn click). Each town's
 * pressure is the island horde clock plus a distance offset from GZ, with a
 * little jitter so the front is not a perfect bullseye. The spawn map stays
 * blind; the run map can paint this field like the MRT overlay — geography,
 * not loot intel.
 */

export type TownTier = 'stirring' | 'restless' | 'massing' | 'fallen' | 'lost';

export interface TownDef {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** Mid-crisis mean. The island is already dying when the survivor wakes. */
export const TOWN_FIELD_START_HORDE = 42;

/** GZ sits this far above the island mean (before jitter). */
const OFFSET_GZ = 38;
/** Farthest town sits this far below the island mean (before jitter). */
const OFFSET_FAR = 34;
const OFFSET_JITTER = 6;

/** Pressure (0..100) at which a neighbourhood reads Lost. */
export const LOST_PRESSURE = 80;

export const TOWN_TIER_ORDER: readonly TownTier[] = [
  'stirring',
  'restless',
  'massing',
  'fallen',
  'lost',
];

export const TOWN_TIER_CUT: Record<TownTier, number> = {
  stirring: 0,
  restless: 20,
  massing: 40,
  fallen: 60,
  lost: LOST_PRESSURE,
};

/** Extra site danger on top of POI + noise. Lost is a raid, not a wall. */
export const TOWN_DANGER_MOD: Record<TownTier, number> = {
  stirring: 0,
  restless: 0,
  massing: 1,
  fallen: 2,
  lost: 3,
};

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export const TOWNS: readonly TownDef[] = NEIGHBOURHOODS.map((n) => ({
  id: slug(n.name),
  name: n.name,
  lat: n.lat,
  lng: n.lng,
}));

const TOWN_BY_ID: Record<string, TownDef> = Object.fromEntries(TOWNS.map((t) => [t.id, t]));

export function getTown(id: string): TownDef | null {
  return TOWN_BY_ID[id] ?? null;
}

export function pickGroundZero(rng: Rng): TownDef {
  return TOWNS[rng.fork('townField').int(0, TOWNS.length - 1)];
}

/**
 * Memo caches. Every entry below is a pure function of immutable module data
 * (`TOWNS`) plus its arguments, so caching cannot change a result — it only
 * stops `hazardZonesNear` re-running ~250 cells x 20 haversines on every
 * energy tick. Caps are generous; a run touches a few thousand keys at most.
 */
const NEAREST_CACHE = new Map<string, TownDef>();
const MAX_DIST_CACHE = new Map<string, number>();
const OFFSET_CACHE = new Map<string, number>();
const CACHE_CAP = 20000;

function capped<K, V>(cache: Map<K, V>, key: K, value: V): V {
  if (cache.size >= CACHE_CAP) cache.clear();
  cache.set(key, value);
  return value;
}

export function nearestTown(lat: number, lng: number): TownDef {
  // Exact-coordinate key: the hazard scan feeds deterministic cell centres, so
  // this hits without quantising (which would shift town borders).
  const key = `${lat},${lng}`;
  const hit = NEAREST_CACHE.get(key);
  if (hit) return hit;
  let best = TOWNS[0];
  let bestD = Infinity;
  for (const t of TOWNS) {
    const d = haversine(lat, lng, t.lat, t.lng);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return capped(NEAREST_CACHE, key, best);
}

function maxDistFrom(gz: TownDef): number {
  const hit = MAX_DIST_CACHE.get(gz.id);
  if (hit !== undefined) return hit;
  let max = 1;
  for (const t of TOWNS) {
    const d = haversine(gz.lat, gz.lng, t.lat, t.lng);
    if (d > max) max = d;
  }
  return capped(MAX_DIST_CACHE, gz.id, max);
}

function townOffset(seed: string, gz: TownDef, town: TownDef): number {
  // Pure in (seed, gz, town) — and the uncached path mints a fresh seedrandom
  // instance, which is the costly half.
  const key = `${seed}|${gz.id}|${town.id}`;
  const hit = OFFSET_CACHE.get(key);
  if (hit !== undefined) return hit;
  const maxD = maxDistFrom(gz);
  const t = haversine(gz.lat, gz.lng, town.lat, town.lng) / maxD;
  const base = OFFSET_GZ + t * (-OFFSET_FAR - OFFSET_GZ);
  const jitter = (new Rng(seed).fork(`townOffset:${town.id}`).next() * 2 - 1) * OFFSET_JITTER;
  return capped(OFFSET_CACHE, key, base + jitter);
}

/** 0..100 neighbourhood pressure. Island mean tracks `hordeLevel`. */
export function townPressure(seed: string, groundZeroId: string, hordeLevel: number, townId: string): number {
  const gz = getTown(groundZeroId);
  const town = getTown(townId);
  if (!gz || !town) return Math.max(0, Math.min(100, hordeLevel));
  return Math.max(0, Math.min(100, hordeLevel + townOffset(seed, gz, town)));
}

export function townPressureAt(
  seed: string,
  groundZeroId: string,
  hordeLevel: number,
  lat: number,
  lng: number,
): number {
  return townPressure(seed, groundZeroId, hordeLevel, nearestTown(lat, lng).id);
}

/** 0..1 intensity for wilds / trek / search (same units as hordeIntensity). */
export function pressureAt(
  seed: string,
  groundZeroId: string | null,
  hordeLevel: number,
  lat: number,
  lng: number,
): number {
  if (!groundZeroId) return Math.min(1, Math.max(0, hordeLevel / 100));
  return townPressureAt(seed, groundZeroId, hordeLevel, lat, lng) / 100;
}

export function makePressureAt(
  seed: string,
  groundZeroId: string | null,
  hordeLevel: number,
): (lat: number, lng: number) => number {
  return (lat, lng) => pressureAt(seed, groundZeroId, hordeLevel, lat, lng);
}

export function townTier(pressure: number): TownTier {
  if (pressure >= LOST_PRESSURE) return 'lost';
  if (pressure >= 60) return 'fallen';
  if (pressure >= 40) return 'massing';
  if (pressure >= 20) return 'restless';
  return 'stirring';
}

export function townTierAt(
  seed: string,
  groundZeroId: string,
  hordeLevel: number,
  lat: number,
  lng: number,
): TownTier {
  return townTier(townPressureAt(seed, groundZeroId, hordeLevel, lat, lng));
}

export function townDangerMod(tier: TownTier): number {
  return TOWN_DANGER_MOD[tier];
}

const OPEN_SPAWN_CATEGORIES: ReadonlySet<PoiCategory> = new Set([
  'waypoint',
  'foodcourt',
  'fuel',
]);

/** Buildings you can wake inside — not a hawker roof or a roadside stop. */
export function isRoofedSpawnShelter(category: PoiCategory): boolean {
  return !OPEN_SPAWN_CATEGORIES.has(category);
}

const SHELTER_PREFER: ReadonlySet<PoiCategory> = new Set([
  'residential',
  'mrt',
  'school',
  'hospital',
  'clinic',
  'supermarket',
]);

/** Nearest roofed site to dump a Lost spawn into, so the street is a choice. */
export function nearestRoofedShelter(
  locations: LocationState[],
  from: { lat: number; lng: number },
): LocationState | null {
  let preferred: LocationState | null = null;
  let preferredD = Infinity;
  let any: LocationState | null = null;
  let anyD = Infinity;
  for (const loc of locations) {
    if (!isRoofedSpawnShelter(loc.category)) continue;
    const d = haversine(from.lat, from.lng, loc.lat, loc.lng);
    if (d < anyD) {
      anyD = d;
      any = loc;
    }
    if (SHELTER_PREFER.has(loc.category) && d < preferredD) {
      preferredD = d;
      preferred = loc;
    }
  }
  if (preferred && preferredD <= 600) return preferred;
  return preferred ?? any;
}

if (import.meta.env.DEV) {
  const ids = new Set<string>();
  for (const t of TOWNS) {
    if (ids.has(t.id)) console.error(`[townField] duplicate town id "${t.id}"`);
    ids.add(t.id);
  }
}
