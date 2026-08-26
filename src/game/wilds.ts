import type { TimeOfDay } from './types';
import { Rng } from './rng';
import { haversine } from './overpass';
import { flavorHazard } from './flavor';
import {
  inInlandWater,
  inVegetation,
  inlandWaterFeaturesNear,
  isWalkable,
  isZonesLoaded,
} from './playable';
import { LOST_PRESSURE } from './townField';

// ---------------------------------------------------------------------------
// The wilds — the ground *between* the pins.
//
// Hazard zones are a deterministic field derived from the run seed, not a
// stored list: quantise the world into ~350 m cells and let a per-cell RNG
// decide whether that cell is trouble. Same seed, same island, forever.
// Each pocket is a cluster of overlapping discs (kind-specific silhouettes).
// Night swarm is a second layer that blooms at dusk and floods after dark.
// ---------------------------------------------------------------------------

export type HazardKind =
  | 'horde_pocket'
  | 'gang_patrol'
  | 'collapse'
  | 'floodwater'
  | 'wildlife_water'
  | 'wildlife_forest'
  | 'wildlife_urban'
  | 'night_swarm';

export interface HazardDisc {
  lat: number;
  lng: number;
  radiusM: number;
}

export interface HazardZone {
  id: string;
  lat: number;
  lng: number;
  /** Bounding radius of the disc cluster (search envelope, not the hit). */
  radiusM: number;
  kind: HazardKind;
  /** 1 = uneasy, 3 = do not cross. */
  severity: number;
  discs: HazardDisc[];
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
  wildlife_water: {
    label: 'Claimed canal',
    blurb: 'Something in the water has taken this stretch of bank.',
    color: '#3d9e8a',
    encounterMult: 1.8,
    energyCost: 3,
  },
  wildlife_forest: {
    label: 'Claimed catchment',
    blurb: 'The trees went quiet. Whatever lives here does not want company.',
    color: '#6b8f3d',
    encounterMult: 1.8,
    energyCost: 3,
  },
  wildlife_urban: {
    label: 'Infested block',
    blurb: 'Strays own this stretch. They do not share.',
    color: '#8a7a6b',
    encounterMult: 1.6,
    energyCost: 2,
  },
  night_swarm: {
    label: 'Night swarm',
    blurb: 'They come out when the light dies. The streets are theirs.',
    color: '#8b1212',
    encounterMult: 2.8,
    energyCost: 4,
  },
};

// --- the hazard field -------------------------------------------------------

/** Cell edge, metres. Roughly a city block — big enough to route around. */
const CELL_M = 350;
/** Coarser night-swarm grid so Leaflet can flood the map without thousands of rings. */
const CELL_NIGHT_M = 600;
/** Share of cells that hold a daytime hazard at horde-0. */
const CELL_HAZARD_RATE = 0.2;
/** Night-swarm spawn on empty cells. Dusk is 40% of this. */
const NIGHT_SWARM_RATE = 0.65;

function hazardSpawnRate(pressure: number): number {
  return Math.min(0.42, CELL_HAZARD_RATE + Math.max(0, pressure) * 0.22);
}

function nightSwarmRate(band: TimeOfDay): number {
  if (band === 'night') return NIGHT_SWARM_RATE;
  if (band === 'dusk') return NIGHT_SWARM_RATE * 0.4;
  return 0;
}

/** How far night swarm is drawn so the city going red reads through fog. */
export const NIGHT_SWARM_SENSE_M = 1500;

const M_PER_DEG_LAT = 111000;
const REF_LAT = 1.35;
const M_PER_DEG_LNG = 111000 * Math.cos((REF_LAT * Math.PI) / 180);

function cellX(lng: number, cellM = CELL_M): number {
  return Math.floor((lng * M_PER_DEG_LNG) / cellM);
}

function cellY(lat: number, cellM = CELL_M): number {
  return Math.floor((lat * M_PER_DEG_LAT) / cellM);
}

