import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  nextSearchStreak,
  searchAmbushChance,
  searchRiskLevel,
  searchStreakMult,
  type SearchOddsInput,
} from './encounterOdds';

const base: SearchOddsInput = {
  danger: 3,
  band: 'day',
  weatherMod: 0,
  pressure: 0,
  encounterMod: 0,
  nightEncounterMod: 0,
  ambushMod: 0,
};

describe('searchAmbushChance', () => {
  it('keeps the original odds at a site never fought at', () => {
    // 0.08 + 3 × 0.12 — unchanged from the pre-streak formula.
    expect(searchAmbushChance(base)).toBeCloseTo(0.44);
    expect(searchAmbushChance({ ...base, band: 'night' })).toBeCloseTo(0.64);
  });

  it('is calmer right after a fight and climbs back with each quiet search', () => {
    const after = [0, 1, 2, 3, 4].map((n) => searchAmbushChance({ ...base, searchesSinceAmbush: n }));
    for (let i = 1; i < after.length; i++) expect(after[i]).toBeGreaterThan(after[i - 1]);
    expect(after[0]).toBeLessThan(searchAmbushChance(base));
  });

  it('stays within its floor and ceiling', () => {
    expect(searchAmbushChance({ ...base, danger: 9, band: 'night', searchesSinceAmbush: 4 })).toBe(0.95);
    expect(searchAmbushChance({ ...base, danger: 0, encounterMod: -1 })).toBe(0.02);
  });
});

describe('search streak counter', () => {
  it('resets on an ambush and saturates when quiet', () => {
    expect(nextSearchStreak(undefined, true)).toBe(0);
    expect(nextSearchStreak(0, false)).toBe(1);
    expect(nextSearchStreak(4, false)).toBe(4);
    expect(searchStreakMult(99)).toBe(searchStreakMult(4));
  });

  it('cuts long ambush streaks over a site', () => {
    const streaks = (control: boolean) => {
      const r = new Rng('streaks');
      let three = 0;
      for (let t = 0; t < 4000; t++) {
        let since: number | undefined;
        let run = 0;
        let best = 0;
        for (let s = 0; s < 8; s++) {
          const hit = r.chance(searchAmbushChance({ ...base, searchesSinceAmbush: control ? since : undefined }));
          if (control) since = nextSearchStreak(since, hit);
          run = hit ? run + 1 : 0;
          best = Math.max(best, run);
        }
        if (best >= 3) three++;
      }
      return three / 4000;
    };
    expect(streaks(true)).toBeLessThan(streaks(false) / 2);
  });
});

describe('searchRiskLevel', () => {
  it('maps odds to coarse words', () => {
    expect(searchRiskLevel(0.1)).toBe('low');
    expect(searchRiskLevel(0.3)).toBe('uneasy');
    expect(searchRiskLevel(0.5)).toBe('high');
    expect(searchRiskLevel(0.8)).toBe('dire');
  });
});
