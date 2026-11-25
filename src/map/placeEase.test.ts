import { describe, expect, it } from 'vitest';
import type { EaseToOptions, Map as MlMap } from 'maplibre-gl';
import { easeWithElevation, placeEasing } from './placeEase';

function fakeMap(elevation: number) {
  const state = { elevation, jumps: 0, eased: null as EaseToOptions | null };
  const map = {
    getCenterElevation: () => state.elevation,
    setCenterElevation: (e: number) => { state.elevation = e; state.jumps++; },
    transform: { setElevation: (e: number) => { state.elevation = e; } },
    easeTo: (o: EaseToOptions) => { state.eased = o; },
  };
  return { map: map as unknown as MlMap, state };
}

describe('placeEasing', () => {
  it('starts at 0, ends at 1, and is symmetric', () => {
    expect(placeEasing(0)).toBe(0);
    expect(placeEasing(1)).toBe(1);
    expect(placeEasing(0.5)).toBeCloseTo(0.5);
    expect(placeEasing(0.25) + placeEasing(0.75)).toBeCloseTo(1);
  });
});

describe('easeWithElevation', () => {
  it('moves the elevation with the ease, not before it', () => {
    const { map, state } = fakeMap(0);
    easeWithElevation(map, { center: [103.8, 1.35], duration: 1000 }, 40);
    expect(state.jumps).toBe(0);
    expect(state.elevation).toBe(0);
    const easing = state.eased!.easing!;
    easing(0.5);
    expect(state.elevation).toBeCloseTo(20);
    easing(1);
    expect(state.elevation).toBe(40);
  });

  it('jumps when there is no time to ease', () => {
    const { map, state } = fakeMap(30);
    easeWithElevation(map, { duration: 0 }, 0);
    expect(state.jumps).toBe(1);
    expect(state.elevation).toBe(0);
  });
});