function offsetLatLng(
  lat: number,
  lng: number,
  distM: number,
  angle: number,
): { lat: number; lng: number } {
  return {
    lat: lat + (distM * Math.cos(angle)) / M_PER_DEG_LAT,
    lng: lng + (distM * Math.sin(angle)) / M_PER_DEG_LNG,
  };
}

function envelopeM(severity: number, pressure: number, night: boolean): number {
  const base = night ? 200 + severity * 80 : 140 + severity * 70;
  return Math.round(base * (1 + pressure * 0.4));
}

function boundingRadius(lat: number, lng: number, discs: HazardDisc[]): number {
  let max = 0;
  for (const d of discs) {
    max = Math.max(max, haversine(lat, lng, d.lat, d.lng) + d.radiusM);
  }
  return Math.round(max);
}

function centroidOf(discs: HazardDisc[]): { lat: number; lng: number } {
  let lat = 0;
  let lng = 0;
  for (const d of discs) {
    lat += d.lat;
    lng += d.lng;
  }
  const n = Math.max(1, discs.length);
  return { lat: lat / n, lng: lng / n };
}

type Silhouette = 'lumpy' | 'beat' | 'pile' | 'ribbon' | 'swarm';

function silhouetteFor(kind: HazardKind): Silhouette {
  if (kind === 'horde_pocket' || kind === 'wildlife_forest') return 'lumpy';
  if (kind === 'gang_patrol' || kind === 'wildlife_urban') return 'beat';
  if (kind === 'collapse') return 'pile';
  if (kind === 'floodwater' || kind === 'wildlife_water') return 'ribbon';
  return 'swarm';
}

function layoutDiscs(
  rng: Rng,
  kind: HazardKind,
  severity: number,
  originLat: number,
  originLng: number,
  envelope: number,
): HazardDisc[] {
  const shape = silhouetteFor(kind);
  const axis = rng.next() * Math.PI * 2;
  let count = 3;
  let spacing = 0.28;
  let radiusFrac = 0.48;
  if (shape === 'lumpy') {
    count = Math.min(5, rng.int(3, 4) + (severity >= 3 ? 1 : 0));
    spacing = 0.14;
    radiusFrac = 0.58;
  } else if (shape === 'beat') {
    count = rng.int(2, 3);
    spacing = 0.28;
    radiusFrac = 0.5;
  } else if (shape === 'pile') {
    count = rng.int(2, 3);
    spacing = 0.1;
    radiusFrac = 0.48;
  } else if (shape === 'ribbon') {
    count = rng.int(3, 4);
    spacing = 0.3;
    radiusFrac = 0.52;
  } else {
    count = rng.int(2, 3);
    spacing = 0.2;
    radiusFrac = 0.68;
  }

  const discs: HazardDisc[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
    let angle = axis;
    let dist = Math.abs(t) * spacing * envelope;
    if (shape === 'lumpy' || shape === 'pile' || shape === 'swarm') {
      angle = axis + rng.next() * Math.PI * 2;
      dist = (0.12 + rng.next() * spacing) * envelope;
    }
    const pos = offsetLatLng(originLat, originLng, dist, angle);
    const rJitter = 0.85 + rng.next() * 0.3;
    discs.push({
      lat: pos.lat,
      lng: pos.lng,
      radiusM: Math.round(envelope * radiusFrac * rJitter),
    });
  }
  return discs;
}

function finishZone(
  id: string,
  kind: HazardKind,
  severity: number,
  discs: HazardDisc[],
): HazardZone {
  const c = centroidOf(discs);
  return {
    id,
    kind,
    severity,
    discs,
    lat: c.lat,
    lng: c.lng,
    radiusM: boundingRadius(c.lat, c.lng, discs),
  };
}

export function pointInZone(lat: number, lng: number, z: HazardZone): boolean {
  return z.discs.some((d) => haversine(lat, lng, d.lat, d.lng) <= d.radiusM);
}

