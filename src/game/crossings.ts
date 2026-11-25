/**
 * Walkable decks that the coastline / water mask cannot represent.
 *
 * Two sources: `MANUAL_CROSSINGS` (hand-placed below) and the bridges baked
 * into `zones.json` by `npm run bake:crossings`. `installCrossings` merges
 * them and builds a grid index; `playable.installZones` calls it.
 * Keep decks narrow: a crossing makes its deck walkable, not the water
 * around it. Restricted ground still takes precedence in playable.ts.
 */

export interface LandCrossing {
  id: string;
  halfWidthM: number;
  points: { lat: number; lng: number }[];
}

/** Baked shape in zones.json: compact `[lat, lng]` pairs. */
export interface BakedCrossing {
  id: number;
  halfWidthM: number;
  points: [number, number][];
}

export const MANUAL_CROSSINGS: LandCrossing[] = [
  {
    id: 'sentosa-gateway',
    halfWidthM: 12,
    // OpenStreetMap contributors (ODbL), retrieved 2026-11-14:
    // https://www.openstreetmap.org/way/689975819
    // https://www.openstreetmap.org/way/689988553
    // https://www.openstreetmap.org/way/689988555
    // https://www.openstreetmap.org/way/1329663765
    // South → north; include the approaches inside the committed land mask.
    points: [
      { lat: 1.2565696, lng: 103.8236330 },
      { lat: 1.2569194, lng: 103.8236392 },
      { lat: 1.2571009, lng: 103.8236396 },
      { lat: 1.2572902, lng: 103.8236348 },
      { lat: 1.2576484, lng: 103.8236085 },
      { lat: 1.2586350, lng: 103.8236335 },
      { lat: 1.2590237, lng: 103.8236418 },
      { lat: 1.2596923, lng: 103.8236701 },
      { lat: 1.2600364, lng: 103.8236756 },
      { lat: 1.2601392, lng: 103.8236345 },
      { lat: 1.2602448, lng: 103.8236095 },
      { lat: 1.2607160, lng: 103.8236205 },
      { lat: 1.2608568, lng: 103.8236164 },
      { lat: 1.2611175, lng: 103.8236091 },
      { lat: 1.2615795, lng: 103.8236204 },
      { lat: 1.2618611, lng: 103.8236285 },
      { lat: 1.2621614, lng: 103.8236338 },
      { lat: 1.2624658, lng: 103.8236298 },
      { lat: 1.2630549, lng: 103.8236248 },
      { lat: 1.2631685, lng: 103.8236239 },
    ],
  },
];

const M_LAT = 111_320;
const M_LNG = M_LAT * Math.cos((1.35 * Math.PI) / 180);
/** ~220 m cells: a Kallang-sized cluster of decks stays a short list per cell. */
const GRID_DEG = 0.002;
const ORIGIN_LAT = 1.1;
const ORIGIN_LNG = 103.5;

interface IndexedCrossing extends LandCrossing {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

let all: IndexedCrossing[] = [];
let grid = new Map<number, number[]>();

const cellX = (lng: number) => Math.floor((lng - ORIGIN_LNG) / GRID_DEG);
const cellY = (lat: number) => Math.floor((lat - ORIGIN_LAT) / GRID_DEG);
const cellKey = (ix: number, iy: number) => iy * 8192 + ix;

function indexCrossing(c: LandCrossing): IndexedCrossing {
  const lats = c.points.map((p) => p.lat);
  const lngs = c.points.map((p) => p.lng);
  return {
    ...c,
    minLat: Math.min(...lats) - c.halfWidthM / M_LAT,
    maxLat: Math.max(...lats) + c.halfWidthM / M_LAT,
    minLng: Math.min(...lngs) - c.halfWidthM / M_LNG,
    maxLng: Math.max(...lngs) + c.halfWidthM / M_LNG,
  };
}

/** Replace the crossing set: the manual list plus the baked bridges. */
export function installCrossings(baked: readonly BakedCrossing[] = []): void {
  const list: LandCrossing[] = [...MANUAL_CROSSINGS];
  for (const b of baked) {
    if (!Array.isArray(b.points) || b.points.length < 2) continue;
    list.push({
      id: `osm-${b.id}`,
      halfWidthM: b.halfWidthM,
      points: b.points.map(([lat, lng]) => ({ lat, lng })),
    });
  }
  all = list.map(indexCrossing);
  grid = new Map();
  all.forEach((c, i) => {
    for (let iy = cellY(c.minLat); iy <= cellY(c.maxLat); iy++) {
      for (let ix = cellX(c.minLng); ix <= cellX(c.maxLng); ix++) {
        const k = cellKey(ix, iy);
        const cell = grid.get(k);
        if (cell) cell.push(i);
        else grid.set(k, [i]);
      }
    }
  });
}

installCrossings();

/** Every installed crossing (manual + baked). */
export function landCrossings(): readonly LandCrossing[] {
  return all;
}

function onCrossing(c: IndexedCrossing, lat: number, lng: number): number {
  if (lat < c.minLat || lat > c.maxLat || lng < c.minLng || lng > c.maxLng) return -1;
  for (let i = 1; i < c.points.length; i++) {
    const a = c.points[i - 1];
    const b = c.points[i];
    const dx = (b.lng - a.lng) * M_LNG;
    const dy = (b.lat - a.lat) * M_LAT;
    const px = (lng - a.lng) * M_LNG;
    const py = (lat - a.lat) * M_LAT;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSq));
    if ((px - t * dx) ** 2 + (py - t * dy) ** 2 <= c.halfWidthM ** 2) return i;
  }
  return -1;
}

