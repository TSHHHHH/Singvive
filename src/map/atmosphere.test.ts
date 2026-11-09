import { describe, expect, it } from 'vitest';
import { BASE_ATMOSPHERE, LIGHT_FLOOR, atmosphereFor, mixAtmosphere, tiltShare } from './atmosphere';

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
