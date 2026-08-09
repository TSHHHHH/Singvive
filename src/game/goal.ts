import type { ItemInstance, LocationState } from './types';
import { itemDef } from './loot';
import { haversine } from './overpass';

// ---------- Extraction goal ----------
// The run now has a spine: gather an evac kit, trek to the extraction zone, and
// call for a lift out — before the horde overruns the city.

/** Items that must be in the backpack to call for evac. */
export const EVAC_REQUIREMENTS = ['fuel_can', 'medkit', 'ammo_box'] as const;

/** Score awarded on a successful extraction, on top of the usual run score. */
export const EVAC_SCORE_BONUS = 2000;

// Each evac is a limited-time window (in-game hours). Miss it and a fresh one is
// staged elsewhere — another chance, but the horde keeps rising in the meantime.
export const FIRST_EVAC_WINDOW_HOURS = 48;
export const NEXT_EVAC_WINDOW_HOURS = 36;

/** The first evac must be at least this far from spawn so the run can't end
 *  almost immediately. */
export const MIN_FIRST_EVAC_DIST = 1200; // metres

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
 * The first extraction zone: the farthest location from spawn (a real trek),
 * and never closer than MIN_FIRST_EVAC_DIST. If nothing is that far, the
 * farthest available is used anyway.
 */
export function pickEvacZone(locations: LocationState[]): string | null {
  const faraway = locations.filter((l) => l.distanceFromSpawn >= MIN_FIRST_EVAC_DIST);
  const pool = faraway.length > 0 ? faraway : locations;
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
    if (l.id === excludeId) continue;
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
