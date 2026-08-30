import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useSetting } from '../game/settings';
import { DEFAULT_LOCALE, isLocaleId, type LocaleId } from './types';
import { ensureLocale, localeVersion, subscribeLocale, t, tList, type TVars } from './t';

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
  // Non-English catalogs load on demand; `version` ticks when one arrives so the
  // tree re-translates instead of staying on the English fallback.
  const version = useSyncExternalStore(subscribeLocale, localeVersion, localeVersion);
  useEffect(() => {
    void ensureLocale(locale);
  }, [locale]);
  // `version` is a deliberate cache-buster: `t` reads a module-level catalog
  // map, so when a lazily-loaded locale lands the callbacks must be rebuilt
  // even though the linter cannot see that dependency.
  const translate = useCallback(
    (key: string, vars?: TVars) => t(key, vars, locale),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [locale, version],
  );
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const translateList = useCallback((key: string) => tList(key, locale), [locale, version]);
  return { locale, t: translate, tList: translateList };
}
