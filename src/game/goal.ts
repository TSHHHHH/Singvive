import type { ItemEffect, LocationState } from './types';
import { Rng } from './rng';
import { haversine } from './overpass';
import { isWalkable } from './playable';
import { pathCrossesUnplayable, routeLandPath } from './route';

// Known operation windows. Cargo supports the journey, never admission.

/** Base extract bonus before the day multiplier. */
export const EVAC_SCORE_BONUS = 2000;

// Each evac is a limited-time window (in-game hours). Miss it and a fresh one is
// staged elsewhere — another chance, while supplies and shelter still matter.
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

/** Legacy DEV recipe comparison only; never used for evacuation admission. */
export function evacWeightMult(effect: ItemEffect): number {
  switch (effect.kind) {
    case 'fuel':
      return 3;
    case 'heal':
    case 'cure':
      return 2.5;
    case 'ammo':
      return 2.5;
    case 'magazine':
      return 2.5;
    case 'weapon':
      return effect.ranged ? 0.7 : 0.45;
    case 'energy':
      return 0.5;
    case 'water':
      return 0.75;
    case 'food':
      return 0.4;
    case 'misc':
      return 0.35;
    case 'intel':
      return 0;
    case 'skillBook':
      return 0.25;
  }
}

/**
 * Window length shrinks as the city frays — first lift stays generous, later
 * birds give you less time on station.
 */
export function evacWindowHours(isFirst: boolean, day: number, routeLengthM = 0): number {
  const base = isFirst ? FIRST_EVAC_WINDOW_HOURS : NEXT_EVAC_WINDOW_HOURS;
  const shrink = Math.max(0, day - 3) * 4;
  const floor = isFirst ? 36 : 18;
  // Three hours per routed kilometre plus a day's reserve covers walking,
  // sleep and resupply. The late-run curve must not undercut a long approach.
  return Math.max(floor, base - shrink, Math.ceil(routeLengthM / 1000) * 3 + 24);
}

/**
 * Choose the first extraction zone out of an evac-eligible POI set
 * (`bakedEvacPois` — not a 30 km scan of the whole island bake).
 */
export function pickDistantEvacPoi<
  T extends { name?: string; lat: number; lng: number; category?: string },
>(pois: T[], spawn: { lat: number; lng: number }, rng: Rng): T | null {
  const scored = pois
    .filter((p) => p.category !== 'waypoint')
    .filter((p) => (p.name ?? '').trim().length >= 3)
    .filter((p) => isWalkable(p.lat, p.lng))
    .map((p) => ({ poi: p, d: haversine(spawn.lat, spawn.lng, p.lat, p.lng) }))
    .filter((s) => s.d >= MIN_FIRST_EVAC_DIST)
    .sort((a, b) => b.d - a.d);
  if (scored.length === 0) return null;

  const ordered: T[] = [];
  for (const tier of [['mrt'], ['school', 'police'], null]) {
    const pool = scored.filter(({ poi }) => tier
      ? !!poi.category && tier.includes(poi.category)
      : !['mrt', 'school', 'police'].includes(poi.category ?? ''));
    if (!pool.length) continue;
    const offset = rng.int(0, Math.ceil(pool.length / 2) - 1);
    ordered.push(...pool.slice(offset).map(({ poi }) => poi), ...pool.slice(0, offset).map(({ poi }) => poi));
  }
  // If every chord fails, try the shortest eligible detour first (still at
  // least 8 km). Long island approaches otherwise dominate startup latency.
  // There is one shared A* budget across tiers.
  return pickReachable(ordered, spawn, [
    scored[scored.length - 1].poi, scored[Math.floor(scored.length / 2)].poi, ordered[0],
  ]);
}

function pickReachable<T extends { lat: number; lng: number }>(
  candidates: T[], from: { lat: number; lng: number },
  detours = [candidates[0], candidates[Math.floor(candidates.length / 2)], candidates[candidates.length - 1]],
): T | null {
  // Scan every candidate cheaply before running any A*. A valid middle
  // destination must not disappear because both distance extremes are islands.
  for (const poi of candidates) {
    const distance = haversine(from.lat, from.lng, poi.lat, poi.lng);
    // Reject a shoreline crossing near the origin before sampling a long
    // mainland chord. This keeps the full scan cheap for island starts too.
    if ([350, 700, 1400].some((metres) => {
      if (metres >= distance) return false;
      const t = metres / distance;
      return !isWalkable(from.lat + (poi.lat - from.lat) * t, from.lng + (poi.lng - from.lng) * t);
    })) continue;
    if (!pathCrossesUnplayable(from, poi)) return poi;
  }
  // At most three deterministic A* searches, rather than 24 on the main thread.
  for (const poi of new Set(detours)) {
    if (!poi) continue;
    if (routeLandPath(from, poi, { deterministic: true })) return poi;
  }
  return null;
}

export function rollEvacCooldown(rng: Rng): number {
  return rng.int(EVAC_COOLDOWN_MIN_HOURS, EVAC_COOLDOWN_MAX_HOURS);
}

export function pickNextEvacZone(
  locations: LocationState[],
  fromLat: number,
  fromLng: number,
  excludeId: string | null,
): string | null {
  const from = { lat: fromLat, lng: fromLng };
  const candidates = locations.filter((l) => l.id !== excludeId && l.category !== 'waypoint')
    .map((poi) => ({ poi, d: haversine(fromLat, fromLng, poi.lat, poi.lng) }))
    .sort((a, b) => b.d - a.d)
    .map(({ poi }) => poi);
  return pickReachable(candidates, from)?.id ?? null;
}

/** Old v7 cargo fields are deliberately not admission or contact state. */
export function restoreEvacuation(saved: {
  day: number; hour: number; locations: Record<string, LocationState>;
  evacZoneId?: string | null; evacDeadline?: number | null;
  evacCooldownUntil?: number | null; evacContacted?: boolean;
}) {
  const now = (saved.day - 1) * 24 + saved.hour;
  const cooling = typeof saved.evacCooldownUntil === 'number' && Number.isFinite(saved.evacCooldownUntil);
  const id = saved.evacZoneId && saved.locations[saved.evacZoneId] ? saved.evacZoneId : null;
  if (cooling || !id) return {
    evacZoneId: null, evacDeadline: null,
    evacCooldownUntil: cooling ? saved.evacCooldownUntil! : now,
    evacContacted: false,
  };
  return { evacZoneId: id,
    evacDeadline: typeof saved.evacDeadline === 'number' && Number.isFinite(saved.evacDeadline)
      ? saved.evacDeadline : now + evacWindowHours(true, saved.day),
    evacCooldownUntil: null, evacContacted: saved.evacContacted === true };
}
