import { beforeAll, describe, expect, it } from 'vitest';
import { craftedPrep, DIRTY_WATER_DRINK_INFECTION, RECIPES } from './crafting';
import { addToGrid, MUDDY_WATER_EFFECT, preparedEffect } from './inventory';
import { itemDef } from './loot';
import { instanceName } from '../i18n';
import { ensureLocale } from '../i18n/t';

beforeAll(() => ensureLocale('zh-Hans'));

const recipe = (id: string) => RECIPES.find((r) => r.id === id)!;
const carried = { waterSource: 'carried' } as const;

describe('murky water in recipes', () => {
  it('marks drinks and meals muddy, and only a cold drink keeps the germs', () => {
    const kopi = recipe('kopi_o_kosong');
    const murky = { coffee_portion: 2, dirty_water: 1 };
    expect(craftedPrep(kopi, murky, { ...carried, mode: 'room' }))
      .toEqual({ coldPrepared: true, muddy: true, contaminationRisk: DIRTY_WATER_DRINK_INFECTION });
    expect(craftedPrep(kopi, murky, { ...carried, mode: 'hot' })).toEqual({ hotPrepared: true, muddy: true });
    expect(craftedPrep(kopi, { coffee_portion: 2, newater: 1 }, { ...carried, mode: 'hot' })).toEqual({ hotPrepared: true });
    expect(craftedPrep(recipe('cooked_mee'), { instant_noodles: 1, dirty_water: 1 }, { ...carried, mode: 'room' }))
      .toEqual({ muddy: true });
  });

  it('leaves boiled site water, boiling itself and purifying alone', () => {
    const kopi = recipe('kopi_o_kosong');
    expect(craftedPrep(kopi, { coffee_portion: 2, dirty_water: 1 }, { waterSource: 'site', mode: 'hot' }).muddy).toBeUndefined();
    expect(craftedPrep(recipe('boil'), { dirty_water: 2 }, { ...carried, mode: 'room' })).toEqual({});
    expect(craftedPrep(recipe('purify'), { dirty_water: 1, purification_tabs: 1 }, { ...carried, mode: 'room' })).toEqual({});
  });

  it('halves every restore, and stacks with cold mixing on food and energy', () => {
    const kopi = itemDef('kopi').effect; // thirst 24, hunger 6, energy 16
    expect(MUDDY_WATER_EFFECT).toBe(0.5);
    expect(preparedEffect(kopi, { muddy: true })).toMatchObject({ thirst: 12, hunger: 3, energy: 8 });
    expect(preparedEffect(kopi, { muddy: true, coldPrepared: true })).toMatchObject({ thirst: 12, hunger: 2, energy: 4 });
    expect(preparedEffect(kopi, { coldPrepared: true })).toMatchObject({ thirst: 24, hunger: 3, energy: 8 });
  });

  it('never gives more water than drinking the murky water straight', () => {
    const straight = (itemDef('dirty_water').effect as { thirst: number }).thirst;
    for (const r of RECIPES.filter((x) => x.waterInput && !x.facility)) {
      const fx = preparedEffect(itemDef(r.outputDefId).effect, { muddy: true }) as { thirst?: number };
      expect(fx.thirst ?? 0, r.id).toBeLessThanOrEqual(straight * r.waterInput!);
    }
  });

  it('keeps muddy and clean stacks apart', () => {
    let items = addToGrid([], 'backpack', 'kopi', 1, undefined, { hotPrepared: true }).items;
    items = addToGrid(items, 'backpack', 'kopi', 1, undefined, { hotPrepared: true, muddy: true }).items;
    expect(items).toHaveLength(2);
  });

  it('names the variant', () => {
    expect(instanceName({ defId: 'kopi', hotPrepared: true }, 'en')).toBe('Hot Kopi');
    expect(instanceName({ defId: 'kopi', hotPrepared: true, muddy: true }, 'en')).toBe('Hot Muddy Kopi');
    expect(instanceName({ defId: 'kopi', coldPrepared: true, muddy: true }, 'en')).toBe('Room-temp Muddy Kopi');
    expect(instanceName({ defId: 'cooked_mee', muddy: true }, 'en')).toBe('Muddy Cooked Noodle Soup');
    expect(instanceName({ defId: 'kopi' }, 'en')).toBe('Kopi');
    const teh = instanceName({ defId: 'teh_o_kosong' }, 'zh-Hans');
    expect(teh).not.toBe('Teh-O Kosong');
    expect(instanceName({ defId: 'teh_o_kosong', hotPrepared: true }, 'zh-Hans')).toBe(`热的${teh}`);
    expect(instanceName({ defId: 'teh_o_kosong', hotPrepared: true, muddy: true }, 'zh-Hans')).toBe(`热浑浊${teh}`);
  });
});
