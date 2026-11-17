import { describe, expect, it } from 'vitest';
import { hudPadding, mixPadding, samePadding, setHudPadding } from './padEase';

const zero = { top: 0, left: 0, right: 0, bottom: 0 };
const dock = { top: 0, left: 360, right: 0, bottom: 32 };

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

describe('hudPadding', () => {
  const pad = (left: number) => ({ top: 0, left, right: 0, bottom: 32 });
  it("falls back to the camera's own padding until a panel records one", () => {
    const map = { getPadding: () => ({ left: 12 }) };
    expect(hudPadding(map)).toEqual({ top: 0, left: 12, right: 0, bottom: 0 });
  });
  it('returns the latest recorded padding, per map', () => {
    const a = { getPadding: () => pad(0) };
    const b = { getPadding: () => pad(0) };
    setHudPadding(a, pad(360));
    setHudPadding(a, pad(640));
    expect(hudPadding(a)).toEqual(pad(640));
    expect(hudPadding(b)).toEqual(pad(0));
  });
});
