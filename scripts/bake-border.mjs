// Build-time bake of the sealed Singapore–Johor border: the Causeway, the
// Second Link, the RTS Link viaduct, the water mains on the Causeway, the
// checkpoints and Johor Bahru's shore. Writes public/border.json, which the
// run map draws as the border set piece (src/components/BorderLayers.tsx).
//
//   npm run bake:border                       # fetch from Overpass
//   npm run bake:border -- --raw <dir>        # reuse saved Overpass answers
//
// `--raw` expects causeway.json, secondlink.json and coast.json: the raw
// `out geom tags` answers of the three queries below. Manual, committed step,
// like every other bake: never part of `npm run build`.
//
// Data: © OpenStreetMap contributors (ODbL).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(HERE, '../public/border.json');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const STATEMENTS = [
  'way["bridge"]',
  'way["man_made"~"^(bridge|pipeline|pier)$"]',
  'way["railway"]',
  'way["highway"~"^(motorway|trunk|primary|trunk_link|service)$"]',
  'way["natural"="coastline"]',
  'node["barrier"="border_control"]',
];
const around = (bbox) => `[out:json][timeout:90];(${STATEMENTS.map((s) => `${s}(${bbox});`).join('')});out geom tags;`;
const QUERIES = {
  causeway: around('1.440,103.745,1.475,103.800'),
  secondlink: around('1.330,103.600,1.390,103.665'),
  coast: '[out:json][timeout:90];way["natural"="coastline"](1.30,103.58,1.52,104.05);out geom tags;',
};

// --- The ways that make up each structure (OSM way ids) ----------------------
// Checked by hand against the 2026-11-18 extract; the bake fails loudly if any
// of them disappears, rather than drawing a bridge somewhere else.

/** Causeway, SG shore → JB CIQ: the open-water bridge span, then the embankment. */
const CAUSEWAY_SPAN = [523631514];
const CAUSEWAY_EMBANKMENT = [166328705];
/** The three overground water mains laid along the Causeway. */
const CAUSEWAY_PIPES = [1392104467, 1392104468, 1392104469];
/** Northbound lanes on the Singapore approach, Woodlands Checkpoint → shore. */
const CAUSEWAY_QUEUE = [709126761];
/** RTS Link viaduct, Woodlands North → Bukit Chagar. */
const RTS = [932909312];
/** The Second Link's own outline (man_made=bridge). */
const SECOND_LINK_OUTLINE = 1161929378;
/** Singapore-side approach into Tuas Checkpoint. */
const SECOND_LINK_QUEUE = [762283055];

const COORD_DP = 6;
const round = (v) => Math.round(v * 10 ** COORD_DP) / 10 ** COORD_DP;
const pt = (p) => [round(p.lon), round(p.lat)];

async function overpass(query) {
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'singvive-bake/1.0',
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (res.ok) return await res.json();
      last = new Error(`${url} → ${res.status}`);
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, 6000 * (attempt + 1)));
  }
  throw last;
}

async function load(name, rawDir) {
  if (rawDir) return JSON.parse(readFileSync(resolve(rawDir, `${name}.json`), 'utf8'));
  const data = await overpass(QUERIES[name]);
  await new Promise((r) => setTimeout(r, 6000));
  return data;
}

function wayById(data, id) {
  const w = data.elements.find((e) => e.type === 'way' && e.id === id);
  if (!w?.geometry?.length) throw new Error(`OSM way ${id} missing from the extract`);
  return w;
}

/** Join ways end to start, in the order given, into one line. */
function chain(data, ids) {
  const out = [];
  for (const id of ids) {
    const pts = wayById(data, id).geometry.map(pt);
    if (out.length && out.at(-1)[0] === pts[0][0] && out.at(-1)[1] === pts[0][1]) pts.shift();
    out.push(...pts);
  }
  return out;
}

// --- Coastline --------------------------------------------------------------

const M_LAT = 111_320;
const M_LNG = M_LAT * Math.cos((1.4 * Math.PI) / 180);

