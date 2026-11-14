// Offline, reproducible planning-area coverage audit. No gameplay/runtime cost.
// node scripts/audit-pois.mjs [--before old-pois.json] [--out report.md]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { inRing } from './hdb-reference.mjs';

const argument = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const bake = JSON.parse(readFileSync(new URL('../public/pois.json', import.meta.url), 'utf8'));
const towns = JSON.parse(readFileSync(new URL('../public/towns.json', import.meta.url), 'utf8'));
const beforePath = argument('--before', null);
const before = beforePath ? JSON.parse(readFileSync(beforePath, 'utf8')).pois : bake.pois;
const inside = (lat, lng, polygons) => polygons.some((rings) =>
  inRing(lat, lng, rings[0]) && !rings.slice(1).some((r) => inRing(lat, lng, r)));
const metresLat = 111000;
const metresLng = 111000 * Math.cos(1.35 * Math.PI / 180);
function area(ring) {
  const [lat0, lng0] = ring[0];
  let twice = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twice += (ring[j][0] - lat0) * (ring[i][1] - lng0) - (ring[i][0] - lat0) * (ring[j][1] - lng0);
  }
  return Math.abs(twice) / 2 * metresLat * metresLng / 1e6;
}
const rows = towns.areas.map((town) => {
  const pois = bake.pois.filter((p) => inside(p.lat, p.lng, town.polygons));
  const old = before.filter((p) => inside(p.lat, p.lng, town.polygons));
  const km2 = town.polygons.reduce((sum, rings) => sum + area(rings[0]) - rings.slice(1).reduce((s, r) => s + area(r), 0), 0);
  const points = town.polygons.flatMap((rings) => rings[0]);
  const minLat = Math.min(...points.map((p) => p[0]));
  const maxLat = Math.max(...points.map((p) => p[0]));
  const minLng = Math.min(...points.map((p) => p[1]));
  const maxLng = Math.max(...points.map((p) => p[1]));
  let samples = 0, gaps = 0;
  // Uniform 250m sample grid. Neighbours across planning-area boundaries count.
  const near = bake.pois.filter((p) => p.lat > minLat - 0.005 && p.lat < maxLat + 0.005 && p.lng > minLng - 0.005 && p.lng < maxLng + 0.005);
  for (let lat = minLat + 125 / metresLat; lat < maxLat; lat += 250 / metresLat) {
    for (let lng = minLng + 125 / metresLng; lng < maxLng; lng += 250 / metresLng) {
      if (!inside(lat, lng, town.polygons)) continue;
      samples++;
      if (!near.some((p) => Math.hypot((lat - p.lat) * metresLat, (lng - p.lng) * metresLng) <= 500)) gaps++;
    }
  }
  return { name: town.name, old: old.length, count: pois.length,
    hdb: pois.filter((p) => p.category === 'residential').length,
    km2, density: pois.length / km2, gap: samples ? 100 * gaps / samples : 0 };
}).sort((a, b) => a.density - b.density);
const counts = bake.pois.reduce((out, p) => ({ ...out, [p.category]: (out[p.category] ?? 0) + 1 }), {});
const output = [
  '# Singapore location coverage audit', '',
  `Generated from the committed POI bake (${bake.generated}) and ${towns.source} boundaries.`, '',
  ...(bake.expansion ? [`Expansion source snapshot: ${bake.expansion.expanded}. Original bake timestamp is preserved above.`, ''] : []),
  `- Baseline: ${before.length} POIs. Current bake: ${bake.pois.length} (${bake.pois.length - before.length >= 0 ? '+' : ''}${bake.pois.length - before.length}).`,
  `- Verified HDBs: ${before.filter((p) => p.category === 'residential').length} before; ${counts.residential ?? 0} now.`,
  `- Duplicate OSM IDs: ${bake.pois.length - new Set(bake.pois.map((p) => p.osmId)).size}.`,
  `- Outlined locations: ${bake.pois.filter((p) => p.outline?.length >= 3).length}.`, '',
  'HDB checks require both OSM apartments/residential tags (without an amenity) and a pin inside an official HDB building footprint. Unmatched does **not** mean proven fake: concave outlines, position error, outdated sources and missing tags can reject real blocks. We fail closed for HDB gameplay.', '',
  '## Planning areas, sparsest first', '',
  '| Area | Before | Now | HDB | km² | POIs/km² | Samples >500m from a POI |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...rows.map((r) => `| ${r.name} | ${r.old} | ${r.count} | ${r.hdb} | ${r.km2.toFixed(1)} | ${r.density.toFixed(1)} | ${r.gap.toFixed(0)}% |`), '',
  '## Interpretation and limits', '',
  '- These are available baked sites, before runtime caps, deduplication and walkability filtering. They are not a census of all real places.',
  '- Gap percentages use a 250m sample grid and 500m straight-line radius, not walkable routes. Inland water, restricted land, parks and undeveloped plots are included in planning-area area; naturally empty land is not evidence of missing shops.',
  '- The committed towns overlay omits Central and Western Water Catchment. Islands and locations outside its polygons are not assigned to a row; totals need not sum to the bake.',
  '- New HDBs use ~122m sampling cells, ordinary residences ~200m, eateries ~72m. Dense areas remain capped to 220 sites / 100 HDBs / 50 ordinary residences / 50 eateries per world chunk. Raising the global count alone does not guarantee better local coverage.',
  '- This audit independently validates HDB identity only. Other categories retain their existing OSM evidence and may need separate classification reviews.', '',
  '## Adding real locations', '',
  '1. Prioritise populated low-density areas (especially private-housing districts), then examine individual 500m gaps. Keep reservoirs, military grounds and empty reclaimed land sparse.',
  '2. NEA hawkers and PA community clubs are now imported with proximity/name/footprint deduplication. Future official MOH clinics and MOE schools could complement OSM.',
  '3. Ordinary housing, community sites, parks and eateries now have separate categories. Only independently verified HDBs open block interiors.',
  '4. Refresh the cached HDB/OSM sources for new estates. This expansion preserves prior IDs and fills remaining sampling cells; it does not remove stale baseline sites.',
  '5. Repeat this report after each targeted addition; measure filled gaps, source provenance and payload growth rather than raw POI count.', '',
  'Sources: [HDB Existing Building](https://data.gov.sg/datasets/d_16b157c52ed637edd6ba1232e026258d/view), [NEA Hawker Centres](https://data.gov.sg/datasets/d_4a086da0a5553be1d89383cd90d07ecd/view), [PA Community Clubs](https://data.gov.sg/datasets/d_f706de1427279e61fe41e89e24d440fa/view), [OpenStreetMap](https://www.openstreetmap.org/copyright), and committed URA planning-area polygons. PA source attributes date to 2021 and NEA to 2024; source snapshots can lag closures or relocations. OSM timestamps and input hashes are in location-expansion.json.', '',
  '## Category counts', '',
  ...Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `- ${name}: ${count}`), '',
].join('\n');
const path = argument('--out', 'reports/location-audit.md');
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, output);
console.log(`Wrote ${path}`);
console.table(rows.map(({ name, count, density, gap }) => ({ name, count, density: density.toFixed(1), gap: gap.toFixed(0) + '%' })));
