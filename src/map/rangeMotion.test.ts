import { describe, expect, it } from 'vitest';
import { RangeMotion, sampleMotion } from './rangeMotion';

/** A hand-cranked clock: `tick(ms)` advances time and runs the pending frame. */
function fakeClock() {
  let t = 0;
  let pending: ((now: number) => void) | null = null;
  let frames = 0;
  return {
    clock: {
      now: () => t,
      frame: (cb: (now: number) => void) => {
        pending = cb;
        return ++frames;
      },
      cancel: () => {
        pending = null;
      },
    },
    tick(ms: number) {
      t += ms;
      const cb = pending;
      pending = null;
      cb?.(t);
    },
    get scheduled() {
      return pending !== null;
    },
  };
}

describe('RangeMotion', () => {
  it('eases to the target and stops scheduling frames once it lands', () => {
    const c = fakeClock();
    const m = new RangeMotion(1000, 600, c.clock);
    const seen: number[] = [];
    m.subscribe((v) => seen.push(v));
    m.set(400);
    for (let i = 0; i < 40 && c.scheduled; i++) c.tick(16);
    expect(m.value).toBe(400);
    expect(c.scheduled).toBe(false);
    expect(seen.at(-1)).toBe(400);
    // monotonic shrink, no overshoot
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1]);
    expect(Math.min(...seen)).toBe(400);
  });

  it('retargets mid-flight from where it is, without a jump', () => {
    const c = fakeClock();
    const m = new RangeMotion(1000, 600, c.clock);
    m.set(0);
    c.tick(300);
    const mid = m.value;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1000);
    m.set(1000);
    c.tick(16);
    expect(Math.abs(m.value - mid)).toBeLessThan(5);
  });

  it('lands at once when instant (reduced motion)', () => {
    const c = fakeClock();
    const m = new RangeMotion(1000, 600, c.clock);
    m.set(200, true);
    expect(m.value).toBe(200);
    expect(c.scheduled).toBe(false);
  });

  it('does nothing when the target is unchanged', () => {
    const c = fakeClock();
    const m = new RangeMotion(500, 600, c.clock);
    let calls = 0;
    m.subscribe(() => calls++);
    m.set(500);
    expect(c.scheduled).toBe(false);
    expect(calls).toBe(0);
  });
});

describe('sampleMotion', () => {
  it('always delivers the landing value', () => {
    const c = fakeClock();
    const m = new RangeMotion(1000, 600, c.clock);
    const got: number[] = [];
    // A huge interval: only the first sample and the landing get through.
    const off = sampleMotion(m, 1e9, (v) => got.push(v), c.clock.now);
    m.set(300);
    while (c.scheduled) c.tick(16);
    off();
    expect(got.length).toBe(2);
    expect(got.at(-1)).toBe(300);
  });
});
