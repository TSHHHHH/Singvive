import { buildNetwork, type MrtFile } from '../src/game/mrt';
import revision from '../src/game/data/poiRevision.json';
import { installZones, type ZonesData } from '../src/game/playable';
import type { RawPoi } from '../src/game/overpass';
import { buildIslandCatalog, type IslandCatalog } from '../src/coop/islandWorld';

let pending: Promise<IslandCatalog> | undefined;
/** Static assets are deployment-owned; never accept catalog data from a player. */
export function loadIslandAssets(assets: Fetcher): Promise<IslandCatalog> {
  pending ??= (async () => {
    const [indexResponse, zonesResponse, mrtResponse] = await Promise.all([
      // The binding selects deployment assets; localhost also passes Vite's dev host guard.
      assets.fetch(`http://localhost/poi-data/${revision}/index.json`),
      assets.fetch('http://localhost/zones.json'),
      assets.fetch('http://localhost/mrt.json'),
    ]);
    if (!indexResponse.ok || !zonesResponse.ok || !mrtResponse.ok) throw new Error(`Island assets unavailable: index ${indexResponse.status}, zones ${zonesResponse.status}.`);
    const index = await indexResponse.json<{ revision: string; pois: RawPoi[] }>();
    const zones = await zonesResponse.json<ZonesData>();
    const mrt = await mrtResponse.json<MrtFile>();
    if (!Array.isArray(mrt.stations) || !mrt.stations.length || !Array.isArray(mrt.lines) || !mrt.lines.length) throw new Error('MRT assets unavailable.');
    if (index.revision !== revision || !Array.isArray(index.pois) || !index.pois.length || !Array.isArray(zones.land) || !zones.land.length) throw new Error('Island assets do not match this deployment.');
    installZones(zones);
    return buildIslandCatalog(index.pois, revision, buildNetwork(mrt));
  })().catch((error: unknown) => { pending = undefined; throw error; });
  return pending;
}
