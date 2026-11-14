import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./bakedPois', async (original) => ({
  ...await original<typeof import('./bakedPois')>(),
  bakedPoisNear: vi.fn().mockRejectedValue(new Error('missing bake')),
}));
vi.mock('./overpass', async (original) => ({
  ...await original<typeof import('./overpass')>(),
  fetchOsmPois: vi.fn().mockRejectedValue(new Error('offline')),
}));
vi.mock('./playable', async (original) => ({
  ...await original<typeof import('./playable')>(),
  ensureZonesLoaded: vi.fn().mockResolvedValue(undefined),
  walkabilityOf: vi.fn().mockReturnValue('ok'),
  filterWalkablePois: vi.fn((pois) => pois),
}));
vi.mock('./mrt', async (original) => ({
  ...await original<typeof import('./mrt')>(),
  loadMrtNetwork: vi.fn().mockResolvedValue(null),
}));

import { useGame } from './store';
import { bakedPoisNear } from './bakedPois';

beforeEach(() => {
  useGame.setState({ phase: 'spawn', locations: {}, hdb: null, currentPositionId: null });
});

describe('real location loading', () => {
  it('stays on spawn selection when both data sources fail, without fabricating a town', async () => {
    const result = await useGame.getState().setSpawn({ name: 'Kovan', lat: 1.36128, lng: 103.88324 });
    expect(result).toBe('unavailable');
    expect(useGame.getState().phase).toBe('spawn');
    expect(useGame.getState().locations).toEqual({});
  });

  it('does not count unverified residential sites toward a viable spawn', async () => {
    vi.mocked(bakedPoisNear).mockResolvedValueOnce(Array.from({ length: 6 }, (_, i) => ({
      osmId: `way/unverified-${i}`, name: 'HDB Void Deck', category: 'residential',
      lat: 1.36128 + i * .001, lng: 103.88324,
    })));
    expect(await useGame.getState().setSpawn({ name: 'Kovan', lat: 1.36128, lng: 103.88324 })).toBe('remote');
    expect(useGame.getState().locations).toEqual({});
  });

  it('refuses direct entry into an unverified saved HDB', () => {
    // Deliberately bypass normal world construction, as a legacy/imported save can.
    const id = 'way/444875548';
    useGame.setState({ currentPositionId: id, locations: {
      [id]: { id, name: 'HDB Void Deck', category: 'residential', lat: 1.36128, lng: 103.88324,
        size: 'medium', baseDanger: 2, currentDanger: 2, remainingSearches: 2, exhausted: false,
        cleared: false, looted: false, factionId: null, isFactionRevealed: false,
        isMrtStation: false, discovered: true, lastSeen: null, distanceFromSpawn: 0 },
    } });
    useGame.getState().hdbEnter();
    expect(useGame.getState().hdb).toBeNull();
  });
});
