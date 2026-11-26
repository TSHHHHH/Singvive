import {
  canCraft, countOf, RECIPES, waterCarried, recipeInputs, craftSetup, DEFAULT_CRAFT_CONTEXT, WATER_INPUT_IDS,
  type Recipe, type RecipeAvailability, type CraftContext,
} from '../game/crafting';
import { adjustCraftInputs } from '../game/character';
import { itemDef } from '../game/loot';
import type { ItemDef, ItemInstance } from '../game/types';
import { itemName, recipeName, type LocaleId } from '../i18n';

export const CRAFT_CATEGORIES = ['all', 'food', 'drinks', 'medical', 'weapons', 'equipment', 'materials', 'tools', 'facilities'] as const;
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
  /** Only for limited-use actions (cutting up your clothes): how many uses remain. */
  usesLeft?: number;
}

/** Things other recipes consume (portions, tinder, parts, rags) read as materials. */
const RECIPE_INPUT_IDS = new Set(RECIPES.flatMap((recipe) => Object.keys(recipe.inputs)));

function outputCategory(def: ItemDef): CraftCategory {
  if (def.effect.kind === 'food') return 'food';
  if (['water', 'energy'].includes(def.effect.kind)) return 'drinks';
  if (['heal', 'cure'].includes(def.effect.kind)) return 'medical';
  if (['weapon', 'ammo', 'magazine'].includes(def.effect.kind)) return 'weapons';
  if (def.slot || def.sleepGear) return 'equipment';
  if (RECIPE_INPUT_IDS.has(def.id)) return 'materials';
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
      setupReady: craftSetup(recipe, items, context).ok && (!recipe.tool || toolHave > 0),
      missingKinds: missing.length,
      missingUnits: missing.reduce((sum, input) => sum + Math.max(1, input.need - input.have), 0),
    };
  });
}

/**
 * Cutting up the clothes you wear isn't a catalog recipe (it spends clothing
 * condition, not items, through `tearOwnClothes`), but it reads as one: a
 * strip that groups with the towel recipe under Cloth Rags.
 */
export const TEAR_RECIPE_ID = 'tear_clothes';
export function tearRow(usesLeft: number, hours: number, yieldCount: number, context: CraftContext = DEFAULT_CRAFT_CONTEXT, garment = false): CraftRecipeRow {
  const ok = usesLeft > 0;
  return {
    recipe: {
      id: TEAR_RECIPE_ID, name: 'Cut Up Your Clothes', inputs: {}, outputDefId: 'cloth_rags', outputCount: yieldCount,
      hours, needsShelter: false, blurb: 'Cut strips from what you are wearing. Costs nothing but the clothes.',
    },
    check: ok ? { ok: true, reason: '' } : { ok: false, reason: 'Nothing left to cut', block: { kind: garment ? 'tearsWorn' : 'tears' } },
    category: outputCategory(itemDef('cloth_rags')),
    ingredients: [], toolHave: 0, setupReady: ok, missingKinds: ok ? 0 : 1, missingUnits: ok ? 0 : 1,
    waterId: null, context, usesLeft,
  };
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
  return visible.sort(craftRowComparator(sort, locale));
}

export function craftRowComparator(sort: CraftSort, locale: LocaleId) {
  return (a: CraftRecipeRow, b: CraftRecipeRow): number => {
    const byName = itemName(a.recipe.outputDefId, locale).localeCompare(itemName(b.recipe.outputDefId, locale), locale);
    if (sort === 'name') return byName;
    if (sort === 'time') return a.recipe.hours - b.recipe.hours || byName;
    return Number(b.check.ok) - Number(a.check.ok)
      || Number(b.setupReady) - Number(a.setupReady)
      || a.missingKinds - b.missingKinds
      || a.missingUnits - b.missingUnits
      || a.recipe.hours - b.recipe.hours
      || byName;
  };
}

// ---------- Variant groups ----------

