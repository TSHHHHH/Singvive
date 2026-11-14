// Repair an existing bake with original OSM tags and official HDB footprints.
// node scripts/verify-hdb-pois.mjs --hdb <geojson> --osm <OSM JSON>
import { readFileSync, writeFileSync } from 'node:fs';
import { loadHdbReference, writeHdbRegistry, HDB_SOURCE } from './hdb-reference.mjs';
import { writePoiRevision } from './poi-revision.mjs';

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes('--osm')) throw new Error('Supply --osm <JSON> with the original OSM elements');
const reference = await loadHdbReference(process.argv.includes('--hdb') ? arg('--hdb') : undefined);
const elements = JSON.parse(readFileSync(arg('--osm'), 'utf8')).elements;
const tags = new Map(elements.map((e) => [`${e.type}/${e.id}`, e.tags ?? {}]));
const path = new URL('../public/pois.json', import.meta.url);
const bake = JSON.parse(readFileSync(path, 'utf8'));
const rejected = [];
const pois = bake.pois.filter((p) => {
  if (p.category !== 'residential') return true;
  if (!tags.has(p.osmId)) throw new Error(`Missing OSM evidence for ${p.osmId}; refusing partial repair`);
  if (reference.match(tags.get(p.osmId), p.lat, p.lng)) return true;
  rejected.push(p);
  return false;
});
writeHdbRegistry(pois);
writePoiRevision(pois);
writeFileSync(path, JSON.stringify({ ...bake, pois, hdbVerification: { source: HDB_SOURCE, verified: new Date().toISOString() } }));
console.log(JSON.stringify({ before: bake.pois.length, after: pois.length, rejectedResidential: rejected.length }));
