import { useState } from 'react';
import { getGuideSections, type GuideTopic } from '../content/guideContent';
import { useSetting, useSettings } from '../game/settings';
import { useT } from '../i18n';
import { GuideSectionView } from './GuideSectionView';

/**
 * Full how-to-play primer with a side tab list. Shown on run start when
 * `showGuideOnStart` is on, and reopenable from Settings.
 */
export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  const { locale, t } = useT();
  const sections = getGuideSections(locale);
  const [active, setActive] = useState<GuideTopic>(sections[0].id);
  const showOnStart = useSetting('showGuideOnStart');
  const setSetting = useSettings((s) => s.setSetting);
  const section = sections.find((s) => s.id === active) ?? sections[0];
  const dontShowAgain = showOnStart === 'off';

  return (
    <div
      className="absolute inset-0 z-[1300] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,40rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/15 bg-concrete-900 shadow-signage"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="how-to-play-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h3 id="how-to-play-title" className="text-lg font-bold text-signal">
            {t('ui.guide.howToPlay')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-white/40 hover:text-white/70"
          >
            {t('ui.common.close')}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-2 sm:w-40 sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:border-b-0 sm:border-r"
            aria-label={t('ui.guide.topicsAria')}
          >
            {sections.map((s) => {
              const selected = s.id === active;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={`shrink-0 rounded px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wider transition sm:w-full ${
                    selected
                      ? 'bg-signal/15 text-signal'
                      : 'text-white/45 hover:bg-white/5 hover:text-white/70'
                  }`}
                  aria-current={selected ? 'page' : undefined}
                >
                  {s.title}
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <GuideSectionView section={section} showTitle={false} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-white/55 select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setSetting('showGuideOnStart', e.target.checked ? 'off' : 'on')}
              className="rounded border-white/30 bg-black/40 text-signal focus:ring-signal/40"
            />
            {t('ui.guide.dontShowAgain')}
          </label>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm bg-signal/80 px-4 py-1.5 text-xs font-bold text-black transition hover:bg-signal"
          >
            {t('ui.guide.gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
}
