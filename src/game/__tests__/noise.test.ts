import { describe, it, expect } from 'vitest';
import type { LocationState } from '../types';
import { haversine } from '../overpass';
import {
  emitNoisePulse,
  locationsInPulse,
  applyPulse,
  decayBoosts,
  effectiveDanger,
  prunePulses,
  DANGER_DECAY_PER_HOUR,
  PULSE_MS,
  type NoisePulse,
} from '../noise';

function makeLocation(id: string, lat: number, lng: number, overrides: Partial<LocationState> = {}): LocationState {
  return {
    id,
    name: id,
    category: 'supermarket',
    lat,
    lng,
    size: 'medium',
    baseDanger: 2,
    currentDanger: 2,
    remainingSearches: 3,
    exhausted: false,
    cleared: false,
    looted: false,
    factionId: null,
    isFactionRevealed: false,
    isMrtStation: false,
    discovered: true,
    lastSeen: null,
    distanceFromSpawn: 0,
    ...overrides,
  };
}

describe('emitNoisePulse', () => {
  it('assigns strictly increasing ids across pulses', () => {
    const a = emitNoisePulse(1.3, 103.8, 200, 10);
    const b = emitNoisePulse(1.3, 103.8, 200, 10);
    expect(b.id).toBeGreaterThan(a.id);
  });

  it('carries through the given lat/lng/radius/intensity', () => {
    const p = emitNoisePulse(1.31, 103.82, 300, 25);
    expect(p).toMatchObject({ lat: 1.31, lng: 103.82, radiusMeters: 300, intensity: 25 });
  });
});

describe('locationsInPulse', () => {
  const origin = { lat: 1.35, lng: 103.8 };
  // ~90m and ~180m north of origin.
  const near = makeLocation('near', origin.lat + 90 / 111000, origin.lng);
  const far = makeLocation('far', origin.lat + 180 / 111000, origin.lng);

  it('includes locations within the radius and excludes those outside it', () => {
    const pulse: NoisePulse = { id: 1, lat: origin.lat, lng: origin.lng, radiusMeters: 120, intensity: 10, startedAt: 0 };
    const hit = locationsInPulse({ near, far }, pulse);
    expect(hit).toEqual(['near']);
  });

  it('includes a location exactly on the radius boundary (inclusive)', () => {
    const dist = haversine(origin.lat, origin.lng, near.lat, near.lng);
    const pulse: NoisePulse = { id: 1, lat: origin.lat, lng: origin.lng, radiusMeters: dist, intensity: 10, startedAt: 0 };
    expect(locationsInPulse({ near }, pulse)).toEqual(['near']);
  });
});

describe('applyPulse', () => {
  const origin = { lat: 1.35, lng: 103.8 };
  const near = makeLocation('near', origin.lat + 50 / 111000, origin.lng);
  const far = makeLocation('far', origin.lat + 5000 / 111000, origin.lng);

  it('adds pulse intensity to tempDangerBoost only for locations that heard it', () => {
    const pulse: NoisePulse = { id: 1, lat: origin.lat, lng: origin.lng, radiusMeters: 200, intensity: 15, startedAt: 0 };
    const before = { near, far };
    const after = applyPulse(before, pulse);
    expect(after.near.tempDangerBoost).toBe(15);
    expect(after.far).toBe(far); // untouched location keeps its original reference
  });

  it('accumulates boosts across repeated pulses', () => {
    const pulse: NoisePulse = { id: 1, lat: origin.lat, lng: origin.lng, radiusMeters: 200, intensity: 15, startedAt: 0 };
    const once = applyPulse({ near }, pulse);
    const twice = applyPulse(once, { ...pulse, id: 2, intensity: 5 });
    expect(twice.near.tempDangerBoost).toBe(20);
  });

  it('returns the same record reference when nothing heard the pulse', () => {
    const pulse: NoisePulse = { id: 1, lat: origin.lat, lng: origin.lng, radiusMeters: 10, intensity: 15, startedAt: 0 };
    const before = { far };
    const after = applyPulse(before, pulse);
    expect(after).toBe(before);
  });
});

describe('decayBoosts', () => {
  it('bleeds off tempDangerBoost at the documented rate', () => {
    const loc = makeLocation('a', 1.35, 103.8, { tempDangerBoost: 10 });
    const after = decayBoosts({ a: loc }, 4); // 4h * 0.5/h = 2 drop... wait rate is per-hour constant
    expect(DANGER_DECAY_PER_HOUR).toBe(0.5);
    expect(after.a.tempDangerBoost).toBeCloseTo(10 - 4 * DANGER_DECAY_PER_HOUR, 10);
  });

  it('floors the boost at zero rather than going negative', () => {
    const loc = makeLocation('a', 1.35, 103.8, { tempDangerBoost: 1 });
    const after = decayBoosts({ a: loc }, 10);
    expect(after.a.tempDangerBoost).toBe(0);
  });

  it('returns the same record reference when no location has a boost to decay', () => {
    const loc = makeLocation('a', 1.35, 103.8);
    const before = { a: loc };
    expect(decayBoosts(before, 5)).toBe(before);
  });

  it('returns the same record reference when hours is zero or negative', () => {
    const loc = makeLocation('a', 1.35, 103.8, { tempDangerBoost: 5 });
    const before = { a: loc };
    expect(decayBoosts(before, 0)).toBe(before);
  });
});

describe('effectiveDanger', () => {
  it('adds the temp boost to base danger, defaulting the boost to zero', () => {
    expect(effectiveDanger(makeLocation('a', 1.35, 103.8, { currentDanger: 2 }))).toBe(2);
    expect(effectiveDanger(makeLocation('a', 1.35, 103.8, { currentDanger: 2, tempDangerBoost: 3 }))).toBe(5);
  });
});

describe('prunePulses', () => {
  it('drops pulses older than PULSE_MS and keeps the rest', () => {
    const now = 10_000;
    const fresh: NoisePulse = { id: 1, lat: 0, lng: 0, radiusMeters: 1, intensity: 1, startedAt: now - 100 };
    const stale: NoisePulse = { id: 2, lat: 0, lng: 0, radiusMeters: 1, intensity: 1, startedAt: now - PULSE_MS - 1 };
    expect(prunePulses([fresh, stale], now)).toEqual([fresh]);
  });

  it('returns the same array reference when nothing was pruned', () => {
    const now = 10_000;
    const fresh: NoisePulse = { id: 1, lat: 0, lng: 0, radiusMeters: 1, intensity: 1, startedAt: now - 100 };
    const pulses = [fresh];
    expect(prunePulses(pulses, now)).toBe(pulses);
  });
});
