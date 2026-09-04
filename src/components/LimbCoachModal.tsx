import { useEffect, useState } from 'react';
import { BODY_PART_IDS } from '../game/survival';
import type { BodyPartId, BodyParts } from '../game/types';
import { useSetting, useSettings } from '../game/settings';
import { useT } from '../i18n';
import type { GuideTopic } from '../content/guideContent';

function firstInjuredPart(parts: BodyParts): BodyPartId | null {
  for (const id of BODY_PART_IDS) {
    const p = parts[id];
    if (p.hp < p.maxHp || p.bleed !== 'none' || p.fractured || p.crippled) return id;
  }
  return null;
}

/**
 * One-shot coach the first time a limb takes meaningful damage.
 * Dismissal is remembered in settings (`limbCoachSeen`), not the run save.
 */
export function LimbCoachModal({
  bodyParts,
  onOpenGuide,
}: {
  bodyParts: BodyParts;
  onOpenGuide: (topic: GuideTopic) => void;
}) {
  const { t } = useT();
  const seen = useSetting('limbCoachSeen');
  const setSetting = useSettings((s) => s.setSetting);
  const [partId, setPartId] = useState<BodyPartId | null>(null);

  useEffect(() => {
    if (seen === 'on') return;
    if (partId) return;
    const hit = firstInjuredPart(bodyParts);
    if (hit) setPartId(hit);
  }, [bodyParts, seen, partId]);

  if (seen === 'on' || !partId) return null;

  const dismiss = () => setSetting('limbCoachSeen', 'on');

  return (
    <div
      className="absolute inset-0 z-[1250] flex items-center justify-center bg-black/80 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-white/15 bg-concrete-900 p-5 shadow-signage"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="limb-coach-title"
      >
        <h3 id="limb-coach-title" className="mb-2 text-lg font-bold text-signal">
          {t('ui.guide.limbCoach.title')}
        </h3>
        <p className="mb-2 text-sm text-white/75">{t(`ui.guide.limbCoach.effect.${partId}`)}</p>
        <p className="mb-4 text-xs leading-relaxed text-white/50">{t('ui.guide.limbCoach.blurb')}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-xs font-semibold text-white/55 hover:bg-white/5 hover:text-white/80"
            onClick={() => {
              dismiss();
              onOpenGuide('body');
            }}
          >
            {t('ui.guide.limbCoach.openGuide')}
          </button>
          <button
            type="button"
            className="rounded bg-signal/20 px-3 py-1.5 text-xs font-semibold text-signal hover:bg-signal/30"
            onClick={dismiss}
          >
            {t('ui.guide.gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
}
