import { describe, expect, it } from 'vitest';
import { itemDef } from './loot';
import {
  addToCarry,
  addToGrid,
  arrangeOrLoose,
  BACKPACK,
  bagWeightReduction,
  canPlace,
  carriedWeight,
  carrySlot,
  emptyEquipment,
  findSlot,
  isCarried,
  LOAD_HARD_CAP,
  LOAD_NO_FLEE,
  loadEffects,
  loadInjuryPerKm,
  loadStrain,
  loadTier,
  LOOSE,
  LOOSE_WEIGHT_MULT,
  packGridForBag,
  syncBackpackBonuses,
} from './inventory';
import { applyStrainInjury, initialBodyParts } from './survival';
import { Rng } from './rng';
import type { Equipment, ItemInstance } from './types';

const inst = (defId: string, container: string, extra: Partial<ItemInstance> = {}): ItemInstance => ({
  uid: `${defId}:${container}:${Math.random()}`,
  defId,
  container,
  x: 0,
  y: 0,
  rotated: false,
  stack: 1,
  ...extra,
});

const withBag = (bagId: string): Equipment => ({
  ...emptyEquipment(),
  bag: inst(bagId, `equip:bag`),
});

/** Fill the pockets until the grid refuses another power bank (1×1, no stacking). */
function fullPockets(): ItemInstance[] {
  syncBackpackBonuses(0, emptyEquipment());
  let items: ItemInstance[] = [];
  for (let n = 0; n < 40; n++) {
    const r = addToGrid(items, BACKPACK, 'powerbank', 1);
    if (r.leftover > 0) break;
    items = r.items;
  }
  return items;
}

describe('carried loose', () => {
  it('always has room and does not use the grid', () => {
    const def = itemDef('canned_food');
    expect(findSlot(LOOSE, [], def)).toEqual({ x: 0, y: 0, rotated: false });
    expect(canPlace(LOOSE, [inst('canned_food', LOOSE)], { x: 0, y: 0, w: 9, h: 9 })).toBe(true);
    expect(isCarried(LOOSE)).toBe(true);
    expect(isCarried(BACKPACK)).toBe(true);
    expect(isCarried('poi:somewhere')).toBe(false);
  });

  it('addToCarry fills the pack first, then goes loose instead of failing', () => {
    const items = fullPockets();
    const grid = addToGrid(items, BACKPACK, 'powerbank', 3);
    expect(grid.leftover).toBe(3);

    const carried = addToCarry(items, 'powerbank', 3);
    expect(carried.loose).toBe(3);
    const loose = carried.items.filter((i) => i.container === LOOSE);
    expect(loose).toHaveLength(3);
  });

  it('addToCarry stays in the pack while there is room', () => {
    syncBackpackBonuses(0, emptyEquipment());
    const r = addToCarry([], 'canned_food', 1);
    expect(r.loose).toBe(0);
    expect(r.items[0]?.container).toBe(BACKPACK);
  });

  it('carrySlot falls back to loose when the grid is full', () => {
    const items = fullPockets();
    expect(carrySlot(items, itemDef('powerbank')).container).toBe(LOOSE);
    syncBackpackBonuses(0, emptyEquipment());
    expect(carrySlot([], itemDef('canned_food')).container).toBe(BACKPACK);
  });

  it('a smaller bag spills to loose rather than refusing', () => {
    const items = fullPockets();
    const tote = packGridForBag(0, inst('grocery_tote', 'equip:bag'));
    const out = arrangeOrLoose(tote, items);
    expect(out).toHaveLength(items.length);
    expect(out.some((i) => i.container === LOOSE)).toBe(true);
    expect(out.some((i) => i.container === BACKPACK)).toBe(true);
  });
});

describe('carried weight', () => {
  const can = itemDef('canned_food').weight;

  it('loose counts extra, worn and pocketed count straight', () => {
    const eq = emptyEquipment();
    expect(carriedWeight([inst('canned_food', BACKPACK)], eq)).toBeCloseTo(can);
    expect(carriedWeight([inst('canned_food', LOOSE)], eq)).toBeCloseTo(can * LOOSE_WEIGHT_MULT);
    expect(carriedWeight([inst('canned_food', 'poi:x')], eq)).toBe(0);
  });

  it('an equipped bag takes its reduction off packed weight only', () => {
    const eq = withBag('military_rucksack');
    const bag = itemDef('military_rucksack');
    expect(bagWeightReduction(eq)).toBeCloseTo(0.45);
    const packed = carriedWeight([inst('canned_food', BACKPACK, { stack: 10 })], eq);
    expect(packed).toBeCloseTo(bag.weight + can * 10 * 0.55);
    const loose = carriedWeight([inst('canned_food', LOOSE, { stack: 10 })], eq);
    expect(loose).toBeCloseTo(bag.weight + can * 10 * LOOSE_WEIGHT_MULT);
  });

  it('bigger bags cut more', () => {
    const cuts = ['daypack', 'school_bag', 'hiking_pack', 'military_rucksack'].map((b) =>
      bagWeightReduction(withBag(b)),
    );
    for (let i = 1; i < cuts.length; i++) expect(cuts[i]).toBeGreaterThanOrEqual(cuts[i - 1]!);
    expect(bagWeightReduction(emptyEquipment())).toBe(0);
    expect(bagWeightReduction(withBag('grocery_tote'))).toBe(0);
  });

  it('a broken bag stops helping', () => {
    const eq: Equipment = { ...emptyEquipment(), bag: inst('hiking_pack', 'equip:bag', { condition: 0 }) };
    expect(bagWeightReduction(eq)).toBe(0);
  });
});

