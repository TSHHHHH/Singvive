// Build-time URA planning-area bake for the island status overlay.
//
// Downloads Master Plan 2019 Planning Area Boundary (No Sea) from data.gov.sg,
// simplifies the rings, and assigns each area to a gameplay town (name match,
// else nearest town centroid). Runtime paints those polygons — not Voronoi
// wedges — when the map is zoomed out far enough to see the island.
//
//   npm run bake:towns
//   npm run bake:towns -- --from path/to/file.geojson
//
// NOT part of `npm run build`. Commit the result.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEIGHBOURHOODS } from '../src/game/singapore.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(HERE, '../public/towns.json');

const DATASET_ID = 'd_4765db0e87b9c86336792efe8a1f7a66';
const POLL_URL = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET_ID}/poll-download`;
const SOURCE = 'URA Master Plan 2019 Planning Area Boundary (No Sea)';

const COORD_DP = 5;
// Overlay only draws at island zoom (≤12); ~25 m is about a pixel at z12.
const SIMPLIFY_M = 25;
const MIN_OUTER_M2 = 8_000;
const MIN_HOLE_M2 = 15_000;
const LNG_SCALE = Math.cos((1.35 * Math.PI) / 180);

const SKIP_AREAS = new Set([
  // Catchment polygons are reservoirs + forest, not a neighbourhood front.
  'CENTRAL WATER CATCHMENT',
  'WESTERN WATER CATCHMENT',
]);

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function titleCase(name) {
  return name
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

const TOWNS = NEIGHBOURHOODS.map((n) => ({
  id: slug(n.name),
  name: n.name,
  lat: n.lat,
  lng: n.lng,
}));

const round = (n) => Number(n.toFixed(COORD_DP));

function perpDistance(p, a, b) {
  const mLat = 111000;
  const mLng = 111000 * Math.cos((a[0] * Math.PI) / 180);
  const px = p[1] * mLng;
  const py = p[0] * mLat;
  const ax = a[1] * mLng;
  const ay = a[0] * mLat;
  const bx = b[1] * mLng;
  const by = b[0] * mLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist <= tolerance) return [points[0], points[points.length - 1]];
  const left = douglasPeucker(points.slice(0, index + 1), tolerance);
  const right = douglasPeucker(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyRing(ring, minArea) {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const pts = ring.map(([lng, lat]) => [lat, lng]);
  const closed =
    pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  const open = closed ? pts.slice(0, -1) : pts;
  if (open.length < 3) return null;
  const simplified = douglasPeucker([...open, open[0]], SIMPLIFY_M);
  const out = simplified.map(([lat, lng]) => [round(lat), round(lng)]);
  if (out.length < 4) return null;
  if (ringAreaM2(out) < minArea) return null;
  return out;
}

function ringAreaM2(ring) {
  if (ring.length < 3) return 0;
  const mLat = 111000;
  const mLng = 111000 * Math.cos((ring[0][0] * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [aLat, aLng] = ring[i];
    const [bLat, bLng] = ring[(i + 1) % ring.length];
    area += aLng * mLng * (bLat * mLat) - bLng * mLng * (aLat * mLat);
  }
  return Math.abs(area) / 2;
}

function ringCentroid(ring) {
  let lat = 0;
  let lng = 0;
  const n = ring.length - (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
  for (let i = 0; i < n; i++) {
    lat += ring[i][0];
    lng += ring[i][1];
  }
  return { lat: lat / Math.max(1, n), lng: lng / Math.max(1, n) };
}

function polygonsFromGeometry(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

function simplifyPolygon(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const outer = simplifyRing(coords[0], MIN_OUTER_M2);
  if (!outer) return null;
  const rings = [outer];
  for (let i = 1; i < coords.length; i++) {
    const hole = simplifyRing(coords[i], MIN_HOLE_M2);
    if (hole) rings.push(hole);
  }
  return rings;
}

function nearestTownId(lat, lng) {
  let best = TOWNS[0].id;
  let bestD = Infinity;
  for (const t of TOWNS) {
    const dLat = lat - t.lat;
    const dLng = (lng - t.lng) * LNG_SCALE;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) {
      bestD = d;
      best = t.id;
    }
  }
  return best;
}

function assignTown(plnName, polygons) {
  const named = titleCase(plnName);
  const id = slug(named);
  if (TOWNS.some((t) => t.id === id)) return id;
  let bestRing = polygons[0][0];
  let bestA = -1;
  for (const poly of polygons) {
    const a = ringAreaM2(poly[0]);
    if (a > bestA) {
      bestA = a;
      bestRing = poly[0];
    }
  }
  const c = ringCentroid(bestRing);
  return nearestTownId(c.lat, c.lng);
}

async function loadGeoJson() {
  const fromIdx = process.argv.indexOf('--from');
  if (fromIdx >= 0 && process.argv[fromIdx + 1]) {
    const path = resolve(process.argv[fromIdx + 1]);
    return JSON.parse(readFileSync(path, 'utf8'));
  }
  const poll = await fetch(POLL_URL);
  if (!poll.ok) throw new Error(`poll-download ${poll.status}`);
  const body = await poll.json();
  const url = body?.data?.url;
  if (!url) throw new Error(`poll-download: ${body?.errorMsg || 'no url'}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`geojson download ${res.status}`);
  return res.json();
}

