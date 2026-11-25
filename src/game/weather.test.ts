import { describe, expect, it } from 'vitest';
import { weatherEffects, weatherEncounterMod, weatherEnergyMult, weatherThirstMult } from './weather';

describe('weather drain', () => {
  it('haze drains thirst and energy harder than heat', () => {
    expect(weatherThirstMult('haze')).toBe(2.1);
    expect(weatherEnergyMult('haze')).toBe(1.4);
    expect(weatherThirstMult('heat')).toBe(1.9);
    expect(weatherEnergyMult('heat')).toBe(1.25);
  });

  it('other weather does not touch drain', () => {
    for (const k of ['clear', 'cloudy', 'rain', 'thunderstorm'] as const) {
      expect(weatherThirstMult(k)).toBe(1);
      expect(weatherEnergyMult(k)).toBe(1);
    }
  });

  it('haze keeps encounter odds unchanged', () => {
    expect(weatherEncounterMod('haze')).toBe(0);
  });

  it('haze tooltip lists the drain', () => {
    const labels = weatherEffects('haze').map((e) => e.label);
    expect(labels).toContain('Thirst 110% faster');
    expect(labels).toContain('Energy 40% faster');
    expect(labels).toContain('Aim -1 in combat');
  });
});
