// Refresh only the three curated OSM landmarks. Manual; never part of build.
// Usage: node scripts/bake-landmarks.mjs
import { writeFileSync } from 'node:fs';

const sites = [
  { osmId: 'way/116800998', name: 'Marina Bay Sands', lat: 1.28363, lng: 103.86068 },
  { osmId: 'way/261191086', name: 'ArtScience Museum', lat: 1.28614, lng: 103.85923 },
  { osmId: 'way/171979084', name: 'Supertree Grove', lat: 1.28194, lng: 103.86394 },
];

const pois = [];
for (const site of sites) {
  const res = await fetch(`https://api.openstreetmap.org/api/0.6/${site.osmId}/full.json`);
  if (!res.ok) throw new Error(`${site.osmId}: ${res.status}`);
  const { elements } = await res.json();
  const way = elements.find((e) => e.type === 'way' && e.id === Number(site.osmId.split('/')[1]));
  const nodes = new Map(elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const outline = way.nodes.map((id) => {
    const p = nodes.get(id);
    if (!p) throw new Error(`Missing node ${id}`);
    return [Number(p.lat.toFixed(6)), Number(p.lon.toFixed(6))];
  });
  pois.push({ ...site, category: 'landmark', outline });
}
writeFileSync(new URL('../src/game/data/landmarks.json', import.meta.url), `${JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL)',
  generated: new Date().toISOString(),
  pois,
}, null, 2)}\n`);
console.log(`Baked ${pois.length} landmarks.`);
