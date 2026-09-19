/**
 * Cosmetic land-travel glide curve. Same wall-clock `durationMs` as arrival
 * timeout — only remaps progress so the pin lingers, covers ground, settles.
 * Not used by sim travel cost (`BASE_SPEED` / duration clamp stay untouched).
 */

/** Fraction of wall-clock time held still at each end of the glide. */
export const TRAVEL_HOLD = 0.1;

/**
 * Heavier ease with brief start/end holds. Input/output in [0, 1].
 * Flat head/tail drop peak mid-route speed so the same budget feels deliberate.
 */
export function travelEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  if (x <= TRAVEL_HOLD) return 0;
  if (x >= 1 - TRAVEL_HOLD) return 1;
  const u = (x - TRAVEL_HOLD) / (1 - 2 * TRAVEL_HOLD);
  // Cubic ease-in-out on the remapped mid segment.
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

/** Camera sample interval — avoid per-frame pan spam (fog tiles / markers). */
export const CAMERA_INTERVAL_MS = 80;
/** How far ahead of the walker (fraction of remaining path) the camera aims. */
export const CAMERA_LEAD = 0.12;
/** Per-sample chase strength toward the lead point. */
export const CAMERA_LERP = 0.42;
/** Edge band that engages soft follow (fraction of shorter viewport side). */
export const CAMERA_EDGE = 0.32;
/** Ignore pans smaller than this (container px). */
export const CAMERA_MIN_PX = 10;
