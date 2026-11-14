import { describe, expect, it } from 'vitest';
import { travelableRange } from './fog';
import type { Attributes, WeatherKind } from './types';

const attrs = { strength: 5, dexterity: 6, endurance: 7, perception: 5, intelligence: 5, charisma: 5 } as unknown as Attributes;

describe('travelableRange', () => {
  it('shrinks with energy and reaches zero when exhausted', () => {
    const rested = travelableRange(attrs, 100, 1, 'clear');
    const tired = travelableRange(attrs, 40, 1, 'clear');
    expect(tired).toBeGreaterThan(0);
    expect(tired).toBeLessThan(rested);
    expect(travelableRange(attrs, 0, 1, 'clear')).toBe(0);
  });

  it('never exceeds rested reach when injured, loaded or in bad weather', () => {
    const max = travelableRange(attrs, 100, 1.1, 'clear');
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

  it('grows with faster gear and endurance', () => {
    const rested = travelableRange(attrs, 100, 1, 'clear');
    expect(travelableRange(attrs, 100, 1.2, 'clear')).toBeGreaterThan(rested);
    expect(travelableRange({ ...attrs, endurance: 9 }, 100, 1, 'clear')).toBeGreaterThan(rested);
  });
});
