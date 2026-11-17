import { describe, expect, it } from 'vitest';
import type { LocationState } from '../game/types';
import { buildRevealTour, REVEAL_ZOOM, roundDistance } from './revealTour';

const site = (id: string, northM: number): LocationState => ({
  id, name: `Site ${id}`, category: 'clinic', lat: 1.3 + northM / 111195, lng: 103.8, size: 'small',
  baseDanger: 2, currentDanger: 2, remainingSearches: 2, exhausted: false, cleared: false, looted: false,
  factionId: null, isFactionRevealed: false, isMrtStation: false, discovered: false, lastSeen: null,
  distanceFromSpawn: 0, identified: true,
});
const text = {
  title: 'Board', overviewTitle: (n: number) => `${n} places`, overviewBody: 'body', newPlace: 'New',
  category: () => 'Clinic', distance: (m: number) => `${m} m`,
};

describe('buildRevealTour', () => {
  it('frames everything, then visits each named place in cue order with a reveal call-out', () => {
    const locations = { a: site('a', 120), b: site('b', 640) };
    const seq = buildRevealTour({ id: 7, sourceId: 'x', ids: ['a', 'missing', 'b'] }, locations, { lat: 1.3, lng: 103.8 }, text)!;
    expect(seq.lock).toBe('all');
    expect(seq.restoreCamera).toBe(true);
    expect(seq.skippable).toBe(true);
    expect(seq.steps.map((s) => s.id)).toEqual(['overview', 'place:a', 'place:b']);
    expect(seq.steps[0].shot?.fit).toHaveLength(3);
    expect(seq.steps[0].callout?.title).toBe('2 places');
    const b = seq.steps[2];
    expect(b.shot?.zoom).toBe(REVEAL_ZOOM);
    expect(b.callout).toMatchObject({ variant: 'reveal', title: 'Site b', eyebrow: 'New', meta: 'Clinic · 650 m' });
    expect(b.callout?.anchor).toEqual(b.highlight);
    expect(seq.steps.every((s) => s.advance.kind === 'timer')).toBe(true);
  });
  it('returns null when nothing in the cue still exists', () => {
    expect(buildRevealTour({ id: 1, sourceId: 'x', ids: ['gone'] }, {}, { lat: 1.3, lng: 103.8 }, text)).toBeNull();
  });
  it('rounds distances like a handwritten note', () => {
    expect(roundDistance(3)).toBe(10);
    expect(roundDistance(124)).toBe(120);
    expect(roundDistance(640)).toBe(650);
  });
});