export function zoneTouches(
  lat: number,
  lng: number,
  radiusM: number,
  z: HazardZone,
): boolean {
  return z.discs.some((d) => haversine(lat, lng, d.lat, d.lng) <= radiusM + d.radiusM);
}

function rollSeverity(rng: Rng, pressure: number): 1 | 2 | 3 {
  let severity = rng.weighted([
    [1, 50],
    [2, 33],
    [3, 17],
  ] as const);
  if (pressure > 0.45 && severity < 3 && rng.chance(pressure * 0.4)) {
    severity = (severity + 1) as 1 | 2 | 3;
  }
  return severity;
}

/** The hazard occupying a grid cell, if that cell drew one. Pure in (seed,x,y,pressure). */
function zoneForCell(
  seed: string,
  cx: number,
  cy: number,
  pressure = 0,
): HazardZone | null {
  const rng = new Rng(seed).fork(`wilds:${cx}:${cy}`);
  const jx = 0.25 + rng.next() * 0.5;
  const jy = 0.25 + rng.next() * 0.5;
  const lat = ((cy + jy) * CELL_M) / M_PER_DEG_LAT;
  const lng = ((cx + jx) * CELL_M) / M_PER_DEG_LNG;

  if (isZonesLoaded() && inInlandWater(lat, lng)) return null;

  if (!rng.chance(hazardSpawnRate(pressure))) return null;

  const weights: [HazardKind, number][] = [
    ['horde_pocket', 30 + Math.round(pressure * 20)],
    ['gang_patrol', 24],
    ['collapse', 20],
    ['floodwater', 16],
  ];
  if (isZonesLoaded()) {
    if (inVegetation(lat, lng)) {
      weights.push(['wildlife_forest', 28]);
    } else if (isWalkable(lat, lng)) {
      weights.push(['wildlife_urban', 12]);
    }
  }
  const kind = rng.weighted(weights);
  const severity = rollSeverity(rng, pressure);
  const envelope = envelopeM(severity, pressure, false);
  const discs = layoutDiscs(rng, kind, severity, lat, lng, envelope);
  return finishZone(`hz:${cx}:${cy}`, kind, severity, discs);
}

function nightSwarmForCell(
  seed: string,
  day: number,
  nx: number,
  ny: number,
  pressure: number,
  band: TimeOfDay,
): HazardZone | null {
  const rate = nightSwarmRate(band);
  if (rate <= 0) return null;

  const rng = new Rng(seed).fork(`wilds:night:${day}:${nx}:${ny}`);
  const jx = 0.25 + rng.next() * 0.5;
  const jy = 0.25 + rng.next() * 0.5;
  const lat = ((ny + jy) * CELL_NIGHT_M) / M_PER_DEG_LAT;
  const lng = ((nx + jx) * CELL_NIGHT_M) / M_PER_DEG_LNG;

  if (isZonesLoaded() && inInlandWater(lat, lng)) return null;

  const dayZ = zoneForCell(seed, cellX(lng), cellY(lat), pressure);
  if (dayZ) return null;

  if (!rng.chance(rate)) return null;

  const severity = rollSeverity(rng, pressure);
  const dusk = band === 'dusk';
  const envelope = Math.round(envelopeM(severity, pressure, true) * (dusk ? 0.72 : 1));
  const discs = layoutDiscs(rng, 'night_swarm', severity, lat, lng, envelope);
  return finishZone(`hz-night:${day}:${nx}:${ny}`, 'night_swarm', severity, discs);
}

function waterWildlifeCount(areaM2: number, rng: Rng): number {
  if (areaM2 < 2000) return rng.chance(0.35) ? 1 : 0;
  if (areaM2 < 20000) return 1;
  if (areaM2 < 200000) return 1 + (rng.chance(0.45) ? 1 : 0);
  return Math.min(4, 2 + Math.floor(areaM2 / 400000));
}

