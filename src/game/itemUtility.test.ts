import { describe, expect, it } from 'vitest';
import { ITEMS, LOOT_TABLES } from './loot';
import { FIELD_REPAIRS, RECIPES, REPAIR_INPUTS, REPAIR_TOOL } from './crafting';
import { WATER_INPUT_IDS } from './crafting';

describe('every catalog item has a practical use', () => {
  it('requires direct effects, equipment, bedding, a recipe, or an implemented service action', () => {
    const ingredients = new Set(RECIPES.flatMap(r => Object.keys(r.inputs)));
    const tools = new Set(RECIPES.map(r => r.tool));
    const siteOutputs = new Set(RECIPES.filter(r => r.facility).map(r => r.outputDefId));
    // Explicit actions implemented in the store: lockPick, repairItem, and recipe water.
    const actions = new Set<string>([
      'lockpick', 'cooking_pot', REPAIR_TOOL, ...Object.keys(REPAIR_INPUTS),
      ...FIELD_REPAIRS.map(r => r.defId), ...WATER_INPUT_IDS,
    ]);
    const unused = Object.values(ITEMS).filter(def =>
      def.effect.kind === 'misc' && !def.slot && !def.sleepGear
      && !ingredients.has(def.id) && !tools.has(def.id) && !actions.has(def.id) && !siteOutputs.has(def.id));
    // A price alone is deliberately not a use; junk must have a gameplay path.
    expect(unused.map(def => def.id)).toEqual([]);
  });
  it('keeps prepared food/drinks and immovable facilities out of ordinary loot', () => {
    const outputs = new Set(RECIPES.filter(r => r.facility || r.preparation).map(r => r.outputDefId));
    expect(Object.values(LOOT_TABLES).flatMap(rows => rows.filter(([id]) => outputs.has(id)))).toEqual([]);
  });
  it('makes new gear equipable and the sling bag larger than bare pockets', () => {
    expect(ITEMS.pot_helmet.slot).toBe('head');
    expect(ITEMS.towel_vest.modifiers?.limbArmor).toBeGreaterThan(0);
    expect(ITEMS.magazine_guards.slot).toBe('legs');
    expect(ITEMS.sling_bag.packGrid!.w * ITEMS.sling_bag.packGrid!.h).toBeGreaterThan(20);
    expect(RECIPES.find(r => r.id === 'pot_helmet')?.inputs.cooking_pot).toBe(1);
  });
});
