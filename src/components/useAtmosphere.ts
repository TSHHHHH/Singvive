import { useMemo, type RefObject } from 'react';
import { useSetting } from '../game/settings';
import type { TimeOfDay, WeatherKind } from '../game/types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { atmosphereFor, type Atmosphere } from '../map/atmosphere';

/** The DOM halves of the 3D weather, owned by WeatherFx and driven from the map. */
export interface WeatherDom {
  /** Lightning bloom: opacity set per frame during a flash. */
  bolt: RefObject<HTMLDivElement | null>;
  /** Depth haze wrapper: opacity follows the camera pitch. */
  depth: RefObject<HTMLDivElement | null>;
}

const STRENGTH = { off: 0, subtle: 0.6, full: 1 } as const;

/**
 * The 3D atmosphere for today's sky, resolved against the weatherFx setting
 * and reduced motion. Shared by the map driver and WeatherFx's depth haze so
 * both read the same numbers.
 */
export function useAtmosphere(kind: WeatherKind, time: TimeOfDay) {
  const mode = useSetting('weatherFx');
  const still = useReducedMotion();
  const strength = STRENGTH[mode as keyof typeof STRENGTH] ?? 0;
  const atmos = useMemo<Atmosphere>(() => atmosphereFor(kind, time, strength), [kind, time, strength]);
  const lightning = strength > 0 && !still && kind === 'thunderstorm';
  return { atmos, lightning, still, strength };
}
