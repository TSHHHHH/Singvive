import type { Feature } from 'geojson';
import { anchorOf, pointInRing, ringBounds } from './geo';

type Id = string | number;
export interface BlockGeometry {
  id: Id;
  h: number;
  shape: Id;
  members: Id[];
}

/** Associate CARTO's tower parts with their smallest containing building.
 * Index polygon fragments by neighbourhood cell so tile seams and courtyards
 * are handled without a whole-city polygon scan for each part. */
export function cityBlocks(features: readonly Feature[]): BlockGeometry[] {
  const blocks = new Map<Id, BlockGeometry>();
  const cells = new Map<string, { id: Id; polygon: number[][][]; area: number }[]>();
  const parts = new Map<Id, { lng: number; lat: number; h: number; base: number }>();
  const cell = (n: number) => Math.floor(n * 500);
  for (const f of features) {
    if (f.id == null || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) continue;
    const p = f.properties ?? {};
    const h = Number(p.render_height ?? p.height ?? 8);
    if (p.kind === 'building_part') {
      const at = anchorOf(f.geometry);
      if (at && !parts.has(f.id)) parts.set(f.id, { lng: at[0], lat: at[1], h, base: Number(p.render_min_height ?? p.min_height ?? 0) });
      continue;
    }
    if (!blocks.has(f.id)) blocks.set(f.id, { id: f.id, shape: f.id, h, members: [f.id] });
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const polygon of polygons) {
      if (!polygon[0]?.length) continue;
      const [west, south, east, north] = ringBounds(polygon[0]);
      const entry = { id: f.id, polygon, area: (east - west) * (north - south) };
      for (let x = cell(west); x <= cell(east); x++) for (let y = cell(south); y <= cell(north); y++) {
        const key = x + ',' + y;
        const bucket = cells.get(key);
        if (bucket) bucket.push(entry);
        else cells.set(key, [entry]);
      }
    }
  }
  for (const [id, p] of parts) {
    if (blocks.has(id)) continue;
    const nearby = cells.get(cell(p.lng) + ',' + cell(p.lat)) ?? [];
    let parent: Id | undefined;
    let area = Infinity;
    for (const entry of nearby) {
      if (entry.area >= area || !pointInRing(p.lng, p.lat, entry.polygon[0])) continue;
      if (entry.polygon.slice(1).some(hole => pointInRing(p.lng, p.lat, hole))) continue;
      parent = entry.id;
      area = entry.area;
    }
    if (parent === undefined) {
      if (p.base === 0) blocks.set(id, { id, shape: id, h: p.h, members: [id] });
      continue;
    }
    const block = blocks.get(parent)!;
    block.members.push(id);
    if (p.h > block.h) {
      block.h = p.h;
      block.shape = id;
    }
  }
  return [...blocks.values()];
}
