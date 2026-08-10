import type { BodyPartId, BodyParts, Meters } from './types';
import type { Rng } from './rng';

export const HOURS_PER_DAY = 24;
export const START_HOUR = 8; // survivors wake at 8am
export const METER_MAX = 100;

/** Passive depletion per HOUR spent awake/active. */
export const DEPLETION_PER_HOUR = {
  hunger: 1.1,
  thirst: 1.5,
  energy: 2.9,
};

/**
 * A sleeping body burns far less. Without this, an eight-hour night ate most of
 * a meal and a bottle, so resting meant immediately re-opening the pack.
 */
export const SLEEP_DEPLETION_MULT = 0.3;

/** Below this, an empty stomach / dry throat starts costing HP. */
export const STARVING_THRESHOLD = 20;
/** HP per hour lost at a completely empty meter (scales in from the threshold). */
const STARVE_HP_PER_HOUR = 2.5;
const DEHYDRATE_HP_PER_HOUR = 4;

/** 0 when the meter is above the threshold, ramping to 1 at empty. */
function starvationSeverity(meter: number): number {
  if (meter >= STARVING_THRESHOLD) return 0;
  return (STARVING_THRESHOLD - meter) / STARVING_THRESHOLD;
}

export function clampMeter(v: number): number {
  return Math.max(0, Math.min(METER_MAX, v));
}

export function initialMeters(maxHp: number): Meters {
  return {
    health: maxHp,
    hunger: 80,
    thirst: 80,
    energy: 90,
    infection: 0,
  };
}

export const HP_REGEN_PER_HOUR = 2;

/**
 * Advance survival meters by `hours`. Applies proportional hunger/thirst/energy
 * drain, bleeding drain, starvation/infection damage, and — when stable —
 * passive HP regen so a run isn't ruined by one unlucky fight. Pure.
 */
export function tickMeters(
  meters: Meters,
  effectiveMaxHp: number,
  hours: number,
  bleedDrain = 0,
  opts: { sleeping?: boolean } = {},
): Meters {
  const mult = opts.sleeping ? SLEEP_DEPLETION_MULT : 1;
  const hunger = clampMeter(meters.hunger - DEPLETION_PER_HOUR.hunger * hours * mult);
  const thirst = clampMeter(meters.thirst - DEPLETION_PER_HOUR.thirst * hours * mult);
  const energy = clampMeter(meters.energy - DEPLETION_PER_HOUR.energy * hours);

  // Running empty no longer kills outright — it grinds HP down, so the run ends
  // on health and you get warning time to find food or water.
  const starving = starvationSeverity(hunger);
  const parched = starvationSeverity(thirst);

  let health = meters.health;
  health -= bleedDrain * hours;
  health -= starving * STARVE_HP_PER_HOUR * hours;
  health -= parched * DEHYDRATE_HP_PER_HOUR * hours;
  if (meters.infection > 0) health -= (meters.infection / 25) * hours;

  // passive recovery when the body is stable (fed, hydrated, not bleeding out)
  if (bleedDrain === 0 && starving === 0 && parched === 0 && meters.infection < 50) {
    health += HP_REGEN_PER_HOUR * hours;
  }

  return {
    health: Math.min(effectiveMaxHp, Math.max(0, Math.round(health))),
    hunger,
    thirst,
    energy,
    infection: meters.infection,
  };
}

// ---------- Injuries (Project-Zomboid-style) ----------

export const BODY_PART_IDS: BodyPartId[] = [
  'head',
  'torso',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
];

export const BODY_PART_LABEL: Record<BodyPartId, string> = {
  head: 'Head',
  torso: 'Torso',
  leftArm: 'L Arm',
  rightArm: 'R Arm',
  leftLeg: 'L Leg',
  rightLeg: 'R Leg',
};

// How much a fully-wrecked part removes from max HP.
const IMPORTANCE_PTS: Record<BodyPartId, number> = {
  head: 25,
  torso: 30,
  leftArm: 10,
  rightArm: 10,
  leftLeg: 10,
  rightLeg: 10,
};

// Relative chance a random blow lands on each part.
const WOUND_WEIGHTS: [BodyPartId, number][] = [
  ['torso', 35],
  ['head', 10],
  ['leftArm', 15],
  ['rightArm', 15],
  ['leftLeg', 12],
  ['rightLeg', 12],
];

const PART_REGEN_PER_HOUR = 1.5;
const BLEED_DRAIN_PER_HOUR = 2;

export function initialBodyParts(): BodyParts {
  const parts = {} as BodyParts;
  for (const id of BODY_PART_IDS) parts[id] = { condition: 100, bleeding: false };
  return parts;
}

/** Max HP after subtracting injury penalties; never below a small floor. */
export function effectiveMaxHp(baseMaxHp: number, parts: BodyParts): number {
  let penalty = 0;
  for (const id of BODY_PART_IDS) {
    penalty += IMPORTANCE_PTS[id] * ((100 - parts[id].condition) / 100);
  }
  return Math.max(20, Math.round(baseMaxHp - penalty));
}

