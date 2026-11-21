import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  breachOutcome,
  floorThreat,
  gangHostile,
  generateDungeon,
  shaftOpen,
  THEME_META,
  THEME_RULES,
  themeEncounterMod,
  themeSearchMult,
  type HdbDungeon,
  type HdbFloor,
  type HdbFloorTheme,
} from './hdbDungeon';
import type { LocationState } from './types';

const site = { id: 'blk-th', name: 'Blk Th', currentDanger: 2 } as LocationState;
const SEEDS = Array.from({ length: 300 }, (_, i) => `TH-${i}`);
const block = (seed: string, storeys = 24, archetype: 'estate' | 'shelter' = 'estate') =>
  generateDungeon(new Rng(seed), site, archetype, { storeys });

function landing(theme: HdbFloorTheme): { d: HdbDungeon; floor: HdbFloor } {
  for (const seed of SEEDS) {
    const d = block(seed);
    const floor = d.floors.find((f) => f.theme === theme);
    if (floor) return { d, floor };
  }
  throw new Error(`no ${theme} landing in the sample`);
}

/** The same block with one landing's theme swapped for `ordinary`. */
function plain(d: HdbDungeon, level: number): HdbDungeon {
  return { ...d, floors: d.floors.map((f) => (f.level === level ? { ...f, theme: 'ordinary' } : f)) };
}

describe('new landing themes', () => {
  it('every new theme turns up, and none dominates', () => {
    const themes: HdbFloorTheme[] = ['blackout', 'quarantine', 'renovation', 'lift_shaft', 'sublet', 'gang', 'wake'];
    const seen = new Map<HdbFloorTheme, number>();
    for (const seed of SEEDS) {
      for (const f of block(seed).floors) if (f.theme) seen.set(f.theme, (seen.get(f.theme) ?? 0) + 1);
    }
    for (const t of themes) {
      expect(seen.get(t) ?? 0, t).toBeGreaterThan(SEEDS.length * 0.1);
      expect(seen.get(t) ?? 0, t).toBeLessThan(SEEDS.length * 0.75);
    }
  });

  it('quarantine: more fights, one threat harder', () => {
    const { d, floor } = landing('quarantine');
    const unit = floor.units.find((u) => u.available && u.type !== 'nest' && u.type !== 'den')!;
    const base = plain(d, floor.level);
    expect(breachOutcome(d, unit, floor.level).encounterChance).toBeGreaterThan(
      breachOutcome(base, unit, floor.level).encounterChance,
    );
    expect(floorThreat(d, floor.level)).toBe(Math.min(5, floorThreat(base, floor.level) + 1));
  });

  it('blackout: forced doors carry less heat', () => {
    const { d, floor } = landing('blackout');
    const unit = { ...floor.units[0], entry: 'barricaded' as const };
    expect(breachOutcome(d, unit, floor.level).heat).toBe(Math.round(24 * 0.7));
    expect(breachOutcome(plain(d, floor.level), unit, floor.level).heat).toBe(24);
  });

  it('renovation: every door hangs open, and the tool store is there', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      for (const f of block(seed).floors) {
        if (f.theme !== 'renovation') continue;
        expect(f.units.every((u) => u.entry === 'open')).toBe(true);
        expect(f.units.some((u) => u.type === 'storeroom' && u.available)).toBe(true);
      }
    }
  });

  it('sublet: six rooms, faster searches', () => {
    const { d, floor } = landing('sublet');
    expect(floor.units).toHaveLength(6);
    expect(themeSearchMult(d, floor.level)).toBe(0.6);
    expect(themeSearchMult(d, 1)).toBe(1);
  });

  it('gang: hostile until the toll is paid, then calm', () => {
    const { floor } = landing('gang');
    expect(gangHostile(floor)).toBe(true);
    const paid = { ...floor, tollPaid: true };
    expect(gangHostile(paid)).toBe(false);
    expect(themeEncounterMod(paid)).toBeCloseTo(THEME_META.gang.encounterMod * THEME_RULES.tollEncounterMult);
  });

  it('lift shaft: open once', () => {
    const { floor } = landing('lift_shaft');
    expect(shaftOpen(floor)).toBe(true);
    expect(shaftOpen({ ...floor, shaftUsed: true })).toBe(false);
  });

  it('wake: only on an estate void deck, with the offerings table', () => {
    let wakes = 0;
    for (const seed of SEEDS) {
      const d = block(seed);
      const ground = d.floors[0];
      if (ground.theme !== 'wake') continue;
      wakes++;
      expect(d.groundKind).not.toBe('enclosed');
      expect(ground.units.filter((u) => u.type === 'offerings')).toHaveLength(1);
      // Columns stay unique so the strip lays out.
      expect(new Set(ground.units.map((u) => u.column)).size).toBe(ground.units.length);
      expect(d.floors.slice(1).some((f) => f.theme === 'wake')).toBe(false);
    }
    expect(wakes / SEEDS.length).toBeGreaterThan(0.1);
    expect(wakes / SEEDS.length).toBeLessThan(0.35);
    for (const seed of SEEDS.slice(0, 60)) expect(block(seed, 24, 'shelter').floors[0].theme).toBeUndefined();
  });
});
