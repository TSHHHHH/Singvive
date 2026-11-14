import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { writePoiAssets } from './poi-assets.mjs';

export function writePoiRevision(pois) {
  const revision = createHash('sha256').update(JSON.stringify(pois)).digest('hex').slice(0, 16);
  writeFileSync(new URL('../src/game/data/poiRevision.json', import.meta.url), JSON.stringify(revision) + '\n');
  writePoiAssets(pois, revision);
  return revision;
}
