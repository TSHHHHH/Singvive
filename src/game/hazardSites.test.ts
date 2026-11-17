import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bufferedHullDistance,
  bufferedHullRing,
  decodeHazardSites,
  installHazardSites,
  type HazardSitesFile,
} from './hazardSites';
import { installZones, type ZonesData } from './playable';
import { hazardZonesNear, pointInZone, THEME_KIND, type HazardZone } from './wilds';

const M_LAT = 111000;
const M_LNG = 111000 * Math.cos((1.35 * Math.PI) / 180);

/** 100 m square, counter-clockwise, south-west corner at (1.35, 103.8). */
const square: [number, number][] = [
  [1.35, 103.8],
  [1.35, 103.8 + 100 / M_LNG],
  [1.35 + 100 / M_LAT, 103.8 + 100 / M_LNG],
  [1.35 + 100 / M_LAT, 103.8],
];

describe('buffered hull geometry', () => {
  it('measures to the grown edge', () => {
    const mid = [1.35 + 50 / M_LAT, 103.8 + 50 / M_LNG] as const;
    expect(bufferedHullDistance(mid[0], mid[1], square, 40)).toBeCloseTo(-90, 0);
    const east = (m: number) => bufferedHullDistance(mid[0], 103.8 + (100 + m) / M_LNG, square, 40);
    expect(east(30)).toBeCloseTo(-10, 0);
    expect(east(50)).toBeCloseTo(10, 0);
    // Corners round off: 40 m out along the diagonal is outside a 40 m buffer.
    const d = 40 / Math.SQRT2 + 5;
    expect(bufferedHullDistance(1.35 - d / M_LAT, 103.8 - d / M_LNG, square, 40)).toBeGreaterThan(0);
  });

  it('draws the same shape it hit-tests', () => {
    const ring = bufferedHullRing(square, 55);
    expect(ring.length).toBeGreaterThan(12);
    for (const [lat, lng] of ring) {
      expect(Math.abs(bufferedHullDistance(lat, lng, square, 55))).toBeLessThan(1.5);
    }
  });
});

describe('zones on real places', () => {
  const file = JSON.parse(readFileSync('public/hazard-sites.json', 'utf8')) as HazardSitesFile;
  const zones = JSON.parse(readFileSync('public/zones.json', 'utf8')) as ZonesData;

  beforeAll(() => {
    installZones(zones);
    installHazardSites(file);
  });
  afterAll(() => installHazardSites([]));

  it('decodes every baked site into a closed hull', () => {
    const sites = decodeHazardSites(file);
    expect(sites.length).toBe(file.sites.length);
    for (const s of sites.slice(0, 500)) {
      expect(s.hull.length).toBeGreaterThanOrEqual(3);
      expect(s.lat).toBeGreaterThan(1.15);
      expect(s.lat).toBeLessThan(1.5);
    }
  });

  // Toa Payoh: HDB estate, schools, hawker centres, an MRT station.
  const near = (seed: string): HazardZone[] => hazardZonesNear(seed, 1.3327, 103.8474, 1500);

  it('anchors town hazards on real footprints, deterministically', () => {
    const a = near('town-a');
    const b = near('town-a');
    expect(a.map((z) => z.id)).toEqual(b.map((z) => z.id));
    expect(a.map((z) => z.radiusM)).toEqual(b.map((z) => z.radiusM));
    const sited = a.filter((z) => z.site);
    expect(sited.length).toBeGreaterThan(a.filter((z) => !z.site && z.kind !== 'wildlife_water').length);
    for (const z of sited) {
      expect(z.kind).toBe(THEME_KIND[z.site!.theme]);
      expect(z.discs).toEqual([]);
      // The place itself is always inside its own zone.
      const [lat, lng] = z.site!.hull[0];
      expect(pointInZone(lat, lng, z)).toBe(true);
    }
  });

  it('spreads themes across the kinds of place', () => {
    const themes = new Set<string>();
    for (let i = 0; i < 12; i++) for (const z of near(`town-${i}`)) if (z.site) themes.add(z.site.theme);
    expect(themes.size).toBeGreaterThanOrEqual(5);
  });

  it('keeps the spawn bubble clear of site zones', () => {
    for (const z of near('town-a').filter((q) => q.site)) {
      const [lat, lng] = z.site!.hull[0];
      const clear = hazardZonesNear('town-a', lat, lng, 0, { lat, lng });
      expect(clear.some((q) => q.id === z.id)).toBe(false);
    }
  });
});
