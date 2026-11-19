import { describe, expect, it } from 'vitest';
import { expression, type LayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import { DAY_ROADS, NIGHT_ROADS, ROAD_TIER, roadsFor, toneRole } from './basemapTone';

const tierOf = (properties: Record<string, string>) => {
  const e = expression.createExpression(ROAD_TIER);
  if (e.result !== 'success') throw new Error('bad expression');
  return e.value.evaluate({ zoom: 15 }, { type: 'LineString', properties } as never);
};

const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);

describe('road tiers', () => {
  it('reads Protomaps kinds', () => {
    expect(tierOf({ kind: 'highway', kind_detail: 'motorway' })).toBe('main');
    expect(tierOf({ kind: 'major_road', kind_detail: 'primary' })).toBe('main');
    expect(tierOf({ kind: 'major_road', kind_detail: 'tertiary' })).toBe('secondary');
    expect(tierOf({ kind: 'minor_road', kind_detail: 'residential' })).toBe('minor');
    expect(tierOf({ kind: 'path', kind_detail: 'footway' })).toBe('path');
  });

  it('reads OpenMapTiles classes too, and never fails on bare features', () => {
    expect(tierOf({ class: 'trunk' })).toBe('main');
    expect(tierOf({ class: 'secondary' })).toBe('secondary');
    expect(tierOf({ class: 'service' })).toBe('path');
    expect(tierOf({})).toBe('minor');
  });

  it('steps from bright main roads down to dark paths, day and night', () => {
    for (const t of [DAY_ROADS, NIGHT_ROADS]) {
      expect(lum(t.main)).toBeGreaterThan(lum(t.secondary));
      expect(lum(t.secondary)).toBeGreaterThan(lum(t.minor));
      expect(lum(t.minor)).toBeGreaterThan(lum(t.path));
    }
    expect(roadsFor('day')).toBe(DAY_ROADS);
    expect(lum(DAY_ROADS.main)).toBeLessThan(lum('#c0c0c0'));
    expect(roadsFor('dusk')).toBe(DAY_ROADS);
    // Night main roads are cool grey: blue channel on top.
    const n = NIGHT_ROADS.main;
    expect(parseInt(n.slice(5, 7), 16)).toBeGreaterThan(parseInt(n.slice(1, 3), 16));
  });
});

describe('toneRole', () => {
  const L = (l: Partial<LayerSpecification> & { id: string; type: string }) => l as LayerSpecification;
  it('classifies by what a layer draws, not by its id', () => {
    expect(toneRole(L({ id: 'bg', type: 'background' }))).toBe('background');
    expect(toneRole(L({ id: 'x1', type: 'fill', 'source-layer': 'water' } as never))).toBe('water');
    expect(toneRole(L({ id: 'x2', type: 'fill', 'source-layer': 'landuse' } as never))).toBe('land');
    expect(toneRole(L({ id: 'x3', type: 'fill', 'source-layer': 'earth' } as never))).toBe('ground');
    expect(toneRole(L({ id: 'roads_minor', type: 'line', 'source-layer': 'roads' } as never))).toBe('road');
    expect(toneRole(L({ id: 'roads_minor_casing', type: 'line', 'source-layer': 'roads' } as never))).toBe('casing');
    expect(toneRole(L({ id: 'tunnel_pri_fill', type: 'line', 'source-layer': 'transportation' } as never))).toBe('tunnel');
  });

  it('leaves labels, rail, boundaries and the building fill alone', () => {
    expect(toneRole(L({ id: 'roadname', type: 'symbol', 'source-layer': 'roads' } as never))).toBeNull();
    expect(toneRole(L({ id: 'roads_rail', type: 'line', 'source-layer': 'roads' } as never))).toBeNull();
    expect(toneRole(L({ id: 'b', type: 'line', 'source-layer': 'boundaries' } as never))).toBeNull();
    expect(toneRole(L({ id: 'bld', type: 'fill', 'source-layer': 'buildings' } as never))).toBeNull();
  });
});
