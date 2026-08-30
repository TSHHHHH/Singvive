import type { ItemEffect, ItemInstance, LocationState } from './types';
import { Rng } from './rng';
import { itemDef } from './loot';
import { conditionScale } from './inventory';
import { haversine } from './overpass';
import { isWalkable } from './playable';

// ---------- Extraction goal ----------
// Dual-path spine: linger for a rising score multiplier, or gather weighted
// evac readiness and call for a lift. Best board score = long survival + late
// successful extract. No hard item IDs — fuel / meds / ammo count more.
// Demand is rolled per staging window and stays fogged for the whole approach.
// It only resolves into numbers once the player stands at the pad and raises the
// channel (`evacManifestRevealed`) — see `callEvac` in store.ts.

/** Base extract bonus before the day multiplier. */
export const EVAC_SCORE_BONUS = 2000;

/** Mean day-1 weighted readiness (actual demand is ±20% around the day curve). */
export const EVAC_BASE_VALUE = 150;
/** Extra mean weighted value required per day after day 1. */
export const EVAC_VALUE_PER_DAY = 18;

/** Soft category preference for this window's bird. */
export type EvacDemandBias = 'fuel' | 'meds' | 'ammo' | 'balanced';

const BIAS_MULT = 1.15;

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
  }
}

function biasMultFor(effect: ItemEffect, bias: EvacDemandBias): number {
  if (bias === 'balanced') return 1;
  if (bias === 'fuel' && effect.kind === 'fuel') return BIAS_MULT;
  if (bias === 'meds' && (effect.kind === 'heal' || effect.kind === 'cure')) return BIAS_MULT;
  if (bias === 'ammo' && (effect.kind === 'ammo' || effect.kind === 'magazine')) return BIAS_MULT;
  return 1;
}

/** Weighted readiness of items currently in the backpack. */
export function backpackEvacValue(
  items: ItemInstance[],
  bias: EvacDemandBias = 'balanced',
): number {
  let total = 0;
  for (const inst of items) {
    if (inst.container !== 'backpack') continue;
    const def = itemDef(inst.defId);
    if (def.effect.kind === 'magazine') {
      const cap = def.effect.capacity;
      const fill = inst.loadedRounds ?? 0;
      if (fill <= 0 || cap <= 0) continue;
      total +=
        def.value *
        (fill / cap) *
        evacWeightMult(def.effect) *
        biasMultFor(def.effect, bias);
      continue;
    }
    total +=
      def.value *
      conditionScale(inst) *
      inst.stack *
      evacWeightMult(def.effect) *
      biasMultFor(def.effect, bias);
  }
  return Math.round(total);
}

/** Rising mean threshold — the city gets harder to leave as days climb. */
export function meanEvacValue(day: number): number {
  return Math.round(EVAC_BASE_VALUE + Math.max(0, day - 1) * EVAC_VALUE_PER_DAY);
}

/** Persisted window demand wins; otherwise the day-curve mean. */
export function requiredEvacValue(day: number, demand?: number | null): number {
  if (demand != null && demand > 0) return demand;
  return meanEvacValue(day);
}

export interface EvacDemandRoll {
  demand: number;
  bias: EvacDemandBias;
}

const BIAS_POOL: readonly EvacDemandBias[] = [
  'balanced',
  'balanced',
  'fuel',
  'meds',
  'ammo',
];

/** Seeded appetite for one staging window (±20% around the day curve + soft bias). */
export function rollEvacDemand(rng: Rng, day: number): EvacDemandRoll {
  const mean = meanEvacValue(day);
  const demand = Math.round(mean * (0.8 + rng.next() * 0.4));
  const bias = rng.pick(BIAS_POOL);
  return { demand, bias };
}

export function hasEvacReadiness(
  items: ItemInstance[],
  day: number,
  demand?: number | null,
  bias: EvacDemandBias = 'balanced',
): boolean {
  return backpackEvacValue(items, bias) >= requiredEvacValue(day, demand);
}

/** @deprecated alias — prefer hasEvacReadiness */
export function hasEvacKit(items: ItemInstance[], day = 1): boolean {
  return hasEvacReadiness(items, day);
}

export type EvacVibe = 'thin' | 'maybe' | 'promising';

export interface EvacReadiness {
  current: number;
  required: number;
  ready: boolean;
  /** 0..1 true fill — UI must not show this until the pad manifest is read. */
  ratio: number;
  /** Fogged radio read for the player. */
  vibe: EvacVibe;
  vibeLine: string;
}

const VIBE_LINES: Record<EvacVibe, string> = {
  thin: 'Pack still looks light.',
  maybe: "Channel's unsure.",
  promising: 'Pilot might take this.',
};

/**
 * Jitter band edges from seed so the same haul can read differently and
 * players cannot binary-search the true demand from the UI.
 */
export function evacVibeFromRatio(ratio: number, jitterSeed: string): EvacVibe {
  const j = new Rng(jitterSeed).next() * 0.16 - 0.08;
  const thinCut = 0.45 + j;
  const maybeCut = 0.78 + j * 0.5;
  if (ratio < thinCut) return 'thin';
  if (ratio < maybeCut) return 'maybe';
  return 'promising';
}

export function evacReadiness(
  items: ItemInstance[],
  day: number,
  demand?: number | null,
  bias: EvacDemandBias = 'balanced',
  jitterSeed = 'evac-vibe',
): EvacReadiness {
  const current = backpackEvacValue(items, bias);
  const required = requiredEvacValue(day, demand);
  const ratio = required > 0 ? Math.min(1, current / required) : 1;
  const vibe = evacVibeFromRatio(ratio, jitterSeed);
  return {
    current,
    required,
    ready: current >= required,
    ratio,
    vibe,
    vibeLine: VIBE_LINES[vibe],
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

export type HordeTier = 'stirring' | 'restless' | 'massing' | 'swarming' | 'overrun';

/** Stable id for `ui.horde.*` — translate at the call site. */
export function hordeTier(hordeLevel: number): HordeTier {
  if (hordeLevel >= HORDE_MAX) return 'overrun';
  if (hordeLevel >= 75) return 'swarming';
  if (hordeLevel >= 50) return 'massing';
  if (hordeLevel >= 25) return 'restless';
  return 'stirring';
}

/** English fallback for logs / non-i18n callers. */
export function hordeLabel(hordeLevel: number): string {
  const labels: Record<HordeTier, string> = {
    overrun: 'Overrun',
    swarming: 'Swarming',
    massing: 'Massing',
    restless: 'Restless',
    stirring: 'Stirring',
  };
  return labels[hordeTier(hordeLevel)];
}
