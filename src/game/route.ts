import { haversine } from './overpass';
import { isWalkable } from './playable';
import { crossingSegmentsAt, crossingsInBox, nearLandCrossing } from './crossings';

/**
 * Land-aware walking routes against the baked walkability mask.
 *
 * Fast path: if the straight chord is dry, return the two endpoints.
 * Otherwise: budgeted local A* on a ~100 m grid with explicit bridge links.
 * Narrow decks need their own nodes so grid alignment cannot strand a player.
 * Caps are hard — prefer
 * "no dry route" over hitching the UI.
 */

export type LatLng = { lat: number; lng: number };

export interface LandRoute {
  points: LatLng[];
  lengthM: number;
}

const CHORD_STEP_M = 70;
const CELL_M = 100;
const MAX_EXPANSIONS = 8000;
const MAX_MS = 8;
const MEMO_CAP = 48;

/** Pad the search corridor around the chord. */
function corridorPadM(chordM: number): number {
  return Math.min(2000, Math.max(1000, chordM * 0.4));
}

export const NO_DRY_ROUTE_MSG = "No dry way across — that water's in the way.";

const DEG_LAT_M = 111_320;

function metersPerDegLng(lat: number): number {
  return DEG_LAT_M * Math.cos((lat * Math.PI) / 180);
}

function pathLengthM(points: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return sum;
}

/** True if any chord sample (or either endpoint) is unwalkable. */
export function pathCrossesUnplayable(from: LatLng, to: LatLng): boolean {
  if (!isWalkable(from.lat, from.lng) || !isWalkable(to.lat, to.lng)) return true;
  return chordCrossesUnplayable(from, to);
}

/** Interior samples only, for A* edges whose endpoints were already checked. */
function chordCrossesUnplayable(from: LatLng, to: LatLng): boolean {
  const dist = haversine(from.lat, from.lng, to.lat, to.lng);
  const stepM = nearLandCrossing(from, to) ? 10 : CHORD_STEP_M;
  const steps = Math.max(1, Math.ceil(dist / stepM));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;
    if (!isWalkable(lat, lng)) return true;
  }
  return false;
}

function memoKey(from: LatLng, to: LatLng): string {
  // A 50 m bucket can contain both bridge deck and water. Keep exact endpoints.
  return `${from.lat},${from.lng}>${to.lat},${to.lng}`;
}

const memo = new Map<string, LandRoute | null>();

function memoGet(key: string): LandRoute | null | undefined {
  if (!memo.has(key)) return undefined;
  // LRU-ish: re-insert to move to end
  const v = memo.get(key)!;
  memo.delete(key);
  memo.set(key, v);
  return v;
}

function memoSet(key: string, value: LandRoute | null): void {
  if (memo.has(key)) memo.delete(key);
  memo.set(key, value);
  while (memo.size > MEMO_CAP) {
    const oldest = memo.keys().next().value;
    if (oldest === undefined) break;
    memo.delete(oldest);
  }
}

/** Clear route memo (tests / zone reload). */
export function clearRouteMemo(): void {
  memo.clear();
}

type HeapItem = { f: number; g: number; i: number; j: number };

/** Binary min-heap on f (then g). */
class MinHeap {
  private data: HeapItem[] = [];

  get size(): number {
    return this.data.length;
  }

