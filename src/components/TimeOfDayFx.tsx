import { memo, useEffect, useRef, useState } from 'react';
import type { TimeOfDay } from '../game/types';

/**
 * Diegetic light over the map. Independent of the weatherFx setting — dusk and
 * night are gameplay reads, not cosmetic rain. Static viewport gradients only
 * (same compositor rule as WeatherFx). A one-shot flash remounts on band change.
 */
function TimeOfDayFxInner({ time }: { time: TimeOfDay }) {
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

  const wash = time === 'night' ? 'tod-night' : time === 'dusk' ? 'tod-dusk' : null;
  if (!wash && !flash) return null;

  return (
    <div className="tod-root pointer-events-none absolute inset-0 z-[465] overflow-hidden">
      {wash && <div className={wash} />}
      {flash && <div key={flash.nonce} className={`tod-flash tod-flash-${flash.band}`} />}
    </div>
  );
}

export const TimeOfDayFx = memo(TimeOfDayFxInner);
