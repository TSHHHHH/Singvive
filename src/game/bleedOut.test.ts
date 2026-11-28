import { describe, expect, it } from 'vitest';
import { checkDeath, initialBodyParts, MAJOR_BLEED_DRAIN_PER_HOUR, tickInjuries, totalHp } from './survival';
import type { BodyParts, Meters } from './types';

const meters: Meters = { hunger: 80, thirst: 80, energy: 80, infection: 0 } as Meters;

function armBleeding(hp: number): BodyParts {
  const parts = initialBodyParts(90);
  return { ...parts, leftArm: { ...parts.leftArm, hp, bleed: 'major', wound: 'deep' } };
}

describe('untreated major bleed', () => {
  it('keeps draining into the torso once the limb is empty', () => {
    const start = armBleeding(1);
    const after = tickInjuries(start, 4, false, 80).parts;
    expect(after.leftArm.hp).toBe(0);
    const lost = totalHp(start) - totalHp(after);
    expect(lost).toBeCloseTo(4 * MAJOR_BLEED_DRAIN_PER_HOUR, 5);
    expect(after.torso.hp).toBeLessThan(start.torso.hp);
  });

  it('is the same over one long tick as over many short ones', () => {
    let step = armBleeding(3);
    for (let i = 0; i < 10; i++) step = tickInjuries(step, 1, false, 80).parts;
    const once = tickInjuries(armBleeding(3), 10, false, 80).parts;
    expect(totalHp(once)).toBeCloseTo(totalHp(step), 5);
  });

  it('bleeds the survivor out if never dressed', () => {
    let parts = armBleeding(5);
    let hours = 0;
    while (!checkDeath(meters, parts) && hours < 200) {
      parts = tickInjuries(parts, 1, false, 80).parts;
      hours++;
    }
    expect(checkDeath(meters, parts)).not.toBeNull();
    expect(hours).toBeLessThan(60);
  });

  it('stops costing anything once the bleed is stopped', () => {
    const start = armBleeding(0);
    const dressed = { ...start, leftArm: { ...start.leftArm, bleed: 'none' as const } };
    const after = tickInjuries(dressed, 2, false, 80).parts;
    expect(after.torso.hp).toBe(start.torso.hp);
  });
});
