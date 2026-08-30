import { useEffect, useRef, useState } from 'react';
import { HOURS_PER_DAY } from '../game/survival';
import { timeOfDay } from '../game/weather';

export type ClockAdvanceKind = 'tick' | 'band';

export interface ClockAdvanceFx {
  nonce: number;
  deltaHours: number;
  kind: ClockAdvanceKind;
  dayChanged: boolean;
}

function totalHours(day: number, hour: number): number {
  return (day - 1) * HOURS_PER_DAY + hour;
}

/**
 * One-shot cue when the in-game clock actually moves. Skips the first paint so
 * Continue Run does not flash; ignores zero/negative jumps (rehydrate, rewind).
 */
export function useClockAdvance(day: number, hour: number): ClockAdvanceFx | null {
  const prev = useRef<{ day: number; hour: number; ready: boolean }>({
    day,
    hour,
    ready: false,
  });
  const nonce = useRef(0);
  const [fx, setFx] = useState<ClockAdvanceFx | null>(null);

  useEffect(() => {
    const p = prev.current;
    if (!p.ready) {
      prev.current = { day, hour, ready: true };
      return;
    }
    const delta = totalHours(day, hour) - totalHours(p.day, p.hour);
    const dayChanged = day !== p.day;
    const bandChanged = timeOfDay(hour) !== timeOfDay(p.hour);
    prev.current = { day, hour, ready: true };
    if (delta <= 0) return;
    nonce.current += 1;
    setFx({
      nonce: nonce.current,
      deltaHours: delta,
      kind: bandChanged ? 'band' : 'tick',
      dayChanged,
    });
  }, [day, hour]);

  useEffect(() => {
    if (!fx) return;
    const t = window.setTimeout(() => setFx(null), 1700);
    return () => window.clearTimeout(t);
  }, [fx]);

  return fx;
}
