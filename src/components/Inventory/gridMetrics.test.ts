import { describe, expect, it } from 'vitest';
import { dropCell } from './gridMetrics';

describe('inventory drop coordinates', () => {
  it('preserves the grabbed cell when moving from a large backpack to a small stash', () => {
    // Grab 1.5 cells into a two-cell item. Cursor is 2.5 destination cells in.
    expect(dropCell(185, 100, 84, 56, 34, 5, 2)).toBe(1);
  });
  it('preserves the grabbed cell from a small stash to a large backpack', () => {
    expect(dropCell(240, 100, 51, 34, 56, 5, 2)).toBe(1);
  });
  it('keeps the entire footprint inside either edge of the grid', () => {
    expect(dropCell(101, 100, 84, 56, 48, 6, 2)).toBe(0);
    expect(dropCell(399, 100, 2, 56, 48, 6, 2)).toBe(4);
  });
});
