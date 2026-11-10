import { useEffect, useMemo } from 'react';
import { Marker } from 'maplibre-gl';
import type { Poi } from '../game/types';
import { useMapGL } from '../map/hooks';
import { alive } from '../map/layers';
import { beaconHeightPx, beaconsKey, landmarkBeacons, type Beacon } from '../map/beacons';

/** Pillar markup; the look and the breathing live in index.css `.beacon`. */
function beaconElement(b: Beacon, phase: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `beacon beacon--${b.kind}`;
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--beacon-c', b.color);
  el.style.setProperty('--beacon-phase', `${(-phase).toFixed(2)}s`);
  el.innerHTML =
    '<div class="beacon__halo"></div><div class="beacon__core"></div>' +
    (b.kind === 'evac' ? '<div class="beacon__pulse"></div>' : '') +
    '<div class="beacon__base"></div>';
  return el;
}

/** A per-site phase so neighbouring beacons don't breathe in step. */
function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 280) / 100;
}

/**
 * Light pillars over the extraction zone and faction outposts (3D only).
 *
 * One marker per landmark, slotted straight after the map canvas so every
 * site badge and the player pin draw over its foot. Height is one CSS
 * variable on the container, kept current on every camera move.
 */
export function Beacons3d({ pois, evacZoneId }: { pois: readonly Poi[]; evacZoneId: string | null }) {
  const map = useMapGL();

  const fresh = useMemo(() => landmarkBeacons(pois, evacZoneId), [pois, evacZoneId]);
  const key = beaconsKey(fresh);
  // Rebuild markers only when the set of landmarks actually changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const beacons = useMemo(() => fresh, [key]);

  useEffect(() => {
    const box = map.getContainer();
    const update = () => {
      const px = beaconHeightPx(map.getZoom(), map.getCenter().lat, map.getPitch());
      box.style.setProperty('--beacon-h', `${px.toFixed(1)}px`);
    };
    update();
    map.on('move', update);
    return () => {
      box.style.removeProperty('--beacon-h');
      if (alive(map)) map.off('move', update);
    };
  }, [map]);

  useEffect(() => {
    if (!beacons.length) return;
    const canvas = map.getCanvas();
    const markers = beacons.map((b) => {
      const el = beaconElement(b, phaseOf(b.id));
      const m = new Marker({ element: el, anchor: 'bottom' }).setLngLat([b.lng, b.lat]).addTo(map);
      // Markers paint in DOM order; sit right above the canvas, under every pin.
      canvas.after(el);
      return m;
    });
    return () => {
      for (const m of markers) m.remove();
    };
  }, [map, beacons]);

  return null;
}
