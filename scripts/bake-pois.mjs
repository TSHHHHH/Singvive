// Build-time POI bake.
//
// Queries Overpass once for the whole of Singapore and writes public/pois.json,
// which the game loads instead of hitting Overpass per run. Run this manually
// when you want to refresh map data — it is NOT part of `npm run build`, so a
// flaky Overpass never breaks a deploy.
//
//   npm run bake:pois
//
// Spawns are arbitrary map clicks, so this has to cover the whole island rather
// than the curated neighbourhoods. Singapore is small enough that the result is
// a single static file the client filters by radius.
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

// Matches SG_BOUNDS in src/game/singapore.ts, padded slightly so POIs just past
// the edge still show up for a spawn placed near the boundary.
const BOUNDS = { minLat: 1.19, maxLat: 1.49, minLng: 103.59, maxLng: 104.06 };

// Degrees per query cell. Smaller = more requests but less chance of a server
// timeout on the dense central/eastern estates.
const CELL = 0.06;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const DELAY_MS = 2000; // be polite to a free, volunteer-run API
const MAX_RETRIES = 4;
const COORD_DP = 5; // ~1m precision; more is wasted bytes

const POI_FILTERS = [
  'nwr["shop"="supermarket"]',
  'nwr["shop"="convenience"]',
  'nwr["shop"="chemist"]',
  'nwr["amenity"="pharmacy"]',
  'nwr["amenity"="hospital"]',
  'nwr["amenity"="clinic"]',
  'nwr["amenity"="doctors"]',
  'nwr["shop"="hardware"]',
  'nwr["shop"="doityourself"]',
  'nwr["amenity"="fuel"]',
  'nwr["amenity"="police"]',
  'nwr["amenity"="food_court"]',
  'nwr["amenity"="marketplace"]',
  'nwr["amenity"="community_centre"]',
  'nwr["station"="subway"]',
  'nwr["station"="light_rail"]',
];

const BUILDING_FILTERS = ['nwr["building"="apartments"]', 'nwr["building"="residential"]'];

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

/**
 * bbox query for one cell. Shops/amenities get full geometry (mostly point
 * nodes, so cheap) for building outlines; HDB blocks get centroids only —
 * polygon geometry for thousands of blocks times out the free servers, and
 * they render as rectangles anyway.
 */
function buildQuery(s, w, n, e) {
  const bbox = `(${s},${w},${n},${e})`;
  const pois = POI_FILTERS.map((f) => `  ${f}${bbox};`).join('\n');
  const buildings = BUILDING_FILTERS.map((f) => `  ${f}${bbox};`).join('\n');
  return `[out:json][timeout:180];
(
${pois}
);
out geom tags;
(
${buildings}
);
out center tags;`;
}

function ringCentroid(ring) {
  let lat = 0;
  let lng = 0;
  for (const p of ring) {
    lat += p.lat;
    lng += p.lon;
  }
  return { lat: lat / ring.length, lng: lng / ring.length };
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
      outline = ring.map((p) => [round(p.lat), round(p.lon)]);
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

async function fetchCell(query, label) {
  const body = 'data=' + encodeURIComponent(query);
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const endpoint = ENDPOINTS[(attempt - 1) % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'singvive-bake/1.0',
        },
        body,
      });
      // 429 = rate limited, 504 = query timed out server-side. Both retryable.
      if (res.status === 429 || res.status === 504) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.elements ?? [];
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`${label}: gave up after ${MAX_RETRIES} attempts — ${err.message}`);
      }
      const backoff = DELAY_MS * 2 ** attempt;
      console.warn(`  ${label}: ${err.message} — retrying in ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
}

async function main() {
  const cells = [];
  for (let lat = BOUNDS.minLat; lat < BOUNDS.maxLat; lat += CELL) {
    for (let lng = BOUNDS.minLng; lng < BOUNDS.maxLng; lng += CELL) {
      cells.push([lat, lng, Math.min(lat + CELL, BOUNDS.maxLat), Math.min(lng + CELL, BOUNDS.maxLng)]);
    }
  }

  console.log(`Baking Singapore POIs across ${cells.length} cells...`);
  const byId = new Map();
  let failed = 0;

  for (let i = 0; i < cells.length; i++) {
    const [s, w, n, e] = cells[i];
    const label = `cell ${i + 1}/${cells.length}`;
    try {
      const elements = await fetchCell(buildQuery(s, w, n, e), label);
      const parsed = parseElements(elements);
      // Cells overlap at edges and OSM ways span them — dedupe by OSM id.
      for (const p of parsed) byId.set(p.osmId, p);
      console.log(`  ${label}: +${parsed.length} (total ${byId.size})`);
    } catch (err) {
      failed++;
      console.error(`  ${err.message}`);
    }
    if (i < cells.length - 1) await sleep(DELAY_MS);
  }

  if (byId.size === 0) {
    console.error('\nNo POIs fetched — refusing to write an empty file.');
    process.exit(1);
  }
  if (failed > 0) {
    console.error(
      `\n${failed} of ${cells.length} cells failed. public/pois.json will have holes in it.\n` +
        'Re-run before deploying, or those areas will fall back to the simulated world.',
    );
  }

  const pois = [...byId.values()];
  const byCategory = {};
  for (const p of pois) byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const json = JSON.stringify({ generated: new Date().toISOString(), pois });
  writeFileSync(OUT_FILE, json);

  const bytes = statSync(OUT_FILE).size;
  const gz = gzipSync(json).length;
  console.log(`\nWrote public/pois.json — ${pois.length} POIs`);
  console.log(`  ${(bytes / 1e6).toFixed(2)} MB raw, ${(gz / 1e6).toFixed(2)} MB gzipped (what users download)`);
  console.log('  ' + Object.entries(byCategory).map(([k, v]) => `${k}:${v}`).join(' '));
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
