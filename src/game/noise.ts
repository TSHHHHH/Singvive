import type { LocationState } from './types';
import { haversine } from './overpass';

/**
 * Noise is the one thing that travels further than you do. A pulse is a purely
 * spatial event: the map draws it, and every POI inside the ring gets louder.
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

/** Boost decays by 1 danger point every 2 in-game hours. */
export const DANGER_DECAY_PER_HOUR = 0.5;

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

/** Ids of the locations that hear the pulse. */
export function locationsInPulse(
  locations: Record<string, LocationState>,
  pulse: NoisePulse,
): string[] {
  const hit: string[] = [];
  for (const loc of Object.values(locations)) {
    if (haversine(pulse.lat, pulse.lng, loc.lat, loc.lng) <= pulse.radiusMeters) hit.push(loc.id);
  }
  return hit;
}

/** Apply a pulse's intensity to every location that heard it. */
export function applyPulse(
  locations: Record<string, LocationState>,
  pulse: NoisePulse,
): Record<string, LocationState> {
  const heard = locationsInPulse(locations, pulse);
  // Nothing heard it — hand the same record back. A fresh identity here would
  // make every consumer of `locations` treat the map as changed, and combat
  // emits a pulse per swing.
  if (heard.length === 0) return locations;
  const next = { ...locations };
  for (const id of heard) {
    const loc = next[id];
    next[id] = { ...loc, tempDangerBoost: (loc.tempDangerBoost ?? 0) + pulse.intensity };
  }
  return next;
}

/** Bleed off temporary danger as the clock advances. */
export function decayBoosts(
  locations: Record<string, LocationState>,
  hours: number,
): Record<string, LocationState> {
  const drop = hours * DANGER_DECAY_PER_HOUR;
  if (drop <= 0) return locations;
  let touched = false;
  const next: Record<string, LocationState> = {};
  for (const [id, loc] of Object.entries(locations)) {
    const boost = loc.tempDangerBoost ?? 0;
    if (boost <= 0) {
      next[id] = loc;
      continue;
    }
    touched = true;
    next[id] = { ...loc, tempDangerBoost: Math.max(0, boost - drop) };
  }
  return touched ? next : locations;
}

/** Danger a location actually presents right now, noise included. */
export function effectiveDanger(loc: LocationState): number {
  return loc.currentDanger + (loc.tempDangerBoost ?? 0);
}

/** How long a ring takes to travel out to its full radius and fade. */
export const PULSE_MS = 1600;

/** Drop rings that have finished animating, reusing the array when none did. */
export function prunePulses(pulses: NoisePulse[], now = Date.now()): NoisePulse[] {
  const live = pulses.filter((p) => now - p.startedAt < PULSE_MS);
  return live.length === pulses.length ? pulses : live;
}
