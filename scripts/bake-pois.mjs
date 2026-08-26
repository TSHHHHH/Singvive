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
import { inSingapore } from '../src/game/singapore.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(HERE, '../public/pois.json');

// Matches SG_BOUNDS in src/game/singapore.ts, padded so edge queries don't
// clip. Johor spill is stripped after fetch with inSingapore() — a bbox alone
// cannot separate Pasir Gudang from Sembawang.
const BOUNDS = { minLat: 1.19, maxLat: 1.49, minLng: 103.59, maxLng: 104.06 };
const BBOX = `(${BOUNDS.minLat},${BOUNDS.minLng},${BOUNDS.maxLat},${BOUNDS.maxLng})`;

// Pass 4's `around` set-query is the most expensive thing here — island-wide it
// took 81s on a good day and 504'd on a bad one. Splitting it into a grid keeps
// each query cheap; failed chunks are retried before we give up on their
// outlines.
const PASS4_GRID = 3; // 3x3 = 9 chunks
const PASS4_CHUNK_RETRIES = 2;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const DELAY_MS = 6000; // between queries — the free API allows 2 slots per IP
const MAX_RETRIES = 5;
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
// Smaller batches cost the server less and 504 far less often. 100 is slower
// wall-clock but finishes; 250 was tipping dense batches into repeated gateway
// timeouts on the public mirrors.
const ID_BATCH_SIZE = 100;
const AROUND_RADIUS_M = 15; // how far from a node to look for its building

// Small shop / amenity nodes must not inherit a mall or campus shell. If the
// only containing polygon is bigger than this, leave them as badges.
const SMALL_OUTLINE_CATS = new Set([
  'convenience',
  'pharmacy',
  'clinic',
  'hardware',
  'fuel',
]);
const MAX_SMALL_OUTLINE_M2 = 8_000;

