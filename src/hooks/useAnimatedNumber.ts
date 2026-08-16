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

/**
 * Re-emit `value` at most once per `intervalMs`, always flushing the latest
 * sample. Used to keep a smooth UI tween while throttling expensive consumers
 * (fog canvas full-tile refreshes) to ~10–12 Hz.
 */
export function useThrottledNumber(value: number, intervalMs = 80): number {
  const [out, setOut] = useState(value);
  const lastEmitRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const now = performance.now();
    const elapsed = now - lastEmitRef.current;
    if (elapsed >= intervalMs) {
      lastEmitRef.current = now;
      setOut(value);
      return;
    }

    const timer = setTimeout(() => {
      lastEmitRef.current = performance.now();
      setOut(valueRef.current);
    }, intervalMs - elapsed);

    return () => clearTimeout(timer);
  }, [value, intervalMs]);

  return out;
}
