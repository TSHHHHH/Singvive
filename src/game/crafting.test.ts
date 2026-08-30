import { describe, it, expect } from 'vitest';
import type { ItemInstance } from './types';
import { itemDef } from './loot';
import {
  RECIPES,
  canCraft,
  countOf,
  describeInputs,
  type Recipe,
} from './crafting';

function findRecipe(id: string): Recipe {
  const r = RECIPES.find((r) => r.id === id);
  if (!r) throw new Error(`fixture recipe "${id}" missing from recipes.json`);
  return r;
}

function stack(defId: string, count: number, container = 'backpack'): ItemInstance {
  return {
    uid: `${defId}-${container}-${count}`,
    defId,
    container,
    x: 0,
    y: 0,
    rotated: false,
    stack: count,
  };
}

describe('RECIPES catalog', () => {
  it('has no duplicate ids', () => {
    const ids = RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every recipe outputs a known item and consumes only known items', () => {
    for (const r of RECIPES) {
      expect(itemDef(r.outputDefId), `${r.id} -> ${r.outputDefId}`).toBeTruthy();
      for (const defId of Object.keys(r.inputs)) {
        expect(itemDef(defId), `${r.id} needs ${defId}`).toBeTruthy();
      }
    }
  });
});

describe('countOf', () => {
  it('sums stacks of a defId in the backpack only', () => {
    const items = [
      stack('scrap_metal', 2, 'backpack'),
      stack('scrap_metal', 1, 'backpack'),
      stack('scrap_metal', 5, 'stash:some-location'),
      stack('duct_tape', 1, 'backpack'),
    ];
    expect(countOf(items, 'scrap_metal')).toBe(3);
    expect(countOf(items, 'duct_tape')).toBe(1);
    expect(countOf(items, 'nonexistent')).toBe(0);
  });
});

describe('canCraft', () => {
  const parts = findRecipe('parts'); // needsShelter, tool: toolbox, inputs: scrap_metal x3
  const bandages = findRecipe('bandages'); // no shelter, no tool, inputs: cloth_rags x2

  it('rejects when the recipe needs shelter and the player is out in the open', () => {
    const result = canCraft(parts, [stack('toolbox', 1), stack('scrap_metal', 3)], false);
    expect(result).toEqual({ ok: false, reason: 'Needs somewhere to work' });
  });

  it('checks the shelter requirement before the tool requirement', () => {
    // No toolbox AND not at shelter — the shelter reason should win.
    const result = canCraft(parts, [], false);
    expect(result.reason).toBe('Needs somewhere to work');
  });

  it('rejects when the required tool is missing', () => {
    const result = canCraft(parts, [stack('scrap_metal', 3)], true);
    expect(result).toEqual({ ok: false, reason: `Needs a ${itemDef('toolbox').name}` });
  });

  it('rejects with a have/need count when inputs are short', () => {
    const result = canCraft(parts, [stack('toolbox', 1), stack('scrap_metal', 1)], true);
    expect(result).toEqual({
      ok: false,
      reason: `Needs 3× ${itemDef('scrap_metal').name} (have 1)`,
    });
  });

  it('allows crafting once shelter, tool, and inputs are all satisfied', () => {
    const result = canCraft(parts, [stack('toolbox', 1), stack('scrap_metal', 3)], true);
    expect(result).toEqual({ ok: true, reason: '' });
  });

  it('does not require shelter or a tool for a recipe that needs neither', () => {
    expect(canCraft(bandages, [stack('cloth_rags', 1)], false).ok).toBe(false);
    expect(canCraft(bandages, [stack('cloth_rags', 2)], false)).toEqual({ ok: true, reason: '' });
  });

  it('supports checking availability against an override input map', () => {
    // Recipe wants 2 cloth_rags, but we ask canCraft to price a different bundle.
    const result = canCraft(bandages, [stack('duct_tape', 1)], false, { duct_tape: 1 });
    expect(result).toEqual({ ok: true, reason: '' });
  });
});

describe('describeInputs', () => {
  it('formats a multi-input recipe as a middle-dot separated list', () => {
    const spear = findRecipe('spear_knife');
    expect(describeInputs(spear.inputs)).toBe(
      `1× ${itemDef('wooden_stick').name} · 1× ${itemDef('kitchen_knife').name} · 1× ${itemDef('duct_tape').name}`,
    );
  });

  it('formats a single-input recipe with no separator', () => {
    const bandages = findRecipe('bandages');
    expect(describeInputs(bandages.inputs)).toBe(`2× ${itemDef('cloth_rags').name}`);
  });
});
