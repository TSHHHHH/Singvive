import type { TimeOfDay, WeatherKind } from './types';

// ---------------------------------------------------------------------------
// Night sight — darkness as an information tax, not just a danger bump.
//
// After dusk the survivor sees less: fewer "?" blips, fewer hazard pockets
// previewed on the trek card, a black veil on the map past the edge of what
// they can actually see. Hazards that fall outside sight still exist and still
// fire on the walk; you just don't get told. A light source (torch in the off
// hand, headlamp on the head) pushes the edge back — at the cost of the
// off-hand fork, and of being a beacon in an empty street.
//
// Pure: no RNG, no DOM. Daytime is always full sight, so nothing here changes a
// daylight run.
// ---------------------------------------------------------------------------

/** Ambient light by band, before weather. 1 = full sight. */
export const AMBIENT_LIGHT: Record<TimeOfDay, number> = {
  day: 1,
  dusk: 0.6,
  night: 0.22,
};

/** Cloud and rain eat what little light there is after dark. */
const WEATHER_LIGHT: Partial<Record<WeatherKind, number>> = {
  cloudy: 0.9,
  rain: 0.8,
  thunderstorm: 0.65,
  haze: 0.75,
};

/** Rain scatters a beam — a torch reaches less far in a downpour. */
const WET_BEAM_MULT = 0.8;

/** Sight never drops to nothing: you can always make out your own feet. */
export const MIN_SIGHT = 0.18;

/** Combined light power at which the survivor counts as "lit" for aim. */
export const LIT_THRESHOLD = 0.35;

/** Most light gear can buy — even two lamps leave the street half dark. */
export const MAX_LIGHT_POWER = 0.85;

/** Extra trek encounter chance at full darkness (scaled by how dark it is). */
export const DARK_TREK_ENCOUNTER = 0.32;

/** A lit survivor at night is visible from a long way off. */
export const LIGHT_BEACON_ENCOUNTER = 0.05;

/** How dark the veil past the edge of sight gets at most. */
export const MAX_VEIL_ALPHA = 0.86;

/** Light left after cloud/rain, for the given band. */
export function ambientLight(band: TimeOfDay, weather: WeatherKind): number {
  if (band === 'day') return 1;
  return AMBIENT_LIGHT[band] * (WEATHER_LIGHT[weather] ?? 1);
}

/**
 * Stack light sources: each fills part of the dark the others leave.
 * Two 50% lamps make 75%, not 100%. Capped at `MAX_LIGHT_POWER`.
 */
export function combineLight(powers: readonly number[]): number {
  let dark = 1;
  for (const p of powers) {
    if (p > 0) dark *= 1 - Math.min(1, p);
  }
  return Math.min(MAX_LIGHT_POWER, 1 - dark);
}

/**
 * Share of normal sight right now (MIN_SIGHT..1). Light fills a share of the
 * missing dark; trait mods (Night Owl, Afraid of the Dark) shift it after dark.
 */
export function sightFactor(
  band: TimeOfDay,
  weather: WeatherKind,
  lightPower: number,
  traitMod = 0,
): number {
  const amb = ambientLight(band, weather);
  if (amb >= 1) return 1;
  const wet = weather === 'rain' || weather === 'thunderstorm';
  const beam = Math.max(0, Math.min(MAX_LIGHT_POWER, lightPower)) * (wet ? WET_BEAM_MULT : 1);
  const s = amb + (1 - amb) * beam + traitMod;
  return Math.max(MIN_SIGHT, Math.min(1, s));
}

/**
 * How far the night swarm reads through the dark. Still further than ordinary
 * pockets — you hear a street flood before you see it — but no longer the
 * whole district.
 */
export function swarmSenseRange(baseM: number, sight: number): number {
  return Math.round(baseM * (0.35 + 0.65 * sight));
}

/**
 * Extra trek encounter chance from walking blind. Day = 0. At night a lit
 * survivor also pays a small beacon tax.
 */
export function darkTrekEncounterMod(
  band: TimeOfDay,
  sight: number,
  lightPower: number,
): number {
  if (band === 'day') return 0;
  const dark = 1 - sight;
  const beacon = band === 'night' ? LIGHT_BEACON_ENCOUNTER * Math.min(1, lightPower) : 0;
  return dark * DARK_TREK_ENCOUNTER + beacon;
}

