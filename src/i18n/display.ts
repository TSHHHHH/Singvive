import { ITEMS, DESTRUCTION_LABELS } from '../game/loot';
import { getTrait } from '../game/character';
import { RECIPES } from '../game/crafting';
import { POI_CONFIG } from '../game/poi';
import {
  STANDING_BAD,
  STANDING_HATED,
  STANDING_KIN,
  STANDING_KNOWN,
  STANDING_TRUSTED,
  standingLabel as standingLabelEn,
} from '../game/factions';
import type { DestructionTier, PoiCategory } from '../game/types';
import { t, type TVars } from './t';
import type { LocaleId } from './types';
import { DEFAULT_LOCALE } from './types';

/** Resolve a catalog key, or fall back when missing / empty. */
export function msgOr(
  key: string,
  fallback: string,
  vars?: TVars,
  locale: LocaleId = DEFAULT_LOCALE,
): string {
  const translated = t(key, vars, locale);
  if (translated !== key && translated.length > 0) return translated;
  return fallback;
}

const STANDING_KEYS = [
  'terrible',
  'bad',
  'wary',
  'stranger',
  'known',
  'welcome',
  'kin',
] as const;

export function standingKey(n: number): (typeof STANDING_KEYS)[number] {
  if (n <= STANDING_HATED) return 'terrible';
  if (n <= STANDING_BAD) return 'bad';
  if (n < 0) return 'wary';
  if (n < STANDING_KNOWN) return 'stranger';
  if (n < STANDING_TRUSTED) return 'known';
  if (n < STANDING_KIN) return 'welcome';
  return 'kin';
}

/** Standing badge label — catalog first, else English from factions.ts. */
export function standingDisplayLabel(
  n: number,
  locale: LocaleId = DEFAULT_LOCALE,
): string {
  return msgOr(`ui.standing.${standingKey(n)}`, standingLabelEn(n), undefined, locale);
}

const DESTRUCTION_KEYS: Record<DestructionTier, string> = {
  0: 'intact',
  1: 'damaged',
  2: 'ravaged',
  3: 'gutted',
};

export function destructionDisplayLabel(
  tier: DestructionTier,
  locale: LocaleId = DEFAULT_LOCALE,
): string {
  return msgOr(
    `ui.destruction.${DESTRUCTION_KEYS[tier]}`,
    DESTRUCTION_LABELS[tier],
    undefined,
    locale,
  );
}

/** POI category label — `ui.poi.{category}`, else POI_CONFIG English. */
export function poiCategoryLabel(
  category: PoiCategory,
  locale: LocaleId = DEFAULT_LOCALE,
): string {
  return msgOr(`ui.poi.${category}`, POI_CONFIG[category].label, undefined, locale);
}

/** Display name for an item id — locale overlay, else items.json English. */
export function itemName(id: string, locale: LocaleId = DEFAULT_LOCALE): string {
  const translated = t(`item.${id}`, undefined, locale);
  if (translated !== `item.${id}`) return translated;
  return ITEMS[id]?.name ?? id;
}

export function enemyName(
  templateId: string | undefined,
  fallbackName: string,
  locale: LocaleId = DEFAULT_LOCALE,
): string {
  if (!templateId) return fallbackName;
  const translated = t(`enemy.${templateId}`, undefined, locale);
  if (translated !== `enemy.${templateId}`) return translated;
  return fallbackName;
}

function recipeById(id: string) {
  return RECIPES.find((r) => r.id === id);
}

export function recipeName(id: string, locale: LocaleId = DEFAULT_LOCALE): string {
  const translated = t(`recipe.${id}.name`, undefined, locale);
  if (translated !== `recipe.${id}.name`) return translated;
  return recipeById(id)?.name ?? id;
}

export function recipeBlurb(id: string, locale: LocaleId = DEFAULT_LOCALE): string {
  const translated = t(`recipe.${id}.blurb`, undefined, locale);
  if (translated !== `recipe.${id}.blurb`) return translated;
  return recipeById(id)?.blurb ?? '';
}

export function traitName(id: string, locale: LocaleId = DEFAULT_LOCALE): string {
  const translated = t(`trait.${id}.name`, undefined, locale);
  if (translated !== `trait.${id}.name`) return translated;
  return getTrait(id)?.name ?? id;
}

export function traitDescription(id: string, locale: LocaleId = DEFAULT_LOCALE): string {
  const translated = t(`trait.${id}.description`, undefined, locale);
  if (translated !== `trait.${id}.description`) return translated;
  return getTrait(id)?.description ?? '';
}

export function settingLabel(key: string, locale: LocaleId = DEFAULT_LOCALE): string {
  return t(`settings.${key}.label`, undefined, locale);
}

export function settingDescription(key: string, locale: LocaleId = DEFAULT_LOCALE): string {
  return t(`settings.${key}.description`, undefined, locale);
}

export function settingOptionLabel(
  key: string,
  value: string,
  fallback: string,
  locale: LocaleId = DEFAULT_LOCALE,
): string {
  const path = `settings.${key}.options.${value}`;
  const translated = t(path, undefined, locale);
  if (translated !== path) return translated;
  return fallback;
}

export function settingGroupLabel(group: string, locale: LocaleId = DEFAULT_LOCALE): string {
  const path = `settings.groups.${group}`;
  const translated = t(path, undefined, locale);
  if (translated !== path) return translated;
  return group;
}

export type { TVars };