  push(item: HeapItem): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapItem | undefined {
    const n = this.data.length;
    if (n === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (n > 1) {
      this.data[0] = last;
      this.sink(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(this.data[i], this.data[p])) break;
      [this.data[i], this.data[p]] = [this.data[p], this.data[i]];
      i = p;
    }
  }

  private sink(i: number): void {
    const n = this.data.length;
    for (;;) {
      let best = i;
      const l = i * 2 + 1;
      const r = l + 1;
      if (l < n && this.less(this.data[l], this.data[best])) best = l;
      if (r < n && this.less(this.data[r], this.data[best])) best = r;
      if (best === i) break;
      [this.data[i], this.data[best]] = [this.data[best], this.data[i]];
      i = best;
    }
  }

  private less(a: HeapItem, b: HeapItem): boolean {
    return a.f < b.f || (a.f === b.f && a.g < b.g);
  }
}

const NEIGHBORS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

function cellKey(i: number, j: number): number {
  // Pack into 32-bit; corridor stays well under 2^15 per axis
  return (i << 16) | (j & 0xffff);
}

/**
 * A* inside a padded AABB around from→to. Undefined means a transient timeout;
 * null means unreachable or over the deterministic size/expansion caps.
 */
function astarLand(from: LatLng, to: LatLng, deterministic = false): LandRoute | null | undefined {
  const t0 = performance.now();
  const chord = haversine(from.lat, from.lng, to.lat, to.lng);
  const pad = corridorPadM(chord);
  const midLat = (from.lat + to.lat) / 2;
  const mLng = metersPerDegLng(midLat);
  const dLat = CELL_M / DEG_LAT_M;
  const dLng = CELL_M / mLng;

  const minLat = Math.min(from.lat, to.lat) - pad / DEG_LAT_M;
  const maxLat = Math.max(from.lat, to.lat) + pad / DEG_LAT_M;
  const minLng = Math.min(from.lng, to.lng) - pad / mLng;
  const maxLng = Math.max(from.lng, to.lng) + pad / mLng;

  const originLat = minLat;
  const originLng = minLng;
  const rows = Math.ceil((maxLat - minLat) / dLat) + 1;
  const cols = Math.ceil((maxLng - minLng) / dLng) + 1;
  if (rows * cols > MAX_EXPANSIONS * 4) {
    // Corridor itself is too big to search under budget — refuse.
    return null;
  }

  const toCell = (p: LatLng): { i: number; j: number } => ({
    i: Math.round((p.lat - originLat) / dLat),
    j: Math.round((p.lng - originLng) / dLng),
  });

  // Negative row indices address exact endpoints / crossing vertices, leaving
  // ordinary grid keys unchanged. They share the same heap and search budget.
  const exactPoints: LatLng[] = [from, to];
  const gridAttachments = new Set([0, 1]);
  const cellCenter = (i: number, j: number): LatLng => i < 0 ? exactPoints[-i - 1] : ({
    lat: originLat + i * dLat,
    lng: originLng + j * dLng,
  });

  const walkCache = new Map<number, boolean>();
  const walkable = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= rows || j >= cols) return false;
    const k = cellKey(i, j);
    let w = walkCache.get(k);
    if (w === undefined) {
      const c = cellCenter(i, j);
      w = isWalkable(c.lat, c.lng);
      walkCache.set(k, w);
    }
    return w;
  };

  type Link = { i: number; j: number; cost: number };
  const links = new Map<number, Link[]>();
  const addLink = (ai: number, aj: number, bi: number, bj: number, cost: number): void => {
    const key = cellKey(ai, aj);
    const list = links.get(key);
    const next = { i: bi, j: bj, cost };
    if (list) list.push(next);
    else links.set(key, [next]);
  };
  /** Exact-node links; each is validated once, when the search first uses it. */
  const connect = (ai: number, aj: number, bi: number, bj: number): void => {
    const a = cellCenter(ai, aj);
    const b = cellCenter(bi, bj);
    const cost = haversine(a.lat, a.lng, b.lat, b.lng) / CELL_M;
    addLink(ai, aj, bi, bj, cost);
    addLink(bi, bj, ai, aj, cost);
  };
  const linkOk = new Map<string, boolean>();
  const exactLinkOk = (ak: number, l: Link): boolean => {
    const bk = cellKey(l.i, l.j);
    const key = ak < bk ? `${ak}:${bk}` : `${bk}:${ak}`;
    let ok = linkOk.get(key);
    if (ok === undefined) {
      ok = !pathCrossesUnplayable(cellCenter(ak >> 16, ak & 0xffff), cellCenter(l.i, l.j));
      linkOk.set(key, ok);
    }
    return ok;
  };

  // Each deck is a chain of exact nodes. Nothing is validated up front: deck
  // links and links to the land grid are tested when the search reaches
  // them, so a corridor full of bridges stays cheap.
  const deckEnds: number[] = [];
  for (const crossing of crossingsInBox(minLat, maxLat, minLng, maxLng)) {
    const offset = exactPoints.length;
    exactPoints.push(...crossing.points);
    gridAttachments.add(offset);
    gridAttachments.add(exactPoints.length - 1);
    deckEnds.push(offset, exactPoints.length - 1);
    for (let n = offset + 1; n < exactPoints.length; n++) connect(-n, 0, -n - 1, 0);
    // A trek may begin or end mid-span, far from any deck vertex.
    for (let endpoint = 0; endpoint < 2; endpoint++) {
      const e = exactPoints[endpoint];
      for (const hit of crossingSegmentsAt(e.lat, e.lng)) {
        if (hit.crossing !== crossing) continue;
        connect(-endpoint - 1, 0, -(offset + hit.seg - 1) - 1, 0);
        connect(-endpoint - 1, 0, -(offset + hit.seg) - 1, 0);
      }
    }
  }

  // Deck ends that meet mid-span (a T-junction, or a deck split into ways the
  // bake could not stitch) link to each other and to nearby trek endpoints.
  const JOIN_M = 30;
  const attachNear = [0, 1, ...deckEnds];
  for (let x = 0; x < attachNear.length; x++) {
    for (let y = x + 1; y < attachNear.length; y++) {
      const a = attachNear[x];
      const b = attachNear[y];
      if (a < 2 && b < 2) continue;
      const pa = exactPoints[a];
      const pb = exactPoints[b];
      const limit = a < 2 ? CELL_M * 1.5 : JOIN_M;
      if (haversine(pa.lat, pa.lng, pb.lat, pb.lng) <= limit) connect(-a - 1, 0, -b - 1, 0);
    }
  }

  // Grid cell → exact nodes it may link to, and the reverse. Validated on use.
  const gridToExact = new Map<number, number[]>();
  const exactToGrid = new Map<number, { i: number; j: number }[]>();
  for (const n of gridAttachments) {
    const c = toCell(exactPoints[n]);
    const cells: { i: number; j: number }[] = [];
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const i = c.i + di;
        const j = c.j + dj;
        if (i < 0 || j < 0 || i >= rows || j >= cols) continue;
        cells.push({ i, j });
        const k = cellKey(i, j);
        const list = gridToExact.get(k);
        if (list) list.push(n);
        else gridToExact.set(k, [n]);
      }
    }
    exactToGrid.set(cellKey(-n - 1, 0), cells);
  }
  const lazyOk = new Map<string, boolean>();
  /** Exact node n ↔ grid cell (i, j): dry chord, cached per pair. */
  const attachOk = (n: number, i: number, j: number): boolean => {
    const key = `${n}:${i}:${j}`;
    let ok = lazyOk.get(key);
    if (ok === undefined) {
      const p = exactPoints[n];
      ok = walkable(i, j) && isWalkable(p.lat, p.lng) &&
        !chordCrossesUnplayable(p, cellCenter(i, j));
      lazyOk.set(key, ok);
    }
    return ok;
  };

  const s0 = { i: -1, j: 0 };
  const g0 = { i: -2, j: 0 };
  const heuristic = (i: number, j: number) => {
    const p = cellCenter(i, j);
    return haversine(p.lat, p.lng, to.lat, to.lng) / CELL_M;
  };

  const open = new MinHeap();
  const gScore = new Map<number, number>();
  const came = new Map<number, number>(); // childKey -> parentKey
  const startK = cellKey(s0.i, s0.j);
  gScore.set(startK, 0);
  open.push({ f: heuristic(s0.i, s0.j), g: 0, i: s0.i, j: s0.j });

  let expansions = 0;

  while (open.size > 0) {
    if (expansions >= MAX_EXPANSIONS) return null;
    if (!deterministic && performance.now() - t0 >= MAX_MS) return undefined;
    const cur = open.pop()!;
    const curK = cellKey(cur.i, cur.j);
    const knownG = gScore.get(curK);
    if (knownG !== undefined && cur.g > knownG) continue; // stale heap entry
    expansions++;

    if (cur.i === g0.i && cur.j === g0.j) {
      const cells: { i: number; j: number }[] = [{ i: cur.i, j: cur.j }];
      let k: number | undefined = curK;
      while (k !== undefined && k !== startK) {
        const pk = came.get(k);
        if (pk === undefined) break;
        cells.push({ i: pk >> 16, j: pk & 0xffff });
        k = pk;
      }
      cells.reverse();
      const points = cells.map((c) => cellCenter(c.i, c.j));
      const simplified = simplifyCollinear(points);
      return { points: simplified, lengthM: Math.round(pathLengthM(simplified)) };
    }

    const next: Link[] = (links.get(curK) ?? []).filter((l) => exactLinkOk(curK, l));
    if (cur.i < 0) {
      const n = -cur.i - 1;
      for (const c of exactToGrid.get(curK) ?? []) {
        if (attachOk(n, c.i, c.j)) {
          const p = exactPoints[n];
          const q = cellCenter(c.i, c.j);
          next.push({ i: c.i, j: c.j, cost: haversine(p.lat, p.lng, q.lat, q.lng) / CELL_M });
        }
      }
    } else {
      const here = cellCenter(cur.i, cur.j);
      for (const n of gridToExact.get(curK) ?? []) {
        if (attachOk(n, cur.i, cur.j)) {
          const p = exactPoints[n];
          next.push({ i: -n - 1, j: 0, cost: haversine(p.lat, p.lng, here.lat, here.lng) / CELL_M });
        }
      }
    }
    for (const [di, dj, cost] of cur.i < 0 ? [] : NEIGHBORS) {
      const ni = cur.i + di;
      const nj = cur.j + dj;
      if (!walkable(ni, nj)) continue;
      // No corner-cutting through blocked diagonals
      if (di !== 0 && dj !== 0) {
        if (!walkable(cur.i + di, cur.j) || !walkable(cur.i, cur.j + dj)) continue;
      }
      next.push({ i: ni, j: nj, cost });
    }
    for (const { i: ni, j: nj, cost } of next) {
      const nk = cellKey(ni, nj);
      const tentative = cur.g + cost;
      const prev = gScore.get(nk);
      if (prev !== undefined && tentative >= prev) continue;
      // Only sample a grid edge when it can improve the route. Exact-node links
      // were validated above, and walkable() cached the grid endpoints.
      if (cur.i >= 0 && ni >= 0 &&
          chordCrossesUnplayable(cellCenter(cur.i, cur.j), cellCenter(ni, nj))) continue;
      gScore.set(nk, tentative);
      came.set(nk, curK);
      open.push({ f: tentative + heuristic(ni, nj), g: tentative, i: ni, j: nj });
    }
  }

  return null;
}

