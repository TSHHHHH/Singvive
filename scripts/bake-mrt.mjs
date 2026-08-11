// Build-time MRT/LRT network bake.
//
// Queries Overpass for Singapore's rail network and writes public/mrt.json:
// every station with its official code(s), and every line with its colour,
// ordered station list and drawable track geometry. The game loads it once and
// uses it for both the map overlay and line-aware tunnel travel.
//
//   npm run bake:mrt
//
// Like bake:pois this is NOT part of `npm run build` — run it by hand when the
// network changes (a new line opens roughly once a decade, so: rarely).
//
// Topology comes from the station *codes*, not from the route relations.
// NS1..NS28 is an ordered line by construction, which is both cheaper and far
// more robust than stitching hundreds of OSM way members into a path — the
// relations are used for two things only: the polylines we draw, and deciding
// which lines are actually in service (see IN_SERVICE below).

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(HERE, '../public/mrt.json');

const BOUNDS = { minLat: 1.19, maxLat: 1.49, minLng: 103.59, maxLng: 104.06 };
const BBOX = `(${BOUNDS.minLat},${BOUNDS.minLng},${BOUNDS.maxLat},${BOUNDS.maxLng})`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const DELAY_MS = 5000;
const MAX_RETRIES = 5;
const COORD_DP = 5;
// Track polylines are drawn at city zoom, so they can be simplified far harder
// than building footprints — 8m of wander is sub-pixel until you're standing on
// the platform.
const SIMPLIFY_TOLERANCE_M = 8;

// Official line liveries, keyed by the station-code prefix. This is also the
// order lines are listed in the overlay legend.
const LINES = {
  NS: { name: 'North South Line', color: '#d42e12', mode: 'mrt' },
  EW: { name: 'East West Line', color: '#009645', mode: 'mrt' },
  CG: { name: 'Changi Airport Branch', color: '#009645', mode: 'mrt', parent: 'EW' },
  NE: { name: 'North East Line', color: '#9900aa', mode: 'mrt' },
  CC: { name: 'Circle Line', color: '#fa9e0d', mode: 'mrt' },
  CE: { name: 'Circle Line (Marina Branch)', color: '#fa9e0d', mode: 'mrt', parent: 'CC' },
  DT: { name: 'Downtown Line', color: '#005ec4', mode: 'mrt' },
  TE: { name: 'Thomson-East Coast Line', color: '#9d5b25', mode: 'mrt' },
  JS: { name: 'Jurong Region Line', color: '#0099aa', mode: 'mrt' },
  JE: { name: 'Jurong Region Line (East)', color: '#0099aa', mode: 'mrt', parent: 'JS' },
  JW: { name: 'Jurong Region Line (West)', color: '#0099aa', mode: 'mrt', parent: 'JS' },
  CR: { name: 'Cross Island Line', color: '#97c616', mode: 'mrt' },
  CP: { name: 'Cross Island Line (Punggol)', color: '#97c616', mode: 'mrt', parent: 'CR' },
  BP: { name: 'Bukit Panjang LRT', color: '#748477', mode: 'lrt' },
  // The two loops of an LRT system are one line on the ground and share a
  // single set of route relations, so the west loop hangs off the east the same
  // way an MRT branch hangs off its trunk.
  SE: { name: 'Sengkang LRT', color: '#748477', mode: 'lrt' },
  SW: { name: 'Sengkang LRT (West Loop)', color: '#748477', mode: 'lrt', parent: 'SE' },
  PE: { name: 'Punggol LRT', color: '#748477', mode: 'lrt' },
  PW: { name: 'Punggol LRT (West Loop)', color: '#748477', mode: 'lrt', parent: 'PE' },
};

/**
 * Codes OSM carries ahead of the line actually opening. Circle Line Stage 6
 * renumbers the Marina branch (CE1/CE2) into CC33/CC34 and adds CC30-CC32;
 * until that happens the map holds both numberings at once, and the unopened
 * one would splice phantom stops into the loop. Drop it while the old
 * numbering is still present — when Stage 6 opens and CE disappears from OSM,
 * this rule lapses on its own.
 */
const SUPERSEDED = [{ match: /^CC3[0-4]$/, whilePresent: 'CE1' }];

