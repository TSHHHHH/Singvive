/** Numeric sort keys for the DEV loot browser — pristine catalog stats, not worn instances. */

import { weaponSpeedFactor } from '../game/combat';
import { packGridUsableCount, resolveItemPackGrid } from '../game/packGrid';
import type { ItemDef } from '../game/types';

export type ItemSortMode =
  | 'id'
  | 'name'
  | 'kind'
  | 'slot'
  | 'value'
  | 'weight'
  | 'valuePerKg'
  | 'footprint'
  | 'scarcity'
  | 'damage'
  | 'accuracy'
  | 'weaponSpeed'
  | 'defense'
  | 'limbArmor'
  | 'attack'
  | 'dodge'
  | 'block'
  | 'heal'
  | 'cure'
  | 'hunger'
  | 'thirst'
  | 'energy'
  | 'ammoRounds'
  | 'magCapacity'
  | 'packCells';

type SortSpec = {
  label: string;
  group: string;
  /** null ⇒ sort to the bottom when descending. */
  value: (item: ItemDef) => number | null;
  /** Lower numbers first (e.g. scarcity = rarer on top). */
  ascending?: boolean;
  format?: (value: number) => string;
};

const META: ItemSortMode[] = ['id', 'name', 'kind', 'slot'];

export function isMetaItemSort(mode: ItemSortMode): boolean {
  return META.includes(mode);
}