const geo = await loadGeoJson();
if (!Array.isArray(geo.features) || geo.features.length === 0) {
  throw new Error('GeoJSON has no features');
}

const areas = [];
const matched = new Set();
let skipped = 0;
let dropped = 0;

for (const feature of geo.features) {
  const pln = String(feature.properties?.PLN_AREA_N || '').trim();
  if (!pln) continue;
  if (SKIP_AREAS.has(pln.toUpperCase())) {
    skipped++;
    continue;
  }
  const polygons = [];
  for (const coords of polygonsFromGeometry(feature.geometry)) {
    const poly = simplifyPolygon(coords);
    if (poly) polygons.push(poly);
  }
  if (polygons.length === 0) {
    dropped++;
    continue;
  }
  const townId = assignTown(pln, polygons);
  const named = titleCase(pln);
  if (slug(named) === townId) matched.add(townId);
  areas.push({ name: named, townId, polygons });
}

areas.sort((a, b) => a.name.localeCompare(b.name));

const missing = TOWNS.filter((t) => !matched.has(t.id)).map((t) => t.name);
if (missing.length) {
  throw new Error(`bake:towns — no name-matched polygon for: ${missing.join(', ')}`);
}

const out = {
  generated: new Date().toISOString().slice(0, 10),
  source: SOURCE,
  dataset: DATASET_ID,
  areas,
};

writeFileSync(OUT_FILE, `${JSON.stringify(out)}\n`);

const bytes = Buffer.byteLength(JSON.stringify(out));
const pts = areas.reduce(
  (n, a) => n + a.polygons.reduce((m, p) => m + p.reduce((k, r) => k + r.length, 0), 0),
  0,
);
console.log(
  `bake:towns — ${areas.length} planning areas → ${TOWNS.length} towns, ${pts} pts, ${(bytes / 1024).toFixed(1)} KB`,
);
console.log(`  skipped catchments: ${skipped}; dropped empty: ${dropped}`);
const inherited = areas.filter((a) => slug(a.name) !== a.townId);
if (inherited.length) {
  const byTown = {};
  for (const a of inherited) {
    (byTown[a.townId] ??= []).push(a.name);
  }
  for (const [id, names] of Object.entries(byTown)) {
    const town = TOWNS.find((t) => t.id === id)?.name ?? id;
    console.log(`  ${town} also: ${names.join(', ')}`);
  }
}
console.log(`  wrote ${OUT_FILE}`);
