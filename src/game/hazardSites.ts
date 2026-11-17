/**
 * Real places the wilds field can turn into a hazard zone: school campuses,
 * hawker centres, MRT stations, estates. Baked by `npm run bake:hazard-sites`
 * into `public/hazard-sites.json` from the committed POI bake.
 *
 * Pure data + geometry. The browser loads the file alongside zones.json
 * (see `ensureZonesLoaded` in playable.ts), so the field only ever sees sites
 * once both are in — exactly the gate vegetation already uses.
 */

export type HazardSiteCategory =
  | 'school'
  | 'hospital'
  | 'foodcourt'
  | 'supermarket'
  | 'mrt'
  | 'industrial'
  | 'police'
  | 'residential';

export interface HazardSite {
  /** OSM id — the POI bake carries the name. */
  id: string;
  category: HazardSiteCategory;
  /** Convex hull of the footprint, [lat, lng], counter-clockwise. */
  hull: [number, number][];
  lat: number;
  lng: number;
}

export interface HazardSitesFile {
  generated: string;
  revision: string;
  categories: string[];
  /** [osmId, categoryIndex, lat5, lng5, dLat5, dLng5, ...] */
  sites: (string | number)[][];
}

const KNOWN: ReadonlySet<string> = new Set<HazardSiteCategory>([
  'school',
  'hospital',
  'foodcourt',
  'supermarket',
  'mrt',
  'industrial',
  'police',
  'residential',
]);

let sites: HazardSite[] = [];
const byId = new Map<string, HazardSite>();
const cellIndex = new Map<number, Map<string, HazardSite[]>>();

export function decodeHazardSites(data: HazardSitesFile): HazardSite[] {
  const out: HazardSite[] = [];
  for (const row of data.sites) {
    const [id, catIdx, ...nums] = row;
    const category = data.categories[catIdx as number];
    if (typeof id !== 'string' || !KNOWN.has(category) || nums.length < 6) continue;
    const hull: [number, number][] = [];
    let lat = 0;
    let lng = 0;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      lat += nums[i] as number;
      lng += nums[i + 1] as number;
      hull.push([lat / 1e5, lng / 1e5]);
    }
    let cLat = 0;
    let cLng = 0;
    for (const [a, b] of hull) {
      cLat += a;
      cLng += b;
    }
    out.push({
      id,
      category: category as HazardSiteCategory,
      hull,
      lat: cLat / hull.length,
      lng: cLng / hull.length,
    });
  }
  return out;
}

export function installHazardSites(data: HazardSitesFile | HazardSite[]): void {
  sites = Array.isArray(data) ? data : decodeHazardSites(data);
  byId.clear();
  for (const s of sites) byId.set(s.id, s);
  cellIndex.clear();
}

export function hazardSiteById(id: string): HazardSite | undefined {
  return byId.get(id);
}

export function hazardSiteCount(): number {
  return sites.length;
}

const M_PER_DEG_LAT = 111000;
const REF_LAT = 1.35;
const M_PER_DEG_LNG = 111000 * Math.cos((REF_LAT * Math.PI) / 180);

/**
 * Sites whose centroid falls in grid cell (cx, cy) of edge `cellM`, sorted by
 * id so a seeded pick is stable across loads.
 */
export function hazardSitesInCell(cx: number, cy: number, cellM: number): readonly HazardSite[] {
  let grid = cellIndex.get(cellM);
  if (!grid) {
    grid = new Map();
    for (const s of sites) {
      const key = `${Math.floor((s.lng * M_PER_DEG_LNG) / cellM)}:${Math.floor((s.lat * M_PER_DEG_LAT) / cellM)}`;
      const list = grid.get(key);
      if (list) list.push(s);
      else grid.set(key, [s]);
    }
    for (const list of grid.values()) list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    cellIndex.set(cellM, grid);
  }
  return grid.get(`${cx}:${cy}`) ?? [];
}

/** Same-category neighbours within `gapM` of `site` (centroid to centroid), sorted by id. */
export function hazardSiteNeighbours(site: HazardSite, gapM: number, cellM: number): HazardSite[] {
  const cx = Math.floor((site.lng * M_PER_DEG_LNG) / cellM);
  const cy = Math.floor((site.lat * M_PER_DEG_LAT) / cellM);
  const out: HazardSite[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const s of hazardSitesInCell(cx + dx, cy + dy, cellM)) {
        if (s === site || s.category !== site.category) continue;
        const ex = (s.lng - site.lng) * M_PER_DEG_LNG;
        const ey = (s.lat - site.lat) * M_PER_DEG_LAT;
        if (ex * ex + ey * ey <= gapM * gapM) out.push(s);
      }
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// --- convex shape geometry (shared by hit-test and drawing) ----------------

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Convex hull in local metres ([x, y]), counter-clockwise. */
function hullXY(pts: [number, number][]): [number, number][] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** One hull around every vertex of every site, in [lat, lng]. */
export function mergedHull(group: readonly HazardSite[]): [number, number][] {
  const oLat = group[0].lat;
  const oLng = group[0].lng;
  const pts: [number, number][] = [];
  for (const s of group) {
    for (const [lat, lng] of s.hull) pts.push([(lng - oLng) * M_PER_DEG_LNG, (lat - oLat) * M_PER_DEG_LAT]);
  }
  return hullXY(pts).map(([x, y]) => [oLat + y / M_PER_DEG_LAT, oLng + x / M_PER_DEG_LNG]);
}

/**
 * Metres from a point to the edge of `hull` grown by `bufferM`. Zero or less
 * means inside. Exact for a convex hull: inside the polygon, or within
 * `bufferM` of one of its edges.
 */
export function bufferedHullDistance(
  lat: number,
  lng: number,
  hull: readonly [number, number][],
  bufferM: number,
): number {
  const px = lng * M_PER_DEG_LNG;
  const py = lat * M_PER_DEG_LAT;
  let inside = hull.length >= 3;
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ax = a[1] * M_PER_DEG_LNG;
    const ay = a[0] * M_PER_DEG_LAT;
    const bx = b[1] * M_PER_DEG_LNG;
    const by = b[0] * M_PER_DEG_LAT;
    const ex = bx - ax;
    const ey = by - ay;
    // Counter-clockwise ring: a point on the right of any edge is outside.
    if (ex * (py - ay) - ey * (px - ax) < 0) inside = false;
    const len2 = ex * ex + ey * ey;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len2)) : 0;
    const dx = px - (ax + ex * t);
    const dy = py - (ay + ey * t);
    best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
  }
  if (inside) return -bufferM - best;
  return best - bufferM;
}

/**
 * Outline of the hull grown by `bufferM`: each corner swept by a circle, then
 * hulled. Same shape `bufferedHullDistance` tests against.
 */
export function bufferedHullRing(
  hull: readonly [number, number][],
  bufferM: number,
  steps = 10,
): [number, number][] {
  const oLat = hull[0][0];
  const oLng = hull[0][1];
  const pts: [number, number][] = [];
  const n = Math.max(8, steps * 4);
  for (const [lat, lng] of hull) {
    const x = (lng - oLng) * M_PER_DEG_LNG;
    const y = (lat - oLat) * M_PER_DEG_LAT;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([x + Math.cos(a) * bufferM, y + Math.sin(a) * bufferM]);
    }
  }
  return hullXY(pts).map(([x, y]) => [oLat + y / M_PER_DEG_LAT, oLng + x / M_PER_DEG_LNG]);
}
