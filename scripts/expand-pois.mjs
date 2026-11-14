// Explicit offline addition pass. Original sources live in the fetch cache, never runtime.
// node --experimental-strip-types scripts/expand-pois.mjs --hdb <HDB.geojson> [--base <pois.json>]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { writePoiRevision } from './poi-revision.mjs';
import { classifyOsm, POI_CONFIG } from '../src/game/poi.ts';
import { inSingapore } from '../src/game/singapore.ts';
import { loadHdbReference, writeHdbRegistry, HDB_SOURCE } from './hdb-reference.mjs';
import { zoneContains, verifiedFootprint, sourceName, activeSource, activeGovernmentRecord, sourceProperties, sameVenue, distance, round } from './location-expansion.mjs';

const arg = (key, fallback) => process.argv.includes(key) ? process.argv[process.argv.indexOf(key) + 1] : fallback;
const directory = resolve(arg('--cache', 'tmp/location-sources'));
const base = JSON.parse(readFileSync(arg('--base', 'public/pois.json'), 'utf8'));
const hdbPath = arg('--hdb', undefined);
const reference = await loadHdbReference(hdbPath);
const zones = JSON.parse(readFileSync('public/zones.json', 'utf8'));
const onLand = zoneContains(zones.land), onWater = zoneContains(zones.water), restricted = zoneContains(zones.restricted);
const walkable = (lat, lng) => inSingapore(lat, lng) && onLand(lat, lng) && !onWater(lat, lng) && !restricted(lat, lng);
const sources = [];
function readSource(file, url) {
  const bytes = readFileSync(resolve(directory, file));
  const json = JSON.parse(bytes);
  sources.push({ file, url, sha256: createHash('sha256').update(bytes).digest('hex'),
    osmTimestamp: json.osm3s?.timestamp_osm_base, records: json.elements?.length ?? json.features?.length });
  return json;
}
const elements = new Map();
const skippedSources = process.argv.includes('--skip-outdoors') ? ['osm-outdoors.json'] : [];
for (const file of ['osm-housing.json', 'osm-amenities.json', 'osm-outdoors.json'].filter((file) => !skippedSources.includes(file))) {
  for (const element of readSource(file, 'https://www.openstreetmap.org/copyright').elements) {
    elements.set(`${element.type}/${element.id}`, element);
  }
}
const stats = { outsideOrUnwalkable: 0, inactive: 0, duplicate: 0, thinned: 0, hdbCandidates: 0, additions: {} };
const existing = new Map(base.pois.map((p) => [p.osmId, p]));
const candidates = [];
const governmentEntities = new Set();
// Existing verified IDs retain their geometry and gameplay identity.
for (const poi of base.pois.filter((p) => p.category === 'residential')) {
  const match = reference.match({ building: 'apartments' }, poi.lat, poi.lng);
  if (match) governmentEntities.add(match.entity);
}
for (const [osmId, element] of elements) {
  if (existing.has(osmId)) continue;
  const tags = element.tags ?? {};
  const lat = round(element.lat ?? element.center?.lat ?? NaN), lng = round(element.lon ?? element.center?.lon ?? NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  if (!activeSource(tags)) { stats.inactive++; continue; }
  if (!walkable(lat, lng)) { stats.outsideOrUnwalkable++; continue; }
  const match = reference.match(tags, lat, lng);
  const category = classifyOsm(tags, !!match);
  if (!category) continue;
  // Parks need a real name, not every unnamed green patch in an estate.
  if (category === 'park' && !(tags.name || tags['name:en'])) continue;
  if (category === 'residential') stats.hdbCandidates++;
  const poi = { osmId, name: sourceName(match?.block ? { 'addr:block_number': String(match.block), ...tags } : tags, category, POI_CONFIG), category, lat, lng };
  if (category === 'residential' && match) {
    // Multiple OSM elements can describe the same government building.
    if (governmentEntities.has(match.entity)) { stats.duplicate++; continue; }
    governmentEntities.add(match.entity);
    poi.outline = verifiedFootprint(match.rings[0], lat, lng);
  }
  candidates.push(poi);
}

// Official points complement OSM; never add buildings marked under construction.
for (const [file, dataset, category] of [
  ['gov-hawkers.json', 'd_4a086da0a5553be1d89383cd90d07ecd', 'foodcourt'],
  ['gov-clubs.json', 'd_f706de1427279e61fe41e89e24d440fa', 'community'],
]) {
  for (const feature of readSource(file, `https://data.gov.sg/datasets/${dataset}/view`).features) {
    if (feature.geometry?.type !== 'Point') continue;
    const p = sourceProperties(feature.properties);
    if (!activeGovernmentRecord(p)) { stats.inactive++; continue; }
    const [lng, lat] = feature.geometry.coordinates.map(round);
    if (!walkable(lat, lng)) { stats.outsideOrUnwalkable++; continue; }
    const name = p.NAME || p.Name || p.ADDRESSBUILDINGNAME;
    if (!name || name.length < 3) continue;
    const identity = p.ADDRESSPOSTALCODE || p.POSTALCODE || p.OBJECTID || p.Name;
    candidates.unshift({ osmId: `${category === 'foodcourt' ? 'nea/hawker' : 'pa/club'}/${identity}`, name, category, lat, lng, source: dataset });
  }
}

const pois = [...base.pois];
const spatial = new Map();
const density = new Set();
// Keep HDBs and other residences independently sampled; new homes cannot bury shops.
const spacing = { residential: .0011, housing: .0018, eatery: .00065 };
const denseKey = (p) => spacing[p.category] ? `${p.category}:${Math.floor(p.lat / spacing[p.category])},${Math.floor(p.lng / spacing[p.category])}` : null;
const key = (p) => `${Math.floor(p.lat / .002)},${Math.floor(p.lng / .002)}`;
function index(p) {
  const k = key(p);
  if (!spatial.has(k)) spatial.set(k, []);
  spatial.get(k).push(p);
  const cell = denseKey(p);
  if (cell) density.add(cell);
}
for (const p of pois) index(p);
// Stable ordering, with official records first. Dense housing then fills remaining cells.
candidates.sort((a, b) => Number(!!b.source) - Number(!!a.source)
  || Number(b.category === 'residential') - Number(a.category === 'residential') || a.osmId.localeCompare(b.osmId));
for (const p of candidates) {
  if (existing.has(p.osmId)) continue;
  const [a, b] = key(p).split(',').map(Number);
  const near = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) near.push(...(spatial.get(`${a + i},${b + j}`) ?? []));
  if (near.some((other) => sameVenue(p, other, !!p.source)
    || (p.category === 'housing' && other.category === 'residential' && distance(p, other) < 60))) { stats.duplicate++; continue; }
  const cell = denseKey(p);
  if (cell && density.has(cell)) { stats.thinned++; continue; }
  existing.set(p.osmId, p);
  pois.push(p);
  index(p);
  stats.additions[p.category] = (stats.additions[p.category] ?? 0) + 1;
}
pois.sort((a, b) => a.lat - b.lat || a.lng - b.lng || a.osmId.localeCompare(b.osmId));
const hdbRegistry = JSON.parse(readFileSync('src/game/data/verifiedHdb.json', 'utf8'));
const oldVerified = Object.entries(hdbRegistry.sites).map(([osmId, [lat, lng]]) => ({ osmId, lat, lng, category: 'residential' }));
// Retain valid IDs already referenced by saved runs, even if a sampling cell changes.
writeHdbRegistry([...oldVerified, ...pois.filter((p) => p.category === 'residential')]);
const sourceManifest = { expanded: new Date().toISOString(), baseGenerated: base.generated,
  basePoisSha256: createHash('sha256').update(JSON.stringify(base.pois)).digest('hex'),
  hdbReference: HDB_SOURCE, hdbSha256: hdbPath ? createHash('sha256').update(readFileSync(hdbPath)).digest('hex') : undefined,
  sources, skippedSources, before: base.pois.length, after: pois.length, ...stats };
const evacIds = pois.filter((p) => ['mrt', 'school', 'police'].includes(p.category) && p.name.trim().length >= 3).map((p) => p.osmId);
const json = JSON.stringify({ ...base, pois, evacIds, expansion: sourceManifest });
writeFileSync('public/pois.json', json);
writePoiRevision(pois);
writeFileSync('reports/location-expansion.json', JSON.stringify({ ...sourceManifest, rawBytes: Buffer.byteLength(json), gzipBytes: gzipSync(json).length }, null, 2) + '\n');
console.log(JSON.stringify({ ...sourceManifest, gzipBytes: gzipSync(json).length }, null, 2));
