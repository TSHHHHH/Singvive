import type { Feature, Polygon } from 'geojson';
import { expect, it } from 'vitest';
import { cityBlocks } from './cityBlocks';

function polygon(id: number, x: number, w: number, height: number, part = false, base = 0): Feature<Polygon> {
  return { type: 'Feature', id, properties: { kind: part ? 'building_part' : 'building', height, min_height: base },
    geometry: { type: 'Polygon', coordinates: [[[x, x], [x + w, x], [x + w, x + w], [x, x + w], [x, x]]] } };
}

it('groups tower fragments with the smallest containing podium before checking collapse height', () => {
  const tower = polygon(3, 0.0003, 0.0001, 95, true);
  const podium = polygon(2, 0.0002, 0.0005, 4);
  const blocks = cityBlocks([tower, polygon(1, 0, 0.001, 8), podium, tower, podium]);
  expect(blocks).toContainEqual({ id: 2, h: 95, shape: 3, members: [2, 3] });
  expect(blocks).toHaveLength(2);
});

it('keeps ground-standing parts in courtyards independent and skips isolated elevated decks', () => {
  const parent = polygon(1, 0, 0.001, 20);
  parent.geometry.coordinates.push(polygon(4, 0.0002, 0.0006, 0).geometry.coordinates[0]);
  const blocks = cityBlocks([parent, polygon(2, 0.0003, 0.0001, 70, true), polygon(3, 0.003, 0.0001, 80, true, 72)]);
  expect(blocks.map(b => b.id)).toEqual([1, 2]);
});
