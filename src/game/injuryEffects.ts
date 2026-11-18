import type { BodyPart, BodyPartId, BodyParts } from './types';
import { BODY_PART_IDS, guardArmFactor, headAwarenessPenalty, headSearchFactor, torsoCarryMult, torsoEnergyDrainMult } from './survival';
import { INFECTED_RECOVERY_MULT, openWoundHpLoss } from './woundCare';

/**
 * What one injured part is costing the survivor right now, as the numbers the
 * game actually applies. Pure and per part, so the Body panel and the pre-fight
 * timeline line read the same figures.
 */
export type InjuryEffectKey =
  | 'accuracy' // flat d20 attack modifier
  | 'block' // % off off-hand block chance / free-hand tempo
  | 'dodge' // percentage points off dodge chance
  | 'travel' // % slower overland travel
  | 'search' // % longer searches
  | 'awareness' // flat perception loss
  | 'energy' // % faster energy drain
  | 'carry' // % less carry capacity
  | 'maxHp' // HP an open wound holds back
  | 'recovery'; // % slower recovery (infected wound)

export interface InjuryEffect {
  key: InjuryEffectKey;
  /** Magnitude of the loss: always positive; `unit` says how to print it. */
  value: number;
  unit: 'flat' | 'pct';
}

function ratio(part: BodyPart): number {
  return part.hp / Math.max(1, part.maxHp);
}

/** Mirrors `functionalPartRatio` in survival.ts: pain relief eases a quarter of soft-tissue loss. */
function functional(part: BodyPart): number {
  const r = ratio(part);
  return (part.painReliefHours ?? 0) > 0 ? r + (1 - r) * 0.25 : r;
}

/** Same terms as `armCombatPenalty`, split per arm. */
function armAccuracy(part: BodyPart, weaponArm: boolean): number {
  let pen = (1 - functional(part)) * (weaponArm ? 3.5 : 1.5);
  if (part.fractured) pen += weaponArm ? 2 : 1;
  if (part.crippled) pen += weaponArm ? 2 : 1;
  return pen;
}

/** Same terms as `legTravelFactor` / `legDodgePenalty`, split per leg. */
function legContribution(part: BodyPart): number {
  let r = functional(part);
  if (part.crippled) r = Math.min(r, 0.1);
  if (part.fractured) r *= part.splinted ? 0.55 : 0.3;
  return r;
}

function legDodge(part: BodyPart): number {
  let pen = (1 - ratio(part)) * 0.04;
  if (part.fractured) pen += 0.02;
  if (part.crippled) pen += 0.03;
  return pen;
}

function push(out: InjuryEffect[], key: InjuryEffectKey, value: number, unit: InjuryEffect['unit']) {
  const rounded = unit === 'pct' ? Math.round(value * 100) : Math.round(value);
  if (rounded > 0) out.push({ key, value: rounded, unit });
}

export function partInjuryEffects(parts: BodyParts, id: BodyPartId): InjuryEffect[] {
  const part = parts[id];
  const out: InjuryEffect[] = [];
  switch (id) {
    case 'rightArm':
      push(out, 'accuracy', armAccuracy(part, true), 'flat');
      break;
    case 'leftArm':
      push(out, 'accuracy', armAccuracy(part, false), 'flat');
      push(out, 'block', 1 - guardArmFactor(parts), 'pct');
      break;
    case 'head':
      push(out, 'accuracy', (1 - functional(part)) * 3, 'flat');
      push(out, 'search', 1 / headSearchFactor(parts) - 1, 'pct');
      push(out, 'awareness', headAwarenessPenalty(parts), 'flat');
      break;
    case 'torso':
      push(out, 'energy', torsoEnergyDrainMult(parts) - 1, 'pct');
      push(out, 'carry', 1 - torsoCarryMult(parts), 'pct');
      break;
    case 'leftLeg':
    case 'rightLeg':
      // Travel = 0.35 + 0.65 × mean(leg contributions): each leg owns half the 0.65.
      push(out, 'travel', 0.325 * (1 - legContribution(part)), 'pct');
      push(out, 'dodge', legDodge(part), 'pct');
      break;
  }
  push(out, 'maxHp', openWoundHpLoss(part), 'flat');
  if (part.woundInfected) push(out, 'recovery', 1 - INFECTED_RECOVERY_MULT, 'pct');
  return out;
}

/** Parts worth mentioning: anything not at full, bleeding, broken or infected. */
export function injuredPartIds(parts: BodyParts): BodyPartId[] {
  return BODY_PART_IDS.filter((id) => {
    const p = parts[id];
    return p.hp < p.maxHp || p.bleed !== 'none' || !!p.fractured || !!p.crippled || !!p.woundInfected;
  });
}

/** Max HP across the body once open wounds take their share — what the health bar tops out at. */
export function effectiveMaxHp(parts: BodyParts): number {
  return BODY_PART_IDS.reduce((s, id) => s + parts[id].maxHp - openWoundHpLoss(parts[id]), 0);
}
