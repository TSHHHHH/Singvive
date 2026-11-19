import { useEffect, useState } from 'react';
import { Marker } from 'maplibre-gl';
import type { TimeOfDay } from '../game/types';
import { useT } from '../i18n';
import { useMapGL } from '../map/hooks';
import { alive, installOverlay, setData, setVisible } from '../map/layers';
import { getBorder, loadBorder } from '../map/borderData';
import type { BorderScene } from '../map/borderGeometry';
import { pxPerMetre } from '../map/geo';
import { typeCss } from '../ui/type';

/**
 * The sealed Singapore–Johor border (data: public/border.json, geometry:
 * map/borderGeometry.ts). It sits above the fog: everyone knows the Causeway
 * went on outbreak day, so a survivor never has to walk there to learn it.
 *
 *  - terrain: opaque water over the blown span, so the basemap's road under
 *    it disappears.
 *  - wash: Johor Bahru's quarantine tint and razor wire, and the 2D footprints
 *    of the decks, barriers, debris and stalled cars.
 *  - buildings: the same pieces as extrusions in 3D (decks on piers, the
 *    Second Link climbing to its navigation span, the RTS viaduct).
 *  - DOM: names, searchlights sweeping
 *    the strait from the Johor side after dark.
 *
 * All static: data is set once, so nothing redraws while the camera is still.
 * The searchlights use CSS transforms over the canvas.
 */

const HISS = '#d92d2d';
/** Names show from district scale in; the viaduct's only once it stands apart from the Causeway. */
const LABEL_ZOOM: Record<BorderScene['labels'][number]['id'], number> = { johor: 10.8, causeway: 11.6, secondLink: 11.6, rts: 14 };
/** How far a searchlight reaches across the water, in metres. */
const LIGHT_REACH_M = 650;

const FLAT = ['border-flat', 'border-rts-line'];
const SOLID = ['border-solid'];

function labelElement(title: string, state: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'border-label';
  el.style.pointerEvents = 'none';
  const name = document.createElement('div');
  name.style.cssText = `${typeCss('micro')}color:#e8e5dd;text-transform:uppercase;`;
  name.textContent = title;
  const tag = document.createElement('div');
  tag.style.cssText = `${typeCss('micro')}color:${HISS};text-transform:uppercase;`;
  tag.textContent = state;
  el.append(name, tag);
  return el;
}

function lightElement(bearing: number, phase: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'border-light';
  el.setAttribute('aria-hidden', 'true');
  // MapLibre owns the marker's own transform, so the aim lives one level in.
  const aim = document.createElement('div');
  aim.className = 'border-light__aim';
  aim.style.transform = `rotate(${bearing}deg)`;
  const beam = document.createElement('div');
  beam.className = 'border-light__beam';
  beam.style.animationDelay = `${-phase}s`;
  aim.appendChild(beam);
  const lamp = document.createElement('div');
  lamp.className = 'border-light__lamp';
  el.append(aim, lamp);
  return el;
}

