import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Map as MlMap } from 'maplibre-gl';
import { BUILDINGS_LAYER, BuildingEngine } from './buildings';

/** Loaded-tile fixture; leave WebGL installation to browser integration. */
function loadedEngine() {
  vi.spyOn(BuildingEngine.prototype as unknown as { install(): void }, 'install').mockImplementation(() => {});
  const states = new Map<number, Record<string, unknown>>();
  const map = {
    getLayer: (id: string) => id === BUILDINGS_LAYER ? { id } : undefined,
    setFeatureState: ({ id }: { id: number }, state: Record<string, unknown>) => {
      states.set(id, { ...states.get(id), ...state });
    },
  } as unknown as MlMap;
  const engine = new BuildingEngine(map);
  // Two loaded buildings, one under a discovered site's marker, ~556 m apart.
  Object.assign(engine, {
    index: new Map([
      [1, { lat: 1.3, lng: 103.8, h: 40, part: false }],
      [2, { lat: 1.305, lng: 103.8, h: 60, part: false }],
    ]),
    sites: new Map([['visited', { id: 'visited', lat: 1.305, lng: 103.8, category: 'clinic', color: '#ffffff' }]]),
    siteFeatures: new Map([['visited', [2]]]),
    roofs: new Map([['visited', 60]]),
  });
  engine.setInstant(true);
  return { engine, states };
}

afterEach(() => vi.restoreAllMocks());

describe('buildings follow current travel range', () => {
  it('lowers discovered buildings and badges as range shrinks, then raises them on recovery', () => {
    const { engine, states } = loadedEngine();
    let badgeHeight: number | undefined;
    engine.onRoofs = (roofs) => { badgeHeight = roofs.get('visited'); };
    engine.setReveal({ lat: 1.3, lng: 103.8, radius: 800 });
    expect(states.get(2)?.rise).toBe(1);
    expect(engine.roofHeights(true).get('visited')).toBe(60);

    engine.setReveal({ lat: 1.3, lng: 103.8, radius: 200 });
    expect(states.get(1)?.rise).toBe(1);
    expect(states.get(2)?.rise).toBe(0);
    expect(engine.roofHeights(true).get('visited')).toBe(0);
    expect(badgeHeight).toBe(0);
    // The block cutaway still needs its real height when the marker is on the ground.
    expect(engine.roofHeights().get('visited')).toBe(60);

    engine.setReveal({ lat: 1.3, lng: 103.8, radius: 800 });
    expect(states.get(2)?.rise).toBe(1);
    expect(engine.roofHeights(true).get('visited')).toBe(60);
    expect(badgeHeight).toBe(60);
  });

  it('lowers buildings left behind when the player moves, even though they were seen', () => {
    const { engine, states } = loadedEngine();
    engine.setReveal({ lat: 1.3, lng: 103.8, radius: 200 });
    expect(states.get(1)?.rise).toBe(1);

    engine.setReveal({ lat: 1.305, lng: 103.8, radius: 200 });
    expect(states.get(1)?.rise).toBe(0);
    expect(states.get(2)?.rise).toBe(1);
  });
});
