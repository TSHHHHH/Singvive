import type { ItemDef } from '../../game/types';

/** A small glyph per item for the inventory tile. */
export function itemGlyph(def: ItemDef): string {
  switch (def.effect.kind) {
    case 'food':
      return '🥫';
    case 'water':
      return '💧';
    case 'heal':
      return '➕';
    case 'cure':
      return '💊';
    case 'energy':
      return '⚡';
    case 'weapon':
      return def.effect.ranged ? '🔫' : '🔪';
    case 'fuel':
      return '⛽';
    default:
      return '📦';
  }
}