/** Drop middle points that sit nearly on the segment between neighbors. */
function simplifyCollinear(points: LatLng[]): LatLng[] {
  if (points.length <= 2) return points;
  const out: LatLng[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const ab = haversine(a.lat, a.lng, b.lat, b.lng);
    const bc = haversine(b.lat, b.lng, c.lat, c.lng);
    const ac = haversine(a.lat, a.lng, c.lat, c.lng);
    // If B barely detours from AC, drop it
    // Keep deck / shore vertices: even a tiny shortcut can leave a narrow bridge.
    if (ab + bc - ac < CELL_M * 0.35 && !nearLandCrossing(a, c) &&
        !pathCrossesUnplayable(a, c)) continue;
    out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Land-only walking path from `from` to `to`.
 * - Straight chord when dry.
 * - Detoured polyline when water/restricted blocks the chord.
 * - `null` when unreachable or the A* budget is exhausted (fail closed).
 */
export function routeLandPath(from: LatLng, to: LatLng, opts?: { deterministic?: boolean }): LandRoute | null {
  const key = memoKey(from, to);
  const cached = memoGet(key);
  if (cached !== undefined) return cached;

  if (!isWalkable(from.lat, from.lng) || !isWalkable(to.lat, to.lng)) {
    memoSet(key, null);
    return null;
  }

  if (!pathCrossesUnplayable(from, to)) {
    const lengthM = Math.round(haversine(from.lat, from.lng, to.lat, to.lng));
    const route: LandRoute = { points: [from, to], lengthM };
    memoSet(key, route);
    return route;
  }

  // Seeded objective generation uses the same expansion cap without depending
  // on frame speed; interactive map previews retain their wall-clock budget.
  const routed = astarLand(from, to, opts?.deterministic);
  // A busy frame is not proof that no route exists. Let the next request retry.
  if (routed === undefined) return null;
  memoSet(key, routed);
  return routed;
}

/** Sum of segment lengths along a polyline. */
export function polylineLengthM(points: LatLng[]): number {
  return Math.round(pathLengthM(points));
}

/**
 * Sample points along a polyline every `stepM` metres (plus endpoints).
 * Used by hazard path checks so wilds risk follows the land route.
 */
export function samplePolyline(points: LatLng[], stepM = CHORD_STEP_M): LatLng[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];
  const out: LatLng[] = [{ ...points[0] }];
  for (let s = 1; s < points.length; s++) {
    const a = points[s - 1];
    const b = points[s];
    const dist = haversine(a.lat, a.lng, b.lat, b.lng);
    const steps = Math.max(1, Math.ceil(dist / stepM));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      });
    }
  }
  return out;
}

