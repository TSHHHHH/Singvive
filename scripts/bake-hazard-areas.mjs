// Hazard areas: block-sized OpenStreetMap outlines (estates, parks, school
// grounds, campuses, hospitals, commercial and industrial blocks) that the
// wilds field can seal off as a whole: a Dark-Zone-style quarantined estate,
// a flooded commercial block, an infested park.
//
//   npm run bake:hazard-areas                         # fetch from Overpass
//   npm run bake:hazard-areas -- --from tmp/hazard-areas/osm-areas.json
//
// Output: public/hazard-areas.json
//   { generated, categories, names, areas: [[osmId, cat, nameIdx, lat5, lng5, dLat5, dLng5, ...]] }
// `cat` indexes `categories`, `nameIdx` indexes `names` (-1 = unnamed). The
// ring is the outline (concave allowed) in 1e-5 degree integers, first vertex
// absolute and the rest as deltas.
//
// NOT part of `npm run build`.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(ROOT, 'public/hazard-areas.json');
const CACHE = resolve(ROOT, 'tmp/hazard-areas/osm-areas.json');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const BBOX = '(1.19,103.59,1.49,104.06)';
const QUERY = `[out:json][timeout:300][maxsize:536870912];
(
  way["landuse"~"^(residential|commercial|retail|industrial)$"]${BBOX};
  relation["landuse"~"^(residential|commercial|retail|industrial)$"]${BBOX};
  way["leisure"~"^(park|garden|nature_reserve)$"]${BBOX};
  relation["leisure"~"^(park|garden|nature_reserve)$"]${BBOX};
  way["amenity"~"^(school|college|university|hospital|marketplace)$"]${BBOX};
  relation["amenity"~"^(school|college|university|hospital|marketplace)$"]${BBOX};
);
out tags geom;`;

const M_PER_DEG_LAT = 111000;
const M_PER_DEG_LNG = 111000 * Math.cos((1.35 * Math.PI) / 180);

/**
 * Block-sized only: roughly 120–500 m across. Smaller is a single building
 * (the footprint sites cover those); bigger swallows a district.
 */
const SIZE = {
  estate: { min: 15000, max: 250000 },
  park: { min: 10000, max: 250000 },
  school: { min: 12000, max: 150000 },
  campus: { min: 15000, max: 250000 },
  hospital: { min: 8000, max: 200000 },
  commercial: { min: 10000, max: 200000 },
  industrial: { min: 15000, max: 250000 },
};
const CATEGORIES = Object.keys(SIZE);
const SIMPLIFY_M = 6;

function categoryOf(t) {
  if (t.amenity === 'school') return 'school';
  if (t.amenity === 'college' || t.amenity === 'university') return 'campus';
  if (t.amenity === 'hospital') return 'hospital';
  if (t.amenity === 'marketplace') return 'commercial';
  if (t.leisure) return 'park';
  if (t.landuse === 'residential') return 'estate';
  if (t.landuse === 'commercial' || t.landuse === 'retail') return 'commercial';
  if (t.landuse === 'industrial') return 'industrial';
  return null;
}

const xy = (p) => [p.lon * M_PER_DEG_LNG, p.lat * M_PER_DEG_LAT];

function area(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = xy(ring[i]);
    const [x2, y2] = xy(ring[(i + 1) % ring.length]);
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

function segDist(p, a, b) {
  const [px, py] = xy(p);
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len2)) : 0;
  return Math.hypot(px - (ax + ex * t), py - (ay + ey * t));
}

function simplify(pts, tol) {
  if (pts.length <= 3) return pts;
  let best = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > best) {
      best = d;
      idx = i;
    }
  }
  if (best <= tol) return [pts[0], pts[pts.length - 1]];
  const left = simplify(pts.slice(0, idx + 1), tol);
  const right = simplify(pts.slice(idx), tol);
  return left.slice(0, -1).concat(right);
}

function closed(g) {
  return g && g.length >= 4 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
}

/** Outer ring of a way or (largest closed outer member of) a multipolygon. */
function outerRing(e) {
  if (e.type === 'way') return closed(e.geometry) ? e.geometry : null;
  let best = null;
  for (const m of e.members ?? []) {
    if (m.role !== 'outer' || !closed(m.geometry)) continue;
    if (!best || area(m.geometry) > area(best)) best = m.geometry;
  }
  return best;
}

async function fetchOverpass() {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        // overpass-api.de answers a bare client with 406.
        headers: { 'User-Agent': 'singvive-bake/1.0', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: QUERY }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const text = await res.text();
      mkdirSync(dirname(CACHE), { recursive: true });
      writeFileSync(CACHE, text);
      return JSON.parse(text);
    } catch (err) {
      console.error(`  ${url} failed: ${err.message}`);
    }
  }
  throw new Error('every Overpass endpoint failed');
}

const fromIdx = process.argv.indexOf('--from');
const data = fromIdx > 0 ? JSON.parse(readFileSync(resolve(process.argv[fromIdx + 1]), 'utf8')) : await fetchOverpass();

const names = [];
const nameIdx = new Map();
const areas = [];
const counts = {};
for (const e of data.elements) {
  const cat = categoryOf(e.tags ?? {});
  if (!cat) continue;
  const ring = outerRing(e);
  if (!ring) continue;
  const a = area(ring);
  if (a < SIZE[cat].min || a > SIZE[cat].max) continue;
  const simple = simplify(ring, SIMPLIFY_M).slice(0, -1);
  if (simple.length < 3) continue;
  const name = e.tags?.name?.trim();
  let ni = -1;
  if (name) {
    if (!nameIdx.has(name)) {
      nameIdx.set(name, names.length);
      names.push(name);
    }
    ni = nameIdx.get(name);
  }
  const ints = simple.map((p) => [Math.round(p.lat * 1e5), Math.round(p.lon * 1e5)]);
  const enc = [ints[0][0], ints[0][1]];
  for (let i = 1; i < ints.length; i++) enc.push(ints[i][0] - ints[i - 1][0], ints[i][1] - ints[i - 1][1]);
  areas.push([`${e.type}/${e.id}`, CATEGORIES.indexOf(cat), ni, ...enc]);
  counts[cat] = (counts[cat] ?? 0) + 1;
}
areas.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

writeFileSync(
  OUT,
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), categories: CATEGORIES, names, areas }),
);
console.log(`hazard-areas.json: ${areas.length} areas`, counts);
