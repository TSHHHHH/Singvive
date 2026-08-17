import type { RecipeRecord, RecipesCatalog } from './validateRecipes';

export type RecipeDiff = {
  added: string[];
  removed: string[];
  changed: { id: string; fields: string[] }[];
  orderChanged: boolean;
};

function changedFields(a: RecipeRecord, b: RecipeRecord): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const fields: string[] = [];
  for (const key of keys) {
    const ka = key as keyof RecipeRecord;
    if (JSON.stringify(a[ka] ?? null) !== JSON.stringify(b[ka] ?? null)) fields.push(key);
  }
  return fields.sort();
}

export function diffRecipes(baseline: RecipesCatalog, next: RecipesCatalog): RecipeDiff {
  const aMap = new Map(baseline.map((r) => [r.id, r]));
  const bMap = new Map(next.map((r) => [r.id, r]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: { id: string; fields: string[] }[] = [];

  for (const id of bMap.keys()) {
    const prev = aMap.get(id);
    if (!prev) added.push(id);
    else {
      const fields = changedFields(prev, bMap.get(id)!);
      if (fields.length) changed.push({ id, fields });
    }
  }
  for (const id of aMap.keys()) {
    if (!bMap.has(id)) removed.push(id);
  }

  const aOrder = baseline.map((r) => r.id).filter((id) => bMap.has(id));
  const bOrder = next.map((r) => r.id).filter((id) => aMap.has(id));
  const orderChanged = aOrder.join('\0') !== bOrder.join('\0');

  added.sort();
  removed.sort();
  changed.sort((x, y) => x.id.localeCompare(y.id));
  return { added, removed, changed, orderChanged };
}

export function recipeDiffEmpty(diff: RecipeDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0 &&
    !diff.orderChanged
  );
}