describe('load tiers', () => {
  it('maps ratio to the five tiers', () => {
    expect(loadTier(0.3)).toBe('light');
    expect(loadTier(0.55)).toBe('light');
    expect(loadTier(0.8)).toBe('burdened');
    expect(loadTier(1.0)).toBe('burdened');
    expect(loadTier(1.2)).toBe('heavy');
    expect(loadTier(1.5)).toBe('heavy');
    expect(loadTier(1.7)).toBe('straining');
    expect(loadTier(2.0)).toBe('straining');
    expect(loadTier(2.01)).toBe('pinned');
    expect(loadTier(Number.POSITIVE_INFINITY)).toBe('pinned');
  });

  it('keeps the existing curve up to 150% and caps strain at the hard cap', () => {
    expect(loadStrain(1.5)).toBeCloseTo(0.8);
    expect(loadEffects(1.5).travelMult).toBeCloseTo(2.0);
    expect(loadStrain(3)).toBeCloseTo(loadStrain(LOAD_HARD_CAP));
  });

  it('gates flee, travel, injury and noise by tier', () => {
    const heavy = loadEffects(1.2);
    expect(heavy.canFlee).toBe(true);
    expect(heavy.canTravel).toBe(true);
    expect(heavy.injuryPerKm).toBe(0);
    expect(heavy.arrivalNoise).toBe(1);

    const straining = loadEffects(1.8);
    expect(straining.canFlee).toBe(false);
    expect(straining.canTravel).toBe(true);
    expect(straining.injuryPerKm).toBeGreaterThan(0);

    const pinned = loadEffects(2.2);
    expect(pinned.canTravel).toBe(false);

    const light = loadEffects(0.4);
    expect(light.arrivalNoise).toBe(0);
    expect(light.strain).toBe(0);
  });

  it('injury runs 1 HP/km at the Straining line to 3 HP/km at the cap', () => {
    expect(loadInjuryPerKm(LOAD_NO_FLEE)).toBe(0);
    expect(loadInjuryPerKm(1.5001)).toBeCloseTo(1, 2);
    expect(loadInjuryPerKm(1.75)).toBeCloseTo(2);
    expect(loadInjuryPerKm(2)).toBeCloseTo(3);
    expect(loadInjuryPerKm(5)).toBeCloseTo(3);
  });
});

describe('strain injury', () => {
  it('splits damage across legs and torso without bleeding', () => {
    const parts = initialBodyParts(100);
    const hurt = applyStrainInjury(parts, 6, new Rng('strain'));
    expect(hurt.leftLeg.hp).toBeCloseTo(parts.leftLeg.hp - 2);
    expect(hurt.rightLeg.hp).toBeCloseTo(parts.rightLeg.hp - 2);
    expect(hurt.torso.hp).toBeCloseTo(parts.torso.hp - 2);
    expect(hurt.head).toBe(parts.head);
    for (const id of ['leftLeg', 'rightLeg', 'torso'] as const) {
      expect(hurt[id].bleed).toBe(parts[id].bleed);
    }
  });

  it('can cripple legs but never empties the torso', () => {
    const parts = initialBodyParts(100);
    const hurt = applyStrainInjury(parts, 10_000, new Rng('crush'));
    expect(hurt.leftLeg.hp).toBe(0);
    expect(hurt.leftLeg.crippled).toBe(true);
    expect(hurt.torso.hp).toBe(1);
    expect(hurt.torso.crippled).toBe(parts.torso.crippled);
  });

  it('a sprain lands an extra hard hit on one leg', () => {
    const parts = initialBodyParts(100);
    const hurt = applyStrainInjury(parts, 0, new Rng('sprain'), true);
    const lost =
      parts.leftLeg.hp - hurt.leftLeg.hp + (parts.rightLeg.hp - hurt.rightLeg.hp);
    expect(lost).toBeCloseTo(parts.leftLeg.maxHp * 0.25);
    expect(hurt.torso.hp).toBe(parts.torso.hp);
  });
});
