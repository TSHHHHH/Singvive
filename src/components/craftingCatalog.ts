import {
  canCraft, countOf, RECIPES, waterCarried, recipeInputs, craftSetup, DEFAULT_CRAFT_CONTEXT, WATER_INPUT_IDS,
  type Recipe, type RecipeAvailability, type CraftContext,
} from '../game/crafting';
import { adjustCraftInputs } from '../game/character';
import { itemDef } from '../game/loot';
import type { ItemDef, ItemInstance } from '../game/types';
import { itemName, recipeName, type LocaleId } from '../i18n';

export const CRAFT_CATEGORIES = ['all', 'provisions', 'medical', 'weapons', 'equipment', 'tools', 'facilities'] as const;
export type CraftCategory = (typeof CRAFT_CATEGORIES)[number];
export type CraftFilter = 'all' | 'ready' | 'almost';
export type CraftSort = 'ready' | 'time' | 'name';

export interface CraftIngredient {
  defId: string;
  need: number;
  have: number;
  water?: boolean;
}

export interface CraftRecipeRow {
  recipe: Recipe;
  check: RecipeAvailability;
  category: CraftCategory;
  ingredients: CraftIngredient[];
  toolHave: number;
  setupReady: boolean;
  missingKinds: number;
  missingUnits: number;
  waterId: string | null;
  context: CraftContext;
}

function outputCategory(def: ItemDef): CraftCategory {
  if (['food', 'water', 'energy'].includes(def.effect.kind)) return 'provisions';
  if (['heal', 'cure'].includes(def.effect.kind)) return 'medical';
  if (['weapon', 'ammo', 'magazine'].includes(def.effect.kind)) return 'weapons';
  if (def.slot || def.sleepGear) return 'equipment';
  return 'tools';
}

/** Presentation model only; availability and costs still come from the game. */
export function craftingRows(items: ItemInstance[], atShelter: boolean, craftCost: number, context: CraftContext = DEFAULT_CRAFT_CONTEXT): CraftRecipeRow[] {
  return RECIPES.map((recipe) => {
    const adjusted = recipe.fixedInputs ? recipe.inputs : adjustCraftInputs(recipe.inputs, craftCost);
    const inputs = recipeInputs(recipe, items, adjusted, context);
    const fromSite = !!recipe.waterInput && context.waterSource === 'site' && recipe.preparation !== 'boil';
    const waterId = fromSite ? 'hot_water' : recipe.waterInput ? (['dirty_water', 'water_bottle', 'newater', 'large_water_bottle'].find(id => (inputs[id] ?? 0) > (adjusted[id] ?? 0)) ?? null) : null;
    const ingredients: CraftIngredient[] = Object.entries(inputs)
      .filter(([id]) => !recipe.waterInput || fromSite || !(WATER_INPUT_IDS as readonly string[]).includes(id))
      .filter(([, need]) => need > 0)
      .map(([defId, need]) => ({ defId, need, have: countOf(items, defId) }));
    if (fromSite) ingredients.push({ defId: 'hot_water', need: recipe.waterInput!, have: context.site?.water?.amount ?? 0 });
    if (recipe.waterInput && !fromSite) {
      ingredients.push({
        defId: waterId ?? 'water_bottle', need: recipe.waterInput,
        have: waterCarried(items), water: true,
      });
    }
    const toolHave = recipe.tool ? countOf(items, recipe.tool) : 0;
    const missing = ingredients.filter((input) => input.have < input.need || (input.water && !waterId));
    return {
      recipe, ingredients, waterId, toolHave, context,
      check: canCraft(recipe, items, atShelter, inputs, context),
      category: recipe.facility ? 'facilities' : outputCategory(itemDef(recipe.outputDefId)),
      setupReady: craftSetup(recipe, items, context).ok && (!recipe.needsShelter || atShelter) && (!recipe.tool || toolHave > 0),
      missingKinds: missing.length,
      missingUnits: missing.reduce((sum, input) => sum + Math.max(1, input.need - input.have), 0),
    };
  });
}

export function matchesCraftFilter(row: CraftRecipeRow, filter: CraftFilter): boolean {
  if (filter === 'ready') return row.check.ok;
  if (filter === 'almost') return !row.check.ok && row.setupReady && row.missingKinds === 1;
  return true;
}

export function browseCraftingRows(
  rows: CraftRecipeRow[],
  options: { query: string; category: CraftCategory; filter: CraftFilter; sort: CraftSort; locale: LocaleId },
): CraftRecipeRow[] {
  const { query, category, filter, sort, locale } = options;
  const words = query.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
  const visible = rows.filter((row) => {
    if (category !== 'all' && row.category !== category) return false;
    if (!matchesCraftFilter(row, filter)) return false;
    const names = [
      recipeName(row.recipe.id, locale), itemName(row.recipe.outputDefId, locale),
      ...Object.keys(row.recipe.inputs).map((id) => itemName(id, locale)),
      ...(row.recipe.waterInput ? [itemName('water_bottle', locale), itemName('dirty_water', locale)] : []),
      ...(row.recipe.tool ? [itemName(row.recipe.tool, locale)] : []),
    ].join(' ').toLocaleLowerCase(locale);
    return words.every((word) => names.includes(word));
  });
  return visible.sort((a, b) => {
    const byName = itemName(a.recipe.outputDefId, locale).localeCompare(itemName(b.recipe.outputDefId, locale), locale);
    if (sort === 'name') return byName;
    if (sort === 'time') return a.recipe.hours - b.recipe.hours || byName;
    return Number(b.check.ok) - Number(a.check.ok)
      || Number(b.setupReady) - Number(a.setupReady)
      || a.missingKinds - b.missingKinds
      || a.missingUnits - b.missingUnits
      || a.recipe.hours - b.recipe.hours
      || byName;
  });
}
