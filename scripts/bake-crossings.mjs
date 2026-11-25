// Bridge decks that the land / water mask cannot represent.
//
// Reads the committed `public/zones.json`, asks Overpass for every OSM
// highway bridge, keeps the ones whose deck crosses masked water (sea or a
// `water` ring), and writes them back into the same file as `crossings`.
// Runtime treats each deck as walkable (src/game/crossings.ts); restricted
// ground still wins.
//
//   npm run bake:crossings
//   npm run bake:crossings -- --fresh   # ignore cached Overpass tiles
//
// Run after `bake:zones` — the filter depends on the water rings. NOT part
// of `npm run build`.
//
// Data: OpenStreetMap contributors (ODbL).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inPolygon } from '../src/game/singapore.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ZONES_FILE = resolve(HERE, '../public/zones.json');

const BOUNDS = { minLat: 1.19, maxLat: 1.49, minLng: 103.59, maxLng: 104.06 };
const TILE_GRID = 5;
/** Tile responses are cached here so a 502 halfway through does not lose the rest. */
const CACHE_DIR = join(tmpdir(), 'singvive-bake-crossings');
const fresh = process.argv.includes('--fresh');
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const DELAY_MS = 5000;
const MAX_RETRIES = 5;

const M_LAT = 111_320;
const M_LNG = M_LAT * Math.cos((1.35 * Math.PI) / 180);
/** Sample spacing along a deck when testing it against the mask. */
const SAMPLE_M = 4;
/** How far a bridge end may be pushed along its heading to reach dry ground. */
const MAX_EXTEND_M = 80;
const EXTEND_STEP_M = 5;
const SIMPLIFY_M = 1.5;
const COORD_DP = 6;

/** Highway classes that are not walkable decks. */
const SKIP_HIGHWAY = /^(construction|proposed|abandoned|disused|platform|corridor|elevator|raceway|bus_guideway|escape)$/;

