import { isCarried } from './inventory';
import type { ItemInstance } from './types';
import { ITEMS, itemDef } from './loot';
import recipesCatalog from './data/recipes.json' with { type: 'json' };
import { heatRemaining, type FacilityCraft, type SiteFacilities } from './facilities';

/**
 * Crafting exists to make loot flow *out*. Every recipe here is a sink first
 * and a source second — the scrap and tape you hoover up out of every hardware
 * store have somewhere to go, and clean water has to be made rather than found.
 *
 * Recipes give every item a practical use. Drink variations share a family in the UI.
 * Source of truth is `src/game/data/recipes.json` (editable via the DEV loot browser).
 *
 * Lashed spears stay one recipe per blade rather than one generic spear, because
 * a single output would make binding a parang to a stick strictly worse than
 * binding a kitchen knife to it — same result, better blade spent. The blade
 * you give up is the blade you get back, with reach added.
 *
 * SG flavour crafts (EZ-Link knife, Kopi C, Maggi, Milo dinosaur) are the same
 * rule in local dress: pile-up loot with nowhere else to go, turned into a
 * worse-or-equal tool or meal. They do not mint value and they do not drop.
 */

export interface Recipe {
  preparation?: 'drink' | 'cook' | 'boil';
  facility?: FacilityCraft;
  family?: 'kopi' | 'teh';
  /** Portioning/salvage conserves materials; trait discounts do not apply. */
  fixedInputs?: boolean;
  id: string;
  name: string;
  /** What it consumes, as defId → count. */
  inputs: Record<string, number>;
  /** Optional water input. The player can use any carried water source. */
  waterInput?: number;
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

/** Water sources that can be poured into a recipe, clean or unsafe. */
export const WATER_INPUT_IDS = [
  'water_bottle',
  'newater',
  'large_water_bottle',
  'dirty_water',
] as const;

/** Infection added when a drink is mixed with murky water. */
export const DIRTY_WATER_DRINK_INFECTION = 8;

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
    if (recipe.waterInput !== undefined && (!Number.isInteger(recipe.waterInput) || recipe.waterInput <= 0)) {
      console.error(`[crafting] ${recipe.id} has invalid waterInput ${recipe.waterInput}`);
    }
    if (!ITEMS[recipe.outputDefId]) {
      console.error(`[crafting] ${recipe.id} outputs unknown item "${recipe.outputDefId}"`);
    }
    if (recipe.tool && !ITEMS[recipe.tool]) {
      console.error(`[crafting] ${recipe.id} needs unknown tool "${recipe.tool}"`);
    }
    const inputIds = Object.keys(recipe.inputs);
    if (inputIds.length === 0 && !recipe.waterInput) {
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
    .filter((i) => isCarried(i.container) && i.defId === defId)
    .reduce((n, i) => n + i.stack, 0);
}

/**
 * Machine-readable twin of `reason`. The panel needs to *translate* the
 * blocker, and `src/game/` stays free of the message catalog — so the shape
 * travels and the UI writes the sentence. `reason` stays for the run log and
 * the DEV recipe sandbox, which both want plain English.
 */
export type CraftBlock =
  | { kind: 'site' | 'heat' | 'pot' | 'site_water' | 'occupied' | 'stove' }
  | { kind: 'shelter' }
  | { kind: 'tool'; defId: string }
  | { kind: 'input'; defId: string; need: number; have: number }
  | { kind: 'water'; need: number; have: number };

export interface RecipeAvailability {
  ok: boolean;
  /** Why not, phrased for the player. Empty when `ok`. */
  reason: string;
  /** Present only when blocked — the same fact, for the UI to localize. */
  block?: CraftBlock;
}

export interface CraftContext {
  site?: SiteFacilities;
  atSite?: boolean;
  now: number;
  mode: 'hot' | 'room';
  waterSource: 'carried' | 'site';
}
export const DEFAULT_CRAFT_CONTEXT: CraftContext = { now: 0, mode: 'room', waterSource: 'carried' };

/** Same water choice/costs for the browser and the store; bottles may be mixed. */
export function recipeInputs(recipe: Recipe, items: ItemInstance[], inputs: Record<string, number>, ctx: CraftContext): Record<string, number> {
  const next = { ...inputs };
  if (!recipe.waterInput || (ctx.waterSource === 'site' && recipe.preparation !== 'boil')) return next;
  let remaining = recipe.waterInput;
  for (const id of WATER_INPUT_IDS) {
    const take = Math.min(remaining, Math.max(0, countOf(items, id) - (next[id] ?? 0)));
    if (take > 0) next[id] = (next[id] ?? 0) + take;
    remaining -= take;
  }
  return next;
}

export function craftSetup(recipe: Recipe, items: ItemInstance[], ctx: CraftContext): RecipeAvailability {
  const fail = (kind: 'site' | 'heat' | 'pot' | 'site_water' | 'occupied' | 'stove', reason: string): RecipeAvailability => ({ ok: false, reason, block: { kind } });
  const site = ctx.site;
  if (recipe.facility && !ctx.atSite) return fail('site', 'Needs a surface location');
  if ((recipe.facility === 'stove' && site?.stove) || (recipe.facility === 'rain_shelter' && site?.rainShelter)
    || (recipe.facility === 'rain_collector' && site?.collector)
    || (recipe.facility === 'fire' && (site?.fireUntil ?? 0) > ctx.now)
    || (recipe.facility === 'stove_fuel' && (site?.stoveUntil ?? 0) > ctx.now)
    || (recipe.facility === 'hot_water' && (site?.water?.amount ?? 0) > 0)) return fail('occupied', 'Already built or still in use; empty stored water before boiling another batch');
  if (recipe.facility === 'stove_fuel' && !site?.stove) return fail('stove', 'Build a stove here first');
  const usesSiteWater = !!recipe.waterInput && ctx.waterSource === 'site' && recipe.preparation !== 'boil';
  if (usesSiteWater && (!ctx.atSite || (site?.water?.amount ?? 0) < recipe.waterInput!)) return fail('site_water', 'Not enough prepared water here');
  const needsHeat = recipe.preparation === 'cook' || recipe.preparation === 'boil' || (recipe.preparation === 'drink' && ctx.mode === 'hot');
  if (needsHeat) {
    if (countOf(items, 'cooking_pot') < 1) return fail('pot', 'Needs a cooking pot');
    const hotBatch = usesSiteWater && (site?.water?.hotUntil ?? 0) >= ctx.now + recipe.hours;
    if (!ctx.atSite || (!hotBatch && heatRemaining(site, ctx.now) < recipe.hours)) return fail('heat', 'Needs heat here for the full preparation time');
  }
  return { ok: true, reason: '' };
}

export function canCraft(
  recipe: Recipe,
  items: ItemInstance[],
  atShelter: boolean,
  inputs?: Record<string, number>,
  ctx: CraftContext = DEFAULT_CRAFT_CONTEXT,
): RecipeAvailability {
  const setup = craftSetup(recipe, items, ctx);
  if (!setup.ok) return setup;
  if (recipe.needsShelter && !atShelter) {
    return { ok: false, reason: 'Needs somewhere to work', block: { kind: 'shelter' } };
  }
  if (recipe.tool && countOf(items, recipe.tool) < 1) {
    return {
      ok: false,
      reason: `Needs a ${itemDef(recipe.tool).name}`,
      block: { kind: 'tool', defId: recipe.tool },
    };
  }
  const needMap = inputs ?? recipeInputs(recipe, items, recipe.inputs, ctx);
  for (const [defId, need] of Object.entries(needMap)) {
    const have = countOf(items, defId);
    if (have < need) {
      return {
        ok: false,
        reason: `Needs ${need}× ${itemDef(defId).name} (have ${have})`,
        block: { kind: 'input', defId, need, have },
      };
    }
  }
  if (recipe.waterInput !== undefined) {
    const fromSite = ctx.waterSource === 'site' && recipe.preparation !== 'boil';
    const waterProvided = WATER_INPUT_IDS.reduce((n, id) => n + (needMap[id] ?? 0) - (recipe.inputs[id] ?? 0), 0);
    if (!fromSite && waterProvided < recipe.waterInput) {
      return {
        ok: false,
        reason: `Needs ${recipe.waterInput}× water`,
        block: { kind: 'water', need: recipe.waterInput, have: waterCarried(items) },
      };
    }
  }
  return { ok: true, reason: '' };
}

/** Every drop in the pack, clean or murky — what a water blocker compares against. */
export function waterCarried(items: ItemInstance[]): number {
  return WATER_INPUT_IDS.reduce((total, id) => total + countOf(items, id), 0);
}

/** Choose clean water first; murky water is accepted only as a last resort. */
export function waterInputFor(items: ItemInstance[], count: number): string | null {
  return WATER_INPUT_IDS.find((id) => countOf(items, id) >= count) ?? null;
}

/** A short "2× Scrap Metal · 1× Duct Tape" line for the UI. */
export function describeInputs(inputs: Record<string, number>): string {
  return Object.entries(inputs)
    .map(([defId, n]) => `${n}× ${itemDef(defId).name}`)
    .join(' · ');
}
