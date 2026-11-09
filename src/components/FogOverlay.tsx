import { useEffect, useRef } from 'react';
import type { ExploredCircle } from '../game/fog';
import { useMapGL } from '../map/hooks';
import { installOverlay, setData } from '../map/layers';
import { FOG_BANDS, FOG_COLOUR, FOG_TOTAL, FogGeometry, bandOpacity } from '../map/fogGeometry';

export interface FogOverlayProps {
  exploredArea: ExploredCircle[];
  currentRevealCenter: { lat: number; lng: number };
  currentRevealRadius: number;
}

/**
 * Fog of war as ground polygons: the world minus every explored disc and the
 * live sight disc (see map/fogGeometry.ts). It sits in slot `fog`, above the
 * basemap ground and labels and below every game layer, so pins, rings and
 * the MRT stay readable through it.
 *
 * Near-black on purpose: the unexplored island should recede, not compete.
 * Three stacked bands give the edge a soft step instead of a hard cut.
 */
const bandIds = Array.from({ length: FOG_BANDS }, (_, k) => `fog-${k}`);

export function FogOverlay({ exploredArea, currentRevealCenter, currentRevealRadius }: FogOverlayProps) {
  const map = useMapGL();
  const geom = useRef(new FogGeometry());

  useEffect(() => {
    const op = bandOpacity(FOG_TOTAL);
    return installOverlay(
      map,
      'fog',
      Object.fromEntries(bandIds.map((id) => [id, 'geojson' as const])),
      bandIds.map((id) => ({
        id: `${id}-fill`,
        type: 'fill' as const,
        source: id,
        paint: { 'fill-color': FOG_COLOUR, 'fill-opacity': op, 'fill-antialias': false },
      })),
    );
  }, [map]);

  const { lat, lng } = currentRevealCenter;
  useEffect(() => {
    let bands;
    try {
      bands = geom.current.compute(exploredArea, { lat, lng, radius: currentRevealRadius });
    } catch {
      // polygon-clipping can throw on a degenerate union; keep last frame.
      return;
    }
    bands.forEach((data, k) => setData(map, bandIds[k], data));
  }, [map, exploredArea, lat, lng, currentRevealRadius]);

  return null;
}