/** Rings centred on inland water polygons; radius overlaps the bank. */
function waterWildlifeZonesNear(
  seed: string,
  lat: number,
  lng: number,
  radiusM: number,
  pressure: number,
): HazardZone[] {
  if (!isZonesLoaded()) return [];
  const reach = radiusM + 280 + pressure * 80;
  const features = inlandWaterFeaturesNear(lat, lng, reach);
  const out: HazardZone[] = [];
  for (const f of features) {
    const rng = new Rng(seed).fork(`wilds-water:${f.index}`);
    const n = waterWildlifeCount(f.areaM2, rng);
    for (let k = 0; k < n; k++) {
      const r = rng.fork(`ring:${k}`);
      const severity = rollSeverity(r, pressure);
      const envelope = Math.round((150 + severity * 40) * (1 + pressure * 0.4));
      const jitterM = Math.min(80, Math.sqrt(Math.max(1, f.areaM2)) * 0.15);
      const jLat = ((r.next() - 0.5) * 2 * jitterM) / M_PER_DEG_LAT;
      const jLng = ((r.next() - 0.5) * 2 * jitterM) / M_PER_DEG_LNG;
      const discs = layoutDiscs(
        r,
        'wildlife_water',
        severity,
        f.lat + jLat,
        f.lng + jLng,
        envelope,
      );
      const z = finishZone(`hz-water:${f.index}:${k}`, 'wildlife_water', severity, discs);
      if (zoneTouches(lat, lng, radiusM, z)) out.push(z);
    }
  }
  return out;
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

/** Modest clear around the wake-up tile — discs that cover spawn are suppressed. */
export const SPAWN_SAFE_RADIUS = 80;

/** True when a daytime zone covers the spawn tile and must be suppressed. */
function suppressed(z: HazardZone, safe?: SafeAnchor): boolean {
  if (!safe) return false;
  if (z.kind === 'night_swarm') return false;
  const clear = safe.radiusM ?? SPAWN_SAFE_RADIUS;
  return z.discs.some(
    (d) => haversine(safe.lat, safe.lng, d.lat, d.lng) < d.radiusM + clear,
  );
}

export interface HazardFieldOpts {
  band?: TimeOfDay;
  day?: number;
  /** Local 0..1 intensity. When set, each cell uses this instead of the scalar. */
  pressureAt?: (lat: number, lng: number) => number;
}

/**
 * Every hazard whose discs come within `radiusM` of a point.
 *
 * Pass the run's spawn as `safe` — every caller should, and consistently, since
 * a zone suppressed for the map but not for the encounter roll would be an
 * invisible ambush. Night swarm ignores the spawn bubble.
 */
export function hazardZonesNear(
  seed: string,
  lat: number,
  lng: number,
  radiusM: number,
  safe?: SafeAnchor,
  pressure = 0,
  field?: HazardFieldOpts,
): HazardZone[] {
  const band = field?.band ?? 'day';
  const day = field?.day ?? 1;
  const pressureHere = field?.pressureAt ? field.pressureAt(lat, lng) : pressure;
  const reach = radiusM + 500 + pressureHere * 80;
  const spanX = Math.ceil(reach / CELL_M);
  const spanY = Math.ceil(reach / CELL_M);
  const cx0 = cellX(lng);
  const cy0 = cellY(lat);
  const out: HazardZone[] = [];
  const seen = new Set<string>();

  const pAt = (clat: number, clng: number): number =>
    field?.pressureAt ? field.pressureAt(clat, clng) : pressure;

  const push = (z: HazardZone | null) => {
    if (!z || suppressed(z, safe) || seen.has(z.id)) return;
    if (radiusM <= 0 ? pointInZone(lat, lng, z) : zoneTouches(lat, lng, radiusM, z)) {
      seen.add(z.id);
      out.push(z);
    }
  };

  for (let dy = -spanY; dy <= spanY; dy++) {
    for (let dx = -spanX; dx <= spanX; dx++) {
      const cx = cx0 + dx;
      const cy = cy0 + dy;
      const clat = ((cy + 0.5) * CELL_M) / M_PER_DEG_LAT;
      const clng = ((cx + 0.5) * CELL_M) / M_PER_DEG_LNG;
      push(zoneForCell(seed, cx, cy, pAt(clat, clng)));
    }
  }
  for (const z of waterWildlifeZonesNear(seed, lat, lng, radiusM, pressureHere)) {
    push(z);
  }

  const nSpan = Math.ceil(reach / CELL_NIGHT_M);
  const nx0 = cellX(lng, CELL_NIGHT_M);
  const ny0 = cellY(lat, CELL_NIGHT_M);
  for (let dy = -nSpan; dy <= nSpan; dy++) {
    for (let dx = -nSpan; dx <= nSpan; dx++) {
      const nx = nx0 + dx;
      const ny = ny0 + dy;
      const nlat = ((ny + 0.5) * CELL_NIGHT_M) / M_PER_DEG_LAT;
      const nlng = ((nx + 0.5) * CELL_NIGHT_M) / M_PER_DEG_LNG;
      const localP = pAt(nlat, nlng);
      // Lost neighbourhoods run a dusk swarm in daylight — still walkable, not a wall.
      const swarmBand: TimeOfDay =
        band === 'day' && localP >= LOST_PRESSURE / 100 ? 'dusk' : band;
      if (nightSwarmRate(swarmBand) <= 0) continue;
      push(nightSwarmForCell(seed, day, nx, ny, localP, swarmBand));
    }
  }

  return out;
}

/**
 * Day pockets inside `dayRadiusM`, plus night swarm out to `NIGHT_SWARM_SENSE_M`
 * when it is dusk or night — so the flood reads even through fog.
 */
export function sensedHazardField(
  seed: string,
  lat: number,
  lng: number,
  dayRadiusM: number,
  safe: SafeAnchor | undefined,
  pressure: number,
  band: TimeOfDay,
  day: number,
  pressureAt?: (lat: number, lng: number) => number,
): HazardZone[] {
  const dayZones = hazardZonesNear(seed, lat, lng, dayRadiusM, safe, pressure, {
    band: 'day',
    day,
    pressureAt,
  });
  if (band === 'day') return dayZones;
  const swarm = hazardZonesNear(
    seed,
    lat,
    lng,
    NIGHT_SWARM_SENSE_M,
    undefined,
    pressure,
    { band, day, pressureAt },
  ).filter((z) => z.kind === 'night_swarm');
  const seen = new Set(dayZones.map((z) => z.id));
  const out = [...dayZones];
  for (const z of swarm) {
    if (seen.has(z.id)) continue;
    seen.add(z.id);
    out.push(z);
  }
  return out;
}

/** Metres between path samples when tracing a route through the field. */
const PATH_STEP_M = 70;

/**
 * Hazards the walked route actually crosses. Pass `via` (land-aware polyline)
 * when available so reservoir detours don't falsely sample mid-water.
 */
export function hazardsOnPath(
  seed: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  safe?: SafeAnchor,
  pressure = 0,
  via?: { lat: number; lng: number }[],
  field?: HazardFieldOpts,
): HazardZone[] {
  const seen = new Map<string, HazardZone>();
  const sampleAt = (lat: number, lng: number) => {
    for (const z of hazardZonesNear(seed, lat, lng, 0, safe, pressure, field)) {
      seen.set(z.id, z);
    }
  };

  const points = via && via.length >= 2 ? via : [from, to];

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

export function hazardsAtPoint(
  seed: string,
  lat: number,
  lng: number,
  safe?: SafeAnchor,
  pressure = 0,
  field?: HazardFieldOpts,
): HazardZone[] {
  return hazardZonesNear(seed, lat, lng, 0, safe, pressure, field);
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
 * push the same dial. Deliberately harsher than a quiet road — the escape hatch
 * has to cost more than the front door.
 */
export function trekRisk(
  seed: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  opts: {
    band: TimeOfDay;
    hordeIntensity: number;
    weatherEncounterMod: number;
    traitEncounterMod: number;
    safe?: SafeAnchor;
    day?: number;
    pressureAt?: (lat: number, lng: number) => number;
  },
  hazardsOverride?: HazardZone[],
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
  const pathPressure = opts.pressureAt
    ? Math.max(opts.pressureAt(from.lat, from.lng), opts.pressureAt(to.lat, to.lng))
    : opts.hordeIntensity;
  const field: HazardFieldOpts = {
    band: opts.band,
    day: opts.day,
    pressureAt: opts.pressureAt,
  };
  const hazards =
    hazardsOverride ??
    hazardsOnPath(seed, from, to, opts.safe, pathPressure, via, field);

  let p = (dist / 100) * 0.018 * OPEN_GROUND_ENCOUNTER_MULT;
  if (opts.band === 'night') p += 0.14;
  else if (opts.band === 'dusk') p += 0.07;
  else if (pathPressure >= LOST_PRESSURE / 100) p += 0.1;
  p += pathPressure * 0.18;
  p += opts.traitEncounterMod;
  p += opts.weatherEncounterMod;

  let energyCost = TREK_BASE_ENERGY + dist / 250;
  let worst = 0;
  for (const z of hazards) {
    const cfg = HAZARD_CONFIG[z.kind];
    p *= 1 + (cfg.encounterMult - 1) * (z.severity / 3);
    energyCost += cfg.energyCost * z.severity * 0.6;
    worst = Math.max(worst, z.severity);
  }

  return {
    encounterChance: Math.max(0, Math.min(0.95, p)),
    energyCost: Math.round(energyCost),
    combatDanger: Math.max(1, Math.min(5, 2 + worst)),
    hazards,
  };
}

const COMBAT_KINDS: ReadonlySet<HazardKind> = new Set([
  'horde_pocket',
  'gang_patrol',
  'night_swarm',
  'wildlife_water',
  'wildlife_forest',
  'wildlife_urban',
]);

function ambushChanceFor(kind: HazardKind, severity: number): number {
  if (kind === 'night_swarm') return Math.min(0.97, 0.75 + severity * 0.08);
  if (kind === 'horde_pocket') return Math.min(0.95, 0.45 + severity * 0.18);
  if (kind === 'gang_patrol') return Math.min(0.92, 0.4 + severity * 0.18);
  if (kind === 'wildlife_water' || kind === 'wildlife_forest') {
    return Math.min(0.9, 0.5 + severity * 0.15);
  }
  if (kind === 'wildlife_urban') return Math.min(0.85, 0.42 + severity * 0.15);
  return 0;
}

export interface CrossingOutcome {
  energyCost: number;
  extraHours: number;
  woundHp: number;
  woundPreferLeg: boolean;
  infectionDelta: number;
  ambush: { hazard: HazardKind; danger: number } | null;
  logs: { text: string; tone: 'info' | 'bad' }[];
  /** Quiet road loot — only when the path hit no pockets. */
  roadFind: boolean;
}

const WOUND_CAP = 18;

/**
 * Kind-specific bite for a priced crossing. Terrain (collapse / flood) always
 * applies; combat is the roll. Does not change HAZARD_CONFIG.energyCost (tunnels).
 */
export function resolveCrossing(
  rng: Rng,
  risk: TrekRisk,
  opts: {
    mode: 'road' | 'trek';
    siteDanger?: number;
    dexterity: number;
    checkBonus: number;
  },
): CrossingOutcome {
  const logs: { text: string; tone: 'info' | 'bad' }[] = [];
  let extraHours = 0;
  let woundHp = 0;
  let woundPreferLeg = false;
  let infectionDelta = 0;
  let ambush: CrossingOutcome['ambush'] = null;

  const byId = new Map<string, HazardZone>();
  for (const z of risk.hazards) byId.set(z.id, z);
  const unique = [...byId.values()];

  let combatBest: HazardZone | null = null;
  let combatChance = 0;
  for (const z of unique) {
    if (z.kind === 'collapse') {
      const dc = 10 + z.severity * 2;
      const autoFail = z.severity >= 3;
      const roll = rng.d20();
      const ok = !autoFail && (roll === 20 || roll + opts.dexterity + opts.checkBonus >= dc);
      if (!ok) {
        woundHp += 6 + z.severity * 3;
        woundPreferLeg = true;
        logs.push({ text: flavorHazard('collapse', 'wound'), tone: 'bad' });
      } else {
        logs.push({ text: flavorHazard('collapse', 'clear'), tone: 'info' });
      }
    } else if (z.kind === 'floodwater') {
      extraHours += 0.12 * z.severity;
      logs.push({ text: flavorHazard('floodwater', 'cross'), tone: 'bad' });
      if (rng.chance(0.1 * z.severity)) {
        infectionDelta += 4 * z.severity;
        logs.push({ text: flavorHazard('floodwater', 'infect'), tone: 'bad' });
      }
    } else if (COMBAT_KINDS.has(z.kind)) {
      logs.push({ text: flavorHazard(z.kind, 'cross'), tone: 'bad' });
      const p = ambushChanceFor(z.kind, z.severity);
      if (p >= combatChance) {
        combatChance = p;
        combatBest = z;
      }
      if (z.kind === 'horde_pocket' && z.severity >= 3) {
        infectionDelta += 3;
        logs.push({ text: flavorHazard('horde_pocket', 'infect'), tone: 'bad' });
      }
    }
  }

  if (combatBest && rng.chance(combatChance)) {
    const site = opts.siteDanger ?? 0;
    const danger = Math.max(1, Math.min(5, Math.max(site, 2 + combatBest.severity)));
    const swarmBump = combatBest.kind === 'night_swarm' ? 1 : 0;
    ambush = {
      hazard: combatBest.kind,
      danger: Math.min(5, danger + swarmBump),
    };
  } else if (unique.length === 0 && opts.mode === 'road' && rng.chance(risk.encounterChance)) {
    if (rng.chance(0.22)) {
      return {
        energyCost: risk.energyCost,
        extraHours: 0,
        woundHp: 0,
        woundPreferLeg: false,
        infectionDelta: 0,
        ambush: null,
        logs,
        roadFind: true,
      };
    }
    if (rng.chance(0.55)) {
      ambush = { hazard: 'horde_pocket', danger: Math.max(1, opts.siteDanger ?? risk.combatDanger) };
    }
  } else if (unique.length === 0 && opts.mode === 'trek' && rng.chance(risk.encounterChance)) {
    ambush = { hazard: 'horde_pocket', danger: risk.combatDanger };
  }

  return {
    energyCost: risk.energyCost,
    extraHours,
    woundHp: Math.min(WOUND_CAP, woundHp),
    woundPreferLeg,
    infectionDelta,
    ambush,
    logs,
    roadFind: false,
  };
}

/** Coarse label for the trek card — never an exact percentage. */
export function riskLabel(chance: number): { text: string; color: string } {
  if (chance < 0.12) return { text: 'Quiet, far as you can tell', color: '#b7b3a9' };
  if (chance < 0.28) return { text: 'Uneasy', color: '#cfccc4' };
  if (chance < 0.45) return { text: 'Bad ground', color: '#d9683d' };
  return { text: 'Suicide run', color: '#d92d2d' };
}

export function restAmbushLabel(chance: number): { text: string; color: string } {
  if (chance <= 0) return { text: 'Safe', color: '#b7b3a9' };
  if (chance < 0.15) return { text: 'Uneasy', color: '#cfccc4' };
  if (chance < 0.4) return { text: 'Exposed', color: '#d9683d' };
  return { text: 'Suicide', color: '#d92d2d' };
}

/** How much of the map a crossing lights up — you learn less than at a site. */
export const TREK_LIGHT_RADIUS = 90;
