import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Exact geometry, partitioned by the POI pin into ~2.2 km cells. No resampling. */
export function writePoiAssets(pois, revision, root = fileURLToPath(new URL('../public/poi-data/', import.meta.url))) {
  const directory = resolve(root, revision);
  mkdirSync(directory, { recursive: true });
  const chunks = new Map();
  const metadata = pois.map(({ outline, ...poi }) => {
    if (!outline) return poi;
    const cell = `${Math.floor(poi.lat / .02)}_${Math.floor(poi.lng / .02)}`;
    if (!chunks.has(cell)) chunks.set(cell, {});
    chunks.get(cell)[poi.osmId] = outline;
    return { ...poi, outlineCell: cell };
  });
  for (const [cell, outlines] of chunks) {
    writeFileSync(resolve(directory, `${cell}.json`), JSON.stringify({ revision, outlines }));
  }
  writeFileSync(resolve(directory, 'index.json'), JSON.stringify({ revision, pois: metadata,
    cells: [...chunks.keys()].sort(),
    evacIds: pois.filter((p) => ['mrt', 'school', 'police'].includes(p.category) && p.name.trim().length >= 3).map((p) => p.osmId),
  }));
}
