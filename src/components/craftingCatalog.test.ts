import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '../game/types';
import { itemName } from '../i18n';
import { browseCraftEntries, browseCraftingRows, craftingRows, groupCraftRows, matchesCraftFilter, pickVariant, tearRow } from './craftingCatalog';

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

  it('excludes missing tools from the one-ingredient-away filter (no workbench rule)', () => {
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

describe('crafting variant groups', () => {
  it('collapses drink families and shared outputs into one entry each, keeping every recipe', () => {
    const rows = craftingRows([], false, 0);
    const entries = groupCraftRows(rows);
    expect(entries.flatMap((e) => e.variants).length).toBe(rows.length);
    const kopi = entries.find((e) => e.key === 'family:kopi')!;
    expect(kopi.variants.map((v) => v.recipe.id)).toContain('kopi_o_kosong_di_lo');
    expect(entries.find((e) => e.key === 'out:tinder')!.variants).toHaveLength(4);
    expect(entries.find((e) => e.key === 'out:improvised_bandage')!.variants).toHaveLength(1);
    expect(entries.length).toBeLessThan(rows.length);
  });

  it('shows the remembered variant, or the best ready one, and never an unready one under Ready', () => {
    const items = [pack('coffee_portion', 2), pack('water_bottle')];
    const entries = groupCraftRows(craftingRows(items, false, 0));
    const view = (filter: 'all' | 'ready', chosen: Record<string, string> = {}) =>
      browseCraftEntries(entries, { ...defaults, filter }, chosen).find((v) => v.entry.key === 'family:kopi');
    expect(view('all')!.row.recipe.id).toBe('kopi_o_kosong');
    expect(view('all', { 'family:kopi': 'kopi_gau' })!.row.recipe.id).toBe('kopi_gau');
    expect(view('ready', { 'family:kopi': 'kopi_gau' })!.row.recipe.id).toBe('kopi_o_kosong');
    expect(pickVariant(entries.find((e) => e.key === 'family:kopi')!.variants, 'kopi_po').recipe.id).toBe('kopi_po');
  });

  it('finds a family entry by any variant name', () => {
    const entries = groupCraftRows(craftingRows([], false, 0));
    const hits = browseCraftEntries(entries, { ...defaults, query: itemName('kopi_o_kosong_di_lo', 'en') });
    expect(hits.map((v) => v.entry.key)).toEqual(['family:kopi']);
  });
});

describe('workbench removal, categories and the clothes strip', () => {
  it('no longer needs a stash or HDB for former shelter recipes', () => {
    const parts = craftingRows([pack('scrap_metal', 3), pack('toolbox')], false, 0).find((row) => row.recipe.id === 'parts')!;
    expect(parts.recipe.needsShelter).toBe(true);
    expect(parts.check.ok).toBe(true);
  });

  it('splits food, drinks and materials', () => {
    const rows = craftingRows([], true, 0);
    const cat = (id: string) => rows.find((row) => row.recipe.id === id)!.category;
    expect(cat('cooked_mee')).toBe('food');
    expect(cat('kopi')).toBe('drinks');
    expect(cat('paper_tinder')).toBe('materials');
    expect(cat('lockpick')).toBe('tools');
    expect(cat('cooking_fire')).toBe('facilities');
  });

  it('cutting up clothes groups with the towel under cloth rags and runs out', () => {
    const rows = [...craftingRows([], true, 0), tearRow(2, 0.25, 2)];
    const rags = groupCraftRows(rows).find((e) => e.key === 'out:cloth_rags')!;
    expect(rags.variants.map((v) => v.recipe.id)).toEqual(['towel_rags', 'tear_clothes']);
    expect(pickVariant(rags.variants).recipe.id).toBe('tear_clothes');
    const spent = tearRow(0, 0.25, 2);
    expect(spent.check.ok).toBe(false);
    expect(matchesCraftFilter(spent, 'almost')).toBe(false);
  });
});
