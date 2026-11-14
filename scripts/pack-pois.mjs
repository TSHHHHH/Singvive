import { readFileSync } from 'node:fs';
import { writePoiRevision } from './poi-revision.mjs';

const bake = JSON.parse(readFileSync(new URL('../public/pois.json', import.meta.url)));
console.log(`Packed ${bake.pois.length} locations: ${writePoiRevision(bake.pois)}`);
