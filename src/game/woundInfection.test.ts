import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { applyPartDamage, initialBodyParts, legTravelFactor, tickInjuries, totalMaxHp } from './survival';
import {
  applyAntibiotics, applyCare, INFECTED_RECOVERY_MULT, isOpenWound, openWoundCap, WOUND_INFECT_CHECK_HOURS,
  woundCheckRoll, woundInfectChance,
} from './woundCare';
import { effectiveMaxHp, partInjuryEffects } from './injuryEffects';
import type { BodyPart, BodyParts } from './types';

const fresh = () => initialBodyParts(90);

function withPart(parts: BodyParts, id: keyof BodyParts, patch: Partial<BodyPart>): BodyParts {
  return { ...parts, [id]: { ...parts[id], ...patch } };
}

/** A clean, non-bleeding cut on the torso at a given HP. */
function cutTorso(hp: number, patch: Partial<BodyPart> = {}): BodyParts {
  return withPart(fresh(), 'torso', {
    hp, wound: 'cut', dirty: true, dressing: 'none', woundCloseHours: 0, woundAgeHours: 0, infectRoll: 0.5, ...patch,
  });
}

function hoursUntil(parts: BodyParts, done: (p: BodyParts) => boolean, max = 200): number {
  let p = parts;
  for (let h = 0; h < max; h++) {
    if (done(p)) return h;
    p = tickInjuries(p, 1, false, 55).parts;
  }
  return max;
}

describe('open wounds hold back max HP', () => {
  it('a fresh cut caps the part below its max', () => {
    const parts = applyPartDamage(fresh(), 'leftLeg', 6, new Rng('cut'));
    const leg = parts.leftLeg;
    expect(isOpenWound(leg)).toBe(true);
    expect(openWoundCap(leg)).toBeLessThan(leg.maxHp);
    expect(leg.hp).toBeLessThanOrEqual(openWoundCap(leg));
    expect(effectiveMaxHp(parts)).toBeLessThan(totalMaxHp(parts));
  });

  it('regen stops at the cap until the wound closes, then heals to full', () => {
    const start = cutTorso(20);
    const cap = openWoundCap(start.torso);
    const after6 = tickInjuries(start, 6, false, 55).parts.torso;
    expect(after6.hp).toBeLessThanOrEqual(cap);
    const healed = hoursUntil(start, (p) => p.torso.hp >= p.torso.maxHp);
    expect(healed).toBeLessThan(200);
  });

  it('a clean dressing closes a cut much sooner than leaving it', () => {
    const left = cutTorso(30);
    const dressed = applyCare(applyCare(left, 'torso', 'bandage'), 'torso', 'clean');
    const closed = (p: BodyParts) => !isOpenWound(p.torso);
    expect(hoursUntil(dressed, closed)).toBeLessThan(hoursUntil(left, closed));
  });
});

describe('wound infection', () => {
  it('cleaning and antibiotics cut the risk hard; a dressing only somewhat', () => {
    const open = cutTorso(30).torso;
    const raw = woundInfectChance(open);
    const dressed = woundInfectChance({ ...open, dressing: 'clean' });
    const cleaned = woundInfectChance({ ...open, dirty: false });
    const covered = woundInfectChance({ ...open, antibioticHours: 10 });
    expect(dressed).toBeLessThan(raw);
    expect(dressed).toBeGreaterThan(raw / 2);
    expect(cleaned).toBeLessThan(raw / 4);
    expect(covered).toBeLessThan(raw / 4);
    expect(woundInfectChance({ ...open, wound: 'bruise' })).toBe(0);
  });

  /** A seed whose first daily roll lands under `p` (or not). */
  const seedFor = (under: boolean, p: number) => {
    for (let i = 0; i < 1000; i++) {
      const s = i / 1000;
      if ((woundCheckRoll(s, 1) < p) === under) return s;
    }
    throw new Error('no seed');
  };

  it('nothing happens before a full day; an untreated wound can turn at the mark', () => {
    const roll = seedFor(true, 0.5);
    const start = cutTorso(10, { infectRoll: roll, woundAgeHours: 0 });
    const day = tickInjuries(start, WOUND_INFECT_CHECK_HOURS - 0.5, false, 55).parts;
    expect(day.torso.woundInfected).toBeFalsy();
    const past = tickInjuries(day, 1, false, 55).parts;
    expect(past.torso.woundInfected).toBe(true);
  });

  it('the same roll stays clean when the wound was cleaned', () => {
    const roll = seedFor(true, 0.5);
    let start = cutTorso(10, { infectRoll: roll });
    // Same roll, but under the cleaned chance it must miss.
    if (woundCheckRoll(roll, 1) < woundInfectChance({ ...start.torso, dirty: false })) return;
    start = applyCare(start, 'torso', 'clean');
    const past = tickInjuries(start, WOUND_INFECT_CHECK_HOURS + 0.5, false, 55).parts;
    expect(past.torso.woundInfected).toBeFalsy();
  });

  it('an infected wound recovers slower, and antibiotics clear it', () => {
    const base = cutTorso(10, { woundAgeHours: 30 });
    const sick = withPart(base, 'torso', { woundInfected: true });
    const gainClean = tickInjuries(base, 2, false, 55).parts.torso.hp - 10;
    const gainSick = tickInjuries(sick, 2, false, 55).parts.torso.hp - 10;
    expect(gainSick).toBeCloseTo(gainClean * INFECTED_RECOVERY_MULT, 5);
    const treated = applyAntibiotics(sick);
    expect(treated.torso.woundInfected).toBe(false);
    expect(treated.torso.antibioticHours).toBeGreaterThan(0);
    expect(partInjuryEffects(sick, 'torso').some((e) => e.key === 'recovery')).toBe(true);
  });
});

describe('per-part injury effects', () => {
  it('a broken weapon arm shows an accuracy cost; a whole body shows nothing', () => {
    expect(partInjuryEffects(fresh(), 'rightArm')).toEqual([]);
    const broken = withPart(fresh(), 'rightArm', { hp: 3, fractured: true });
    expect(partInjuryEffects(broken, 'rightArm').find((e) => e.key === 'accuracy')?.value).toBeGreaterThanOrEqual(3);
  });

  it('the two legs add up to the travel slowdown the map uses', () => {
    const parts = withPart(withPart(fresh(), 'leftLeg', { hp: 5 }), 'rightLeg', { hp: 9, fractured: true });
    const sum = ['leftLeg', 'rightLeg'].reduce((s, id) =>
      s + (partInjuryEffects(parts, id as 'leftLeg').find((e) => e.key === 'travel')?.value ?? 0), 0);
    expect(Math.abs(sum - Math.round((1 - legTravelFactor(parts)) * 100))).toBeLessThanOrEqual(1);
  });
});
