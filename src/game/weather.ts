import type { IconName } from '../icons/keys';
import type { WeatherKind, WeatherState, TimeOfDay } from './types';
import type { Rng } from './rng';

const WEATHER_MIX: [WeatherKind, number][] = [
  ['clear', 5],
  ['cloudy', 4],
  ['rain', 3],
  ['haze', 2],
  ['heat', 2],
  ['thunderstorm', 1],
];

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: 'Clear',
  cloudy: 'Overcast',
  rain: 'Rain',
  thunderstorm: 'Thunderstorm',
  haze: 'Haze',
  heat: 'Heat Wave',
};

export const WEATHER_ICON: Record<WeatherKind, IconName> = {
  clear: 'weather.clear',
  cloudy: 'weather.cloudy',
  rain: 'weather.rain',
  thunderstorm: 'weather.thunderstorm',
  haze: 'weather.haze',
  heat: 'weather.heat',
};

export const TIME_LABEL: Record<TimeOfDay, string> = {
  day: 'Day',
  dusk: 'Dusk',
  night: 'Night',
};

/** Weather rolled per day. Deterministic given seed + day. */
export function rollWeather(rng: Rng, day: number): WeatherKind {
  return rng.fork(`weather:${day}`).weighted(WEATHER_MIX);
}

/**
 * Multiplier applied to surface travel time. Heavy rain and storms slow you
 * down; the subterranean MRT bypasses this entirely.
 */
export function weatherTravelMult(kind: WeatherKind): number {
  if (kind === 'rain') return 1.5;
  if (kind === 'thunderstorm') return 1.75;
  // A heat wave doesn't block the way, it just makes you stop in every patch of
  // shade — a smaller tax than rain, paid in time as well as in water.
  if (kind === 'heat') return 1.2;
  return 1;
}

/**
 * Multiplier on passive thirst and energy drain. This is the heat wave's real
 * bite: the clock costs you water roughly twice as fast, so a long trek without
 * a drink in the pack is what actually kills you.
 */
export function weatherThirstMult(kind: WeatherKind): number {
  return kind === 'heat' ? 1.9 : 1;
}

export function weatherEnergyMult(kind: WeatherKind): number {
  return kind === 'heat' ? 1.25 : 1;
}

/**
 * Additive shift to encounter chance from weather. A thunderstorm keeps most
 * of the dead sheltering, lowering the odds of running into something.
 */
export function weatherEncounterMod(kind: WeatherKind): number {
  if (kind === 'thunderstorm') return -0.2;
  return 0;
}

/** Human-readable buff/debuff lines for a weather kind (for UI tooltips). */
export function weatherEffects(kind: WeatherKind): { label: string; good: boolean }[] {
  const out: { label: string; good: boolean }[] = [];
  const t = weatherTravelMult(kind);
  if (t > 1) out.push({ label: `Travel ${Math.round((t - 1) * 100)}% slower`, good: false });
  const e = weatherEncounterMod(kind);
  if (e < 0) out.push({ label: `Encounters ${Math.round(-e * 100)}% less likely`, good: true });
  const th = weatherThirstMult(kind);
  if (th > 1) out.push({ label: `Thirst ${Math.round((th - 1) * 100)}% faster`, good: false });
  const en = weatherEnergyMult(kind);
  if (en > 1) out.push({ label: `Energy ${Math.round((en - 1) * 100)}% faster`, good: false });
  const acc =
    kind === 'thunderstorm' ? -2 : kind === 'rain' || kind === 'haze' || kind === 'heat' ? -1 : 0;
  if (acc < 0) out.push({ label: `Aim ${acc} in combat`, good: false });
  if (kind === 'thunderstorm') out.push({ label: 'Zombies +1 attack', good: false });
  if (out.length === 0) out.push({ label: 'No effects', good: true });
  return out;
}

/** Time-of-day band from a 0..24 clock hour. */
export function timeOfDay(hour: number): TimeOfDay {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

/**
 * Combat modifiers from the environment.
 * Returns adjustments applied to the ZOMBIE (positive = zombies stronger).
 * Night and storms favour the dead; clear daylight favours the survivor.
 */
export function environmentCombatMods(weather: WeatherState): {
  zombieAttack: number;
  playerAccuracy: number;
  note: string;
} {
  let zombieAttack = 0;
  let playerAccuracy = 0;
  const notes: string[] = [];

  if (weather.time === 'night') {
    zombieAttack += 2;
    playerAccuracy -= 2;
    notes.push('darkness');
  } else if (weather.time === 'dusk') {
    zombieAttack += 1;
    playerAccuracy -= 1;
    notes.push('low light');
  }

  if (weather.kind === 'rain') {
    playerAccuracy -= 1;
    notes.push('rain');
  } else if (weather.kind === 'thunderstorm') {
    zombieAttack += 1;
    playerAccuracy -= 2;
    notes.push('storm');
  } else if (weather.kind === 'haze') {
    playerAccuracy -= 1;
    notes.push('haze');
  } else if (weather.kind === 'heat' && weather.time === 'day') {
    // Sweat in your eyes and glare off the concrete; after dark the heat is
    // just uncomfortable, not blinding.
    playerAccuracy -= 1;
    notes.push('heat');
  }

  return { zombieAttack, playerAccuracy, note: notes.join(', ') };
}
