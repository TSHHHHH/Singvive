import { useEffect, useRef } from 'react';
import type { ExploredCircle } from '../game/fog';
import { useMapGL } from '../map/hooks';
import { installOverlay, setData } from '../map/layers';
import { FOG_BANDS, FOG_COLOUR, FOG_TOTAL, FogGeometry, bandOpacity } from '../map/fogGeometry';
import type { RangeMotion } from '../map/rangeMotion';

export interface FogOverlayProps {
  exploredArea: ExploredCircle[];
  currentRevealCenter: { lat: number; lng: number };
  /** the live sight radius; the fog edge follows it frame by frame */
  revealRadius: RangeMotion;
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

export function FogOverlay({ exploredArea, currentRevealCenter, revealRadius }: FogOverlayProps) {
  const map = useMapGL();
  const geom = useRef(new FogGeometry());

  useEffect(() => {
    const op = bandOpacity(FOG_TOTAL);
    return installOverlay(
      map,
      'fog',
      { 'fog-src': 'geojson' },
      bandIds.map((id, k) => ({
        id: `${id}-fill`,
        type: 'fill' as const,
        source: 'fog-src',
        filter: ['==', ['get', 'band'], k],
        paint: { 'fill-color': FOG_COLOUR, 'fill-opacity': op, 'fill-antialias': false },
      })),
    );
  }, [map]);

  const { lat, lng } = currentRevealCenter;
  useEffect(() => {
    // Cutting one disc from the cached explored base is ~1 ms, so the edge
    // keeps pace with the travel ring instead of stepping behind it. A busy
    // GeoJSON worker coalesces the uploads to the latest one.
    const draw = (radius: number) => {
      let bands;
      try {
        bands = geom.current.compute(exploredArea, { lat, lng, radius });
      } catch {
        // polygon-clipping can throw on a degenerate union; keep last frame.
        return;
      }
      // One worker update per sight sample. Separate layers still blend each
      // band over the previous one, even where their polygons overlap.
      setData(map, 'fog-src', {
        type: 'FeatureCollection',
        features: bands.flatMap((data, band) => data.features.map(f => ({ ...f, properties: { band } }))),
      });
    };
    draw(revealRadius.value);
    return revealRadius.subscribe(draw);
  }, [map, exploredArea, lat, lng, revealRadius]);

  return null;
}
