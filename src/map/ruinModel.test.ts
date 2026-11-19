import { expect, it } from 'vitest';
import type { MultiPolygon } from 'polygon-clipping';
import { breakBuilding } from './ruinModel';

it('keeps edge pieces within the building height when the grid extends past a narrow footprint', () => {
  const footprint: MultiPolygon = [[[[103.85, 1.29], [103.8502, 1.29], [103.8502, 1.29002],
    [103.85, 1.29002], [103.85, 1.29]]]];
  for (let seed = 0; seed < 32; seed++) {
    const pieces = breakBuilding(footprint, 36, seed);
    expect(pieces.length).toBeGreaterThan(0);
    expect(pieces.every(p => p.base >= 0 && p.top > p.base && p.top <= 36)).toBe(true);
  }
});
