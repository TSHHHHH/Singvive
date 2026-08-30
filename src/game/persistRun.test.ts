import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelPersist,
  flushPersist,
  locationsForSave,
  PERSIST_DEBOUNCE_MS,
  rehydrateLocationOutlines,
  schedulePersist,
} from './persistRun';
import type { LocationState } from './types';

vi.mock('./bakedPois', () => ({
  bakedOsmIds: vi.fn(() => null as Set<string> | null),
  bakedOutlineByOsmId: vi.fn(() => null as Map<string, [number, number][]> | null),
}));

import { bakedOsmIds, bakedOutlineByOsmId } from './bakedPois';

const sampleLoc = (id: string, outline?: [number, number][]): LocationState =>
  ({
    id,
    name: id,
    category: 'supermarket',
    lat: 1.35,
    lng: 103.82,
    size: 'small',
    baseDanger: 2,
    currentDanger: 2,
    remainingSearches: 3,
    exhausted: false,
    cleared: true,
    looted: false,
    factionId: null,
    isFactionRevealed: false,
    visited: true,
    ...(outline ? { outline } : {}),
  }) as LocationState;

describe('persistRun', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cancelPersist();
    vi.mocked(bakedOsmIds).mockReturnValue(null);
    vi.mocked(bakedOutlineByOsmId).mockReturnValue(null);
  });

  afterEach(() => {
    cancelPersist();
    vi.useRealTimers();
  });

  it('debounces persist writes', () => {
    const writes: number[] = [];
    schedulePersist(() => writes.push(1));
    schedulePersist(() => writes.push(2));
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    expect(writes).toEqual([2]);
  });

  it('flushPersist runs pending write immediately', () => {
    const writes: number[] = [];
    schedulePersist(() => writes.push(1));
    flushPersist();
    expect(writes).toEqual([1]);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    expect(writes).toEqual([1]);
  });

  it('cancelPersist drops pending write', () => {
    const writes: number[] = [];
    schedulePersist(() => writes.push(1));
    cancelPersist();
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    expect(writes).toEqual([]);
  });

  it('locationsForSave leaves locations unchanged when bake not loaded', () => {
    const locs = { 'osm-1': sampleLoc('osm-1', [[0, 0], [1, 0], [1, 1]]) };
    expect(locationsForSave(locs)).toBe(locs);
  });

  it('locationsForSave strips outlines for bake-known ids', () => {
    vi.mocked(bakedOsmIds).mockReturnValue(new Set(['osm-1', 'osm-2']));
    const outline: [number, number][] = [[0, 0], [1, 0], [1, 1]];
    const locs = {
      'osm-1': sampleLoc('osm-1', outline),
      'osm-2': sampleLoc('osm-2'),
      'waypoint-1': sampleLoc('waypoint-1', outline),
    };
    const saved = locationsForSave(locs);
    expect(saved['osm-1'].outline).toBeUndefined();
    expect(saved['osm-2'].outline).toBeUndefined();
    expect(saved['waypoint-1'].outline).toEqual(outline);
  });

  it('rehydrateLocationOutlines attaches bake footprints', () => {
    const ring: [number, number][] = [[103.8, 1.35], [103.81, 1.35], [103.81, 1.36]];
    vi.mocked(bakedOutlineByOsmId).mockReturnValue(new Map([['osm-1', ring]]));
    const locs = { 'osm-1': sampleLoc('osm-1') };
    const next = rehydrateLocationOutlines(locs);
    expect(next['osm-1'].outline).toEqual(ring);
  });
});
