// Build-time walkability + soft vegetation bake.
//
// Land: Nominatim Pulau Ujong coast + OSM islands.
// Water + restricted: Overpass OSM polygons (hard blocks).
// Vegetation: known forest / nature-reserve polygons (soft travel cost only).
// Fallbacks exist only when a remote source fails — never merged on top of good data.
//
//   npm run bake:zones
//   npm run bake:zones -- --local   # committed fallbacks only
//
// NOT part of `npm run build`.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inPolygon, inSingapore, NEIGHBOURHOODS } from '../src/game/singapore.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(HERE, '../public/zones.json');

const BOUNDS = { minLat: 1.19, maxLat: 1.49, minLng: 103.59, maxLng: 104.06 };
const BBOX = `(${BOUNDS.minLat},${BOUNDS.minLng},${BOUNDS.maxLat},${BOUNDS.maxLng})`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const NE_LAND_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson';
const NOMINATIM_MAINLAND_URL =
  'https://nominatim.openstreetmap.org/search?q=Pulau+Ujong&format=geojson&polygon_geojson=1&limit=1';

const DELAY_MS = 5000;
const MAX_RETRIES = 5;
const COORD_DP = 5;
// Coast at spawn zoom 11–13: ~40 m keeps the shoreline tight without a huge file.
const LAND_SIMPLIFY_M = 40;
// Keep reservoir shorelines tight — 20 m was flattening Peirce/Seletar into blobs.
const WATER_SIMPLIFY_M = 8;
const ZONE_SIMPLIFY_M = 20;
const MIN_AREA_M2 = 2_500;
const MIN_WATER_AREA_M2 = 1_000;
const MIN_LAND_AREA_M2 = 20_000;
// Nature parks / reserves only — skip pocket woods and roadside greenery.
const MIN_VEGETATION_AREA_M2 = 80_000; // ~8 ha
const VEGETATION_SIMPLIFY_M = 25;
// OSM sometimes ships huge bogus water outers that swallow HDB towns — drop those.
const MAX_WATER_AREA_M2 = 8_000_000; // 8 km² — bigger than any SG reservoir
const STITCH_EPS = 1e-5; // ~1 m — match multipolygon outer endpoints

/**
 * Major PUB reservoirs by OSM id — fetched first so Peirce/Seletar/etc. stay
 * accurate even when the island-wide water query 504s.
 */
const MAJOR_RESERVOIR_IDS = [
  2239709, // Upper Peirce
  2239677, // Lower Peirce
  3520530, // Upper Seletar
  2178315, // Lower Seletar
  4569326, // MacRitchie
  9542146, // Marina
  15343630, // Pandan
  20250182, // Bedok (way)
  33301506, // Island Service Reservoir (covered, way)
];

/**
 * Known forest / nature reserves by OSM id — fetched first so the soft-cost
 * layer stays accurate even when the island-wide vegetation sweep 504s.
 */
const MAJOR_VEGETATION_IDS = [
  11105973, // Bukit Timah Nature Reserve
  13463678, // Central Catchment Nature Reserve
  7497140, // Sungei Buloh Wetland Reserve
  15727863, // Labrador Nature Reserve
  13480855, // Windsor Nature Park
  11124482, // Dairy Farm Nature Park
  11109652, // Rifle Range Nature Park
  10732246, // Thomson Nature Park
  410983411, // Chestnut Nature Park (way)
  3536087, // Chek Jawa Wetlands
  11118234, // Hindhede Nature Park
  11133072, // Zhenghua Nature Park
  310724464, // Springleaf Nature Park (way)
];

const WATER_GRID = 2; // 2×2 tiles for the general water sweep

