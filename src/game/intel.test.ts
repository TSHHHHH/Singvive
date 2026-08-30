import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { haversine } from './overpass';
import {
  applyFactionTurfReveal,
  applyPreciseReveal,
  createRumourAnnotation,
  pickIntelTarget,
  pruneMapAnnotations,
} from './intel';
import type { LocationState } from './types';

function loc(
  id: string,
  lat: number,
  lng: number,
  opts: Partial<LocationState> = {},
): LocationState {
  return {
    id,
    name: id,
    category: 'supermarket',
    lat,
    lng,
    size: 'small',
    baseDanger: 2,
    currentDanger: 2,
    remainingSearches: 3,
    exhausted: false,
    cleared: false,
    looted: false,
    factionId: null,
    isFactionRevealed: false,
    isMrtStation: false,
    discovered: false,
    ...opts,
  } as LocationState;
}

describe('intel', () => {
  it('pickIntelTarget is stable for the same seed and origin', () => {
    const locs = {
      home: loc('home', 1.35, 103.82, { discovered: true }),
      a: loc('a', 1.351, 103.821, { category: 'police', currentDanger: 5 }),
      b: loc('b', 1.352, 103.822, { category: 'pharmacy', currentDanger: 3 }),
    };
    const rng1 = new Rng('INTEL-SEED').fork('note:1');
    const rng2 = new Rng('INTEL-SEED').fork('note:1');
    const origin = { lat: 1.35, lng: 103.82, excludeId: 'home' };
    expect(pickIntelTarget(rng1, locs, origin, 'danger')).toEqual(
      pickIntelTarget(rng2, locs, origin, 'danger'),
    );
  });

  it('rumour pin stays within fuzz radius of the true target', () => {
    const target = loc('stash', 1.36, 103.83, { category: 'hospital', currentDanger: 4 });
    const rng = new Rng('FUZZ-SEED');
    const ann = createRumourAnnotation(rng, target, 250, 'Rumoured stash', 'ann-1', 2);
    const d = haversine(ann.lat, ann.lng, target.lat, target.lng);
    expect(d).toBeLessThanOrEqual(250);
    expect(d).toBeGreaterThan(50);
  });

  it('returns null when the pool is empty', () => {
    const locs = {
      home: loc('home', 1.35, 103.82, { discovered: true }),
      a: loc('a', 1.351, 103.821, { discovered: true }),
    };
    const rng = new Rng('EMPTY');
    expect(
      pickIntelTarget(rng, locs, { lat: 1.35, lng: 103.82 }, 'danger'),
    ).toBeNull();
  });

  it('turf reveal only picks faction-held undiscovered sites', () => {
    const locs = {
      home: loc('home', 1.35, 103.82, { discovered: true }),
      free: loc('free', 1.351, 103.821),
      held: loc('held', 1.3512, 103.8212, { factionId: 'gotong' }),
      far: loc('far', 1.37, 103.84, { factionId: 'muster' }),
    };
    const rng = new Rng('TURF');
    const { revealed } = applyFactionTurfReveal(
      rng,
      locs,
      { lat: 1.35, lng: 103.82, excludeId: 'home' },
      3,
    );
    expect(revealed.length).toBe(1);
    expect(revealed[0]?.id).toBe('held');
    expect(revealed[0]?.isFactionRevealed).toBe(true);
  });

  it('applyPreciseReveal marks faction identity on held ground', () => {
    const locs = {
      held: loc('held', 1.35, 103.82, { factionId: 'sta' }),
    };
    const applied = applyPreciseReveal(locs, 'held');
    expect(applied?.target.discovered).toBe(true);
    expect(applied?.target.isFactionRevealed).toBe(true);
  });

  it('pruneMapAnnotations drops pins for discovered targets', () => {
    const locs = {
      a: loc('a', 1.35, 103.82, { discovered: true }),
      b: loc('b', 1.351, 103.821),
    };
    const annotations = [
      { id: '1', lat: 1.35, lng: 103.82, label: 'x', targetId: 'a', createdDay: 1 },
      { id: '2', lat: 1.351, lng: 103.821, label: 'y', targetId: 'b', createdDay: 1 },
    ];
    expect(pruneMapAnnotations(annotations, locs)).toHaveLength(1);
    expect(pruneMapAnnotations(annotations, locs)[0]?.targetId).toBe('b');
  });
});
