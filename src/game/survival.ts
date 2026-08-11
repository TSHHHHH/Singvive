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

// ---------- Dynamic condition scaling ----------
//
// Every meter reads as a continuous signal rather than a set of cliffs: 50 is
// the neutral baseline, 100 is a full buff, 0 is a full debuff. Each derived
// multiplier below is a linear ride off that delta, so the bars matter at every
// point on the scale instead of only when they cross a threshold.

/** Normalized −1..+1 signal for a 0..100 meter, neutral at 50. */
export function getMeterDelta(value: number): number {
  return Math.max(-1.0, Math.min(1.0, (value - 50) / 50));
}

/** Passive/resting HP recovery scaling from hunger. 0.5x .. 1.5x */
export function hpRegenMultiplier(hunger: number): number {
  return 1.0 + getMeterDelta(hunger) * 0.5;
}

/** How much energy a rest actually returns. 0.2x .. 1.8x */
export function restEnergyMultiplier(hunger: number, thirst: number): number {
  return 1.0 + getMeterDelta(hunger) * 0.3 + getMeterDelta(thirst) * 0.5;
}

/** Energy burn rate while moving/acting — dehydration burns up to 1.3x faster. */
export function activeEnergyDrainMultiplier(thirst: number): number {
  return 1.0 - getMeterDelta(thirst) * 0.3;
}

/** Walking pace scaling from energy. 0.7x .. 1.3x */
export function travelSpeedMultiplier(energy: number): number {
  return 1.0 + getMeterDelta(energy) * 0.3;
}

/** d20 attack-roll bonus from energy. −2 .. +2 */
export function energyAttackBonus(energy: number): number {
  return Math.round(getMeterDelta(energy) * 2);
}

/** Additional chance to slip a connecting blow. −0.15 .. +0.15 */
export function energyDodgeBonus(energy: number): number {
  return getMeterDelta(energy) * 0.15;
}

/** Flee DC shift — exhaustion makes breaking contact harder. +3 .. −3 */
export function energyFleeDcModifier(energy: number): number {
  return -Math.round(getMeterDelta(energy) * 3);
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

/** Signed percentage label for a multiplier, e.g. 1.15 -> "+15%". */
function pctLabel(mult: number): string {
  const pct = Math.round((mult - 1) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/** Signed integer label, e.g. 2 -> "+2". */
function signLabel(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** A single tooltip line: the text, and whether it helps or hurts. */
export interface MeterModifier {
  text: string;
  good: boolean;
}

/**
 * Human-readable list of the modifiers a meter is currently applying, for the
 * condition bars' tooltips. Empty when the meter sits at the neutral baseline.
 * `good` is the effect's direction, not the number's sign — more energy drain
 * is a bigger number and still bad news.
 */
export function meterModifiers(
  meter: 'hunger' | 'thirst' | 'energy',
  meters: Pick<Meters, 'hunger' | 'thirst' | 'energy'>,
): MeterModifier[] {
  const out: MeterModifier[] = [];
  switch (meter) {
    case 'hunger': {
      const d = getMeterDelta(meters.hunger);
      if (d === 0) break;
      out.push({ text: `${pctLabel(hpRegenMultiplier(meters.hunger))} HP recovery`, good: d > 0 });
      out.push({ text: `${pctLabel(1 + d * 0.3)} rest energy gain`, good: d > 0 });
      break;
    }
    case 'thirst': {
      const d = getMeterDelta(meters.thirst);
      if (d === 0) break;
      out.push({ text: `${pctLabel(1 + d * 0.5)} rest energy gain`, good: d > 0 });
      out.push({
        text: `${pctLabel(activeEnergyDrainMultiplier(meters.thirst))} energy drain`,
        good: d > 0,
      });
      break;
    }
    case 'energy': {
      const d = getMeterDelta(meters.energy);
      if (d === 0) break;
      out.push({ text: `${pctLabel(travelSpeedMultiplier(meters.energy))} travel speed`, good: d > 0 });
      out.push({ text: `${signLabel(energyAttackBonus(meters.energy))} to hit`, good: d > 0 });
      out.push({ text: `${pctLabel(1 + energyDodgeBonus(meters.energy))} dodge chance`, good: d > 0 });
      out.push({ text: `${signLabel(energyFleeDcModifier(meters.energy))} flee DC`, good: d > 0 });
      break;
    }
  }
  return out;
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
  opts: { sleeping?: boolean; thirstMult?: number; energyMult?: number } = {},
): Meters {
  const mult = opts.sleeping ? SLEEP_DEPLETION_MULT : 1;
  // Environmental multipliers (a heat wave, today) stack on top of the sleep
  // rate — sweating through a nap still costs you water, just less of it.
  const envThirst = opts.thirstMult ?? 1;
  const envEnergy = opts.energyMult ?? 1;
  const hunger = clampMeter(meters.hunger - DEPLETION_PER_HOUR.hunger * hours * mult);
  const thirst = clampMeter(meters.thirst - DEPLETION_PER_HOUR.thirst * hours * mult * envThirst);
  // A dry survivor burns through their reserves faster on the move; asleep, the
  // body is idling, so the active-drain penalty doesn't apply.
  const energyMult = (opts.sleeping ? mult : activeEnergyDrainMultiplier(meters.thirst)) * envEnergy;
  const energy = clampMeter(meters.energy - DEPLETION_PER_HOUR.energy * hours * energyMult);

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
    // A well-fed body knits itself back together faster than a hungry one.
    health += HP_REGEN_PER_HOUR * hours * hpRegenMultiplier(hunger);
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

export const REST_ENERGY_PER_HOUR = 9;

/**
 * Restore energy from sleeping `hours`, on top of the normal drain tick. Sleep
 * on an empty stomach and a dry throat and the night gives much less back.
 */
export function sleepRestore(
  energy: number,
  hours: number,
  fuel: { hunger: number; thirst: number } = { hunger: 50, thirst: 50 },
): number {
  const gain = hours * REST_ENERGY_PER_HOUR * restEnergyMultiplier(fuel.hunger, fuel.thirst);
  return clampMeter(energy + Math.max(0, gain));
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
