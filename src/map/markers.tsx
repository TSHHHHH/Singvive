import { useEffect, useRef } from 'react';
import type { Marker } from 'maplibre-gl';
import type { MapIcon } from '../components/mapIcons';
import type { BeaconKind } from './beacons';
import { useMapGL } from './hooks';
import { createMarker, setMarkerIcon } from './markerDom';

interface MapMarkerProps {
  lat: number;
  lng: number;
  icon: MapIcon;
  onClick?: () => void;
  /** Stack order among markers (Leaflet's zIndexOffset). */
  zIndex?: number;
  opacity?: number;
  /**
   * Roof height in metres (3D). The badge rides up to it by the map's
   * `--roof-lift` px-per-metre, which the building engine keeps current.
   */
  roof?: number;
  /** Selection ring around the badge in both flat and 3D views. */
  ring?: boolean;
  /** Optional native hover title (TipLayer adopts it). */
  title?: string;
  /**
   * The landmark beacon this site carries (3D). The badge rides the top of
   * the beam by the container's `--beacon-h`, which Beacons3d keeps current.
   */
  beacon?: BeaconKind | null;
}

/**
 * A DOM marker. The element is rebuilt only when the icon *identity* changes
 * (icons are cached per look), never on a re-render.
 */
export function MapMarker({
  lat,
  lng,
  icon,
  onClick,
  zIndex,
  opacity,
  roof = 0,
  ring = false,
  title,
  beacon = null,
}: MapMarkerProps) {
  const map = useMapGL();
  const ref = useRef<Marker | null>(null);
  const click = useRef(onClick);
  click.current = onClick;

  useEffect(() => {
    const m = createMarker(icon, lat, lng);
    const el = m.getElement();
    el.addEventListener('click', (ev) => {
      if (!click.current) return;
      // Keep the map's own click (ground pick) from firing underneath.
      ev.stopPropagation();
      click.current();
    });
    m.addTo(map);
    ref.current = m;
    return () => {
      m.remove();
      ref.current = null;
    };
    // Position and look are synced below; only the map recreates it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  const lastIcon = useRef(icon);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    if (lastIcon.current !== icon) {
      setMarkerIcon(m, icon);
      lastIcon.current = icon;
    }
  }, [icon]);

  useEffect(() => {
    const el = ref.current?.getElement();
    if (!el) return;
    el.classList.toggle('has-roof', roof > 0);
    if (roof > 0) el.style.setProperty('--roof', roof.toFixed(1));
    else el.style.removeProperty('--roof');
    el.classList.toggle('is-picked', ring);
    el.classList.toggle('on-beacon', !!beacon);
    el.classList.toggle('on-beacon--evac', beacon === 'evac');
  }, [roof, ring, beacon]);

  useEffect(() => {
    ref.current?.setLngLat([lng, lat]);
  }, [lat, lng]);

  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const el = m.getElement();
    el.style.zIndex = zIndex !== undefined ? String(zIndex) : '';
    // The Marker rewrites style.opacity on every move; go through its API.
    m.setOpacity(opacity ?? 1);
    el.style.cursor = onClick ? 'pointer' : '';
    if (title) el.title = title;
    else el.removeAttribute('title');
  }, [zIndex, opacity, onClick, title]);

  return null;
}
