import { describe, expect, it } from 'vitest';
import {
  MIN_SIGHT,
  ambientLight,
  combineLight,
  darkAimDelta,
  darkTrekEncounterMod,
  sightFactor,
  sightLimitedRange,
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
    expect(sightLimitedRange(1000, 0.25)).toBe(250);
    expect(swarmSenseRange(1500, 0.25)).toBeGreaterThan(sightLimitedRange(1500, 0.25));
  });

  it('veils only after dark', () => {
    expect(veilAlpha('day', 0.2)).toBe(0);
    expect(veilAlpha('night', 0.22)).toBeGreaterThan(0.7);
    expect(veilAlpha('night', 0.8)).toBeLessThan(veilAlpha('night', 0.3));
  });
});
