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
