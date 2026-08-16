import type { TimeOfDay } from './types';
import { Rng } from './rng';
import { haversine } from './overpass';

// ---------------------------------------------------------------------------
// The wilds — the ground *between* the pins.
//
// POIs are the places worth going. Everything else is street: overgrown car
// parks, canal banks, expressway shoulders, industrial back lots. You can walk
// out into any of it, which means a sparse map can never cage you. What it
// can't be is free — open ground gives no loot, no stash, no roof, and the
// island's bad pockets sit out there waiting.
//
// Hazard zones are a deterministic field derived from the run seed, not a
// stored list: quantise the world into ~350 m cells and let a per-cell RNG
// decide whether that cell is trouble. Same seed, same island, forever, with
// no data to bake or ship.
// ---------------------------------------------------------------------------

export type HazardKind = 'horde_pocket' | 'gang_patrol' | 'collapse' | 'floodwater';

export interface HazardZone {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
  kind: HazardKind;
  /** 1 = uneasy, 3 = do not cross. */
  severity: number;
}

export interface HazardKindDef {
  label: string;
  /** Shown on the trek card when the zone has been sensed. */
  blurb: string;
  color: string;
  /** Multiplier on the encounter roll for crossing it. */
  encounterMult: number;
  /** Extra energy burned per crossing, before severity scaling. */
  energyCost: number;
}

export const HAZARD_CONFIG: Record<HazardKind, HazardKindDef> = {
  horde_pocket: {
    label: 'Horde pocket',
    blurb: 'Something big drifted in here and never drifted out.',
    color: '#d92d2d',
    encounterMult: 2.2,
    energyCost: 3,
  },
  gang_patrol: {
    label: 'Patrolled ground',
    blurb: 'Someone claims this stretch, and they patrol it.',
    color: '#d9683d',
    encounterMult: 1.7,
    energyCost: 2,
  },
  collapse: {
    label: 'Collapse field',
    blurb: 'Pancaked slabs and rebar. Every step is a gamble.',
    color: '#c9a227',
    encounterMult: 1.2,
    energyCost: 7,
  },
  floodwater: {
    label: 'Floodwater',
    blurb: 'Waist-deep drain runoff. Slow, cold, and it hides things.',
    color: '#2bc4d9',
    encounterMult: 1.4,
    energyCost: 6,
  },
};

// --- the hazard field -------------------------------------------------------

/** Cell edge, metres. Roughly a city block — big enough to route around. */
const CELL_M = 350;
/** Share of cells that hold a hazard at day-1 / horde-0. Tuned so open ground is tense, not lethal. */
const CELL_HAZARD_RATE = 0.24;

function hazardSpawnRate(pressure: number): number {
  // Late city: up to ~52% of cells can host a pocket.
  return Math.min(0.52, CELL_HAZARD_RATE + Math.max(0, pressure) * 0.28);
}

// Singapore spans ~50 km; pinning the longitude scale to one reference latitude
// keeps the grid rigid instead of shearing as you move north.
const M_PER_DEG_LAT = 111000;
const REF_LAT = 1.35;
const M_PER_DEG_LNG = 111000 * Math.cos((REF_LAT * Math.PI) / 180);

function cellX(lng: number): number {
  return Math.floor((lng * M_PER_DEG_LNG) / CELL_M);
}

function cellY(lat: number): number {
  return Math.floor((lat * M_PER_DEG_LAT) / CELL_M);
}

