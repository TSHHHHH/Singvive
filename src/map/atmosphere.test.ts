import { describe, expect, it } from 'vitest';
import { BASE_ATMOSPHERE, LIGHT_FLOOR, atmosphereFor, mixAtmosphere, sunlightFor, tiltShare } from './atmosphere';

describe('desktop sunlight', () => {
  it('updates on half-hours and wraps with the run clock', () => {
    expect(sunlightFor(8.49)).toEqual(sunlightFor(8));
    expect(sunlightFor(8.5)).not.toEqual(sunlightFor(8));
    expect(sunlightFor(32.5)).toEqual(sunlightFor(8.5));
    expect(sunlightFor(5.99).daylight).toBe(0);
    expect(sunlightFor(6).daylight).toBeGreaterThan(0);
    expect(sunlightFor(18.5).daylight).toBeGreaterThan(0);
    expect(sunlightFor(19).daylight).toBe(0);
    expect(sunlightFor(0)).toEqual(sunlightFor(24));
  });

  it('casts opposing morning and afternoon shadows and keeps mid-rise noon shadows visible', () => {
    const morning = sunlightFor(9);
    const noon = sunlightFor(12.5);
    const afternoon = sunlightFor(16);
    expect(morning.bearing).toBeLessThan(180);
    expect(afternoon.bearing).toBeGreaterThan(180);
    expect(morning.polar).toBeCloseTo(afternoon.polar);
    const length = (polar: number) => 20 * Math.tan(polar * Math.PI / 180);
    expect(length(noon.polar)).toBeGreaterThan(17);
    expect(length(morning.polar)).toBeGreaterThan(length(noon.polar));
  });
});

describe('atmosphereFor', () => {
  it('is the plain 3D look with weather off in daylight', () => {
    for (const kind of ['clear', 'rain', 'haze', 'thunderstorm'] as const) {
      expect(atmosphereFor(kind, 'day', 0)).toEqual(BASE_ATMOSPHERE);
    }
  });

  it('scales the weather with strength', () => {
    const full = atmosphereFor('haze', 'day', 1);
    const subtle = atmosphereFor('haze', 'day', 0.6);
    expect(subtle.hazeAlpha).toBeGreaterThan(0);
    expect(subtle.hazeAlpha).toBeLessThan(full.hazeAlpha);
  });

  it('darkens the light at night whatever the setting', () => {
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(lum(atmosphereFor('clear', 'night', 0).light)).toBeLessThan(lum(BASE_ATMOSPHERE.light));
    expect(lum(atmosphereFor('rain', 'night', 1).light)).toBeLessThan(lum(atmosphereFor('rain', 'day', 1).light));
  });

  // Below the floor MapLibre's ambient term flattens every block to one brown.
  it('never darkens the light enough to flatten the buildings', () => {
    for (const kind of ['clear', 'cloudy', 'rain', 'thunderstorm', 'haze', 'heat'] as const) {
      for (const time of ['day', 'dusk', 'night'] as const) {
        for (const strength of [0, 0.6, 1]) {
          const n = parseInt(atmosphereFor(kind, time, strength).light.slice(1), 16);
          const lo = Math.min((n >> 16) & 255, (n >> 8) & 255, n & 255) / 255;
          expect(lo).toBeGreaterThanOrEqual(LIGHT_FLOOR - 0.005);
        }
      }
    }
  });

  it('haze closes the view in more than clear air', () => {
    expect(atmosphereFor('haze', 'day', 1).hazeReach).toBeGreaterThan(atmosphereFor('clear', 'day', 1).hazeReach);
  });
});

describe('mixAtmosphere / tiltShare', () => {
  it('returns the ends unchanged', () => {
    const b = atmosphereFor('rain', 'day', 1);
    expect(mixAtmosphere(BASE_ATMOSPHERE, b, 0)).toBe(BASE_ATMOSPHERE);
    expect(mixAtmosphere(BASE_ATMOSPHERE, b, 1)).toBe(b);
  });

  it('hides depth haze on a flat camera', () => {
    expect(tiltShare(0)).toBe(0);
    expect(tiltShare(50)).toBe(1);
  });
});
