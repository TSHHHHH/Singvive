import { describe, expect, it, vi } from 'vitest';
import type { Map as MlMap } from 'maplibre-gl';
import { PoiSources, type PoiSourceItem } from './poiSources';

function fixture() {
  const polygons = { setData: vi.fn() }, dots = { setData: vi.fn() };
  const map = { getSource: (id: string) => id === 'poi-src' ? polygons : dots,
    setFeatureState: vi.fn(), removeFeatureState: vi.fn() };
  const item: PoiSourceItem = { id: 'way/a', lat: 1.3, lng: 103.8,
    ring: [[1.3,103.8],[1.301,103.8],[1.3,103.801]],
    outline: { fill: '#fff', w: 1 }, dot: { opacity: .55, badge: false } };
  return { polygons, dots, map, item, updater: new PoiSources() };
}
describe('stable POI sources', () => {
  it('updates selection and colours without resubmitting geometry', () => {
    const { polygons, dots, map, item, updater } = fixture();
    updater.update(map as unknown as MlMap, [item]);
    updater.update(map as unknown as MlMap, [{ ...item, outline: { fill: '#f00', w: 2.5 }, dot: { opacity: 1, badge: true } }]);
    expect(polygons.setData).toHaveBeenCalledTimes(1);
    expect(dots.setData).toHaveBeenCalledTimes(1);
    expect(map.setFeatureState).toHaveBeenLastCalledWith({ source: 'poi-dots-src', id: 'way/a' }, { opacity: 1, badge: true });
    expect(polygons.setData.mock.calls[0][0].features[0].id).toBe('way/a');
  });
  it('removes hidden sites and their state, then rebuilds when coordinates change', () => {
    const { polygons, map, item, updater } = fixture();
    updater.update(map as unknown as MlMap, [item]);
    updater.update(map as unknown as MlMap, []);
    expect(polygons.setData.mock.calls[1][0].features).toEqual([]);
    expect(map.removeFeatureState).toHaveBeenCalledWith({ source: 'poi-src', id: item.id });
    updater.update(map as unknown as MlMap, [{ ...item, lat: 1.301 }]);
    expect(polygons.setData).toHaveBeenCalledTimes(3);
  });
});
