import { describe, expect, it } from 'vitest';
import { itemDef } from './loot';
import {
  BACKPACK,
  canPlace,
  cellsOf,
  findSlot,
  footprint,
  syncBackpackBonuses,
} from './inventory';
import type { ItemInstance } from './types';

const EMPTY_EQUIPMENT = {
  head: null,
  body: null,
  hands: null,
  legs: null,
  feet: null,
  bag: null,
  mainHand: null,
  offHand: null,
};

describe('inventory grid', () => {
  it('footprint swaps dimensions when rotated', () => {
    const def = itemDef('instant_noodles'); // 2×1
    expect(footprint(def, false)).toEqual({ w: 2, h: 1 });
    expect(footprint(def, true)).toEqual({ w: 1, h: 2 });
  });

  it('findSlot places canned_food in an empty backpack', () => {
    syncBackpackBonuses(0, EMPTY_EQUIPMENT);
    const def = itemDef('canned_food');
    const slot = findSlot(BACKPACK, [], def);
    expect(slot).toEqual({ x: 0, y: 0, rotated: false });
  });

  it('canPlace rejects overlap', () => {
    syncBackpackBonuses(0, EMPTY_EQUIPMENT);
    const inst: ItemInstance = {
      uid: 'a',
      defId: 'canned_food',
      container: BACKPACK,
      x: 0,
      y: 0,
      rotated: false,
      stack: 1,
    };
    const def = itemDef('canned_food');
    const { w, h } = footprint(def, false);
    expect(canPlace(BACKPACK, [inst], { x: 0, y: 0, w, h })).toBe(false);
    expect(canPlace(BACKPACK, [inst], { x: 1, y: 0, w, h })).toBe(true);
  });

  it('cellsOf covers the item footprint', () => {
    const inst: ItemInstance = {
      uid: 'b',
      defId: 'instant_noodles',
      container: BACKPACK,
      x: 1,
      y: 2,
      rotated: false,
      stack: 1,
    };
    expect(cellsOf(inst)).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
  });
});