export function totalInjuryPenalty(baseMaxHp: number, parts: BodyParts): number {
  return baseMaxHp - effectiveMaxHp(baseMaxHp, parts);
}

export function avgCondition(parts: BodyParts, ids: BodyPartId[]): number {
  return ids.reduce((s, id) => s + parts[id].condition, 0) / ids.length;
}

export function anyBleeding(parts: BodyParts): boolean {
  return BODY_PART_IDS.some((id) => parts[id].bleeding);
}

/** Travel-speed multiplier from leg condition (1 = healthy, down to 0.5). */
export function legTravelFactor(parts: BodyParts): number {
  return 0.5 + 0.5 * (avgCondition(parts, ['leftLeg', 'rightLeg']) / 100);
}

/** Attack-roll penalty from arm condition (0 healthy .. 4 both arms wrecked). */
export function armCombatPenalty(parts: BodyParts): number {
  return Math.round((1 - avgCondition(parts, ['leftArm', 'rightArm']) / 100) * 4);
}

/**
 * Land a wound of `damage` on a weighted-random body part: lower its condition
 * and possibly start bleeding. Pure — returns a new BodyParts.
 */
export function applyWound(
  parts: BodyParts,
  damage: number,
  rng: Rng,
  limbDamageMult = 1,
): BodyParts {
  const target = rng.weighted(WOUND_WEIGHTS);
  const conditionLoss = damage * 1.5 * limbDamageMult;
  const bleedChance = Math.min(0.6, damage / 40);
  const bleeding = parts[target].bleeding || rng.chance(bleedChance);
  return {
    ...parts,
    [target]: {
      condition: Math.max(0, parts[target].condition - conditionLoss),
      bleeding,
    },
  };
}

/**
 * Advance injuries by `hours`: untreated parts slowly recover, but bleeding
 * parts don't heal and drain HP. Returns new parts + total bleed drain/hour.
 */
export function tickInjuries(parts: BodyParts, hours: number): { parts: BodyParts; bleedDrain: number } {
  const next = {} as BodyParts;
  let bleedDrain = 0;
  for (const id of BODY_PART_IDS) {
    const p = parts[id];
    if (p.bleeding) {
      bleedDrain += BLEED_DRAIN_PER_HOUR;
      next[id] = p;
    } else {
      next[id] = {
        condition: Math.min(100, p.condition + PART_REGEN_PER_HOUR * hours),
        bleeding: false,
      };
    }
  }
  return { parts: next, bleedDrain };
}

/** Heal the most-wounded part and optionally stop bleeding (used by items). */
export function treatInjuries(
  parts: BodyParts,
  partHeal: number,
  stopsBleeding: 'one' | 'all' | undefined,
): BodyParts {
  const next: BodyParts = { ...parts };

  if (stopsBleeding === 'all') {
    for (const id of BODY_PART_IDS) {
      if (next[id].bleeding) next[id] = { ...next[id], bleeding: false };
    }
  } else if (stopsBleeding === 'one') {
    // stop the worst-condition bleeding part
    let worst: BodyPartId | null = null;
    for (const id of BODY_PART_IDS) {
      if (next[id].bleeding && (worst === null || next[id].condition < next[worst].condition)) {
        worst = id;
      }
    }
    if (worst) next[worst] = { ...next[worst], bleeding: false };
  }

  if (partHeal > 0) {
    let worst: BodyPartId | null = null;
    for (const id of BODY_PART_IDS) {
      if (next[id].condition < 100 && (worst === null || next[id].condition < next[worst].condition)) {
        worst = id;
      }
    }
    if (worst) {
      next[worst] = { ...next[worst], condition: Math.min(100, next[worst].condition + partHeal) };
    }
  }

  return next;
}

/** Restore energy from sleeping `hours`, on top of the normal drain tick. */
export function sleepRestore(energy: number, hours: number): number {
  return clampMeter(energy + hours * 9);
}

export type DeathCause =
  | 'health'
  | 'starvation'
  | 'dehydration'
  | 'infection'
  | 'head'
  | 'torso'
  | 'overrun'
  | null;

export function checkDeath(meters: Meters, parts?: BodyParts): DeathCause {
  if (meters.infection >= METER_MAX) return 'infection';
  if (parts && parts.head.condition <= 0) return 'head';
  if (parts && parts.torso.condition <= 0) return 'torso';
  if (meters.health <= 0) {
    // attribute the collapse to whatever was draining you
    if (meters.thirst <= 0) return 'dehydration';
    if (meters.hunger <= 0) return 'starvation';
    return 'health';
  }
  return null;
}

export const DEATH_TEXT: Record<Exclude<DeathCause, null>, string> = {
  health: 'Bled out and collapsed.',
  starvation: 'Starved to death.',
  dehydration: 'Died of dehydration.',
  infection: 'Turned. The infection won.',
  head: 'A blow to the head ended it.',
  torso: 'Fatal wounds to the body.',
  overrun: 'The horde swept the city. Nowhere left to run.',
};

export function computeScore(days: number, kills: number, lootValue: number): number {
  return days * 100 + kills * 25 + lootValue;
}

/** "8:30", "19:05" from a float hour. */
export function formatClock(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}
