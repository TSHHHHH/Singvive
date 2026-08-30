/** Quick-add presets for the loot compare panel. */

import type { ItemDef } from '../game/types';
import type { ItemsCatalog } from './lootApi';
import { EFFECT_KINDS, EQUIP_SLOTS } from './validateItems';

export type QuickCompareCategory = {
  id: string;
  label: string;
  ids: string[];
};

export function buildQuickCompareCategories(
  catalog: ItemsCatalog,
  filteredIds: readonly string[],
): QuickCompareCategory[] {
  const out: QuickCompareCategory[] = [];

  if (filteredIds.length > 0) {
    out.push({
      id: '__filtered__',
      label: `Shown in list (${filteredIds.length})`,
      ids: [...filteredIds],
    });
  }

  for (const kind of [...EFFECT_KINDS].sort()) {
    const ids = Object.keys(catalog)
      .filter((id) => catalog[id]?.effect.kind === kind)
      .sort();
    if (ids.length === 0) continue;
    out.push({
      id: `kind:${kind}`,
      label: `${kind} (${ids.length})`,
      ids,
    });
  }

  for (const slot of [...EQUIP_SLOTS].sort()) {
    const ids = Object.keys(catalog)
      .filter((id) => catalog[id]?.slot === slot)
      .sort();
    if (ids.length === 0) continue;
    out.push({
      id: `slot:${slot}`,
      label: `${slot} (${ids.length})`,
      ids,
    });
  }

  const noSlot = Object.keys(catalog)
    .filter((id) => !catalog[id]?.slot)
    .sort();
  if (noSlot.length > 0) {
    out.push({
      id: 'slot:none',
      label: `no slot (${noSlot.length})`,
      ids: noSlot,
    });
  }

  return out;
}

export function mergeCompareIds(current: readonly string[], add: readonly string[]): string[] {
  const seen = new Set(current);
  const next = [...current];
  for (const id of add) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

export function compareItemsFromCatalog(
  catalog: ItemsCatalog,
  compareIds: readonly string[],
): ItemDef[] {
  return compareIds.flatMap((id) => {
    const def = catalog[id];
    return def ? [def] : [];
  });
}
