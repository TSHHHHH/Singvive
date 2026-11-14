import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '../game/types';
import { itemName } from '../i18n';
import { browseCraftingRows, craftingRows, matchesCraftFilter } from './craftingCatalog';

function pack(defId: string, stack = 1, container = 'backpack'): ItemInstance {
  return { uid: defId, defId, stack, container, x: 0, y: 0, rotated: false };
}

const defaults = { query: '', category: 'all', filter: 'all', sort: 'ready', locale: 'en' } as const;

describe('crafting browser', () => {
  it('only offers actually craftable recipes, including adjusted costs and carried loose items', () => {
    const rows = craftingRows([pack('cloth_rags', 1, 'loose'), pack('scrap_metal', 10, 'stash')], false, -1);
    expect(rows.find((row) => row.recipe.id === 'bandages')?.check.ok).toBe(true);
    expect(rows.find((row) => row.recipe.id === 'lockpick')?.check.ok).toBe(false);
    expect(browseCraftingRows(rows, { ...defaults, filter: 'ready' }).every((row) => row.check.ok)).toBe(true);
  });

  it('excludes missing shelter or tools from the one-ingredient-away filter', () => {
    const away = craftingRows([], false, 0);
    expect(matchesCraftFilter(away.find((row) => row.recipe.id === 'bandages')!, 'almost')).toBe(true);
    expect(matchesCraftFilter(away.find((row) => row.recipe.id === 'parts')!, 'almost')).toBe(false);
    const sheltered = craftingRows([], true, 0);
    expect(matchesCraftFilter(sheltered.find((row) => row.recipe.id === 'parts')!, 'almost')).toBe(false);
    const equipped = craftingRows([pack('toolbox')], true, 0);
    expect(matchesCraftFilter(equipped.find((row) => row.recipe.id === 'parts')!, 'almost')).toBe(true);
  });

  it('uses the same clean-first water selection and inventory totals as crafting', () => {
    const dirty = craftingRows([pack('coffee_portion', 2), pack('dirty_water')], false, 0).find((row) => row.recipe.id === 'kopi_o_kosong')!;
    expect(dirty.check.ok).toBe(true);
    expect(dirty.waterId).toBe('dirty_water');
    const clean = craftingRows([pack('coffee_portion', 2), pack('dirty_water'), pack('newater')], false, 0).find((row) => row.recipe.id === 'kopi_o_kosong')!;
    expect(clean.waterId).toBe('newater');
    expect(clean.ingredients.map((input) => input.defId)).toEqual(['coffee_portion', 'newater']);
    const missing = craftingRows([pack('coffee_portion', 2)], false, 0).find((row) => row.recipe.id === 'kopi_o_kosong')!;
    expect(missing.missingKinds).toBe(1);
    expect(missing.check.ok).toBe(false);
  });

  it('searches output, recipe, ingredient and tool names and combines filters', () => {
    const rows = craftingRows([], false, 0);
    expect(browseCraftingRows(rows, { ...defaults, query: '  cloth RAGS ', category: 'medical' }).map((row) => row.recipe.id)).toEqual(['bandages']);
    expect(browseCraftingRows(rows, { ...defaults, query: 'toolbox' }).every((row) => row.recipe.tool === 'toolbox')).toBe(true);
    expect(browseCraftingRows(rows, { ...defaults, query: 'Lash a Knife Spear' }).map((row) => row.recipe.id)).toEqual(['spear_knife']);
    expect(browseCraftingRows(rows, { ...defaults, query: 'not a recipe' })).toEqual([]);
  });

  it('shows mixed and incomplete water batches as one ingredient group', () => {
    const context = { now: 0, atSite: true, site: { fireUntil: 24 }, mode: 'hot' as const, waterSource: 'carried' as const };
    const mixed = craftingRows([pack('cooking_pot'), pack('water_bottle'), pack('dirty_water')], true, 0, context).find(r => r.recipe.id === 'boil')!;
    expect(mixed.check.ok).toBe(true);
    expect(mixed.ingredients).toHaveLength(1);
    expect(mixed.ingredients[0]).toMatchObject({ need: 2, have: 2, water: true });
    const short = craftingRows([pack('cooking_pot'), pack('water_bottle')], true, 0, context).find(r => r.recipe.id === 'boil')!;
    expect(short.check.ok).toBe(false);
    expect(short.ingredients).toHaveLength(1);
    expect(short.missingKinds).toBe(1);
  });

  it('sorts globally by readiness, time or localized output name without changing catalog order', () => {
    const rows = craftingRows([pack('cloth_rags', 2)], false, 0);
    const ids = rows.map((row) => row.recipe.id);
    expect(browseCraftingRows(rows, defaults)[0].recipe.id).toBe('bandages');
    const byTime = browseCraftingRows(rows, { ...defaults, sort: 'time' });
    expect(byTime.map((row) => row.recipe.hours)).toEqual(byTime.map((row) => row.recipe.hours).sort((a, b) => a - b));
    const byName = browseCraftingRows(rows, { ...defaults, sort: 'name', category: 'weapons' });
    expect(byName.length).toBeGreaterThan(0);
    const names = byName.map((row) => itemName(row.recipe.outputDefId, 'en'));
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(rows.map((row) => row.recipe.id)).toEqual(ids);
  });
});
