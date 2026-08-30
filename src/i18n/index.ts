export type { LocaleId, MessageTree, MessageNode } from './types';
export { DEFAULT_LOCALE, LOCALES, isLocaleId } from './types';
export {
  t,
  tList,
  flattenMessages,
  setMessageLeaf,
  ensureLocale,
  getCatalog,
  getEnglishCatalog,
  getZhHansCatalog,
  setZhHansOverlay,
  lookupNode,
} from './t';
export type { TVars } from './t';
export { useT, useLocale } from './useT';
export {
  msgOr,
  standingKey,
  standingDisplayLabel,
  destructionDisplayLabel,
  poiCategoryLabel,
  itemName,
  enemyName,
  recipeName,
  recipeBlurb,
  traitName,
  traitDescription,
  traitEffects,
  traitHoverText,
  settingLabel,
  settingDescription,
  settingOptionLabel,
  settingGroupLabel,
} from './display';