/**
 * One list row per thing you make. Explicit families (kopi, teh, milo …) and
 * recipes that share an output (four ways to make tinder) collapse into one
 * entry whose variants are picked from a dropdown. Recipe ids are untouched:
 * the pick is UI state only, so crafting, balance and saves don't change.
 */
export interface CraftEntry {
  key: string;
  family?: Recipe['family'];
  variants: CraftRecipeRow[];
}

export function variantKey(recipe: Recipe): string {
  return recipe.family ? `family:${recipe.family}` : `out:${recipe.outputDefId}`;
}

/** Groups rows in catalog order (first appearance wins). */
export function groupCraftRows(rows: CraftRecipeRow[]): CraftEntry[] {
  const byKey = new Map<string, CraftEntry>();
  for (const row of rows) {
    const key = variantKey(row.recipe);
    const entry = byKey.get(key);
    if (entry) entry.variants.push(row);
    else byKey.set(key, { key, family: row.recipe.family, variants: [row] });
  }
  return [...byKey.values()];
}

/**
 * The variant a row shows: the player's last pick if it still qualifies,
 * otherwise the best one available (ready first, then closest to ready).
 */
export function pickVariant(variants: CraftRecipeRow[], chosenId?: string, locale: LocaleId = 'en'): CraftRecipeRow {
  const chosen = chosenId ? variants.find((row) => row.recipe.id === chosenId) : undefined;
  return chosen ?? [...variants].sort(craftRowComparator('ready', locale))[0];
}

export interface CraftEntryView {
  entry: CraftEntry;
  /** The variant shown on the strip and crafted by its button. */
  row: CraftRecipeRow;
  /** Variants that pass the current filter/search (all of them when unfiltered). */
  matching: CraftRecipeRow[];
  /** True when any variant can be crafted now, whichever one is picked. */
  anyReady: boolean;
}

export interface CraftBrowseExtras {
  /**
   * The open strip. Its pick is shown even when that variant fails the
   * filter or search, and it stays listed when crafting or a prep change
   * takes it out of the availability filter, so it never vanishes in use.
   */
  expanded?: string | null;
  /** The name the strip shows (a family label for families), for the name sort. */
  entryName?: (entry: CraftEntry) => string;
}

/**
 * Same filters as `browseCraftingRows`, applied per entry: an entry shows when
 * any variant matches. The entry ranks by its best matching variant, never by
 * the picked one, so changing the variant dropdown never moves the strip.
 */
export function browseCraftEntries(
  entries: CraftEntry[],
  options: { query: string; category: CraftCategory; filter: CraftFilter; sort: CraftSort; locale: LocaleId },
  chosen: Record<string, string> = {},
  extras: CraftBrowseExtras = {},
): CraftEntryView[] {
  const ranked: { view: CraftEntryView; rank: CraftRecipeRow; name: string | null }[] = [];
  for (const entry of entries) {
    const open = entry.key === extras.expanded;
    let matching = browseCraftingRows(entry.variants, options);
    if (matching.length === 0 && open) matching = browseCraftingRows(entry.variants, { ...options, filter: 'all' });
    if (matching.length === 0) continue;
    const pick = chosen[entry.key];
    // Keep the player's pick while it still matches (a collapsed "Ready" strip never shows an unready
    // variant); the open strip always shows what the player just picked.
    const row = (open ? entry.variants : matching).find((r) => r.recipe.id === pick)
      ?? pickVariant(matching, undefined, options.locale);
    ranked.push({
      view: { entry, row, matching, anyReady: entry.variants.some((v) => v.check.ok) },
      rank: matching[0],
      name: extras.entryName ? extras.entryName(entry) : null,
    });
  }
  const compare = craftRowComparator(options.sort, options.locale);
  return ranked.sort((a, b) => {
    if (options.sort === 'name' && a.name !== null && b.name !== null) {
      return a.name.localeCompare(b.name, options.locale) || compare(a.rank, b.rank);
    }
    return compare(a.rank, b.rank);
  }).map((r) => r.view);
}
