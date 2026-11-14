import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyOsm } from './poi';
import { isVerifiedHdb, repairUnverifiedSites } from './hdbSites';
import { buildLocations } from './world';
import { Rng } from './rng';
import type { RawPoi } from './overpass';
import type { LocationState } from './types';

const bake: { pois: RawPoi[] } = JSON.parse(readFileSync('public/pois.json', 'utf8'));
const real = bake.pois.find((p) => p.category === 'residential')!;
const spawn = { lat: real.lat, lng: real.lng };
const ghost: RawPoi = { osmId: 'way/444875548', name: 'HDB Void Deck', category: 'residential', lat: 1.36128, lng: 103.88324 };

describe('verified HDB locations', () => {
  it('never infers HDB from housing tags, block numbers, names or community centres', () => {
    for (const building of ['apartments', 'residential', 'house']) {
      expect(classifyOsm({ building, name: 'HDB Block 123', 'addr:housenumber': '123' })).toBe('housing');
    }
    expect(classifyOsm({ amenity: 'community_centre' }, true)).toBe('community');
    expect(classifyOsm({ building: 'apartments', amenity: 'parking' }, true)).toBeNull();
    expect(classifyOsm({ building: 'house' }, true)).toBe('housing');
    expect(classifyOsm({ building: 'apartments' }, true)).toBe('residential');
    expect(classifyOsm({ amenity: 'clinic' })).toBe('clinic');
  });

  it('rejects the Kovan ghost even when raw input calls it residential', () => {
    expect(isVerifiedHdb(ghost.osmId, ghost.lat, ghost.lng)).toBe(false);
    expect(buildLocations(new Rng('GHOST'), spawn, [ghost])).toEqual([]);
    const locations = buildLocations(new Rng('GHOST'), spawn, [ghost, real]);
    expect(locations.some((p) => p.id === real.osmId)).toBe(true);
    expect(locations.some((p) => p.id === ghost.osmId)).toBe(false);
    expect(isVerifiedHdb(real.osmId, real.lat + 0.01, real.lng)).toBe(false);
  });

  it('ships only verified HDBs and no procedural buildings in the corrected bake', () => {
    const hdbs = bake.pois.filter((p) => p.category === 'residential');
    expect(hdbs.length).toBeGreaterThan(1000);
    expect(hdbs.every((p) => isVerifiedHdb(p.osmId, p.lat, p.lng))).toBe(true);
    for (const id of ['way/444875548', 'way/444986495', 'way/443710591', 'way/451915606']) {
      expect(bake.pois.some((p) => p.osmId === id && p.category === 'residential')).toBe(false);
    }
    expect(bake.pois.some((p) => p.osmId.startsWith('fallback/'))).toBe(false);
  });

  it('preserves valid location identity and turns legacy ghosts into exhausted open ground', () => {
    const valid = buildLocations(new Rng('SAVE'), spawn, [real])[0];
    const invalid: LocationState = { ...valid, ...ghost, id: ghost.osmId,
      outline: [[ghost.lat, ghost.lng], [ghost.lat + .001, ghost.lng], [ghost.lat, ghost.lng + .001]],
      factionId: 'syndicate_88', isFactionOutpost: true };
    const locations = { [valid.id]: valid, [invalid.id]: invalid };
    const result = repairUnverifiedSites(locations);
    expect(result[valid.id]).toBe(valid);
    expect(result[invalid.id]).toMatchObject({ id: invalid.id, lat: invalid.lat, lng: invalid.lng,
      category: 'waypoint', exhausted: true, remainingSearches: 0, factionId: null, isFactionOutpost: false });
    expect(result[invalid.id].outline).toBeUndefined();
    expect(invalid.category).toBe('residential');
    expect(repairUnverifiedSites(result)).toBe(result);
    const fallback = { ...valid, id: 'fallback/1', category: 'hospital' as const };
    const repairedFallback = repairUnverifiedSites({ [fallback.id]: fallback });
    expect(repairedFallback[fallback.id].category).toBe('waypoint');
    expect(repairUnverifiedSites(repairedFallback)).toBe(repairedFallback);
  });
});