/** The hazard occupying a grid cell, if that cell drew one. Pure in (seed,x,y,pressure). */
function zoneForCell(
  seed: string,
  cx: number,
  cy: number,
  pressure = 0,
): HazardZone | null {
  const rng = new Rng(seed).fork(`wilds:${cx}:${cy}`);
  if (!rng.chance(hazardSpawnRate(pressure))) return null;

  const kind = rng.weighted([
    ['horde_pocket', 34 + Math.round(pressure * 20)],
    ['gang_patrol', 26],
    ['collapse', 22],
    ['floodwater', 18],
  ] as const);
  let severity = rng.weighted([
    [1, 50],
    [2, 33],
    [3, 17],
  ] as const);
  // Late pressure nudges mild pockets upward so the map feels meaner, not just denser.
  if (pressure > 0.45 && severity < 3 && rng.chance(pressure * 0.4)) {
    severity = (severity + 1) as 1 | 2 | 3;
  }

  const jitterX = 0.25 + rng.next() * 0.5;
  const jitterY = 0.25 + rng.next() * 0.5;
  const radiusScale = 1 + pressure * 0.4;
  return {
    id: `hz:${cx}:${cy}`,
    lat: ((cy + jitterY) * CELL_M) / M_PER_DEG_LAT,
    lng: ((cx + jitterX) * CELL_M) / M_PER_DEG_LNG,
    radiusM: Math.round((100 + severity * 45) * radiusScale),
    kind,
    severity,
  };
}

/**
 * Ground the field is forbidden to touch. The survivor wakes up somewhere; that
 * somewhere must not already be inside a horde pocket, or the run opens with an
 * unearned fight and a first step that reads as broken.
 */
export interface SafeAnchor {
  lat: number;
  lng: number;
  radiusM?: number;
}

/** How much clear ground the spawn point is guaranteed. */
export const SPAWN_SAFE_RADIUS = 400;

/** True when a zone reaches into the protected bubble and must be suppressed. */
function suppressed(z: HazardZone, safe?: SafeAnchor): boolean {
  if (!safe) return false;
  const clear = safe.radiusM ?? SPAWN_SAFE_RADIUS;
  return haversine(safe.lat, safe.lng, z.lat, z.lng) < clear + z.radiusM;
}

/**
 * Every hazard whose circle comes within `radiusM` of a point.
 *
 * Pass the run's spawn as `safe` — every caller should, and consistently, since
 * a zone suppressed for the map but not for the encounter roll would be an
 * invisible ambush.
 *
 * `pressure` (0..1, typically horde intensity) densifies and enlarges pockets
 * as the city falls — early maps stay sparse; late maps look contested.
 */
export function hazardZonesNear(
  seed: string,
  lat: number,
  lng: number,
  radiusM: number,
  safe?: SafeAnchor,
  pressure = 0,
): HazardZone[] {
  const reach = radiusM + 250 + pressure * 80; // widest zone radius, so edge cells aren't missed
  const spanX = Math.ceil(reach / CELL_M);
  const spanY = Math.ceil(reach / CELL_M);
  const cx0 = cellX(lng);
  const cy0 = cellY(lat);
  const out: HazardZone[] = [];
  for (let dy = -spanY; dy <= spanY; dy++) {
    for (let dx = -spanX; dx <= spanX; dx++) {
      const z = zoneForCell(seed, cx0 + dx, cy0 + dy, pressure);
      if (!z || suppressed(z, safe)) continue;
      if (haversine(lat, lng, z.lat, z.lng) <= radiusM + z.radiusM) out.push(z);
    }
  }
  return out;
}

/** Metres between path samples when tracing a route through the field. */
const PATH_STEP_M = 70;

/**
 * Hazards the walked route actually crosses. Pass `via` (land-aware polyline)
 * when available so reservoir detours don't falsely sample mid-water; otherwise
 * the straight chord is used. Routing *around* a bad pocket is still intentional
 * — this only samples the path you actually take.
 */
export function hazardsOnPath(
  seed: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  safe?: SafeAnchor,
  pressure = 0,
  via?: { lat: number; lng: number }[],
): HazardZone[] {
  const seen = new Map<string, HazardZone>();
  const sampleAt = (lat: number, lng: number) => {
    for (const z of hazardZonesNear(seed, lat, lng, 0, safe, pressure)) seen.set(z.id, z);
  };

  const points =
    via && via.length >= 2
      ? via
      : [from, to];

  for (let s = 1; s < points.length; s++) {
    const a = points[s - 1];
    const b = points[s];
    const dist = haversine(a.lat, a.lng, b.lat, b.lng);
    const steps = Math.max(1, Math.ceil(dist / PATH_STEP_M));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      sampleAt(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t);
    }
  }
  return [...seen.values()];
}

