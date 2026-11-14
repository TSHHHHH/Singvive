import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZonesData, ZoneRing } from './playable';
import type { LandRoute, LatLng } from './route';
import { LAND_CROSSINGS } from './crossings';
import { inPolygon } from './singapore';

const bakedZones = JSON.parse(readFileSync('public/zones.json', 'utf8')) as ZonesData;
const sentosa = { lat: 1.256, lng: 103.8225 };
const mainland = { lat: 1.264, lng: 103.8230 };
const deck = { lat: 1.2607, lng: 103.82362 };

function rectangle(south: number, west: number, north: number, east: number): ZoneRing {
  return [[south, west], [north, west], [north, east], [south, east], [south, west]];
}

async function loadZones(data: ZonesData = bakedZones) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  const playable = await import('./playable');
  await playable.ensureZonesLoaded();
  return { ...playable, ...await import('./route') };
}

beforeEach(() => {
  vi.resetModules();
  // Geometry tests are deterministic even when CI pauses the process. The
  // wall-clock fail-closed behaviour has its own test below.
  vi.spyOn(performance, 'now').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Sentosa pedestrian crossing against the committed mask', () => {
  it('fills only the narrow deck missing from the coastline', async () => {
    const { walkabilityOf } = await loadZones();
    expect(bakedZones.land.some((ring) => inPolygon(deck.lat, deck.lng, ring))).toBe(false);
    expect(walkabilityOf(deck.lat, deck.lng)).toBe('ok');
    expect(walkabilityOf(deck.lat, deck.lng - 0.0004)).toBe('water');
    expect(walkabilityOf(deck.lat, deck.lng + 0.0004)).toBe('water');
    const points = LAND_CROSSINGS[0].points;
    for (const p of [points[0], points[points.length - 1]]) {
      expect(bakedZones.land.some((ring) => inPolygon(p.lat, p.lng, ring))).toBe(true);
    }
  });

  it.each([
    ['Sentosa to mainland', sentosa, mainland],
    ['mainland to Sentosa', mainland, sentosa],
    ['Sentosa to mid-deck', sentosa, deck],
    ['mainland to mid-deck', mainland, deck],
    ['mid-deck to mainland', deck, mainland],
    ['mid-deck back to Sentosa', deck, sentosa],
    ['offset shore approach', { lat: 1.2556, lng: 103.8205 }, { lat: 1.2645, lng: 103.822 }],
  ] as const)('%s follows walkable ground and charges the full path', async (_label, from, to) => {
    const { routeLandPath, samplePolyline, isWalkable, polylineLengthM } = await loadZones();
    const route = routeLandPath(from, to);
    expect(route).not.toBeNull();
    const path = route as LandRoute;
    expect(path.points[0]).toEqual(from);
    expect(path.points[path.points.length - 1]).toEqual(to);
    expect(samplePolyline(path.points, 5).filter((p) => !isWalkable(p.lat, p.lng))).toEqual([]);
    expect(path.lengthM).toBe(polylineLengthM(path.points));
    expect(path.lengthM).toBeGreaterThan(300);
  });

  it('does not reuse a deck route for water in the old 50 m memo bucket', async () => {
    const { routeLandPath, walkabilityOf } = await loadZones();
    const water = { lat: deck.lat, lng: deck.lng + 0.00015 };
    expect(walkabilityOf(water.lat, water.lng)).toBe('water');
    expect(routeLandPath(mainland, deck)).not.toBeNull();
    expect(routeLandPath(mainland, water)).toBeNull();
    expect(routeLandPath(water, mainland)).toBeNull();
    const nearby = { lat: deck.lat + 0.00002, lng: deck.lng };
    const next = routeLandPath(mainland, nearby);
    expect(next?.points[next.points.length - 1]).toEqual(nearby);
  });

  it('keeps restricted ground blocked even when it overlaps a crossing', async () => {
    const { walkabilityOf, routeLandPath } = await loadZones({
      ...bakedZones,
      restricted: [...bakedZones.restricted, rectangle(1.2600, 103.8230, 1.2610, 103.8240)],
    });
    expect(walkabilityOf(deck.lat, deck.lng)).toBe('restricted');
    expect(routeLandPath(sentosa, mainland)).toBeNull();
  });
});

describe('bounded land routing', () => {
  it('still takes a straight dry route', async () => {
    const { routeLandPath } = await loadZones();
    const to = { lat: mainland.lat + 0.0003, lng: mainland.lng };
    expect(routeLandPath(mainland, to)?.points).toEqual([mainland, to]);
  });

  it('does not join islands without a crossing', async () => {
    const { routeLandPath } = await loadZones({
      generated: 'fixture', water: [], restricted: [], vegetation: [],
      land: [rectangle(1.30, 103.80, 1.305, 103.805), rectangle(1.31, 103.80, 1.315, 103.805)],
    });
    expect(routeLandPath({ lat: 1.302, lng: 103.802 }, { lat: 1.312, lng: 103.802 })).toBeNull();
  });

  it('does not simplify a detour through blocked water', async () => {
    const { routeLandPath, samplePolyline, isWalkable } = await loadZones({
      generated: 'fixture', restricted: [], vegetation: [],
      land: [rectangle(1.30, 103.80, 1.32, 103.82)],
      water: [rectangle(1.306, 103.807, 1.314, 103.813)],
    });
    const from: LatLng = { lat: 1.31, lng: 103.805 };
    const to: LatLng = { lat: 1.31, lng: 103.815 };
    const route = routeLandPath(from, to);
    expect(route).not.toBeNull();
    expect(samplePolyline(route!.points, 5).every((p) => isWalkable(p.lat, p.lng))).toBe(true);
  });

  it('fails closed on a timeout without poisoning the route memo', async () => {
    const { routeLandPath } = await loadZones();
    vi.mocked(performance.now).mockReturnValueOnce(0).mockReturnValue(9);
    expect(routeLandPath(sentosa, mainland)).toBeNull();
    vi.mocked(performance.now).mockReturnValue(0);
    expect(routeLandPath(sentosa, mainland)).not.toBeNull();
  });
});
