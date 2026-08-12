import type { BleedLevel, BodyPartId, BodyParts, Meters } from './types';
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
  opts: {
    sleeping?: boolean;
    thirstMult?: number;
    energyMult?: number;
    /** Set by a major bleed only — a minor no longer freezes recovery. */
    bleedBlocksRegen?: boolean;
  } = {},
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

  // Passive recovery when the body is stable (fed, hydrated, not bleeding out).
  // A minor bleed no longer counts as "bleeding out" — it drains a trickle and
  // the body still knits, so an untreated scratch can't stall the whole run.
  if (!opts.bleedBlocksRegen && starving === 0 && parched === 0 && meters.infection < 50) {
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

// ---------- Bleeding ----------
// Bleeding used to be one flat, unsurvivable state: every wound bled at the
// same rate, nothing clotted on its own, and all HP recovery stopped until you
// found a bandage. A run with no bandage in it was a run you could not finish,
// which made the dice — not the player — decide the ending.
//
// Two severities instead. A `minor` bleed is atmosphere: it barely drains, it
// clots by itself, and the body keeps recovering through it. A `major` is the
// emergency the bandage economy is actually built around, and it is rare.

export const MINOR_BLEED_DRAIN_PER_HOUR = 0.5;
export const MAJOR_BLEED_DRAIN_PER_HOUR = 2.5;

/** Total drain ceiling across all parts, so four wounds can't spiral. */
export const MAX_BLEED_DRAIN_PER_HOUR = 4;

/** In-game hours a minor bleed takes to clot on its own. */
export const MINOR_BLEED_CLOT_HOURS = 3;

/** Below this damage a wound physically cannot open a major bleed. */
const MAJOR_BLEED_MIN_DAMAGE = 12;
const MAJOR_BLEED_MAX_CHANCE = 0.1;
const MINOR_BLEED_MAX_CHANCE = 0.5;

/** A part already bleeding minor is likelier to tear open into a major. */
const REOPEN_MAJOR_MULT = 2;

const BLEED_DRAIN: Record<BleedLevel, number> = {
  none: 0,
  minor: MINOR_BLEED_DRAIN_PER_HOUR,
  major: MAJOR_BLEED_DRAIN_PER_HOUR,
};

const BLEED_RANK: Record<BleedLevel, number> = { none: 0, minor: 1, major: 2 };

export function initialBodyParts(): BodyParts {
  const parts = {} as BodyParts;
  for (const id of BODY_PART_IDS) parts[id] = { condition: 100, bleed: 'none', bleedHours: 0 };
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
  return BODY_PART_IDS.some((id) => parts[id].bleed !== 'none');
}

/** The worst bleed anywhere on the body — drives the HUD and the log tone. */
export function worstBleed(parts: BodyParts): BleedLevel {
  let worst: BleedLevel = 'none';
  for (const id of BODY_PART_IDS) {
    if (BLEED_RANK[parts[id].bleed] > BLEED_RANK[worst]) worst = parts[id].bleed;
  }
  return worst;
}

export function countBleeding(parts: BodyParts, level: BleedLevel): number {
  return BODY_PART_IDS.filter((id) => parts[id].bleed === level).length;
}

/**
 * How much likelier an encounter is because you are leaking. Blood carries a
 * long way, and this is where bleeding keeps its teeth now that it no longer
 * simply drains you to death — the zombie finds you, the timer doesn't kill you.
 * Additive on the encounter roll, same units as `encounterChanceMod`.
 */
export function bleedEncounterMod(parts: BodyParts): number {
  let mod = 0;
  for (const id of BODY_PART_IDS) {
    if (parts[id].bleed === 'minor') mod += 0.04;
    else if (parts[id].bleed === 'major') mod += 0.1;
  }
  return Math.min(0.2, mod);
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
  const current = parts[target];

  // A major needs a genuinely heavy blow, and even then it is uncommon. Rolled
  // first, because a hit that opens an artery is not also "a small cut".
  let bleed: BleedLevel = current.bleed;
  if (damage >= MAJOR_BLEED_MIN_DAMAGE) {
    const over = (damage - MAJOR_BLEED_MIN_DAMAGE) / 200;
    const reopen = current.bleed === 'minor' ? REOPEN_MAJOR_MULT : 1;
    if (rng.chance(Math.min(MAJOR_BLEED_MAX_CHANCE, over * reopen))) bleed = 'major';
  }
  if (bleed !== 'major' && rng.chance(Math.min(MINOR_BLEED_MAX_CHANCE, damage / 30))) {
    bleed = 'minor';
  }

  // Taking a fresh hit on a part that is already weeping restarts its clock.
  const bleedHours = bleed === 'minor' ? MINOR_BLEED_CLOT_HOURS : 0;

  return {
    ...parts,
    [target]: {
      condition: Math.max(0, current.condition - conditionLoss),
      bleed,
      bleedHours,
    },
  };
}

/**
 * Advance injuries by `hours`. Minor bleeds clot on their own and let the part
 * keep knitting (slowly) while they do; majors do neither. Returns new parts,
 * the total drain per hour, and whether anything is bad enough to hold up the
 * body's passive recovery.
 *
 * `selfStopDisabled` is the Hemophiliac trait: nothing clots by itself, so
 * every scratch has to be dressed by hand.
 */
export function tickInjuries(
  parts: BodyParts,
  hours: number,
  selfStopDisabled = false,
): { parts: BodyParts; bleedDrain: number; blocksRegen: boolean } {
  const next = {} as BodyParts;
  let bleedDrain = 0;
  let blocksRegen = false;

  for (const id of BODY_PART_IDS) {
    const p = parts[id];
    bleedDrain += BLEED_DRAIN[p.bleed];

    if (p.bleed === 'major') {
      // Never clots, never heals, and pins the body's own recovery.
      blocksRegen = true;
      next[id] = p;
      continue;
    }

    if (p.bleed === 'minor') {
      const left = selfStopDisabled ? p.bleedHours : Math.max(0, p.bleedHours - hours);
      next[id] = {
        // Half rate: a weeping wound still closes, just grudgingly.
        condition: Math.min(100, p.condition + PART_REGEN_PER_HOUR * hours * 0.5),
        bleed: left > 0 ? 'minor' : 'none',
        bleedHours: left,
      };
      continue;
    }

    next[id] = {
      condition: Math.min(100, p.condition + PART_REGEN_PER_HOUR * hours),
      bleed: 'none',
      bleedHours: 0,
    };
  }

  return { parts: next, bleedDrain: Math.min(MAX_BLEED_DRAIN_PER_HOUR, bleedDrain), blocksRegen };
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
      if (next[id].bleed !== 'none') next[id] = { ...next[id], bleed: 'none', bleedHours: 0 };
    }
  } else if (stopsBleeding === 'one') {
    // Spend it on the worst bleed on the body — severity first, then condition.
    // A single bandage burnt on a scratch while an artery is open would be a
    // trap, and the player can't aim it.
    let worst: BodyPartId | null = null;
    for (const id of BODY_PART_IDS) {
      if (next[id].bleed === 'none') continue;
      if (
        worst === null ||
        BLEED_RANK[next[id].bleed] > BLEED_RANK[next[worst].bleed] ||
        (BLEED_RANK[next[id].bleed] === BLEED_RANK[next[worst].bleed] &&
          next[id].condition < next[worst].condition)
      ) {
        worst = id;
      }
    }
    if (worst) next[worst] = { ...next[worst], bleed: 'none', bleedHours: 0 };
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

export type ClockFormat = '24' | '12';

/**
 * "08:30" / "19:05", or "8:30 am" / "7:05 pm" on a 12-hour clock. The 24-hour
 * form pads the hour: the timeline now runs the time inline with the entry, and
 * a ragged left edge on the text is worse than one wasted character.
 */
export function formatClock(hour: number, format: ClockFormat = '24'): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  const mm = m.toString().padStart(2, '0');
  if (format === '12') {
    const suffix = h < 12 ? 'am' : 'pm';
    return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${suffix}`;
  }
  return `${h.toString().padStart(2, '0')}:${mm}`;
}