/** Coarse last-resort land if Natural Earth cannot be fetched. */
const FALLBACK_MAINLAND = [
  [1.205, 103.618], [1.22, 103.61], [1.24, 103.605], [1.26, 103.602],
  [1.28, 103.605], [1.3, 103.612], [1.32, 103.62], [1.34, 103.635],
  [1.36, 103.655], [1.38, 103.68], [1.4, 103.705], [1.42, 103.735],
  [1.44, 103.76], [1.45, 103.775], [1.452, 103.79], [1.46, 103.81],
  [1.468, 103.83], [1.47, 103.845], [1.465, 103.86], [1.455, 103.88],
  [1.445, 103.9], [1.435, 103.92], [1.422, 103.94], [1.41, 103.955],
  [1.4, 103.97], [1.39, 103.99], [1.375, 104.0], [1.36, 104.01],
  [1.345, 104.015], [1.33, 104.02], [1.315, 104.015], [1.3, 104.005],
  [1.29, 103.99], [1.28, 103.975], [1.27, 103.96], [1.26, 103.94],
  [1.255, 103.92], [1.26, 103.9], [1.265, 103.88], [1.27, 103.86],
  [1.265, 103.84], [1.26, 103.825], [1.255, 103.81], [1.25, 103.795],
  [1.255, 103.78], [1.26, 103.765], [1.265, 103.75], [1.26, 103.735],
  [1.25, 103.72], [1.24, 103.705], [1.23, 103.69], [1.22, 103.67],
  [1.215, 103.65], [1.21, 103.635], [1.205, 103.618],
];

const FALLBACK_WATER = [
  [[1.288, 103.86], [1.295, 103.868], [1.3, 103.875], [1.295, 103.882], [1.288, 103.878], [1.283, 103.87], [1.288, 103.86]],
  [[1.338, 103.82], [1.35, 103.825], [1.352, 103.838], [1.345, 103.845], [1.335, 103.84], [1.332, 103.828], [1.338, 103.82]],
  [[1.36, 103.805], [1.375, 103.81], [1.378, 103.825], [1.368, 103.83], [1.358, 103.82], [1.36, 103.805]],
  [[1.39, 103.82], [1.405, 103.825], [1.408, 103.845], [1.395, 103.85], [1.385, 103.835], [1.39, 103.82]],
  [[1.335, 103.92], [1.345, 103.925], [1.348, 103.94], [1.34, 103.945], [1.332, 103.935], [1.335, 103.92]],
  [[1.31, 103.74], [1.32, 103.745], [1.322, 103.755], [1.315, 103.76], [1.308, 103.75], [1.31, 103.74]],
  [[1.33, 103.72], [1.345, 103.725], [1.348, 103.74], [1.338, 103.745], [1.328, 103.735], [1.33, 103.72]],
  [[1.39, 103.9], [1.405, 103.905], [1.41, 103.92], [1.4, 103.925], [1.388, 103.915], [1.39, 103.9]],
];

const FALLBACK_RESTRICTED = [
  [[1.35, 103.68], [1.38, 103.69], [1.385, 103.72], [1.36, 103.73], [1.345, 103.71], [1.35, 103.68]],
  [[1.4, 103.81], [1.42, 103.815], [1.425, 103.84], [1.405, 103.845], [1.395, 103.83], [1.4, 103.81]],
  [[1.4, 103.76], [1.42, 103.765], [1.425, 103.79], [1.405, 103.795], [1.395, 103.78], [1.4, 103.76]],
  [[1.35, 103.9], [1.37, 103.905], [1.375, 103.925], [1.355, 103.93], [1.345, 103.915], [1.35, 103.9]],
  [[1.34, 103.97], [1.37, 103.975], [1.375, 104.01], [1.35, 104.015], [1.335, 103.995], [1.34, 103.97]],
  [[1.45, 103.815], [1.47, 103.82], [1.472, 103.845], [1.455, 103.85], [1.445, 103.835], [1.45, 103.815]],
  [[1.42, 103.69], [1.44, 103.7], [1.445, 103.73], [1.425, 103.735], [1.415, 103.715], [1.42, 103.69]],
  [[1.4, 104.02], [1.42, 104.03], [1.425, 104.05], [1.41, 104.06], [1.39, 104.05], [1.385, 104.03], [1.4, 104.02]],
];

