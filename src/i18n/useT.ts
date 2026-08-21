import { useCallback } from 'react';
import { useSetting } from '../game/settings';
import { DEFAULT_LOCALE, isLocaleId, type LocaleId } from './types';
import { t, tList, type TVars } from './t';

export function useLocale(): LocaleId {
  const raw = useSetting('language');
  return isLocaleId(raw) ? raw : DEFAULT_LOCALE;
}

/** Reactive translator bound to the player's language setting. */
export function useT(): {
  locale: LocaleId;
  t: (key: string, vars?: TVars) => string;
  tList: (key: string) => string[];
} {
  const locale = useLocale();
  const translate = useCallback((key: string, vars?: TVars) => t(key, vars, locale), [locale]);
  const translateList = useCallback((key: string) => tList(key, locale), [locale]);
  return { locale, t: translate, tList: translateList };
}
