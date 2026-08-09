// Build-time POI bake.
//
// Queries Overpass for the whole of Singapore and writes public/pois.json,
// which the game loads instead of hitting Overpass per run. Run manually when
// you want to refresh map data — it is NOT part of `npm run build`, so a flaky
// Overpass can never break a deploy.
//
//   npm run bake:pois
//
// Spawns are arbitrary map clicks, so this covers the whole island rather than
// the curated neighbourhoods; the client filters it by radius.
//
// Query shape matters a lot here. An earlier version tiled the island into 40
// cells with one `nwr` statement per tag — 640 index scans — and the public API
// answered with a steady stream of 429s and 504s. Collapsing the tags into
// regex alternations makes it TWO whole-island queries that finish in ~30s
// total. Keep it that way: statement count is the cost driver, not area.
//
// classifyOsm is imported from the app source (Node strips the `import type`),
// so classification stays single-sourced — edit src/game/poi.ts, re-bake, done.

import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyOsm, POI_CONFIG } from '../src/game/poi.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(HERE, '../public/pois.json');

// Matches SG_BOUNDS in src/game/singapore.ts, padded so POIs just past the edge
// still appear for a spawn placed near the boundary.
const BBOX = '(1.19,103.59,1.49,104.06)';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const DELAY_MS = 5000; // between queries — the free API allows 2 slots per IP
const MAX_RETRIES = 4;
const COORD_DP = 5; // ~1m precision; more is wasted bytes
// Douglas-Peucker tolerance in metres. OSM building rings carry many nearly
// collinear nodes; ~1.5m drops those without touching corners.
//
// Do NOT go back to sampling every Nth vertex to cap point count — that discards
// the corners that define a footprint and turns complex buildings into spiky
// arrow shapes on the map. Shape fidelity is the whole point of these outlines.
const SIMPLIFY_TOLERANCE_M = 1.5;

// world.ts keeps only the 100 nearest void decks per run, and a 1.5km scavenge
// radius covers ~7km². Retaining one block per 200m cell leaves ~175 candidates
// in range — comfortably above the cap — while cutting ~45k blocks to ~9k.
// Without this, residential alone is ~5MB of the payload.
const RESIDENTIAL_GRID_DEG = 0.0018; // ~200m

// Only ~10% of POIs come back with geometry: OSM maps most shops as point nodes
// inside a building rather than as the building. Two extra passes fix that.
//   Pass 3: void decks ARE buildings — we only asked for centroids, so re-fetch
//           the kept ones by way id to get their real footprint.
//   Pass 4: shop nodes sit INSIDE a building — pull buildings near them and
//           match by point-in-polygon.
// Smaller batches cost the server less and 504 far less often. 250 answers in
// ~3s; 500 was tipping dense batches into repeated gateway timeouts.
const ID_BATCH_SIZE = 250;
const AROUND_RADIUS_M = 15; // how far from a node to look for its building

const QUERIES = [
  {
    label: 'shops & amenities',
    // `out geom` gives way rings for building outlines. Most of these are point
    // nodes, so it stays cheap.
    body: `[out:json][timeout:600];
(
  nwr["shop"~"^(supermarket|convenience|kiosk|chemist|hardware|doityourself|trade)$"]${BBOX};
  nwr["amenity"~"^(pharmacy|hospital|clinic|doctors|fuel|police|food_court|marketplace|community_centre|hawker_centre)$"]${BBOX};
  nwr["station"~"^(subway|light_rail)$"]${BBOX};
  nwr["railway"="station"]${BBOX};
);
out geom tags;`,
  },
  {
    label: 'HDB blocks',
    // Centroids only — polygon geometry for 45k blocks is a 100MB+ response and
    // they render as rectangles anyway.
    body: `[out:json][timeout:600];
(
  nwr["building"~"^(apartments|residential)$"]${BBOX};
);
out center tags;`,
  },
];

