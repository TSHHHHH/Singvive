import { haversine } from './overpass';

/**
 * A disturbance is noise that has already done its damage: one loud thing
 * happened here, and for a few hours everything within earshot is awake.
 *
 * It is deliberately not a meter. A zone has a centre, a radius, a flat danger
 * bonus and an end time, and nothing about it changes until it ends. Zones
 * never stack: a site inside several takes only the strongest, so ten shots
 * are no worse than one — the street is either stirred up or it isn't.
 *
 * The bonus is added to a site's danger, so every roll that reads danger (the
 * search ambush, the doorway scene, the fight that follows) feels it without a
 * second pathway.
 */
export type DisturbanceKind =
  /** Your own pistol or rifle. */
  | 'gunshot'
  /** Your own shotgun. */
  | 'shotgun'
  /** A car alarm somebody wired up and walked away from. */
  | 'car_alarm'
  /** Somebody else's gunfight a few streets over. */
  | 'gunfire'
  /** A loose shutter banging in the wind. */
  | 'shutter'
  /** A loud choice in an encounter: the door you smashed, the shot you fired. */
  | 'loud'
  /** An encounter that went wrong noisily. */
  | 'botched'
  /** A flat door forced inside an HDB block. */
  | 'door'
  /** A barricade broken through inside an HDB block. */
  | 'barricade';

export interface Disturbance {
  id: string;
  kind: DisturbanceKind;
  lat: number;
  lng: number;
  radiusM: number;
  /** Flat danger points added to every site inside the ring. */
  danger: number;
  /** Absolute game hours. */
  createdAt: number;
  expiresAt: number;
}

export interface DisturbanceSpec {
  radiusM: number;
  danger: number;
  hours: number;
}

/** Daytime, dry-weather size of each kind of zone. */
export const DISTURBANCE_SPEC: Record<DisturbanceKind, DisturbanceSpec> = {
  car_alarm: { radiusM: 450, danger: 2.5, hours: 3 },
  gunfire: { radiusM: 600, danger: 1.5, hours: 2 },
  shutter: { radiusM: 250, danger: 1, hours: 2 },
  gunshot: { radiusM: 300, danger: 1.5, hours: 2 },
  shotgun: { radiusM: 400, danger: 2, hours: 2 },
  loud: { radiusM: 250, danger: 1.5, hours: 2 },
  botched: { radiusM: 150, danger: 1, hours: 1.5 },
  door: { radiusM: 220, danger: 1, hours: 2 },
  barricade: { radiusM: 320, danger: 2, hours: 2 },
};

export const DISTURBANCE_KINDS = Object.keys(DISTURBANCE_SPEC) as DisturbanceKind[];

/** Dark streets stay on edge longer. */
export const NIGHT_HOURS_MULT = 1.5;
/** Rain swallows sound: zones are smaller in the wet. */
export const WET_RADIUS_MULT = 0.7;
/** Two zones of the same kind this close together are the same disturbance. */
export const SAME_ZONE_M = 80;
const MAX_ZONES = 24;
const MAX_HOURS = 12;
const MAX_GAME_HOUR = 10_000_000;

export function disturbanceSpec(
  kind: DisturbanceKind,
  when: { night?: boolean; wet?: boolean } = {},
): DisturbanceSpec {
  const base = DISTURBANCE_SPEC[kind];
  return {
    radiusM: Math.round(base.radiusM * (when.wet ? WET_RADIUS_MULT : 1)),
    danger: base.danger,
    hours: base.hours * (when.night ? NIGHT_HOURS_MULT : 1),
  };
}

export function liveDisturbances(zones: readonly Disturbance[], now: number): Disturbance[] {
  return zones.filter((z) => z.createdAt <= now && z.expiresAt > now);
}

/** Drop finished zones, keeping the same array when nothing ended. */
export function pruneDisturbances(zones: Disturbance[], now: number): Disturbance[] {
  const live = zones.filter((z) => z.expiresAt > now);
  return live.length === zones.length ? zones : live;
}

