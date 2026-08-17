import { inPolygon, inSingapore, SG_BOUNDS } from './singapore';

/**
 * Walkability against the baked land / water / restricted mask
 * (`public/zones.json`, from `npm run bake:zones`).
 *
 * Vegetation rings live in the same bake but are soft travel cost only —
 * they never change walkability.
 *
 * Pure geometry — no React, no Math.random. Callers that need a sync answer
 * after boot should `await ensureZonesLoaded()` once (spawn / setSpawn do).
 */

export type Walkability = 'ok' | 'water' | 'restricted' | 'outside';

export type ZoneRing = [number, number][];

export interface ZonesData {
  generated: string;
  land: ZoneRing[];
  water: ZoneRing[];
  restricted: ZoneRing[];
  /** Known forest / nature-reserve polygons (soft cost, still walkable). */
  vegetation: ZoneRing[];
}

interface RingIndex {
  ring: ZoneRing;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centroidLat: number;
  centroidLng: number;
  areaM2: number;
}

let zones: ZonesData | null = null;
let landIdx: RingIndex[] = [];
let waterIdx: RingIndex[] = [];
let restrictedIdx: RingIndex[] = [];
let vegetationIdx: RingIndex[] = [];
let pending: Promise<ZonesData> | null = null;

function indexRings(rings: ZoneRing[]): RingIndex[] {
  return rings.map((ring) => {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    let sumLat = 0;
    let sumLng = 0;
    for (const [lat, lng] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      sumLat += lat;
      sumLng += lng;
    }
    const n = Math.max(1, ring.length);
    return {
      ring,
      minLat,
      maxLat,
      minLng,
      maxLng,
      centroidLat: sumLat / n,
      centroidLng: sumLng / n,
      areaM2: ringAreaM2(ring),
    };
  });
}