const NAME_BY_CATEGORY = {
  supermarket: 'Supermarket',
  convenience: 'Convenience Store',
  pharmacy: 'Pharmacy',
  hospital: 'Clinic',
  hardware: 'Hardware Store',
  fuel: 'Petrol Station',
  police: 'Police Post',
  residential: 'HDB Block',
  foodcourt: 'Hawker Centre',
  mrt: 'MRT Station',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Number(n.toFixed(COORD_DP));

function ringCentroid(ring) {
  let lat = 0;
  let lng = 0;
  for (const p of ring) {
    lat += p.lat;
    lng += p.lon;
  }
  return { lat: lat / ring.length, lng: lng / ring.length };
}

/** Perpendicular distance from p to the segment a-b, in metres. */
function perpDistance(p, a, b) {
  // Local equirectangular projection — fine at building scale.
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

/** Douglas-Peucker: keeps the points that define the shape, drops the rest. */
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

/** Simplify a building ring while preserving its corners. */
function simplifyRing(ring) {
  const pts = ring.map((p) => [p.lat, p.lon]);
  // Rings are closed (last === first). Simplify the open path, then re-close, so
  // the closing vertex can't be treated as an interior point and dropped.
  const closed =
    pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  const open = closed ? pts.slice(0, -1) : pts;

  const simplified = douglasPeucker([...open, open[0]], SIMPLIFY_TOLERANCE_M);
  return simplified.map(([lat, lng]) => [round(lat), round(lng)]);
}

// Mirrors parseElements() in src/game/overpass.ts.
function parseElements(elements) {
  const out = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const category = classifyOsm(tags);
    if (!category) continue;

    let lat = el.lat ?? el.center?.lat;
    let lng = el.lon ?? el.center?.lon;
    let outline;

    const ring = el.geometry;
    if (ring && ring.length >= 4) {
      const c = ringCentroid(ring);
      lat = c.lat;
      lng = c.lng;
      outline = simplifyRing(ring);
    }
    if (lat == null || lng == null) continue;

    let name = tags.name || tags['name:en'];
    if (!name && category === 'residential') {
      const blk = tags['addr:housenumber'] || tags['addr:block_number'] || tags.ref;
      name = blk ? `Blk ${blk} Void Deck` : 'HDB Void Deck';
    }
    if (!name) name = NAME_BY_CATEGORY[category];

    const poi = { osmId: `${el.type}/${el.id}`, name, category, lat: round(lat), lng: round(lng) };
    if (outline) poi.outline = outline;
    out.push(poi);
  }
  return out;
}

/**
 * Keep at most one residential POI per grid cell so coverage stays even across
 * the island. Non-residential POIs pass through untouched — shops and MRT
 * stations are the scarce, interesting ones.
 */
function thinResidential(pois) {
  const kept = [];
  const taken = new Set();
  // Sort by osmId so the choice is deterministic across re-bakes.
  const residential = pois
    .filter((p) => p.category === 'residential')
    .sort((a, b) => (a.osmId < b.osmId ? -1 : 1));

  for (const p of pois) if (p.category !== 'residential') kept.push(p);

  let dropped = 0;
  for (const p of residential) {
    const cell = `${Math.floor(p.lat / RESIDENTIAL_GRID_DEG)},${Math.floor(p.lng / RESIDENTIAL_GRID_DEG)}`;
    if (taken.has(cell)) {
      dropped++;
      continue;
    }
    taken.add(cell);
    kept.push(p);
  }
  return { kept, dropped };
}

/** Ray-casting point-in-polygon on a [lat,lng][] ring. */
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [iLat, iLng] = ring[i];
    const [jLat, jLng] = ring[j];
    if (iLng > lng !== jLng > lng && lat < ((jLat - iLat) * (lng - iLng)) / (jLng - iLng) + iLat) {
      inside = !inside;
    }
  }
  return inside;
}

