import type { ItemInstance } from './types';
import { itemDef } from './loot';

/**
 * Crafting exists to make loot flow *out*. Every recipe here is a sink first
 * and a source second — the scrap and tape you hoover up out of every hardware
 * store have somewhere to go, and clean water has to be made rather than found.
 *
 * Deliberately small. A handful of recipes is a resource loop; sixty is a second game.
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

export const RECIPES: Recipe[] = [
  {
    id: 'purify',
    name: 'Purify Water',
    inputs: { dirty_water: 1, purification_tabs: 1 },
    outputDefId: 'newater',
    outputCount: 1,
    hours: 0.5,
    needsShelter: false,
    blurb: 'Tablets and twenty minutes turn a bottle of murk into something safe.',
  },
  {
    id: 'boil',
    name: 'Boil Water',
    inputs: { dirty_water: 2, fuel_can: 1 },
    outputDefId: 'newater',
    outputCount: 2,
    hours: 1.5,
    needsShelter: true,
    blurb: 'Slower than tablets and it costs you fuel — fuel also counts hard toward evac readiness.',
  },
  {
    id: 'bandages',
    name: 'Tear Dressings',
    inputs: { cloth_rags: 2 },
    outputDefId: 'improvised_bandage',
    outputCount: 2,
    hours: 0.5,
    needsShelter: false,
    blurb:
      'Rags torn into strips. It will stop the bleeding — it will not stop what gets in afterwards.',
  },
  /*
   * Lashed spears. One recipe per blade rather than one generic spear, because
   * a single output would make binding a parang to a stick strictly worse than
   * binding a kitchen knife to it — same result, better blade spent. The blade
   * you give up is the blade you get back, with reach added.
   */
  {
    id: 'spear_knife',
    name: 'Lash a Knife Spear',
    inputs: { wooden_stick: 1, kitchen_knife: 1, duct_tape: 1 },
    outputDefId: 'spear_knife',
    outputCount: 1,
    hours: 0.5,
    needsShelter: false,
    blurb: 'A kitchen knife taped to a length of timber. Keeps them at arm’s length.',
  },
  {
    id: 'spear_cleaver',
    name: 'Lash a Cleaver Spear',
    inputs: { wooden_stick: 1, meat_cleaver: 1, duct_tape: 1 },
    outputDefId: 'spear_cleaver',
    outputCount: 1,
    hours: 0.5,
    needsShelter: false,
    blurb: 'Heavier at the tip than a knife spear, and it bites deeper for it.',
  },
  {
    id: 'spear_parang',
    name: 'Lash a Parang Spear',
    inputs: { wooden_stick: 1, parang: 1, duct_tape: 1 },
    outputDefId: 'spear_parang',
    outputCount: 1,
    hours: 0.75,
    needsShelter: false,
    blurb: 'The best of them — and it costs you the best blade you own.',
  },
  {
    id: 'parts',
    name: 'Strip for Parts',
    inputs: { scrap_metal: 3 },
    outputDefId: 'spare_parts',
    outputCount: 1,
    hours: 1,
    needsShelter: true,
    tool: 'toolbox',
    blurb: 'Scrap is heavy and worth nothing. Parts are light and repair things.',
  },
  {
    id: 'shells',
    name: 'Reload Shells',
    inputs: { spare_parts: 1, scrap_metal: 1 },
    outputDefId: 'ammo_shell',
    outputCount: 2,
    hours: 1.5,
    needsShelter: true,
    tool: 'toolbox',
    blurb: 'Handloading. Ugly, slow, and the only ammunition anyone still makes.',
  },
  {
    id: 'sleeping_bag',
    name: 'Stitch a Sleeping Bag',
    inputs: { cloth_rags: 4, duct_tape: 1 },
    outputDefId: 'sleeping_bag',
    outputCount: 1,
    hours: 2,
    needsShelter: true,
    blurb: 'Rags and tape into something you can sleep in. Heavy, but better than the floor.',
  },
];

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
