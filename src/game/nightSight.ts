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

/** Blip / hazard sensing radius after darkness. */
export function sightLimitedRange(rangeM: number, sight: number): number {
  return Math.round(rangeM * sight);
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
