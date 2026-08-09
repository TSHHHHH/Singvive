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
import { classifyOsm } from '../src/game/poi.ts';

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
const MAX_RING_POINTS = 10; // outlines are drawn as rough footprints, not survey data

// world.ts keeps only the 100 nearest void decks per run, and a 1.5km scavenge
// radius covers ~7km². Retaining one block per 200m cell leaves ~175 candidates
// in range — comfortably above the cap — while cutting ~45k blocks to ~9k.
// Without this, residential alone is ~5MB of the payload.
const RESIDENTIAL_GRID_DEG = 0.0018; // ~200m

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

/** Uniformly sample a ring down to MAX_RING_POINTS, always keeping the first. */
function simplifyRing(ring) {
  if (ring.length <= MAX_RING_POINTS) return ring.map((p) => [round(p.lat), round(p.lon)]);
  const step = ring.length / MAX_RING_POINTS;
  const out = [];
  for (let i = 0; i < MAX_RING_POINTS; i++) {
    const p = ring[Math.floor(i * step)];
    out.push([round(p.lat), round(p.lon)]);
  }
  return out;
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
        throw new Error(`${q.label}: gave up after ${MAX_RETRIES} attempts — ${err.message}`);
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
  console.log('  ' + Object.entries(byCategory).map(([k, v]) => `${k}:${v}`).join(' '));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
