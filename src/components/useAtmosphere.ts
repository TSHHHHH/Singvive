import { useMemo, type RefObject } from 'react';
import { useSetting } from '../game/settings';
import type { WeatherKind } from '../game/types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { atmosphereFor, mixAtmosphere, type Atmosphere } from '../map/atmosphere';
import { keyLight, lightBlend, lightPhase, phaseBand } from '../map/lighting';

/** The DOM halves of the 3D weather, owned by WeatherFx and driven from the map. */
export interface WeatherDom {
  /** Lightning bloom: opacity set per frame during a flash. */
  bolt: RefObject<HTMLDivElement | null>;
  /** Depth haze wrapper: opacity follows the camera pitch. */
  depth: RefObject<HTMLDivElement | null>;
}

const STRENGTH = { off: 0, subtle: 0.6, full: 1 } as const;

/**
 * The 3D atmosphere for today's sky and hour, resolved against the
 * weatherFx and mapLighting settings and reduced motion. Shared by the map driver and WeatherFx's depth haze so
 * both read the same numbers.
 */
export function useAtmosphere(kind: WeatherKind, hour: number) {
  const mode = useSetting('weatherFx');
  const lighting = useSetting('mapLighting') !== 'off';
  const still = useReducedMotion();
  const strength = STRENGTH[mode as keyof typeof STRENGTH] ?? 0;
  // `hour` is the stepped light hour (useLightHour): the light moves when the
  // clock crosses a 10-minute step, not per frame.
  const atmos = useMemo<Atmosphere>(() => {
    // Lighting off keeps the old three-band look (no dawn, no blending).
    if (!lighting) return atmosphereFor(kind, phaseBand(lightPhase(hour)), strength);
    const sun = keyLight(hour);
    const bl = lightBlend(hour);
    return mixAtmosphere(atmosphereFor(kind, bl.a, strength, sun), atmosphereFor(kind, bl.b, strength, sun), bl.t);
  }, [kind, strength, lighting, hour]);
  const lightning = strength > 0 && !still && kind === 'thunderstorm';
  return { atmos, lightning, still, strength };
}
