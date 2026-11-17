// Hazard anchor sites: real campuses, markets, stations and estates that the
// wilds field can turn into themed zones (quarantined school, flooded market…).
//
// Derived only from data already committed (public/pois.json + the
// public/poi-data outline chunks), so it needs no network. Re-run after
// `bake:pois` / `pack:pois` changes the POI revision.
//
//   npm run bake:hazard-sites
//
// Output: public/hazard-sites.json
//   { generated, revision, categories: [...], sites: [[osmId, cat, lat5, lng5, dLat5, dLng5, ...], ...] }
// `cat` indexes `categories`. The ring is the convex hull of the site
// footprint in 1e-5 degree integers: first vertex absolute, the rest as deltas
// from the previous vertex (keeps the file small). Names stay in the POI bake;
// the UI looks them up by osmId. The game buffers the hull at runtime, so
// hit-testing and drawing share one shape.
//
// NOT part of `npm run build`.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const POIS = resolve(ROOT, 'public/pois.json');
const CHUNKS = resolve(ROOT, 'public/poi-data');
const OUT = resolve(ROOT, 'public/hazard-sites.json');

const M_PER_DEG_LAT = 111000;
const M_PER_DEG_LNG = 111000 * Math.cos((1.35 * Math.PI) / 180);

/**
 * Which categories can anchor a zone, and the footprint area (m²) a site needs
 * to count. Tuition centres inside malls are mapped as `school` too; the floor
 * keeps only real campuses. The ceiling drops sprawling grounds (universities,
 * port yards) that would swallow a whole district.
 */
const ELIGIBLE = {
  school: { min: 6000, max: 120000 },
  hospital: { min: 3000, max: 120000 },
  foodcourt: { min: 700, max: 30000 },
  supermarket: { min: 900, max: 40000 },
  mrt: { min: 1500, max: 40000 },
  industrial: { min: 1500, max: 40000 },
  police: { min: 500, max: 30000 },
  residential: { min: 400, max: 6000 },
};

const MAX_HULL_PTS = 10;
/** HDB slabs are near-rectangles; six points hold the shape. */
const MAX_HULL_PTS_RESIDENTIAL = 6;

function xy([lat, lng]) {
  return { x: lng * M_PER_DEG_LNG, y: lat * M_PER_DEG_LAT };
}

function area(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = xy(ring[i]);
    const q = xy(ring[(i + 1) % ring.length]);
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

function cross(o, a, b) {
  return (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
}

/** Monotone-chain hull on [lat,lng] (x = lng, y = lat). Counter-clockwise. */
function hull(points) {
  const p = [...new Map(points.map((q) => [`${q[0]},${q[1]}`, q])).values()].sort(
    (a, b) => a[1] - b[1] || a[0] - b[0],
  );
  if (p.length < 3) return p;
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Drop the hull vertex whose removal loses the least area until under the cap. */
function capHull(ring, max) {
  const r = ring.slice();
  while (r.length > max) {
    let best = 0;
    let bestLoss = Infinity;
    for (let i = 0; i < r.length; i++) {
      const loss = area([r[(i - 1 + r.length) % r.length], r[i], r[(i + 1) % r.length]]);
      if (loss < bestLoss) {
        bestLoss = loss;
        best = i;
      }
    }
    r.splice(best, 1);
  }
  return r;
}

const CATEGORIES = Object.keys(ELIGIBLE);

const { pois } = JSON.parse(readFileSync(POIS, 'utf8'));
const outlines = new Map();
let revision = '';
for (const dir of readdirSync(CHUNKS)) {
  revision = dir;
  for (const f of readdirSync(resolve(CHUNKS, dir))) {
    const chunk = JSON.parse(readFileSync(resolve(CHUNKS, dir, f), 'utf8'));
    if (!chunk.outlines) continue;
    for (const [id, ring] of Object.entries(chunk.outlines)) outlines.set(id, ring);
  }
}

const sites = [];
const counts = {};
for (const p of pois) {
  const rule = ELIGIBLE[p.category];
  if (!rule) continue;
  const ring = p.outline ?? outlines.get(p.osmId);
  if (!ring || ring.length < 3) continue;
  const h = hull(ring);
  if (h.length < 3) continue;
  const a = area(h);
  if (a < rule.min || a > rule.max) continue;
  const capped = capHull(h, p.category === 'residential' ? MAX_HULL_PTS_RESIDENTIAL : MAX_HULL_PTS).map(([lat, lng]) => [Math.round(lat * 1e5), Math.round(lng * 1e5)]);
  const enc = [capped[0][0], capped[0][1]];
  for (let i = 1; i < capped.length; i++) enc.push(capped[i][0] - capped[i - 1][0], capped[i][1] - capped[i - 1][1]);
  sites.push([p.osmId, CATEGORIES.indexOf(p.category), ...enc]);
  counts[p.category] = (counts[p.category] ?? 0) + 1;
}
sites.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

writeFileSync(
  OUT,
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), revision, categories: CATEGORIES, sites }),
);
console.log(`hazard-sites.json: ${sites.length} sites`, counts);
