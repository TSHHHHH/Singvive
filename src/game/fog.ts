import type { Attributes, LocationState, LocationMemory, WeatherKind } from './types';
import { walkSpeed } from './travel';
import { weatherTravelMult } from './weather';

// ---------------------------------------------------------------------------
// Blind-exploration fog of war.
//
// The player has NO knowledge of any location until they physically visit it.
// The ring on the map is not vision — it is the *travelable range*: how far
// the survivor can comfortably push right now given their build, energy,
// injuries, load and the weather. Unvisited locations inside that ring show
// only as anonymous "?" blips; identity is revealed by going there.
// ---------------------------------------------------------------------------

// Minutes of walking the survivor will commit to per 10 energy — the
// "comfortable expedition reach" used for the planning ring.
const MINUTES_PER_10_ENERGY = 1;

// Metres of blip-sensing range added per awareness point above baseline.
export const AWARENESS_RANGE_PER_POINT = 60;

import { haversine } from './overpass';

/** Radius of the lit spot left behind at a visited location. */
export const VISITED_LIGHT_RADIUS = 140;

/** Explored area entry — a lit spot on the fog canvas (somewhere you've been). */
export interface ExploredCircle {
  lat: number;
  lng: number;
  radius: number; // metres
}

/**
 * Collapse fog discs so tile paint stays O(tiles), not O(visits × tiles).
 * Contained circles are dropped (exact). Heavily overlapping neighbours merge
 * into a covering disc once the list is long enough that paint cost matters.
 */
export function mergeExploredCircles(circles: ExploredCircle[]): ExploredCircle[] {
  if (circles.length < 2) return circles;
  const remaining: ExploredCircle[] = circles.slice();
  const mergeOverlap = remaining.length >= 48;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const a = remaining[i]!;
        const b = remaining[j]!;
        const d = haversine(a.lat, a.lng, b.lat, b.lng);
        if (d + b.radius <= a.radius + 0.5) {
          remaining.splice(j, 1);
          changed = true;
          break outer;
        }
        if (d + a.radius <= b.radius + 0.5) {
          remaining.splice(i, 1);
          changed = true;
          break outer;
        }
        if (mergeOverlap && d < (a.radius + b.radius) * 0.55) {
          const R = (d + a.radius + b.radius) / 2;
          const t = d < 1e-6 ? 0 : (R - a.radius) / d;
          remaining[i] = {
            lat: a.lat + t * (b.lat - a.lat),
            lng: a.lng + t * (b.lng - a.lng),
            radius: R,
          };
          remaining.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return remaining.length === circles.length ? circles : remaining;
}

/**
 * Derive awareness from Perception + equipment/trait modifiers.
 * Awareness extends how far beyond the travel ring you can *sense* blips —
 * never what they are.
 */
export function awareness(perception: number, equipMod: number, traitMod: number): number {
  return Math.max(0, perception + equipMod + traitMod);
}

/**
 * How far the survivor can comfortably travel right now, in metres.
 * Scales with walking speed (END/DEX + leg injuries), current energy, and is
 * slowed by load and bad weather — the same factors as real travel time.
 */
export function travelableRange(
  attrs: Attributes,
  energy: number,
  legFactor: number,
  weather: WeatherKind,
  travelMult = 1,
): number {
  const speed = walkSpeed(attrs, energy, legFactor); // m/min
  const wMult = weatherTravelMult(weather);
  const loadMult = Math.max(1, travelMult);
  // full energy (100) commits ~10 minutes of walking; scales down as you tire
  const commitMinutes = Math.max(0, energy) * MINUTES_PER_10_ENERGY / 10;
  return Math.round((speed * commitMinutes) / (wMult * loadMult));
}

/** Extra blip-sensing margin beyond the travel ring, from awareness. */
export function blipMargin(awarenessValue: number): number {
  return Math.max(0, awarenessValue - 5) * AWARENESS_RANGE_PER_POINT;
}

export type Visibility = 'inSight' | 'memory' | 'detected' | 'hidden';

/**
 * Classify a location for rendering. "inSight" (live data) is decided by the
 * caller — it only applies to the location the player is standing at.
 */
export function visibilityOf(
  loc: LocationState,
  distanceM: number,
  blipRange: number,
): Visibility {
  if (loc.discovered) return 'memory';
  if (distanceM <= blipRange) return 'detected';
  return 'hidden';
}

/** Freeze the current live state of a location into a memory snapshot. */
export function snapshot(loc: LocationState): LocationMemory {
  return {
    currentDanger: loc.currentDanger,
    isFactionRevealed: loc.isFactionRevealed,
    looted: loc.looted,
    exhausted: loc.exhausted,
    remainingSearches: loc.remainingSearches,
    cleared: loc.cleared,
    ...(loc.destruction !== undefined ? { destruction: loc.destruction } : {}),
  };
}
