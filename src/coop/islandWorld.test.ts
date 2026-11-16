import { describe, expect, it } from 'vitest';
import { buildIslandCatalog, initializeIsland, revealNearby, projectIslandRoom, planIslandTravel } from './islandWorld';
import { createRoom } from './simulation';
import { installZones } from '../game/playable';
import { clearRouteMemo } from '../game/route';
import type { RawPoi } from '../game/overpass';

const pois: RawPoi[] = [
  { osmId: 'near', name: 'Nearby shop', lat: 1.3508, lng: 103.8483, category: 'convenience' },
  { osmId: 'east', name: 'Eastern clinic', lat: 1.3508, lng: 103.851, category: 'clinic' },
  { osmId: 'far', name: 'Distant shop', lat: 1.36, lng: 103.91, category: 'supermarket' },
];
function setup() {
  installZones({ generated: 'test', land: [[[1.2,103.6],[1.5,103.6],[1.5,104],[1.2,104]]], water: [], restricted: [], vegetation: [] });
  clearRouteMemo();
  const catalog = buildIslandCatalog(pois, 'fixture');
  const room = createRoom('ABCDEF123456', 'seed', 0);
  initializeIsland(room, catalog, 'bishan');
  return { room, catalog };
}
describe('shared island world', () => {
  it('discovers real nearby POIs without revealing the whole island', () => {
    const { room } = setup();
    expect(room.world?.locations.near.name).toBe('Nearby shop');
    expect(room.world?.locations.east).toBeDefined();
    expect(Object.keys(room.world!.locations).length).toBeLessThanOrEqual(4);
  });
  it('preserves depletion and deterministic site state on rediscovery', () => {
    const { room, catalog } = setup();
    room.sites.near.searches = 0;
    const initial = structuredClone(room.sites.east);
    revealNearby(room, catalog, pois[0]);
    expect(room.sites.near.searches).toBe(0);
    expect(room.sites.east).toEqual(initial);
    expect(setup().room.sites.east).toEqual(initial);
  });
  it('rejects teleporting and blocked routes without trusting client coordinates', () => {
    const { room } = setup();
    expect(planIslandTravel(room, 'near', pois[2], 4000)).toBeNull();
    expect(planIslandTravel(room, 'near', { lat: NaN, lng: 103.85 }, 4000)).toBeNull();
    const route = planIslandTravel(room, 'near', pois[1], 4000)!;
    expect(route.durationMs).toBeGreaterThan(3000);
    expect(route.route.length).toBeGreaterThanOrEqual(2);
  });
  it('withholds far-away mutable caches while retaining shared discovered names', () => {
    const { room, catalog } = setup();
    revealNearby(room, catalog, pois[2]);
    room.players.push({ id: 'p', name: 'Player', site: 'near', status: 'active', connected: true, hp: 100, wounds: 0, food: 0, medical: 0, action: null, fighting: false, downedUntil: null, stance: 'guarded', life: 1, kills: 0 });
    const view = projectIslandRoom(room, 'p');
    expect(view.world!.locations.far.name).toBe('Distant shop');
    expect(view.sites.far).toBeUndefined();
    expect(room.sites.far).toBeDefined();
  });
});