/** Rough m² of a lat/lng ring (shoelace on a local plane). */
function ringAreaM2(ring: ZoneRing): number {
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

function inAny(lat: number, lng: number, indexed: RingIndex[]): boolean {
  for (const r of indexed) {
    if (lat < r.minLat || lat > r.maxLat || lng < r.minLng || lng > r.maxLng) continue;
    if (inPolygon(lat, lng, r.ring)) return true;
  }
  return false;
}

function applyZones(data: ZonesData): ZonesData {
  zones = data;
  landIdx = indexRings(data.land);
  waterIdx = indexRings(data.water);
  restrictedIdx = indexRings(data.restricted);
  vegetationIdx = indexRings(data.vegetation);
  return data;
}

async function loadZones(): Promise<ZonesData> {
  const res = await fetch(`${import.meta.env.BASE_URL}zones.json`);
  if (!res.ok) throw new Error(`zones.json ${res.status}`);
  const data = (await res.json()) as ZonesData;
  if (!Array.isArray(data.land) || data.land.length === 0) {
    throw new Error('zones.json missing land');
  }
  if (!Array.isArray(data.water)) data.water = [];
  if (!Array.isArray(data.restricted)) data.restricted = [];
  if (!Array.isArray(data.vegetation)) data.vegetation = [];
  return applyZones(data);
}

/** Fetch + cache zones. Concurrent callers share one in-flight request. */
export function ensureZonesLoaded(): Promise<ZonesData> {
  if (zones) return Promise.resolve(zones);
  if (!pending) {
    pending = loadZones().catch((err: unknown) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}

export function isZonesLoaded(): boolean {
  return zones !== null;
}

/** Raw rings for the spawn overlay (null until loaded). */
export function getZones(): ZonesData | null {
  return zones;
}

/**
 * Outer rectangle used to shade open sea (land rings punched as holes).
 * Slightly padded past the spawn maxBounds so the wash reaches the edges.
 */
export function seaMaskOuter(): ZoneRing {
  return [
    [SG_BOUNDS.minLat - 0.02, SG_BOUNDS.minLng - 0.02],
    [SG_BOUNDS.minLat - 0.02, SG_BOUNDS.maxLng + 0.02],
    [SG_BOUNDS.maxLat + 0.02, SG_BOUNDS.maxLng + 0.02],
    [SG_BOUNDS.maxLat + 0.02, SG_BOUNDS.minLng - 0.02],
    [SG_BOUNDS.minLat - 0.02, SG_BOUNDS.minLng - 0.02],
  ];
}

/**
 * Classify a point. Prefer calling after `ensureZonesLoaded()`.
 * If zones failed to load, fall back to the coarse country outline only
 * (never invent walkable sea).
 */
export function walkabilityOf(lat: number, lng: number): Walkability {
  if (!inSingapore(lat, lng)) return 'outside';

  if (!zones) {
    // Mask not loaded yet (or bake missing) — country clip only until ensureZonesLoaded.
    return 'ok';
  }

  if (inAny(lat, lng, restrictedIdx)) return 'restricted';
  if (!inAny(lat, lng, landIdx)) return 'water';
  if (inAny(lat, lng, waterIdx)) return 'water';
  return 'ok';
}

export function isWalkable(lat: number, lng: number): boolean {
  return walkabilityOf(lat, lng) === 'ok';
}

/** True when the point sits inside a baked inland water polygon (not open sea). */
export function inInlandWater(lat: number, lng: number): boolean {
  if (!zones || waterIdx.length === 0) return false;
  return inAny(lat, lng, waterIdx);
}

export interface InlandWaterFeature {
  index: number;
  lat: number;
  lng: number;
  areaM2: number;
}

/**
 * Inland water bodies whose bbox reaches `radiusM` of a point.
 * Open sea is not in this list — only `zones.water` rings.
 */
export function inlandWaterFeaturesNear(
  lat: number,
  lng: number,
  radiusM: number,
): InlandWaterFeature[] {
  if (!zones || waterIdx.length === 0) return [];
  const dLat = radiusM / 111000;
  const dLng = radiusM / (111000 * Math.cos((1.35 * Math.PI) / 180));
  const out: InlandWaterFeature[] = [];
  for (let i = 0; i < waterIdx.length; i++) {
    const r = waterIdx[i]!;
    if (
      lat + dLat < r.minLat ||
      lat - dLat > r.maxLat ||
      lng + dLng < r.minLng ||
      lng - dLng > r.maxLng
    ) {
      continue;
    }
    out.push({
      index: i,
      lat: r.centroidLat,
      lng: r.centroidLng,
      areaM2: r.areaM2,
    });
  }
  return out;
}

/** True when the point sits inside a baked forest / nature-reserve polygon. */
export function inVegetation(lat: number, lng: number): boolean {
  if (!zones || vegetationIdx.length === 0) return false;
  return inAny(lat, lng, vegetationIdx);
}

/** Indexed vegetation rings for path sampling (empty until zones load). */
export function vegetationRings(): ZoneRing[] {
  return zones?.vegetation ?? [];
}

/** Short player-facing copy shared by spawn banner and trek log. */
export function unplayableMessage(reason: Walkability, context: 'spawn' | 'trek'): string {
  if (reason === 'ok') return '';
  if (context === 'spawn') {
    if (reason === 'water') return 'Pick dry ground — that spot is open water.';
    if (reason === 'restricted') return 'That ground is sealed off — pick elsewhere.';
    return 'Pick a spot inside Singapore.';
  }
  if (reason === 'water') return "That's open water — you need a shore.";
  if (reason === 'restricted') return "Fenced off. You're not getting in.";
  return "That's off the map.";
}

/** Drop scavengable pins that sit in water or restricted ground. */
export function filterWalkablePois<T extends { lat: number; lng: number }>(pois: T[]): T[] {
  if (!zones) return pois.filter((p) => inSingapore(p.lat, p.lng));
  return pois.filter((p) => isWalkable(p.lat, p.lng));
}