export function BorderLayers({ view3d, time }: { view3d: boolean; time: TimeOfDay }) {
  const map = useMapGL();
  const { t } = useT();
  const [scene, setScene] = useState<BorderScene | null>(getBorder);

  useEffect(() => {
    if (scene) return;
    let live = true;
    void loadBorder()
      .then((s) => {
        if (live) setScene(s);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [scene]);

  // Map layers, installed once.
  useEffect(() => {
    const offTerrain = installOverlay(map, 'terrain', { 'border-breach-src': 'geojson' }, [
      {
        id: 'border-breach',
        type: 'fill',
        source: 'border-breach-src',
        paint: { 'fill-color': '#0c1f29', 'fill-opacity': 0.94, 'fill-antialias': false },
      },
    ]);
    const offWash = installOverlay(
      map,
      'wash',
      { 'border-johor-src': 'geojson', 'border-flat-src': 'geojson', 'border-line-src': 'geojson' },
      [
        {
          id: 'border-johor-tint',
          type: 'fill',
          source: 'border-johor-src',
          paint: { 'fill-color': HISS, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.07, 15, 0.035], 'fill-antialias': false },
        },
        {
          id: 'border-cordon',
          type: 'line',
          source: 'border-line-src',
          filter: ['==', ['get', 'kind'], 'cordon'],
          layout: { 'line-join': 'round' },
          paint: {
            'line-color': HISS,
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.35, 14, 0.6],
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 1.8],
            'line-dasharray': [3, 2],
          },
        },
        {
          id: 'border-flat',
          type: 'fill',
          source: 'border-flat-src',
          minzoom: 13,
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 15, 0.95] },
        },
        {
          id: 'border-pipes',
          type: 'line',
          source: 'border-line-src',
          minzoom: 14,
          filter: ['==', ['get', 'kind'], 'pipe'],
          paint: { 'line-color': '#7d8b90', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 18, 3], 'line-opacity': 0.85 },
        },
        {
          id: 'border-rts-line',
          type: 'line',
          source: 'border-line-src',
          minzoom: 12,
          filter: ['==', ['get', 'kind'], 'rts'],
          paint: { 'line-color': '#6d7175', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 17, 5], 'line-opacity': 0.8 },
        },
      ],
    );
    const offSolid = installOverlay(map, 'buildings', { 'border-solid-src': 'geojson' }, [
      {
        id: 'border-solid',
        type: 'fill-extrusion',
        source: 'border-solid-src',
        minzoom: 12.5,
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-height': ['get', 'top'],
          'fill-extrusion-opacity': 0.95,
          'fill-extrusion-vertical-gradient': true,
        },
      },
    ]);
    return () => {
      offSolid();
      offWash();
      offTerrain();
    };
  }, [map]);

  useEffect(() => {
    if (!scene) return;
    setData(map, 'border-breach-src', scene.breach);
    setData(map, 'border-johor-src', scene.johor);
    setData(map, 'border-flat-src', scene.flat);
    setData(map, 'border-line-src', scene.lines);
    setData(map, 'border-solid-src', scene.solids);
  }, [map, scene]);

  // 2D footprints and 3D solids never show together.
  useEffect(() => {
    setVisible(map, FLAT, !view3d);
    setVisible(map, SOLID, view3d);
  }, [map, view3d, scene]);

  // Names, shown from district scale in.
  useEffect(() => {
    if (!scene) return;
    const copy: Record<BorderScene['labels'][number]['id'], [string, string]> = {
      causeway: [t('ui.border.causeway'), t('ui.border.causewayState')],
      secondLink: [t('ui.border.secondLink'), t('ui.border.secondLinkState')],
      rts: [t('ui.border.rts'), t('ui.border.rtsState')],
      johor: [t('ui.border.johor'), t('ui.border.johorState')],
    };
    const markers = scene.labels.map((l) =>
      new Marker({ element: labelElement(...copy[l.id]), anchor: 'left', offset: [18, 0] }).setLngLat([l.lng, l.lat]).addTo(map),
    );
    const shown: (boolean | null)[] = markers.map(() => null);
    const sync = () => {
      const z = map.getZoom();
      markers.forEach((m, i) => {
        const on = z >= LABEL_ZOOM[scene.labels[i].id];
        if (on === shown[i]) return;
        shown[i] = on;
        m.getElement().style.visibility = on ? 'visible' : 'hidden';
      });
    };
    sync();
    map.on('zoom', sync);
    return () => {
      for (const m of markers) m.remove();
      if (alive(map)) map.off('zoom', sync);
    };
  }, [map, scene, t]);

  // Searchlights from the Johor side, after dark only.
  const dark = time !== 'day';
  useEffect(() => {
    if (!scene || !dark) return;
    const box = map.getContainer();
    const size = () => {
      const px = LIGHT_REACH_M * pxPerMetre(map.getZoom(), scene.smoke.lat);
      box.style.setProperty('--border-light-r', `${Math.min(900, px).toFixed(1)}px`);
    };
    size();
    map.on('zoom', size);
    const markers = scene.lights.map((l, i) =>
      new Marker({ element: lightElement(l.bearing, i * 2.3), anchor: 'center', rotationAlignment: 'map', pitchAlignment: 'map' })
        .setLngLat([l.lng, l.lat])
        .addTo(map),
    );
    return () => {
      for (const m of markers) m.remove();
      box.style.removeProperty('--border-light-r');
      if (alive(map)) map.off('zoom', size);
    };
  }, [map, scene, dark]);

  return null;
}
