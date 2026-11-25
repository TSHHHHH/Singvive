import { describe, expect, it } from 'vitest';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import type { ZonesData } from '../game/playable';
import { inPolygon } from '../game/singapore';
import { MANUAL_CROSSINGS, onLandCrossing } from '../game/crossings';
import { pointInRing } from './geo';
import { withoutCrossingDecks } from './crossingGeometry';

const water: MultiPolygon = [[[
  [103.82, 1.25], [103.83, 1.25], [103.83, 1.27], [103.82, 1.27], [103.82, 1.25],
]]];

function contains(area: MultiPolygon, lat: number, lng: number): boolean {
  return area.some(([outer, ...holes]) => pointInRing(lng, lat, outer) &&
    !holes.some((hole) => pointInRing(lng, lat, hole)));
}

describe('terrain tint crossing cutouts', () => {
  it('clears the walkable deck along every segment and bend', () => {
    const tinted = withoutCrossingDecks(water);
    const points = MANUAL_CROSSINGS[0].points;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      for (let j = 0; j <= 10; j++) {
        const lat = a.lat + (b.lat - a.lat) * j / 10;
        const lng = a.lng + (b.lng - a.lng) * j / 10;
        expect(onLandCrossing(lat, lng)).toBe(true);
        expect(contains(tinted, lat, lng)).toBe(false);
      }
    }
  });

  it('clips the committed bake without throwing and clears a baked river deck', async () => {
    // polygon-clipping threw on an island-wide union of every baked deck.
    const { readFileSync } = await import('node:fs');
    const { installZones } = await import('../game/playable');
    const zones = JSON.parse(readFileSync('public/zones.json', 'utf8')) as ZonesData;
    installZones(zones);
    try {
      const rings = zones.water.filter((r) => r.length >= 3).map((r) => [r.map(([lat, lng]) => [lng, lat] as [number, number])]);
      const tinted = withoutCrossingDecks(polygonClipping.union(rings[0], ...rings.slice(1)));
      // Singapore River deck near Coleman Bridge: inside a raw water ring.
      expect(zones.water.some((r) => inPolygon(1.289687, 103.847834, r))).toBe(true);
      expect(contains(tinted, 1.289687, 103.847834)).toBe(false);
      expect(contains(tinted, 1.2875, 103.8495)).toBe(true); // open river, no deck
    } finally {
      installZones({ ...zones, crossings: [] });
    }
  }, 20_000);

  it('preserves water beside the crossing and leaves source geometry intact', () => {
    const tinted = withoutCrossingDecks(water);
    expect(contains(tinted, 1.2607, 103.82322)).toBe(true);
    expect(contains(tinted, 1.2607, 103.82402)).toBe(true);
    expect(contains(water, 1.2607, 103.82362)).toBe(true);
    expect(withoutCrossingDecks([])).toEqual([]);
  });
});
