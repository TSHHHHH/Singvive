import { useEffect, useRef, useState } from 'react';

/** Same ease as the player walk glide on the map. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Smoothly chase a numeric target (e.g. fog / planning-ring radius).
 * Cancels and restarts if `target` changes mid-tween.
 */
export function useAnimatedNumber(target: number, durationMs = 550): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const from = valueRef.current;
    if (from === target) return;

    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / durationMs);
      const next = from + (target - from) * easeInOut(t);
      // Round for Leaflet radius props so tiny float noise doesn't spam redraws.
      setValue(t < 1 ? Math.round(next) : target);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
