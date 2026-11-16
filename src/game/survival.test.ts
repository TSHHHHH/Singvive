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
  applyPartDamage,
  migrateBodyParts,
  tickInjuries,
  treatInjuries,
} from './survival';
import { Rng } from './rng';
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

describe('wound recovery', () => {
  it('service treatment stabilizes a wound without granting HP or curing fractures', () => {
    const parts = withPart(initialBodyParts(100), 'leftLeg', {
      hp: 3, bleed: 'major', fractured: true,
    });
    const treated = treatInjuries(parts, 60, 'all', true);
    expect(treated.leftLeg.hp).toBe(3);
    expect(treated.leftLeg.bleed).toBe('none');
    expect(treated.leftLeg.fractured).toBe(true);
    expect(treated.leftLeg.splinted).toBe(true);
  });

  it('keeps dirty recovery positive but slower than clean recovery', () => {
    const base = withPart(initialBodyParts(100), 'torso', { hp: 10, wound: 'cut', dirty: false });
    const dirty = withPart(base, 'torso', { dirty: true });
    const cleanHp = tickInjuries(base, 1).parts.torso.hp;
    const dirtyHp = tickInjuries(dirty, 1).parts.torso.hp;
    expect(dirtyHp).toBeGreaterThan(10);
    expect(dirtyHp).toBeLessThan(cleanHp);
  });

  it('ages dressings over roughly half a day without creating bleeding', () => {
    const base = withPart(initialBodyParts(100), 'torso', {
      hp: 2, wound: 'deep', dressing: 'clean', dressingHours: 0,
    });
    const young = tickInjuries(base, 2).parts.torso;
    expect(young.dressing).toBe('clean');
    const old = tickInjuries(base, 12).parts.torso;
    expect(old.dressing).toBe('soiled');
    expect(old.bleed).toBe('none');
    const fresh = tickInjuries(withPart(base, 'torso', { dressingHours: 0 }), 1).parts.torso;
    const soiled = tickInjuries(withPart(base, 'torso', { dressing: 'soiled', dressingHours: 12 }), 1).parts.torso;
    expect(soiled.hp).toBeGreaterThan(2);
    expect(soiled.hp).toBeLessThan(fresh.hp);
  });

  it('relief temporarily eases pain penalties while preserving structural loss', () => {
    const hurt = withPart(initialBodyParts(100), 'rightArm', { hp: 1, fractured: true });
    const eased = withPart(hurt, 'rightArm', { painReliefHours: 4 });
    expect(armCombatPenalty(eased)).toBeLessThan(armCombatPenalty(hurt));
    expect(armCombatPenalty(eased)).toBeGreaterThan(0);
    const elapsed = tickInjuries(eased, 4, false, 50, 0, 0, 0.1).parts;
    expect(elapsed.rightArm.painReliefHours).toBe(0);
    expect(armCombatPenalty(elapsed)).toBeGreaterThan(armCombatPenalty(withPart(elapsed, 'rightArm', { painReliefHours: 4 })));
    expect(elapsed.rightArm.fractured).toBe(true);
  });

  it('splint support improves movement but fractures heal over days with slower unsupported recovery', () => {
    const fractured = withPart(initialBodyParts(100), 'leftLeg', { fractured: true, fractureRecoveryHours: 0 });
    const supported = withPart(fractured, 'leftLeg', { splinted: true });
    expect(legTravelFactor(supported)).toBeGreaterThan(legTravelFactor(fractured));
    expect(legTravelFactor(supported)).toBeLessThan(1);
    expect(tickInjuries(supported, 12).parts.leftLeg.fractured).toBe(true);
    const healed = tickInjuries(supported, 72).parts.leftLeg;
    const slow = tickInjuries(fractured, 72).parts.leftLeg;
    expect(healed.fractured).toBe(false);
    expect(slow.fractured).toBe(true);
    expect(slow.fractureRecoveryHours).toBeGreaterThan(0);
    expect(tickInjuries(fractured, 168).parts.leftLeg.fractured).toBe(false);
  });

  it('applies recovery support consistently to soft tissue and fractures', () => {
    const parts = withPart(initialBodyParts(100), 'torso', { hp: 1, wound: 'deep' });
    const rested = tickInjuries(parts, 1, false, 50, 0, 0, 1.5).parts;
    const strained = tickInjuries(parts, 1, false, 50, 0, 0, 0.5).parts;
    expect(rested.torso.hp).toBeGreaterThan(strained.torso.hp);
    expect(strained.torso.hp).toBeGreaterThan(1);
  });

  it('a major bleed blocks recovery everywhere regardless of which part carries it', () => {
    let injured = initialBodyParts(100);
    injured = withPart(injured, 'head', { hp: 5 });
    injured = withPart(injured, 'rightArm', { hp: 4 });
    injured = withPart(injured, 'rightLeg', { bleed: 'major' });
    const next = tickInjuries(injured, 1);
    expect(next.blocksRegen).toBe(true);
    expect(next.parts.head.hp).toBe(5);
    expect(next.parts.rightArm.hp).toBe(4);
  });

  it('a new impact creates a wound and damages an existing dressing', () => {
    const parts = withPart(initialBodyParts(100), 'torso', { dressing: 'clean', dressingHours: 1 });
    const hurt = applyPartDamage(parts, 'torso', 5, new Rng('new-wound'));
    expect(hurt.torso.wound).toBeDefined();
    expect(hurt.torso.dirty).toBe(true);
    expect(hurt.torso.dressing).toBe('soiled');
  });

  it('normalizes v7 injury saves without replacing existing care', () => {
    const old = withPart(initialBodyParts(100), 'leftLeg', { hp: 3, bleed: 'major', fractured: true });
    const migrated = migrateBodyParts(old, 100);
    expect(migrated.leftLeg.wound).toBe('deep');
    expect(migrated.leftLeg.dirty).toBe(true);
    expect(migrated.leftLeg.dressing).toBe('none');
    expect(migrated.leftLeg.fractureRecoveryHours).toBe(0);
    const cared = withPart(migrated, 'leftLeg', {
      dirty: false, dressing: 'clean', dressingHours: 7, splinted: true,
      painReliefHours: 2, fractureRecoveryHours: 24,
    });
    expect(migrateBodyParts(cared, 100)).toEqual(cared);
  });

  it('migrates legacy condition saves and tolerates missing individual parts', () => {
    const old = { leftLeg: { condition: 50, bleed: 'minor', bleedHours: 2 } } as unknown as BodyParts;
    const migrated = migrateBodyParts(old, 100);
    expect(migrated.leftLeg.hp).toBe(8);
    expect(migrated.leftLeg.wound).toBe('cut');
    expect(migrated.head.hp).toBe(12);
  });

  it('eventually recovers from crippling strain without requiring medical supplies', () => {
    const strained = withPart(initialBodyParts(100), 'leftLeg', { hp: 0, crippled: true, wound: 'bruise' });
    const recovered = tickInjuries(strained, 24).parts.leftLeg;
    expect(recovered.hp).toBe(15);
    expect(recovered.crippled).toBe(false);
  });

  it('matches split clock advancement when clotting and dressing expiry happen inside a rest', () => {
    const parts = withPart(initialBodyParts(100), 'torso', {
      hp: 10, wound: 'deep', dirty: true,
      bleed: 'minor', bleedHours: 2, dressing: 'clean', dressingHours: 11,
    });
    const whole = tickInjuries(parts, 4).parts.torso;
    let split = parts;
    for (let i = 0; i < 16; i++) split = tickInjuries(split, 0.25).parts;
    expect(whole.hp).toBeCloseTo(split.torso.hp, 8);
    expect(whole.bleed).toBe(split.torso.bleed);
    expect(whole.dressing).toBe(split.torso.dressing);
  });

  it('matches split fracture recovery and relief expiry during a long rest', () => {
    const parts = withPart(initialBodyParts(100), 'leftLeg', {
      hp: 1, crippled: true, fractured: true, splinted: true,
      wound: 'deep', dirty: true, painReliefHours: 2,
      fractureRecoveryHours: 70,
    });
    const whole = tickInjuries(parts, 8).parts.leftLeg;
    let split = parts;
    for (let i = 0; i < 32; i++) split = tickInjuries(split, 0.25).parts;
    expect(whole.hp).toBeCloseTo(split.leftLeg.hp, 8);
    expect(whole.fractured).toBe(false);
    expect(whole.fractured).toBe(split.leftLeg.fractured);
    expect(whole.painReliefHours).toBe(0);
    expect(whole.fractureRecoveryHours).toBeCloseTo(split.leftLeg.fractureRecoveryHours ?? 0, 8);
  });
});
