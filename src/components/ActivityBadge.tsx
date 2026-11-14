import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { activityAt, activityBand } from '../game/activity';
import { useGame } from '../game/store';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useT } from '../i18n';
import { tip } from './tips';

/** Local surface attention, kept beside the weather rather than over the map. */
export function ActivityBadge({ onOpenTimeline }: { onOpenTimeline: () => void }) {
  const { t } = useT();
  const reduced = useReducedMotion();
  const { activity, lat, lng, day, hour, indoors } = useGame(useShallow((s) => ({
    activity: s.activity, lat: s.currentPos.lat, lng: s.currentPos.lng,
    day: s.day, hour: s.hour, indoors: !!(s.hdb || s.tunnel),
  })));
  const now = (day - 1) * 24 + hour;
  const { band, cause } = useMemo(() => {
    let strongest = 0.01;
    let cause: (typeof activity.sources)[number] | null = null;
    for (const source of activity.sources) {
      const value = activityAt({ ...activity, sources: [source] }, lat, lng, now);
      if (value > strongest) { strongest = value; cause = source; }
    }
    return { band: activityBand(activityAt(activity, lat, lng, now)), cause };
  }, [activity, lat, lng, now]);
  const level = band === 'hunting' ? 2 : band === 'stirred' ? 1 : 0;
  const previous = useRef(level);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const increased = level > previous.current;
    previous.current = level;
    if (!increased || reduced) return;
    const animation = button.current?.animate([
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(1.18)', opacity: 0.6 },
      { transform: 'scale(1)', opacity: 1 },
    ], { duration: 650, iterations: 2 });
    return () => animation?.cancel();
  }, [level, reduced]);
  const label = `${t('ui.surroundings.title')}: ${t(`ui.surroundings.bands.${band}`)}`;
  const detail = [label, t(cause ? `ui.surroundings.causes.${cause.kind}` : 'ui.surroundings.noCause'),
    t(indoors ? 'ui.surroundings.indoors' : 'ui.surroundings.quietNotSafe'), t('ui.surroundings.openTimeline')].join(' ');
  return (
    <button ref={button} type="button" onClick={onOpenTimeline} data-activity-band={band}
      aria-label={label} {...tip(detail)}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal ${level === 2 ? 'text-hiss' : level === 1 ? 'text-signal' : 'text-white/50'}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="5" cy="12" r="2" />
        {level === 0 ? <path d="M11 12h8" /> : <path d="M11 7a7 7 0 0 1 0 10" />}
        {level === 2 && <path d="M16 3a12 12 0 0 1 0 18" />}
      </svg>
    </button>
  );
}