const QUERIES = [
  {
    label: 'shops & amenities',
    // `out geom` gives way rings for building outlines. Most of these are point
    // nodes, so it stays cheap.
    body: `[out:json][timeout:600];
(
  nwr["shop"~"^(supermarket|convenience|kiosk|chemist|hardware|doityourself|trade)$"]${BBOX};
  nwr["amenity"~"^(pharmacy|hospital|clinic|doctors|fuel|police|food_court|marketplace|community_centre|hawker_centre|school|college|university)$"]${BBOX};
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
  {
    label: 'industrial units',
    // The west is warehouses the way the heartlands are void decks — without
    // these, Jurong and Tuas bake out as empty ground. Centroids only, same
    // reasoning as the HDB pass: these are large, numerous, and read as boxes.
    body: `[out:json][timeout:600];
(
  nwr["building"~"^(industrial|warehouse|factory)$"]${BBOX};
);
out center tags;`,
  },
];

const NAME_BY_CATEGORY = {
  supermarket: 'Supermarket',
  convenience: 'Convenience Store',
  pharmacy: 'Pharmacy',
  hospital: 'Hospital',
  clinic: 'Clinic',
  hardware: 'Hardware Store',
  fuel: 'Petrol Station',
  police: 'Police Post',
  residential: 'HDB Block',
  foodcourt: 'Hawker Centre',
  mrt: 'MRT Station',
  industrial: 'Industrial Unit',
  school: 'School',
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

/**
 * Prefer a way's own geometry; for multipolygon relations, take the longest
 * outer member ring (campus / hospital shells are often relations).
 */
function extractOsmRing(el) {
  if (el.geometry && el.geometry.length >= 4) return el.geometry;
  if (el.type !== 'relation' || !el.members) return null;
  let best = null;
  for (const m of el.members) {
    if (m.role && m.role !== 'outer') continue;
    if (!m.geometry || m.geometry.length < 4) continue;
    if (!best || m.geometry.length > best.length) best = m.geometry;
  }
  return best;
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

    const ring = extractOsmRing(el);
    if (ring && ring.length >= 4) {
      const c = ringCentroid(ring);
      lat = c.lat;
      lng = c.lng;
      outline = simplifyRing(ring);
    }
    if (lat == null || lng == null) continue;

    let name = tags.name || tags['name:en'];
    if (name && name.trim().length < 3) name = undefined;
    if (!name && category === 'residential') {
      const blk = tags['addr:housenumber'] || tags['addr:block_number'] || tags.ref;
      name = blk ? `Blk ${blk} Void Deck` : 'HDB Void Deck';
    }
    if (!name && category === 'foodcourt' && tags.amenity === 'marketplace') name = 'Market';
    if (!name) name = NAME_BY_CATEGORY[category];

    const poi = { osmId: `${el.type}/${el.id}`, name, category, lat: round(lat), lng: round(lng) };
    if (outline) poi.outline = outline;
    out.push(poi);
  }
  return out;
}

/**
 * Keep at most one POI per grid cell for the categories that come as fields of
 * near-identical buildings — void decks in the heartlands, warehouse units in
 * the west. Everything else passes through untouched: shops and MRT stations
 * are the scarce, interesting ones.
 */
const THINNED_CATEGORIES = new Set(['residential', 'industrial']);

function thinDenseCategories(pois) {
  const kept = [];
  const taken = new Set();
  // Sort by osmId so the choice is deterministic across re-bakes.
  const dense = pois
    .filter((p) => THINNED_CATEGORIES.has(p.category))
    .sort((a, b) => (a.osmId < b.osmId ? -1 : 1));

  for (const p of pois) if (!THINNED_CATEGORIES.has(p.category)) kept.push(p);

  let dropped = 0;
  for (const p of dense) {
    // Cell key includes the category, so a warehouse never displaces an HDB
    // block that happens to sit in the same 200m square.
    const cell = `${p.category}:${Math.floor(p.lat / RESIDENTIAL_GRID_DEG)},${Math.floor(p.lng / RESIDENTIAL_GRID_DEG)}`;
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

/** If the pin fell outside its footprint (rounding / bad node), snap to centroid. */
function snapPinIntoOutline(poi) {
  if (!poi.outline || poi.outline.length < 3) return;
  if (pointInRing(poi.lat, poi.lng, poi.outline)) return;
  let lat = 0;
  let lng = 0;
  for (const [a, b] of poi.outline) {
    lat += a;
    lng += b;
  }
  poi.lat = round(lat / poi.outline.length);
  poi.lng = round(lng / poi.outline.length);
}

/**
 * Rank a containing building for a point POI. Lower is better:
 * tagged amenity/shop match → building:part → plain building, then smaller area.
 */
function buildingRank(cand, poiCategory) {
  const tagCat = cand.tags ? classifyOsm(cand.tags) : null;
  const tagMatch = tagCat === poiCategory ? 0 : 1;
  const partBias = cand.isPart ? 0 : 1;
  return tagMatch * 1e12 + partBias * 1e11 + cand.area;
}

/**
 * Run one Overpass query.
 *
 * `q.optional` marks a query whose failure should NOT abort the bake — the
 * footprint passes are enrichment, so a dead batch costs those POIs their
 * outline and nothing more. Only the base passes are fatal, since without
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

function pass4ChunkQuery(box, label) {
  return {
    label,
    // Ways + multipolygon relations + building:part (mall units).
    body: `[out:json][timeout:600];
(
  node["shop"~"^(supermarket|convenience|kiosk|chemist|hardware|doityourself|trade)$"]${box};
  node["amenity"~"^(pharmacy|hospital|clinic|doctors|fuel|police|food_court|marketplace|community_centre|hawker_centre)$"]${box};
  node["station"~"^(subway|light_rail)$"]${box};
  node["railway"="station"]${box};
)->.p;
(
  way["building"](around.p:${AROUND_RADIUS_M});
  relation["building"](around.p:${AROUND_RADIUS_M});
  way["building:part"](around.p:${AROUND_RADIUS_M});
);
out geom tags;`,
    optional: true,
  };
}

function ingestBuildingElements(elements, grid, GRID, seenBuildings) {
  let added = 0;
  for (const el of elements) {
    const ringGeom = extractOsmRing(el);
    if (!ringGeom || ringGeom.length < 4) continue;
    const uid = `${el.type}/${el.id}`;
    if (seenBuildings.has(uid)) continue;
    seenBuildings.add(uid);
    const ring = ringGeom.map((g) => [g.lat, g.lon]);
    const c = ringCentroid(ringGeom);
    const key = `${Math.floor(c.lat / GRID)},${Math.floor(c.lng / GRID)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push({
      id: uid,
      ring,
      geometry: ringGeom,
      area: ringAreaM2(ring),
      tags: el.tags ?? {},
      isPart: Boolean(el.tags && Object.prototype.hasOwnProperty.call(el.tags, 'building:part')),
    });
    added++;
  }
  return added;
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

  const { kept: thinned, dropped } = thinDenseCategories([...byId.values()]);

  // Drop Johor / open-water spill from the padded bbox.
  const beforeSg = thinned.length;
  const kept = thinned.filter((p) => inSingapore(p.lat, p.lng));
  const johorDropped = beforeSg - kept.length;
  console.log(`\nSingapore outline filter: dropped ${johorDropped} outside SG_OUTLINE`);

  // --- Pass 3: real footprints for the void decks / industrial we kept --------
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
        const ring = extractOsmRing(el);
        if (!ring || ring.length < 4) continue;
        const poi = byOsmId.get(`way/${el.id}`);
        if (!poi) continue;
        poi.outline = simplifyRing(ring);
        const c = ringCentroid(ring);
        poi.lat = round(c.lat);
        poi.lng = round(c.lng);
        filled++;
      }
      if (i + ID_BATCH_SIZE < needGeom.length) await sleep(DELAY_MS);
    }
    console.log(`  filled ${filled} footprints`);
  }

  // --- Pass 4: buildings containing point-node POIs -------------------------
  const nodePois = kept.filter((p) => !p.outline && p.osmId.startsWith('node/'));
  if (nodePois.length) {
    console.log(`\nMatching ${nodePois.length} point POIs to their buildings...`);
    const GRID = 0.002; // ~220m
    const grid = new Map();
    const seenBuildings = new Set();

    const latStep = (BOUNDS.maxLat - BOUNDS.minLat) / PASS4_GRID;
    const lngStep = (BOUNDS.maxLng - BOUNDS.minLng) / PASS4_GRID;

    const chunks = [];
    for (let a = 0; a < PASS4_GRID; a++) {
      for (let b = 0; b < PASS4_GRID; b++) {
        const s = BOUNDS.minLat + a * latStep;
        const w = BOUNDS.minLng + b * lngStep;
        const pad = 0.001;
        const box = `(${s - pad},${w - pad},${s + latStep + pad},${w + lngStep + pad})`;
        const n = a * PASS4_GRID + b + 1;
        chunks.push({
          n,
          box,
          label: `buildings chunk ${n}/${PASS4_GRID * PASS4_GRID}`,
        });
      }
    }

    let pending = [...chunks];
    let chunksFailed = 0;
    for (let round = 0; round <= PASS4_CHUNK_RETRIES && pending.length; round++) {
      if (round > 0) {
        console.log(`  retrying ${pending.length} failed chunk(s) (attempt ${round + 1})...`);
        await sleep(DELAY_MS);
      }
      const next = [];
      for (const chunk of pending) {
        const elements = await runQuery(pass4ChunkQuery(chunk.box, chunk.label));
        if (elements === null) {
          next.push(chunk);
        } else {
          ingestBuildingElements(elements, grid, GRID, seenBuildings);
        }
        await sleep(DELAY_MS);
      }
      pending = next;
    }
    chunksFailed = pending.length;
    console.log(
      `  ${seenBuildings.size} candidate buildings` +
        (chunksFailed ? ` (${chunksFailed} chunk(s) still failed after retries)` : ''),
    );

    let matched = 0;
    let rejectedOversized = 0;
    for (const poi of nodePois) {
      const gLat = Math.floor(poi.lat / GRID);
      const gLng = Math.floor(poi.lng / GRID);
      let best = null;
      let bestRank = Infinity;
      for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLng = -1; dLng <= 1; dLng++) {
          for (const cand of grid.get(`${gLat + dLat},${gLng + dLng}`) ?? []) {
            if (!pointInRing(poi.lat, poi.lng, cand.ring)) continue;
            if (SMALL_OUTLINE_CATS.has(poi.category) && cand.area > MAX_SMALL_OUTLINE_M2) {
              rejectedOversized++;
              continue;
            }
            const rank = buildingRank(cand, poi.category);
            if (rank < bestRank) {
              bestRank = rank;
              best = cand;
            }
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
    for (const poi of byBuilding.values()) {
      poi.outline = simplifyRing(poi._building.geometry);
      snapPinIntoOutline(poi);
    }
    for (const poi of nodePois) delete poi._building;

    const shared = matched - byBuilding.size;
    console.log(
      `  matched ${matched} of ${nodePois.length}; ${byBuilding.size} buildings drawn ` +
        `(${shared} co-tenants left as badges` +
        (rejectedOversized ? `; skipped ${rejectedOversized} oversized shells for small shops` : '') +
        `)`,
    );
  }

  // Snap any remaining outlined pins that drifted outside their ring.
  for (const p of kept) snapPinIntoOutline(p);

  // Sort north-to-south so the file compresses better (nearby coords cluster).
  kept.sort((a, b) => a.lat - b.lat || a.lng - b.lng);

  const byCategory = {};
  for (const p of kept) byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const EVAC_CATS = new Set(['mrt', 'school', 'police']);
  const evacIds = kept
    .filter((p) => EVAC_CATS.has(p.category) && String(p.name ?? '').trim().length >= 3)
    .map((p) => p.osmId);
  const json = JSON.stringify({ generated: new Date().toISOString(), pois: kept, evacIds });
  writeFileSync(OUT_FILE, json);

  const bytes = statSync(OUT_FILE).size;
  const gz = gzipSync(json).length;
  console.log(`\nWrote public/pois.json — ${kept.length} POIs (thinned ${dropped} HDB/industrial units)`);
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
