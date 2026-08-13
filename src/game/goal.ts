import type { ItemEffect, ItemInstance, LocationState } from './types';
import type { Rng } from './rng';
import { itemDef } from './loot';
import { conditionScale } from './inventory';
import { haversine } from './overpass';
import { inSingapore } from './singapore';

// ---------- Extraction goal ----------
// Dual-path spine: linger for a rising score multiplier, or gather weighted
// evac readiness and call for a lift. Best board score = long survival + late
// successful extract. No hard item IDs — fuel / meds / ammo count more.

/** Base extract bonus before the day multiplier. */
export const EVAC_SCORE_BONUS = 2000;

/** Day-1 weighted readiness needed to call for a lift. */
export const EVAC_BASE_VALUE = 80;
/** Extra weighted value required per day after day 1. */
export const EVAC_VALUE_PER_DAY = 12;

// Each evac is a limited-time window (in-game hours). Miss it and a fresh one is
// staged elsewhere — another chance, but the horde keeps rising in the meantime.
export const FIRST_EVAC_WINDOW_HOURS = 96;
export const NEXT_EVAC_WINDOW_HOURS = 48;

/**
 * The first evac must be at least this far from spawn: the run's spine is a
 * journey across most of the island, not a walk to the next block.
 */
export const MIN_FIRST_EVAC_DIST = 8000; // metres

/** How wide to sweep the baked set looking for a far-off staging point. */
export const EVAC_ISLAND_RADIUS = 30000; // metres — comfortably the whole island

export const EVAC_COOLDOWN_MIN_HOURS = 10;
export const EVAC_COOLDOWN_MAX_HOURS = 30;

/** How much a backpack item counts toward extraction readiness. */
export function evacWeightMult(effect: ItemEffect): number {
  switch (effect.kind) {
    case 'fuel':
      return 3;
    case 'heal':
    case 'cure':
      return 2.5;
    case 'ammo':
      return 2.5;
    case 'weapon':
      return effect.ranged ? 1.6 : 1;
    case 'energy':
      return 0.75;
    case 'food':
    case 'water':
      return 0.5;
    case 'misc':
      return 1;
  }
}

/** Weighted readiness of items currently in the backpack. */
export function backpackEvacValue(items: ItemInstance[]): number {
  let total = 0;
  for (const inst of items) {
    if (inst.container !== 'backpack') continue;
    const def = itemDef(inst.defId);
    total += def.value * conditionScale(inst) * inst.stack * evacWeightMult(def.effect);
  }
  return Math.round(total);
}

/** Rising threshold — the city gets harder to leave as days climb. */
export function requiredEvacValue(day: number): number {
  return Math.round(EVAC_BASE_VALUE + Math.max(0, day - 1) * EVAC_VALUE_PER_DAY);
}

export function hasEvacReadiness(items: ItemInstance[], day: number): boolean {
  return backpackEvacValue(items) >= requiredEvacValue(day);
}

/** @deprecated alias — prefer hasEvacReadiness */
export function hasEvacKit(items: ItemInstance[], day = 1): boolean {
  return hasEvacReadiness(items, day);
}

export interface EvacReadiness {
  current: number;
  required: number;
  ready: boolean;
  /** 0..1 fill for UI gauges. */
  ratio: number;
}

export function evacReadiness(items: ItemInstance[], day: number): EvacReadiness {
  const current = backpackEvacValue(items);
  const required = requiredEvacValue(day);
  return {
    current,
    required,
    ready: current >= required,
    ratio: required > 0 ? Math.min(1, current / required) : 1,
  };
}

/**
 * Window length shrinks as the city frays — first lift stays generous, later
 * birds give you less time on station.
 */
export function evacWindowHours(isFirst: boolean, day: number): number {
  const base = isFirst ? FIRST_EVAC_WINDOW_HOURS : NEXT_EVAC_WINDOW_HOURS;
  const shrink = Math.max(0, day - 3) * 4;
  const floor = isFirst ? 36 : 18;
  return Math.max(floor, base - shrink);
}

/**
 * Choose the first extraction zone out of an island-wide POI set.
 */
export function pickDistantEvacPoi<
  T extends { name?: string; lat: number; lng: number; category?: string },
>(pois: T[], spawn: { lat: number; lng: number }, rng: Rng): T | null {
  const scored = pois
    .filter((p) => p.category !== 'waypoint')
    .filter((p) => (p.name ?? '').trim().length >= 3)
    .filter((p) => inSingapore(p.lat, p.lng))
    .map((p) => ({ poi: p, d: haversine(spawn.lat, spawn.lng, p.lat, p.lng) }))
    .filter((s) => s.d >= MIN_FIRST_EVAC_DIST)
    .sort((a, b) => b.d - a.d);
  if (scored.length === 0) return null;

  for (const tier of [['mrt'], ['school', 'police']]) {
    const pool = scored.filter((s) => s.poi.category && tier.includes(s.poi.category));
    if (pool.length > 0) return drawFromFarHalf(pool, rng);
  }
  return drawFromFarHalf(scored, rng);
}

function drawFromFarHalf<T>(sorted: { poi: T; d: number }[], rng: Rng): T {
  const farHalf = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  return farHalf[rng.int(0, farHalf.length - 1)].poi;
}

export function rollEvacCooldown(rng: Rng): number {
  return rng.int(EVAC_COOLDOWN_MIN_HOURS, EVAC_COOLDOWN_MAX_HOURS);
}

export function pickEvacZone(locations: LocationState[]): string | null {
  const real = locations.filter((l) => l.category !== 'waypoint');
  const faraway = real.filter((l) => l.distanceFromSpawn >= MIN_FIRST_EVAC_DIST);
  const pool = faraway.length > 0 ? faraway : real;
  let best: LocationState | null = null;
  for (const l of pool) {
    if (!best || l.distanceFromSpawn > best.distanceFromSpawn) best = l;
  }
  return best?.id ?? null;
}

export function pickNextEvacZone(
  locations: LocationState[],
  fromLat: number,
  fromLng: number,
  excludeId: string | null,
): string | null {
  let best: LocationState | null = null;
  let bestD = -1;
  for (const l of locations) {
    if (l.id === excludeId || l.category === 'waypoint') continue;
    const d = haversine(fromLat, fromLng, l.lat, l.lng);
    if (d > bestD) {
      bestD = d;
      best = l;
    }
  }
  return best?.id ?? excludeId;
}

// ---------- Doom clock (horde) ----------

export const HORDE_MAX = 100;
export const HORDE_PER_DAY = 8; // ~12–13 days before the city is lost

export function hordeIntensity(hordeLevel: number): number {
  return Math.min(1, hordeLevel / HORDE_MAX);
}

export function hordeLabel(hordeLevel: number): string {
  if (hordeLevel >= HORDE_MAX) return 'Overrun';
  if (hordeLevel >= 75) return 'Swarming';
  if (hordeLevel >= 50) return 'Massing';
  if (hordeLevel >= 25) return 'Restless';
  return 'Stirring';
}
