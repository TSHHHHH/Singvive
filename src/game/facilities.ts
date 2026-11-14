import type { LocationState } from './types';
import { Rng } from './rng';
import { rollWeather } from './weather';

export type FacilityCraft = 'fire' | 'stove' | 'stove_fuel' | 'rain_collector' | 'rain_shelter' | 'hot_water';
export interface SiteFacilities {
  fireUntil?: number;
  stove?: boolean;
  stoveUntil?: number;
  rainShelter?: boolean;
  collector?: { checkedAt: number; water: number };
  water?: { amount: number; hotUntil: number };
}
export const FIRE_HOURS = 24;
export const HOT_WATER_HOURS = 2;
export const COLLECTOR_CAPACITY = 4;
export const gameHour = (day: number, hour: number): number => (day - 1) * 24 + hour;

export function heatRemaining(site: SiteFacilities | undefined, now: number): number {
  return Math.max(0, Math.max(site?.fireUntil ?? 0, site?.stoveUntil ?? 0) - now);
}

/** Lazy catch-up touches only the collector being inspected, never the island. */
export function collectedRain(site: SiteFacilities | undefined, now: number, seed: string): number {
  if (!site?.collector) return 0;
  let water = site.collector.water;
  let cursor = site.collector.checkedAt;
  const rng = new Rng(seed);
  while (cursor < now && water < COLLECTOR_CAPACITY) {
    const day = Math.floor(cursor / 24) + 1;
    const end = Math.min(now, day * 24);
    const weather = rollWeather(rng, day);
    if (weather === 'rain' || weather === 'thunderstorm') water += (end - cursor) / 3;
    cursor = end;
  }
  return Math.min(COLLECTOR_CAPACITY, water);
}

export function buildFacility(site: SiteFacilities | undefined, kind: FacilityCraft, now: number, count: number): SiteFacilities {
  const next = { ...site };
  switch (kind) {
    case 'fire': next.fireUntil = now + FIRE_HOURS; break;
    case 'stove': next.stove = true; break;
    case 'stove_fuel': next.stoveUntil = now + FIRE_HOURS; break;
    case 'rain_shelter': next.rainShelter = true; break;
    case 'rain_collector': next.collector = { checkedAt: now, water: 0 }; break;
    case 'hot_water': next.water = { amount: count, hotUntil: now + HOT_WATER_HOURS }; break;
  }
  return next;
}

export function surfaceSite(state: {
  currentPositionId: string | null; locations: Record<string, LocationState>;
  hdb: unknown; tunnel: unknown;
}): LocationState | undefined {
  return !state.hdb && !state.tunnel && state.currentPositionId
    ? state.locations[state.currentPositionId] : undefined;
}
