import { describe, expect, it } from 'vitest';
import {
  cureInfection,
  GUT_CAP,
  infectionRatePerHour,
  infectionTier,
  ingestLoad,
  settleStomach,
  spoiledLoad,
  tickGut,
  upsetStomach,
} from './infection';
import { consumableScale } from './inventory';
import { itemDef } from './loot';
import { checkDeath, initialBodyParts, initialMeters, tickMeters } from './survival';
import type { ItemInstance, Meters } from './types';

const meters = (over: Partial<Meters> = {}): Meters => ({ ...initialMeters(), thirst: 80, ...over });
const chickenRice = (condition: number): ItemInstance =>
  ({ uid: 'x', defId: 'chicken_rice', stack: 1, container: 'loose', x: 0, y: 0, condition }) as ItemInstance;

describe('spoiled food upsets the stomach', () => {
  it('only below half freshness, more the worse it is', () => {
    expect(spoiledLoad(80)).toBe(0);
    expect(spoiledLoad(50)).toBe(0);
    expect(spoiledLoad(49)).toBe(6);
    expect(spoiledLoad(25)).toBe(13);
    expect(spoiledLoad(0)).toBe(20);
  });

  it('feeds 30% at worst instead of 50%', () => {
    expect(consumableScale(chickenRice(100))).toBe(1);
    expect(consumableScale(chickenRice(0))).toBeCloseTo(0.3);
    // The screenshot case: 2% chicken rice now gives 13 hunger, not 21.
    expect(Math.round(42 * consumableScale(chickenRice(2)))).toBe(13);
  });

  it('murky water and rotten perishables share one load; resist trims it', () => {
    const dirty = itemDef('dirty_water');
    expect(ingestLoad(dirty, {}).load).toBe(8);
    expect(ingestLoad(dirty, {}, 0.5).load).toBe(4);
    expect(ingestLoad(itemDef('chicken_rice'), chickenRice(0))).toEqual({ load: 20, spoiled: true, murky: false });
    expect(ingestLoad(itemDef('canned_food'), { condition: undefined }).load).toBe(0);
  });
});

describe('the stomach seeps into infection, the gut recedes', () => {
  it('lands 3/h while drinking, fading 1.5/h at the same time', () => {
    let m = upsetStomach(meters(), 12);
    m = tickGut(m, 1);
    expect(m.stomach).toBe(9);
    expect(m.infection).toBeCloseTo(1.5);
    expect(infectionRatePerHour(m)).toBe(1.5);
    for (let h = 0; h < 30; h++) m = tickGut(m, 1);
    expect(m.stomach).toBe(0);
    expect(m.infection).toBe(0);
  });

  it('does not recede while parched', () => {
    const m = tickGut(meters({ thirst: 20, infection: 10, gut: 10 }), 4);
    expect(m.infection).toBe(10);
  });

  it('caps what food can put in the meter', () => {
    let m = upsetStomach(meters({ thirst: 10 }), 200);
    for (let h = 0; h < 80; h++) m = tickGut(m, 1);
    expect(m.gut).toBe(GUT_CAP);
    expect(m.infection).toBe(GUT_CAP);
    expect(m.stomach).toBe(0);
  });

  it('wound infection never recedes on its own', () => {
    const m = tickGut(meters({ infection: 30, gut: 10 }), 20);
    expect(m.infection).toBe(20);
    expect(m.gut).toBe(0);
  });

  it('tickMeters dries you out while the stomach is upset', () => {
    const calm = tickMeters(meters({ thirst: 80 }), 1);
    const upset = tickMeters(meters({ thirst: 80, stomach: 10 }), 1);
    expect(80 - upset.thirst).toBeCloseTo((80 - calm.thirst) * 1.6);
    expect(upset.stomach).toBe(7);
  });
});

describe('remedies', () => {
  it('Po Chai settles the load, Yakult halves it, others leave it', () => {
    const m = meters({ stomach: 14 });
    expect(settleStomach(m, 'po_chai').stomach).toBe(0);
    expect(settleStomach(m, 'yakult').stomach).toBe(7);
    expect(settleStomach(m, 'antibiotics')).toBe(m);
  });

  it('cures take gut infection first', () => {
    const m = cureInfection(meters({ infection: 40, gut: 15 }), 10);
    expect(m.infection).toBe(30);
    expect(m.gut).toBe(5);
  });
});

describe('high infection makes you ill, not dead', () => {
  it('tiers', () => {
    expect(infectionTier(29)).toBe('none');
    expect(infectionTier(30)).toBe('fever');
    expect(infectionTier(60)).toBe('high');
    expect(infectionTier(100)).toBe('critical');
  });

  it('a full meter alone does not end the run', () => {
    expect(checkDeath(meters({ infection: 100 }), initialBodyParts(90))).toBeNull();
  });

  it('fever drains energy faster', () => {
    const well = tickMeters(meters({ energy: 80 }), 1);
    const ill = tickMeters(meters({ energy: 80, infection: 90 }), 1);
    expect(80 - ill.energy).toBeCloseTo((80 - well.energy) * 1.6);
  });
});
