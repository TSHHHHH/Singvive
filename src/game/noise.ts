import type { LocationState } from './types';

/**
 * The ring the map draws the moment something loud happens. Purely visual: the
 * lasting consequence is the disturbance zone (disturbance.ts) left behind.
 */
export interface NoisePulse {
  id: number;
  lat: number;
  lng: number;
  radiusMeters: number;
  intensity: number;
  /** Date.now() when it fired — the map fades the ring over ~1.5s. */
  startedAt: number;
}

let pulseCounter = 0;

export function emitNoisePulse(
  lat: number,
  lng: number,
  radiusMeters: number,
  intensity: number,
): NoisePulse {
  pulseCounter += 1;
  return { id: pulseCounter, lat, lng, radiusMeters, intensity, startedAt: Date.now() };
}

/**
 * Danger a location actually presents right now. `disturbance` is the bonus
 * from the strongest disturbance zone over it (disturbance.ts) — the only way
 * noise reaches a site.
 */
export function effectiveDanger(loc: LocationState, disturbance = 0): number {
  return loc.currentDanger + disturbance;
}

/** How long a ring takes to travel out to its full radius and fade. */
export const PULSE_MS = 1600;

/** Drop rings that have finished animating, reusing the array when none did. */
export function prunePulses(pulses: NoisePulse[], now = Date.now()): NoisePulse[] {
  const live = pulses.filter((p) => now - p.startedAt < PULSE_MS);
  return live.length === pulses.length ? pulses : live;
}
