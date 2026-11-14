import { describe, expect, it } from 'vitest';
import {
  activityAt, activityBand, activityPressure, addActivity, exploreActivity,
  freshActivity, normalizeActivity, pruneActivity, respondActivity,
  type ActivityState,
} from './activity';

const origin = { lat: 1.3, lng: 103.8 };
const noise = { ...origin, radiusMeters: 400, intensity: 0.8, kind: 'player' as const };
const trip = {
  seed: 'activity-fixture', ...origin, distanceM: 300, now: 3,
  weather: 'clear' as const, category: 'supermarket' as const,
};

/** A sweep checks reachable seeded outcomes without coupling to one PRNG draw. */
function eventFixture(): ActivityState {
  for (let n = 0; n < 100; n++) {
    const state = exploreActivity(freshActivity(), { ...trip, seed: `fixture-${n}` });
    if (state.event) return state;
  }
  throw new Error('No exploration events were reachable');
}

describe('local activity sources', () => {
  it('leaves the disturbance at its original position when the survivor moves', () => {
    const state = addActivity(freshActivity(), noise, 2);
    expect(activityAt(state, origin.lat, origin.lng, 2)).toBeCloseTo(0.8);
    expect(activityAt(state, origin.lat + 0.02, origin.lng, 2)).toBe(0);
    expect(state.sources[0]).toMatchObject(origin);
  });

  it('falls off with distance and expires using game hours', () => {
    const state = addActivity(freshActivity(), noise, 2);
    const halfway = activityAt(state, origin.lat + 0.0018, origin.lng, 2);
    expect(halfway).toBeGreaterThan(0.35);
    expect(halfway).toBeLessThan(0.45);
    expect(activityAt(state, origin.lat, origin.lng, 5)).toBeCloseTo(0.4);
    expect(activityAt(state, origin.lat, origin.lng, 8)).toBe(0);
    expect(pruneActivity(state, 8).sources).toEqual([]);
  });

  it('bounds repeated disturbances and their saved source count', () => {
    let state = freshActivity();
    for (let i = 0; i < 100; i++) state = addActivity(state, noise, 2 + i / 1000);
    expect(state.sources.length).toBeLessThanOrEqual(32);
    expect(activityAt(state, origin.lat, origin.lng, 2.1)).toBeLessThanOrEqual(1);
    expect(activityAt(state, origin.lat, origin.lng, 2.1)).toBeGreaterThan(0.8);
    expect(new Set(state.sources.map((s) => s.id)).size).toBe(state.sources.length);
    expect(activityAt(state, origin.lat, origin.lng, 20)).toBe(0);
  });

  it('settles to quiet without manufacturing a day-dependent danger increase', () => {
    const state = addActivity(freshActivity(), noise, 2);
    expect(activityBand(activityAt(state, origin.lat, origin.lng, 2))).toBe('hunting');
    expect(activityBand(activityAt(state, origin.lat, origin.lng, 6))).toBe('stirred');
    expect(activityBand(activityAt(state, origin.lat, origin.lng, 2000))).toBe('quiet');
    expect(activityPressure(state, origin.lat, origin.lng, 2000)).toBe(0.42);
    expect(activityPressure(state, origin.lat + 0.02, origin.lng, 2)).toBe(0.42);
    expect(activityPressure(state, origin.lat, origin.lng, 2)).toBeCloseTo(0.884);
  });

  it('ignores invalid coordinates and nonfinite emissions', () => {
    const state = freshActivity();
    expect(addActivity(state, { ...noise, lat: NaN }, 1)).toEqual(state);
    expect(addActivity(state, { ...noise, intensity: Infinity }, 1)).toEqual(state);
    expect(addActivity(state, noise, NaN)).toEqual(state);
    expect(activityAt(state, NaN, origin.lng, 1)).toBe(0);
  });
});