const SPECS: Record<ItemSortMode, SortSpec> = {
  id: { label: 'id', group: 'Catalog', value: () => null },
  name: { label: 'name', group: 'Catalog', value: () => null },
  kind: { label: 'kind', group: 'Catalog', value: () => null },
  slot: { label: 'slot', group: 'Catalog', value: () => null },
  value: {
    label: 'value',
    group: 'Economy',
    value: (item) => item.value,
    format: (v) => `$${v}`,
  },
  weight: {
    label: 'weight',
    group: 'Economy',
    value: (item) => item.weight,
    format: (v) => `${v.toFixed(2)} kg`,
  },
  valuePerKg: {
    label: 'value / kg',
    group: 'Economy',
    value: (item) => (item.weight > 0 ? item.value / item.weight : null),
    format: (v) => `$${v.toFixed(1)}/kg`,
  },
  footprint: {
    label: 'grid cells',
    group: 'Economy',
    value: (item) => item.w * item.h,
    format: (v) => `${v} cells`,
  },
  scarcity: {
    label: 'scarcity (rare first)',
    group: 'Economy',
    value: (item) => item.scarcity ?? null,
    ascending: true,
    format: (v) => `scarcity ${v.toFixed(2)}`,
  },
  damage: {
    label: 'weapon damage',
    group: 'Combat',
    value: (item) => (item.effect.kind === 'weapon' ? item.effect.damage : null),
  },
  accuracy: {
    label: 'weapon accuracy',
    group: 'Combat',
    value: (item) => (item.effect.kind === 'weapon' ? item.effect.accuracy : null),
  },
  weaponSpeed: {
    label: 'weapon speed',
    group: 'Combat',
    value: (item) =>
      item.effect.kind === 'weapon'
        ? weaponSpeedFactor(item.effect, !!item.twoHanded)
        : null,
    format: (v) => `×${v.toFixed(2)}`,
  },
  defense: {
    label: 'defense bonus',
    group: 'Combat',
    value: (item) => item.modifiers?.defenseBonus ?? null,
    format: (v) => `+${v} def`,
  },
  limbArmor: {
    label: 'limb armor',
    group: 'Combat',
    value: (item) => item.modifiers?.limbArmor ?? null,
    format: (v) => `soak ${v}`,
  },
  attack: {
    label: 'attack bonus',
    group: 'Combat',
    value: (item) => item.modifiers?.attackBonus ?? null,
    format: (v) => `${v > 0 ? '+' : ''}${v} atk`,
  },
  dodge: {
    label: 'dodge',
    group: 'Combat',
    value: (item) => item.modifiers?.dodgeBonus ?? null,
    format: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}% dodge`,
  },
  block: {
    label: 'block chance',
    group: 'Combat',
    value: (item) => item.modifiers?.blockChance ?? null,
    format: (v) => `${Math.round(v * 100)}% block`,
  },
  heal: {
    label: 'heal HP',
    group: 'Consumables',
    value: (item) => (item.effect.kind === 'heal' ? item.effect.health : null),
    format: (v) => `+${v} HP`,
  },
  cure: {
    label: 'cure infection',
    group: 'Consumables',
    value: (item) => (item.effect.kind === 'cure' ? item.effect.infection : null),
    format: (v) => `−${v} inf`,
  },
  hunger: {
    label: 'hunger restore',
    group: 'Consumables',
    value: (item) => {
      const e = item.effect;
      if (e.kind === 'food') return e.hunger;
      if (e.kind === 'water' || e.kind === 'energy') return e.hunger ?? null;
      return null;
    },
    format: (v) => `+${v} hunger`,
  },
  thirst: {
    label: 'thirst restore',
    group: 'Consumables',
    value: (item) => {
      const e = item.effect;
      if (e.kind === 'water') return e.thirst;
      if (e.kind === 'food' || e.kind === 'energy') return e.thirst ?? null;
      return null;
    },
    format: (v) => `+${v} thirst`,
  },
  energy: {
    label: 'energy restore',
    group: 'Consumables',
    value: (item) => {
      const e = item.effect;
      if (e.kind === 'energy') return e.energy;
      if (e.kind === 'food' || e.kind === 'water') return e.energy ?? null;
      return null;
    },
    format: (v) => `+${v} energy`,
  },
  ammoRounds: {
    label: 'ammo rounds',
    group: 'Ammo',
    value: (item) => (item.effect.kind === 'ammo' ? item.effect.rounds : null),
    format: (v) => `${v} rds`,
  },
  magCapacity: {
    label: 'magazine capacity',
    group: 'Ammo',
    value: (item) => (item.effect.kind === 'magazine' ? item.effect.capacity : null),
    format: (v) => `${v} cap`,
  },
  packCells: {
    label: 'pack cells',
    group: 'Storage',
    value: (item) => {
      if (item.slot !== 'bag') return null;
      const grid = resolveItemPackGrid(item);
      return grid ? packGridUsableCount(grid) : null;
    },
    format: (v) => `${v} cells`,
  },
};

export const ITEM_SORT_GROUPS = [
  'Catalog',
  'Economy',
  'Combat',
  'Consumables',
  'Ammo',
  'Storage',
] as const;

export function itemSortModesForGroup(group: (typeof ITEM_SORT_GROUPS)[number]): ItemSortMode[] {
  return (Object.keys(SPECS) as ItemSortMode[]).filter((mode) => SPECS[mode].group === group);
}

export function itemSortLabel(mode: ItemSortMode): string {
  return SPECS[mode].label;
}

export function formatItemSortMetric(item: ItemDef, mode: ItemSortMode): string | null {
  if (isMetaItemSort(mode)) return null;
  const spec = SPECS[mode];
  const value = spec.value(item);
  if (value === null) return null;
  return spec.format ? spec.format(value) : String(value);
}

export function compareItemsBySort(a: ItemDef, b: ItemDef, mode: ItemSortMode): number {
  if (mode === 'name') return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  if (mode === 'kind') {
    return a.effect.kind.localeCompare(b.effect.kind) || a.id.localeCompare(b.id);
  }
  if (mode === 'slot') {
    return (a.slot ?? '').localeCompare(b.slot ?? '') || a.id.localeCompare(b.id);
  }
  if (mode === 'id') return a.id.localeCompare(b.id);

  const spec = SPECS[mode];
  const av = spec.value(a);
  const bv = spec.value(b);
  if (av === null && bv === null) return a.id.localeCompare(b.id);
  if (av === null) return 1;
  if (bv === null) return -1;
  const diff = spec.ascending ? av - bv : bv - av;
  return diff || a.id.localeCompare(b.id);
}

export type ItemCompareNumericRow = {
  key: ItemSortMode;
  label: string;
  group: (typeof ITEM_SORT_GROUPS)[number];
  value: (item: ItemDef) => number | null;
  format?: (value: number) => string;
  /** When true, lower numbers get longer bars (e.g. scarcity). */
  ascending?: boolean;
};

/** Numeric rows for the compare table (excludes catalog meta sorts). */
export function itemCompareNumericRows(): ItemCompareNumericRow[] {
  return (Object.keys(SPECS) as ItemSortMode[])
    .filter((key) => !isMetaItemSort(key))
    .map((key) => {
      const spec = SPECS[key];
      return {
        key,
        label: spec.label,
        group: spec.group as ItemCompareNumericRow['group'],
        value: spec.value,
        format: spec.format,
        ascending: spec.ascending,
      };
    });
}

export type ItemCompareTextRow = {
  key: string;
  label: string;
  group: string;
  value: (item: ItemDef) => string | null;
};

export function itemCompareTextRows(): ItemCompareTextRow[] {
  return [
    {
      key: 'kind',
      label: 'effect kind',
      group: 'Catalog',
      value: (item) => item.effect.kind,
    },
    {
      key: 'slot',
      label: 'slot',
      group: 'Catalog',
      value: (item) => item.slot ?? null,
    },
    {
      key: 'caliber',
      label: 'caliber',
      group: 'Ammo',
      value: (item) => {
        const e = item.effect;
        if (e.kind === 'weapon' || e.kind === 'ammo' || e.kind === 'magazine') {
          return e.caliber ?? null;
        }
        return null;
      },
    },
    {
      key: 'exotic',
      label: 'exotic',
      group: 'Catalog',
      value: (item) => (item.exotic ? 'yes' : null),
    },
    {
      key: 'twoHanded',
      label: 'two-handed',
      group: 'Combat',
      value: (item) => (item.twoHanded ? 'yes' : null),
    },
    {
      key: 'usesMagazine',
      label: 'uses magazine',
      group: 'Ammo',
      value: (item) =>
        item.effect.kind === 'weapon' && item.effect.usesMagazine ? 'yes' : null,
    },
    {
      key: 'starting',
      label: 'starting',
      group: 'Catalog',
      value: (item) =>
        item.startingItem
          ? `yes${item.startingCount ? ` ×${item.startingCount}` : ''}`
          : null,
    },
  ];
}
