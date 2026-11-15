import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './store';
import { cancelPersist, flushPersist } from './persistRun';
import { loadRun } from './storage';
import { initialBodyParts } from './survival';
import type { ItemInstance, LocationState } from './types';

const item = (defId: string): ItemInstance => ({
  uid: defId, defId, stack: 2, container: 'backpack', x: 0, y: 0, rotated: false,
});

beforeEach(() => {
  vi.useFakeTimers();
  useGame.setState(useGame.getInitialState(), true);
  useGame.getState().commitCharacter({ name: 'Care tester', traitIds: [],
    attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 } });
  const parts = useGame.getState().bodyParts;
  useGame.setState({ phase: 'game', seed: 'care-test', hour: 10,
    spawn: { lat: 1.3, lng: 103.85, name: 'Care test' },
    meters: { hunger: 80, thirst: 80, energy: 80, infection: 0 },
    bodyParts: { ...parts,
      leftArm: { ...parts.leftArm, hp: 5, bleed: 'major', wound: 'cut', dirty: true },
      rightLeg: { ...parts.rightLeg, hp: 2, bleed: 'major', wound: 'deep', dirty: true },
    }, items: [item('bandage'), item('antiseptic'), item('painkillers')] });
});
afterEach(() => { cancelPersist(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('targeted wound care in the live store', () => {
  it('gives a protected faction bed the same wound recovery support as sheltered sleep', () => {
    const parts = initialBodyParts(100);
    const site: LocationState = { id: 'bed', name: 'Bed', lat: 1.3, lng: 103.85,
      category: 'clinic', size: 'small', baseDanger: 0, currentDanger: 0, discovered: true,
      remainingSearches: 0, exhausted: true, factionId: 'muster', factionServices: ['rest'], distanceFromSpawn: 0 };
    useGame.setState({ hour: 7, locations: { bed: site }, currentPositionId: 'bed',
      factionStanding: { ...useGame.getState().factionStanding, muster: 100 },
      meters: { hunger: 50, thirst: 80, energy: 30, infection: 0 },
      bodyParts: { ...parts, torso: { ...parts.torso, hp: 2, wound: 'deep' } },
    });
    useGame.getState().outpostRest();
    expect(useGame.getState().hour).toBe(8);
    expect(useGame.getState().bodyParts.torso.hp).toBeCloseTo(3.05);
  });
  it('bandages the chosen arm without healing it or cleaning it, and charges supplies/time', () => {
    useGame.getState().applyItem('bandage', 'leftArm');
    const after = useGame.getState();
    expect(after.bodyParts.leftArm.bleed).toBe('none');
    expect(after.bodyParts.leftArm.dirty).toBe(true);
    expect(after.bodyParts.leftArm.hp).toBeLessThan(6);
    expect(after.bodyParts.rightLeg.bleed).toBe('major');
    expect(after.items.find(i => i.uid === 'bandage')?.stack).toBe(1);
    expect(after.hour).toBeCloseTo(10.05);
    expect(after.lastCare?.partId).toBe('leftArm');
  });
  it('allows cleaning without bandaging and leaves systemic infection alone', () => {
    useGame.setState({ meters: { hunger: 80, thirst: 80, energy: 80, infection: 20 } });
    useGame.getState().applyItem('antiseptic', 'leftArm');
    const after = useGame.getState();
    expect(after.bodyParts.leftArm.dirty).toBe(false);
    expect(after.bodyParts.leftArm.bleed).toBe('major');
    expect(after.meters.infection).toBeGreaterThanOrEqual(20);
    expect(after.bodyParts.leftArm.hp).toBeLessThanOrEqual(5);
  });
  it('does not waste supplies or time on a healthy target', () => {
    const before = useGame.getState();
    before.applyItem('bandage', 'head');
    const after = useGame.getState();
    expect(after.items).toBe(before.items);
    expect(after.hour).toBe(before.hour);
    expect(after.bodyParts).toBe(before.bodyParts);
  });
  it('automatically chooses an eligible wound for inventory use', () => {
    useGame.getState().applyItem('bandage');
    const after = useGame.getState();
    expect([after.bodyParts.leftArm, after.bodyParts.rightLeg].filter(p => p.bleed === 'none')).toHaveLength(1);
    expect(after.lastCare?.partId).toBe('rightLeg');
  });
  it('cannot treat using an item stored at another site', () => {
    const before = useGame.getState();
    useGame.setState({ items: [{ ...item('bandage'), container: 'faraway-site' }] });
    useGame.getState().applyItem('bandage', 'leftArm');
    expect(useGame.getState().items[0].stack).toBe(2);
    expect(useGame.getState().bodyParts).toBe(before.bodyParts);
  });
  it('uses one first-aid charge per chosen part and keeps the kit until empty', () => {
    useGame.setState({ items: [{ ...item('medkit'), stack: 1 }] });
    useGame.getState().applyItem('medkit', 'leftArm');
    expect(useGame.getState().items[0].careUses).toBe(2);
    expect(useGame.getState().bodyParts.rightLeg.bleed).toBe('major');
    useGame.getState().applyItem('medkit', 'rightLeg');
    expect(useGame.getState().items[0].careUses).toBe(1);
    expect(useGame.getState().bodyParts.rightLeg.hp).toBeLessThan(3);
    const parts = useGame.getState().bodyParts;
    useGame.setState({ bodyParts: { ...parts, torso: { ...parts.torso, hp: 15, dirty: true, wound: 'cut' } } });
    useGame.getState().applyItem('medkit', 'torso');
    expect(useGame.getState().items).toHaveLength(0);
  });
  it('persists care and remaining kit uses in the existing v7 save', () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    });
    useGame.setState({ items: [{ ...item('medkit'), stack: 1 }] });
    useGame.getState().applyItem('medkit', 'leftArm');
    flushPersist();
    expect(saved.has('singvive.run.v7')).toBe(true);
    const restored = loadRun();
    expect(restored?.bodyParts?.leftArm.dressing).toBe('clean');
    expect(restored?.bodyParts?.leftArm.dirty).toBe(false);
    expect(restored?.items[0].careUses).toBe(2);
  });
  it('does not spend another improvised dressing or award XP when it cannot help', () => {
    useGame.setState({ items: [item('improvised_bandage'), item('bandage')] });
    useGame.getState().applyItem('improvised_bandage', 'leftArm');
    const treated = useGame.getState();
    expect(treated.bodyParts.leftArm.dressing).toBe('soiled');
    expect(treated.bodyParts.leftArm.bleed).toBe('none');
    treated.applyItem('improvised_bandage', 'leftArm');
    expect(useGame.getState().items).toBe(treated.items);
    expect(useGame.getState().hour).toBe(treated.hour);
    expect(useGame.getState().skills).toBe(treated.skills);
    useGame.getState().applyItem('bandage', 'leftArm');
    expect(useGame.getState().bodyParts.leftArm.dressing).toBe('clean');
    expect(useGame.getState().bodyParts.leftArm.dirty).toBe(true);
  });
  it('uses an IFAK once and consumes a supplement for gradual whole-body support', () => {
    useGame.setState({ items: [{ ...item('ifak_pouch'), stack: 1 }, item('vitamin_c')] });
    useGame.getState().applyItem('ifak_pouch', 'leftArm');
    expect(useGame.getState().items.some(i => i.defId === 'ifak_pouch')).toBe(false);
    expect(useGame.getState().bodyParts.leftArm.dressing).toBe('clean');
    expect(useGame.getState().bodyParts.rightLeg.bleed).toBe('major');
    useGame.getState().applyItem('vitamin_c');
    const after = useGame.getState();
    expect(after.items[0].stack).toBe(1);
    expect(after.bodyParts.leftArm.recoveryBoostHours).toBeGreaterThan(7.9);
    expect(after.bodyParts.rightLeg.recoveryBoostHours).toBeGreaterThan(7.9);
    expect(after.bodyParts.leftArm.hp).toBeLessThan(5.5);
    after.applyItem('vitamin_c');
    expect(useGame.getState().items).toBe(after.items);
    expect(useGame.getState().hour).toBe(after.hour);
  });
});
