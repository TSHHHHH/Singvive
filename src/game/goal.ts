import type { ItemInstance, LocationState } from './types';
import type { Rng } from './rng';
import { itemDef } from './loot';
import { haversine } from './overpass';
import { inSingapore } from './singapore';

// ---------- Extraction goal ----------
// The run now has a spine: gather an evac kit, trek to the extraction zone, and
// call for a lift out — before the horde overruns the city.

/** Items that must be in the backpack to call for evac. */
export const EVAC_REQUIREMENTS = ['fuel_can', 'medkit', 'ammo_box'] as const;

/** Score awarded on a successful extraction, on top of the usual run score. */
export const EVAC_SCORE_BONUS = 2000;

// Each evac is a limited-time window (in-game hours). Miss it and a fresh one is
// staged elsewhere — another chance, but the horde keeps rising in the meantime.
// The first window has to be long enough to actually cross the island *and*
// gather the kit; 48 hours was sized for an evac 1.5 km away.
export const FIRST_EVAC_WINDOW_HOURS = 96;
export const NEXT_EVAC_WINDOW_HOURS = 48;

/**
 * The first evac must be at least this far from spawn: the run's spine is a
 * journey across most of the island, not a walk to the next block.
 *
 * This deliberately exceeds the radius the world is built at (`SCAVENGE_RADIUS`,
 * 1.5 km), so the zone cannot be chosen from the starting neighbourhood — it is
 * pulled from the island-wide baked POI set and dropped in as a distant, known
 * objective. Picking "the farthest of what happens to exist nearby" was the old
 * behaviour, and it is why the first evac was always a short stroll.
 */
export const MIN_FIRST_EVAC_DIST = 8000; // metres

/** How wide to sweep the baked set looking for a far-off staging point. */
export const EVAC_ISLAND_RADIUS = 30000; // metres — comfortably the whole island

/**
 * A missed window doesn't hand you the next one instantly. Command needs time
 * to stage another bird, and that dead air is the run's real punishment for
 * missing: the horde keeps climbing while you have nowhere to be.
 */
export const EVAC_COOLDOWN_MIN_HOURS = 10;
export const EVAC_COOLDOWN_MAX_HOURS = 30;

export interface EvacItemStatus {
  id: string;
  name: string;
  have: boolean;
}

/** The evac checklist with each requirement's carried/not-carried status. */
export function evacChecklist(items: ItemInstance[]): EvacItemStatus[] {
  return EVAC_REQUIREMENTS.map((id) => ({
    id,
    name: itemDef(id).name,
    have: items.some((i) => i.container === 'backpack' && i.defId === id),
  }));
}

export function hasEvacKit(items: ItemInstance[]): boolean {
  return evacChecklist(items).every((r) => r.have);
}

/**
 * Choose the first extraction zone out of an island-wide POI set.
 *
 * Not simply "the farthest point", which would put every run's evac on the same
 * corner of the island relative to spawn and make the objective predictable.
 * Instead: everything past `MIN_FIRST_EVAC_DIST` is a candidate, and one is
 * drawn from the far half of that pool — always a long haul, never the same
 * haul twice.
 *
 * Returns null when nothing is far enough — a spawn near the edge of the baked
 * data, or no bake at all — and the caller falls back to `pickEvacZone`.
 */
export function pickDistantEvacPoi<
  T extends { name?: string; lat: number; lng: number; category?: string },
>(pois: T[], spawn: { lat: number; lng: number }, rng: Rng): T | null {
  const scored = pois
    // A chopper does not stage at a drain culvert or a bus stop.
    .filter((p) => p.category !== 'waypoint')
    // The bake carries a few stub entries whose name is a single letter. As the
    // run's headline objective, "Reach A Station" reads as a bug.
    .filter((p) => (p.name ?? '').trim().length >= 3)
    // The island sweep is wide enough to reach Johor. A lift out of Singapore
    // does not stage in another country.
    .filter((p) => inSingapore(p.lat, p.lng))
    .map((p) => ({ poi: p, d: haversine(spawn.lat, spawn.lng, p.lat, p.lng) }))
    .filter((s) => s.d >= MIN_FIRST_EVAC_DIST)
    .sort((a, b) => b.d - a.d);
  if (scored.length === 0) return null;

  // Tiers, best first. A station is ideal: the tunnels are the island's
  // cross-country transit, so an evac on the network is a place the player can
  // actually plan a route to. Schools and police posts were the designated
  // shelters when it fell, which is why anyone would stage a lift there. Only
  // if the map offers neither does it fall back to whatever is out there —
  // "muster at the void deck" is a last resort, not the usual case.
  for (const tier of [['mrt'], ['school', 'police']]) {
    const pool = scored.filter((s) => s.poi.category && tier.includes(s.poi.category));
    if (pool.length > 0) return drawFromFarHalf(pool, rng);
  }
  return drawFromFarHalf(scored, rng);
}

/** Draw from the farther half of a distance-sorted pool — always a long haul,
 *  never the same haul twice. */
function drawFromFarHalf<T>(sorted: { poi: T; d: number }[], rng: Rng): T {
  const farHalf = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  return farHalf[rng.int(0, farHalf.length - 1)].poi;
}

/** A randomised gap before command can stage the next bird. */
export function rollEvacCooldown(rng: Rng): number {
  return rng.int(EVAC_COOLDOWN_MIN_HOURS, EVAC_COOLDOWN_MAX_HOURS);
}

/**
 * Fallback extraction zone, used only when no island-wide candidate exists: the
 * farthest location from spawn, and never closer than MIN_FIRST_EVAC_DIST. If
 * nothing is that far, the farthest available is used anyway.
 */
export function pickEvacZone(locations: LocationState[]): string | null {
  // Synthetic waypoints are connective tissue, not places — a chopper doesn't
  // stage at a drain culvert.
  const real = locations.filter((l) => l.category !== 'waypoint');
  const faraway = real.filter((l) => l.distanceFromSpawn >= MIN_FIRST_EVAC_DIST);
  const pool = faraway.length > 0 ? faraway : real;
  let best: LocationState | null = null;
  for (const l of pool) {
    if (!best || l.distanceFromSpawn > best.distanceFromSpawn) best = l;
  }
  return best?.id ?? null;
}

/**
 * A refreshed extraction zone after a missed window: the location farthest from
 * where the player is *now* (excluding the old zone), forcing a fresh journey.
 */
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
// A city-wide horde level that climbs every day, globally raising danger. Hit
// 100 and the streets are overrun — the run ends whether you escaped or not.

export const HORDE_MAX = 100;
export const HORDE_PER_DAY = 8; // ~12–13 days before the city is lost

/** 0..1 intensity, used to scale encounter danger. */
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
