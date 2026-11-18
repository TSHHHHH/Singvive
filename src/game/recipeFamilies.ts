/**
 * Variant families: one row in the crafting list, with a dropdown in its
 * details. Purely presentational — every variant keeps its own recipe id,
 * inputs and output, so balance and saves are untouched. Standalone so the
 * DEV recipe validator can import it without pulling in the item catalog.
 */
export const RECIPE_FAMILIES = ['kopi', 'teh', 'milo', 'mee', 'porridge'] as const;
export type RecipeFamily = (typeof RECIPE_FAMILIES)[number];
