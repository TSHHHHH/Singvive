import type { Attributes, PoiCategory, WeatherKind } from './types';
import { POI_CONFIG } from './poi';
import { timeOfDay, weatherTravelMult } from './weather';
import { HOURS_PER_DAY, travelSpeedMultiplier } from './survival';

// Cautious on-foot pace through a ruined city.
const BASE_SPEED_M_PER_MIN = 72; // ~4.3 km/h
export const ENCUMBERED_TRAVEL_MULT = 1.5;
export const MRT_TIME_FACTOR = 0.3; // subterranean shortcut: −70%

// Straight-line distance badly understates a real trek through a collapsed city
// — blocked roads, rubble, detours around the dead. Stretch overland travel time
// to fit the theme (applied to time only, not the planning range or loot).
export const URBAN_DECAY_DETOUR = 1.4;

/**
 * Walking speed in metres/minute, shaped by the survivor's build and how
 * exhausted they are. Endurance matters most; dexterity helps you pick a line;
 * energy scales the pace continuously (0.7x spent .. 1.3x fresh).
 */
export function walkSpeed(attrs: Attributes, energy: number, legFactor = 1): number {
  const statFactor = 1 + (attrs.endurance - 5) * 0.06 + (attrs.dexterity - 5) * 0.03;
  return BASE_SPEED_M_PER_MIN * statFactor * travelSpeedMultiplier(energy) * legFactor;
}

/** Minutes to search a place, driven by how much there is to pick through. */
export function searchMinutes(category: PoiCategory): number {
  return 12 + POI_CONFIG[category].richness * 6;
}

export interface TravelEstimate {
  travelMin: number; // one-way, relocation (nomadic)
  searchMin: number;
  totalMin: number;
  totalHours: number;
  arrivalHour: number; // clock hour you'd reach the site
  doneHour: number; // clock hour you'd finish searching
  arrivalAtNight: boolean;
  doneAtNight: boolean;
  encumbered: boolean;
  weatherSlowed: boolean;
}

/**
 * One-way relocation estimate: travel from the current position to a target
 * `distanceM` away, then search it. Weather and encumbrance stretch travel time
 * (but never the search itself, and never the loot yield).
 */
export function estimateExpedition(
  distanceM: number,
  category: PoiCategory,
  attrs: Attributes,
  energy: number,
  currentHour: number,
  weather: WeatherKind,
  encumbered: boolean,
  legFactor = 1,
): TravelEstimate {
  const speed = walkSpeed(attrs, energy, legFactor);
  const wMult = weatherTravelMult(weather);
  const eMult = encumbered ? ENCUMBERED_TRAVEL_MULT : 1;
  const travelMin = Math.round((distanceM / speed) * wMult * eMult * URBAN_DECAY_DETOUR);
  const searchMin = searchMinutes(category);
  const totalMin = travelMin + searchMin;
  const arrivalHour = (currentHour + travelMin / 60) % HOURS_PER_DAY;
  const doneHour = (currentHour + totalMin / 60) % HOURS_PER_DAY;
  return {
    travelMin,
    searchMin,
    totalMin,
    totalHours: totalMin / 60,
    arrivalHour,
    doneHour,
    arrivalAtNight: timeOfDay(arrivalHour) !== 'day',
    doneAtNight: timeOfDay(doneHour) !== 'day',
    encumbered,
    weatherSlowed: wMult > 1,
  };
}

/** Subterranean MRT hop between two stations: −70% time, ignores weather/encumbrance. */
export function estimateMrtTravel(
  distanceM: number,
  attrs: Attributes,
  energy: number,
  currentHour: number,
  legFactor = 1,
): { travelMin: number; totalHours: number; arrivalHour: number } {
  const speed = walkSpeed(attrs, energy, legFactor);
  const travelMin = Math.max(2, Math.round((distanceM / speed) * MRT_TIME_FACTOR));
  return {
    travelMin,
    totalHours: travelMin / 60,
    arrivalHour: (currentHour + travelMin / 60) % HOURS_PER_DAY,
  };
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
