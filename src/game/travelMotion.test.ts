import { describe, expect, it } from 'vitest';
import { pathFromProgress, pathUntil, pointAlongPath, type LatLng } from './route';
import { travelEase, TRAVEL_HOLD } from '../ui/travelMotion';

const LINE: LatLng[] = [
  { lat: 1.3, lng: 103.8 },
  { lat: 1.3, lng: 103.81 },
  { lat: 1.3, lng: 103.82 },
];

describe('travelEase', () => {
  it('holds flat at the start and end', () => {
    expect(travelEase(0)).toBe(0);
    expect(travelEase(TRAVEL_HOLD * 0.5)).toBe(0);
    expect(travelEase(1 - TRAVEL_HOLD * 0.5)).toBe(1);
    expect(travelEase(1)).toBe(1);
  });

  it('is monotonic and lands mid-route between holds', () => {
    let prev = 0;
    for (let i = 0; i <= 20; i++) {
      const e = travelEase(i / 20);
      expect(e).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = e;
    }
    const mid = travelEase(0.5);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
  });
});

describe('pathUntil / pathFromProgress', () => {
  it('bookends match pointAlongPath', () => {
    expect(pathUntil(LINE, 0)).toEqual([LINE[0]]);
    expect(pathUntil(LINE, 1)).toEqual(LINE);
    expect(pathFromProgress(LINE, 0)).toEqual(LINE);
    expect(pathFromProgress(LINE, 1)).toEqual([LINE[LINE.length - 1]]);
  });

  it('split point matches pointAlongPath', () => {
    const t = 0.4;
    const along = pointAlongPath(LINE, t);
    const until = pathUntil(LINE, t);
    const from = pathFromProgress(LINE, t);
    const tip = until[until.length - 1];
    expect(tip.lat).toBeCloseTo(along.lat, 10);
    expect(tip.lng).toBeCloseTo(along.lng, 10);
    expect(from[0].lat).toBeCloseTo(along.lat, 10);
    expect(from[0].lng).toBeCloseTo(along.lng, 10);
    expect(from[from.length - 1]).toEqual(LINE[LINE.length - 1]);
  });
});
