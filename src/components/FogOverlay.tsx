import { useEffect, useRef } from 'react';
import type { ExploredCircle } from '../game/fog';
import { useMapGL } from '../map/hooks';
import { installOverlay, setData } from '../map/layers';
import { FOG_BANDS, FOG_COLOUR, FOG_TOTAL, FogGeometry, bandOpacity } from '../map/fogGeometry';
import type { RangeMotion } from '../map/rangeMotion';
import { followGlide } from '../map/glideFollow';
import type { TravelAnim } from '../game/store';

export interface FogOverlayProps {
  exploredArea: ExploredCircle[];
  /** where the player stands; during a walk the sight disc rides the pin instead */
  home: { lat: number; lng: number };
  /** the walk in progress, followed frame by frame on the pin's clock */
  travelAnim: TravelAnim | null;
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

export function FogOverlay({ exploredArea, home, travelAnim, revealRadius }: FogOverlayProps) {
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

  const { lat, lng } = home;
  useEffect(() => {
    // Cutting one disc from the cached explored base is ~1 ms, so the edge
    // keeps pace with the travel ring (both follow the pin every frame) instead
    // of stepping behind it. A busy GeoJSON worker coalesces the uploads to the
    // latest one.
    let at = { lat, lng };
    const draw = () => {
      let bands;
      try {
        bands = geom.current.compute(exploredArea, { lat: at.lat, lng: at.lng, radius: revealRadius.value });
      } catch {
        // polygon-clipping can throw on a degenerate union; keep last frame.
        return;
      }
      // One worker update per frame. Separate layers still blend each band
      // over the previous one, even where their polygons overlap.
      setData(map, 'fog-src', {
        type: 'FeatureCollection',
        features: bands.flatMap((data, band) => data.features.map(f => ({ ...f, properties: { band } }))),
      });
    };
    const offRadius = revealRadius.subscribe(draw);
    const offGlide = followGlide({ lat, lng }, travelAnim, (p) => {
      at = p;
      draw();
    });
    return () => {
      offGlide();
      offRadius();
    };
  }, [map, exploredArea, lat, lng, travelAnim, revealRadius]);

  return null;
}
