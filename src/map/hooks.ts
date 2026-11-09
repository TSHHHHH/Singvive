import { createContext, useContext, useEffect, useRef } from 'react';
import type { Map as MlMap, MapEventType, MapLayerEventType } from 'maplibre-gl';

/** The loaded map, provided by <MapView> to its children. */
export const MapContext = createContext<MlMap | null>(null);

export function useMapGL(): MlMap {
  const map = useContext(MapContext);
  if (!map) throw new Error('useMapGL() outside <MapView>');
  return map;
}

/**
 * Subscribe to a map event for the component's lifetime. The handler may
 * change every render; only the latest one is called.
 */
export function useMapEvent<T extends keyof MapEventType>(type: T, handler: (e: MapEventType[T]) => void) {
  const map = useMapGL();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (e: MapEventType[T]) => ref.current(e);
    map.on(type, fn);
    return () => {
      map.off(type, fn);
    };
  }, [map, type]);
}

/** Same as useMapEvent, for events on one style layer (click / mouseenter …). */
export function useLayerEvent<T extends keyof MapLayerEventType>(
  type: T,
  layerId: string,
  handler: (e: MapLayerEventType[T]) => void,
) {
  const map = useMapGL();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (e: MapLayerEventType[T]) => ref.current(e);
    map.on(type, layerId, fn);
    return () => {
      map.off(type, layerId, fn);
    };
  }, [map, type, layerId]);
}
