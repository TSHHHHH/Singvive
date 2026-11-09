import { useEffect } from 'react';
import type { FeatureCollection } from 'geojson';
import { useMapGL } from '../map/hooks';
import { installOverlay, setData } from '../map/layers';
import { circleRing, type LngLatPair } from '../map/geo';
import { EDGE_CLEAR_M, EDGE_DARK_M, ISLAND_CENTRE } from '../map/mapStyle';

/**
 * Darkens the world beyond the island: a disc stays clear, then concentric
 * bands fade to near-black, and everything past the last ring is solid. The
 * geometry is static, so it is built once per page.
 */

const SRC = 'edge-src';
const LAYER = 'edge-fill';
const COLOUR = '#050506';
const MAX_OPACITY = 0.95;
const BANDS = 16;
const STEPS = 128;
const WORLD: LngLatPair[] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

let cached: FeatureCollection | null = null;

function vignette(): FeatureCollection {
  if (cached) return cached;
  const { lat, lng } = ISLAND_CENTRE;
  const ring = (i: number) => circleRing(lat, lng, EDGE_CLEAR_M + ((EDGE_DARK_M - EDGE_CLEAR_M) * i) / BANDS, STEPS);
  const rings = Array.from({ length: BANDS + 1 }, (_, i) => ring(i));
  const features: FeatureCollection['features'] = [];
  for (let i = 0; i < BANDS; i++) {
    // Smoothstep on the band midpoint: soft start, soft landing.
    const t = (i + 0.5) / BANDS;
    const o = MAX_OPACITY * t * t * (3 - 2 * t);
    features.push({
      type: 'Feature',
      properties: { o },
      // Outer ring, inner ring as a hole (reversed for winding).
      geometry: { type: 'Polygon', coordinates: [rings[i + 1], [...rings[i]].reverse()] },
    });
  }
  features.push({
    type: 'Feature',
    properties: { o: MAX_OPACITY },
    geometry: { type: 'Polygon', coordinates: [WORLD, [...rings[BANDS]].reverse()] },
  });
  cached = { type: 'FeatureCollection', features };
  return cached;
}

export function EdgeVignette() {
  const map = useMapGL();
  useEffect(() => {
    const uninstall = installOverlay(map, 'edge', { [SRC]: 'geojson' }, [
      {
        id: LAYER,
        type: 'fill',
        source: SRC,
        paint: { 'fill-color': COLOUR, 'fill-opacity': ['get', 'o'], 'fill-antialias': false },
      },
    ]);
    setData(map, SRC, vignette());
    return uninstall;
  }, [map]);
  return null;
}
