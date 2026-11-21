import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  alarmArmed,
  breachOutcome,
  canCutAlarm,
  cutAlarmChance,
  generateDungeon,
  levelHeat,
  ROOM_EVENTS,
  scoutUnit,
  tripAlarm,
  updateUnit,
  type HdbDungeon,
  type HdbRoomEvent,
} from './hdbDungeon';
import type { LocationState } from './types';

const site = { id: 'blk-ev', name: 'Blk Ev', currentDanger: 2 } as LocationState;
const block = (seed: string, storeys = 18, archetype: 'estate' | 'shelter' = 'estate') =>
  generateDungeon(new Rng(seed), site, archetype, { storeys });
const SEEDS = Array.from({ length: 200 }, (_, i) => `EV-${i}`);

function find(d: HdbDungeon, event: HdbRoomEvent) {
  for (const f of d.floors) for (const u of f.units) if (u.event === event) return { level: f.level, unit: u };
  return null;
}

describe('room event placement', () => {
  it('rides on shut loot rooms only, at most one per landing', () => {
    const counts = { alarm: 0 };
    for (const seed of SEEDS) {
      const d = block(seed);
      for (const f of d.floors) {
        let alarms = 0;
        for (const u of f.units) {
          if (!u.event) continue;
          counts[u.event] += 1;
          expect(['flat', 'stocked', 'storeroom', 'pantry']).toContain(u.type);
          expect(u.available).toBe(true);
          expect(u.eventKnown).toBeFalsy();
          expect(['locked', 'barricaded']).toContain(u.entry);
          alarms += 1;
          expect(f.theme === 'picked_over' || f.theme === 'refuge').toBe(false);
        }
        expect(alarms).toBeLessThanOrEqual(1);
      }
    }
    // Some blocks have each, most landings have none.
    expect(counts.alarm / SEEDS.length).toBeGreaterThan(0.3);
    expect(counts.alarm / SEEDS.length).toBeLessThan(1.2);
  });

  it('lived-in shelter blocks carry none', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const d = block(seed, 18, 'shelter');
      expect(d.floors.flatMap((f) => f.units).some((u) => u.event)).toBe(false);
    }
  });
});

describe('alarm', () => {
  const seed = SEEDS.find((s) => find(block(s), 'alarm'))!;

  it('perception spots it, dexterity does not', () => {
    const d = block(seed);
    const { level, unit } = find(d, 'alarm')!;
    const sharp = { strength: 5, dexterity: 1, endurance: 5, perception: 20, wits: 5 };
    const dull = { strength: 5, dexterity: 20, endurance: 5, perception: 1, wits: 5 };
    const a = scoutUnit(new Rng('x'), sharp, d, level, unit.id, 0.95).dungeon;
    const b = scoutUnit(new Rng('x'), dull, d, level, unit.id, -1).dungeon;
    const read = (x: HdbDungeon) => x.floors[level - 1].units.find((u) => u.id === unit.id)!;
    expect(read(a).eventKnown).toBe(true);
    expect(canCutAlarm(read(a))).toBe(true);
    expect(read(b).eventKnown).toBeFalsy();
    expect(canCutAlarm(read(b))).toBe(false);
  });

  it('opening the door trips it: alarm heat on the landing, spread elsewhere, and it is spent', () => {
    const d = block(seed);
    const { level, unit } = find(d, 'alarm')!;
    expect(breachOutcome(d, unit, level).alarm).toBe(true);
    const hot = tripAlarm(d, level, unit.id);
    expect(levelHeat(hot, level)).toBe(ROOM_EVENTS.alarm.heat);
    const others = hot.floors.filter((f) => !f.sealed && f.level !== level);
    expect(others.every((f) => f.heatLevel > 0)).toBe(true);
    const after = hot.floors[level - 1].units.find((u) => u.id === unit.id)!;
    expect(alarmArmed(after)).toBe(false);
    expect(breachOutcome(hot, after, level).alarm).toBe(false);
  });

  it('a cut alarm keeps its loot bonus', () => {
    const d = block(seed);
    const { level, unit } = find(d, 'alarm')!;
    const cut = updateUnit(d, level, unit.id, { eventSpent: true, eventKnown: true });
    const plain = updateUnit(d, level, unit.id, { event: undefined });
    const u = cut.floors[level - 1].units.find((x) => x.id === unit.id)!;
    const p = plain.floors[level - 1].units.find((x) => x.id === unit.id)!;
    expect(breachOutcome(cut, u, level).lootMod).toBe(breachOutcome(plain, p, level).lootMod + ROOM_EVENTS.alarm.lootMod);
  });

  it('cut odds: base Wits is better than even, a toolbox makes it likely', () => {
    expect(cutAlarmChance(5, 0)).toBeCloseTo(0.65);
    expect(cutAlarmChance(5, ROOM_EVENTS.alarm.toolBonus)).toBeCloseTo(0.8);
    expect(cutAlarmChance(-20, 0)).toBeCloseTo(0.05);
  });
});
