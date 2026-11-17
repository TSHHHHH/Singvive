import { describe, expect, it } from 'vitest';
import { cssEaseOut, mixPadding, padPivot, paddedMiddle, samePadding } from './padEase';

const zero = { top: 0, left: 0, right: 0, bottom: 0 };
const dock = { top: 0, left: 360, right: 0, bottom: 32 };

describe('cssEaseOut', () => {
  it('pins the ends and rises monotonically', () => {
    expect(cssEaseOut(0)).toBe(0);
    expect(cssEaseOut(1)).toBe(1);
    expect(cssEaseOut(-1)).toBe(0);
    expect(cssEaseOut(2)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const v = cssEaseOut(i / 20);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('matches cubic-bezier(0, 0, 0.58, 1) (front-loaded, like the panel)', () => {
    // Reference values of the CSS ease-out curve.
    expect(cssEaseOut(0.25)).toBeCloseTo(0.3781, 3);
    expect(cssEaseOut(0.5)).toBeCloseTo(0.6846, 3);
    expect(cssEaseOut(0.75)).toBeCloseTo(0.9065, 3);
  });
});

describe('mixPadding', () => {
  it('interpolates every edge', () => {
    expect(mixPadding(zero, dock, 0)).toEqual(zero);
    expect(mixPadding(zero, dock, 1)).toEqual(dock);
    expect(mixPadding(zero, dock, 0.5)).toEqual({ top: 0, left: 180, right: 0, bottom: 16 });
  });
});

describe('samePadding', () => {
  it('ignores sub-pixel float noise', () => {
    expect(samePadding(dock, { ...dock, left: 360.001 })).toBe(true);
    expect(samePadding(dock, { ...dock, left: 359 })).toBe(false);
  });
});

describe('padPivot', () => {
  const W = 1336;
  const H = 1000;

  it('holds the player still when they stay in the free area', () => {
    expect(padPivot({ x: 700, y: 480 }, zero, dock, W, H)).toEqual({ x: 700, y: 480 });
  });

  it('falls back to the new free middle when the panel covers the player', () => {
    expect(padPivot({ x: 200, y: 480 }, zero, dock, W, H)).toEqual(paddedMiddle(dock, W, H));
    expect(paddedMiddle(dock, W, H)).toEqual({ x: 848, y: 484 });
  });

  it('falls back when the player is off screen or unknown', () => {
    expect(padPivot({ x: -50, y: 480 }, zero, dock, W, H)).toEqual(paddedMiddle(dock, W, H));
    expect(padPivot(null, dock, zero, W, H)).toEqual(paddedMiddle(zero, W, H));
    expect(padPivot({ x: NaN, y: 1 }, dock, zero, W, H)).toEqual(paddedMiddle(zero, W, H));
  });
});
