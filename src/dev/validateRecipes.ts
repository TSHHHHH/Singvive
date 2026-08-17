/** Shared recipe-catalog validation for the DEV API and browser UI. */

export type RecipeRecord = {
  id: string;
  name: string;
  inputs: Record<string, number>;
  outputDefId: string;
  outputCount: number;
  hours: number;
  needsShelter: boolean;
  tool?: string;
  blurb: string;
};

export type RecipesCatalog = RecipeRecord[];

const RECIPE_ID_RE = /^[a-z][a-z0-9_]*$/;
const ALLOWED_KEYS = new Set([
  'id',
  'name',
  'inputs',
  'outputDefId',
  'outputCount',
  'hours',
  'needsShelter',
  'tool',
  'blurb',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function isPositiveInt(v: unknown): v is number {
  return isPositiveNumber(v) && Number.isInteger(v);
}

/**
 * Validate recipes. Pass known item ids when available so unknown refs
 * are caught before write.
 */
export function validateRecipesCatalog(
  catalog: unknown,
  knownItemIds?: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(catalog)) {
    return ['Recipes must be a JSON array'];
  }

  const errors: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < catalog.length; i++) {
    const row = catalog[i];
    const prefix = `recipes[${i}]`;
    if (!isRecord(row)) {
      errors.push(`${prefix}: must be an object`);
      continue;
    }

    for (const key of Object.keys(row)) {
      if (!ALLOWED_KEYS.has(key)) errors.push(`${prefix}: unknown field "${key}"`);
    }

    const id = row.id;
    if (typeof id !== 'string' || !RECIPE_ID_RE.test(id)) {
      errors.push(`${prefix}: id must match ${RECIPE_ID_RE}`);
    } else {
      if (seen.has(id)) errors.push(`duplicate recipe id "${id}"`);
      seen.add(id);
    }

    const label = typeof id === 'string' && id ? id : prefix;

    if (typeof row.name !== 'string' || row.name.trim() === '') {
      errors.push(`${label}: name is required`);
    }
    if (typeof row.blurb !== 'string' || row.blurb.trim() === '') {
      errors.push(`${label}: blurb is required`);
    }
    if (typeof row.needsShelter !== 'boolean') {
      errors.push(`${label}: needsShelter must be a boolean`);
    }
    if (!isPositiveNumber(row.hours)) {
      errors.push(`${label}: hours must be a number > 0`);
    }
    if (!isPositiveInt(row.outputCount)) {
      errors.push(`${label}: outputCount must be an integer > 0`);
    }

    const outputDefId = row.outputDefId;
    if (typeof outputDefId !== 'string' || !RECIPE_ID_RE.test(outputDefId)) {
      errors.push(`${label}: outputDefId is invalid`);
    } else if (knownItemIds && !knownItemIds.has(outputDefId)) {
      errors.push(`${label}: unknown output "${outputDefId}"`);
    }

    if (row.tool !== undefined) {
      if (typeof row.tool !== 'string' || !RECIPE_ID_RE.test(row.tool)) {
        errors.push(`${label}: tool must be an item id`);
      } else if (knownItemIds && !knownItemIds.has(row.tool)) {
        errors.push(`${label}: unknown tool "${row.tool}"`);
      }
    }

    if (!isRecord(row.inputs)) {
      errors.push(`${label}: inputs must be an object of itemId → count`);
    } else {
      const inputIds = Object.keys(row.inputs);
      if (inputIds.length === 0) {
        errors.push(`${label}: needs at least one input`);
      }
      const inputSeen = new Set<string>();
      for (const [defId, count] of Object.entries(row.inputs)) {
        if (!RECIPE_ID_RE.test(defId)) {
          errors.push(`${label}: invalid input id "${defId}"`);
          continue;
        }
        if (inputSeen.has(defId)) errors.push(`${label}: duplicate input "${defId}"`);
        inputSeen.add(defId);
        if (knownItemIds && !knownItemIds.has(defId)) {
          errors.push(`${label}: unknown input "${defId}"`);
        }
        if (!isPositiveInt(count)) {
          errors.push(`${label}: input ${defId} count must be an integer > 0`);
        }
        if (typeof outputDefId === 'string' && defId === outputDefId) {
          errors.push(`${label}: cannot consume its own output`);
        }
        if (typeof row.tool === 'string' && defId === row.tool) {
          errors.push(`${label}: tool "${defId}" cannot also be an input`);
        }
      }
    }
  }

  return errors;
}

export function recipesFingerprint(catalog: RecipesCatalog): string {
  return JSON.stringify(catalog);
}

/** Drop empty optional fields so round-trips stay tidy. */
export function normalizeRecipe(recipe: RecipeRecord): RecipeRecord {
  const next: RecipeRecord = {
    id: recipe.id,
    name: recipe.name,
    inputs: { ...recipe.inputs },
    outputDefId: recipe.outputDefId,
    outputCount: recipe.outputCount,
    hours: recipe.hours,
    needsShelter: recipe.needsShelter,
    blurb: recipe.blurb,
  };
  if (recipe.tool) next.tool = recipe.tool;
  return next;
}

export function normalizeRecipesCatalog(catalog: RecipesCatalog): RecipesCatalog {
  return catalog.map(normalizeRecipe);
}
