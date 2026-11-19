import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evacWindowHours, pickDistantEvacPoi, pickNextEvacZone, restoreEvacuation } from './goal';
import { pathCrossesUnplayable, routeLandPath } from './route';
import { Rng } from './rng';
import type { LocationState } from './types';

// Only route geometry is controlled; selection and saved-state normalization stay real.
vi.mock('./route', () => ({ routeLandPath: vi.fn(), pathCrossesUnplayable: vi.fn() }));
const site = (id: string, lat: number): LocationState => ({ id, name: id, lat, lng: 103.85,
  category: 'school', distanceFromSpawn: 10000 } as LocationState);

beforeEach(() => {
  vi.mocked(routeLandPath).mockReset().mockReturnValue(null);
  vi.mocked(pathCrossesUnplayable).mockReset().mockReturnValue(true);
});

describe('known evacuation objectives', () => {
  it('skips a distant unreachable point in favour of a connected location', () => {
    vi.mocked(routeLandPath).mockImplementation((a, b) => b.lat === 1.5 ? null : { points: [a,b], lengthM: 12000 });
    expect(pickNextEvacZone([site('island', 1.5), site('connected', 1.4)], 1.3, 103.85, null)).toBe('connected');
  });
  it('does not announce an unreachable excluded destination as a fallback', () => {
    vi.mocked(routeLandPath).mockReturnValue(null);
    expect(pickNextEvacZone([site('old', 1.5)], 1.3, 103.85, 'old')).toBeNull();
  });
  it('finds a directly reachable point between unreachable distance extremes', () => {
    const locations = Array.from({ length: 25 }, (_, n) => site(`site-${n}`, 1.31 + n * 0.001));
    const connected = locations[12];
    vi.mocked(pathCrossesUnplayable).mockImplementation((_a, b) => b.lat !== connected.lat);
    vi.mocked(routeLandPath).mockImplementation((a, b) => b.lat === connected.lat
      ? { points: [a, b], lengthM: 2500 } : null);
    expect(pickNextEvacZone(locations, 1.3, 103.85, null)).toBe('site-12');
  });
  it('prefers a direct destination before spending time routing a detour', () => {
    vi.mocked(pathCrossesUnplayable).mockImplementation((_a, b) => b.lat !== 1.4);
    vi.mocked(routeLandPath).mockImplementation((a, b) => ({ points: [a, b], lengthM: 25000 }));
    expect(pickNextEvacZone([site('detour', 1.5), site('direct', 1.4)], 1.3, 103.85, null)).toBe('direct');
    expect(routeLandPath).not.toHaveBeenCalled();
  });
  it('bounds detour searches for a first objective with no direct route', () => {
    const pois = Array.from({ length: 30 }, (_, n) => ({
      name: `Remote ${n}`, category: n % 2 ? 'school' : 'mrt', lat: 1.39 + n * 0.001, lng: 103.85,
    }));
    expect(pickDistantEvacPoi(pois, { lat: 1.3, lng: 103.85 }, new Rng('bounded'))).toBeNull();
    expect(vi.mocked(routeLandPath).mock.calls.length).toBeLessThanOrEqual(3);
  });
  it('keeps a direct first objective outside the far-half sample eligible', () => {
    const pois = Array.from({ length: 30 }, (_, n) => ({
      name: `Remote ${n}`, category: 'mrt', lat: 1.39 + n * 0.001, lng: 103.85,
    }));
    vi.mocked(pathCrossesUnplayable).mockImplementation((_a, b) => b.lat !== 1.39);
    expect(pickDistantEvacPoi(pois, { lat: 1.3, lng: 103.85 }, new Rng('all-candidates'))?.name).toBe('Remote 0');
    expect(routeLandPath).not.toHaveBeenCalled();
  });
  it('allows a long route more time than a short one, including late runs', () => {
    expect(evacWindowHours(false, 60, 30000)).toBeGreaterThanOrEqual(96);
    expect(evacWindowHours(false, 60, 30000)).toBeGreaterThan(evacWindowHours(false, 60, 3000));
  });
  it('preserves a cooldown instead of restoring a phantom active destination', () => {
    expect(restoreEvacuation({ day: 2, hour: 8, locations: { a: site('a', 1.4) },
      evacZoneId: null, evacDeadline: null, evacCooldownUntil: 40 })).toEqual({
      evacZoneId: null, evacDeadline: null, evacCooldownUntil: 40, evacContacted: false,
    });
  });
  it('ignores old manifest admission while retaining new contact after reload', () => {
    const saved = { day: 1, hour: 8, locations: { a: site('a', 1.4) },
      evacZoneId: 'a', evacDeadline: 50, evacManifestRevealed: true, evacDemand: 999999 };
    expect(restoreEvacuation(saved).evacContacted).toBe(false);
    expect(restoreEvacuation({ ...saved, evacContacted: true }).evacContacted).toBe(true);
  });
});
