import { useEffect, useRef, useState } from 'react';
import { LIGHT_STEP_H, stepHour } from '../map/lighting';

/** A jump this big or bigger plays through this many light steps, at most. */
const MAX_FADE_STEPS = 8;
/** Gap between fade steps, ms: about a second for a full fade. */
const FADE_STEP_MS = 140;

/**
 * The clock time the map's light shows: the game hour snapped to light steps
 * (10 game minutes). When the clock jumps (travel, a rest), it walks there
 * through up to MAX_FADE_STEPS in-between looks over about a second instead
 * of cutting; `instant` (reduced motion) cuts. Between changes it holds still,
 * so the map has nothing to repaint.
 */
export function useLightHour(hour: number, instant: boolean): number {
  const target = stepHour(hour);
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    // Time only runs forward: 23:00 → 01:00 is two hours, not twenty-two back.
    const diff = (((target - from) % 24) + 24) % 24;
    const set = (h: number) => {
      shownRef.current = h;
      setShown(h);
    };
    if (diff < LIGHT_STEP_H / 2) return;
    const steps = Math.min(MAX_FADE_STEPS, Math.round(diff / LIGHT_STEP_H));
    if (instant || steps <= 1) {
      set(target);
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      if (i >= steps) {
        window.clearInterval(id);
        set(target);
      } else set(stepHour(from + (diff * i) / steps));
    }, FADE_STEP_MS);
    return () => window.clearInterval(id);
  }, [target, instant]);

  return shown;
}
