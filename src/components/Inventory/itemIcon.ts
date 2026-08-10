import type { ItemDef, ItemEffect } from '../../game/types';
import { EMOJI_FALLBACK, type IconName } from '../../icons/keys';

/**
 * One fallback per effect kind. An item only needs its own `icon` when the
 * generic glyph would be misleading — everything else rides on its category,
 * so a newly added item is never blank.
 */
const EFFECT_ICON: Record<ItemEffect['kind'], IconName> = {
  food: 'item.food',
  water: 'item.water',
  heal: 'item.heal',
  cure: 'item.cure',
  energy: 'item.energy',
  weapon: 'item.weaponMelee', // overridden below for ranged
  ammo: 'item.ammo',
  fuel: 'item.fuel',
  misc: 'item.misc',
};

/** Every `item.*` key the registry knows about. */
const ITEM_KEYS = new Set(Object.keys(EMOJI_FALLBACK).filter((k) => k.startsWith('item.')));

/**
 * The registry key for an item's tile art, most specific first:
 *
 *   1. whatever the def names explicitly,
 *   2. `item.<id>`, if that key exists — so declaring the key and dropping
 *      `src/assets/icons/item-<id>.png` is all it takes to give an item its
 *      own art, with no third place to keep in sync,
 *   3. the effect-kind fallback, so a brand-new item is never blank.
 */
export function itemIcon(def: ItemDef): IconName {
  if (def.icon) return def.icon;
  const own = `item.${def.id}`;
  if (ITEM_KEYS.has(own)) return own as IconName;
  if (def.effect.kind === 'weapon') {
    return def.effect.ranged ? 'item.weaponRanged' : 'item.weaponMelee';
  }
  return EFFECT_ICON[def.effect.kind];
}
