/** Economy, source, and warning helpers for the DEV recipe editor. */

import { FACTION_CONFIG } from '../game/factions';
import { evacWeightMult } from '../game/goal';
import { LOOT_TABLES } from '../game/loot';
import type { ItemDef, ItemInstance } from '../game/types';
import type { RecipeRecord, RecipesCatalog } from './validateRecipes';
import type { ItemsCatalog } from './lootApi';

/** Extra live-game effects the JSON catalog cannot see. */
export const RECIPE_EXTRA_NOTES: Record<string, string> = {
  boil: 'Burning a jerry can lowers your extract gauge.',
};

export type RecipeEconomy = {
  inValue: number;
  outValue: number;
  deltaValue: number;
  inWeight: number;
  outWeight: number;
  deltaWeight: number;
  inEvac: number;
  outEvac: number;
  deltaEvac: number;
  hours: number;
  valuePerHour: number | null;
};

export type ItemSourceFlags = {
  loot: boolean;
  craft: boolean;
  faction: boolean;
  starting: boolean;
};

export type RecipeWarning = {
  level: 'warn' | 'info';
  text: string;
};

function defOf(items: ItemsCatalog, id: string): ItemDef | undefined {
  return items[id];
}

export function recipeEconomy(recipe: RecipeRecord, items: ItemsCatalog): RecipeEconomy {
  let inValue = 0;
  let inWeight = 0;
  let inEvac = 0;
  for (const [id, count] of Object.entries(recipe.inputs)) {
    const def = defOf(items, id);
    if (!def) continue;
    inValue += def.value * count;
    inWeight += def.weight * count;
    inEvac += def.value * count * evacWeightMult(def.effect);
  }
  const out = defOf(items, recipe.outputDefId);
  const n = recipe.outputCount;
  const outValue = (out?.value ?? 0) * n;
  const outWeight = (out?.weight ?? 0) * n;
  const outEvac = out ? out.value * n * evacWeightMult(out.effect) : 0;
  const hours = recipe.hours;
  return {
    inValue,
    outValue,
    deltaValue: outValue - inValue,
    inWeight,
    outWeight,
    deltaWeight: outWeight - inWeight,
    inEvac,
    outEvac,
    deltaEvac: outEvac - inEvac,
    hours,
    valuePerHour: hours > 0 ? (outValue - inValue) / hours : null,
  };
}

let lootItemIds: Set<string> | null = null;
let factionItemIds: Set<string> | null = null;

function lootSet(): Set<string> {
  if (!lootItemIds) {
    lootItemIds = new Set();
    for (const rows of Object.values(LOOT_TABLES)) {
      for (const [id] of rows) lootItemIds.add(id);
    }
  }
  return lootItemIds;
}

function factionSet(): Set<string> {
  if (!factionItemIds) {
    factionItemIds = new Set();
    for (const cfg of Object.values(FACTION_CONFIG)) {
      for (const id of cfg.stock) factionItemIds.add(id);
      for (const id of cfg.exclusiveStock) factionItemIds.add(id);
      for (const id of cfg.tribute) factionItemIds.add(id);
    }
  }
  return factionItemIds;
}

export function itemSourceFlags(
  defId: string,
  recipes: RecipesCatalog,
  items: ItemsCatalog,
): ItemSourceFlags {
  const def = defOf(items, defId);
  return {
    loot: lootSet().has(defId),
    craft: recipes.some((r) => r.outputDefId === defId),
    faction: factionSet().has(defId),
    starting: !!def?.startingItem,
  };
}

export function hasAnySource(flags: ItemSourceFlags): boolean {
  return flags.loot || flags.craft || flags.faction || flags.starting;
}

export function recipeWarnings(
  recipe: RecipeRecord,
  recipes: RecipesCatalog,
  items: ItemsCatalog,
): RecipeWarning[] {
  const out: RecipeWarning[] = [];
  const eco = recipeEconomy(recipe, items);

  if (eco.deltaValue > 0) {
    out.push({
      level: 'warn',
      text: `Prints value (+${fmtNum(eco.deltaValue)}). Crafting should sink loot, not mint it.`,
    });
  }
  if (eco.deltaWeight > 0.05) {
    out.push({
      level: 'warn',
      text: `Heavier pack (+${fmtNum(eco.deltaWeight)} kg).`,
    });
  }

  for (const [id, count] of Object.entries(recipe.inputs)) {
    const def = defOf(items, id);
    if (!def) continue;
    const evac = evacWeightMult(def.effect);
    if (evac >= 2.5) {
      out.push({
        level: 'warn',
        text: `Consumes evac cargo: ${count}× ${def.name} (${def.effect.kind}, ×${evac} readiness).`,
      });
    }
    const src = itemSourceFlags(id, recipes, items);
    if (!hasAnySource(src)) {
      out.push({
        level: 'warn',
        text: `${def.name} has no loot / craft / faction / starting source — unobtainable.`,
      });
    }
  }

  const siblings = recipes.filter(
    (r) => r.id !== recipe.id && r.outputDefId === recipe.outputDefId,
  );
  if (siblings.length) {
    out.push({
      level: 'info',
      text: `Same output as ${siblings.map((r) => r.name).join(', ')}.`,
    });
  }

  if (lootSet().has(recipe.outputDefId)) {
    out.push({
      level: 'warn',
      text: 'Output also drops on loot tables — not a pure craft sink.',
    });
  }

  if (recipe.hours > 2) {
    out.push({ level: 'warn', text: `Long sit (${recipe.hours}h).` });
  } else if (recipe.hours < 0.5) {
    out.push({ level: 'info', text: `Very fast craft (${recipe.hours}h).` });
  }

  const usedAsInput = recipes.some(
    (r) => r.id !== recipe.id && r.inputs[recipe.outputDefId] !== undefined,
  );
  if (!usedAsInput) {
    out.push({
      level: 'info',
      text: 'Terminal output — nothing else crafts from this.',
    });
  }

  const extra = RECIPE_EXTRA_NOTES[recipe.id];
  if (extra) out.push({ level: 'info', text: extra });

  return out;
}

export function fmtNum(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function signed(n: number): string {
  const v = fmtNum(n);
  if (n > 0) return `+${v}`;
  return v;
}

/** Fake backpack stacks so `canCraft` can run in the sandbox. */
export function packToInstances(pack: Record<string, number>): ItemInstance[] {
  const out: ItemInstance[] = [];
  let i = 0;
  for (const [defId, stack] of Object.entries(pack)) {
    if (!(stack > 0)) continue;
    out.push({
      uid: `dev-pack-${i}-${defId}`,
      defId,
      container: 'backpack',
      x: 0,
      y: 0,
      rotated: false,
      stack,
    });
    i += 1;
  }
  return out;
}

export function uniqueRecipeId(recipes: RecipesCatalog, base: string): string {
  let stem = base.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
  if (!/^[a-z]/.test(stem)) stem = `r_${stem}`;
  if (!recipes.some((r) => r.id === stem)) return stem;
  let n = 2;
  while (recipes.some((r) => r.id === `${stem}_${n}`)) n += 1;
  return `${stem}_${n}`;
}