/** Coarse nature-reserve blobs when Overpass is unavailable. */
const FALLBACK_VEGETATION = [
  // Bukit Timah Nature Reserve
  [
    [1.346, 103.771],
    [1.362, 103.771],
    [1.362, 103.787],
    [1.346, 103.787],
    [1.346, 103.771],
  ],
  // Central Catchment (MacRitchie / Peirce belt)
  [
    [1.34, 103.79],
    [1.41, 103.79],
    [1.41, 103.845],
    [1.34, 103.845],
    [1.34, 103.79],
  ],
  // Sungei Buloh Wetland Reserve
  [
    [1.442, 103.72],
    [1.455, 103.72],
    [1.455, 103.74],
    [1.442, 103.74],
    [1.442, 103.72],
  ],
  // Labrador Nature Reserve
  [
    [1.264, 103.798],
    [1.272, 103.798],
    [1.272, 103.806],
    [1.264, 103.806],
    [1.264, 103.798],
  ],
];

/** Extra islands if Overpass place=island misses them. */
const FALLBACK_ISLANDS = [
  // Sentosa
  [
    [1.245, 103.82],
    [1.252, 103.828],
    [1.255, 103.84],
    [1.25, 103.852],
    [1.242, 103.848],
    [1.238, 103.835],
    [1.245, 103.82],
  ],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Number(n.toFixed(COORD_DP));

function closeRing(r) {
  if (r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) return r;
  return [...r, r[0]];
}

function committedRings(list) {
  return list.map((r) => closeRing(r).map(([lat, lng]) => [round(lat), round(lng)]));
}

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

function simplifyRing(ring, toleranceM) {
  const pts = ring.map((p) =>
    Array.isArray(p) ? [p[0], p[1]] : [p.lat, p.lon ?? p.lng],
  );
  const closed =
    pts.length > 1 &&
    pts[0][0] === pts[pts.length - 1][0] &&
    pts[0][1] === pts[pts.length - 1][1];
  const open = closed ? pts.slice(0, -1) : pts;
  if (open.length < 3) return null;
  const simplified = douglasPeucker([...open, open[0]], toleranceM);
  const out = simplified.map(([lat, lng]) => [round(lat), round(lng)]);
  if (out.length < 4) return null;
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
  const n = ring.length - (ring[0][0] === ring[ring.length - 1][0] ? 1 : 0);
  for (let i = 0; i < n; i++) {
    lat += ring[i][0];
    lng += ring[i][1];
  }
  return { lat: lat / n, lng: lng / n };
}

function ringHitsBbox(ring) {
  for (const [lat, lng] of ring) {
    if (
      lat >= BOUNDS.minLat &&
      lat <= BOUNDS.maxLat &&
      lng >= BOUNDS.minLng &&
      lng <= BOUNDS.maxLng
    ) {
      return true;
    }
  }
  return false;
}

/** GeoJSON ring is [lng, lat][] → [lat, lng][]. */
function fromGeoJsonRing(coords) {
  return coords.map(([lng, lat]) => [lat, lng]);
}

/** Extract outer rings from an OSM way or multipolygon relation.
 *  Reservoir relations are split across many outer ways — stitch them. */
function extractOuterRings(el) {
  if (el.geometry && el.geometry.length >= 4) return [el.geometry];
  if (el.type !== 'relation' || !el.members) return [];
  const chains = [];
  for (const m of el.members) {
    if (m.role && m.role !== 'outer') continue;
    if (!m.geometry || m.geometry.length < 2) continue;
    chains.push(m.geometry.map((p) => [p.lat, p.lon ?? p.lng]));
  }
  if (chains.length === 0) return [];
  if (chains.length === 1) return [chains[0]];
  return stitchPolylines(chains);
}

function nearPt(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < STITCH_EPS;
}

/** Greedy endpoint-stitch of multipolygon outer members into closed rings. */
function stitchPolylines(chains) {
  const unused = chains.map((c) => c.map((p) => [p[0], p[1]]));
  const rings = [];
  while (unused.length) {
    let path = unused.pop();
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < unused.length; i++) {
        const other = unused[i];
        const pe = path[path.length - 1];
        const ps = path[0];
        const os = other[0];
        const oe = other[other.length - 1];
        if (nearPt(pe, os)) {
          path = path.concat(other.slice(1));
          unused.splice(i, 1);
          changed = true;
          break;
        }
        if (nearPt(pe, oe)) {
          path = path.concat(other.slice(0, -1).reverse());
          unused.splice(i, 1);
          changed = true;
          break;
        }
        if (nearPt(ps, oe)) {
          path = other.slice(0, -1).concat(path);
          unused.splice(i, 1);
          changed = true;
          break;
        }
        if (nearPt(ps, os)) {
          path = other.slice(1).reverse().concat(path);
          unused.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    if (path.length >= 4) rings.push(path);
  }
  return rings;
}

function finalizeOsmRing(geom, simplifyM = ZONE_SIMPLIFY_M, minArea = MIN_AREA_M2) {
  const simplified = simplifyRing(geom, simplifyM);
  if (!simplified) return null;
  const area = ringAreaM2(simplified);
  if (area < minArea) return null;
  const c = ringCentroid(simplified);
  if (!inSingapore(c.lat, c.lng)) return null;
  return simplified;
}

function finalizeWaterRing(geom) {
  const ring = finalizeOsmRing(geom, WATER_SIMPLIFY_M, MIN_WATER_AREA_M2);
  if (!ring) return null;
  const area = ringAreaM2(ring);
  if (area > MAX_WATER_AREA_M2) return null;
  if (area > 4_000_000) {
    for (const n of NEIGHBOURHOODS) {
      if (inPolygon(n.lat, n.lng, ring)) return null;
    }
  }
  return ring;
}

function finalizeVegetationRing(geom) {
  return finalizeOsmRing(geom, VEGETATION_SIMPLIFY_M, MIN_VEGETATION_AREA_M2);
}

/**
 * Drop rings nested inside a larger kept ring (nature_reserve + landuse=forest
 * duplicates). Keeps largest first so major reserves win over pocket woods.
 */
function dedupeVegetationRings(rings) {
  const scored = rings
    .map((ring) => ({ ring, area: ringAreaM2(ring) }))
    .sort((a, b) => b.area - a.area);
  const kept = [];
  for (const { ring } of scored) {
    const c = ringCentroid(ring);
    if (kept.some((k) => inPolygon(c.lat, c.lng, k))) continue;
    // Nearly contained: sample vertices; drop if most sit inside a keeper.
    let insideHits = 0;
    let samples = 0;
    const step = Math.max(1, Math.floor(ring.length / 12));
    for (let i = 0; i < ring.length; i += step) {
      samples++;
      const [lat, lng] = ring[i];
      if (kept.some((k) => inPolygon(lat, lng, k))) insideHits++;
    }
    if (samples > 0 && insideHits / samples >= 0.7) continue;
    kept.push(ring);
  }
  return kept;
}

function finalizeLandRing(latLngRing) {
  const simplified = simplifyRing(latLngRing, LAND_SIMPLIFY_M);
  if (!simplified) return null;
  if (ringAreaM2(simplified) < MIN_LAND_AREA_M2) return null;
  if (!ringHitsBbox(simplified)) return null;
  // Drop continent-scale rings that only graze the bbox (NE Eurasia etc.).
  const c = ringCentroid(simplified);
  const inLocal =
    c.lat >= BOUNDS.minLat &&
    c.lat <= BOUNDS.maxLat &&
    c.lng >= BOUNDS.minLng &&
    c.lng <= BOUNDS.maxLng;
  if (!inLocal && !inSingapore(c.lat, c.lng)) return null;
  return simplified;
}

function collectGeoJsonLand(gj) {
  const out = [];
  const seen = new Set();
  const features = gj.features ?? (gj.type === 'Feature' ? [gj] : []);
  for (const feat of features) {
    const g = feat.geometry;
    if (!g) continue;
    const polys =
      g.type === 'Polygon'
        ? [g.coordinates]
        : g.type === 'MultiPolygon'
          ? g.coordinates
          : [];
    for (const poly of polys) {
      const outer = poly[0];
      if (!outer || outer.length < 4) continue;
      const ring = finalizeLandRing(fromGeoJsonRing(outer));
      if (!ring) continue;
      const key = `${ring[0][0]},${ring[0][1]},${ring.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ring);
    }
  }
  return out;
}

async function runQuery(label, body) {
  const form = 'data=' + encodeURIComponent(body);
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      console.log(`  → ${label} via ${endpoint} (try ${attempt + 1})`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'singvive-bake/1.0',
        },
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.elements) throw new Error('no elements');
      return json.elements;
    } catch (err) {
      lastErr = err;
      console.warn(`    failed: ${err.message ?? err}`);
      await sleep(DELAY_MS * 2 ** attempt);
    }
  }
  throw lastErr;
}

function collectOsmRings(elements, finalize = finalizeOsmRing) {
  const out = [];
  const seen = new Set();
  for (const el of elements) {
    for (const geom of extractOuterRings(el)) {
      const ring = finalize(geom);
      if (!ring) continue;
      const key = `${ring[0][0]},${ring[0][1]},${ring.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ring);
    }
  }
  return out;
}

/** Detailed mainland coast from Nominatim (Pulau Ujong). */
async function fetchMainlandLand() {
  console.log(`  → Nominatim mainland (${NOMINATIM_MAINLAND_URL})`);
  const res = await fetch(NOMINATIM_MAINLAND_URL, {
    headers: { 'User-Agent': 'singvive-bake/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const gj = await res.json();
  const rings = collectGeoJsonLand(gj);
  if (rings.length === 0) throw new Error('no mainland rings');
  return rings;
}

/** Outlying islands from Overpass place=island. */
async function fetchIslandLand() {
  const body = `[out:json][timeout:300];
(
  way["place"~"^(island|islet)$"]${BBOX};
  relation["place"~"^(island|islet)$"]${BBOX};
);
out geom;`;
  const els = await runQuery('islands', body);
  const out = [];
  const seen = new Set();
  for (const el of els) {
    for (const geom of extractOuterRings(el)) {
      // extractOuterRings already yields [lat,lng][] (or OSM objs for ways —
      // finalizeLandRing / simplifyRing accept both).
      const ring = finalizeLandRing(geom);
      if (!ring) continue;
      const key = `${ring[0][0]},${ring[0][1]},${ring.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ring);
    }
  }
  return out;
}

/** Natural Earth — last resort (coarse at this scale). */
async function fetchNaturalEarthLand() {
  console.log(`  → Natural Earth 10m land (${NE_LAND_URL})`);
  const res = await fetch(NE_LAND_URL, {
    headers: { 'User-Agent': 'singvive-bake/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const gj = await res.json();
  return collectGeoJsonLand(gj);
}

async function main() {
  const localOnly = process.argv.includes('--local');
  console.log(
    localOnly
      ? 'bake:zones — local fallbacks only'
      : 'bake:zones — Nominatim mainland + OSM islands/water/restricted/vegetation',
  );

  function waterTileBody(box) {
    return `[out:json][timeout:180];
(
  way["natural"="water"]${box};
  relation["natural"="water"]${box};
  way["water"~"^(lake|reservoir|pond|basin)$"]${box};
  relation["water"~"^(lake|reservoir|pond|basin)$"]${box};
  way["landuse"~"^(reservoir|basin)$"]${box};
  relation["landuse"~"^(reservoir|basin)$"]${box};
  way["man_made"="reservoir_covered"]${box};
);
out geom;`;
  }

  const majorWaterBody = `[out:json][timeout:180];
(
  ${MAJOR_RESERVOIR_IDS.map((id) => `relation(${id});`).join('\n  ')}
  ${MAJOR_RESERVOIR_IDS.map((id) => `way(${id});`).join('\n  ')}
);
out geom;`;

  const restrictedBody = `[out:json][timeout:300];
(
  way["landuse"="military"]${BBOX};
  relation["landuse"="military"]${BBOX};
  way["military"~"^(airfield|base|danger_area|training_area|barracks|naval_base)$"]${BBOX};
  relation["military"~"^(airfield|base|danger_area|training_area|barracks|naval_base)$"]${BBOX};
);
out geom;`;

  const majorVegetationBody = `[out:json][timeout:180];
(
  ${MAJOR_VEGETATION_IDS.map((id) => `relation(${id});`).join('\n  ')}
  ${MAJOR_VEGETATION_IDS.map((id) => `way(${id});`).join('\n  ')}
);
out geom;`;

  // Known forest / nature reserves only — not every leisure=park.
  const vegetationBody = `[out:json][timeout:300];
(
  way["leisure"="nature_reserve"]${BBOX};
  relation["leisure"="nature_reserve"]${BBOX};
  way["boundary"="protected_area"]["protect_class"~"^(1|1a|1b|2|3|4)$"]${BBOX};
  relation["boundary"="protected_area"]["protect_class"~"^(1|1a|1b|2|3|4)$"]${BBOX};
  way["landuse"="forest"]${BBOX};
  relation["landuse"="forest"]${BBOX};
  way["natural"="wood"]${BBOX};
  relation["natural"="wood"]${BBOX};
);
out geom;`;

  let land = [];
  let water = [];
  let restricted = [];
  let vegetation = [];

  if (localOnly) {
    land = committedRings([FALLBACK_MAINLAND]);
    water = committedRings(FALLBACK_WATER);
    restricted = committedRings(FALLBACK_RESTRICTED);
    vegetation = committedRings(FALLBACK_VEGETATION);
  } else {
    try {
      land = await fetchMainlandLand();
      console.log(`  mainland rings: ${land.length} (pts ${land.map((r) => r.length).join(',')})`);
    } catch (err) {
      console.warn(`  mainland failed — trying NE / fallback (${err.message ?? err})`);
      try {
        land = await fetchNaturalEarthLand();
      } catch {
        land = committedRings([FALLBACK_MAINLAND]);
      }
    }

    await sleep(1000);

    try {
      const islands = await fetchIslandLand();
      console.log(`  island rings from OSM: ${islands.length}`);
      land = [...land, ...islands];
    } catch (err) {
      console.warn(`  islands failed — mainland only (${err.message ?? err})`);
    }
    // Ensure Sentosa etc. exist even if Overpass skipped them.
    for (const ring of committedRings(FALLBACK_ISLANDS)) {
      const c = ringCentroid(ring);
      if (!land.some((r) => inPolygon(c.lat, c.lng, r))) land.push(ring);
    }

    // Major reservoirs first (by id) — shoreline-faithful even if the sweep fails.
    try {
      const els = await runQuery('major reservoirs', majorWaterBody);
      water = collectOsmRings(els, finalizeWaterRing);
      console.log(`  major reservoir rings: ${water.length}`);
    } catch (err) {
      console.warn(`  major reservoirs failed (${err.message ?? err})`);
    }

    await sleep(DELAY_MS);

    // Tiled sweep for everything else (ponds, smaller lakes, covered tanks).
    try {
      const latStep = (BOUNDS.maxLat - BOUNDS.minLat) / WATER_GRID;
      const lngStep = (BOUNDS.maxLng - BOUNDS.minLng) / WATER_GRID;
      const seen = new Set(water.map((r) => `${r[0][0]},${r[0][1]},${r.length}`));
      for (let iy = 0; iy < WATER_GRID; iy++) {
        for (let ix = 0; ix < WATER_GRID; ix++) {
          const box = `(${(BOUNDS.minLat + iy * latStep).toFixed(4)},${(
            BOUNDS.minLng +
            ix * lngStep
          ).toFixed(4)},${(BOUNDS.minLat + (iy + 1) * latStep).toFixed(4)},${(
            BOUNDS.minLng +
            (ix + 1) * lngStep
          ).toFixed(4)})`;
          try {
            const els = await runQuery(`water tile ${iy},${ix}`, waterTileBody(box));
            for (const ring of collectOsmRings(els, finalizeWaterRing)) {
              const key = `${ring[0][0]},${ring[0][1]},${ring.length}`;
              if (seen.has(key)) continue;
              seen.add(key);
              water.push(ring);
            }
          } catch (err) {
            console.warn(`  water tile ${iy},${ix} failed (${err.message ?? err})`);
          }
          await sleep(DELAY_MS);
        }
      }
      console.log(`  water rings total: ${water.length}`);
      console.log(
        `  water rings with ≥40 pts: ${water.filter((r) => r.length >= 40).length}`,
      );
    } catch (err) {
      console.warn(`  water sweep failed (${err.message ?? err})`);
    }

    if (water.length === 0) {
      console.warn('  no water from OSM — using coarse fallback');
      water = committedRings(FALLBACK_WATER);
    }
    // Do NOT merge coarse FALLBACK_WATER on top of OSM — those hexes hide real shorelines.

    await sleep(DELAY_MS);

    try {
      const els = await runQuery('restricted', restrictedBody);
      restricted = collectOsmRings(els);
      console.log(`  restricted rings from OSM: ${restricted.length}`);
    } catch (err) {
      console.warn(`  restricted query failed — coarse fallback (${err.message ?? err})`);
      restricted = committedRings(FALLBACK_RESTRICTED);
    }

    await sleep(DELAY_MS);

    // Curated nature reserves / parks first.
    try {
      const els = await runQuery('major vegetation', majorVegetationBody);
      vegetation = collectOsmRings(els, finalizeVegetationRing);
      console.log(`  major vegetation rings: ${vegetation.length}`);
    } catch (err) {
      console.warn(`  major vegetation failed (${err.message ?? err})`);
    }

    await sleep(DELAY_MS);

    try {
      const els = await runQuery('vegetation', vegetationBody);
      const seen = new Set(vegetation.map((r) => `${r[0][0]},${r[0][1]},${r.length}`));
      for (const ring of collectOsmRings(els, finalizeVegetationRing)) {
        const key = `${ring[0][0]},${ring[0][1]},${ring.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        vegetation.push(ring);
      }
      console.log(`  vegetation rings total: ${vegetation.length}`);
    } catch (err) {
      console.warn(`  vegetation sweep failed (${err.message ?? err})`);
    }

    if (vegetation.length === 0) {
      console.warn('  no vegetation from OSM — using coarse fallback');
      vegetation = committedRings(FALLBACK_VEGETATION);
    }
  }

  const beforeVeg = vegetation.length;
  vegetation = dedupeVegetationRings(vegetation);
  if (vegetation.length !== beforeVeg) {
    console.log(`  vegetation deduped: ${beforeVeg} → ${vegetation.length}`);
  }

  if (land.length === 0) {
    console.warn('  no land rings — forcing fallback mainland');
    land = committedRings([FALLBACK_MAINLAND]);
  }

  const payload = {
    generated: new Date().toISOString().slice(0, 10),
    land,
    water,
    restricted,
    vegetation,
  };

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(payload));
  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1);
  console.log(
    `wrote ${OUT_FILE} (${kb} KB) — land=${land.length} water=${water.length} restricted=${restricted.length} vegetation=${vegetation.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
