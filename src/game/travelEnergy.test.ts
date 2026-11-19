import { describe, expect, it } from 'vitest';
import { quoteTravelEnergy, travelEnergyPerMetre } from './travelEnergy';
import { travelableRange } from './fog';
import type { Attributes } from './types';

const attrs: Attributes = { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 };

describe('surface walking budget', () => {
  it('uses the entire 15-energy budget at the circle edge', () => {
    const rate = travelEnergyPerMetre(attrs);
    const radius = travelableRange(attrs, 15);
    expect(radius).toBe(150);
    expect(quoteTravelEnergy(radius, 15, rate)).toEqual({
      energyCost: 15, remainingEnergy: 0, affordable: true, arrivesExhausted: true,
    });
    expect(quoteTravelEnergy(radius + 0.01, 15, rate).affordable).toBe(false);
  });

  it('allows affordable walks below five energy and never gives free tiny hops', () => {
    const rate = travelEnergyPerMetre(attrs);
    expect(quoteTravelEnergy(20, 2, rate).affordable).toBe(true);
    expect(quoteTravelEnergy(0.1, 0, rate).affordable).toBe(false);
    expect(quoteTravelEnergy(0.1, 1, rate).energyCost).toBeCloseTo(0.01);
    const hops = Array.from({ length: 10 }, () => quoteTravelEnergy(10, 15, rate).energyCost);
    expect(hops.reduce((sum, cost) => sum + cost, 0)).toBe(10);
    expect(quoteTravelEnergy(100, 15, rate).energyCost).toBe(10);
  });

  it('keeps injured and loaded circle edges affordable without rounding metres up', () => {
    for (const legs of [0.35, 0.7, 1.2]) {
      for (const load of [1, 1.4, 2.25]) {
        const rate = travelEnergyPerMetre(attrs, legs, load);
        const radius = travelableRange(attrs, 15, legs, load);
        expect(quoteTravelEnergy(radius, 15, rate).arrivesExhausted).toBe(true);
        expect(quoteTravelEnergy(radius + 0.01, 15, rate).affordable).toBe(false);
      }
    }
    expect(quoteTravelEnergy(10, 15, 0.1, false).affordable).toBe(false);
  });
});
