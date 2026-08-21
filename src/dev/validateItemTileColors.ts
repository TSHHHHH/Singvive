/** Validation for the DEV tile-color map (`itemTileColors.json`). */

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

/** Keep in sync with `DEFAULT_ITEM_TILE_COLORS` in `src/game/itemTileColor.ts`. */
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateItemTileColors(raw: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    errors.push('tile colors must be an object');
    return errors;
  }
  for (const key of TILE_COLOR_KEYS) {
    const v = raw[key];
    if (typeof v !== 'string' || !HEX_RE.test(v)) {
      errors.push(`${key}: must be a #rrggbb hex color`);
    }
  }
  for (const key of Object.keys(raw)) {
    if (!(TILE_COLOR_KEYS as readonly string[]).includes(key)) {
      errors.push(`unknown key "${key}"`);
    }
  }
  return errors;
}

/** Coerce a partial/unknown object into a full map (defaults for missing keys). */
export function normalizeItemTileColors(raw: unknown): ItemTileColors {
  const out: ItemTileColors = { ...DEFAULT_ITEM_TILE_COLORS };
  if (!isRecord(raw)) return out;
  for (const key of TILE_COLOR_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && HEX_RE.test(v)) {
      out[key] = v.toLowerCase();
    }
  }
  return out;
}

export function itemTileColorsFingerprint(colors: ItemTileColors): string {
  return JSON.stringify(colors);
}
