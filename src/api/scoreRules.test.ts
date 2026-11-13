import { describe, expect, it } from 'vitest';
import {
  DAYS_MAX,
  EVAC_BONUS,
  LOOT_MAX,
  MIN_MS_PER_DAY,
  dayMult,
  implausible,
  maxScore,
} from '../../worker/scoreRules';
import { computeEvacBonus, computeScore, scoreDayMult } from '../game/survival';
import { EVAC_SCORE_BONUS, HORDE_MAX, HORDE_PER_DAY } from '../game/goal';
import items from '../game/data/items.json' with { type: 'json' };

const HOUR = 3_600_000;

/**
 * The Worker cannot import the game, so it carries its own copy of the score
 * formula and limits. These tests fail when a balance change moves the game
 * away from that copy — fix `worker/scoreRules.ts`, not the test.
 */
describe('worker score rules track the game', () => {
  it('uses the same day multiplier and evac bonus', () => {
    for (let d = 1; d <= DAYS_MAX; d++) expect(dayMult(d)).toBeCloseTo(scoreDayMult(d), 10);
    expect(EVAC_BONUS).toBe(EVAC_SCORE_BONUS);
  });

  it('allows every day the horde clock can reach', () => {
    expect(DAYS_MAX).toBeGreaterThanOrEqual(Math.ceil(HORDE_MAX / HORDE_PER_DAY) + 1);
  });

  it('leaves room for a heavy pack', () => {
    const dearest = Math.max(
      ...Object.values(items as Record<string, { value?: number }>).map((d) => d.value ?? 0),
    );
    expect(LOOT_MAX).toBeGreaterThanOrEqual(dearest * 200);
  });

  it('accepts real scores, died or escaped', () => {
    for (const [days, kills, loot] of [
      [1, 0, 0],
      [1, 3, 120],
      [4, 22, 640],
      [9, 80, 2311],
      [13, 400, 9000],
    ] as const) {
      const elapsedMs = days * HOUR;
      const died = computeScore(days, kills, loot);
      expect(implausible({ days, kills, score: died, escaped: false, elapsedMs })).toBeNull();
      const won = died + computeEvacBonus(days, EVAC_SCORE_BONUS);
      expect(implausible({ days, kills, score: won, escaped: true, elapsedMs })).toBeNull();
    }
  });
});

describe('worker score rules reject forgeries', () => {
  const honest = { days: 5, kills: 30, score: computeScore(5, 30, 500), escaped: false, elapsedMs: HOUR };

  it('a score the kills and days cannot explain', () => {
    expect(implausible({ ...honest, score: 1_000_000 })).toBe('score');
    expect(implausible({ ...honest, score: maxScore(5, false) + 100 })).toBe('score');
    // Fewer points than the kills alone are worth.
    expect(implausible({ ...honest, score: 10 })).toBe('score');
  });

  it('an evac bonus claimed without the points for it', () => {
    expect(implausible({ ...honest, score: 100, escaped: true })).toBe('score');
  });

  it('impossible days or kills', () => {
    expect(implausible({ ...honest, days: DAYS_MAX + 1 })).toBe('days');
    expect(implausible({ ...honest, days: 0 })).toBe('days');
    expect(implausible({ ...honest, kills: 5000 })).toBe('kills');
    expect(implausible({ ...honest, kills: -1 })).toBe('kills');
  });

  it('a long run posted seconds after it started', () => {
    expect(implausible({ ...honest, elapsedMs: 4 * MIN_MS_PER_DAY - 1 })).toBe('too-fast');
    expect(implausible({ ...honest, elapsedMs: 4 * MIN_MS_PER_DAY })).toBeNull();
  });

  it('a run registered too long ago', () => {
    expect(implausible({ ...honest, elapsedMs: 90 * 24 * HOUR })).toBe('expired');
  });
});