// --- what crossing costs ----------------------------------------------------

/** Below this the move isn't a trek, it's a fidget — refuse it. */
export const TREK_MIN_DISTANCE_M = 60;

/** Flat stamina price for leaving the shelter of a known site. */
export const TREK_BASE_ENERGY = 7;

/**
 * Open ground is strictly worse than a road between two POIs: no doorway to
 * duck into, no walls to put your back against.
 */
const OPEN_GROUND_ENCOUNTER_MULT = 1.8;

export interface TrekRisk {
  /** 0..1 chance the crossing is interrupted by something hostile. */
  encounterChance: number;
  /** Energy burned on arrival, on top of the clock's own drain. */
  energyCost: number;
  /** Danger tier (1..5) any fight out here is built at. */
  combatDanger: number;
  /** Hazards the route runs through. */
  hazards: HazardZone[];
}

/**
 * Price a crossing. Distance, darkness, the horde and the hazards underfoot all
 * push the same dial. Deliberately harsher than `travel()`'s road roll — the
 * escape hatch has to cost more than the front door.
 */
export function trekRisk(
  seed: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  opts: {
    band: TimeOfDay;
    hordeIntensity: number; // 0..1
    weatherEncounterMod: number;
    traitEncounterMod: number;
    /** The run's spawn — hazards are never allowed to reach it. */
    safe?: SafeAnchor;
  },
  /**
   * Pass the subset the survivor has actually *sensed* to price the crossing as
   * they see it. Omit it — as the store does when rolling for real — and the
   * route is priced against every hazard on it, seen or not.
   */
  hazardsOverride?: HazardZone[],
  /** Land-aware polyline; distance and hazard samples follow it when set. */
  via?: { lat: number; lng: number }[],
): TrekRisk {
  const dist =
    via && via.length >= 2
      ? via.reduce(
          (sum, p, i) =>
            i === 0 ? 0 : sum + haversine(via[i - 1].lat, via[i - 1].lng, p.lat, p.lng),
          0,
        )
      : haversine(from.lat, from.lng, to.lat, to.lng);
  const hazards =
    hazardsOverride ?? hazardsOnPath(seed, from, to, opts.safe, opts.hordeIntensity, via);

  let p = (dist / 100) * 0.018 * OPEN_GROUND_ENCOUNTER_MULT;
  if (opts.band === 'night') p += 0.14;
  else if (opts.band === 'dusk') p += 0.07;
  p += opts.hordeIntensity * 0.18;
  p += opts.traitEncounterMod;
  p += opts.weatherEncounterMod;

  let energyCost = TREK_BASE_ENERGY + dist / 250;
  let worst = 0;
  for (const z of hazards) {
    const cfg = HAZARD_CONFIG[z.kind];
    // Severity scales the multiplier's bite: a sev-1 pocket is a bad feeling,
    // a sev-3 pocket is a decision.
    p *= 1 + (cfg.encounterMult - 1) * (z.severity / 3);
    energyCost += cfg.energyCost * z.severity * 0.6;
    worst = Math.max(worst, z.severity);
  }

  return {
    encounterChance: Math.max(0, Math.min(0.85, p)),
    energyCost: Math.round(energyCost),
    combatDanger: Math.max(1, Math.min(5, 2 + worst)),
    hazards,
  };
}

/** Coarse label for the trek card — never an exact percentage. */
export function riskLabel(chance: number): { text: string; color: string } {
  if (chance < 0.12) return { text: 'Quiet, far as you can tell', color: '#b7b3a9' };
  if (chance < 0.28) return { text: 'Uneasy', color: '#cfccc4' };
  if (chance < 0.45) return { text: 'Bad ground', color: '#d9683d' };
  return { text: 'Suicide run', color: '#d92d2d' };
}

/** How much of the map a crossing lights up — you learn less than at a site. */
export const TREK_LIGHT_RADIUS = 90;
