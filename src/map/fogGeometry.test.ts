import { describe, expect, it } from 'vitest';
import type { MultiPolygon, Position } from 'geojson';
import { FOG_BANDS, FOG_TOTAL, FogGeometry, bandOpacity, layerOpacity } from './fogGeometry';

function inRing(x: number, y: number, ring: Position[]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inMulti = (x: number, y: number, m: MultiPolygon['coordinates']) =>
  m.some(([outer, ...holes]) => inRing(x, y, outer) && !holes.some((h) => inRing(x, y, h)));

type Live = { lat: number; lng: number; radius: number };
type Circle = Live;

/** Every grid point gets one piece, tagged with the stacked band count there. */
function expectMatchesStack(layers: ReturnType<FogGeometry['computeLayers']>, explored: Circle[], live: Live) {
  const bands = new FogGeometry().compute(explored, live);
  const bandGeoms = bands.map((fc) => (fc.features[0].geometry as MultiPolygon).coordinates);
  let fogged = 0;
  for (let i = 0; i <= 40; i++) {
    for (let j = 0; j <= 40; j++) {
      const lng = live.lng - 0.012 + (0.024 * i) / 40;
      const lat = live.lat - 0.012 + (0.024 * j) / 40;
      const stacked = bandGeoms.filter((g) => inMulti(lng, lat, g)).length;
      const hits = layers.features.filter((f) => inMulti(lng, lat, (f.geometry as MultiPolygon).coordinates));
      expect(hits.length).toBe(stacked ? 1 : 0);
      if (stacked) expect(hits[0].properties!.n).toBe(stacked);
      fogged += stacked ? 1 : 0;
    }
  }
  return fogged;
}

describe('fogLayers', () => {
  const explored = [
    { lat: 1.3, lng: 103.85, radius: 400 },
    { lat: 1.304, lng: 103.856, radius: 300 },
  ];
  const live = { lat: 1.302, lng: 103.851, radius: 500 };

  it('covers each point once, tagged with how many stacked bands cover it', () => {
    const bands = new FogGeometry().compute(explored, live);
    const layers = new FogGeometry().computeLayers(explored, live);
    const bandGeoms = bands.map((fc) => (fc.features[0].geometry as MultiPolygon).coordinates);
    let checked = 0;
    // A grid across the soft edges of both explored discs and the sight disc.
    for (let i = 0; i <= 60; i++) {
      for (let j = 0; j <= 60; j++) {
        const lng = 103.84 + (0.026 * i) / 60;
        const lat = 1.292 + (0.022 * j) / 60;
        const stacked = bandGeoms.filter((g) => inMulti(lng, lat, g)).length;
        const hits = layers.features.filter((f) => inMulti(lng, lat, (f.geometry as MultiPolygon).coordinates));
        expect(hits.length).toBe(stacked ? 1 : 0);
        if (stacked) expect(hits[0].properties!.n).toBe(stacked);
        checked += stacked > 0 && stacked < FOG_BANDS ? 1 : 0;
      }
    }
    expect(checked).toBeGreaterThan(20); // the grid really crossed the soft edge
  });

  it('winds outer rings counter-clockwise and holes clockwise, as MapLibre groups them', () => {
    const area = (ring: Position[]) => ring.reduce((a, [x, y], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length];
      return a + x * y2 - x2 * y;
    }, 0);
    for (const f of new FogGeometry().computeLayers(explored, live).features) {
      for (const [outer, ...holes] of (f.geometry as MultiPolygon).coordinates) {
        expect(area(outer)).toBeGreaterThan(0);
        for (const h of holes) expect(area(h)).toBeLessThan(0);
      }
    }
  });

  // Regression: a fresh run has no explored circles yet. The reach cache used
  // '' for "not built", which is also the key of an empty reach, so the unions
  // were never built and computeLayers threw; the overlay kept an empty fog
  // and the whole island showed bright until the first circle was banked.
  it('fogs the island on a fresh spawn with nothing explored yet', () => {
    const spawn = { lat: 1.3636, lng: 103.841, radius: 450 };
    const layers = new FogGeometry().computeLayers([], spawn);
    expect(layers.features.length).toBeGreaterThan(0);
    expect(expectMatchesStack(layers, [], spawn)).toBeGreaterThan(100);
  });

  it('rebuilds the local unions when the explored set changes, even if none reach the disc', () => {
    const geom = new FogGeometry();
    geom.computeLayers(explored, live);
    // A new explored set, with the player far from all of it.
    const far = { lat: 1.36, lng: 103.9, radius: 450 };
    const next = [...explored, { lat: 1.35, lng: 103.88, radius: 300 }];
    expectMatchesStack(geom.computeLayers(next, far), next, far);
    // And back next to the circles, on a new explored array again.
    const again = [...next];
    expectMatchesStack(geom.computeLayers(again, live), again, live);
  });

  it('gives each piece the opacity its stack compounded to', () => {
    const op = bandOpacity(FOG_TOTAL);
    for (let n = 1; n <= FOG_BANDS; n++) {
      let stacked = 0;
      for (let k = 0; k < n; k++) stacked = stacked + op * (1 - stacked);
      expect(layerOpacity(n)).toBeCloseTo(stacked, 10);
    }
    expect(layerOpacity(FOG_BANDS)).toBeCloseTo(FOG_TOTAL, 10);
  });
});
