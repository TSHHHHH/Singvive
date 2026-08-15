import type { ItemDef } from '../game/types';
import type { ItemsCatalog } from './lootApi';

export type CatalogDiff = {
  added: string[];
  removed: string[];
  changed: { id: string; fields: string[] }[];
};

function changedFields(a: ItemDef, b: ItemDef): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const fields: string[] = [];
  for (const key of keys) {
    const ka = key as keyof ItemDef;
    if (JSON.stringify(a[ka]) !== JSON.stringify(b[ka])) fields.push(key);
  }
  return fields.sort();
}

export function diffCatalogs(baseline: ItemsCatalog, next: ItemsCatalog): CatalogDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: { id: string; fields: string[] }[] = [];

  for (const id of Object.keys(next)) {
    if (!baseline[id]) added.push(id);
    else {
      const fields = changedFields(baseline[id], next[id]);
      if (fields.length) changed.push({ id, fields });
    }
  }
  for (const id of Object.keys(baseline)) {
    if (!next[id]) removed.push(id);
  }

  added.sort();
  removed.sort();
  changed.sort((a, b) => a.id.localeCompare(b.id));
  return { added, removed, changed };
}

export function diffIsEmpty(diff: CatalogDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}

export function itemFingerprint(def: ItemDef | undefined): string {
  return JSON.stringify(def ?? null);
}
