import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BACKPACK,
  emptyEquipment,
  LOOSE,
  overlapsAt,
  placeReplacing,
  syncBackpackBonuses,
} from './inventory';
import type { ItemInstance } from './types';

/** School bag: 4×3 with the two top corners blocked. */
function wearSchoolBag() {
  const eq = emptyEquipment();
  eq.bag = { uid: 'bag', defId: 'school_bag', container: BACKPACK, x: 0, y: 0, rotated: false, stack: 1 };
  syncBackpackBonuses(0, eq);
}

const item = (uid: string, defId: string, container: string, x = 0, y = 0, rotated = false): ItemInstance => ({
  uid,
  defId,
  container,
  x,
  y,
  rotated,
  stack: 1,
});

describe('overlapsAt', () => {
  beforeEach(wearSchoolBag);
  afterEach(() => syncBackpackBonuses(0, emptyEquipment()));

  it('is empty on a free spot', () => {
    expect(overlapsAt(BACKPACK, [], { x: 1, y: 0, w: 2, h: 1 })).toEqual([]);
  });

  it('lists every item the footprint covers', () => {
    const items = [
      item('a', 'canned_food', BACKPACK, 1, 1),
      item('b', 'canned_food', BACKPACK, 2, 1),
      item('c', 'canned_food', BACKPACK, 3, 2),
    ];
    expect(overlapsAt(BACKPACK, items, { x: 1, y: 1, w: 2, h: 2 })).toEqual(['a', 'b']);
  });

  it('counts an item whose footprint only partly overlaps', () => {
    const items = [item('noodles', 'instant_noodles', BACKPACK, 2, 2)]; // 2×1 at (2..3, 2)
    expect(overlapsAt(BACKPACK, items, { x: 1, y: 1, w: 2, h: 2 })).toEqual(['noodles']);
  });

  it('ignores the item being moved and other containers', () => {
    const items = [item('self', 'canned_food', BACKPACK, 1, 1), item('far', 'canned_food', LOOSE)];
    expect(overlapsAt(BACKPACK, items, { x: 0, y: 1, w: 2, h: 1 }, 'self')).toEqual([]);
  });

  it('rejects out of bounds and holes in the bag', () => {
    expect(overlapsAt(BACKPACK, [], { x: 3, y: 1, w: 2, h: 1 })).toBeNull();
    expect(overlapsAt(BACKPACK, [], { x: 1, y: 2, w: 1, h: 2 })).toBeNull();
    expect(overlapsAt(BACKPACK, [], { x: -1, y: 1, w: 1, h: 1 })).toBeNull();
    expect(overlapsAt(BACKPACK, [], { x: 0, y: 0, w: 1, h: 1 })).toBeNull(); // blocked corner
  });
});

describe('placeReplacing', () => {
  beforeEach(wearSchoolBag);
  afterEach(() => syncBackpackBonuses(0, emptyEquipment()));

  it('drops into a free spot without bumping anything', () => {
    const items = [item('kit', 'medkit', LOOSE), item('can', 'canned_food', BACKPACK, 3, 2)];
    const out = placeReplacing(items, 'kit', BACKPACK, 1, 1, false)!;
    expect(out.displaced).toEqual([]);
    expect(out.items.find((i) => i.uid === 'kit')).toMatchObject({ container: BACKPACK, x: 1, y: 1 });
    expect(out.items.find((i) => i.uid === 'can')).toMatchObject({ container: BACKPACK, x: 3, y: 2 });
  });

  it('bumps every overlapped item to the loose pile and keeps them all', () => {
    const items = [
      item('kit', 'medkit', LOOSE),
      item('a', 'canned_food', BACKPACK, 1, 1),
      item('b', 'instant_noodles', BACKPACK, 2, 2),
      item('keep', 'canned_food', BACKPACK, 0, 1),
    ];
    const out = placeReplacing(items, 'kit', BACKPACK, 1, 1, false)!;
    expect(out.displaced.sort()).toEqual(['a', 'b']);
    expect(out.items).toHaveLength(items.length);
    expect(out.items.find((i) => i.uid === 'kit')).toMatchObject({ container: BACKPACK, x: 1, y: 1 });
    expect(out.items.find((i) => i.uid === 'a')?.container).toBe(LOOSE);
    expect(out.items.find((i) => i.uid === 'b')).toMatchObject({ container: LOOSE, rotated: false });
    expect(out.items.find((i) => i.uid === 'keep')).toMatchObject({ container: BACKPACK, x: 0, y: 1 });
  });

  it('folds bumped stackables into a matching loose stack', () => {
    const items = [
      item('kit', 'medkit', LOOSE),
      { ...item('pile', 'canned_food', LOOSE), stack: 2 },
      { ...item('a', 'canned_food', BACKPACK, 1, 1), stack: 2 },
      item('b', 'canned_food', BACKPACK, 2, 1),
    ];
    const out = placeReplacing(items, 'kit', BACKPACK, 1, 1, false)!;
    expect(out.displaced.sort()).toEqual(['a', 'b']);
    const cans = out.items.filter((i) => i.defId === 'canned_food');
    expect(cans).toHaveLength(1);
    expect(cans[0]).toMatchObject({ uid: 'pile', container: LOOSE, stack: 5 });
  });

  it('never merges stacks that differ in contamination', () => {
    const items = [
      item('kit', 'medkit', LOOSE),
      { ...item('pile', 'canned_food', LOOSE), contaminationRisk: 0.2 },
      item('a', 'canned_food', BACKPACK, 1, 1),
    ];
    const out = placeReplacing(items, 'kit', BACKPACK, 1, 1, false)!;
    expect(out.items.filter((i) => i.defId === 'canned_food')).toHaveLength(2);
  });

  it('honours rotation for the footprint', () => {
    const items = [item('bottle', 'water_bottle', LOOSE), item('a', 'canned_food', BACKPACK, 2, 1)];
    // 1×2 rotated → 2×1 at (1,1): covers (1,1),(2,1)
    const out = placeReplacing(items, 'bottle', BACKPACK, 1, 1, true)!;
    expect(out.displaced).toEqual(['a']);
    expect(out.items.find((i) => i.uid === 'bottle')).toMatchObject({ rotated: true });
  });

  it('refuses out-of-bounds or hole drops and leaves items alone', () => {
    const items = [item('kit', 'medkit', LOOSE)];
    expect(placeReplacing(items, 'kit', BACKPACK, 3, 1, false)).toBeNull();
    expect(placeReplacing(items, 'kit', BACKPACK, 0, 0, false)).toBeNull();
    expect(placeReplacing(items, 'kit', LOOSE, 0, 0, false)).toBeNull();
    expect(placeReplacing(items, 'missing', BACKPACK, 1, 1, false)).toBeNull();
  });
});
