import { memo, useEffect, useRef } from 'react';
import { Marker } from 'maplibre-gl';
import { hoursLeft, liveDisturbances, type Disturbance } from '../game/disturbance';
import { useMapGL } from '../map/hooks';
import { installOverlay, setData } from '../map/layers';
import { circleFeature, fc, EMPTY_FC } from '../map/geo';
import { useT } from '../i18n';
import { typeCss } from '../ui/type';

/**
 * Disturbance zones on the map: a warm wash with a dashed edge, and a tag at
 * the top of each ring naming what made it and how long it has left. Data is
 * set only when the zones or the game hour change, so a still camera costs no
 * renders.
 */

const HISS = '#d92d2d';
const SRC = 'disturbance-src';
const SPEAKER =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h3l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M19 5.5a9 9 0 0 1 0 13"/></svg>';

function tagElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'disturbance-tag';
  el.style.cssText = `${typeCss('micro')}display:flex;align-items:center;gap:4px;padding:1px 6px;`
    + `border-radius:3px;border:1px solid ${HISS}99;background:rgba(20,12,12,0.82);color:${HISS};`
    + 'white-space:nowrap;pointer-events:none;';
  return el;
}

/** Where the tag sits: the ring's northern edge. */
function northEdge(z: Disturbance): [number, number] {
  return [z.lng, z.lat + z.radiusM / 111_320];
}

function DisturbanceZonesInner({ zones, now }: { zones: Disturbance[]; now: number }) {
  const map = useMapGL();
  const { t } = useT();
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLDivElement }>());

  useEffect(() => {
    const off = installOverlay(map, 'hazard', { [SRC]: 'geojson' }, [
      {
        id: 'disturbance-fill',
        type: 'fill',
        source: SRC,
        paint: { 'fill-color': HISS, 'fill-opacity': 0.09 },
      },
      {
        id: 'disturbance-line',
        type: 'line',
        source: SRC,
        paint: { 'line-color': HISS, 'line-width': 1.6, 'line-opacity': 0.7, 'line-dasharray': [2, 2] },
      },
    ]);
    const live = markers.current;
    return () => {
      for (const { marker } of live.values()) marker.remove();
      live.clear();
      off();
    };
  }, [map]);

  useEffect(() => {
    const live = liveDisturbances(zones, now);
    setData(map, SRC, live.length
      ? fc(live.map((z) => circleFeature(z.lat, z.lng, z.radiusM, { id: z.id })))
      : EMPTY_FC);
    const keep = new Set(live.map((z) => z.id));
    for (const [id, entry] of markers.current) {
      if (keep.has(id)) continue;
      entry.marker.remove();
      markers.current.delete(id);
    }
    for (const z of live) {
      let entry = markers.current.get(z.id);
      if (!entry) {
        const el = tagElement();
        const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat(northEdge(z)).addTo(map);
        entry = { marker, el };
        markers.current.set(z.id, entry);
      } else {
        entry.marker.setLngLat(northEdge(z));
      }
      entry.el.innerHTML = `${SPEAKER}<span></span>`;
      entry.el.lastElementChild!.textContent = t('ui.disturbance.reason', {
        what: t(`ui.disturbance.kind.${z.kind}`), h: hoursLeft(z, now),
      });
    }
  }, [map, zones, now, t]);

  return null;
}

export const DisturbanceZones = memo(DisturbanceZonesInner);
