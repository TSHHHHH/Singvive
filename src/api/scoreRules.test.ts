/// <reference types="@cloudflare/workers-types" />
// oxlint-disable-next-line typescript/triple-slash-reference -- The Worker uses a separate global Env declaration.
/// <reference path="../../worker/env.d.ts" />
import { describe, expect, it } from 'vitest';
import worker from '../../worker/handler';
import {
  EVAC_BONUS,
  LOOT_MAX,
  MIN_MS_PER_DAY,
  RUN_MAX_AGE_MS,
  dayMult,
  implausible,
  maxScore,
} from '../../worker/scoreRules';
import { computeEvacBonus, computeScore, scoreDayMult } from '../game/survival';
import { EVAC_SCORE_BONUS } from '../game/goal';
import items from '../game/data/items.json' with { type: 'json' };

const HOUR = 3_600_000;

/**
 * The Worker cannot import the game, so it carries its own copy of the score
 * formula and limits. These tests fail when a balance change moves the game
 * away from that copy — fix `worker/scoreRules.ts`, not the test.
 */
describe('worker score rules track the game', () => {
  it('uses the same day multiplier and evac bonus', () => {
    for (const d of [1, 5, 16, 17, 30, 100, 1000]) {
      expect(dayMult(d)).toBeCloseTo(scoreDayMult(d), 10);
    }
    expect(EVAC_BONUS).toBe(EVAC_SCORE_BONUS);
  });

  it('accepts survival beyond the former doom clock, up to the registration window', () => {
    for (const days of [17, 30, 1000, 172_801]) {
      const kills = 10;
      const score = computeScore(days, kills, 500);
      expect(implausible({
        days, kills, score, escaped: false, elapsedMs: (days - 1) * MIN_MS_PER_DAY,
      })).toBeNull();
    }
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
      [30, 500, 9000],
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
    expect(implausible({ ...honest, days: 0 })).toBe('days');
    expect(implausible({ ...honest, kills: 5000 })).toBe('kills');
    expect(implausible({ ...honest, kills: -1 })).toBe('kills');
  });

  it('a long run posted seconds after it started', () => {
    expect(implausible({ ...honest, elapsedMs: 4 * MIN_MS_PER_DAY - 1 })).toBe('too-fast');
    expect(implausible({ ...honest, elapsedMs: 4 * MIN_MS_PER_DAY })).toBeNull();
  });

  it('a 30-day run before enough real time has elapsed', () => {
    const claim = { days: 30, kills: 10, score: 8775, escaped: false };
    expect(implausible({ ...claim, elapsedMs: 29 * MIN_MS_PER_DAY - 1 })).toBe('too-fast');
    expect(implausible({ ...claim, elapsedMs: 29 * MIN_MS_PER_DAY })).toBeNull();
  });

  it('more game days than any retained registration can support', () => {
    const days = 172_802;
    expect(implausible({
      days, kills: 0, score: computeScore(days, 0, 0), escaped: false,
      elapsedMs: RUN_MAX_AGE_MS,
    })).toBe('too-fast');
  });

  it.each([NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects non-safe-integer counters (%s)', (value) => {
      expect(implausible({ ...honest, days: value })).toBe('days');
      expect(implausible({ ...honest, kills: value })).toBe('kills');
      expect(implausible({ ...honest, score: value })).toBe('score');
    },
  );

  it.each([NaN, Infinity, -Infinity])('rejects non-finite elapsed time (%s)', (elapsedMs) => {
    expect(implausible({ ...honest, elapsedMs })).toBe('expired');
  });

  it('a run registered too long ago', () => {
    expect(implausible({ ...honest, elapsedMs: 90 * 24 * HOUR })).toBe('expired');
  });
});

describe('score submission API', () => {
  const body = {
    name: 'Survivor', days: 30, kills: 10, score: 8775, escaped: false,
    seed: 'TEST', runId: 'a'.repeat(32),
  };

  // D1 is the only external dependency: retain the real parser and score rules.
  const db = {
    prepare(sql: string) {
      return {
        bind() { return this; },
        async first() {
          if (sql.includes('FROM rate_limits')) return null;
          if (sql.includes('FROM runs')) {
            return { seed: 'TEST', started_at: Date.now() - 29 * MIN_MS_PER_DAY - 1000, submitted_at: null };
          }
          if (sql.includes('INSERT INTO scores')) return { id: 1 };
          if (sql.includes('AS rank')) return { rank: 1 };
          throw new Error(`Unexpected query: ${sql}`);
        },
        async run() { return { meta: { changes: 1 } }; },
      };
    },
  } as unknown as D1Database;

  async function submit(overrides: Record<string, unknown> = {}) {
    return worker.fetch(new Request('https://singvive.test/api/scores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, ...overrides }),
    }), { DB: db });
  }

  it('posts a plausible 30-day run through the API parser', async () => {
    const response = await submit();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 1, rank: 1 });
  });

  it.each([Number.MAX_SAFE_INTEGER + 1, '9007199254740992', '9'.repeat(400)])(
    'rejects unsafe numeric kills before accessing the board (%s)', async (kills) => {
      const response = await submit({ days: 5, score: 1575, kills });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid kills' });
    },
  );
});
