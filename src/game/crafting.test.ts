import { describe, expect, it } from 'vitest';
import { canCraft, RECIPES, waterInputFor } from './crafting';
import { addToGrid } from './inventory';
import type { ItemInstance } from './types';

function item(defId: string, stack = 1): ItemInstance {
  return { uid: defId, defId, container: 'backpack', x: 0, y: 0, rotated: false, stack };
}

describe('powdered drink crafting', () => {
  it('prefers clean water, but accepts murky water when it is all the player has', () => {
    expect(waterInputFor([item('dirty_water'), item('newater')], 1)).toBe('newater');
    expect(waterInputFor([item('dirty_water')], 1)).toBe('dirty_water');
    expect(waterInputFor([item('water_bottle')], 2)).toBeNull();
  });

  it('recognises a water-group recipe with any carried water source', () => {
    const recipe = RECIPES.find((r) => r.id === 'kopi_o');
    expect(recipe).toBeDefined();
    expect(canCraft(recipe!, [item('coffee'), item('dirty_water')], false)).toEqual({
      ok: true,
      reason: '',
    });
  });

  it('keeps unsafe-water contamination on the prepared drink instance', () => {
    const made = addToGrid([], 'backpack', 'kopi_o', 1, undefined, 8);
    expect(made.items[0]?.contaminationRisk).toBe(8);
  });
});
