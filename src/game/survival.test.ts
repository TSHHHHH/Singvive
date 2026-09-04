import { describe, expect, it } from 'vitest';
import {
  armCombatPenalty,
  guardArmFactor,
  headAwarenessPenalty,
  headCombatPenalty,
  headSearchFactor,
  initialBodyParts,
  legDodgePenalty,
  legTravelFactor,
  torsoCarryMult,
  torsoEnergyDrainMult,
} from './survival';
import type { BodyPart, BodyParts } from './types';

function withPart(parts: BodyParts, id: keyof BodyParts, patch: Partial<BodyPart>): BodyParts {
  return { ...parts, [id]: { ...parts[id], ...patch } };
}

describe('legTravelFactor', () => {
  it('one crippled + one full leg limps (~0.65–0.72), not ≤0.4', () => {
    let parts = initialBodyParts(100);
    parts = withPart(parts, 'leftLeg', { hp: 0, crippled: true });
    const f = legTravelFactor(parts);
    expect(f).toBeGreaterThan(0.64);
    expect(f).toBeLessThan(0.73);
    expect(f).toBeGreaterThan(0.4);
  });

  it('both crippled crawls near the floor', () => {
    let parts = initialBodyParts(100);
    parts = withPart(parts, 'leftLeg', { hp: 0, crippled: true });
    parts = withPart(parts, 'rightLeg', { hp: 0, crippled: true });
    expect(legTravelFactor(parts)).toBeCloseTo(0.35, 2);
  });

  it('fracture on one healthy leg slows travel harder than old ×0.8', () => {
    let parts = initialBodyParts(100);
    parts = withPart(parts, 'rightLeg', { fractured: true });
    // contrib (1 + 0.3) / 2 = 0.65 → 0.35 + 0.65*0.65 = 0.7725
    expect(legTravelFactor(parts)).toBeCloseTo(0.7725, 3);
    expect(legTravelFactor(parts)).toBeLessThan(0.8);
  });
});

describe('legDodgePenalty', () => {
  it('is separate from travel and mild at empty legs', () => {
    let parts = initialBodyParts(100);
    parts = withPart(parts, 'leftLeg', { hp: 0, crippled: true });
    parts = withPart(parts, 'rightLeg', { hp: 0, crippled: true });
    const pen = legDodgePenalty(parts);
    expect(pen).toBeLessThan(0);
    expect(pen).toBeGreaterThan(-0.2);
  });
});

describe('armCombatPenalty / guardArmFactor', () => {
  it('right-arm 0 HP hurts attack more than left-arm 0 HP', () => {
    const base = initialBodyParts(100);
    const rightDown = withPart(base, 'rightArm', { hp: 0, crippled: true });
    const leftDown = withPart(base, 'leftArm', { hp: 0, crippled: true });
    expect(armCombatPenalty(rightDown)).toBeGreaterThan(armCombatPenalty(leftDown));
  });

  it('left-arm 0 HP lowers guard factor', () => {
    const base = initialBodyParts(100);
    const leftDown = withPart(base, 'leftArm', { hp: 0, crippled: true });
    expect(guardArmFactor(leftDown)).toBeLessThan(0.3);
    expect(guardArmFactor(base)).toBe(1);
  });
});

describe('head / torso helpers', () => {
  it('hit endpoints at full vs empty', () => {
    const full = initialBodyParts(100);
    expect(headCombatPenalty(full)).toBe(0);
    expect(headSearchFactor(full)).toBe(1);
    expect(headAwarenessPenalty(full)).toBe(0);
    expect(torsoEnergyDrainMult(full)).toBe(1);
    expect(torsoCarryMult(full)).toBe(1);

    let empty = full;
    empty = withPart(empty, 'head', { hp: 0 });
    empty = withPart(empty, 'torso', { hp: 0 });
    expect(headCombatPenalty(empty)).toBe(3);
    expect(headSearchFactor(empty)).toBeCloseTo(0.65, 5);
    expect(headAwarenessPenalty(empty)).toBe(3);
    expect(torsoEnergyDrainMult(empty)).toBeCloseTo(1.35, 5);
    expect(torsoCarryMult(empty)).toBeCloseTo(0.75, 5);
  });
});