/**
 * Add a zone. A live zone of the same kind on the same spot is refreshed rather
 * than duplicated — a gunfight is one disturbance, not one per trigger pull.
 */
export function addDisturbance(
  zones: Disturbance[],
  zone: Disturbance,
  now: number,
): { zones: Disturbance[]; created: boolean; zone: Disturbance } {
  const live = pruneDisturbances(zones, now);
  const same = live.find((z) => z.kind === zone.kind
    && haversine(z.lat, z.lng, zone.lat, zone.lng) <= SAME_ZONE_M);
  if (same) {
    const merged: Disturbance = {
      ...same,
      radiusM: Math.max(same.radiusM, zone.radiusM),
      danger: Math.max(same.danger, zone.danger),
      expiresAt: Math.max(same.expiresAt, zone.expiresAt),
    };
    return { zones: live.map((z) => (z === same ? merged : z)), created: false, zone: merged };
  }
  return { zones: [...live, zone].slice(-MAX_ZONES), created: true, zone };
}

/** The strongest zone covering a point, or null. Never a sum. */
export function disturbanceAt(
  zones: readonly Disturbance[],
  lat: number,
  lng: number,
  now: number,
): Disturbance | null {
  let best: Disturbance | null = null;
  for (const z of zones) {
    if (z.createdAt > now || z.expiresAt <= now) continue;
    if (haversine(z.lat, z.lng, lat, lng) > z.radiusM) continue;
    if (!best || z.danger > best.danger || (z.danger === best.danger && z.expiresAt > best.expiresAt)) best = z;
  }
  return best;
}

/** Danger points a point picks up from disturbances right now. */
export function disturbanceBonus(
  zones: readonly Disturbance[],
  lat: number,
  lng: number,
  now: number,
): number {
  return disturbanceAt(zones, lat, lng, now)?.danger ?? 0;
}

/** End one zone early — the alarm pulled, the shutter wedged. */
export function quietDisturbance(zones: Disturbance[], id: string): Disturbance[] {
  const next = zones.filter((z) => z.id !== id);
  return next.length === zones.length ? zones : next;
}

/** Whole hours left on a zone, rounded up, for labels. */
export function hoursLeft(zone: Disturbance, now: number): number {
  return Math.max(0, Math.ceil((zone.expiresAt - now) * 2) / 2);
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Untrusted saves never become unbounded danger. */
export function normalizeDisturbances(value: unknown, now: number): Disturbance[] {
  if (!Array.isArray(value) || !finite(now, 0, MAX_GAME_HOUR)) return [];
  const out: Disturbance[] = [];
  const seen = new Set<string>();
  for (const raw of value.slice(0, 64)) {
    if (!raw || typeof raw !== 'object') continue;
    const z = raw as Record<string, unknown>;
    if (typeof z.id !== 'string' || z.id.length === 0 || z.id.length > 96 || seen.has(z.id)) continue;
    if (typeof z.kind !== 'string' || !(z.kind in DISTURBANCE_SPEC)) continue;
    if (!finite(z.lat, -90, 90) || !finite(z.lng, -180, 180)) continue;
    if (!finite(z.radiusM, 1, 2000) || !finite(z.danger, 0, 5)) continue;
    if (!finite(z.createdAt, 0, MAX_GAME_HOUR) || !finite(z.expiresAt, 0, MAX_GAME_HOUR)) continue;
    if (z.createdAt > now || z.expiresAt <= now || z.expiresAt - z.createdAt > MAX_HOURS) continue;
    seen.add(z.id);
    out.push({
      id: z.id, kind: z.kind as DisturbanceKind, lat: z.lat, lng: z.lng,
      radiusM: z.radiusM, danger: z.danger, createdAt: z.createdAt, expiresAt: z.expiresAt,
    });
  }
  return out.slice(-MAX_ZONES);
}
