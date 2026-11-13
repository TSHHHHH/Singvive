import { describe, expect, it } from 'vitest';
import { maxTravelRange, travelableRange } from './fog';
import type { Attributes, WeatherKind } from './types';

const attrs = { strength: 5, dexterity: 6, endurance: 7, perception: 5, intelligence: 5, charisma: 5 } as unknown as Attributes;

describe('maxTravelRange', () => {
  it('is the range at full energy, sound legs, no load, fair weather', () => {
    expect(maxTravelRange(attrs)).toBe(travelableRange(attrs, 100, 1, 'clear', 1));
  });

  it('never falls below the live range, whatever the state', () => {
    const max = maxTravelRange(attrs, 1.1);
    const weathers: WeatherKind[] = ['clear', 'cloudy', 'rain', 'thunderstorm', 'haze', 'heat'];
    for (const weather of weathers) {
      for (const energy of [0, 15, 40, 75, 100]) {
        for (const legs of [0.35, 0.7, 1]) {
          for (const load of [1, 1.4, 2.25]) {
            expect(travelableRange(attrs, energy, 1.1 * legs, weather, load)).toBeLessThanOrEqual(max);
          }
        }
      }
    }
  });

  it('moves with the build and gear only', () => {
    expect(maxTravelRange(attrs, 1.2)).toBeGreaterThan(maxTravelRange(attrs, 1));
    expect(maxTravelRange({ ...attrs, endurance: 9 })).toBeGreaterThan(maxTravelRange(attrs));
  });
});