/** Deck half-width from the highway class; capsules match runtime. */
function halfWidthFor(highway) {
  switch (highway) {
    case 'motorway':
    case 'trunk':
    case 'motorway_link':
    case 'trunk_link':
      return 12;
    case 'primary':
    case 'secondary':
    case 'primary_link':
    case 'secondary_link':
      return 9;
    case 'tertiary':
    case 'tertiary_link':
    case 'residential':
    case 'unclassified':
    case 'service':
    case 'living_street':
      return 7;
    default:
      return 5; // footway, cycleway, path, pedestrian, steps, track
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Number(n.toFixed(COORD_DP));

function indexRings(rings) {
  return rings.map((ring) => {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const [lat, lng] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    return { ring, minLat, maxLat, minLng, maxLng };
  });
}

function inAny(lat, lng, idx) {
  for (const r of idx) {
    if (lat < r.minLat || lat > r.maxLat || lng < r.minLng || lng > r.maxLng) continue;
    if (inPolygon(lat, lng, r.ring)) return true;
  }
  return false;
}

function distM(a, b) {
  return Math.hypot((b[0] - a[0]) * M_LAT, (b[1] - a[1]) * M_LNG);
}

function perpM(p, a, b) {
  const dx = (b[1] - a[1]) * M_LNG;
  const dy = (b[0] - a[0]) * M_LAT;
  const px = (p[1] - a[1]) * M_LNG;
  const py = (p[0] - a[0]) * M_LAT;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
  return Math.hypot(px - t * dx, py - t * dy);
}

function douglasPeucker(points, tol) {
  if (points.length <= 2) return points;
  let maxD = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpM(points[i], points[0], points[points.length - 1]);
    if (d > maxD) {
      maxD = d;
      index = i;
    }
  }
  if (maxD <= tol) return [points[0], points[points.length - 1]];
  const left = douglasPeucker(points.slice(0, index + 1), tol);
  const right = douglasPeucker(points.slice(index), tol);
  return [...left.slice(0, -1), ...right];
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
        signal: AbortSignal.timeout(240_000),
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

/**
 * Join bridge ways that meet end to end (a deck split into several OSM ways,
 * often mid-span). A shared end used by exactly two chains is merged; a
 * T-junction is left alone (runtime links nearby deck ends instead).
 */
function stitch(chains) {
  const key = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  let merged = true;
  while (merged) {
    merged = false;
    const ends = new Map();
    chains.forEach((c, i) => {
      for (const k of [key(c.points[0]), key(c.points[c.points.length - 1])]) {
        const list = ends.get(k) ?? [];
        list.push(i);
        ends.set(k, list);
      }
    });
    for (const [k, list] of ends) {
      if (list.length !== 2 || list[0] === list[1]) continue;
      const [ia, ib] = list;
      let a = chains[ia].points;
      let b = chains[ib].points;
      if (key(a[a.length - 1]) !== k) a = [...a].reverse();
      if (key(b[0]) !== k) b = [...b].reverse();
      const next = {
        ids: [...chains[ia].ids, ...chains[ib].ids],
        halfWidthM: Math.max(chains[ia].halfWidthM, chains[ib].halfWidthM),
        points: [...a, ...b.slice(1)],
      };
      chains = chains.filter((_, i) => i !== ia && i !== ib);
      chains.push(next);
      merged = true;
      break;
    }
  }
  return chains;
}

async function main() {
  console.log('bake:crossings — OSM highway bridges over masked water');
  const zones = JSON.parse(readFileSync(ZONES_FILE, 'utf8'));
  const landIdx = indexRings(zones.land ?? []);
  const waterIdx = indexRings(zones.water ?? []);
  const blocked = (p) => !inAny(p[0], p[1], landIdx) || inAny(p[0], p[1], waterIdx);

  // One island-wide query 502s; tile it and dedupe by way id.
  const els = [];
  const seenIds = new Set();
  const latStep = (BOUNDS.maxLat - BOUNDS.minLat) / TILE_GRID;
  const lngStep = (BOUNDS.maxLng - BOUNDS.minLng) / TILE_GRID;
  for (let iy = 0; iy < TILE_GRID; iy++) {
    for (let ix = 0; ix < TILE_GRID; ix++) {
      const box = `(${(BOUNDS.minLat + iy * latStep).toFixed(4)},${(BOUNDS.minLng + ix * lngStep).toFixed(4)},${(
        BOUNDS.minLat + (iy + 1) * latStep
      ).toFixed(4)},${(BOUNDS.minLng + (ix + 1) * lngStep).toFixed(4)})`;
      const cacheFile = join(CACHE_DIR, `${TILE_GRID}-${iy}-${ix}.json`);
      let tile;
      if (!fresh && existsSync(cacheFile)) {
        tile = JSON.parse(readFileSync(cacheFile, 'utf8'));
        console.log(`  ✓ bridges tile ${iy},${ix} (cached)`);
      } else {
        tile = await runQuery(`bridges tile ${iy},${ix}`, `[out:json][timeout:180];
way["highway"]["bridge"]["bridge"!="no"]${box};
out geom;`);
        mkdirSync(CACHE_DIR, { recursive: true });
        writeFileSync(cacheFile, JSON.stringify(tile));
        await sleep(DELAY_MS);
      }
      for (const el of tile) {
        if (seenIds.has(el.id)) continue;
        seenIds.add(el.id);
        els.push(el);
      }
    }
  }

  let chains = [];
  for (const el of els) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const highway = el.tags?.highway ?? '';
    if (SKIP_HIGHWAY.test(highway)) continue;
    chains.push({
      ids: [el.id],
      halfWidthM: halfWidthFor(highway),
      points: el.geometry.map((g) => [g.lat, g.lon]),
    });
  }
  console.log(`  bridge ways: ${chains.length}`);
  chains = stitch(chains);
  console.log(`  after stitching: ${chains.length}`);

  const out = [];
  let extended = 0;
  let wetEnds = 0;
  let unreachable = 0;
  for (const c of chains) {
    // Keep only decks that cross water in the committed mask.
    let wet = false;
    for (let i = 1; i < c.points.length && !wet; i++) {
      const a = c.points[i - 1];
      const b = c.points[i];
      const n = Math.max(1, Math.ceil(distM(a, b) / SAMPLE_M));
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        if (blocked([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) {
          wet = true;
          break;
        }
      }
    }
    if (!wet) continue;

    // The simplified shoreline can sit past the real bank. Push each end out
    // along its heading until it reaches dry ground, so routes can attach.
    const pts = [...c.points];
    for (const atStart of [true, false]) {
      const end = atStart ? pts[0] : pts[pts.length - 1];
      if (!blocked(end)) continue;
      const prev = atStart ? pts[1] : pts[pts.length - 2];
      const len = distM(prev, end);
      if (len === 0) continue;
      const uLat = (end[0] - prev[0]) / len;
      const uLng = (end[1] - prev[1]) / len;
      let landed = null;
      for (let d = EXTEND_STEP_M; d <= MAX_EXTEND_M; d += EXTEND_STEP_M) {
        const p = [end[0] + uLat * d, end[1] + uLng * d];
        if (!blocked(p)) {
          landed = p;
          break;
        }
      }
      if (landed) {
        extended++;
        if (atStart) pts.unshift(landed);
        else pts.push(landed);
      } else {
        wetEnds++;
      }
    }

    // A deck with no dry vertex (Johor, offshore, a pier into open sea) is
    // unreachable from the playable island.
    if (!pts.some((p) => !blocked(p))) {
      unreachable++;
      continue;
    }

    const simplified = douglasPeucker(pts, SIMPLIFY_M).map(([lat, lng]) => [round(lat), round(lng)]);
    out.push({ id: c.ids[0], halfWidthM: c.halfWidthM, points: simplified });
  }
  out.sort((a, b) => a.id - b.id);

  zones.crossings = out;
  writeFileSync(ZONES_FILE, JSON.stringify(zones));
  const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(1);
  console.log(
    `wrote ${out.length} crossings (${kb} KB) into ${ZONES_FILE} — ends extended=${extended} still wet=${wetEnds} unreachable=${unreachable}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
