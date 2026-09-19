import { t, tList } from '../i18n/t';
import { itemName } from '../i18n/display';
import { DEFAULT_LOCALE, isLocaleId, type LocaleId } from '../i18n/types';
import type { FactionId, TimeOfDay, WeatherKind } from './types';
import type { Rng } from './rng';
import { useSettings } from './settings';

/**
 * Locale-aware doorway event copy. English lives in `src/i18n/messages/en.json`
 * (`event.*`); zh-Hans overlays the same keys. Game builders keep English
 * fallbacks only where a key is missing.
 */

export function activeLocale(explicit?: LocaleId): LocaleId {
  if (explicit && isLocaleId(explicit)) return explicit;
  const raw = useSettings.getState().values.language;
  if (raw && isLocaleId(raw)) return raw;
  return DEFAULT_LOCALE;
}

export function fillVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** Resolve `event.{path}` for the active locale (English fallback via `t`). */
export function ev(
  path: string,
  vars?: Record<string, string | number>,
  locale?: LocaleId,
): string {
  return t(`event.${path}`, vars, activeLocale(locale));
}

export function factionShortName(id: Exclude<FactionId, null>, locale?: LocaleId): string {
  const lang = activeLocale(locale);
  const key = `ui.faction.${id}.shortName`;
  const translated = t(key, undefined, lang);
  return translated === key ? id : translated;
}

export function factionFullName(id: Exclude<FactionId, null>, locale?: LocaleId): string {
  const lang = activeLocale(locale);
  const key = `ui.faction.${id}.name`;
  const translated = t(key, undefined, lang);
  return translated === key ? id : translated;
}

/** "1× batteries, torch or canned food" — locale-aware item names. */
export function priceList(defIds: string[], locale?: LocaleId): string {
  const lang = activeLocale(locale);
  const names = defIds.map((id) => itemName(id, lang));
  if (names.length === 1) {
    return t('event.priceList.one', { name: names[0]! }, lang);
  }
  return t(
    'event.priceList.or',
    { list: names.slice(0, -1).join(', '), last: names[names.length - 1]! },
    lang,
  );
}

const WET: readonly WeatherKind[] = ['rain', 'thunderstorm'];

type PoolKind = 'tell' | 'text' | 'night' | 'wet';

function poolPrefix(
  kind: string,
  factionId: FactionId | undefined,
): string {
  if (
    factionId &&
    (kind === 'faction_checkpoint' || kind === 'faction_shakedown')
  ) {
    const overlay = tList(`event.faction.${factionId}.${kind}.tell`, 'en');
    if (overlay.length > 0) return `event.faction.${factionId}.${kind}`;
  }
  return `event.${kind}`;
}

function pickIndex(rng: Rng, len: number): number {
  return rng.int(0, len - 1);
}

function lineAt(key: string, idx: number, locale: LocaleId, vars: Record<string, string>): string {
  const en = tList(key, 'en');
  const loc = tList(key, locale);
  const tpl = loc[idx] ?? en[idx] ?? '';
  return fillVars(tpl, vars);
}

/**
 * Pick tell + body prose for a doorway kind, weighting night/wet variants the
 * same way the old in-file pools did (duplicate night/wet entries into the pool).
 */
export function pickEventProse(
  rng: Rng,
  kind: string,
  ctx: { time: TimeOfDay; weather: WeatherKind; locale?: LocaleId },
  vars: Record<string, string>,
  factionId?: FactionId,
): { tell: string; text: string } {
  const locale = activeLocale(ctx.locale);
  const prefix = poolPrefix(kind, factionId);

  const tellEn = tList(`${prefix}.tell`, 'en');
  const tell =
    tellEn.length > 0
      ? lineAt(`${prefix}.tell`, pickIndex(rng, tellEn.length), locale, vars)
      : '';

  type Ref = { pool: PoolKind; idx: number };
  const refs: Ref[] = [];
  const textEn = tList(`${prefix}.text`, 'en');
  for (let i = 0; i < textEn.length; i++) refs.push({ pool: 'text', idx: i });

  const nightEn = tList(`${prefix}.night`, 'en');
  if (ctx.time === 'night' && nightEn.length > 0) {
    for (let i = 0; i < nightEn.length; i++) {
      refs.push({ pool: 'night', idx: i }, { pool: 'night', idx: i });
    }
  }
  const wetEn = tList(`${prefix}.wet`, 'en');
  if (WET.includes(ctx.weather) && wetEn.length > 0) {
    for (let i = 0; i < wetEn.length; i++) {
      refs.push({ pool: 'wet', idx: i }, { pool: 'wet', idx: i });
    }
  }

  if (refs.length === 0) return { tell, text: '' };
  const chosen = rng.pick(refs);
  const text = lineAt(`${prefix}.${chosen.pool}`, chosen.idx, locale, vars);
  return { tell, text };
}

/** Field-doctor body pool (three variants). */
export function pickFieldDoctorText(rng: Rng, locale?: LocaleId): string {
  const lang = activeLocale(locale);
  const en = tList('event.field_doctor.text', 'en');
  if (en.length === 0) return '';
  const idx = pickIndex(rng, en.length);
  const loc = tList('event.field_doctor.text', lang);
  return loc[idx] ?? en[idx]!;
}
