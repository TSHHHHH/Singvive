import catalog from './data/landmarks.json';
import type { RawPoi } from './overpass';

/** Curated OSM footprints, bundled locally and merged once when the bake loads. */
export const LANDMARK_POIS: RawPoi[] = catalog.pois.map((site) => ({
  ...site,
  category: 'landmark',
  outline: site.outline.map(([lat, lng]): [number, number] => [lat, lng]),
}));

/** A garden canopy does not provide enclosed shelter. */
export const OPEN_LANDMARK_IDS: ReadonlySet<string> = new Set(['way/171979084']);

/** Curated identities win if a later island bake includes the same OSM way. */
export function withLandmarks(pois: RawPoi[]): RawPoi[] {
  const curated = new Set(LANDMARK_POIS.map((p) => p.osmId));
  return [...pois.filter((p) => !curated.has(p.osmId)), ...LANDMARK_POIS];
}
