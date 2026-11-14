import { describe, expect, it } from 'vitest';
import { buildFacility, collectedRain, gameHour, heatRemaining } from './facilities';
import { canCraft, recipeInputs, RECIPES, type CraftContext } from './crafting';
import { addToCarry, preparedEffect } from './inventory';
import { itemDef } from './loot';
import type { ItemInstance } from './types';
import { Rng } from './rng';
import { rollWeather } from './weather';
import { evaluateSleepConditions } from './sleep';
import { OPEN_LANDMARK_IDS } from './landmarks';
import { normalizeRecipesCatalog, validateRecipesCatalog } from '../dev/validateRecipes';
import { ITEMS } from './loot';

const item = (defId: string, stack = 1): ItemInstance => ({ uid: defId, defId, stack, container: 'backpack', x: 0, y: 0, rotated: false });
const recipe = (id: string) => RECIPES.find(r => r.id === id)!;
const context = (over: Partial<CraftContext> = {}): CraftContext => ({ atSite: true, now: 23.5, mode: 'hot', waterSource: 'carried', ...over });

describe('location cooking', () => {
  it('expires exactly 24 game hours after lighting, across midnight and after a save round trip', () => {
    const start = gameHour(1, 23.5);
    const site = JSON.parse(JSON.stringify(buildFacility(undefined, 'fire', start, 1)));
    expect(heatRemaining(site, gameHour(2, 0))).toBe(23.5);
    expect(heatRemaining(site, gameHour(2, 23.5))).toBe(0);
    expect(heatRemaining(site, gameHour(4, 8))).toBe(0);
  });
  it('rejects cooking without a site, pot, or enough heat to finish', () => {
    const pack = [item('cooking_pot'), item('instant_noodles'), item('water_bottle')];
    const r = recipe('cooked_mee');
    expect(canCraft(r, pack, true, undefined, context({ atSite: false })).ok).toBe(false);
    expect(canCraft(r, pack.slice(1), true, undefined, context({ site: { fireUntil: 40 } })).block?.kind).toBe('pot');
    expect(canCraft(r, pack, true, undefined, context({ site: { fireUntil: 23.99 } })).block?.kind).toBe('heat');
    expect(canCraft(r, pack, true, undefined, context({ site: { fireUntil: 24 } })).ok).toBe(true);
  });
  it('can cook from a still-hot local batch without spending another bottle', () => {
    const r = recipe('cooked_mee');
    const pack = [item('instant_noodles'), item('cooking_pot')];
    const ctx = context({ waterSource: 'site', site: { water: { amount: 2, hotUntil: 24 } } });
    const inputs = recipeInputs(r, pack, r.inputs, ctx);
    expect(inputs).toEqual({ instant_noodles: 1 });
    expect(canCraft(r, pack, true, inputs, ctx).ok).toBe(true);
    expect(canCraft(r, pack, true, inputs, { ...ctx, now: 24 }).ok).toBe(false);
  });
  it('allows mixed water types, and refuses a short batch instead of consuming partial water', () => {
    const r = recipe('boil');
    const ctx = context({ site: { fireUntil: 40 } });
    const pack = [item('cooking_pot'), item('newater'), item('dirty_water')];
    expect(recipeInputs(r, pack, r.inputs, ctx)).toEqual({ newater: 1, dirty_water: 1 });
    expect(canCraft(r, pack, true, undefined, ctx).ok).toBe(true);
    expect(canCraft(r, pack.slice(0, 2), true, undefined, ctx).block?.kind).toBe('water');
  });
  it('keeps cooled water clean and prevents overwriting it or stacking active fires', () => {
    const site = buildFacility(undefined, 'hot_water', 8, 2);
    expect(site.water).toEqual({ amount: 2, hotUntil: 10 });
    expect(canCraft(recipe('boil'), [item('cooking_pot'), item('water_bottle', 2)], true, undefined,
      context({ now: 12, site: { ...site, fireUntil: 30 } })).block?.kind).toBe('occupied');
    expect(canCraft(recipe('cooking_fire'), [], true, undefined,
      context({ site: { fireUntil: 30 } })).block?.kind).toBe('occupied');
    expect(canCraft(recipe('fuel_stove'), [], true, undefined, context()).block?.kind).toBe('stove');
  });
  it('halves cold drink food/energy without halving hydration or contamination', () => {
    const made = addToCarry([], 'kopi', 1, undefined, 8, true).items[0];
    const loaded: ItemInstance = JSON.parse(JSON.stringify(made));
    expect(preparedEffect(itemDef('kopi').effect, loaded)).toEqual({ kind: 'water', hunger: 3, energy: 8, thirst: 24 });
    expect(loaded.contaminationRisk).toBe(8);
    expect(preparedEffect(itemDef('kopi').effect, {})).toEqual(itemDef('kopi').effect);
  });
  it('allows room-temperature drinks away from facilities but never uncooked soup', () => {
    const ctx = context({ mode: 'room', atSite: false });
    expect(canCraft(recipe('kopi_o_kosong'), [item('coffee_portion', 2), item('dirty_water')], false, undefined, ctx).ok).toBe(true);
    expect(canCraft(recipe('cooked_mee'), [item('instant_noodles'), item('cooking_pot'), item('water_bottle')], false, undefined, ctx).ok).toBe(false);
  });
});

describe('rain facilities', () => {
  it('integrates only rain across day boundaries, caps storage and preserves fractional collection', () => {
    const seed = 'rain-test';
    const start = 20;
    let expected = 0;
    for (let day = 1; day <= 4; day++) {
      const kind = rollWeather(new Rng(seed), day);
      if (kind === 'rain' || kind === 'thunderstorm') expected += (day === 1 ? 4 : 24) / 3;
    }
    const site = { collector: { checkedAt: start, water: 0.25 } };
    const actual = collectedRain(site, 96, seed);
    expect(actual).toBe(Math.min(4, expected + 0.25));
    expect(collectedRain({ collector: { checkedAt: 96, water: actual % 1 } }, 96, seed)).toBe(actual % 1);
    expect(collectedRain(undefined, 96, seed)).toBe(0);
  });
  it('adds a roof at an open landmark without reducing ambush risk', () => {
    const ctx = { currentPositionId: [...OPEN_LANDMARK_IDS][0], category: 'landmark' as const, hdb: null, hasSleepingBag: false };
    const bare = evaluateSleepConditions(ctx), covered = evaluateSleepConditions({ ...ctx, rainShelter: true });
    expect(covered.roof).toBe('yes');
    expect(covered.recoveryMult).toBeGreaterThan(bare.recoveryMult);
    expect(covered.ambush).toEqual(bare.ambush);
  });
});

it('validates and round-trips preparation metadata in the recipe editor', () => {
  expect(validateRecipesCatalog(RECIPES, new Set(Object.keys(ITEMS)))).toEqual([]);
  expect(normalizeRecipesCatalog(RECIPES)).toEqual(RECIPES);
});
