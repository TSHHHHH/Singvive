import { describe, expect, it } from 'vitest';
import { initialBodyParts, tickInjuries } from './survival';
import { applyCare, canCareForPart, careForItem, chooseCareTarget, recoverySupportMultiplier } from './woundCare';
import type { BodyPart, BodyParts } from './types';
import { ITEMS } from './loot';

function injury(patch: Partial<BodyPart> = {}): BodyParts {
  const parts = initialBodyParts(100);
  return { ...parts, leftLeg: {
    ...parts.leftLeg, hp: 4, bleed: 'major', wound: 'deep', dirty: true,
    dressing: 'none', dressingHours: 0, ...patch,
  } };
}

describe('targeted care', () => {
  it('gives every medical heal item a usable care action', () => {
    const unmapped = Object.values(ITEMS).filter(item => item.effect.kind === 'heal' && !careForItem(item.id));
    expect(unmapped.map(item => item.id)).toEqual([]);
  });
  it('supplements support all injured parts without restoring HP and cannot be stacked', () => {
    const parts = injury();
    parts.rightArm = { ...parts.rightArm, hp: 3, wound: 'bruise' };
    const supported = applyCare(parts, 'leftLeg', 'support');
    expect(supported.leftLeg.recoveryBoostHours).toBe(8);
    expect(supported.rightArm.recoveryBoostHours).toBe(8);
    expect(supported.rightArm.hp).toBe(3);
    expect(supported.leftLeg.hp).toBe(4);
    expect(applyCare(supported, 'leftLeg', 'support')).toBe(supported);
  });
  it('expires recovery support at the same time in one long advance or many short advances', () => {
    const parts = initialBodyParts(100);
    parts.torso = { ...parts.torso, hp: 1, wound: 'deep' };
    const supported = applyCare(parts, 'torso', 'support');
    const whole = tickInjuries(supported, 9).parts;
    let split = supported;
    for (let i = 0; i < 9; i++) split = tickInjuries(split, 1).parts;
    expect(whole.torso.recoveryBoostHours).toBe(0);
    expect(whole.torso.hp).toBeCloseTo(8.7);
    expect(split.torso.hp).toBeCloseTo(whole.torso.hp);
    expect(tickInjuries(parts, 9).parts.torso.hp).toBeLessThan(whole.torso.hp);
  });
  it('supports recovery with hydration and rest while dehydration still permits healing', () => {
    expect(recoverySupportMultiplier(10)).toBeGreaterThan(0);
    expect(recoverySupportMultiplier(10)).toBeLessThan(recoverySupportMultiplier(50));
    expect(recoverySupportMultiplier(50, 1)).toBeGreaterThan(recoverySupportMultiplier(50));
  });
  it('bandages stop bleeding and protect without granting HP or cleaning', () => {
    const parts = injury();
    const next = applyCare(parts, 'leftLeg', 'bandage');
    expect(next.leftLeg.hp).toBe(4);
    expect(next.leftLeg.dirty).toBe(true);
    expect(next.leftLeg.bleed).toBe('none');
    expect(next.leftLeg.dressing).toBe('clean');
    expect(next.torso).toBe(parts.torso);
    expect(parts.leftLeg.bleed).toBe('major');
  });

  it('cleaning before or after bandaging produces the same wound state', () => {
    const parts = injury();
    const before = applyCare(applyCare(parts, 'leftLeg', 'clean'), 'leftLeg', 'bandage');
    const after = applyCare(applyCare(parts, 'leftLeg', 'bandage'), 'leftLeg', 'clean');
    expect(before.leftLeg).toEqual(after.leftLeg);
    expect(after.leftLeg.dirty).toBe(false);
    expect(after.leftLeg.hp).toBe(4);
  });

  it('supports fractures without curing them and only treats eligible parts', () => {
    const parts = injury({ fractured: true });
    const next = applyCare(parts, 'leftLeg', 'splint');
    expect(next.leftLeg.fractured).toBe(true);
    expect(next.leftLeg.splinted).toBe(true);
    expect(next.leftLeg.hp).toBe(4);
    expect(applyCare(parts, 'torso', 'splint')).toBe(parts);
    expect(applyCare(next, 'leftLeg', 'splint')).toBe(next);
  });

  it('rejects care that would waste supplies while allowing replacement of soiled dressing', () => {
    const healthy = initialBodyParts(100);
    expect(chooseCareTarget(healthy, 'firstAid')).toBeNull();
    expect(applyCare(healthy, 'leftLeg', 'bandage')).toBe(healthy);
    const dressed = injury({ bleed: 'none', dressing: 'clean' });
    expect(canCareForPart(dressed.leftLeg, 'bandage')).toBe(false);
    const soiled = injury({ bleed: 'none', dressing: 'soiled', dressingHours: 14 });
    const fresh = applyCare(soiled, 'leftLeg', 'bandage');
    expect(fresh.leftLeg.dressing).toBe('clean');
    expect(fresh.leftLeg.dressingHours).toBe(0);
    expect(fresh.leftLeg.dirty).toBe(true);
  });

  it('chooses eligible urgent bleeding before low absolute HP', () => {
    const parts = injury();
    parts.head = { ...parts.head, hp: 2, wound: 'cut', bleed: 'minor' };
    expect(chooseCareTarget(parts, 'bandage')).toBe('leftLeg');
    expect(chooseCareTarget(parts, 'splint')).toBeNull();
  });

  it('first aid provides comprehensive targeted stabilization without restoring HP', () => {
    const parts = injury({ fractured: true });
    const treated = applyCare(parts, 'leftLeg', 'firstAid');
    expect(treated.leftLeg).toMatchObject({ hp: 4, dirty: false, bleed: 'none', dressing: 'clean', splinted: true, fractured: true });
    expect(treated.leftLeg.painReliefHours).toBeGreaterThan(0);
    expect(applyCare(treated, 'leftLeg', 'firstAid')).toBe(treated);
  });

  it('pain relief can be used independently of cleaning and dressing', () => {
    const parts = injury();
    const eased = applyCare(parts, 'leftLeg', 'pain');
    expect(eased.leftLeg.painReliefHours).toBeGreaterThan(0);
    expect(eased.leftLeg.hp).toBe(4);
    expect(eased.leftLeg.bleed).toBe('major');
    expect(eased.leftLeg.dirty).toBe(true);
    expect(applyCare(eased, 'leftLeg', 'pain')).toBe(eased);
  });

  it('maps care supplies separately from systemic antibiotics and unrelated items', () => {
    expect(careForItem('bandage')).toBe('bandage');
    expect(careForItem('improvised_bandage')).toBe('bandage');
    expect(careForItem('antiseptic')).toBe('clean');
    expect(careForItem('painkillers')).toBe('pain');
    expect(careForItem('tiger_balm')).toBe('pain');
    expect(careForItem('splint')).toBe('splint');
    expect(careForItem('medkit')).toBe('firstAid');
    expect(careForItem('antibiotics')).toBeNull();
    expect(careForItem('water')).toBeNull();
  });
});
