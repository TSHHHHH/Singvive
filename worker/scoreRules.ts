/**
 * Plausibility rules for a submitted score. Pure — no Worker APIs — so the
 * Vitest suite can pin these numbers against the real game constants
 * (`src/api/scoreRules.test.ts`). If a balance change makes that suite fail,
 * update the numbers here; do not loosen them blindly.
 *
 * The game runs in the browser, so none of this proves a run was played
 * honestly. It bounds what a forged submission can claim.
 */

/** Horde clock: 100 / 8 per day from a cold start, plus slack. */
export const DAYS_MAX = 16;
/** Generous ceiling — a real run sits far below this. */
export const KILLS_PER_DAY_MAX = 150;
/** Carried loot value. The dearest item is worth 45; a full pack is a few thousand. */
export const LOOT_MAX = 20_000;
/** Real time a game day cannot plausibly beat, even sleeping through most of it. */
export const MIN_MS_PER_DAY = 30_000;
/** A registered run stays claimable this long. */
export const RUN_MAX_AGE_MS = 60 * 24 * 3_600_000;
export const KILL_SCORE = 25;
export const DAY_SCORE = 50;
export const EVAC_BONUS = 2000;

export function dayMult(days: number): number {
  return 1 + Math.max(0, days - 1) * 0.1;
}

/** Highest score the rules above allow for a run of this length. */
export function maxScore(days: number, escaped: boolean): number {
  const mult = dayMult(days);
  const run = days * KILLS_PER_DAY_MAX * KILL_SCORE + LOOT_MAX + days * DAY_SCORE;
  return Math.round(run * mult) + (escaped ? Math.round(EVAC_BONUS * mult) : 0);
}

export type Claim = {
  days: number;
  kills: number;
  score: number;
  escaped: boolean;
  /** Real milliseconds since the Worker registered the run. */
  elapsedMs: number;
};

/** Returns why a claim is rejected, or null when it is plausible. */
export function implausible(c: Claim): string | null {
  if (c.days < 1 || c.days > DAYS_MAX) return 'days';
  if (c.kills < 0 || c.kills > c.days * KILLS_PER_DAY_MAX) return 'kills';
  if (c.elapsedMs < 0 || c.elapsedMs > RUN_MAX_AGE_MS) return 'expired';
  if (c.elapsedMs < (c.days - 1) * MIN_MS_PER_DAY) return 'too-fast';

  // Score = round((kills*25 + loot + days*50) * mult) [+ round(2000 * mult)].
  // Back out the loot the claim implies and make sure it is a real amount.
  const mult = dayMult(c.days);
  const base = c.score - (c.escaped ? Math.round(EVAC_BONUS * mult) : 0);
  const loot = base / mult - c.kills * KILL_SCORE - c.days * DAY_SCORE;
  if (loot < -1 || loot > LOOT_MAX) return 'score';
  return null;
}
