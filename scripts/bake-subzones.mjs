// URA subzone borders for the run map's district lines (Division-style map
// divisions: Tiong Bahru, Toa Payoh Central, Bras Basah…).
//
// Downloads Master Plan 2019 Subzone Boundary (No Sea) from data.gov.sg, keeps
// each shared border once (neighbouring subzones share vertices), chains the
// segments into polylines and simplifies them. Lines only: the map draws them
// as a thin static layer.
//
//   npm run bake:subzones
//   npm run bake:subzones -- --from tmp/hazard-areas/subzones.geojson
//
// Output: public/subzones.json
//   { generated, source, lines: [[lat5, lng5, dLat5, dLng5, ...], ...] }
// First vertex absolute in 1e-5 degrees, the rest as deltas.
//
// NOT part of `npm run build`. Commit the result.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(HERE, '../public/subzones.json');

const DATASET_ID = 'd_8594ae9ff96d0c708bc2af633048edfb';
const POLL_URL = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET_ID}/poll-download`;
const SOURCE = 'URA Master Plan 2019 Subzone Boundary (No Sea)';

// Drawn from z12 up; ~6 m keeps street-following edges crisp at z16.
const SIMPLIFY_M = 6;
/** Rings smaller than this (slivers, tiny islets) are dropped. */
const MIN_RING_M2 = 20_000;
const M_LAT = 111000;
const M_LNG = 111000 * Math.cos((1.35 * Math.PI) / 180);

async function download() {
  const headers = { 'User-Agent': 'singvive-bake/1.0', Accept: 'application/json' };
  for (let i = 0; i < 10; i++) {
    const poll = await fetch(POLL_URL, { headers });
    if (!poll.ok) throw new Error(`poll-download ${poll.status}`);
    const body = await poll.json();
    const url = body?.data?.url;
    if (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`download ${res.status}`);
      return res.json();
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('poll-download never returned a url');
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * M_LNG * (y2 * M_LAT) - x2 * M_LNG * (y1 * M_LAT);
  }
  return Math.abs(a / 2);
}

function perp(p, a, b) {
  const px = p[1] * M_LNG, py = p[0] * M_LAT;
  const ax = a[1] * M_LNG, ay = a[0] * M_LAT;
  const bx = b[1] * M_LNG, by = b[0] * M_LAT;
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function dp(pts, tol) {
  if (pts.length <= 2) return pts;
  let max = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)];
}

const fromIdx = process.argv.indexOf('--from');
const data = fromIdx > 0 ? JSON.parse(readFileSync(resolve(process.argv[fromIdx + 1]), 'utf8')) : await download();

// 1. Every ring edge, keyed so a border shared by two subzones counts once.
const key = (p) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
const edges = new Map();
for (const f of data.features) {
  const g = f.geometry;
  const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  for (const poly of polys) {
    for (const ring of poly) {
      if (ringArea(ring) < MIN_RING_M2) continue;
      for (let i = 0; i + 1 < ring.length; i++) {
        const a = [ring[i][1], ring[i][0]];
        const b = [ring[i + 1][1], ring[i + 1][0]];
        const ka = key(a);
        const kb = key(b);
        if (ka === kb) continue;
        const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        if (!edges.has(k)) edges.set(k, [a, b, ka, kb]);
      }
    }
  }
}

// 2. Chain edges into polylines, breaking at junctions (degree != 2).
const adj = new Map();
for (const [k, [, , ka, kb]] of edges) {
  for (const n of [ka, kb]) {
    if (!adj.has(n)) adj.set(n, []);
    adj.get(n).push(k);
  }
}
const point = new Map();
for (const [a, b, ka, kb] of edges.values()) {
  point.set(ka, a);
  point.set(kb, b);
}
const used = new Set();
const lines = [];
const walk = (start, firstEdge) => {
  const line = [point.get(start)];
  let node = start;
  let edge = firstEdge;
  while (edge && !used.has(edge)) {
    used.add(edge);
    const [, , ka, kb] = edges.get(edge);
    node = node === ka ? kb : ka;
    line.push(point.get(node));
    const next = adj.get(node);
    if (next.length !== 2) break;
    edge = next[0] === edge ? next[1] : next[0];
  }
  return line;
};
for (const [n, list] of adj) if (list.length !== 2) for (const e of list) if (!used.has(e)) lines.push(walk(n, e));
for (const [n, list] of adj) for (const e of list) if (!used.has(e)) lines.push(walk(n, e));

// 3. Simplify and encode.
const out = [];
let pts = 0;
for (const line of lines) {
  const s = dp(line, SIMPLIFY_M);
  if (s.length < 2) continue;
  const ints = s.map(([lat, lng]) => [Math.round(lat * 1e5), Math.round(lng * 1e5)]);
  const enc = [ints[0][0], ints[0][1]];
  for (let i = 1; i < ints.length; i++) enc.push(ints[i][0] - ints[i - 1][0], ints[i][1] - ints[i - 1][1]);
  out.push(enc);
  pts += s.length;
}

writeFileSync(OUT_FILE, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: SOURCE, lines: out }));
console.log(`subzones.json: ${data.features.length} subzones → ${out.length} border lines, ${pts} points`);
