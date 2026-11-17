import { describe, expect, it } from 'vitest';
import type { LocationState } from '../game/types';
import { buildRevealTour, OVERVIEW_MAX_ZOOM } from './revealTour';
import { stepPins } from './pins';

const site = (id: string, northM: number): LocationState => ({
  id, name: `Site ${id}`, category: 'clinic', lat: 1.3 + northM / 111195, lng: 103.8, size: 'small',
  baseDanger: 2, currentDanger: 2, remainingSearches: 2, exhausted: false, cleared: false, looted: false,
  factionId: null, isFactionRevealed: false, isMrtStation: false, discovered: false, lastSeen: null,
  distanceFromSpawn: 0, identified: true,
});
const text = {
  title: 'Board', overviewTitle: (n: number) => `${n} places`, overviewBody: 'body',
};

describe('buildRevealTour', () => {
  it('frames everything in one shot and pops every place at once', () => {
    const locations = { a: site('a', 120), b: site('b', 640) };
    const seq = buildRevealTour({ id: 7, sourceId: 'x', ids: ['a', 'missing', 'b'] }, locations, { lat: 1.3, lng: 103.8 }, text)!;
    expect(seq.lock).toBe('all');
    expect(seq.restoreCamera).toBe(true);
    expect(seq.skippable).toBe(true);
    expect(seq.steps).toHaveLength(1);
    const [step] = seq.steps;
    expect(step.shot?.fit).toHaveLength(3);
    expect(step.shot?.maxZoom).toBe(OVERVIEW_MAX_ZOOM);
    expect(step.callout).toMatchObject({ variant: 'note', title: '2 places' });
    expect(step.callout?.anchor).toBeUndefined();
    expect(step.pins?.map((p) => p.callout?.title)).toEqual(['Site a', 'Site b']);
    expect(step.pins?.[1].callout).toMatchObject({ variant: 'reveal', compact: true, icon: 'poi.hospital' });
    expect(step.pins?.every((p) => p.ring)).toBe(true);
    expect(step.advance.kind).toBe('timer');
  });
  it('returns null when nothing in the cue still exists', () => {
    expect(buildRevealTour({ id: 1, sourceId: 'x', ids: ['gone'] }, {}, { lat: 1.3, lng: 103.8 }, text)).toBeNull();
  });
});

describe('stepPins', () => {
  const at = { lat: 1, lng: 2 };
  it('uses explicit pins, else folds a single highlight and anchored call-out into one pin', () => {
    expect(stepPins({ id: 's', advance: { kind: 'tap' }, pins: [{ at }] })).toEqual([{ at }]);
    const callout = { variant: 'reveal' as const, anchor: at, title: 'x' };
    expect(stepPins({ id: 's', advance: { kind: 'tap' }, highlight: at, callout })).toEqual([{ at, ring: true, callout }]);
    expect(stepPins({ id: 's', advance: { kind: 'tap' }, callout: { variant: 'note', title: 'docked' } })).toEqual([]);
  });
});
