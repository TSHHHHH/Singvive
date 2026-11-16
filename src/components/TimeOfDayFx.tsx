import { memo, useEffect, useRef, useState } from 'react';
import type { TimeOfDay } from '../game/types';

/**
 * Diegetic light over the map. Independent of the weatherFx setting — dusk and
 * night are gameplay reads, not cosmetic rain. Static viewport gradients only
 * (same compositor rule as WeatherFx). A one-shot flash remounts on band change.
 */
/** How much of each wash shows, 0..1 (lighting on: blended with the clock). */
export interface TodMix {
  dawn: number;
  dusk: number;
  night: number;
}

function TimeOfDayFxInner({ time, mix }: { time: TimeOfDay; mix?: TodMix }) {
  const prev = useRef<TimeOfDay | null>(null);
  const [flash, setFlash] = useState<{ nonce: number; band: TimeOfDay } | null>(null);

  useEffect(() => {
    if (prev.current === null) {
      prev.current = time;
      return;
    }
    if (prev.current === time) return;
    prev.current = time;
    setFlash((cur) => ({ nonce: (cur?.nonce ?? 0) + 1, band: time }));
  }, [time]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 750);
    return () => window.clearTimeout(t);
  }, [flash]);

  // Lighting on: the washes cross-fade with the clock (dawn is a look, not a
  // band). Off: one wash per gameplay band, as before.
  const w: TodMix = mix ?? { dawn: 0, dusk: time === 'dusk' ? 1 : 0, night: time === 'night' ? 1 : 0 };
  const washes = (['dawn', 'dusk', 'night'] as const).filter((k) => w[k] > 0.01);
  if (!washes.length && !flash) return null;

  return (
    <div className="tod-root pointer-events-none absolute inset-0 z-[465] overflow-hidden">
      {washes.map((k) => (
        <div key={k} className={`tod-${k}`} style={w[k] < 0.99 ? { opacity: w[k] } : undefined} />
      ))}
      {flash && <div key={flash.nonce} className={`tod-flash tod-flash-${flash.band}`} />}
    </div>
  );
}

export const TimeOfDayFx = memo(TimeOfDayFxInner);
