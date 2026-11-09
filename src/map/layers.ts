import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MlMap,
  SourceSpecification,
} from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { EMPTY_FC } from './geo';
import { slotId, type Slot } from './mapStyle';

/**
 * Small imperative helpers for overlays that own a few sources and layers.
 * Every overlay installs on mount and uninstalls on unmount; the map may
 * already be gone by then (MapView removes it first), hence `alive`.
 */

const removed = new WeakSet<MlMap>();

export function markRemoved(map: MlMap) {
  removed.add(map);
}

export function alive(map: MlMap): boolean {
  return !removed.has(map);
}

export type OverlayLayer = LayerSpecification & { source?: string };

/**
 * Add GeoJSON sources (empty, data comes via `setData`) and layers in the
 * given slot, bottom first. Returns the uninstaller.
 */
export function installOverlay(
  map: MlMap,
  slot: Slot,
  sources: Record<string, SourceSpecification | 'geojson'>,
  layers: OverlayLayer[],
): () => void {
  for (const [id, spec] of Object.entries(sources)) {
    if (map.getSource(id)) continue;
    map.addSource(id, spec === 'geojson' ? { type: 'geojson', data: EMPTY_FC } : spec);
  }
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) map.addLayer(layer, slotId(slot));
  }
  return () => {
    if (!alive(map)) return;
    for (const layer of layers) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    for (const id of Object.keys(sources)) if (map.getSource(id)) map.removeSource(id);
  };
}

export function setData(map: MlMap, sourceId: string, data: FeatureCollection) {
  if (!alive(map)) return;
  (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
}

export function setVisible(map: MlMap, layerIds: string[], on: boolean) {
  if (!alive(map)) return;
  for (const id of layerIds) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
}
