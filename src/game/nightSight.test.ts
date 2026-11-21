import { describe, expect, it } from 'vitest';
import {
  MIN_SIGHT,
  SIGHT_BASE_M,
  SIGHT_MAX_M,
  SIGHT_MIN_M,
  dayWeatherSight,
  sightRadius,
  ambientLight,
  combineLight,
  darkAimDelta,
  darkTrekEncounterMod,
  sightFactor,
  swarmSenseRange,
  veilAlpha,
} from './nightSight';

describe('sightFactor', () => {
  it('is full sight in daylight whatever the weather or gear', () => {
    expect(sightFactor('day', 'thunderstorm', 0)).toBe(1);
    expect(sightFactor('day', 'clear', 0.8)).toBe(1);
  });

  it('collapses at night without light', () => {
    const s = sightFactor('night', 'clear', 0);
    expect(s).toBeLessThan(0.3);
    expect(s).toBeGreaterThanOrEqual(MIN_SIGHT);
  });

  it('a light source pushes the edge back', () => {
    const dark = sightFactor('night', 'clear', 0);
    const torch = sightFactor('night', 'clear', 0.55);
    expect(torch).toBeGreaterThan(dark + 0.3);
    expect(torch).toBeLessThan(1);
  });

  it('a storm night is darker and the beam carries less', () => {
    expect(sightFactor('night', 'thunderstorm', 0.55)).toBeLessThan(
      sightFactor('night', 'clear', 0.55),
    );
    expect(ambientLight('night', 'thunderstorm')).toBeLessThan(ambientLight('night', 'clear'));
  });

  it('never drops below the floor', () => {
    expect(sightFactor('night', 'thunderstorm', 0, -0.5)).toBe(MIN_SIGHT);
  });
});

describe('combineLight', () => {
  it('stacks with diminishing returns and a cap', () => {
    expect(combineLight([0.5, 0.5])).toBeCloseTo(0.75);
    expect(combineLight([0.9, 0.9])).toBeLessThanOrEqual(0.85);
    expect(combineLight([])).toBe(0);
  });
});

describe('darkTrekEncounterMod', () => {
  it('is zero by day', () => {
    expect(darkTrekEncounterMod('day', 1, 0)).toBe(0);
  });

  it('unlit night is far worse than lit night, but lit still pays a beacon tax', () => {
    const unlitSight = sightFactor('night', 'clear', 0);
    const litSight = sightFactor('night', 'clear', 0.55);
    const unlit = darkTrekEncounterMod('night', unlitSight, 0);
    const lit = darkTrekEncounterMod('night', litSight, 0.55);
    expect(unlit).toBeGreaterThan(0.2);
    expect(lit).toBeLessThan(unlit / 1.5);
    expect(lit).toBeGreaterThan(darkTrekEncounterMod('night', litSight, 0));
  });
});

describe('darkAimDelta', () => {
  it('unlit night is one worse, lit is one better, day is untouched', () => {
    expect(darkAimDelta('night', 0)).toBe(-1);
    expect(darkAimDelta('night', 0.5)).toBe(1);
    expect(darkAimDelta('dusk', 0)).toBe(0);
    expect(darkAimDelta('day', 0)).toBe(0);
  });
});

describe('ranges and veil', () => {
  it('scales sensing with sight; swarm still reads further than pockets', () => {
    expect(swarmSenseRange(1500, 0.25)).toBeGreaterThan(1500 * 0.25);
  });

  it('veils only after dark', () => {
    expect(veilAlpha('day', 0.2)).toBe(0);
    expect(veilAlpha('night', 0.22)).toBeGreaterThan(0.7);
    expect(veilAlpha('night', 0.8)).toBeLessThan(veilAlpha('night', 0.3));
  });
});

describe('sightRadius', () => {
  it('is a few blocks on a clear day for an average survivor', () => {
    expect(sightRadius('day', 'clear', 1, 5)).toBe(SIGHT_BASE_M);
  });

  it('grows with awareness and shrinks with a head wound, within bounds', () => {
    expect(sightRadius('day', 'clear', 1, 8)).toBeGreaterThan(SIGHT_BASE_M);
    expect(sightRadius('day', 'clear', 1, 3)).toBeLessThan(SIGHT_BASE_M);
    expect(sightRadius('day', 'clear', 1, 40)).toBe(SIGHT_MAX_M);
  });

  it('the sharp-eyed detect bonus widens it', () => {
    expect(sightRadius('day', 'clear', 1, 5, 1.3)).toBe(Math.round(SIGHT_BASE_M * 1.3));
  });

  it('haze and rain cut daylight sight; at night weather counts only once', () => {
    expect(sightRadius('day', 'haze', 1, 5)).toBeLessThan(sightRadius('day', 'rain', 1, 5));
    expect(sightRadius('day', 'rain', 1, 5)).toBeLessThan(SIGHT_BASE_M);
    expect(dayWeatherSight('night', 'haze')).toBe(1);
  });

  it('closes in after dark, and a lamp pushes it back', () => {
    const dark = sightRadius('night', 'clear', sightFactor('night', 'clear', 0), 5);
    const lit = sightRadius('night', 'clear', sightFactor('night', 'clear', 0.6), 5);
    expect(dark).toBeLessThan(SIGHT_BASE_M / 2);
    expect(lit).toBeGreaterThan(dark);
    expect(dark).toBeGreaterThanOrEqual(SIGHT_MIN_M);
  });
});
