import { haversine, type RawPoi } from './overpass';

/**
 * Loads the pre-baked Singapore POI set (public/pois.json, produced by
 * `npm run bake:pois`) and filters it to a spawn radius.
 *
 * The full island file is parsed once per page (~3.8 MB). Do not add another
 * 30 km scan of every POI — that is the spawn hitch. Evac pick uses
 * `bakedEvacPois()` (category / baked id subset). Prefetch on the spawn screen
 * so Begin is not parse + Prim on the same turn.
 *
 * Overpass stays as the fallback so a missing or stale bake degrades rather
 * than breaks.
 */

interface BakedFile {
  generated: string;
  pois: RawPoi[];
  /** osmIds of mrt/school/police sites with a usable name. Optional on older bakes. */
  evacIds?: string[];
}

/** Categories `pickDistantEvacPoi` prefers — used when the bake has no `evacIds`. */
const EVAC_CATEGORIES = new Set(['mrt', 'school', 'police']);

// Module-level cache: the file is fetched at most once per page load, and
// concurrent callers share the same in-flight promise.
let pending: Promise<RawPoi[]> | null = null;
let cached: RawPoi[] | null = null;
let cachedEvacIds: string[] | null = null;
let osmIdSet: Set<string> | null = null;
let outlineById: Map<string, [number, number][]> | null = null;

function indexBake(pois: RawPoi[], evacIds?: string[]): RawPoi[] {
  cached = pois;
  cachedEvacIds = evacIds ?? null;
  osmIdSet = new Set(pois.map((p) => p.osmId));
  outlineById = new Map();
  for (const p of pois) {
    if (p.outline && p.outline.length >= 3) outlineById.set(p.osmId, p.outline);
  }
  return pois;
}

async function loadAll(): Promise<RawPoi[]> {
  if (cached) return cached;
  const res = await fetch(`${import.meta.env.BASE_URL}pois.json`);
  if (!res.ok) throw new Error(`pois.json ${res.status}`);
  const data = (await res.json()) as BakedFile;
  if (!Array.isArray(data.pois) || data.pois.length === 0) {
    throw new Error('pois.json empty or malformed');
  }
  return indexBake(data.pois, data.evacIds);
}

function ensurePending(): Promise<RawPoi[]> {
  if (!pending) {
    pending = loadAll().catch((err: unknown) => {
      pending = null;
      cached = null;
      cachedEvacIds = null;
      osmIdSet = null;
      outlineById = null;
      throw err;
    });
  }
  return pending;
}

/** True once the baked set is in memory — a later call resolves instantly. */
export function isBakeLoaded(): boolean {
  return cached !== null;
}

/** Start the island parse without waiting. Safe to call from SpawnSelect. */
export function prefetchBake(): void {
  void ensurePending().catch(() => {
    /* spawn/setSpawn still tries and falls back */
  });
}

export function ensureBakeLoaded(): Promise<RawPoi[]> {
  return ensurePending();
}

/** osmIds present in the bake, or null until loaded. Used to strip save outlines. */
export function bakedOsmIds(): Set<string> | null {
  return osmIdSet;
}

/** Building rings keyed by osmId, or null until loaded. */
export function bakedOutlineByOsmId(): Map<string, [number, number][]> | null {
  return outlineById;
}

/**
 * POIs within `radius` metres of a point, in the same shape Overpass returns.
 * Throws if the baked file is missing/malformed so the caller can fall back.
 */
export async function bakedPoisNear(
  lat: number,
  lng: number,
  radius: number,
): Promise<RawPoi[]> {
  const all = await ensurePending();

  // Cheap bounding-box reject before the haversine, so we run the trig on the
  // handful of candidates rather than every POI on the island.
  const latPad = radius / 111000;
  const lngPad = radius / (111000 * Math.cos((lat * Math.PI) / 180));

  const near: RawPoi[] = [];
  for (const p of all) {
    if (p.lat < lat - latPad || p.lat > lat + latPad) continue;
    if (p.lng < lng - lngPad || p.lng > lng + lngPad) continue;
    if (haversine(lat, lng, p.lat, p.lng) <= radius) near.push(p);
  }
  return near;
}

/**
 * Far extraction candidates. Prefer the bake's `evacIds`; otherwise mrt /
 * school / police with a real name. Do not haversine the whole island.
 */
export async function bakedEvacPois(): Promise<RawPoi[]> {
  const all = await ensurePending();
  if (cachedEvacIds && cachedEvacIds.length > 0) {
    const want = new Set(cachedEvacIds);
    return all.filter((p) => want.has(p.osmId));
  }
  return all.filter(
    (p) => EVAC_CATEGORIES.has(p.category) && (p.name ?? '').trim().length >= 3,
  );
}