function perpDistM(p, a, b) {
  const ax = a[0] * M_LNG, ay = a[1] * M_LAT;
  const dx = b[0] * M_LNG - ax, dy = b[1] * M_LAT - ay;
  const px = p[0] * M_LNG - ax, py = p[1] * M_LAT - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
  return Math.hypot(px - t * dx, py - t * dy);
}

function simplify(points, tolM) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let best = -1, bestD = tolM;
    for (let k = i + 1; k < j; k++) {
      const d = perpDistM(points[k], points[i], points[j]);
      if (d > bestD) { bestD = d; best = k; }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i, best], [best, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Johor's mainland coast is one long open chain across the strait (west → east,
 * land on the left). Stitch the coastline ways by shared end points, keep the
 * longest chain that touches the Causeway's Johor end, and close it to the north.
 */
function johorShore(coast) {
  const key = (p) => `${p[0]},${p[1]}`;
  const ways = coast.elements
    .filter((e) => e.type === 'way' && e.geometry?.length > 1)
    .map((e) => e.geometry.map(pt));
  const byStart = new Map(ways.map((w) => [key(w[0]), w]));
  const ends = new Set(ways.map((w) => key(w.at(-1))));
  const chains = [];
  const used = new Set();
  for (const w of ways) {
    if (used.has(w) || ends.has(key(w[0]))) continue; // start only at a chain head
    const line = [];
    for (let x = w; x && !used.has(x); x = byStart.get(key(x.at(-1)))) {
      used.add(x);
      line.push(...(line.length ? x.slice(1) : x));
    }
    chains.push(line);
  }
  const johor = chains
    .filter((c) => c.some(([lng, lat]) => lat > 1.455 && lat < 1.47 && lng > 103.76 && lng < 103.78))
    .sort((a, b) => b.length - a.length)[0];
  if (!johor) throw new Error('Johor coastline chain not found');
  const shore = simplify(johor, 6);
  const north = 1.62;
  return [...shore, [shore.at(-1)[0], north], [shore[0][0], north], shore[0]];
}

function centroid(nodes) {
  let lat = 0, lng = 0;
  for (const n of nodes) { lat += n.lat; lng += n.lon; }
  return { lat: round(lat / nodes.length), lng: round(lng / nodes.length) };
}

function checkpoints(data, test) {
  return data.elements.filter((e) => e.type === 'node' && e.tags?.barrier === 'border_control' && test(e));
}

async function main() {
  const rawAt = process.argv.indexOf('--raw');
  const rawDir = rawAt > 0 ? resolve(process.cwd(), process.argv[rawAt + 1]) : null;
  const causeway = await load('causeway', rawDir);
  const secondlink = await load('secondlink', rawDir);
  const coast = await load('coast', rawDir);

  const outline = wayById(secondlink, SECOND_LINK_OUTLINE).geometry.map(pt);

  const out = {
    generated: new Date().toISOString().slice(0, 10),
    attribution: '© OpenStreetMap contributors (ODbL)',
    causeway: {
      span: chain(causeway, CAUSEWAY_SPAN),
      embankment: chain(causeway, CAUSEWAY_EMBANKMENT),
      pipes: CAUSEWAY_PIPES.map((id) => chain(causeway, [id])),
      queue: chain(causeway, CAUSEWAY_QUEUE),
    },
    secondLink: {
      outline,
      queue: chain(secondlink, SECOND_LINK_QUEUE),
    },
    rts: chain(causeway, RTS),
    checkpoints: {
      woodlands: centroid(checkpoints(causeway, (n) => n.lat < 1.45)),
      johorBahru: centroid(checkpoints(causeway, (n) => n.lat > 1.46)),
      tuas: centroid(checkpoints(secondlink, () => true)),
    },
    johorShore: johorShore(coast),
  };
  const json = JSON.stringify(out);
  writeFileSync(OUT_FILE, json);
  console.log(`wrote ${OUT_FILE} (${(json.length / 1024).toFixed(1)} KB, shore ${out.johorShore.length} pts)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
