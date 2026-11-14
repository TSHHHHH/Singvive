import type { ItemInstance } from '../game/types';
import { itemDef } from '../game/loot';
import { isBroken } from '../game/inventory';
import { itemName } from '../i18n/display';
import { t } from '../i18n/t';
import type { LocaleId } from '../i18n/types';

/** Display the held weapon in the same modes used by playerCombatStats. */
export function combatWeaponLabel(mainHand: ItemInstance | null | undefined, locale: LocaleId): string {
  if (!mainHand) return t('ui.combat.fists', undefined, locale);
  const weapon = itemName(mainHand.defId, locale);
  if (isBroken(mainHand)) return t('ui.combat.brokenWeapon', { weapon }, locale);
  const effect = itemDef(mainHand.defId).effect;
  if (effect.kind !== 'weapon') return t('ui.combat.fists', undefined, locale);
  return effect.ranged ? t('ui.combat.bashing', { weapon }, locale) : weapon;
}
