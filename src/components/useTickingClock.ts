import { useEffect, useRef, useState } from 'react';
import { HOURS_PER_DAY } from '../game/survival';

/**
 * The clock face the player sees, in game hours since day 1. When the store
 * jumps (travel, sleep, a search), the face runs through the gap instead of
 * snapping, so the minutes spin and the hour turns over like a real clock.
 * Longer jumps run a little longer, capped so a night's sleep stays short.
 *
 * Counting through is how the clock tells you time passed, not decoration, so
 * it runs under reduced motion too; only the digit slide is dropped there.
 */
export function useTickingClock(day: number, hour: number) {
  const target = (day - 1) * HOURS_PER_DAY + hour;
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const first = useRef(true);

  useEffect(() => {
    const from = shownRef.current;
    const set = (v: number) => {
      shownRef.current = v;
      setShown(v);
    };
    if (first.current || target <= from) {
      first.current = false;
      set(target);
      return;
    }
    const minutes = (target - from) * 60;
    const duration = Math.min(1400, Math.max(320, minutes * 6));
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      set(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // An interrupted run picks up from wherever the face had got to.
    return () => cancelAnimationFrame(raf);
  }, [target]);

  // Whole minutes only, so the face never shows a minute the store has not reached.
  const totalMin = Math.floor(shown * 60 + 1e-6);
  const shownDay = Math.floor(totalMin / (HOURS_PER_DAY * 60)) + 1;
  const minOfDay = totalMin - (shownDay - 1) * HOURS_PER_DAY * 60;
  return { day: shownDay, h24: Math.floor(minOfDay / 60), m: minOfDay % 60 };
}
