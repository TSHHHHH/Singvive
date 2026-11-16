import { describe, expect, it } from 'vitest';
import { scheduleChain, TICKER_CHAIN_MAX_MS, TICKER_STEP_MS } from './tickerSequence';

describe('scheduleChain', () => {
  it('spaces a short chain one step apart, oldest first', () => {
    const { starts, cursor } = scheduleChain(3, 1000, 0);
    expect(starts).toEqual([1000, 1000 + TICKER_STEP_MS, 1000 + 2 * TICKER_STEP_MS]);
    expect(cursor).toBe(starts[2]);
  });

  it('squeezes a long chain so it lands within the cap', () => {
    const { starts } = scheduleChain(12, 0, -Infinity);
    expect(starts[0]).toBe(0);
    expect(starts[11]).toBeLessThanOrEqual(TICKER_CHAIN_MAX_MS);
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1]);
  });

  it('queues a chain behind one still playing', () => {
    const a = scheduleChain(3, 0, -Infinity);
    const b = scheduleChain(2, 100, a.cursor);
    expect(b.starts[0]).toBe(a.cursor + TICKER_STEP_MS);
    expect(b.starts[1]).toBe(a.cursor + 2 * TICKER_STEP_MS);
  });

  it('starts right away once the last chain has finished', () => {
    const { starts } = scheduleChain(1, 5000, 1000);
    expect(starts).toEqual([5000]);
  });

  it('reduced motion lands everything at once', () => {
    expect(scheduleChain(4, 700, 900, { reduced: true })).toEqual({ starts: [700, 700, 700, 700], cursor: 700 });
  });

  it('no lines, no change', () => {
    expect(scheduleChain(0, 10, 3)).toEqual({ starts: [], cursor: 3 });
  });
});
