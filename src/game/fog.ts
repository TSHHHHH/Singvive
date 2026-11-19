import type { LocationState, LocationMemory } from './types';
export { travelableRange } from './travelEnergy';

// ---------------------------------------------------------------------------
// Blind-exploration fog of war.
//
// Locations start unknown. Nearby recognition and local clues identify exterior
// names/categories; visits and specialist intel record fuller memories. The
// evacuation beacon is a separate broadcast objective.
// The ring on the map is not vision — it is the *travelable range*: how far
// the survivor can afford with their remaining energy, build, injuries and load.
// Terrain, weather and detours affect time, not walking energy. Locations in it show
// as anonymous "?" blips until identified by exploration or visited.
// ---------------------------------------------------------------------------

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
 * Recognition uses a separate short radius in exploration.ts.
 */
export function awareness(perception: number, equipMod: number, traitMod: number): number {
  return Math.max(0, perception + equipMod + traitMod);
}

/** Extra blip-sensing margin beyond the travel ring, from awareness. */
export function blipMargin(awarenessValue: number): number {
  return Math.max(0, awarenessValue - 5) * AWARENESS_RANGE_PER_POINT;
}

export type Visibility = 'inSight' | 'memory' | 'identified' | 'detected' | 'hidden';

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
  if (loc.identified) return 'identified';
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
