import type { ItemInstance } from './types';
import { ITEMS, itemDef } from './loot';
import recipesCatalog from './data/recipes.json' with { type: 'json' };

/**
 * Crafting exists to make loot flow *out*. Every recipe here is a sink first
 * and a source second — the scrap and tape you hoover up out of every hardware
 * store have somewhere to go, and clean water has to be made rather than found.
 *
 * Deliberately small. A handful of recipes is a resource loop; sixty is a second game.
 * Source of truth is `src/game/data/recipes.json` (editable via the DEV loot browser).
 *
 * Lashed spears stay one recipe per blade rather than one generic spear, because
 * a single output would make binding a parang to a stick strictly worse than
 * binding a kitchen knife to it — same result, better blade spent. The blade
 * you give up is the blade you get back, with reach added.
 */

export interface Recipe {
  id: string;
  name: string;
  /** What it consumes, as defId → count. */
  inputs: Record<string, number>;
  outputDefId: string;
  outputCount: number;
  /** In-game hours it burns. Crafting is never free. */
  hours: number;
  /** Needs a workbench — a stash or an HDB shelter, not a roadside. */
  needsShelter: boolean;
  /** Must be in the backpack, but is not consumed. */
  tool?: string;
  blurb: string;
}

export const RECIPES: Recipe[] = structuredClone(recipesCatalog) as unknown as Recipe[];

if (import.meta.env.DEV) {
  const seen = new Set<string>();
  for (const recipe of RECIPES) {
    if (seen.has(recipe.id)) console.error(`[crafting] duplicate recipe id "${recipe.id}"`);
    seen.add(recipe.id);
    if (!(recipe.hours > 0)) {
      console.error(`[crafting] ${recipe.id} has non-positive hours ${recipe.hours}`);
    }
    if (!(recipe.outputCount > 0)) {
      console.error(`[crafting] ${recipe.id} has non-positive outputCount`);
    }
    if (!ITEMS[recipe.outputDefId]) {
      console.error(`[crafting] ${recipe.id} outputs unknown item "${recipe.outputDefId}"`);
    }
    if (recipe.tool && !ITEMS[recipe.tool]) {
      console.error(`[crafting] ${recipe.id} needs unknown tool "${recipe.tool}"`);
    }
    const inputIds = Object.keys(recipe.inputs);
    if (inputIds.length === 0) {
      console.error(`[crafting] ${recipe.id} has no inputs`);
    }
    for (const [defId, count] of Object.entries(recipe.inputs)) {
      if (!ITEMS[defId]) console.error(`[crafting] ${recipe.id} consumes unknown item "${defId}"`);
      if (!(count > 0)) console.error(`[crafting] ${recipe.id} input ${defId} has non-positive count`);
    }
  }
}

// ---------- Repair ----------

/**
 * Repair is the main scrap sink and deliberately not a recipe: it targets one
 * instance rather than producing an item, so it needs its own entry point.
 */
export const REPAIR_INPUTS: Record<string, number> = { duct_tape: 1, scrap_metal: 1 };
export const REPAIR_TOOL = 'toolbox';
export const REPAIR_AMOUNT = 30;
export const REPAIR_HOURS = 1;

/** Whetstones and gun oil fix one kind of thing each, without a workbench. */
export const FIELD_REPAIRS: { defId: string; melee: boolean; amount: number }[] = [
  { defId: 'whetstone', melee: true, amount: 25 },
  { defId: 'gun_oil', melee: false, amount: 25 },
];

// ---------- Availability ----------

/** How many of a def sit in the backpack, counting stack sizes. */
export function countOf(items: ItemInstance[], defId: string): number {
  return items
    .filter((i) => i.container === 'backpack' && i.defId === defId)
    .reduce((n, i) => n + i.stack, 0);
}

export interface RecipeAvailability {
  ok: boolean;
  /** Why not, phrased for the player. Empty when `ok`. */
  reason: string;
}

export function canCraft(
  recipe: Recipe,
  items: ItemInstance[],
  atShelter: boolean,
  inputs?: Record<string, number>,
): RecipeAvailability {
  if (recipe.needsShelter && !atShelter) {
    return { ok: false, reason: 'Needs somewhere to work' };
  }
  if (recipe.tool && countOf(items, recipe.tool) < 1) {
    return { ok: false, reason: `Needs a ${itemDef(recipe.tool).name}` };
  }
  const needMap = inputs ?? recipe.inputs;
  for (const [defId, need] of Object.entries(needMap)) {
    const have = countOf(items, defId);
    if (have < need) {
      return { ok: false, reason: `Needs ${need}× ${itemDef(defId).name} (have ${have})` };
    }
  }
  return { ok: true, reason: '' };
}

/** A short "2× Scrap Metal · 1× Duct Tape" line for the UI. */
export function describeInputs(inputs: Record<string, number>): string {
  return Object.entries(inputs)
    .map(([defId, n]) => `${n}× ${itemDef(defId).name}`)
    .join(' · ');
}
