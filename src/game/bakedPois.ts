import { haversine, type RawPoi } from './overpass';

/**
 * Loads the pre-baked Singapore POI set (public/pois.json, produced by
 * `npm run bake:pois`) and filters it to a spawn radius.
 *
 * This replaces the per-run Overpass call in the common case: a static file on
 * the CDN can't rate-limit us, works offline once cached, and returns in
 * milliseconds instead of seconds. Overpass stays as the fallback so a missing
 * or stale bake degrades rather than breaks.
 */

interface BakedFile {
  generated: string;
  pois: RawPoi[];
}

// Module-level cache: the file is fetched at most once per page load, and
// concurrent callers share the same in-flight promise.
let pending: Promise<RawPoi[]> | null = null;

async function loadAll(): Promise<RawPoi[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}pois.json`);
  if (!res.ok) throw new Error(`pois.json ${res.status}`);
  const data = (await res.json()) as BakedFile;
  if (!Array.isArray(data.pois) || data.pois.length === 0) {
    throw new Error('pois.json empty or malformed');
  }
  return data.pois;
}

/** True once the baked set is in memory — a later call resolves instantly. */
export function isBakeLoaded(): boolean {
  return pending !== null;
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
  if (!pending) {
    pending = loadAll().catch((err: unknown) => {
      pending = null; // let a later attempt retry rather than caching the failure
      throw err;
    });
  }
  const all = await pending;

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
