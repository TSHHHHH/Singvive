import { describe, expect, it } from 'vitest';
import { travelableRange } from './fog';
import { estimateExpedition } from './travel';
import type { Attributes } from './types';

const attrs: Attributes = { strength: 5, dexterity: 6, endurance: 7, perception: 5, wits: 5 };

describe('travelableRange', () => {
  it('spends the same energy per metre at low and full energy', () => {
    expect(travelableRange(attrs, 15)).toBeCloseTo(travelableRange(attrs, 100) * 0.15);
    expect(travelableRange(attrs, 0)).toBe(0);
    expect(travelableRange(attrs, -1)).toBe(0);
  });

  it('weather changes the time to the perimeter, not the walking budget', () => {
    const range = travelableRange(attrs, 15);
    const clear = estimateExpedition(range, 'fuel', attrs, 15, 8, 'clear');
    const storm = estimateExpedition(range, 'fuel', attrs, 15, 8, 'thunderstorm');
    expect(range).toBeCloseTo(172.5);
    expect(storm.travelMin).toBeGreaterThan(clear.travelMin);
  });

  it('shrinks with injuries and load, and grows with mobility and endurance', () => {
    const rested = travelableRange(attrs, 100);
    expect(travelableRange(attrs, 100, 0.35)).toBeLessThan(rested);
    expect(travelableRange(attrs, 100, 1, 2.25)).toBeLessThan(rested);
    expect(travelableRange(attrs, 100, 1.2)).toBeGreaterThan(rested);
    expect(travelableRange({ ...attrs, endurance: 9 }, 100)).toBeGreaterThan(rested);
  });
});
