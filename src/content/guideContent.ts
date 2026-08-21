/** Player-facing tutorial copy shared by HowToPlayModal and contextual GuideModal. */

import { t, tList } from '../i18n/t';
import type { LocaleId } from '../i18n/types';
import { DEFAULT_LOCALE } from '../i18n/types';

export type GuideTopic = 'survive' | 'loot' | 'evac' | 'score' | 'hdb' | 'tunnels';

export interface GuideSection {
  id: GuideTopic;
  title: string;
  bullets: string[];
}

export const GUIDE_TOPIC_ORDER: readonly GuideTopic[] = [
  'survive',
  'loot',
  'hdb',
  'tunnels',
  'evac',
  'score',
] as const;

/** Localized guide sections (English fallback inside t / tList). */
export function getGuideSections(locale: LocaleId = DEFAULT_LOCALE): GuideSection[] {
  return GUIDE_TOPIC_ORDER.map((id) => ({
    id,
    title: t(`guide.${id}.title`, undefined, locale),
    bullets: tList(`guide.${id}.bullets`, locale),
  }));
}

export function getGuideSection(
  id: GuideTopic,
  locale: LocaleId = DEFAULT_LOCALE,
): GuideSection {
  return {
    id,
    title: t(`guide.${id}.title`, undefined, locale),
    bullets: tList(`guide.${id}.bullets`, locale),
  };
}

/** @deprecated Prefer getGuideSections(locale) — kept for static English tooling. */
export const GUIDE_SECTIONS: readonly GuideSection[] = getGuideSections('en');

export const GUIDE_BY_ID: Record<GuideTopic, GuideSection> = Object.fromEntries(
  GUIDE_SECTIONS.map((s) => [s.id, s]),
) as Record<GuideTopic, GuideSection>;

/** Sections shown when opening help from a given entry point. */
export function guideTopicsFor(topic: GuideTopic): GuideTopic[] {
  if (topic === 'evac') return ['evac', 'score'];
  if (topic === 'hdb') return ['hdb', 'loot'];
  if (topic === 'tunnels') return ['tunnels', 'evac'];
  return [topic];
}
