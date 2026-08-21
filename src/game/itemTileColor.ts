/**
 * Category → inventory tile tint. Edited via the DEV loot browser
 * (Tile colors tab); committed as `data/itemTileColors.json`.
 *
 * Per-item `ItemDef.color` is legacy and unused for gameplay tiles.
 */

import type { ItemDef } from './types';
import itemTileColorsCatalog from './data/itemTileColors.json' with { type: 'json' };

export const TILE_COLOR_KEYS = [
  'food',
  'water',
  'heal',
  'cure',
  'energy',
  'ammo',
  'fuel',
  'weapon',
  'gear',
  'misc',
] as const;

export type TileColorKey = (typeof TILE_COLOR_KEYS)[number];

export type ItemTileColors = Record<TileColorKey, string>;

export const DEFAULT_ITEM_TILE_COLORS: ItemTileColors = {
  food: '#b5651d',
  water: '#2f7fb5',
  heal: '#7fbf6b',
  cure: '#8fcf7b',
  energy: '#c9a441',
  ammo: '#a8935f',
  fuel: '#b5432a',
  weapon: '#8a8f94',
  gear: '#6a7080',
  misc: '#7f8c8d',
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeMap(raw: unknown): ItemTileColors {
  const out: ItemTileColors = { ...DEFAULT_ITEM_TILE_COLORS };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const rec = raw as Record<string, unknown>;
  for (const key of TILE_COLOR_KEYS) {
    const v = rec[key];
    if (typeof v === 'string' && HEX_RE.test(v)) out[key] = v.toLowerCase();
  }
  return out;
}

/** Live map from the committed JSON (normalized). */
export const ITEM_TILE_COLORS: ItemTileColors = normalizeMap(itemTileColorsCatalog);

/**
 * Category used for the tile tint.
 * Slotted non-weapons (armour, bags, …) share `gear` so gear scans as one family.
 */
export function tileColorCategory(
  def: Pick<ItemDef, 'effect' | 'slot'>,
): TileColorKey {
  if (def.slot && def.effect.kind !== 'weapon') return 'gear';
  const kind = def.effect.kind;
  if ((TILE_COLOR_KEYS as readonly string[]).includes(kind)) {
    return kind as TileColorKey;
  }
  return 'misc';
}

export function tileColor(
  def: Pick<ItemDef, 'effect' | 'slot'>,
  colors: ItemTileColors = ITEM_TILE_COLORS,
): string {
  return colors[tileColorCategory(def)] ?? colors.misc;
}

/**
 * Wear bar / wash fill. Same thresholds as the inventory grid:
 * broken or &lt;25 red, &lt;50 amber, else green.
 */
export function conditionBarColor(condition: number, broken = false): string {
  if (broken || condition < 25) return '#e0342b';
  if (condition < 50) return '#e0a02b';
  return '#8fbf4b';
}

export const TILE_COLOR_LABELS: Record<TileColorKey, string> = {
  food: 'Food',
  water: 'Water',
  heal: 'Heal',
  cure: 'Cure',
  energy: 'Energy',
  ammo: 'Ammo',
  fuel: 'Fuel',
  weapon: 'Weapon',
  gear: 'Gear (equipped non-weapon)',
  misc: 'Misc',
};
