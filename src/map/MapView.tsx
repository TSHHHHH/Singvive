import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Map as MlMap } from 'maplibre-gl';
import { MapContext } from './hooks';
import { BASEMAP, SLOTS, slotId } from './mapStyle';
import { markRemoved } from './layers';
import type { LatLngBox } from './geo';

/**
 * The one MapLibre map host. It creates the map, installs the overlay slots
 * (see mapStyle.ts SLOTS) once the basemap style loads, keeps the canvas
 * sized to its box, and only then renders its children — every overlay can
 * assume `useMapGL()` returns a loaded map.
 *
 * Props are initial values (like Leaflet's MapContainer); move the camera
 * imperatively through the map.
 */

export interface MapViewProps {
  center: { lat: number; lng: number };
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  /** Camera can't leave this box. */
  bounds?: LatLngBox;
  pitch?: number;
  maxPitch?: number;
  bearing?: number;
  /** Allow rotate / tilt gestures (the 3D run map). 2D maps keep north up. */
  rotate?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** Called once with the loaded map. */
  onLoad?: (map: MlMap) => void;
}

export function MapView({
  center,
  zoom,
  minZoom = 0,
  maxZoom = 20,
  bounds,
  pitch = 0,
  maxPitch = 60,
  bearing = 0,
  rotate = false,
  className,
  style,
  children,
  onLoad,
}: MapViewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const init = useRef({ center, zoom, minZoom, maxZoom, bounds, pitch, maxPitch, bearing, rotate, onLoad });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const o = init.current;
    const m = new MlMap({
      container: box,
      style: BASEMAP.style,
      center: [o.center.lng, o.center.lat],
      zoom: o.zoom,
      minZoom: o.minZoom,
      maxZoom: o.maxZoom,
      pitch: o.pitch,
      maxPitch: o.rotate ? o.maxPitch : 0,
      bearing: o.bearing,
      maxBounds: o.bounds
        ? [
            [o.bounds.west, o.bounds.south],
            [o.bounds.east, o.bounds.north],
          ]
        : undefined,
      dragRotate: o.rotate,
      pitchWithRotate: o.rotate,
      touchPitch: o.rotate,
      attributionControl: { compact: true },
      // Game UI owns the double-tap (nothing) and keyboard (hotkeys).
      keyboard: false,
      fadeDuration: 150,
    });
    if (!o.rotate) {
      m.touchZoomRotate.disableRotation();
    }
    m.on('error', (e) => {
      // Tile / glyph hiccups are recoverable; keep them out of the way.
      if (import.meta.env.DEV) console.warn('[map]', e.error?.message ?? e);
    });

    let cancelled = false;
    m.once('load', () => {
      if (cancelled) return;
      installSlots(m);
      // DEV console handle, like `window.__game` (the last map mounted wins).
      if (import.meta.env.DEV) (window as unknown as { __map?: MlMap }).__map = m;
      setMap(m);
      o.onLoad?.(m);
    });

    // The phone layout hides the map tab with display:none; resize on return.
    const ro = new ResizeObserver(() => {
      if (box.clientWidth > 0 && box.clientHeight > 0) m.resize();
    });
    ro.observe(box);

    return () => {
      cancelled = true;
      ro.disconnect();
      markRemoved(m);
      m.remove();
    };
  }, []);

  return (
    <div ref={boxRef} className={className} style={style}>
      {map && <MapContext.Provider value={map}>{children}</MapContext.Provider>}
    </div>
  );
}

/**
 * Invisible marker layers, one per slot, in order. Overlays insert before
 * their slot's marker. The basemap's labels move under the fog.
 */
function installSlots(map: MlMap) {
  for (const slot of SLOTS) {
    map.addLayer({ id: slotId(slot), type: 'background', layout: { visibility: 'none' } });
  }
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol' && !layer.id.startsWith('slot:')) {
      map.moveLayer(layer.id, slotId('labels'));
    }
  }
}