/**
 * Attack-roll delta on top of the base night/dusk penalty that
 * `environmentCombatMods` already applies (−2 night, −1 dusk).
 * Unlit at night: one worse (−3 total). Lit: one better (−1 night, 0 dusk).
 */
export function darkAimDelta(band: TimeOfDay, lightPower: number): number {
  if (band === 'day') return 0;
  if (lightPower >= LIT_THRESHOLD) return 1;
  return band === 'night' ? -1 : 0;
}

/** Opacity of the map veil past the edge of sight. 0 in daylight. */
export function veilAlpha(band: TimeOfDay, sight: number): number {
  if (band === 'day') return 0;
  return Math.min(MAX_VEIL_ALPHA, (1 - sight) * 1.1);
}

/** Coarse read for UI copy. */
export type SightTier = 'clear' | 'dim' | 'dark' | 'pitch';

export function sightTier(sight: number): SightTier {
  if (sight >= 0.95) return 'clear';
  if (sight >= 0.6) return 'dim';
  if (sight >= 0.35) return 'dark';
  return 'pitch';
}

// ---------------------------------------------------------------------------
// Sight radius — how far the survivor can actually see from where they stand.
//
// This is what opens the fog and stands the 3D buildings. It is not the travel
// range (how far today's energy can carry you): a rested survivor can walk
// further than they can see, and an exhausted one can still see down the
// street. Built only from inputs the game already has: Perception and its
// gear/trait/head-wound mods (awareness), the light read above (time of day,
// cloud, torch, Night Owl), and daytime haze or rain.
// ---------------------------------------------------------------------------

/** Clear daylight sight for an average survivor (awareness 5), in metres. */
export const SIGHT_BASE_M = 450;

/** Metres of sight per awareness point away from the average of 5. */
export const SIGHT_PER_AWARENESS_M = 40;

/** Awareness counted as average: no bonus, no penalty. */
export const SIGHT_AWARENESS_BASE = 5;

/**
 * Share of daylight sight kept in total darkness. Darkness cuts the far view
 * more than the near one: you still make out shapes down the block by
 * starlight and the glow of fires, so sight scales as floor + (1 − floor) × light.
 */
export const SIGHT_DARK_FLOOR = 0.35;

/** Never less than the spot you stand on (a trek's lit landing is 90 m). */
export const SIGHT_MIN_M = 90;

/** Even a sharp-eyed survivor on a clear day sees only a few blocks of city. */
export const SIGHT_MAX_M = 700;

/**
 * Daylight haze and rain. After dark the same weather is already in
 * `ambientLight`, so this applies to the day band only.
 */
const DAY_WEATHER_SIGHT: Partial<Record<WeatherKind, number>> = {
  haze: 0.7,
  thunderstorm: 0.75,
  rain: 0.85,
};

export function dayWeatherSight(band: TimeOfDay, weather: WeatherKind): number {
  return band === 'day' ? (DAY_WEATHER_SIGHT[weather] ?? 1) : 1;
}

/**
 * Radius of what the survivor can see, in metres. `sight` is `sightFactor()`;
 * `awarenessValue` already carries Perception, gear, traits and head wounds;
 * `detectMult` is the sharp-eyed trait bonus (`traitDetectRadiusMult`).
 * Fog, 3D buildings, "?" blips and sensed hazard pockets all use this one
 * radius: what you can see is what you know.
 */
export function sightRadius(
  band: TimeOfDay,
  weather: WeatherKind,
  sight: number,
  awarenessValue: number,
  detectMult = 1,
): number {
  const eyes =
    (SIGHT_BASE_M + (awarenessValue - SIGHT_AWARENESS_BASE) * SIGHT_PER_AWARENESS_M) * detectMult;
  const dark = SIGHT_DARK_FLOOR + (1 - SIGHT_DARK_FLOOR) * sight;
  const r = eyes * dayWeatherSight(band, weather) * dark;
  return Math.round(Math.max(SIGHT_MIN_M, Math.min(SIGHT_MAX_M, r)));
}