/** Grid lookup, then metre-scale point-to-segment checks. */
export function onLandCrossing(lat: number, lng: number): boolean {
  const cell = grid.get(cellKey(cellX(lng), cellY(lat)));
  if (!cell) return false;
  for (const i of cell) if (onCrossing(all[i]!, lat, lng) >= 0) return true;
  return false;
}

/**
 * Deck segments under a point: the crossing and the index of the segment's
 * far vertex. A trek may start or end mid-span, far from any vertex.
 */
export function crossingSegmentsAt(lat: number, lng: number): { crossing: LandCrossing; seg: number }[] {
  const cell = grid.get(cellKey(cellX(lng), cellY(lat)));
  if (!cell) return [];
  const out: { crossing: LandCrossing; seg: number }[] = [];
  for (const i of cell) {
    const seg = onCrossing(all[i]!, lat, lng);
    if (seg >= 0) out.push({ crossing: all[i]!, seg });
  }
  return out;
}

type Pt = { lat: number; lng: number };

/** Squared metres from p to segment ab, in a local plane at a. */
function pointSegSq(p: Pt, a: Pt, b: Pt): number {
  const dx = (b.lng - a.lng) * M_LNG;
  const dy = (b.lat - a.lat) * M_LAT;
  const px = (p.lng - a.lng) * M_LNG;
  const py = (p.lat - a.lat) * M_LAT;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSq));
  return (px - t * dx) ** 2 + (py - t * dy) ** 2;
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
}

/** Squared metres between segments ab and cd (0 when they cross). */
function segSegSq(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSegSq(a, c, d), pointSegSq(b, c, d), pointSegSq(c, a, b), pointSegSq(d, a, b));
}

/** The chord a→b passes through crossing c's deck capsule. */
function chordTouches(c: IndexedCrossing, a: Pt, b: Pt): boolean {
  const r2 = c.halfWidthM ** 2;
  for (let i = 1; i < c.points.length; i++) {
    if (segSegSq(a, b, c.points[i - 1], c.points[i]) <= r2) return true;
  }
  return false;
}

/**
 * Use finer chord checks only where the chord meets a deck. A coarse sample
 * could land on the deck and miss the water either side of it.
 */
export function nearLandCrossing(a: Pt, b: Pt): boolean {
  const minLat = Math.min(a.lat, b.lat);
  const maxLat = Math.max(a.lat, b.lat);
  const minLng = Math.min(a.lng, b.lng);
  const maxLng = Math.max(a.lng, b.lng);
  const hit = (c: IndexedCrossing) =>
    maxLat >= c.minLat && minLat <= c.maxLat && maxLng >= c.minLng && minLng <= c.maxLng && chordTouches(c, a, b);
  const x0 = cellX(minLng);
  const x1 = cellX(maxLng);
  const y0 = cellY(minLat);
  const y1 = cellY(maxLat);
  // A long chord: scan the list once instead of hundreds of cells.
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > all.length) return all.some(hit);
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const cell = grid.get(cellKey(ix, iy));
      if (!cell) continue;
      for (const i of cell) if (hit(all[i]!)) return true;
    }
  }
  return false;
}

/** Crossings whose every vertex sits inside the box (route search corridor). */
export function crossingsInBox(minLat: number, maxLat: number, minLng: number, maxLng: number): LandCrossing[] {
  return all.filter((c) => c.minLat >= minLat && c.maxLat <= maxLat && c.minLng >= minLng && c.maxLng <= maxLng);
}
