/**
 * CARTO 20261026-01 omits SkyPark's min_height, although OSM way/116800998
 * has min_height=193 and height=207. Keep this correction local to that
 * source/feature; honour upstream heights if the tile is repaired.
 * https://www.openstreetmap.org/way/116800998 (checked 2026-11-14)
 */
export function landmarkBaseHeight(
  source: string,
  id: string | number,
  properties: Record<string, unknown>,
): number | undefined {
  if (source !== 'protomaps' || String(id) !== '35184488889830') return undefined;
  if (properties.min_height != null || properties.render_min_height != null) return undefined;
  return Number(properties.height) === 207 ? 193 : undefined;
}
