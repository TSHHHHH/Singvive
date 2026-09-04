import type { BleedLevel, BodyPart, BodyPartId, BodyParts, ItemModifiers, Meters } from './types';
import type { Rng } from './rng';

export const HOURS_PER_DAY = 24;
export const START_HOUR = 8; // survivors wake at 8am
export const METER_MAX = 100;

/** Passive depletion per HOUR spent awake/active. */
export const DEPLETION_PER_HOUR = {
  hunger: 2.4,
  thirst: 3.2,
  energy: 4.5,
};

/**
 * Sleep still burns less than a waking day, but a full night should cost real
 * food and water — not leave the pack untouched until morning.
 */
export const SLEEP_DEPLETION_MULT = 0.55;

/** Below this, an empty stomach / dry throat starts costing HP. */
export const STARVING_THRESHOLD = 35;
/** HP per hour lost at a completely empty meter (scales in from the threshold). */
const STARVE_HP_PER_HOUR = 4;
const DEHYDRATE_HP_PER_HOUR = 6;

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

/** How much energy a rest actually returns. 0.0x .. 2.0x */
export function restEnergyMultiplier(hunger: number, thirst: number): number {
  return 1.0 + getMeterDelta(hunger) * 0.4 + getMeterDelta(thirst) * 0.6;
}

/** Energy burn rate while moving/acting — dehydration burns up to 1.45x faster. */
export function activeEnergyDrainMultiplier(thirst: number): number {
  return 1.0 - getMeterDelta(thirst) * 0.45;
}

/** Walking pace scaling from energy. 0.6x .. 1.4x */
export function travelSpeedMultiplier(energy: number): number {
  return 1.0 + getMeterDelta(energy) * 0.4;
}

/** d20 attack-roll bonus from energy. −3 .. +3 */
export function energyAttackBonus(energy: number): number {
  return Math.round(getMeterDelta(energy) * 3);
}

/** Additional chance to slip a connecting blow. −0.10 .. +0.10 */
export function energyDodgeBonus(energy: number): number {
  return getMeterDelta(energy) * 0.1;
}

/** Flee DC shift — exhaustion makes breaking contact harder. +3 .. −3 */
export function energyFleeDcModifier(energy: number): number {
  return -Math.round(getMeterDelta(energy) * 3);
}

