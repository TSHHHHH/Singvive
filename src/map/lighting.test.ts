import { describe, expect, it } from 'vitest';
import { timeOfDay } from '../game/weather';
import {
  GRADES,
  dayColor,
  MAX_SHADOW_RATIO,
  gradeColor,
  gradePaint,
  keyLight,
  lightPhase,
  parseColor,
  phaseBand,
  shadowDir,
  shadowRatio,
  shadowRing,
  shadowStrength,
  sunAt,
} from './lighting';

describe('lightPhase', () => {
  it('only ever splits daylight: dusk and night match the gameplay band', () => {
    for (let h = 0; h < 24; h++) expect(phaseBand(lightPhase(h))).toBe(timeOfDay(h));
  });

  it('draws the first two daylight hours as dawn', () => {
    expect(lightPhase(6)).toBe('dawn');
    expect(lightPhase(7.9)).toBe('dawn');
    expect(lightPhase(8)).toBe('day');
    expect(lightPhase(5)).toBe('night');
  });
});

describe('sunAt', () => {
  it('is down at night and up through the day', () => {
    expect(sunAt(3).alt).toBeLessThan(0);
    expect(sunAt(6).alt).toBeLessThan(0);
    expect(sunAt(7).alt).toBeGreaterThan(0);
    expect(sunAt(18).alt).toBeGreaterThan(0);
    expect(sunAt(20).alt).toBeLessThan(0);
  });

  it('rises in the east, peaks around 13:00 in the south, sets in the west', () => {
    expect(sunAt(7).az).toBeLessThan(120);
    expect(sunAt(18).az).toBeGreaterThan(230);
    const peak = [...Array(24).keys()].reduce((a, h) => (sunAt(h).alt > sunAt(a).alt ? h : a), 0);
    expect(peak).toBeGreaterThanOrEqual(12);
    expect(peak).toBeLessThanOrEqual(13);
    expect(Math.abs(sunAt(12).az - 180)).toBeLessThan(15);
  });

  it('only moves when the hour does', () => {
    expect(sunAt(10.1)).toEqual(sunAt(10.9));
  });

  it('keeps a light on the 3D buildings at night', () => {
    expect(keyLight(2).alt).toBeGreaterThan(0);
  });
});

describe('shadows', () => {
  it('are long at dawn, short at noon, gone at night', () => {
    expect(shadowRatio(sunAt(7).alt)).toBe(MAX_SHADOW_RATIO);
    expect(shadowRatio(sunAt(13).alt)).toBeLessThan(0.5);
    expect(shadowStrength(sunAt(22).alt)).toBe(0);
    expect(shadowStrength(sunAt(12).alt, 0.8)).toBeLessThan(shadowStrength(sunAt(12).alt, 0));
  });

  it('fall away from the sun', () => {
    // Morning sun from the east throws shadows west.
    const [ex] = shadowDir(90);
    expect(ex).toBeCloseTo(-1);
  });

  it('cover the footprint and reach h × ratio away', () => {
    const ring = [
      [103.8, 1.3],
      [103.8001, 1.3],
      [103.8001, 1.3001],
      [103.8, 1.3001],
      [103.8, 1.3],
    ];
    const s = shadowRing(ring, 30, 1, shadowDir(90))!;
    expect(s[0]).toEqual(s[s.length - 1]);
    const minLng = Math.min(...s.map((p) => p[0]));
    const metres = (103.8 - minLng) * 110_540 * Math.cos((1.3 * Math.PI) / 180);
    expect(metres).toBeCloseTo(30, 0);
    expect(shadowRing(ring, 0, 1, [1, 0])).toBeNull();
  });
});

describe('ground grade', () => {
  it('parses the colour forms a style uses', () => {
    expect(parseColor('#0e0e0e')).toEqual([14, 14, 14, 1]);
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30, 0.5]);
    expect(parseColor('hsl(0, 0%, 50%)')?.slice(0, 3).map(Math.round)).toEqual([128, 128, 128]);
    expect(parseColor('interpolate')).toBeNull();
  });

  it('lifts the dark map by day and sinks it at night', () => {
    const lum = (s: string) => parseColor(s)!.slice(0, 3).reduce((a, b) => a + b, 0);
    const ground = '#0e0e0e';
    expect(lum(gradeColor(ground, GRADES.day))).toBeGreaterThan(lum(gradeColor(ground, GRADES.dusk)));
    expect(lum(gradeColor(ground, GRADES.dusk))).toBeGreaterThan(lum(ground));
    expect(lum(gradeColor('#303030', GRADES.night))).toBeLessThan(lum('#303030'));
  });

  it('turns Dark Matter into a light map by day: road fills lighter than ground, buildings darker', () => {
    const l = (c: number[]) => c[0] + c[1] + c[2];
    const ground = dayColor(14, 14, 14);
    expect(l(ground)).toBeGreaterThan(3 * 150);
    expect(l(dayColor(11, 11, 11))).toBeGreaterThan(l(ground));
    expect(l(dayColor(57, 57, 57))).toBeLessThan(l(ground));
    // Water keeps its slate-blue cast.
    const water = dayColor(44, 53, 60);
    expect(water[2]).toBeGreaterThan(water[0]);
  });

  it('grades colours inside expressions and leaves everything else alone', () => {
    const v = ['interpolate', ['linear'], ['zoom'], 5, '#101010', 12, 'rgba(20,20,20,0.5)'];
    const g = gradePaint(v, GRADES.day) as unknown[];
    expect(g.slice(0, 4)).toEqual(['interpolate', ['linear'], ['zoom'], 5]);
    expect(g[4]).not.toBe('#101010');
    expect(String(g[6])).toMatch(/^rgba\(.*,0\.5\)$/);
    expect(gradePaint(3, GRADES.day)).toBe(3);
  });
});
