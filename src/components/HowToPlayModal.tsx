import { useState } from 'react';
import { getGuideSections, type GuideTopic } from '../content/guideContent';
import { useSetting, useSettings } from '../game/settings';
import { useT } from '../i18n';
import { GuideSectionView } from './GuideSectionView';
import { ModalShell, TabRail } from './ModalShell';

/**
 * Full how-to-play primer with a side tab list. Shown on run start when
 * `showGuideOnStart` is on, and reopenable from Settings — which is why it sits
 * above Settings in the stacking order.
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
    <ModalShell
      title={t('ui.guide.howToPlay')}
      onClose={onClose}
      z={1300}
      bodyClassName="flex min-h-0 flex-1 flex-col sm:flex-row"
      footer={
        <>
          <label className="flex cursor-pointer items-center gap-2 text-body text-white/55 select-none">
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
            className="rounded-sm bg-signal/80 px-4 py-1.5 text-body font-bold text-black transition hover:bg-signal"
          >
            {t('ui.guide.gotIt')}
          </button>
        </>
      }
    >
      <TabRail
        items={sections.map((s) => ({ id: s.id, label: s.title }))}
        active={active}
        onSelect={(id) => setActive(id as GuideTopic)}
        ariaLabel={t('ui.guide.topicsAria')}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <GuideSectionView section={section} showTitle={false} />
      </div>
    </ModalShell>
  );
}
