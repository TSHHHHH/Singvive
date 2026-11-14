import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDMARK_POIS, withLandmarks } from './landmarks';
import type { RawPoi } from './overpass';
import { buildLocations } from './world';
import { Rng } from './rng';
import { ITEMS, rollLoot } from './loot';
import { evaluateSleepConditions } from './sleep';
import { inPolygon } from './singapore';

afterEach(() => { vi.unstubAllGlobals(); });

describe('curated OSM landmarks', () => {
  it('merges each landmark once, preserving the ordinary bake objects', () => {
    const ordinary: RawPoi = { osmId: 'node/test', name: 'Shop', category: 'convenience', lat: 1.3, lng: 103.8 };
    const merged = withLandmarks([ordinary, { ...LANDMARK_POIS[0], name: 'SkyPark' }]);
    expect(merged).toHaveLength(4);
    expect(merged[0]).toBe(ordinary);
    expect(withLandmarks(merged)).toEqual(merged);
    expect(new Set(merged.map((p) => p.osmId)).size).toBe(4);
  });

  it('keeps ground-level arrivals on the committed walkable map and inside their footprints', async () => {
    const data = JSON.parse(readFileSync('public/zones.json', 'utf8'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
    const { ensureZonesLoaded, walkabilityOf } = await import('./playable');
    await ensureZonesLoaded();
    for (const poi of LANDMARK_POIS) {
      expect(walkabilityOf(poi.lat, poi.lng), poi.name).toBe('ok');
      expect(inPolygon(poi.lat, poi.lng, poi.outline!), poi.name).toBe(true);
    }
  });

  it('retains all three landmarks in dense neighbourhoods without raising the 220-site cap', () => {
    const ordinary: RawPoi[] = Array.from({ length: 240 }, (_, i) => ({
      osmId: `node/${i}`, name: `Shop ${i}`, category: 'convenience',
      lat: 1.286 + Math.floor(i / 16) * 0.0002, lng: 103.859 + (i % 16) * 0.0002,
    }));
    const raw = withLandmarks(ordinary);
    const build = () => buildLocations(new Rng('LANDMARKS'), { lat: 1.286, lng: 103.859 }, raw);
    const locations = build();
    expect(locations.filter((p) => p.category !== 'waypoint')).toHaveLength(220);
    expect(locations.filter((p) => p.category === 'landmark').map((p) => p.id).sort())
      .toEqual(LANDMARK_POIS.map((p) => p.osmId).sort());
    expect(locations.every((p) => !p.discovered)).toBe(true);
    expect(build()).toEqual(locations);
  });

  it('provides real scavenging supplies and treats the grove as outdoor rest', () => {
    const loot = rollLoot(new Rng('VISITORS'), 'landmark', 2, 0, { guaranteeFind: true });
    expect(loot.length).toBeGreaterThan(0);
    expect(loot.every((item) => ITEMS[item.defId])).toBe(true);
    const sleep = evaluateSleepConditions({ currentPositionId: 'way/171979084', category: 'landmark', hdb: null, hasSleepingBag: false });
    expect(sleep.enclosed).toBe('none');
    expect(sleep.roof).toBe('none');
  });

  it('indexes the bundled outlines for save stripping and restores them on continue', async () => {
    const bake = JSON.parse(readFileSync('public/pois.json', 'utf8'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => bake }));
    const { ensureBakeLoaded, bakedPoisNear } = await import('./bakedPois');
    const { locationsForSave, rehydrateLocationOutlines } = await import('./persistRun');
    await ensureBakeLoaded();
    const raw = await bakedPoisNear(1.284, 103.86, 1500);
    expect(raw.filter((p) => p.category === 'landmark')).toHaveLength(3);
    const sites = buildLocations(new Rng('SAVE'), { lat: 1.284, lng: 103.86 }, LANDMARK_POIS);
    const locations = Object.fromEntries(sites.map((p) => [p.id, p]));
    const saved = locationsForSave(locations);
    for (const p of LANDMARK_POIS) expect(saved[p.osmId].outline).toBeUndefined();
    const restored = rehydrateLocationOutlines(saved);
    for (const p of LANDMARK_POIS) expect(restored[p.osmId].outline).toEqual(p.outline);
  });
});
