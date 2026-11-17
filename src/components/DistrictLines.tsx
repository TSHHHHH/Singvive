import { useEffect } from 'react';
import type { Feature } from 'geojson';
import { useMapGL } from '../map/hooks';
import { installOverlay, setData } from '../map/layers';
import { fc } from '../map/geo';
import { ISLAND_STATUS_ZOOM } from './NeighbourhoodWash';

interface SubzonesFile {
  lines: number[][];
}

let cache: Feature[] | null = null;
let pending: Promise<Feature[]> | null = null;

function decode(data: SubzonesFile): Feature[] {
  const out: Feature[] = [];
  for (const enc of data.lines) {
    const coords: [number, number][] = [];
    let lat = 0;
    let lng = 0;
    for (let i = 0; i + 1 < enc.length; i += 2) {
      lat += enc[i];
      lng += enc[i + 1];
      coords.push([lng / 1e5, lat / 1e5]);
    }
    if (coords.length >= 2) out.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
  }
  return out;
}

function loadLines(): Promise<Feature[]> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch(`${import.meta.env.BASE_URL}subzones.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`subzones.json ${res.status}`);
      return res.json() as Promise<SubzonesFile>;
    })
    .then((data) => (cache = decode(data)))
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}

/** Fade in just past the island overlay, where the town wash hands over. */
const FROM = ISLAND_STATUS_ZOOM - 0.3;
const FULL = ISLAND_STATUS_ZOOM + 0.5;

/**
 * Division-style district lines: thin pale borders of the URA subzones
 * (Tiong Bahru, Toa Payoh Central…) over the whole run map. They sit above
 * the fog: a survivor knows where one estate ends and the next begins.
 * Static data, set once; width and fade are zoom expressions, so nothing
 * redraws while the camera is still.
 */
export function DistrictLines() {
  const map = useMapGL();
  useEffect(() => {
    let live = true;
    const off = installOverlay(map, 'wash', { 'subzone-src': 'geojson' }, [
      {
        id: 'subzone-line',
        type: 'line',
        source: 'subzone-src',
        minzoom: FROM,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#dfe6e1',
          'line-width': ['interpolate', ['linear'], ['zoom'], FULL, 0.8, 16, 1.4],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], FROM, 0, FULL, 0.28, 16, 0.4],
        },
      },
    ]);
    void loadLines()
      .then((features) => {
        if (live) setData(map, 'subzone-src', fc(features));
      })
      .catch(() => {});
    return () => {
      live = false;
      off();
    };
  }, [map]);
  return null;
}
