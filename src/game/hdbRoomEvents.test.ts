import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  alarmArmed,
  breachOutcome,
  canCutAlarm,
  canRigLure,
  cutAlarmChance,
  generateDungeon,
  HEAT_MAX,
  hoardLootModAt,
  levelHeat,
  lurePreview,
  rigLure,
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

function withHeat(d: HdbDungeon, heat: Record<number, number>): HdbDungeon {
  return { ...d, floors: d.floors.map((f) => (heat[f.level] != null ? { ...f, heatLevel: heat[f.level] } : f)) };
}

describe('room event placement', () => {
  it('rides on loot rooms only, never on the ground for lure/hoard, and alarms/hoards sit behind shut doors', () => {
    const counts = { alarm: 0, lure: 0, hoard: 0 };
    for (const seed of SEEDS) {
      const d = block(seed);
      let lures = 0;
      let hoards = 0;
      for (const f of d.floors) {
        let alarms = 0;
        for (const u of f.units) {
          if (!u.event) continue;
          counts[u.event] += 1;
          expect(['flat', 'stocked', 'storeroom', 'pantry']).toContain(u.type);
          expect(u.available).toBe(true);
          expect(u.eventKnown).toBeFalsy();
          if (u.event !== 'lure') expect(['locked', 'barricaded']).toContain(u.entry);
          if (u.event !== 'alarm') expect(f.level).toBeGreaterThan(1);
          if (u.event === 'alarm') alarms += 1;
          if (u.event === 'lure') lures += 1;
          if (u.event === 'hoard') hoards += 1;
          expect(f.theme === 'picked_over' || f.theme === 'refuge').toBe(false);
        }
        expect(alarms).toBeLessThanOrEqual(1);
      }
      expect(lures).toBeLessThanOrEqual(1);
      expect(hoards).toBeLessThanOrEqual(1);
    }
    // Some blocks have each, most landings have none.
    expect(counts.alarm / SEEDS.length).toBeGreaterThan(0.3);
    expect(counts.alarm / SEEDS.length).toBeLessThan(1.2);
    expect(counts.lure).toBeGreaterThan(SEEDS.length * 0.3);
    expect(counts.hoard).toBeGreaterThan(SEEDS.length * 0.2);
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

describe('karaoke set (lure)', () => {
  const seed = SEEDS.find((s) => find(block(s), 'lure'))!;

  it('is usable only once found and inside, and only once', () => {
    const d = block(seed);
    const { level, unit } = find(d, 'lure')!;
    expect(canRigLure(unit)).toBe(false);
    const inside = updateUnit(d, level, unit.id, { state: 'cleared', eventKnown: true });
    const u = inside.floors[level - 1].units.find((x) => x.id === unit.id)!;
    expect(canRigLure(u)).toBe(true);
    const played = rigLure(inside, level, unit.id);
    expect(canRigLure(played.floors[level - 1].units.find((x) => x.id === unit.id))).toBe(false);
  });

  it('spikes its own landing and drains every other one, within 0..max', () => {
    const d = block(seed);
    const { level, unit } = find(d, 'lure')!;
    const open = d.floors.filter((f) => !f.sealed).map((f) => f.level);
    const heat = Object.fromEntries(open.map((l, i) => [l, l === level ? 70 : i * 15]));
    const hot = withHeat(d, heat);
    const preview = lurePreview(hot, level);
    const played = rigLure(hot, level, unit.id);
    for (const p of preview) {
      expect(levelHeat(played, p.level)).toBe(p.to);
      if (p.level === level) expect(p.to).toBe(Math.min(HEAT_MAX, 70 + ROOM_EVENTS.lure.spike));
      else expect(p.to).toBe(Math.max(0, p.from - ROOM_EVENTS.lure.draw));
    }
  });
});

describe('hoard', () => {
  it('pays more the hotter the landing: +1 quiet, +2 awake, +3 hunting', () => {
    expect(hoardLootModAt(0)).toBe(1);
    expect(hoardLootModAt(30)).toBe(1);
    expect(hoardLootModAt(50)).toBe(2);
    expect(hoardLootModAt(80)).toBe(3);
    expect(hoardLootModAt(100)).toBe(3);
  });

  it('feeds the door loot roll at the heat it is opened at', () => {
    const seed = SEEDS.find((s) => find(block(s), 'hoard'))!;
    const d = block(seed);
    const { level, unit } = find(d, 'hoard')!;
    const cold = breachOutcome(d, unit, level).lootMod;
    const hot = breachOutcome(withHeat(d, { [level]: 80 }), unit, level).lootMod;
    expect(hot - cold).toBe(2);
  });
});
