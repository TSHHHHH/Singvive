import { describe, expect, it } from 'vitest';
import {
  REST_CRITICAL_FLOOR,
  REST_WAKE_FLOOR,
  hoursUntilMorning,
  planRest,
  restLengthHours,
  scaleNightChance,
  type RestPlanInput,
} from './restPlan';
import { applySleepRecovery } from './sleep';
import { initialBodyParts, sleepRestore, totalHp } from './survival';
import type { Meters } from './types';

const base = (over: Partial<RestPlanInput> & { meters?: Partial<Meters> } = {}): RestPlanInput => {
  const { meters, ...rest } = over;
  return {
    day: 1,
    hour: 22,
    meters: { hunger: 80, thirst: 80, energy: 20, infection: 0, ...meters },
    bodyParts: initialBodyParts(100),
    requestedHours: 8,
    recoveryMult: 1,
    sleepRestoreMod: 0,
    meterOpts: {},
    injury: { selfStopDisabled: false, legHealMod: 0, bleedStopBonus: 0 },
    nightAmbushChance: 0.3,
    floodSleep: false,
    collapseSleep: false,
    ...rest,
  };
};

describe('rest lengths', () => {
  it('until morning sleeps to the next 08:00', () => {
    expect(hoursUntilMorning(22)).toBe(10);
    expect(hoursUntilMorning(2.5)).toBe(5.5);
    expect(hoursUntilMorning(8)).toBe(24);
    expect(restLengthHours('morning', 23)).toBe(9);
    expect(restLengthHours(4, 23)).toBe(4);
  });

  it('ends on the right clock, rolling the day over', () => {
    const out = planRest(base({ hour: 22, requestedHours: 10 }));
    expect(out.hours).toBe(10);
    expect(out.endDay).toBe(2);
    expect(out.endHour).toBe(8);
  });
});

describe('planRest', () => {
  it('is deterministic for the same input', () => {
    expect(planRest(base())).toEqual(planRest(base()));
  });

  it('restores energy the same way the old full-night rest did', () => {
    const input = base();
    const out = planRest(input);
    const full = sleepRestore(input.meters.energy, 8, input.meters, 0);
    expect(out.after.energy).toBe(applySleepRecovery(input.meters.energy, full, 1));
    expect(out.after.energy).toBeGreaterThan(input.meters.energy);
  });

  it('a full night costs a modest share of hunger and thirst', () => {
    const out = planRest(base({ requestedHours: 8 }));
    expect(80 - out.after.hunger).toBeLessThan(10);
    expect(80 - out.after.thirst).toBeLessThan(10);
  });

  it('wakes you before thirst crosses the starving line', () => {
    const out = planRest(base({ meters: { thirst: 40 }, requestedHours: 16 }));
    expect(out.wokeBy).toBe('thirst');
    expect(out.hours).toBeGreaterThan(0);
    expect(out.hours).toBeLessThan(16);
    expect(out.after.thirst).toBeGreaterThanOrEqual(REST_WAKE_FLOOR);
  });

  it('below the line, uses the critical floor instead', () => {
    const out = planRest(base({ meters: { hunger: 20 }, requestedHours: 16 }));
    expect(out.wokeBy).toBe('hunger');
    expect(out.after.hunger).toBeGreaterThanOrEqual(REST_CRITICAL_FLOOR);
  });

  it('nearly empty meters only allow a doze', () => {
    const out = planRest(base({ meters: { thirst: 5 }, requestedHours: 8 }));
    expect(out.wokeBy).toBe('restless');
    expect(out.hours).toBeLessThanOrEqual(1);
  });

  it('never ends a rest dead, whatever the start', () => {
    for (const hunger of [0, 3, 14, 15, 34, 35, 60]) {
      for (const thirst of [0, 3, 14, 15, 34, 35, 60]) {
        const out = planRest(base({ meters: { hunger, thirst }, requestedHours: 24 }));
        expect(totalHp(out.bodyParts)).toBeGreaterThan(0);
      }
    }
  });

  it('a short rest carries a share of the night risk; a full night carries all of it', () => {
    const short = planRest(base({ requestedHours: 2 }));
    const full = planRest(base({ requestedHours: 8 }));
    expect(short.ambushChance).toBeGreaterThan(0);
    expect(short.ambushChance).toBeLessThan(full.ambushChance);
    expect(full.ambushChance).toBeCloseTo(0.3, 10);
    // Four two-hour naps add up to one night, not four.
    const fourNaps = 1 - Math.pow(1 - short.ambushChance, 4);
    expect(fourNaps).toBeCloseTo(full.ambushChance, 10);
  });

  it('scales damp and rubble with time asleep', () => {
    const out = planRest(base({ requestedHours: 4, floodSleep: true, collapseSleep: true }));
    expect(out.infectionDelta).toBeCloseTo(2, 10);
    expect(out.collapseChance).toBeCloseTo(scaleNightChance(0.4, 4), 10);
  });
});