export function initialMeters(): Meters {
  return {
    hunger: 55,
    thirst: 55,
    energy: 65,
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
      out.push({ text: `${pctLabel(hpRegenMultiplier(meters.hunger))} limb recovery`, good: d > 0 });
      out.push({ text: `${pctLabel(1 + d * 0.4)} rest energy gain`, good: d > 0 });
      break;
    }
    case 'thirst': {
      const d = getMeterDelta(meters.thirst);
      if (d === 0) break;
      out.push({ text: `${pctLabel(1 + d * 0.6)} rest energy gain`, good: d > 0 });
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
 * Advance survival meters by `hours`. Hunger/thirst/energy drain only — limb HP
 * and systemic damage live in `tickInjuries` / `tickSystemicDamage`.
 */
export function tickMeters(
  meters: Meters,
  hours: number,
  opts: {
    sleeping?: boolean;
    thirstMult?: number;
    energyMult?: number;
    /** Trait hungerDrainMod sum (multiplier delta). */
    hungerDrainMod?: number;
    thirstDrainMod?: number;
    energyDrainMod?: number;
    /** Applied when outdoors or in heat weather. */
    outdoorEnergyDrainMod?: number;
    outdoors?: boolean;
    heat?: boolean;
  } = {},
): Meters {
  const mult = opts.sleeping ? SLEEP_DEPLETION_MULT : 1;
  const envThirst = opts.thirstMult ?? 1;
  const envEnergy = opts.energyMult ?? 1;
  const hungerMult = 1 + (opts.hungerDrainMod ?? 0);
  const thirstTraitMult = 1 + (opts.thirstDrainMod ?? 0);
  const outdoor =
    (opts.outdoors || opts.heat) && (opts.outdoorEnergyDrainMod ?? 0) !== 0
      ? 1 + (opts.outdoorEnergyDrainMod ?? 0)
      : 1;
  const energyTraitMult = (1 + (opts.energyDrainMod ?? 0)) * outdoor;
  const hunger = clampMeter(
    meters.hunger - DEPLETION_PER_HOUR.hunger * hours * mult * Math.max(0.1, hungerMult),
  );
  const thirst = clampMeter(
    meters.thirst -
      DEPLETION_PER_HOUR.thirst * hours * mult * envThirst * Math.max(0.1, thirstTraitMult),
  );
  const energyMult =
    (opts.sleeping ? mult : activeEnergyDrainMultiplier(meters.thirst)) *
    envEnergy *
    Math.max(0.1, energyTraitMult);
  const energy = clampMeter(meters.energy - DEPLETION_PER_HOUR.energy * hours * energyMult);

  return { hunger, thirst, energy, infection: meters.infection };
}

// ---------- Vitality (limb HP) ----------

/** Share of total body HP each part receives at spawn. */
export const PART_HP_SHARE: Record<BodyPartId, number> = {
  head: 0.12,
  torso: 0.42,
  leftArm: 0.08,
  rightArm: 0.08,
  leftLeg: 0.15,
  rightLeg: 0.15,
};

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

/** Relative chance a blow lands on each part (before head-gear adjustment). */
const HIT_ZONE_WEIGHTS: [BodyPartId, number][] = [
  ['torso', 32],
  ['head', 8],
  ['leftArm', 15],
  ['rightArm', 16],
  ['leftLeg', 14],
  ['rightLeg', 15],
];

export const HEAD_CRIT_DAMAGE_MULT = 1.6;
export const CRIPPLED_HEAL_CAP = 0.7;
const FRACTURE_MIN_DAMAGE = 15;
const FRACTURE_CHANCE = 0.22;
const PART_REGEN_PER_HOUR = 2;
const CRIPPLED_REGEN_CAP = CRIPPLED_HEAL_CAP;

// ---------- Bleeding ----------

export const MINOR_BLEED_DRAIN_PER_HOUR = 0.5;
export const MAJOR_BLEED_DRAIN_PER_HOUR = 2.5;
export const MAX_BLEED_DRAIN_PER_HOUR = 4;
export const MINOR_BLEED_CLOT_HOURS = 3;

const MAJOR_BLEED_MIN_DAMAGE = 12;
const MAJOR_BLEED_MAX_CHANCE = 0.1;
const MINOR_BLEED_MAX_CHANCE = 0.5;
const REOPEN_MAJOR_MULT = 2;

const BLEED_DRAIN: Record<BleedLevel, number> = {
  none: 0,
  minor: MINOR_BLEED_DRAIN_PER_HOUR,
  major: MAJOR_BLEED_DRAIN_PER_HOUR,
};

const BLEED_RANK: Record<BleedLevel, number> = { none: 0, minor: 1, major: 2 };

const LIMB_IDS: BodyPartId[] = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

export function partHpShare(id: BodyPartId, totalMaxHp: number): number {
  return Math.max(1, Math.round(totalMaxHp * PART_HP_SHARE[id]));
}

export function initialBodyParts(totalMaxHp: number): BodyParts {
  const parts = {} as BodyParts;
  for (const id of BODY_PART_IDS) {
    const maxHp = partHpShare(id, totalMaxHp);
    parts[id] = { hp: maxHp, maxHp, bleed: 'none', bleedHours: 0, fractured: false, crippled: false };
  }
  return parts;
}

export function totalHp(parts: BodyParts): number {
  return BODY_PART_IDS.reduce((s, id) => s + parts[id].hp, 0);
}

export function totalMaxHp(parts: BodyParts): number {
  return BODY_PART_IDS.reduce((s, id) => s + parts[id].maxHp, 0);
}

/** Back-compat alias — several UI sites read "effective max". */
export function effectiveMaxHp(_baseMaxHp: number, parts: BodyParts): number {
  return totalMaxHp(parts);
}

export function totalInjuryPenalty(_baseMaxHp: number, parts: BodyParts): number {
  return totalMaxHp(parts) - totalHp(parts);
}

/** 0..100 for doll colouring and display. */
export function partConditionPct(part: BodyPart): number {
  if (part.maxHp <= 0) return 0;
  return (part.hp / part.maxHp) * 100;
}

export function avgPartRatio(parts: BodyParts, ids: BodyPartId[]): number {
  if (ids.length === 0) return 1;
  return ids.reduce((s, id) => s + parts[id].hp / Math.max(1, parts[id].maxHp), 0) / ids.length;
}

export function anyBleeding(parts: BodyParts): boolean {
  return BODY_PART_IDS.some((id) => parts[id].bleed !== 'none');
}

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

export function bleedEncounterMod(parts: BodyParts): number {
  let mod = 0;
  for (const id of BODY_PART_IDS) {
    if (parts[id].bleed === 'minor') mod += 0.04;
    else if (parts[id].bleed === 'major') mod += 0.1;
  }
  return Math.min(0.2, mod);
}

/**
 * Per-leg contribution to overland travel. Fractures and cripples bite the
 * contribution of that leg only — one healthy leg still limps you forward.
 * Travel only; do not feed combat gauge fill.
 */
function legTravelContribution(part: BodyPart): number {
  let r = part.hp / Math.max(1, part.maxHp);
  if (part.crippled) r = Math.min(r, 0.1);
  if (part.fractured) r *= 0.3;
  return r;
}

/** Map speed multiplier from legs (1 = healthy). Not used for swing/reload fill. */
export function legTravelFactor(parts: BodyParts): number {
  const avg =
    (legTravelContribution(parts.leftLeg) + legTravelContribution(parts.rightLeg)) / 2;
  return 0.35 + 0.65 * avg;
}

/**
 * Mild footwork hit for dodge only — separate from travel limp so a bad leg
 * slows the map without throttling the combat gauge.
 */
export function legDodgePenalty(parts: BodyParts): number {
  let pen = (avgPartRatio(parts, ['leftLeg', 'rightLeg']) - 1) * 0.08;
  if (parts.leftLeg.fractured || parts.rightLeg.fractured) pen -= 0.02;
  if (parts.leftLeg.crippled || parts.rightLeg.crippled) pen -= 0.03;
  return pen;
}

function partRatio(part: BodyPart): number {
  return part.hp / Math.max(1, part.maxHp);
}

/**
 * Attack accuracy penalty from arms. Right = weapon arm, left = guard / off-hand.
 */
export function armCombatPenalty(parts: BodyParts): number {
  const right = parts.rightArm;
  const left = parts.leftArm;
  let weapon = (1 - partRatio(right)) * 3.5;
  let guard = (1 - partRatio(left)) * 1.5;
  if (right.fractured) weapon += 2;
  if (right.crippled) weapon += 2;
  if (left.fractured) guard += 1;
  if (left.crippled) guard += 1;
  return Math.round(weapon + guard);
}

/**
 * 0..1 multiplier on off-hand block chance and free-hand tempo from the guard arm.
 */
export function guardArmFactor(parts: BodyParts): number {
  const left = parts.leftArm;
  let f = partRatio(left);
  if (left.fractured) f *= 0.55;
  if (left.crippled) f = Math.min(f, 0.25);
  return Math.max(0.15, f);
}

/** Head wound → attack accuracy (0..3). */
export function headCombatPenalty(parts: BodyParts): number {
  return Math.round((1 - partRatio(parts.head)) * 3);
}

/**
 * Head wound search *rate* (1 = healthy, 0.65 = empty). Duration callers should
 * divide speedFactor by this (higher duration when hurt).
 */
export function headSearchFactor(parts: BodyParts): number {
  return 0.65 + 0.35 * partRatio(parts.head);
}

/** Flat perception/awareness loss from a battered skull. */
export function headAwarenessPenalty(parts: BodyParts): number {
  return Math.floor((1 - partRatio(parts.head)) * 3);
}

/** Multiplier on hourly energy drain from torso trauma (1 = healthy). */
export function torsoEnergyDrainMult(parts: BodyParts): number {
  return 1 + (1 - partRatio(parts.torso)) * 0.35;
}

/** Multiplier on carry capacity from torso trauma (1 = healthy). */
export function torsoCarryMult(parts: BodyParts): number {
  return 0.75 + 0.25 * partRatio(parts.torso);
}

/** Head gear shrinks how often the head zone is rolled. */
export function headTargetReductionFromGear(
  modifiers: Array<ItemModifiers | undefined>,
): number {
  let best = 0;
  for (const m of modifiers) {
    if (m?.headTargetReduction && m.headTargetReduction > best) best = m.headTargetReduction;
  }
  return best;
}

export function headCritReductionFromGear(modifiers: Array<ItemModifiers | undefined>): number {
  let best = 0;
  for (const m of modifiers) {
    if (m?.headCritReduction && m.headCritReduction > best) best = m.headCritReduction;
  }
  return best;
}

export function rollHitZone(rng: Rng, headWeightScale = 1): BodyPartId {
  const weights: [BodyPartId, number][] = HIT_ZONE_WEIGHTS.map(([id, w]) =>
    id === 'head' ? [id, Math.max(1, w * headWeightScale)] : [id, w],
  );
  return rng.weighted(weights);
}

function rollBleed(
  damage: number,
  current: BodyPart,
  rng: Rng,
  critical: boolean,
  statusResist = 0,
): { bleed: BleedLevel; bleedHours: number } {
  let bleed: BleedLevel = current.bleed;
  const resist = Math.max(0, Math.min(1, statusResist));
  const majorMult = critical ? 2 : 1;
  if (damage >= MAJOR_BLEED_MIN_DAMAGE) {
    const over = (damage - MAJOR_BLEED_MIN_DAMAGE) / 200;
    const reopen = current.bleed === 'minor' ? REOPEN_MAJOR_MULT : 1;
    const chance = Math.min(MAJOR_BLEED_MAX_CHANCE * majorMult, over * reopen * majorMult) * (1 - resist);
    if (rng.chance(chance)) {
      bleed = 'major';
    }
  }
  if (bleed !== 'major' && rng.chance(Math.min(MINOR_BLEED_MAX_CHANCE, damage / 30) * (1 - resist))) {
    bleed = 'minor';
  }
  const bleedHours = bleed === 'minor' ? MINOR_BLEED_CLOT_HOURS : 0;
  return { bleed, bleedHours };
}

function applyDamageToSinglePart(
  parts: BodyParts,
  zone: BodyPartId,
  rawDamage: number,
  rng: Rng,
  opts: {
    critical?: boolean;
    limbDamageMult?: number;
    spillFromHead?: boolean;
    statusResist?: number;
  } = {},
): BodyParts {
  const limbMult = opts.limbDamageMult ?? 1;
  const damage = Math.max(1, Math.round(rawDamage * limbMult));
  const current = parts[zone];
  const hpLoss = Math.min(current.hp, damage);
  const statusResist = opts.statusResist ?? 0;
  const { bleed, bleedHours } = rollBleed(damage, current, rng, !!opts.critical, statusResist);
  let fractured = current.fractured;
  if (
    LIMB_IDS.includes(zone) &&
    damage >= FRACTURE_MIN_DAMAGE &&
    rng.chance(FRACTURE_CHANCE * (opts.critical ? 1.5 : 1) * (1 - Math.max(0, Math.min(1, statusResist))))
  ) {
    fractured = true;
  }
  const hp = Math.max(0, current.hp - hpLoss);
  const crippled = hp <= 0 ? true : current.crippled;
  // Follow-up force into an already-empty torso is a mortal wound.
  const mortalWound =
    zone === 'torso' && current.hp <= 0 ? true : current.mortalWound;
  return {
    ...parts,
    [zone]: { ...current, hp, bleed, bleedHours, fractured, crippled, mortalWound },
  };
}

/**
 * Hit the torso: first empty → Critical (survive) and spill overkill to a
 * random other part. Another hit while already at 0 → mortalWound.
 */
function applyTorsoHit(
  parts: BodyParts,
  dmg: number,
  rng: Rng,
  opts: {
    critical?: boolean;
    statusResist?: number;
    spillFromHead?: boolean;
  } = {},
): BodyParts {
  const torso = parts.torso;
  if (torso.hp <= 0) {
    return {
      ...parts,
      torso: { ...torso, crippled: true, mortalWound: true },
    };
  }

  const torsoLoss = Math.min(dmg, torso.hp);
  const spill = dmg - torsoLoss;
  let next = applyDamageToSinglePart(parts, 'torso', torsoLoss, rng, {
    critical: opts.critical,
    limbDamageMult: 1,
    spillFromHead: opts.spillFromHead,
    statusResist: opts.statusResist,
  });
  if (spill > 0) {
    const others = BODY_PART_IDS.filter((id) => id !== 'torso');
    const target = rng.fork('spillZone').pick(others);
    next = applyDamageToSinglePart(next, target, spill, rng.fork('spill'), {
      limbDamageMult: 1,
      statusResist: opts.spillFromHead ? undefined : opts.statusResist,
    });
  }
  return next;
}

/**
 * Apply combat or hazard damage to a zone. Head and torso overkill spill into
 * other parts instead of deleting the survivor on the first empty vital.
 */
export function applyPartDamage(
  parts: BodyParts,
  zone: BodyPartId,
  rawDamage: number,
  rng: Rng,
  opts: {
    critical?: boolean;
    limbDamageMult?: number;
    headCritReduction?: number;
    statusResist?: number;
  } = {},
): BodyParts {
  const critical = !!opts.critical || zone === 'head';
  const mult = opts.limbDamageMult ?? 1;
  let dmg = Math.max(1, Math.round(rawDamage * mult));
  if (zone === 'head' && critical) {
    const critMult =
      HEAD_CRIT_DAMAGE_MULT - (HEAD_CRIT_DAMAGE_MULT - 1) * (opts.headCritReduction ?? 0);
    dmg = Math.round(dmg * critMult);
  }

  if (zone === 'head') {
    const head = parts.head;
    const headLoss = Math.min(dmg, head.hp);
    const spill = dmg - headLoss;
    let next =
      headLoss > 0
        ? applyDamageToSinglePart(parts, 'head', headLoss, rng, {
            critical: true,
            limbDamageMult: 1,
            statusResist: opts.statusResist,
          })
        : parts;
    if (spill > 0) {
      // Spill is raw force past the helmet — torso kit still helps statuses on
      // the body hit itself; further limb spill drops status resist.
      next = applyTorsoHit(next, spill, rng.fork('spill'), {
        spillFromHead: true,
        statusResist: undefined,
      });
    }
    return next;
  }

  if (zone === 'torso') {
    return applyTorsoHit(parts, dmg, rng, {
      critical,
      statusResist: opts.statusResist,
    });
  }

  return applyDamageToSinglePart(parts, zone, dmg, rng, {
    critical,
    limbDamageMult: 1,
    statusResist: opts.statusResist,
  });
}

/** Weighted-random wound — for encounters outside combat hit-zone resolution. */
export function applyWound(
  parts: BodyParts,
  damage: number,
  rng: Rng,
  limbDamageMult = 1,
): BodyParts {
  const zone = rollHitZone(rng);
  return applyPartDamage(parts, zone, damage, rng.fork('wound'), {
    critical: zone === 'head',
    limbDamageMult,
  });
}

function regenCap(part: BodyPart): number {
  if (part.crippled && part.fractured) return Math.round(part.maxHp * CRIPPLED_REGEN_CAP);
  if (part.crippled) return Math.round(part.maxHp * CRIPPLED_REGEN_CAP);
  return part.maxHp;
}

function tickPartBleedDrain(part: BodyPart, hours: number): BodyPart {
  if (part.bleed === 'none') return part;
  const drain = BLEED_DRAIN[part.bleed] * hours;
  return { ...part, hp: Math.max(0, part.hp - drain) };
}

/**
 * Advance injuries: bleed drain on parts, clotting, passive regen. Returns
 * whether a major bleed is blocking recovery.
 */
export function tickInjuries(
  parts: BodyParts,
  hours: number,
  selfStopDisabled = false,
  hunger = 50,
  legHealMod = 0,
  bleedStopBonus = 0,
): { parts: BodyParts; blocksRegen: boolean } {
  const next = {} as BodyParts;
  let blocksRegen = false;
  const regenMult = hpRegenMultiplier(hunger);
  const legMult = Math.max(0.1, 1 + legHealMod);

  for (const id of BODY_PART_IDS) {
    let p = tickPartBleedDrain(parts[id], hours);
    if (p.bleed === 'major') blocksRegen = true;
    const partRegenMult = id === 'leftLeg' || id === 'rightLeg' ? legMult : 1;

    if (p.bleed === 'major') {
      if (p.hp <= 0) p = { ...p, crippled: true };
      next[id] = p;
      continue;
    }

    if (p.bleed === 'minor') {
      const left = selfStopDisabled
        ? p.bleedHours
        : Math.max(0, p.bleedHours - hours * (1 + bleedStopBonus));
      const rate = PART_REGEN_PER_HOUR * hours * 0.5 * regenMult * partRegenMult;
      const cap = regenCap(p);
      p = {
        ...p,
        hp: Math.min(cap, p.hp + rate),
        bleed: left > 0 ? 'minor' : 'none',
        bleedHours: left,
      };
      if (p.hp <= 0) p = { ...p, crippled: true };
      next[id] = p;
      continue;
    }

    if (!blocksRegen) {
      const rate = PART_REGEN_PER_HOUR * hours * regenMult * partRegenMult;
      const cap = regenCap(p);
      p = { ...p, hp: Math.min(cap, p.hp + rate) };
    }
    if (p.hp <= 0) p = { ...p, crippled: true };
    else if (p.hp >= p.maxHp * 0.85 && !p.fractured) p = { ...p, crippled: false };
    next[id] = p;
  }

  return { parts: next, blocksRegen };
}

/** Starvation, dehydration, and infection wear on the torso first. */
export function tickSystemicDamage(
  parts: BodyParts,
  meters: Meters,
  hours: number,
): BodyParts {
  const starving = starvationSeverity(meters.hunger);
  const parched = starvationSeverity(meters.thirst);
  let dmg =
    starving * STARVE_HP_PER_HOUR * hours +
    parched * DEHYDRATE_HP_PER_HOUR * hours +
    (meters.infection > 0 ? (meters.infection / 25) * hours : 0);
  if (dmg <= 0) return parts;

  dmg = Math.round(dmg);
  const torso = parts.torso;
  const loss = Math.min(torso.hp, dmg);
  const spill = dmg - loss;
  let next: BodyParts = {
    ...parts,
    torso: {
      ...torso,
      hp: Math.max(0, torso.hp - loss),
      crippled: torso.hp - loss <= 0,
    },
  };
  if (spill > 0) {
    // Leftover systemic damage spreads to other parts evenly.
    const others = BODY_PART_IDS.filter((id) => id !== 'torso');
    let left = spill;
    for (const id of others) {
      if (left <= 0) break;
      const p = next[id];
      const take = Math.min(left, Math.ceil(spill / others.length));
      next = {
        ...next,
        [id]: { ...p, hp: Math.max(0, p.hp - take), crippled: p.hp - take <= 0 },
      };
      left -= take;
    }
  }
  return next;
}

/** Old saves stored `condition` 0..100; map into limb HP pools. */
export function migrateBodyParts(
  parts: BodyParts | undefined,
  totalMaxHp: number,
): BodyParts {
  if (!parts) return initialBodyParts(totalMaxHp);
  const sample = parts[BODY_PART_IDS[0]] as BodyPart & { condition?: number };
  if (sample && typeof sample.hp === 'number' && typeof sample.maxHp === 'number') {
    return parts;
  }
  const next = initialBodyParts(totalMaxHp);
  for (const id of BODY_PART_IDS) {
    const legacy = parts[id] as BodyPart & { condition?: number };
    const pct =
      typeof legacy.condition === 'number'
        ? legacy.condition / 100
        : typeof legacy.hp === 'number' && legacy.maxHp
          ? legacy.hp / legacy.maxHp
          : 1;
    next[id] = {
      ...next[id],
      hp: Math.max(0, Math.round(next[id].maxHp * pct)),
      bleed: legacy.bleed ?? 'none',
      bleedHours: legacy.bleedHours ?? 0,
      fractured: legacy.fractured ?? false,
      crippled: legacy.crippled ?? legacy.hp === 0,
    };
  }
  return next;
}

/** Strip the removed global health field from older saves. */
export function migrateMeters(meters: Meters & { health?: number }): Meters {
  return {
    hunger: meters.hunger,
    thirst: meters.thirst,
    energy: meters.energy,
    infection: meters.infection,
  };
}

export function treatInjuries(
  parts: BodyParts,
  partHeal: number,
  stopsBleeding: 'one' | 'all' | undefined,
  clearsFracture = false,
): BodyParts {
  const next: BodyParts = { ...parts };

  if (stopsBleeding === 'all') {
    for (const id of BODY_PART_IDS) {
      if (next[id].bleed !== 'none') next[id] = { ...next[id], bleed: 'none', bleedHours: 0 };
    }
  } else if (stopsBleeding === 'one') {
    let worst: BodyPartId | null = null;
    for (const id of BODY_PART_IDS) {
      if (next[id].bleed === 'none') continue;
      if (
        worst === null ||
        BLEED_RANK[next[id].bleed] > BLEED_RANK[next[worst].bleed] ||
        (BLEED_RANK[next[id].bleed] === BLEED_RANK[next[worst].bleed] &&
          next[id].hp < next[worst].hp)
      ) {
        worst = id;
      }
    }
    if (worst) next[worst] = { ...next[worst], bleed: 'none', bleedHours: 0 };
  }

  if (partHeal > 0 || clearsFracture) {
    let target: BodyPartId | null = null;
    for (const id of BODY_PART_IDS) {
      if (next[id].hp < next[id].maxHp && (target === null || next[id].hp < next[target].hp)) {
        target = id;
      }
    }
    if (target) {
      const p = next[target];
      next[target] = {
        ...p,
        hp: Math.min(p.maxHp, p.hp + partHeal),
        fractured: clearsFracture ? false : p.fractured,
        crippled: clearsFracture ? false : p.crippled && p.hp + partHeal < p.maxHp * CRIPPLED_HEAL_CAP,
      };
      if (next[target].hp >= next[target].maxHp * 0.85) {
        next[target] = { ...next[target], crippled: false };
      }
    }
  }

  return next;
}

export const REST_ENERGY_PER_HOUR = 5.5;

/**
 * Restore energy from sleeping `hours`, on top of the normal drain tick. Sleep
 * on an empty stomach and a dry throat and the night gives much less back.
 */
export function sleepRestore(
  energy: number,
  hours: number,
  fuel: { hunger: number; thirst: number } = { hunger: 50, thirst: 50 },
  sleepRestoreMod = 0,
): number {
  const traitMult = Math.max(0.1, 1 + sleepRestoreMod);
  const gain =
    hours * REST_ENERGY_PER_HOUR * restEnergyMultiplier(fuel.hunger, fuel.thirst) * traitMult;
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
  if (parts) {
    // Empty torso is Critical, not death — a follow-up mortalWound ends it.
    if (parts.torso.mortalWound) return 'torso';
    const hp = totalHp(parts);
    if (hp <= 0) {
      if (parts.torso.hp <= 0) return 'torso';
      if (parts.head.hp <= 0) return 'head';
      if (meters.thirst <= 0) return 'dehydration';
      if (meters.hunger <= 0) return 'starvation';
      return 'health';
    }
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
  const runValue = kills * 25 + lootValue + days * 50;
  return Math.round(runValue * scoreDayMult(days));
}

/**
 * Score multiplier that rises with days survived. Day 1 = 1.0x; each further
 * day adds 0.1x. Shared by survival score and the extract bonus so the best
 * board run is a long life capped by a successful late evac.
 */
export function scoreDayMult(days: number): number {
  return 1 + Math.max(0, days - 1) * 0.1;
}

/** One-time extract seal — scaled by the same day multiplier as survival. */
export function computeEvacBonus(days: number, baseBonus: number): number {
  return Math.round(baseBonus * scoreDayMult(days));
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
