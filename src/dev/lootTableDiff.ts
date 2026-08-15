import type { LootTablesCatalog } from './validateLootTables';
import { LOOT_TABLE_CATEGORIES } from './validateLootTables';

export type LootTableDiff = {
  categoriesChanged: string[];
  details: {
    category: string;
    added: string[];
    removed: string[];
    weightChanges: { id: string; from: number; to: number }[];
  }[];
};

export function diffLootTables(
  baseline: LootTablesCatalog,
  next: LootTablesCatalog,
): LootTableDiff {
  const details: LootTableDiff['details'] = [];

  for (const category of LOOT_TABLE_CATEGORIES) {
    const a = new Map(baseline[category] ?? []);
    const b = new Map(next[category] ?? []);
    const added: string[] = [];
    const removed: string[] = [];
    const weightChanges: { id: string; from: number; to: number }[] = [];

    for (const [id, w] of b) {
      if (!a.has(id)) added.push(id);
      else if (a.get(id) !== w) weightChanges.push({ id, from: a.get(id)!, to: w });
    }
    for (const id of a.keys()) {
      if (!b.has(id)) removed.push(id);
    }

    if (added.length || removed.length || weightChanges.length) {
      details.push({
        category,
        added: added.sort(),
        removed: removed.sort(),
        weightChanges: weightChanges.sort((x, y) => x.id.localeCompare(y.id)),
      });
    }
  }

  return {
    categoriesChanged: details.map((d) => d.category),
    details,
  };
}

export function lootTableDiffEmpty(diff: LootTableDiff): boolean {
  return diff.details.length === 0;
}
