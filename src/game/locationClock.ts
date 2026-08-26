import type { LocationSize, LocationState } from './types';
import { decayBoosts } from './noise';

/** Danger creep back toward baseDanger, faster for larger sites. */
const REGEN_PER_DAY: Record<LocationSize, number> = { small: 0.6, medium: 1.2, large: 2.4 };

/**
 * Tick noise decay + danger regen. Untouched sites keep their previous object
 * identity — a fresh `locations` dict on every hour would re-render the map HUD.
 */
export function tickLocationClock(
  locations: Record<string, LocationState>,
  hours: number,
  hoursPerDay: number,
): Record<string, LocationState> {
  const decayed = decayBoosts(locations, hours);
  let next: Record<string, LocationState> | null = null;
  for (const [id, loc] of Object.entries(decayed)) {
    if (loc.exhausted || loc.currentDanger >= loc.baseDanger) continue;
    const creep = (REGEN_PER_DAY[loc.size] / hoursPerDay) * hours;
    if (creep <= 0) continue;
    const currentDanger = Math.min(loc.baseDanger, loc.currentDanger + creep);
    if (currentDanger === loc.currentDanger) continue;
    if (!next) next = { ...decayed };
    next[id] = { ...loc, currentDanger };
  }
  return next ?? decayed;
}