describe('remembered exploration events', () => {
  it('replays deterministically after JSON save and reload', () => {
    const first = exploreActivity(freshActivity(), trip);
    const restored = normalizeActivity(JSON.parse(JSON.stringify(freshActivity())), trip.now);
    expect(exploreActivity(restored, trip)).toEqual(first);
    expect(normalizeActivity(JSON.parse(JSON.stringify(first)), trip.now)).toEqual(first);
  });

  it('records failed attempts so reload and a zero-distance arrival cannot reroll them', () => {
    let missed: ActivityState | undefined;
    for (let n = 0; n < 100; n++) {
      const state = exploreActivity(freshActivity(), { ...trip, seed: `miss-${n}` });
      if (!state.event) { missed = state; break; }
    }
    expect(missed).toBeDefined();
    expect(missed!.eventClock.lastAt).toBe(3);
    const restored = normalizeActivity(JSON.parse(JSON.stringify(missed)), 3);
    expect(exploreActivity(restored, { ...trip, distanceM: 0 })).toEqual(restored);
  });

  it('requires travel and a two-hour interval between attempts', () => {
    const state = eventFixture();
    const quiet = { ...respondActivity(state, 3), event: null };
    const before = exploreActivity(quiet, { ...trip, lat: 1.31, now: 4.99 });
    expect(before.event).toBeNull();
    expect(before.eventClock.lastAt).toBe(3);
    expect(exploreActivity(quiet, { ...trip, now: 5, distanceM: 0 }).event).toBeNull();
    const attempted = exploreActivity(quiet, { ...trip, lat: 1.31, now: 5 });
    expect(attempted.eventClock.lastAt).toBe(5);
  });

  it('does not let short steps or repeated walks around the same point farm event attempts', () => {
    let state = freshActivity();
    for (let n = 0; n < 100; n++) {
      state = exploreActivity(state, {
        ...trip, distanceM: 10, lat: origin.lat + (n % 2) * 0.00009, now: 3 + n,
      });
    }
    expect(state.event).toBeNull();
    expect(state.eventClock.lastAt).toBeNull();
    const previous = eventFixture();
    state = { ...respondActivity(previous, 3), event: null };
    for (let n = 0; n < 20; n++) {
      state = exploreActivity(state, {
        ...trip, distanceM: 100, lat: origin.lat + (n % 2) * 0.0009, now: 6 + n,
      });
    }
    expect(state.eventClock.lastAt).toBe(3);
  });

  it('still counts genuine exploration completed through many short travel segments', () => {
    let state = freshActivity();
    for (let n = 0; n < 35; n++) {
      state = exploreActivity(state, { ...trip, distanceM: 10, lat: 1.3 + n * 0.00009, now: 3 });
    }
    expect(state.eventClock.lastAt).toBe(3);
  });

  it('has one event, never repeats its kind, and caps a game day at three', () => {
    const state = eventFixture();
    expect(exploreActivity(state, { ...trip, lat: 1.32, now: 3.1 }).event).toEqual(state.event);
    const quiet = { ...respondActivity(state, 3), event: null };
    for (let n = 0; n < 100; n++) {
      const next = exploreActivity(quiet, { ...trip, seed: `next-${n}`, lat: 1.31, now: 5 });
      if (next.event) expect(next.event.kind).not.toBe(state.event!.kind);
    }
    const capped = { ...quiet, eventClock: { ...quiet.eventClock, count: 3 } };
    expect(exploreActivity(capped, { ...trip, lat: 1.31, now: 8 }).event).toBeNull();
    const nextDay = exploreActivity(capped, { ...trip, lat: 1.31, now: 26 });
    expect(nextDay.eventClock.day).toBe(2);
    expect(nextDay.eventClock.count).toBeLessThanOrEqual(1);
  });

  it('only offers events allowed by local setting and audible weather', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 150; n++) {
      const state = exploreActivity(freshActivity(), { ...trip, seed: `kind-${n}` });
      if (state.event) seen.add(state.event.kind);
      const park = exploreActivity(freshActivity(), { ...trip, seed: `kind-${n}`, category: 'park' });
      expect(['car_alarm', 'shutter']).not.toContain(park.event?.kind);
      const storm = exploreActivity(freshActivity(), {
        ...trip, seed: `kind-${n}`, category: 'park', weather: 'thunderstorm',
      });
      expect(['gunfire', 'car_alarm', 'shutter']).not.toContain(storm.event?.kind);
    }
    expect([...seen].sort()).toEqual(['car_alarm', 'gunfire', 'scavengers', 'shutter']);
  });

  it('responds once, preserving a decaying residual source', () => {
    const state = eventFixture();
    const event = state.event!;
    const before = activityAt(state, event.lat, event.lng, 3);
    const responded = respondActivity(state, 3);
    const after = activityAt(responded, event.lat, event.lng, 3);
    expect(responded.event?.resolved).toBe(true);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    expect(respondActivity(responded, 3)).toEqual(responded);
    expect(activityAt(responded, event.lat, event.lng, 20)).toBe(0);
    expect(respondActivity(state, event.expiresAt).event).toBeNull();
  });
});