// Route relations are tagged with the operator's line ref, not a station code.
// First prefix listed owns the relation's geometry — branch tracks are drawn in
// the parent's colour anyway, so they don't need their own shape.
const ROUTE_REF_PREFIXES = {
  NSL: ['NS'],
  EWL: ['EW', 'CG'],
  CCL: ['CC', 'CE'],
  NEL: ['NE'],
  DTL: ['DT'],
  TEL: ['TE'],
  JRL: ['JS', 'JE', 'JW'],
  CRL: ['CR', 'CP'],
  BPLRT: ['BP'],
  SKLRT: ['SE', 'SW'],
  PGLRT: ['PE', 'PW'],
};

/**
 * How each line's stations chain together, beyond "sort by sequence number".
 *
 *   junction  — the code on another line this chain hangs off (branches, and
 *               the LRT loops, which all hang off their MRT interchange).
 *   loop      — the chain runs back to the junction at the far end.
 *   closeTo   — the chain's last station also links back to this code, which is
 *               how the Bukit Panjang lollipop and the closed Circle Line work.
 *   closeIf   — only apply closeTo when this station exists, so an unfinished
 *               line isn't wrongly short-circuited.
 */
const CHAINS = {
  CG: { junction: 'EW4' }, // Tanah Merah -> Expo -> Changi Airport
  CE: { junction: 'CC4' }, // pre-Stage-6 numbering, if the data still has it
  CC: { closeTo: 'CC1', closeIf: 'CC34' }, // Stage 6 closes the loop
  BP: { closeTo: 'BP6' }, // Senja rejoins at Bukit Panjang
  SE: { junction: 'NE16', loop: true },
  SW: { junction: 'NE16', loop: true },
  PE: { junction: 'NE17', loop: true },
  PW: { junction: 'NE17', loop: true },
  JE: { junction: 'JS8' },
  JW: { junction: 'JS8' },
  CP: { junction: 'CR12' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

// --------------------------------------------------------------- twin track --
//
// OSM maps each direction of travel as its own way, so a line arrives as two
// near-parallel rails ~15m apart and draws as a double line at every zoom. The
// two are dropped to one here.
//
// The test is a *cover fraction*, not a nearest-point test, and that distinction
// is the whole design: a twin is covered along its entire length, while the
// Changi branch shares alignment with the East West trunk for a few hundred
// metres out of Tanah Merah and then leaves. Rejecting any way with a point
// near an accepted one would eat every branch at its junction.

const MERGE_TOLERANCE_M = 30; // twins measure ~15m apart; genuine alignments, 60m+
const COVER_FRACTION = 0.9;
const SAMPLE_STEP_M = 20;

// One equirectangular projection for the whole island — everything below is
// plane geometry in metres.
const PROJ_LAT = 1.35;
const M_PER_DEG_LAT = 111000;
const M_PER_DEG_LNG = 111000 * Math.cos((PROJ_LAT * Math.PI) / 180);
const project = ([lat, lng]) => [lng * M_PER_DEG_LNG, lat * M_PER_DEG_LAT];

function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Every vertex, plus a point every SAMPLE_STEP_M along each segment. */
function samplePath(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.floor(len / SAMPLE_STEP_M);
    for (let s = 1; s <= steps; s++) {
      const t = (s * SAMPLE_STEP_M) / len;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    }
    out.push(pts[i]);
  }
  return out;
}

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}

/**
 * One centreline per alignment. Ways are considered longest-first so the trunk
 * is always accepted before its twin — otherwise two twins can each claim to be
 * covered by the other and both survive (or neither does).
 *
 * Linear scan over accepted segments with a bbox reject. The worst line is 76
 * ways over ~400 segments, a few million cheap tests — a spatial index would be
 * faster and not worth the code.
 */
