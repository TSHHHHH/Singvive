import { useEffect } from 'react';
import { useGame } from '../game/store';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';

/** Owns the cue lifetime even while a modal or phone tab covers the map. */
export function NearbyRecognitionNotice({ leftInset = 0, rightInset = 0 }: { leftInset?: number; rightInset?: number }) {
  const cue = useGame(s => s.nearbyRecognition);
  const { t } = useT();
  useEffect(() => {
    if (!cue.length) return;
    const timer = window.setTimeout(() => useGame.getState().dismissNearbyRecognition(cue), 4200);
    return () => window.clearTimeout(timer);
  }, [cue]);

  return (
    <div className="pointer-events-none absolute top-20 z-[540] flex justify-center lg:top-16"
      style={{ left: leftInset + 12, right: rightInset + 12 }} role="status" aria-live="polite" aria-atomic="true">
      {cue.length > 0 && (
        <div className="recognition-notice flex max-w-sm items-start gap-2 rounded border border-signal/40 bg-concrete-950/95 px-3 py-2 shadow-lg">
          <span className="mt-0.5 text-signal" aria-hidden="true"><Icon name="attr.perception" /></span>
          <div>
            <div className="text-label text-signal">{t('ui.exploration.recognitionNotice', { count: cue.length })}</div>
            <div className="mt-0.5 text-micro text-white/65">{t('ui.exploration.conditionsUnknown')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
