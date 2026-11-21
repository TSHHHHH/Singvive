import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { disturbanceAt, hoursLeft } from '../game/disturbance';
import { useGame } from '../game/store';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useT } from '../i18n';
import { NoiseGlyph } from './PendingEventChoices';
import { tip } from './tips';

/**
 * Whether you're standing inside a disturbance, kept beside the weather. Lit
 * means every search and doorway here reads higher danger until it runs out.
 */
export function ActivityBadge({ onOpenTimeline }: { onOpenTimeline: () => void }) {
  const { t } = useT();
  const reduced = useReducedMotion();
  const { zones, lat, lng, day, hour, indoors } = useGame(useShallow((s) => ({
    zones: s.activity.zones, lat: s.currentPos.lat, lng: s.currentPos.lng,
    day: s.day, hour: s.hour, indoors: !!(s.hdb || s.tunnel),
  })));
  const now = (day - 1) * 24 + hour;
  const zone = useMemo(() => disturbanceAt(zones ?? [], lat, lng, now), [zones, lat, lng, now]);
  const button = useRef<HTMLButtonElement>(null);
  const previous = useRef<string | null>(zone?.id ?? null);
  useEffect(() => {
    const fresh = zone && zone.id !== previous.current;
    previous.current = zone?.id ?? null;
    if (!fresh || reduced) return;
    const animation = button.current?.animate([
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(1.18)', opacity: 0.6 },
      { transform: 'scale(1)', opacity: 1 },
    ], { duration: 650, iterations: 2 });
    return () => animation?.cancel();
  }, [zone, reduced]);
  const left = zone ? hoursLeft(zone, now) : 0;
  const label = zone
    ? t('ui.disturbance.badge', { what: t(`ui.disturbance.kind.${zone.kind}`), h: left })
    : t('ui.disturbance.badgeQuiet');
  const detail = [label,
    zone ? t('ui.disturbance.badgeEffect', { n: zone.danger }) : t('ui.surroundings.quietNotSafe'),
    indoors ? t('ui.surroundings.indoors') : '', t('ui.surroundings.openTimeline')].filter(Boolean).join(' ');
  return (
    <button ref={button} type="button" onClick={onOpenTimeline} data-disturbed={zone ? zone.kind : 'none'}
      aria-label={label} {...tip(detail)}
      className={`flex h-8 shrink-0 items-center justify-center gap-1 rounded border px-1.5 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal ${zone ? 'border-hiss/60 bg-hiss/10 text-hiss' : 'w-8 border-white/15 text-white/40'}`}>
      <NoiseGlyph size={18} loud={!!zone} />
      {zone && <span className="text-micro tabular-nums">{left}h</span>}
    </button>
  );
}
