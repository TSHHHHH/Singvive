import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import { fc, toLngLatRing } from './geo';

export interface PoiSourceItem {
  id: string;
  lat: number;
  lng: number;
  ring?: [number, number][];
  outline: Record<string, unknown> | null;
  dot: Record<string, unknown>;
}

/** Geometry changes go to the worker; appearance changes stay in feature-state. */
export class PoiSources {
  private previous: PoiSourceItem[] = [];
  private polygons?: GeoJSONSource;
  private dots?: GeoJSONSource;
  private states = new Map<string, string>();

  update(map: MlMap, items: PoiSourceItem[]): void {
    const polygons = map.getSource('poi-src') as GeoJSONSource | undefined;
    const dots = map.getSource('poi-dots-src') as GeoJSONSource | undefined;
    if (!polygons || !dots) return;
    const changed = polygons !== this.polygons || dots !== this.dots
      || items.length !== this.previous.length
      || items.some((item, i) => {
        const old = this.previous[i];
        return item.id !== old.id || item.lat !== old.lat || item.lng !== old.lng || item.ring !== old.ring;
      });
    if (changed) {
      const nextIds = new Set(items.map((p) => p.id));
      for (const p of this.previous) if (!nextIds.has(p.id)) {
        map.removeFeatureState({ source: 'poi-src', id: p.id });
        map.removeFeatureState({ source: 'poi-dots-src', id: p.id });
      }
      polygons.setData(fc(items.filter((p) => p.ring && p.ring.length >= 3).map((p) => ({
        type: 'Feature', id: p.id, properties: { id: p.id },
        geometry: { type: 'Polygon', coordinates: [toLngLatRing(p.ring!)] },
      }))));
      dots.setData(fc(items.map((p) => ({
        type: 'Feature', id: p.id, properties: { id: p.id },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      }))));
      this.states.clear();
      this.polygons = polygons;
      this.dots = dots;
    }
    for (const p of items) {
      const key = JSON.stringify([p.outline, p.dot]);
      if (this.states.get(p.id) === key) continue;
      if (p.ring && p.outline) map.setFeatureState({ source: 'poi-src', id: p.id }, p.outline);
      map.setFeatureState({ source: 'poi-dots-src', id: p.id }, p.dot);
      this.states.set(p.id, key);
    }
    this.previous = items;
  }
}