function dedupeWays(ways) {
  const projected = ways.map((w) => w.map(project));
  const order = ways
    .map((_, i) => i)
    .sort((a, b) => pathLength(projected[b]) - pathLength(projected[a]));

  const accepted = []; // [a, b] segment pairs in projected metres
  const covers = (p) => {
    for (const [a, b] of accepted) {
      // Cheap bbox reject before the projection maths.
      if (p[0] < Math.min(a[0], b[0]) - MERGE_TOLERANCE_M) continue;
      if (p[0] > Math.max(a[0], b[0]) + MERGE_TOLERANCE_M) continue;
      if (p[1] < Math.min(a[1], b[1]) - MERGE_TOLERANCE_M) continue;
      if (p[1] > Math.max(a[1], b[1]) + MERGE_TOLERANCE_M) continue;
      if (distToSegment(p, a, b) <= MERGE_TOLERANCE_M) return true;
    }
    return false;
  };

  const keep = [];
  for (const i of order) {
    const pts = projected[i];
    if (pts.length < 2) continue;
    const samples = samplePath(pts);
    let covered = 0;
    for (const s of samples) if (covers(s)) covered++;
    if (accepted.length && covered / samples.length >= COVER_FRACTION) continue;

    keep.push(i);
    for (let k = 1; k < pts.length; k++) accepted.push([pts[k - 1], pts[k]]);
  }
  // Back into input order, so the file stays diff-friendly across re-bakes.
  return keep.sort((a, b) => a - b).map((i) => ways[i]);
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

async function runQuery(label, body) {
  const payload = 'data=' + encodeURIComponent(body);
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
        body: payload,
      });
      // Overpass answers "too busy" and "rate limited" with an HTML/XML error
      // page and a 200, so the body has to be sniffed rather than the status.
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!text.startsWith('{')) throw new Error('server busy (non-JSON response)');
      const json = JSON.parse(text);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`  ${label}: ${json.elements?.length ?? 0} elements in ${secs}s`);
      return json.elements ?? [];
    } catch (err) {
      if (attempt === MAX_RETRIES) throw new Error(`${label}: gave up — ${err.message}`);
      const backoff = DELAY_MS * 2 ** attempt;
      console.warn(`  ${label}: ${err.message} — retrying in ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
}

// LRT stations are tagged station=monorail, some carry no `station` tag at all,
// and the KTM stops carry none of ours — so ask for every railway station in
// the box and let the code refs do the filtering.
const STATIONS_QUERY = `[out:json][timeout:300];
nwr["railway"="station"]${BBOX};
out center tags;`;

// The LRT lines are route=monorail, not light_rail. Sentosa Express and the
// Changi Skytrain come along for the ride and are dropped by ref.
const ROUTES_QUERY = `[out:json][timeout:900];
rel["type"="route"]["route"~"^(subway|light_rail|monorail)$"]${BBOX};
out geom;`;
// ^ deliberately NOT `out geom tags` — adding the `tags` modifier switches
// Overpass to a tags-only print and silently drops every member, geometry and
// all, which reads as a network with no track anywhere.

/** "NS24;NE6;CC1" -> ["NS24","NE6","CC1"], ignoring anything unrecognised. */
function parseCodes(ref) {
  if (!ref) return [];
  return ref
    .split(/[;,/]/)
    .map((s) => /^([A-Z]{2})(\d+)$/.exec(s.trim().toUpperCase().replace(/\s+/g, '')))
    .filter((m) => m && LINES[m[1]])
    .map((m) => `${m[1]}${Number(m[2])}`);
}

const prefixOf = (code) => code.slice(0, 2);
const seqOf = (code) => Number(code.slice(2));
const isUnbuilt = (tags) =>
  Boolean(tags.construction || tags['construction:railway'] || tags.proposed || tags.disused);

/** Which line prefixes are actually open, per the non-construction relations. */
function inServiceLines(relations) {
  const open = new Set();
  for (const rel of relations) {
    const tags = rel.tags ?? {};
    const prefixes = ROUTE_REF_PREFIXES[(tags.ref ?? '').toUpperCase()];
    if (!prefixes || isUnbuilt(tags)) continue;
    for (const p of prefixes) open.add(p);
  }
  return open;
}

/** Codes to ignore because a SUPERSEDED rule's older numbering is still live. */
function supersededCodes(elements) {
  const present = new Set();
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (isUnbuilt(tags)) continue;
    for (const c of parseCodes(tags.ref ?? tags['railway:ref'])) present.add(c);
  }
  const drop = new Set();
  for (const rule of SUPERSEDED) {
    if (!present.has(rule.whilePresent)) continue;
    for (const c of present) if (rule.match.test(c)) drop.add(c);
  }
  return drop;
}

/** Great-circle metres. */
function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * MRT/LRT interchanges (Choa Chu Kang, Sengkang, Punggol) are two OSM stations
 * that share a name and a building but no station code, so code-merging alone
 * leaves them as separate stops — and the LRT loops end up unreachable from the
 * network. Fold same-named stations that are plainly the same place.
 */
const SAME_STATION_M = 400;

function mergeSameName(stations) {
  const byName = new Map();
  for (const s of stations) {
    const key = s.name.toLowerCase();
    const group = byName.get(key);
    if (!group) {
      byName.set(key, [s]);
      continue;
    }
    const into = group.find((g) => haversine(g.lat, g.lng, s.lat, s.lng) <= SAME_STATION_M);
    if (!into) {
      group.push(s);
      continue;
    }
    // The element carrying more codes is the better-mapped one; keep its spot.
    const outranks = s.codes.length > into.codes.length;
    for (const c of s.codes) if (!into.codes.includes(c)) into.codes.push(c);
    if (outranks) {
      into.lat = s.lat;
      into.lng = s.lng;
    }
  }
  return [...byName.values()].flat();
}

function parseStations(elements, open) {
  /** every code -> its station object, so interchange halves merge on contact */
  const byCode = new Map();
  const drop = supersededCodes(elements);
  let skipped = 0;

  for (const el of elements) {
    const tags = el.tags ?? {};
    const codes = parseCodes(tags.ref ?? tags['railway:ref']).filter(
      (c) => open.has(prefixOf(c)) && !drop.has(c),
    );
    // No code, an unopened line, or a station still being dug: not our problem.
    if (codes.length === 0 || isUnbuilt(tags)) {
      skipped++;
      continue;
    }
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;

    const name = (tags['name:en'] || tags.name || codes[0])
      .replace(/\s+(MRT|LRT)([\s/-]*(MRT|LRT))?\s*(Station)?$/i, '')
      .trim();

    // A big interchange is often several station elements, one per line. They
    // overlap on at least one code, so merging on that stitches them together.
    const existing = codes.map((c) => byCode.get(c)).find(Boolean);
    if (existing) {
      for (const c of codes) {
        if (!existing.codes.includes(c)) existing.codes.push(c);
        byCode.set(c, existing);
      }
      continue;
    }

    const station = { id: codes[0], name, codes, lat: round(lat), lng: round(lng) };
    for (const c of codes) byCode.set(c, station);
  }

  const stations = mergeSameName([...new Set(byCode.values())]);

  byCode.clear();
  for (const s of stations) {
    // Canonical id is the lowest-sorting code so re-bakes stay stable.
    s.codes.sort((a, b) => (prefixOf(a) === prefixOf(b) ? seqOf(a) - seqOf(b) : a < b ? -1 : 1));
    s.id = [...s.codes].sort()[0];
    for (const c of s.codes) byCode.set(c, s);
  }
  return { stations, byCode, skipped };
}

/**
 * Ordered station codes per line: sequence order, with branches hung off their
 * junction and loops closed. The result is what the travel graph consumes —
 * consecutive entries are adjacent on the ground.
 */
function buildChains(byCode) {
  const byPrefix = new Map();
  for (const code of byCode.keys()) {
    const p = prefixOf(code);
    if (!byPrefix.has(p)) byPrefix.set(p, []);
    byPrefix.get(p).push(code);
  }

  const chains = new Map();
  for (const [prefix, codes] of byPrefix) {
    const cfg = CHAINS[prefix] ?? {};
    const chain = codes.sort((a, b) => seqOf(a) - seqOf(b));

    if (cfg.junction && byCode.has(cfg.junction)) {
      chain.unshift(cfg.junction);
      if (cfg.loop) chain.push(cfg.junction);
    }
    if (cfg.closeTo && byCode.has(cfg.closeTo) && (!cfg.closeIf || byCode.has(cfg.closeIf))) {
      if (chain[chain.length - 1] !== cfg.closeTo) chain.push(cfg.closeTo);
    }
    if (chain.length >= 2) chains.set(prefix, chain);
  }
  return chains;
}

/** Track polylines per line prefix, pulled from the OSM route relations. */
function buildShapes(relations) {
  const byPrefix = new Map();
  const seenWays = new Set();

  for (const rel of relations) {
    const tags = rel.tags ?? {};
    if (isUnbuilt(tags)) continue;
    const prefixes = ROUTE_REF_PREFIXES[(tags.ref ?? '').toUpperCase()];
    if (!prefixes) continue;
    const prefix = prefixes[0];

    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    const out = byPrefix.get(prefix);

    for (const m of rel.members ?? []) {
      if (m.type !== 'way' || !m.geometry || m.geometry.length < 2) continue;
      // Both directions of a line are separate relations over the same ways.
      const key = `${prefix}/${m.ref}`;
      if (seenWays.has(key)) continue;
      seenWays.add(key);
      const pts = m.geometry.map((p) => [p.lat, p.lon]);
      out.push(douglasPeucker(pts, SIMPLIFY_TOLERANCE_M).map(([a, b]) => [round(a), round(b)]));
    }
  }

  // Simplify first, dedupe second: by here every way is 4-6 points, so the
  // cover test is cheap and measures exactly the geometry that ships.
  for (const [prefix, ways] of byPrefix) {
    const kept = dedupeWays(ways);
    const ptsBefore = ways.reduce((n, w) => n + w.length, 0);
    const ptsAfter = kept.reduce((n, w) => n + w.length, 0);
    console.log(
      `  ${prefix.padEnd(3)} twin tracks: ${ways.length} -> ${kept.length} ways, ` +
        `${ptsBefore} -> ${ptsAfter} pts`,
    );
    // Losing nearly everything means the tolerance swallowed a real alignment.
    if (ways.length > 20 && ptsAfter < ptsBefore * 0.2) {
      console.warn(`  ${prefix}: dedupe kept under a fifth of the geometry — check MERGE_TOLERANCE_M`);
    }
    byPrefix.set(prefix, kept);
  }
  return byPrefix;
}

async function main() {
  console.log('Baking Singapore rail network...');
  const routeEls = await runQuery('route relations', ROUTES_QUERY);
  await sleep(DELAY_MS);
  const stationEls = await runQuery('stations', STATIONS_QUERY);

  const open = inServiceLines(routeEls);
  console.log(`\n  in service: ${[...open].join(', ')}`);

  const { stations, byCode, skipped } = parseStations(stationEls, open);
  if (stations.length < 100) {
    console.error(`\nOnly ${stations.length} stations parsed — refusing to write.`);
    process.exit(1);
  }
  console.log(`  ${stations.length} stations (${skipped} skipped: uncoded, unbuilt or not rail)`);

  const chains = buildChains(byCode);
  const shapes = buildShapes(routeEls);

  const lines = [];
  for (const [prefix, cfg] of Object.entries(LINES)) {
    const chain = chains.get(prefix);
    if (!chain) continue;
    const shape = shapes.get(prefix) ?? [];
    lines.push({
      code: prefix,
      name: cfg.name,
      color: cfg.color,
      mode: cfg.mode,
      parent: cfg.parent ?? null,
      stations: chain,
      shape,
    });
    const pts = shape.reduce((n, s) => n + s.length, 0);
    console.log(
      `  ${prefix.padEnd(3)} ${String(chain.length).padStart(3)} stops, ` +
        `${String(shape.length).padStart(3)} ways / ${pts} pts`,
    );
  }

  // A branch draws on its parent's track, so only a top-level line with no
  // geometry at all is a problem — the overlay falls back to joining stops.
  const bare = lines.filter((l) => l.shape.length === 0 && !l.parent).map((l) => l.code);
  if (bare.length) {
    console.warn(`\n  no track geometry for: ${bare.join(', ')} — overlay will join stops`);
  }

  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    attribution: '© OpenStreetMap contributors (ODbL)',
    lines,
    stations: stations.sort((a, b) => (a.id < b.id ? -1 : 1)),
  };

  const json = JSON.stringify(payload);
  writeFileSync(OUT_FILE, json);
  console.log(`\nWrote ${OUT_FILE} — ${(json.length / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