/** Segment lengths + total for distance-weighted progress along `points`. */
function pathSegMetrics(points: LatLng[]): { segs: number[]; total: number } {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    segs.push(d);
    total += d;
  }
  return { segs, total };
}

/**
 * Position along a polyline at progress `t` in [0,1], weighted by distance.
 */
export function pointAlongPath(points: LatLng[], t: number): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  if (points.length === 1 || t <= 0) return { ...points[0] };
  if (t >= 1) return { ...points[points.length - 1] };

  const { segs, total } = pathSegMetrics(points);
  if (total <= 0) return { ...points[points.length - 1] };

  let remain = t * total;
  for (let i = 0; i < segs.length; i++) {
    const d = segs[i];
    if (remain <= d || i === segs.length - 1) {
      const u = d > 0 ? Math.min(1, remain / d) : 1;
      const a = points[i];
      const b = points[i + 1];
      return {
        lat: a.lat + (b.lat - a.lat) * u,
        lng: a.lng + (b.lng - a.lng) * u,
      };
    }
    remain -= d;
  }
  return { ...points[points.length - 1] };
}

/**
 * Vertices from the start of the polyline through progress `t` (inclusive),
 * ending at the interpolated point. Used by the en-route trail.
 */
export function pathUntil(points: LatLng[], t: number): LatLng[] {
  if (points.length === 0) return [];
  if (points.length === 1 || t <= 0) return [{ ...points[0] }];
  if (t >= 1) return points.map((p) => ({ ...p }));

  const { segs, total } = pathSegMetrics(points);
  if (total <= 0) return [{ ...points[points.length - 1] }];

  let remain = t * total;
  const out: LatLng[] = [{ ...points[0] }];
  for (let i = 0; i < segs.length; i++) {
    const d = segs[i];
    if (remain <= d || i === segs.length - 1) {
      const u = d > 0 ? Math.min(1, remain / d) : 1;
      if (u > 0) {
        const a = points[i];
        const b = points[i + 1];
        out.push({
          lat: a.lat + (b.lat - a.lat) * u,
          lng: a.lng + (b.lng - a.lng) * u,
        });
      }
      return out;
    }
    out.push({ ...points[i + 1] });
    remain -= d;
  }
  return out;
}

/**
 * Vertices from progress `t` (inclusive) through the end of the polyline.
 * Used by the en-route "ahead" dash.
 */
export function pathFromProgress(points: LatLng[], t: number): LatLng[] {
  if (points.length === 0) return [];
  if (t <= 0) return points.map((p) => ({ ...p }));
  if (points.length === 1 || t >= 1) return [{ ...points[points.length - 1] }];

  const { segs, total } = pathSegMetrics(points);
  if (total <= 0) return [{ ...points[points.length - 1] }];

  let remain = t * total;
  for (let i = 0; i < segs.length; i++) {
    const d = segs[i];
    if (remain <= d || i === segs.length - 1) {
      const u = d > 0 ? Math.min(1, remain / d) : 1;
      const a = points[i];
      const b = points[i + 1];
      const along: LatLng = {
        lat: a.lat + (b.lat - a.lat) * u,
        lng: a.lng + (b.lng - a.lng) * u,
      };
      const out: LatLng[] = [{ ...along }];
      for (let j = i + 1; j < points.length; j++) out.push({ ...points[j] });
      return out;
    }
    remain -= d;
  }
  return [{ ...points[points.length - 1] }];
}
