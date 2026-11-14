// Explicit, manual network step. Caches original source evidence for repeatable expansion.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const directory = resolve(process.argv[2] ?? 'tmp/location-sources');
mkdirSync(directory, { recursive: true });
const box = '(1.19,103.59,1.49,104.06)';
const queries = {
  housing: `nwr["building"~"^(apartments|residential|house|detached|terrace|semidetached_house)$"]${box};`,
  amenities: `(
    nwr["shop"~"^(supermarket|convenience|kiosk|chemist|hardware|doityourself|trade|bakery|butcher|greengrocer)$"]${box};
    nwr["amenity"~"^(pharmacy|hospital|clinic|doctors|dentist|fuel|police|food_court|marketplace|hawker_centre|school|college|university|restaurant|cafe|fast_food|community_centre|library|place_of_worship)$"]${box};
    nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"]${box};
  );`,
  outdoors: `nwr["tourism"~"^(zoo|theme_park|museum)$"]["name"]${box};`,
};
for (const [name, query] of Object.entries(queries)) {
  const path = resolve(directory, `osm-${name}.json`);
  if (existsSync(path)) { console.log(`Using cached ${name}`); continue; }
  let lastError;
  for (const host of ['overpass.private.coffee', 'overpass-api.de']) {
    try {
      console.log(`Fetching ${name} from ${host}`);
      const response = await fetch(`https://${host}/api/interpreter`, {
        method: 'POST', signal: AbortSignal.timeout(180000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Singvive-location-bake/1.0 (Singapore survival game; manual OSM data import)' },
        body: 'data=' + encodeURIComponent(`[out:json][timeout:120];${query}out center tags;`),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.remark || !data.elements?.length) throw new Error(data.remark ?? 'Empty result');
      writeFileSync(path, JSON.stringify(data));
      console.log(`${name}: ${data.elements.length} elements`);
      lastError = null;
      break;
    } catch (error) { lastError = error; console.warn(`${host}: ${error.message}`); }
  }
  if (lastError) throw lastError;
}
for (const [name, id] of Object.entries({ hdb: 'd_16b157c52ed637edd6ba1232e026258d', hawkers: 'd_4a086da0a5553be1d89383cd90d07ecd', clubs: 'd_f706de1427279e61fe41e89e24d440fa' })) {
  const path = resolve(directory, `gov-${name}.json`);
  if (existsSync(path)) continue;
  const metadata = await (await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${id}/poll-download`, { signal: AbortSignal.timeout(30000) })).json();
  if (!metadata.data?.url) throw new Error(`Download not ready: ${id}`);
  const response = await fetch(metadata.data.url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  writeFileSync(path, JSON.stringify(data));
  console.log(`${name}: ${data.features.length} features`);
}
