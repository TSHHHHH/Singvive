import { useEffect } from 'react';
import { NEIGHBOURHOODS } from '../game/singapore';
import { useMapGL } from '../map/hooks';
import { installOverlay, setData } from '../map/layers';
import { BASEMAP } from '../map/mapStyle';
import { fc } from '../map/geo';
import { ISLAND_STATUS_ZOOM } from './NeighbourhoodWash';

/** Names show across this zoom band: below it the town wash names areas on hover. */
const SHOW_FROM = ISLAND_STATUS_ZOOM;
const SHOW_UNTIL = 14;
const FADE = 0.4;
const OPACITY = 0.42;

/**
 * Faint, wide-spaced district names (Tampines, Jurong East…) while zoomed out
 * to the district scale. They sit above the fog: a survivor knows where
 * Tampines is without having walked it. Static data, set once; the fade is a
 * zoom expression, so nothing redraws while the camera is still.
 */
export function DistrictNames() {
  const map = useMapGL();
  useEffect(() => {
    const off = installOverlay(map, 'wash', { 'district-src': 'geojson' }, [
      {
        id: 'district-names',
        type: 'symbol',
        source: 'district-src',
        minzoom: SHOW_FROM,
        maxzoom: SHOW_UNTIL,
        layout: {
          'text-field': ['upcase', ['get', 'name']],
          'text-font': [BASEMAP.fonts[0]],
          'text-size': ['interpolate', ['linear'], ['zoom'], SHOW_FROM, 11, SHOW_UNTIL, 14],
          'text-letter-spacing': 0.35,
          'text-max-width': 12,
          'text-padding': 24,
          'text-pitch-alignment': 'viewport',
        },
        paint: {
          'text-color': '#d8d3c4',
          'text-halo-color': '#060806',
          'text-halo-width': 1.2,
          'text-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            SHOW_FROM,
            0,
            SHOW_FROM + FADE,
            OPACITY,
            SHOW_UNTIL - FADE,
            OPACITY,
            SHOW_UNTIL,
            0,
          ],
        },
      },
    ]);
    setData(
      map,
      'district-src',
      fc(
        NEIGHBOURHOODS.map((n) => ({
          type: 'Feature' as const,
          properties: { name: n.name },
          geometry: { type: 'Point' as const, coordinates: [n.lng, n.lat] },
        })),
      ),
    );
    return off;
  }, [map]);
  return null;
}