describe('activity save normalization', () => {
  it('preserves a source emitted at a fractional game hour through JSON reload', () => {
    const state = addActivity(freshActivity(), noise, 2.3);
    const restored = normalizeActivity(JSON.parse(JSON.stringify(state)), 2.3);
    expect(restored.sources).toHaveLength(1);
    expect(activityAt(restored, origin.lat, origin.lng, 2.3)).toBeCloseTo(0.8);
    expect(restored).toEqual(state);
  });

  it('preserves a pending event created at a fractional game hour through JSON reload', () => {
    let state: ActivityState | undefined;
    for (let n = 0; n < 100; n++) {
      const explored = exploreActivity(freshActivity(), { ...trip, seed: `fractional-${n}`, now: 1.7 });
      if (explored.event) { state = explored; break; }
    }
    expect(state?.event).toBeTruthy();
    const restored = normalizeActivity(JSON.parse(JSON.stringify(state)), 1.7);
    expect(restored.event?.resolved).toBe(false);
    expect(restored).toEqual(state);
  });

  it('defaults old saves and discards malformed sources without losing valid ones', () => {
    expect(normalizeActivity(undefined, 3)).toEqual(freshActivity());
    const valid = addActivity(freshActivity(), noise, 2);
    const source = valid.sources[0];
    const saved = {
      ...valid,
      sources: [source, ...[
        { intensity: NaN }, { intensity: 2 }, { intensity: -1 },
        { radiusMeters: 1e9 }, { lat: 100 }, { lng: Infinity },
        { createdAt: 5 }, { expiresAt: 1e9 }, { id: 'x'.repeat(1000) },
        { kind: 'unknown' },
      ].map((patch, n) => ({ ...source, id: `bad-${n}`, ...patch }))],
    };
    expect(normalizeActivity(saved, 3)).toEqual(valid);
  });

  it('bounds untrusted memory, drops duplicate IDs and oversized source arrays', () => {
    const valid = addActivity(freshActivity(), noise, 2);
    const bad = normalizeActivity({
      ...valid, sequence: Infinity,
      sources: Array.from({ length: 500 }, (_, n) => ({ ...valid.sources[0], id: `s-${n % 100}` })),
      eventClock: { lastAt: Infinity, distanceM: Infinity, day: -1, count: 1e8, lastKind: 'bad' },
      event: { id: 'oops', kind: 'bad' },
    }, 3);
    expect(bad.sources.length).toBeLessThanOrEqual(32);
    expect(new Set(bad.sources.map((s) => s.id)).size).toBe(bad.sources.length);
    expect(bad.sequence).toBeGreaterThanOrEqual(bad.sources.length);
    expect(bad.eventClock).toMatchObject({ lastAt: null, distanceM: 0, day: 1, count: 0, lastKind: null });
    expect(bad.event).toBeNull();
    expect(normalizeActivity({ sequence: Number.MAX_SAFE_INTEGER - 1 }, 3).sequence).toBe(0);
  });

  it('rejects malformed event coordinates, timestamps, identities and choices', () => {
    const state = eventFixture();
    for (const patch of [
      { lat: NaN }, { lng: 181 }, { createdAt: -1 }, { createdAt: 4 },
      { expiresAt: 1e9 }, { resolved: 'yes' }, { id: '' }, { kind: 'player' },
    ]) expect(normalizeActivity({ ...state, event: { ...state.event, ...patch } }, 3).event).toBeNull();
  });
});
