// Build-time evidence only. Never ship the 55 MB government geometry to clients.
import { readFileSync, writeFileSync } from 'node:fs';

export const HDB_DATASET = 'd_16b157c52ed637edd6ba1232e026258d';
export const HDB_SOURCE = `https://data.gov.sg/datasets/${HDB_DATASET}/view`;

export function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export async function loadHdbReference(from) {
  let data;
  if (from) data = JSON.parse(readFileSync(from, 'utf8'));
  else {
    const poll = await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${HDB_DATASET}/poll-download`, { signal: AbortSignal.timeout(30000) });
    if (!poll.ok) throw new Error(`HDB download metadata: HTTP ${poll.status}`);
    const metadata = await poll.json();
    if (!metadata.data?.url) throw new Error('HDB download is not ready; retry later or use --hdb <geojson>');
    const response = await fetch(metadata.data.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`HDB download: HTTP ${response.status}`);
    data = await response.json();
  }
  if (!Array.isArray(data.features) || data.features.length < 1000) throw new Error('Incomplete HDB reference');
  const grid = new Map();
  const cell = (n) => Math.floor(n / 0.002);
  for (const feature of data.features) {
    const geometry = feature.geometry;
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
    for (const rings of polygons) {
      const xs = rings[0].map((p) => p[0]);
      const ys = rings[0].map((p) => p[1]);
      const entry = { rings, block: feature.properties.BLK_NO, entity: feature.properties.ENTITYID };
      for (let x = cell(Math.min(...xs)); x <= cell(Math.max(...xs)); x++) {
        for (let y = cell(Math.min(...ys)); y <= cell(Math.max(...ys)); y++) {
          const key = `${x},${y}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(entry);
        }
      }
    }
  }
  return {
    match(tags, lat, lng) {
      // HDB ownership alone does not make a carpark, club or commercial block a dwelling.
      if (!['apartments', 'residential'].includes(tags.building) || tags.amenity) return null;
      return (grid.get(`${cell(lng)},${cell(lat)}`) ?? []).find(({ rings }) =>
        inRing(lng, lat, rings[0]) && !rings.slice(1).some((ring) => inRing(lng, lat, ring))) ?? null;
    },
  };
}

export function writeHdbRegistry(pois) {
  const sites = Object.fromEntries(pois.filter((p) => p.category === 'residential')
    .sort((a, b) => a.osmId.localeCompare(b.osmId)).map((p) => [p.osmId, [p.lat, p.lng]]));
  if (Object.keys(sites).length < 500) throw new Error('Refusing an unexpectedly small HDB registry');
  writeFileSync(new URL('../src/game/data/verifiedHdb.json', import.meta.url), JSON.stringify({
    source: HDB_SOURCE,
    verified: new Date().toISOString(),
    method: 'OSM apartments/residential without amenity, pin inside HDB Existing Building polygon, excluding holes; no proximity inference',
    sites,
  }));
}
