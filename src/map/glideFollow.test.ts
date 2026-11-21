import { describe, expect, it } from 'vitest';
import type { TravelAnim } from '../game/store';
import { followGlide, glidePath, glidePointAt } from './glideFollow';

const anim = (over: Partial<TravelAnim> = {}): TravelAnim => ({
  fromLat: 1.3,
  fromLng: 103.8,
  toLat: 1.31,
  toLng: 103.82,
  path: [],
  toId: null,
  startedAt: 1000,
  durationMs: 1000,
  departRange: 1,
  ...over,
});

/** A hand-cranked frame clock. */
function clock(start: number) {
  let now = start;
  let pending: (() => void) | null = null;
  let ids = 0;
  return {
    now: () => now,
    frame: (cb: () => void) => {
      pending = cb;
      return ++ids;
    },
    cancel: () => {
      pending = null;
    },
    step(ms: number) {
      now += ms;
      const cb = pending;
      pending = null;
      cb?.();
    },
    get scheduled() {
      return pending !== null;
    },
  };
}

describe('glidePath', () => {
  it('falls back to the straight chord when the route has no waypoints', () => {
    expect(glidePath(anim())).toEqual([
      { lat: 1.3, lng: 103.8 },
      { lat: 1.31, lng: 103.82 },
    ]);
  });
});

describe('glidePointAt', () => {
  it('starts at the origin, ends at the goal and clamps outside the glide', () => {
    const a = anim();
    expect(glidePointAt(a, 0)).toEqual({ lat: 1.3, lng: 103.8 });
    expect(glidePointAt(a, 1000)).toEqual({ lat: 1.3, lng: 103.8 });
    expect(glidePointAt(a, 2000)).toEqual({ lat: 1.31, lng: 103.82 });
    expect(glidePointAt(a, 9000)).toEqual({ lat: 1.31, lng: 103.82 });
  });
});

describe('followGlide', () => {
  it('reports home once and schedules nothing when standing still', () => {
    const c = clock(0);
    const seen: { lat: number; lng: number }[] = [];
    followGlide({ lat: 1, lng: 2 }, null, (p) => seen.push(p), c);
    expect(seen).toEqual([{ lat: 1, lng: 2 }]);
    expect(c.scheduled).toBe(false);
  });

  it('reports the pin every frame of a glide, then stops at the goal', () => {
    const c = clock(1000);
    const seen: { lat: number; lng: number }[] = [];
    followGlide({ lat: 0, lng: 0 }, anim(), (p) => seen.push(p), c);
    for (let i = 0; i < 70 && c.scheduled; i++) c.step(16);
    expect(seen.length).toBeGreaterThan(40);
    expect(seen[seen.length - 1]).toEqual({ lat: 1.31, lng: 103.82 });
    expect(c.scheduled).toBe(false);
  });

  it('cancels its frame on teardown', () => {
    const c = clock(1000);
    const off = followGlide({ lat: 0, lng: 0 }, anim(), () => {}, c);
    expect(c.scheduled).toBe(true);
    off();
    expect(c.scheduled).toBe(false);
  });
});
