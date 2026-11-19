import { expect, it } from 'vitest';
import type { MultiPolygon } from 'polygon-clipping';
import { breakBuilding } from './ruinModel';
import { hash01 } from './cityDamage';

it('clips the triangular CARTO footprint near War Memorial Park', () => {
  const a: [number, number] = [103.85465830564499, 1.2953322235147056];
  const footprint: MultiPolygon = [[[a, [103.85461539030075, 1.295586968242759],
    [103.85475486516953, 1.2954797073077629], a]]];
  expect(breakBuilding(footprint, 14, Math.floor(hash01('b:35184626904767', 9) * 2 ** 31)).length).toBeGreaterThan(0);
});

it('opens repeatable, supported floor sections along a diagonal apartment block', () => {
  const footprint: MultiPolygon = [[[[103.85, 1.29], [103.8505, 1.2905], [103.8504, 1.2906],
    [103.8499, 1.2901], [103.85, 1.29]]]];
  const pieces = breakBuilding(footprint, 36, 42);
  expect(breakBuilding(footprint, 36, 42)).toEqual(pieces);
  expect(new Set(pieces.map(p => p.kind))).toEqual(new Set(['slab', 'pillar', 'rubble', 'shell', 'leaves', 'vine', 'window']));
  const ledgeHeights = new Set(pieces.filter(p => p.kind === 'slab' || p.kind === 'shell').map(p => p.top));
  expect(pieces.filter(p => p.kind === 'leaves').every(p => ledgeHeights.has(p.base))).toBe(true);
  const slabs = pieces.filter(p => p.kind === 'slab');
  expect(new Set(slabs.map(p => p.base)).size).toBeGreaterThan(2);
  expect(slabs.every(p => p.base > 0 && Math.abs(p.top - p.base - 0.45) < 1e-6)).toBe(true);
});

it('keeps edge pieces within the building height when the grid extends past a narrow footprint', () => {
  const footprint: MultiPolygon = [[[[103.85, 1.29], [103.8502, 1.29], [103.8502, 1.29002],
    [103.85, 1.29002], [103.85, 1.29]]]];
  for (let seed = 0; seed < 32; seed++) {
    const pieces = breakBuilding(footprint, 36, seed);
    expect(pieces.length).toBeGreaterThan(0);
    expect(pieces.every(p => p.base >= 0 && p.top > p.base && p.top <= 36)).toBe(true);
  }
});

it('keeps upper tower bays above a framed mid-rise breach and glazing on surviving walls', () => {
  const footprint: MultiPolygon = [[[[103.85, 1.29], [103.8504, 1.29], [103.8504, 1.2903],
    [103.85, 1.2903], [103.85, 1.29]]]];
  for (const h of [60, 108, 240]) {
    const pieces = breakBuilding(footprint, h, 42);
    const upper = pieces.filter(p => p.kind === 'shell' && p.base > 0);
    expect(upper.length).toBeGreaterThan(0);
    expect(pieces.some(p => p.kind === 'steel')).toBe(true);
    expect(pieces.some(p => p.kind === 'glass' && upper.some(u => p.base >= u.base && p.top <= u.top))).toBe(true);
    expect(pieces.every(p => p.base >= 0 && p.base < p.top && p.top <= h)).toBe(true);
  }
});
