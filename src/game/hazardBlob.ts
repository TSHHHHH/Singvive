import type { HazardDisc, HazardKind, HazardZone } from './wilds';

/**
 * Visual union of discs. Nearby circles of the same kind become one silhouette
 * so the map does not read as a stack of rings. Hit-testing still uses discs.
 */

const M_PER_DEG_LAT = 111000;
const REF_LAT = 1.35;
const M_PER_DEG_LNG = 111000 * Math.cos((REF_LAT * Math.PI) / 180);

const SAMPLE_N = 48;
/** Nearby pockets of the same kind share a silhouette. */
const CLUSTER_GAP_M = 90;

interface Circle {
  x: number;
  y: number;
  r: number;
}

interface Pt {
  x: number;
  y: number;
}

export interface HazardBlobDraw {
  key: string;
  kind: HazardKind;
  onPath: boolean;
  severity: number;
  rings: [number, number][][];
}

function toXY(lat: number, lng: number, oLat: number, oLng: number): Pt {
  return {
    x: (lng - oLng) * M_PER_DEG_LNG,
    y: (lat - oLat) * M_PER_DEG_LAT,
  };
}

function toLatLng(p: Pt, oLat: number, oLng: number): [number, number] {
  return [oLat + p.y / M_PER_DEG_LAT, oLng + p.x / M_PER_DEG_LNG];
}

function discsOf(z: HazardZone): HazardDisc[] {
  return z.discs.length > 0 ? z.discs : [{ lat: z.lat, lng: z.lng, radiusM: z.radiusM }];
}

function discsTouch(a: HazardDisc, b: HazardDisc, extraM: number): boolean {
  const pb = toXY(b.lat, b.lng, a.lat, a.lng);
  const reach = a.radiusM + b.radiusM + extraM;
  return pb.x * pb.x + pb.y * pb.y <= reach * reach;
}

function zonesTouch(a: HazardZone, b: HazardZone, extraM: number): boolean {
  const da = discsOf(a);
  const db = discsOf(b);
  for (const x of da) {
    for (const y of db) {
      if (discsTouch(x, y, extraM)) return true;
    }
  }
  return false;
}

function clusterZones(zones: HazardZone[]): HazardZone[][] {
  const n = zones.length;
  const parent = zones.map((_, i) => i);
  const find = (i: number): number => {
    let p = i;
    while (parent[p] !== p) p = parent[p];
    let cur = i;
    while (parent[cur] !== p) {
      const next = parent[cur];
      parent[cur] = p;
      cur = next;
    }
    return p;
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (zones[i].kind !== zones[j].kind) continue;
      if (zonesTouch(zones[i], zones[j], CLUSTER_GAP_M)) union(i, j);
    }
  }

  const groups = new Map<number, HazardZone[]>();
  for (let i = 0; i < n; i++) {
    const p = find(i);
    const g = groups.get(p);
    if (g) g.push(zones[i]);
    else groups.set(p, [zones[i]]);
  }
  return [...groups.values()];
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHull(pts: Pt[]): Pt[] {
  if (pts.length <= 2) return pts.slice();
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Pt[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) {
      lower.pop();
    }
    lower.push(pt);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) {
      upper.pop();
    }
    upper.push(pt);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function sampleCircumference(c: Circle, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r });
  }
  return out;
}

function insideOther(p: Pt, self: Circle, circles: Circle[]): boolean {
  for (const o of circles) {
    if (o === self) continue;
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    if (dx * dx + dy * dy < o.r * o.r - 1) return true;
  }
  return false;
}

/**
 * Outer silhouette of a disc cluster: drop samples that sit inside another
 * disc, then take the convex hull so overlapping rings become one outline.
 */
function unionRing(circles: Circle[]): Pt[] {
  if (circles.length === 1) return sampleCircumference(circles[0], SAMPLE_N);

  const outer: Pt[] = [];
  for (const c of circles) {
    for (const p of sampleCircumference(c, SAMPLE_N)) {
      if (!insideOther(p, c, circles)) outer.push(p);
    }
  }
  const hull = convexHull(outer.length >= 8 ? outer : circles.flatMap((c) => sampleCircumference(c, SAMPLE_N)));
  return hull.length >= 3 ? hull : sampleCircumference(circles[0], SAMPLE_N);
}

export function hazardBlobRings(discs: HazardDisc[]): [number, number][][] {
  if (discs.length === 0) return [];
  const oLat = discs[0].lat;
  const oLng = discs[0].lng;
  const circles: Circle[] = discs.map((d) => {
    const p = toXY(d.lat, d.lng, oLat, oLng);
    return { x: p.x, y: p.y, r: Math.max(8, d.radiusM) };
  });
  return [unionRing(circles).map((p) => toLatLng(p, oLat, oLng))];
}

/** Same-kind pockets that overlap (or nearly do) share one fused silhouette. */
export function hazardBlobDrawList(
  zones: HazardZone[],
  pathIds: ReadonlySet<string>,
): HazardBlobDraw[] {
  return clusterZones(zones).map((group) => {
    const discs = group.flatMap(discsOf);
    let severity = 1;
    let onPath = false;
    for (const z of group) {
      if (z.severity > severity) severity = z.severity;
      if (pathIds.has(z.id)) onPath = true;
    }
    return {
      key: group.map((z) => z.id).join('+'),
      kind: group[0].kind,
      onPath,
      severity,
      rings: hazardBlobRings(discs),
    };
  });
}