/** Rough m² of a [lat,lng][] ring (shoelace on a local plane). */
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

/**
 * Run one Overpass query.
 *
 * `q.optional` marks a query whose failure should NOT abort the bake — the
 * footprint passes are enrichment, so a dead batch costs those POIs their
 * outline and nothing more. Only the two base passes are fatal, since without
 * them there is no file worth writing.
 */
async function runQuery(q) {
  const body = 'data=' + encodeURIComponent(q.body);
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const endpoint = ENDPOINTS[(attempt - 1) % ENDPOINTS.length];
    const started = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'singvive-bake/1.0',
        },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`  ${q.label}: ${json.elements?.length ?? 0} elements in ${secs}s`);
      return json.elements ?? [];
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        const msg = `${q.label}: gave up after ${MAX_RETRIES} attempts — ${err.message}`;
        if (q.optional) {
          console.error(`  ${msg} (skipping — these POIs keep no outline)`);
          return null;
        }
        throw new Error(msg);
      }
      // 429 = rate limited, 504 = too expensive for the server. Both want a
      // real pause, not an immediate retry.
      const backoff = DELAY_MS * 2 ** attempt;
      console.warn(`  ${q.label}: ${err.message} — retrying in ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
}

async function main() {
  console.log('Baking Singapore POIs...');
  const byId = new Map();

  for (let i = 0; i < QUERIES.length; i++) {
    const elements = await runQuery(QUERIES[i]);
    for (const p of parseElements(elements)) byId.set(p.osmId, p);
    if (i < QUERIES.length - 1) await sleep(DELAY_MS);
  }

  if (byId.size === 0) {
    console.error('\nNo POIs fetched — refusing to write an empty file.');
    process.exit(1);
  }

  const { kept, dropped } = thinResidential([...byId.values()]);

  // --- Pass 3: real footprints for the void decks we kept -------------------
  // They're building ways; we only asked for centroids. Re-fetch by id.
  const needGeom = kept.filter((p) => !p.outline && p.osmId.startsWith('way/'));
  if (needGeom.length) {
    console.log(`\nFetching footprints for ${needGeom.length} buildings...`);
    const byOsmId = new Map(needGeom.map((p) => [p.osmId, p]));
    let filled = 0;

    for (let i = 0; i < needGeom.length; i += ID_BATCH_SIZE) {
      const batch = needGeom.slice(i, i + ID_BATCH_SIZE);
      const ids = batch.map((p) => p.osmId.split('/')[1]).join(',');
      const elements = await runQuery({
        label: `footprints ${i + 1}-${i + batch.length}`,
        body: `[out:json][timeout:600];way(id:${ids});out geom tags;`,
        optional: true,
      });
      for (const el of elements ?? []) {
        if (!el.geometry || el.geometry.length < 4) continue;
        const poi = byOsmId.get(`way/${el.id}`);
        if (!poi) continue;
        poi.outline = simplifyRing(el.geometry);
        // Use the footprint centroid now that we have the real shape.
        const c = ringCentroid(el.geometry);
        poi.lat = round(c.lat);
        poi.lng = round(c.lng);
        filled++;
      }
      if (i + ID_BATCH_SIZE < needGeom.length) await sleep(DELAY_MS);
    }
    console.log(`  filled ${filled} footprints`);
  }

  // --- Pass 4: buildings containing point-node POIs -------------------------
  // A shop mapped as a node sits inside a building way. Pull buildings near
  // those nodes and match by containment.
  const nodePois = kept.filter((p) => !p.outline && p.osmId.startsWith('node/'));
  if (nodePois.length) {
    console.log(`\nMatching ${nodePois.length} point POIs to their buildings...`);
    const elements = await runQuery({
      label: 'buildings around POI nodes',
      body: `[out:json][timeout:600];
(
  node["shop"~"^(supermarket|convenience|kiosk|chemist|hardware|doityourself|trade)$"]${BBOX};
  node["amenity"~"^(pharmacy|hospital|clinic|doctors|fuel|police|food_court|marketplace|community_centre|hawker_centre)$"]${BBOX};
  node["station"~"^(subway|light_rail)$"]${BBOX};
  node["railway"="station"]${BBOX};
)->.p;
way["building"](around.p:${AROUND_RADIUS_M});
out geom tags;`,
      optional: true,
    });

    // Index candidate buildings into a coarse grid so matching isn't O(n*m).
    const GRID = 0.002; // ~220m
    const grid = new Map();
    for (const el of elements ?? []) {
      if (!el.geometry || el.geometry.length < 4) continue;
      const ring = el.geometry.map((g) => [g.lat, g.lon]);
      const c = ringCentroid(el.geometry);
      const key = `${Math.floor(c.lat / GRID)},${Math.floor(c.lng / GRID)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ id: el.id, ring, geometry: el.geometry, area: ringAreaM2(ring) });
    }

    let matched = 0;
    for (const poi of nodePois) {
      const gLat = Math.floor(poi.lat / GRID);
      const gLng = Math.floor(poi.lng / GRID);
      let best = null;
      // Check the POI's cell and its neighbours — a building can straddle cells.
      for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLng = -1; dLng <= 1; dLng++) {
          for (const cand of grid.get(`${gLat + dLat},${gLng + dLng}`) ?? []) {
            if (!pointInRing(poi.lat, poi.lng, cand.ring)) continue;
            // Smallest containing building wins: a unit inside a mall should
            // get the unit, not the whole mall.
            if (!best || cand.area < best.area) best = cand;
          }
        }
      }
      if (best) {
        poi._building = best;
        matched++;
      }
    }

    // A mall is ONE building holding many POI nodes. Giving each tenant the
    // mall's polygon stacks a dozen identical giant shapes in different colours
    // on top of each other — visually worse than no outline at all. Draw each
    // building once, for its most significant tenant (richest category wins,
    // osmId breaks ties so re-bakes are stable); the rest stay as badges,
    // which reads correctly as "shops inside this building".
    const byBuilding = new Map();
    for (const poi of nodePois) {
      if (!poi._building) continue;
      const cur = byBuilding.get(poi._building.id);
      const rank = (p) => POI_CONFIG[p.category].richness;
      if (!cur || rank(poi) > rank(cur) || (rank(poi) === rank(cur) && poi.osmId < cur.osmId)) {
        byBuilding.set(poi._building.id, poi);
      }
    }
    for (const poi of byBuilding.values()) poi.outline = simplifyRing(poi._building.geometry);
    for (const poi of nodePois) delete poi._building;

    const shared = matched - byBuilding.size;
    console.log(
      `  matched ${matched} of ${nodePois.length}; ${byBuilding.size} buildings drawn ` +
        `(${shared} co-tenants left as badges)`,
    );
  }

  // Sort north-to-south so the file compresses better (nearby coords cluster).
  kept.sort((a, b) => a.lat - b.lat || a.lng - b.lng);

  const byCategory = {};
  for (const p of kept) byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const json = JSON.stringify({ generated: new Date().toISOString(), pois: kept });
  writeFileSync(OUT_FILE, json);

  const bytes = statSync(OUT_FILE).size;
  const gz = gzipSync(json).length;
  console.log(`\nWrote public/pois.json — ${kept.length} POIs (thinned ${dropped} HDB blocks)`);
  console.log(
    `  ${(bytes / 1e6).toFixed(2)} MB raw, ${(gz / 1e6).toFixed(2)} MB gzipped (what users download)`,
  );
  const outlined = kept.filter((p) => p.outline).length;
  console.log(
    `  ${outlined}/${kept.length} have a building footprint (${Math.round((outlined / kept.length) * 100)}%)`,
  );
  console.log('  ' + Object.entries(byCategory).map(([k, v]) => `${k}:${v}`).join(' '));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
