/** Shared loot-table validation for the DEV API and browser UI. */

export type LootTableEntry = [itemId: string, weight: number];

/** Keep in sync with `PoiCategory` in src/game/types.ts */
export const LOOT_TABLE_CATEGORIES = [
  'supermarket',
  'convenience',
  'pharmacy',
  'hospital',
  'clinic',
  'hardware',
  'fuel',
  'police',
  'residential',
  'foodcourt',
  'mrt',
  'industrial',
  'school',
  'waypoint',
] as const;

export type LootTableCategory = (typeof LOOT_TABLE_CATEGORIES)[number];
export type LootTablesCatalog = Record<LootTableCategory, LootTableEntry[]>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate loot tables. Pass known item ids when available so unknown refs
 * are caught before write.
 */
export function validateLootTablesCatalog(
  catalog: unknown,
  knownItemIds?: ReadonlySet<string>,
): string[] {
  if (!isRecord(catalog)) {
    return ['Loot tables must be a JSON object keyed by POI category'];
  }
  const errors: string[] = [];

  for (const category of LOOT_TABLE_CATEGORIES) {
    if (!(category in catalog)) {
      errors.push(`Missing category "${category}"`);
      continue;
    }
    const rows = catalog[category];
    if (!Array.isArray(rows) || rows.length === 0) {
      errors.push(`${category}: table must be a non-empty array`);
      continue;
    }
    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length !== 2) {
        errors.push(`${category}[${i}]: entry must be [itemId, weight]`);
        continue;
      }
      const [id, weight] = row;
      if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)) {
        errors.push(`${category}[${i}]: invalid item id`);
      } else {
        if (seen.has(id)) errors.push(`${category}: duplicate item "${id}"`);
        seen.add(id);
        if (knownItemIds && !knownItemIds.has(id)) {
          errors.push(`${category}: unknown item "${id}"`);
        }
      }
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
        errors.push(`${category}/${String(id)}: weight must be a number > 0`);
      }
    }
  }

  for (const key of Object.keys(catalog)) {
    if (!(LOOT_TABLE_CATEGORIES as readonly string[]).includes(key)) {
      errors.push(`Unknown category "${key}"`);
    }
  }

  return errors;
}

export function lootTablesFingerprint(catalog: LootTablesCatalog): string {
  return JSON.stringify(catalog);
}
