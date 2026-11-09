/**
 * Cosmetic land-travel glide curve. Same wall-clock `durationMs` as arrival
 * timeout — only remaps progress so the pin lingers, covers ground, settles.
 * Not used by sim travel cost (`BASE_SPEED` / duration clamp stay untouched).
 */

/** Floor / ceiling for the pin glide (ms). */
export const TRAVEL_ANIM_MIN_MS = 1250;
export const TRAVEL_ANIM_MAX_MS = 4400;
/** Sim travel minutes → wall-clock ms before veg stretch / clamp. */
export const TRAVEL_ANIM_MS_PER_MIN = 34;
/** Veg can stretch the glide up to this multiplier. */
export const TRAVEL_ANIM_VEG_CAP = 1.35;

/** Wall-clock ms for the land-travel pin glide (cosmetic only). */
export function travelAnimDurationMs(travelMin: number, travelMult = 1): number {
  const veg = Math.min(TRAVEL_ANIM_VEG_CAP, Math.max(1, travelMult));
  return Math.min(
    TRAVEL_ANIM_MAX_MS,
    Math.max(TRAVEL_ANIM_MIN_MS, Math.round(travelMin * TRAVEL_ANIM_MS_PER_MIN * veg)),
  );
}

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

/** How far ahead of the walker (fraction of remaining path) the camera aims. */
export const CAMERA_LEAD = 0.12;
/**
 * Camera chase time constant (s): every frame the centre closes
 * `1 - exp(-dt / CAMERA_TAU_S)` of the gap to its target, so speed is the
 * same at any frame rate and the follow eases out instead of stepping.
 */
export const CAMERA_TAU_S = 0.28;
/** Edge band that engages soft follow (fraction of shorter viewport side). */
export const CAMERA_EDGE = 0.32;
/** The chase stops once the centre is this close to its target (container px). */
export const CAMERA_SETTLE_PX = 0.5;
/** A discrete jump this many screens away cuts instead of chasing. */
export const CAMERA_CUT_SCREENS = 3;

/** Share of the gap a chase closes over `dtS` seconds. */
export function chaseStep(dtS: number, tauS = CAMERA_TAU_S): number {
  return 1 - Math.exp(-Math.max(0, dtS) / tauS);
}
