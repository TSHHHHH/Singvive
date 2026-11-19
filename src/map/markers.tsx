import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { LngLat, type Map as MlMap } from 'maplibre-gl';
import type { MapIcon } from '../components/mapIcons';
import type { BeaconKind } from './beacons';
import { useMapGL } from './hooks';
import { REVEAL_EASING } from './revealMotion';

interface MapMarkerProps {
  lat: number;
  lng: number;
  icon: MapIcon;
  onClick?: () => void;
  /** Stack order among markers (Leaflet's zIndexOffset). */
  zIndex?: number;
  opacity?: number;
  /** Location badges retain their DOM through an exit fade. */
  visible?: boolean;
  fadeMs?: number;
  /**
   * Roof height in metres (3D). The badge rides up to it by the map's
   * `--roof-lift` px-per-metre, which the building engine keeps current.
   */
  roof?: number;
  /** Selection ring around the badge in both flat and 3D views. */
  ring?: boolean;
  /** Brief identity-reveal highlight, independent of selection and danger. */
  recognized?: boolean;
  /** Hover preview: travelling to the cursor would identify this site. */
  hinted?: boolean;
  /** Optional native hover title (TipLayer adopts it). */
  title?: string;
  /**
   * The landmark beacon this site carries (3D). The badge rides the top of
   * the beam by the container's `--beacon-h`, which Beacons3d keeps current.
   */
  beacon?: BeaconKind | null;
}

// The run map uses local Mercator coordinates and flat terrain. Its badges
// only need one projection each, with no world wrapping or depth readback.
const badgeLayers = new WeakMap<MlMap, { positions: Set<() => void>; move: () => void }>();

function trackBadge(map: MlMap, position: () => void) {
  let layer = badgeLayers.get(map);
  if (!layer) {
    const positions = new Set<() => void>();
    const move = () => {
      for (const update of positions) update();
    };
    layer = { positions, move };
    badgeLayers.set(map, layer);
    map.on('move', layer.move);
  }
  position();
  layer.positions.add(position);
  return () => {
    layer.positions.delete(position);
    if (!layer.positions.size) {
      map.off('move', layer.move);
      badgeLayers.delete(map);
    }
  };
}

export function MapMarker({
  lat,
  lng,
  icon,
  onClick,
  zIndex,
  opacity,
  visible = true,
  fadeMs = 0,
  roof = 0,
  ring = false,
  recognized = false,
  hinted = false,
  title,
  beacon = null,
}: MapMarkerProps) {
  const map = useMapGL();
  const ref = useRef<HTMLDivElement>(null);
  const click = useRef(onClick);
  click.current = visible ? onClick : undefined;
  const [anchorX, anchorY] = icon.anchor;
  useLayoutEffect(() => {
    const el = ref.current!;
    const point = new LngLat(lng, lat);
    return trackBadge(map, () => {
      const { x, y } = map.project(point);
      el.style.transform = `translate(${x - anchorX}px, ${y - anchorY}px)`;
    });
  }, [map, lng, lat, anchorX, anchorY]);

  useEffect(() => {
    const el = ref.current!;
    // Stop the native event before it reaches the map's ground picker.
    const select = (ev: MouseEvent) => {
      if (!click.current) return;
      ev.stopPropagation();
      click.current();
    };
    el.addEventListener('click', select);
    return () => el.removeEventListener('click', select);
  }, [map]);

  const html = useMemo(() => ({ __html: icon.html }), [icon.html]);
  const classes = [
    'maplibregl-marker maplibregl-marker-anchor-top-left marker-reveal', icon.className,
    roof > 0 && 'has-roof', ring && 'is-picked', recognized && 'is-recognized', hinted && 'is-hinted',
    beacon && 'on-beacon', beacon === 'evac' && 'on-beacon--evac',
  ].filter(Boolean).join(' ');
  return createPortal(
    <div
      ref={ref}
      className={classes}
      role="button"
      aria-label={title ?? 'Map marker'}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{
        width: icon.size[0], height: icon.size[1], zIndex,
        cursor: onClick ? 'pointer' : undefined, pointerEvents: visible ? undefined : 'none',
        '--roof': roof > 0 ? roof.toFixed(1) : undefined,
        '--marker-opacity': visible ? opacity ?? 1 : 0,
        '--marker-reveal-ms': `${fadeMs}ms`, '--marker-reveal-easing': REVEAL_EASING,
      } as CSSProperties}
      dangerouslySetInnerHTML={html}
    />,
    map.getCanvasContainer(),
  );
}
