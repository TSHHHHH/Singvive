import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExpressionSpecification, LngLat, Map as MlMap, Marker } from 'maplibre-gl';
import type { Feature } from 'geojson';
import type { DestructionTier, Poi, TimeOfDay, WeatherKind, MapAnnotation } from '../game/types';
import { WeatherFx } from './WeatherFx';
import { Atmosphere3d } from './Atmosphere3d';
import { useDesktopShadows, useShadowCapableLayout } from '../hooks/useDesktopShadows';
import type { WeatherDom } from './useAtmosphere';
import { TimeOfDayFx } from './TimeOfDayFx';
import { poiIcon, identifiedIcon, playerIcon, playerLocationIcon, unknownIcon, evacIcon, dangerColor, rumourIcon, trekTargetIcon, knownFactionColor } from './mapIcons';
import { POI_CONFIG } from '../game/poi';
import { haversine } from '../game/overpass';
import { visibilityOf } from '../game/fog';
import { GuideMapAdapter } from '../guide/GuideMapAdapter';
import { FogOverlay } from './FogOverlay';
import type { ExploredCircle } from '../game/fog';
import type { TravelAnim } from '../game/store';
import { useGame } from '../game/store';
import { useSetting, useSettings } from '../game/settings';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { NoisePulse } from '../game/noise';
import { HAZARD_CONFIG, type HazardZone } from '../game/wilds';
import { hazardBlobDrawList } from '../game/hazardBlob';
import { hazardSiteById } from '../game/hazardSites';
import { bakedOutlineByOsmId } from '../game/bakedPois';
import { NoiseWaves } from './NoiseWaves';
import { MrtOverlay, MrtLineLegend, MRT_STATION_LAYER } from './MrtOverlay';
import { useMrtNetwork } from './useMrtNetwork';
import { VegetationOverlay } from './UnplayableOverlay';
import { BasemapTime } from './BasemapTime';
import { DistrictNames } from './DistrictNames';
import { DistrictLines } from './DistrictLines';
import { BorderLayers } from './BorderLayers';
import { MapGrain } from './MapGrain';
import { Icon } from '../icons/Icon';
import { pointAlongPath } from '../game/route';
import {
  CAMERA_CUT_SCREENS,
  CAMERA_EDGE,
  CAMERA_LEAD,
  CAMERA_SETTLE_PX,
  chaseStep,
  travelEase,
} from '../ui/travelMotion';
import { tip } from './tips';
import { MapView } from '../map/MapView';
import { RUN_BOX } from '../map/mapStyle';
import { KeyboardCamera } from './KeyboardCamera';
import { EdgeVignette } from './EdgeVignette';
import { Beacons3d } from './Beacons3d';
import { beaconKindOf } from '../map/beacons';
import { useLayerEvent, useMapEvent, useMapGL } from '../map/hooks';
import { FLAT_PITCH, hudPadding, mixPadding, paddedMiddle, samePadding, setHudPadding, toPadding, type Padding } from '../map/padEase';
import { MapMarker } from '../map/markers';
import { createMarker } from '../map/markerDom';
import { installOverlay, setData } from '../map/layers';
import { PoiSources } from '../map/poiSources';
import { useMarkerPresence } from '../map/useMarkerPresence';
import { useRecognitionHint } from '../map/useRecognitionHint';
import { REVEAL_MS } from '../map/revealMotion';
import { RangeMotion, sampleMotion } from '../map/rangeMotion';
import { EMPTY_FC, boxContains, circleFeature, dimHex, fc, lineFeature, padBox, toLngLatRing, type LatLngBox } from '../map/geo';
import { BuildingEngine, LOD_ZOOM, type Site3d } from '../map/buildings';
import { hdbScar, STOREY_M, type HdbDungeon } from '../game/hdbDungeon';
import { blockFraming } from '../map/blockFraming';
import { useT } from '../i18n';
import { VEIL_BANDS, bandOpacity, veilBands } from '../map/fogGeometry';
import { CameraFocusRequest, type CameraFocusTarget } from './cameraFocus';

// White outline for buildings you can see but haven't identified — stands out
// against the dark map like the "?" blips do.
const UNKNOWN_STROKE = '#e8e5dd';

// The player's chosen zoom persists across the whole game (and future sessions)
// so moving around never snaps it back. MapLibre zoom is Leaflet zoom − 1
// (512 px tiles), so it lives under its own key; the old one is read once.
const ZOOM_KEY = 'singvive.mapZoom.gl';
const LEGACY_ZOOM_KEY = 'singvive.mapZoom';
const DEFAULT_ZOOM = 14;
/** First-run zoom in 3D: just past LOD_ZOOM, so the city stands. */
const DEFAULT_ZOOM_3D = LOD_ZOOM + 0.5;
const MIN_ZOOM = 9;
const MAX_ZOOM = 19;

/** Viewport pad + debounce: hidden/off-screen POIs must not become markers. */
const VIEWPORT_PAD = 0.2;
const VIEWPORT_DEBOUNCE_MS = 100;
/** Steering budget. Dense HDB downtown may exceed it — keep nearest to centre. */
const MAX_POIS_ON_SCREEN = 450;
/** Full badges and footprints become useful at neighbourhood scale. */
const POI_DETAIL_ZOOM = 14;
/**
 * Below this the island is a haze of sites: the dots fade out over half a
 * zoom step and only the badges that steer you (here, target, beacons) stay.
 */
const POI_HIDE_ZOOM = 13;
const POI_HIDE_FADE = 0.5;
/** The full player capsule is useful close up; overview maps need less occlusion. */
const PLAYER_CAPSULE_ZOOM = 17;

/** Style layers whose clicks belong to a feature, not to the ground under it. */
const POI_FILL_LAYER = 'poi-fill';
const POI_DOT_LAYER = 'poi-dot';

function mapBox(map: MlMap): LatLngBox {
  const b = map.getBounds();
  return padBox({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, VIEWPORT_PAD);
}

function usePaddedBounds(): LatLngBox {
  const map = useMapGL();
  const [box, setBox] = useState(() => mapBox(map));
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      if (t != null) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        setBox(mapBox(map));
      }, VIEWPORT_DEBOUNCE_MS);
    };
    map.on('moveend', update);
    return () => {
      map.off('moveend', update);
      if (t != null) clearTimeout(t);
    };
  }, [map]);
  return box;
}

const validZoom = (z: number) => Number.isFinite(z) && z >= MIN_ZOOM && z <= MAX_ZOOM;

function loadZoom(fallback: number): number {
  try {
    const raw = localStorage.getItem(ZOOM_KEY);
    if (raw !== null && validZoom(Number(raw))) return Number(raw);
    const legacy = localStorage.getItem(LEGACY_ZOOM_KEY);
    if (legacy !== null && validZoom(Number(legacy) - 1)) return Number(legacy) - 1;
  } catch {
    /* storage unavailable — non-fatal */
  }
  return fallback;
}

function saveZoom(zoom: number): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** Remembers the player's zoom whenever they change it. */
function ZoomMemory() {
  const map = useMapGL();
  useMapEvent('zoomend', () => saveZoom(map.getZoom()));
  return null;
}

/** Existing layers only — querying a missing one is an error in MapLibre. */
function hitAny(map: MlMap, point: { x: number; y: number }, layers: string[]): boolean {
  const live = layers.filter((id) => map.getLayer(id));
  return live.length > 0 && map.queryRenderedFeatures([point.x, point.y], { layers: live }).length > 0;
}

/**
 * Tapping bare map picks a spot to cross to on foot. Taps on a clickable pin
 * never reach here (MapMarker stops them); taps on a building outline or an
 * MRT station belong to that feature, so they're filtered out.
 *
 * In 3D a tap can land on a standing building: a site's building selects the
 * site, any other building walks to that building (the tap's ground point is
 * behind it, where the ray meets the street).
 */
function GroundPicker({
  onPick,
  engine,
  onSite,
}: {
  onPick: (lat: number, lng: number) => void;
  engine: BuildingEngine | null;
  onSite: (id: string) => void;
}) {
  const map = useMapGL();
  useMapEvent('click', (e) => {
    if (hitAny(map, e.point, [POI_DOT_LAYER, POI_FILL_LAYER, MRT_STATION_LAYER])) return;
    const hit = engine?.hit(e.point);
    if (hit?.kind === 'site') onSite(hit.id);
    else if (hit?.kind === 'building') onPick(hit.lat, hit.lng);
    else onPick(e.lngLat.lat, e.lngLat.lng);
  });
  return null;
}

/** The tilted camera: pitch it and allow twist / tilt gestures, or lay it flat. */
const PITCH_3D = 50;
const MAX_PITCH_3D = 60;

function Camera3d({ on }: { on: boolean }) {
  const map = useMapGL();
  const reduced = useReducedMotion();
  const first = useRef(true);
  const onRef = useRef(on);
  onRef.current = on;

  useEffect(() => {
    const toggled = !first.current;
    first.current = false;
    const duration = toggled && !reduced ? 700 : 0;
    if (on) {
      map.setMaxPitch(MAX_PITCH_3D);
      map.dragRotate.enable();
      map.touchPitch.enable();
      map.touchZoomRotate.enableRotation();
      if (toggled) {
        // Below LOD_ZOOM the buildings lie flat, so step in far enough to see them.
        const zoom = Math.max(map.getZoom(), DEFAULT_ZOOM_3D);
        map.easeTo({ pitch: PITCH_3D, zoom, padding: hudPadding(map), duration, essential: true });
      }
      return;
    }
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();
    const flatten = () => {
      if (!onRef.current) map.setMaxPitch(0);
    };
    if (map.getPitch() === 0 && map.getBearing() === 0) {
      flatten();
      return;
    }
    map.easeTo({ pitch: 0, bearing: 0, padding: hudPadding(map), duration, essential: true });
    if (duration === 0) flatten();
    else map.once('moveend', flatten);
  }, [map, on, reduced]);
  return null;
}

/** Camera bearing that squares the view to a footprint's long side, nearest the current one. */
function squareBearing(
  ring: ReadonlyArray<readonly [number, number]> | undefined,
  current: number,
  clear?: (lat: number, lng: number, bearing: number) => number,
): number | null {
  if (!ring || ring.length < 3) return null;
  let best = 0;
  let along = 0;
  for (let i = 0; i < ring.length; i++) {
    const [aLat, aLng] = ring[i];
    const [bLat, bLng] = ring[(i + 1) % ring.length];
    const dx = (bLng - aLng) * Math.cos((aLat * Math.PI) / 180);
    const dy = bLat - aLat;
    const len = Math.hypot(dx, dy);
    if (len > best) {
      best = len;
      along = (Math.atan2(dx, dy) * 180) / Math.PI;
    }
  }
  if (best === 0) return null;
  // Face a wall square on: long walls first, then whichever side the neighbours hide
  // least (a tower in front would swallow the storey band), then the smaller turn.
  const wrap = (b: number) => ((((b + 180) % 360) + 360) % 360) - 180;
  const turn = (x: number) => Math.abs(wrap(x - current));
  const cLat = ring.reduce((t, p) => t + p[0], 0) / ring.length;
  const cLng = ring.reduce((t, p) => t + p[1], 0) / ring.length;
  const options = [along + 90, along - 90, along, along + 180].map((x, i) => {
    const b = wrap(x);
    const hidden = clear ? clear(cLat, cLng, b) : 0;
    return { b, cost: hidden * (i < 2 ? 1 : 1.4) + turn(b) / 180 };
  });
  options.sort((p, q) => p.cost - q.cost);
  return options[0].b;
}

/** Dragging beside the tower: degrees of bearing / pitch per px, and the lowest tilt. */
const ORBIT_DEG_PER_PX = 0.4;
const ORBIT_PITCH_PER_PX = 0.2;
const ORBIT_MIN_PITCH = 25;
/** Zoom per wheel notch beside the tower. */
const ORBIT_ZOOM_STEP = 0.25;
/** Close inspection is useful inside a block; restore the world-map limit on exit. */
const BLOCK_MAX_ZOOM = 20.5;
/** A faction site is seen from a lower angle than a tower: the yard, not the roofline. */
const SITE_PITCH_3D = 52;
/** Most sites are low; frame a token height so a yard with no building still fits. */
const SITE_ROOF_M = 10;
/** Close enough to read the site against its street, not a single roof. */
const SITE_MAX_ZOOM = 18;

/** What the place view's camera holds: a block's tower or a faction site. */
export type PlaceFocus = { kind: 'block' | 'site'; id: string };

/**
 * The place view's camera: inside an HDB block (3D) or at a faction site (2D
 * or 3D). Ease onto the place on entry and back to where you were on exit
 * (or when the player flips to the map), and, in a block, light the storey
 * band for the landing you are on (or pointing at). Selects scalars only; the
 * band is redrawn when its row moves.
 */
function BlockView({
  engine,
  pois,
  pad,
  focus,
}: {
  engine: BuildingEngine | null;
  pois: Poi[];
  /** "top:left:right:bottom" of the building viewport, clear of the floor panel. */
  pad: string;
  /** The place the camera holds, or null while the run map shows. */
  focus: PlaceFocus | null;
}) {
  const map = useMapGL();
  const { t } = useT();
  const reduced = useReducedMotion();
  const view3d = useSetting('mapView3d') === 'on';
  const kind = focus?.kind ?? null;
  const siteId = focus?.id ?? null;
  const roof = useGame((s) => (siteId ? s.siteRoofs[siteId] : undefined));
  // "lo:hi:real" storeys of the band row, as one string so equal rows don't re-run.
  const band = useGame((s) => {
    const h = s.hdb;
    if (!h || kind !== 'block') return null;
    const level = s.hdbHoverLevel ?? h.pos.level;
    const f = h.floors[level - 1];
    if (!f) return null;
    const lo = f.span?.[0] ?? f.storey ?? level;
    const hi = f.span?.[1] ?? f.storey ?? level;
    return `${lo}:${hi}:${h.realStoreys ?? h.floors[h.height - 1]?.storey ?? h.height}`;
  });
  const poisRef = useRef(pois);
  poisRef.current = pois;
  const realStoreys = useGame((s) => (kind === 'block' ? s.hdb?.realStoreys ?? 0 : 0));
  // A block needs the 3D towers; a site reads on the flat map too.
  const on = kind === 'site' || !!engine;
  const pitch = kind === 'block' ? MAX_PITCH_3D : view3d ? SITE_PITCH_3D : 0;

  // Entry: remember the camera to ease back to, and pick the bearing once.
  const backRef = useRef<{
    center: LngLat; zoom: number; pitch: number; bearing: number; elevation: number;
    maxZoom: number; clamped: boolean;
  } | null>(null);
  const bearingRef = useRef(0);
  const restoreRef = useRef(0);
  const externalFocus = useRef(false);
  useEffect(() => {
    externalFocus.current = false;
    const relinquish = (event: { cameraFocus?: boolean }) => {
      if (event.cameraFocus) externalFocus.current = true;
    };
    map.on('movestart', relinquish);
    return () => { map.off('movestart', relinquish); };
  }, [map, siteId]);
  useEffect(() => {
    if (!on || !siteId) return;
    cancelAnimationFrame(restoreRef.current);
    const site = poisRef.current.find((p) => p.id === siteId);
    if (!site) return;
    // Keep the world snapshot if an effect replay cancels a pending restoration.
    const back = backRef.current ?? {
      center: map.getCenter(),
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      elevation: map.getCenterElevation(),
      clamped: map.getCenterClampedToGround(),
      maxZoom: map.getMaxZoom(),
    };
    map.setCenterClampedToGround(false);
    map.setMaxZoom(BLOCK_MAX_ZOOM);
    if (!backRef.current) {
      // The flat map stays north-up.
      bearingRef.current = !view3d ? back.bearing :
        squareBearing(site.outline, back.bearing, (lat, lng, b) =>
          engine ? engine.occlusion(lat, lng, b) : 0,
        ) ?? back.bearing;
    }
    backRef.current = back;
    // A site view opens on arrival, so the snapshot can catch the camera
    // mid-chase: come back centred on where you stand.
    const backCenter: [number, number] =
      kind === 'site' ? [site.lng, site.lat] : [back.center.lng, back.center.lat];
    return () => {
      // A frame late, so the map's HUD padding is back (CameraChrome) and
      // eases in with the way back instead of turning the camera afterwards.
      restoreRef.current = requestAnimationFrame(() => {
        backRef.current = null;
        try {
          map.setCenterClampedToGround(back.clamped);
          map.setMaxZoom(back.maxZoom);
          map.setCenterElevation(back.elevation);
          map.easeTo({ ...back, center: backCenter, padding: hudPadding(map), duration: reduced ? 0 : 900 });
        } catch {
          // The map went away with the run; nothing to ease back.
        }
      });
    };
  }, [map, on, engine, siteId, reduced, view3d, kind]);

  // Orbit the middle of the building, not its ground-level POI marker. Only
  // this controller owns padding inside a block; the general HUD inset is off.
  const roofM =
    kind === 'site'
      ? view3d ? Math.min(roof ?? SITE_ROOF_M, 40) : 0
      : roof ?? (realStoreys > 0 ? realStoreys * STOREY_M : STOREY_M * 12);
  const frameBuilding = useCallback(() => {
    if (!on || !siteId || !backRef.current || externalFocus.current) return;
    const site = poisRef.current.find((p) => p.id === siteId);
    if (!site) return;
    const [top, left, right, bottom] = pad.split(':').map(Number);
    const box = map.getContainer();
    const framing = blockFraming(site, roofM, box.clientWidth - left - right,
      box.clientHeight - top - bottom, bearingRef.current, pitch);
    // MapLibre's easeTo does not interpolate elevation; set the orbit target first.
    map.setCenterElevation(view3d ? framing.elevation : 0);
    map.easeTo({
      ...framing,
      zoom: kind === 'site' ? Math.min(framing.zoom, SITE_MAX_ZOOM) : framing.zoom,
      pitch,
      bearing: bearingRef.current,
      padding: { top, left, right, bottom },
      duration: reduced ? 0 : 650,
    });
  }, [map, on, siteId, pad, roofM, reduced, pitch, kind, view3d]);
  useEffect(() => {
    frameBuilding();
    map.on('resize', frameBuilding);
    const rememberBearing = () => { bearingRef.current = map.getBearing(); };
    map.on('rotateend', rememberBearing);
    return () => {
      map.off('resize', frameBuilding);
      map.off('rotateend', rememberBearing);
    };
  }, [map, frameBuilding]);

  const zoomBy = useCallback((step: number) => {
    map.easeTo({ zoom: Math.min(BLOCK_MAX_ZOOM, Math.max(LOD_ZOOM, map.getZoom() + step)), duration: reduced ? 0 : 160 });
  }, [map, reduced]);

  // Orbit: the strips layer takes every pointer event, so drags on its empty
  // part beside the tower (`data-block-orbit`) turn and tilt the camera about
  // the block, and the wheel there zooms. Bearing is kept for re-framing.
  useEffect(() => {
    if (!on || !siteId) return;
    let drag: { id: number; x: number; y: number; bearing: number; pitch: number } | null = null;
    const isSurface = (t: EventTarget | null) => t instanceof Element && t.hasAttribute('data-block-orbit');
    const down = (e: PointerEvent) => {
      if (!view3d) return;
      if (drag || (e.pointerType === 'mouse' && e.button !== 0) || !isSurface(e.target)) return;
      map.stop();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, bearing: map.getBearing(), pitch: map.getPitch() };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tilt = drag.pitch - (e.clientY - drag.y) * ORBIT_PITCH_PER_PX;
      map.jumpTo({
        bearing: drag.bearing + (e.clientX - drag.x) * ORBIT_DEG_PER_PX,
        // The flat map only turns.
        pitch: view3d ? Math.min(MAX_PITCH_3D, Math.max(ORBIT_MIN_PITCH, tilt)) : drag.pitch,
      });
      bearingRef.current = map.getBearing();
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      bearingRef.current = map.getBearing();
    };
    const wheel = (e: WheelEvent) => {
      if (!isSurface(e.target)) return;
      e.preventDefault();
      zoomBy(-Math.sign(e.deltaY) * ORBIT_ZOOM_STEP);
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('wheel', wheel, { passive: false });
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      document.removeEventListener('wheel', wheel);
    };
  }, [map, on, siteId, zoomBy, view3d]);

  useEffect(() => {
    if (!engine) return;
    if (!siteId || !band) {
      engine.clearFloorBand();
      return;
    }
    const [lo, hi, real] = band.split(':').map(Number);
    const perStorey = roof && real > 0 ? roof / real : STOREY_M;
    engine.setFloorBand(siteId, (lo - 1) * perStorey, hi * perStorey);
  }, [engine, siteId, band, roof]);

  // Ghost every other building so the block reads through the estate.
  useEffect(() => {
    if (!engine || !siteId) return;
    engine.setFocus(siteId);
    return () => engine.setFocus(null);
  }, [engine, siteId]);

  useEffect(() => () => engine?.clearFloorBand(), [engine]);
  const site = poisRef.current.find((p) => p.id === siteId);
  if (!on || !siteId || !site) return null;
  const [top, left, right] = pad.split(':').map(Number);
  return (
    <>
      <KeyboardCamera home={site} onRecenter={frameBuilding} />
      <div className="absolute z-[560] flex flex-wrap items-center gap-2" style={{ top: Math.max(16, top - 48), left: left + 12, right: right + 12 }}>
        <div className="flex items-center rounded-sm border border-concrete-600 bg-concrete-950/95 p-1 shadow-signage">
          <button type="button" onClick={() => zoomBy(-0.5)} aria-label={t('ui.hdb.cameraZoomOut')} className="h-9 w-9 text-title text-concrete-50 hover:bg-white/10">−</button>
          <button type="button" onClick={frameBuilding} className="min-h-9 px-2 text-body text-signal hover:bg-white/10">{t(kind === 'site' ? 'ui.place.frameSite' : 'ui.hdb.cameraFrame')}</button>
          <button type="button" onClick={() => zoomBy(0.5)} aria-label={t('ui.hdb.cameraZoomIn')} className="h-9 w-9 text-title text-concrete-50 hover:bg-white/10">+</button>
        </div>
        {view3d && (
          <span className="pointer-events-none text-body text-concrete-200 [text-shadow:0_1px_4px_#000]">{t('ui.hdb.cameraHint')}</span>
        )}
      </div>
    </>
  );
}

/** Mounts the 3D building engine and feeds it the live travel range. */
function Buildings3d({
  home,
  radius,
  onEngine,
}: {
  home: { lat: number; lng: number };
  /** current travel range: buildings inside it stand */
  radius: RangeMotion;
  onEngine: (engine: BuildingEngine | null) => void;
}) {
  const map = useMapGL();
  const reduced = useReducedMotion();
  const [engine, setEngine] = useState<BuildingEngine | null>(null);
  const shadows = useDesktopShadows();

  useEffect(() => {
    if (!engine || !shadows) return;
    let active = true;
    let remove: (() => void) | undefined;
    void import('../map/buildingShadows').then(({ installBuildingShadows }) => {
      if (active) remove = installBuildingShadows(map, engine);
    }).catch((error: unknown) => console.warn('Building shadows unavailable', error));
    return () => {
      active = false;
      remove?.();
    };
  }, [engine, map, shadows]);

  useEffect(() => {
    const e = new BuildingEngine(map);
    if (import.meta.env.DEV) (window as unknown as { __buildings?: BuildingEngine }).__buildings = e;
    setEngine(e);
    onEngine(e);
    return () => {
      onEngine(null);
      e.destroy();
    };
  }, [map, onEngine]);

  useEffect(() => {
    engine?.setInstant(reduced);
  }, [engine, reduced]);

  // Each building eases its own rise, so a coarse sample of the radius
  // looks the same as every frame and costs a fraction of the index walks.
  useEffect(() => {
    if (!engine) return;
    const reveal = (r: number) => engine.setReveal({ lat: home.lat, lng: home.lng, radius: r });
    reveal(radius.value);
    return sampleMotion(radius, BUILDING_SAMPLE_MS, reveal);
  }, [engine, home.lat, home.lng, radius]);

  // Pointer over a site's building, like over a 2D outline.
  const over = useRef(false);
  useMapEvent('mousemove', (e) => {
    const now = engine?.hit(e.point)?.kind === 'site';
    if (now === over.current) return;
    over.current = now;
    map.getCanvas().style.cursor = now ? 'pointer' : '';
  });
  return null;
}

/** How often the 3D buildings and the markers re-read a moving range (ms). */
const BUILDING_SAMPLE_MS = 80;
const MARKER_SAMPLE_MS = 120;

/** How often the sight disc catches up with the walking pin (ms). */
const SIGHT_STEP_MS = 100;

/**
 * Where the player can see from: `home`, or during a glide the pin's spot on
 * the same clock as `PlayerMarker`, sampled every SIGHT_STEP_MS. The fog edge
 * and the buildings then move with the walker, so arrival has nothing left to
 * reveal. The same centre drives marker presentation; gameplay position and
 * location recognition still commit through the store on arrival.
 */
function useSightCenter(home: { lat: number; lng: number }, travelAnim: TravelAnim | null) {
  const [sight, setSight] = useState(home);
  useEffect(() => {
    if (!travelAnim) {
      setSight(home);
      return;
    }
    const path =
      travelAnim.path.length >= 2
        ? travelAnim.path
        : [
            { lat: travelAnim.fromLat, lng: travelAnim.fromLng },
            { lat: travelAnim.toLat, lng: travelAnim.toLng },
          ];
    const { startedAt, durationMs } = travelAnim;
    const sample = () => {
      const t = Math.min(1, (Date.now() - startedAt) / durationMs);
      const at = pointAlongPath(path, travelEase(t));
      setSight((cur) => (cur.lat === at.lat && cur.lng === at.lng ? cur : at));
    };
    sample();
    const id = setInterval(sample, SIGHT_STEP_MS);
    return () => clearInterval(id);
  }, [home, travelAnim]);
  return sight;
}

/**
 * The fog, 3D buildings and planning ring share the current travel range,
 * centred on the walking pin. The range eases outside React (RangeMotion):
 * the ring and the fog edge redraw every frame, the buildings and markers
 * sample it, and none of it re-renders this tree while it moves.
 */
function SightLayers({
  home,
  travelAnim,
  exploredArea,
  reach,
  sensed,
  view3d,
  onEngine,
  poiLayer,
  planning,
}: {
  home: { lat: number; lng: number };
  travelAnim: TravelAnim | null;
  exploredArea: ExploredCircle[];
  /** the travel range, easing */
  reach: RangeMotion;
  /** the sensing range for blips, easing */
  sensed: RangeMotion;
  view3d: boolean;
  onEngine: (engine: BuildingEngine | null) => void;
  poiLayer: Omit<PoiLayerProps, 'home' | 'blipRange'>;
  /** A trip is being planned (route preview up, not walking): the ring steps forward. */
  planning: boolean;
}) {
  const sight = useSightCenter(home, travelAnim);
  return (
    <>
      <FogOverlay exploredArea={exploredArea} currentRevealCenter={sight} revealRadius={reach} />
      {view3d && <Buildings3d home={sight} radius={reach} onEngine={onEngine} />}
      {/* Never hit-tested: the fills cover everywhere you can walk, so a
          clickable ring would swallow every ground pick inside your range. */}
      <RangeRing home={sight} range={reach} planning={planning} />
      <SensedPoiLayer {...poiLayer} home={sight} sensed={sensed} />
    </>
  );
}

/** PoiLayer fed a sample of the easing sensing range; only it re-renders. */
function SensedPoiLayer({ sensed, ...rest }: Omit<PoiLayerProps, 'blipRange'> & { sensed: RangeMotion }) {
  const [blipRange, setBlipRange] = useState(sensed.value);
  useEffect(() => {
    setBlipRange(sensed.value);
    return sampleMotion(sensed, MARKER_SAMPLE_MS, setBlipRange);
  }, [sensed]);
  return <PoiLayer {...rest} blipRange={blipRange} />;
}

const containerSize = (map: MlMap) => {
  const el = map.getContainer();
  return { x: el.clientWidth, y: el.clientHeight };
};

/**
 * The player's marker. When a `travelAnim` is active it glides along the
 * land route (or straight chord) with a held ease and a per-frame camera
 * chase; otherwise it sits at `home`, and the camera only moves when home
 * lands outside the safe band.
 */
function PlayerMarker({
  home,
  atSite,
  travelAnim,
  veilRadiusM,
  veilAlpha,
  yieldCamera = false,
}: {
  home: { lat: number; lng: number };
  atSite: boolean;
  travelAnim: TravelAnim | null;
  veilRadiusM: number;
  veilAlpha: number;
  /** A place view holds the camera: move the pin, never chase it. */
  yieldCamera?: boolean;
}) {
  const map = useMapGL();
  const yieldRef = useRef(yieldCamera);
  yieldRef.current = yieldCamera;
  const rafRef = useRef<number | undefined>(undefined);
  const markerRef = useRef<Marker | null>(null);
  const posRef = useRef(home);
  const veilRef = useRef({ radiusM: veilRadiusM, on: veilAlpha > 0 });
  veilRef.current = { radiusM: veilRadiusM, on: veilAlpha > 0 };

  // The veil rides the pin: rebuilt wherever the pin is set.
  const place = (lat: number, lng: number) => {
    posRef.current = { lat, lng };
    markerRef.current?.setLngLat([lng, lat]);
    const v = veilRef.current;
    if (v.on) setData(map, VEIL_SRC, veilBands(lat, lng, v.radiusM));
  };

  useEffect(() => {
    const m = createMarker(playerIcon(), home.lat, home.lng);
    m.getElement().style.zIndex = '1000';
    m.addTo(map);
    markerRef.current = m;
    return () => {
      m.remove();
      markerRef.current = null;
    };
    // Created once per map; position is driven below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Keep glide/camera/veil ownership here; the site renders the joined capsule.
  useEffect(() => {
    const el = markerRef.current?.getElement();
    if (el) el.style.visibility = atSite ? 'hidden' : '';
  }, [map, atSite]);

  // One camera chase for the marker's whole life. The glide and the arrival
  // only move its target, so the camera never restarts mid-motion: it keeps
  // its speed through the arrival and eases out on its own. A drag or zoom by
  // the player hands the camera back to them until the next glide.
  const chase = useRef({
    target: null as { lat: number; lng: number } | null,
    held: false,
    gliding: false,
    raf: 0,
    last: 0,
    kick: () => {},
  });
  useEffect(() => {
    const c = chase.current;
    const frame = (now: number) => {
      c.raf = 0;
      const target = c.target;
      if (!target || c.held || yieldRef.current) return;
      const dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 1 / 60;
      c.last = now;
      const center = map.getCenter();
      const tp = map.project([target.lng, target.lat]);
      const cp = map.project(center);
      // HUD padding a panel left for the next move rides in with the chase,
      // where the lens shift is lost in the camera's own motion (padEase.ts).
      const pad = toPadding(map.getPadding());
      const want = hudPadding(map);
      const padSettled = samePadding(pad, want, 0.5);
      if (Math.hypot(tp.x - cp.x, tp.y - cp.y) <= CAMERA_SETTLE_PX && padSettled) {
        // Settled. Mid-glide the target keeps moving and kicks the loop
        // again; after arrival the chase is done.
        c.last = 0;
        if (!c.gliding) c.target = null;
        return;
      }
      const k = chaseStep(dt);
      map.jumpTo({
        center: [center.lng + (target.lng - center.lng) * k, center.lat + (target.lat - center.lat) * k],
        padding: padSettled ? want : mixPadding(pad, want, k),
      });
      c.raf = requestAnimationFrame(frame);
    };
    c.kick = () => {
      if (!c.raf && !c.held) c.raf = requestAnimationFrame(frame);
    };
    // Only gestures carry `originalEvent`; our own jumpTo does not.
    const onStart = (e: { originalEvent?: unknown; cameraFocus?: boolean }) => {
      if (!e.originalEvent && !e.cameraFocus) return;
      c.held = true;
      c.target = null;
    };
    map.on('movestart', onStart);
    return () => {
      map.off('movestart', onStart);
      if (c.raf) cancelAnimationFrame(c.raf);
      c.raf = 0;
      c.kick = () => {};
    };
  }, [map]);

  useEffect(() => {
    const c = chase.current;
    if (!travelAnim) {
      place(home.lat, home.lng);
      if (yieldRef.current) {
        c.target = null;
        return;
      }
      if (c.held) {
        // The player moved the map during the glide; leave it where they put it.
        c.held = false;
        c.target = null;
        return;
      }
      const size = containerSize(map);
      const p = map.project([home.lng, home.lat]);
      const margin = Math.min(size.x, size.y) * CAMERA_EDGE;
      const outside = p.x < margin || p.y < margin || p.x > size.x - margin || p.y > size.y - margin;
      if (c.target || outside) {
        const far = Math.hypot(p.x - size.x / 2, p.y - size.y / 2) > Math.max(size.x, size.y) * CAMERA_CUT_SCREENS;
        if (far) {
          // A discrete move across the island (spawn, MRT): cut, don't swoop.
          c.target = null;
          map.jumpTo({ center: [home.lng, home.lat] });
          return;
        }
        c.target = { lat: home.lat, lng: home.lng };
        c.kick();
      }
      return;
    }
    c.held = false;
    const path =
      travelAnim.path.length >= 2
        ? travelAnim.path
        : [
            { lat: travelAnim.fromLat, lng: travelAnim.fromLng },
            { lat: travelAnim.toLat, lng: travelAnim.toLng },
          ];
    const { startedAt, durationMs } = travelAnim;
    // Drive the marker imperatively during the glide so React does not
    // re-render every frame.
    const start = pointAlongPath(path, 0);
    place(start.lat, start.lng);

    // Short hops that stay inside the safe band never engage the camera.
    const size0 = containerSize(map);
    const margin0 = Math.min(size0.x, size0.y) * CAMERA_EDGE;
    const inBand = (pt: { x: number; y: number }) =>
      pt.x >= margin0 && pt.y >= margin0 && pt.x <= size0.x - margin0 && pt.y <= size0.y - margin0;
    const end = path[path.length - 1];
    const shortOnScreen = inBand(map.project([path[0].lng, path[0].lat])) && inBand(map.project([end.lng, end.lat]));

    c.gliding = true;
    c.target = null;

    const tick = () => {
      const t = Math.min(1, (Date.now() - startedAt) / durationMs);
      const e = travelEase(t);
      const { lat, lng } = pointAlongPath(path, e);
      place(lat, lng);

      // Soft lead: once the pin nears the edge, the chase aims a little ahead
      // of it for the rest of the glide.
      if (!shortOnScreen && !c.held) {
        if (!c.target) {
          const p = map.project([lng, lat]);
          const size = containerSize(map);
          const margin = Math.min(size.x, size.y) * CAMERA_EDGE;
          if (p.x < margin || p.y < margin || p.x > size.x - margin || p.y > size.y - margin) {
            c.target = { lat, lng };
          }
        }
        if (c.target) {
          c.target = pointAlongPath(path, Math.min(1, e + CAMERA_LEAD * (1 - e)));
          c.kick();
        }
      }

      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      c.gliding = false;
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
    // `place` reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelAnim, home, map]);

  // The standalone pin can cover a nearby POI. It never takes pointer events, so the fade
  // is driven from the container's own mousemove: inside the pin's footprint,
  // it goes see-through.
  useEffect(() => {
    const container = map.getContainer();
    const onMove = (e: MouseEvent) => {
      const el = markerRef.current?.getElement();
      if (!el) return;
      const rect = container.getBoundingClientRect();
      const p = map.project([posRef.current.lng, posRef.current.lat]);
      const dx = e.clientX - rect.left - p.x;
      const dy = e.clientY - rect.top - p.y;
      // Follow the standalone icon's geometry when fading under the cursor.
      const { size, anchor } = playerIcon();
      el.classList.toggle('is-faded',
        dx > -anchor[0] - 1 && dx < size[0] - anchor[0] + 1 &&
        dy > -anchor[1] - 2 && dy < size[1] - anchor[1] + 2);
    };
    const onLeave = () => markerRef.current?.getElement()?.classList.remove('is-faded');
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
      onLeave();
    };
  }, [map]);

  // Mid-walk the cursor isn't moving but the pin is, so a stale fade would
  // stick. Clear it whenever a travel leg starts or ends.
  useEffect(() => {
    markerRef.current?.getElement()?.classList.remove('is-faded');
  }, [travelAnim]);

  return <NightVeil posRef={posRef} radiusM={veilRadiusM} alpha={veilAlpha} />;
}

const VEIL_SRC = 'veil-src';

/**
 * The edge of sight after dark: a soft spotlight riding the player pin.
 * Inside it the map reads normally; past it the street goes black. Stacked
 * holed rectangles (see veilBands) in slot `veil`, above fog, hazards and the
 * town wash, below the MRT overlay and every pin. PlayerMarker moves it.
 */
function NightVeil({
  posRef,
  radiusM,
  alpha,
}: {
  posRef: { current: { lat: number; lng: number } };
  radiusM: number;
  alpha: number;
}) {
  const map = useMapGL();
  useEffect(
    () =>
      installOverlay(map, 'veil', { [VEIL_SRC]: 'geojson' }, [
        {
          id: 'veil-fill',
          type: 'fill',
          source: VEIL_SRC,
          paint: { 'fill-color': 'rgb(2, 4, 10)', 'fill-opacity': 0, 'fill-antialias': false },
        },
      ]),
    [map],
  );
  useEffect(() => {
    if (!map.getLayer('veil-fill')) return;
    map.setPaintProperty('veil-fill', 'fill-opacity', alpha > 0 ? bandOpacity(alpha, VEIL_BANDS) : 0);
    const { lat, lng } = posRef.current;
    setData(map, VEIL_SRC, alpha > 0 ? veilBands(lat, lng, radiusM) : EMPTY_FC);
  }, [map, posRef, radiusM, alpha]);
  return null;
}

interface Props {
  inCombat: boolean;
  home: { lat: number; lng: number };
  pois: Poi[];
  selectedId: string | null;
  /** id of the location the player is standing at (live data), if any */
  hereId: string | null;
  /** how far the survivor can comfortably travel now; drives fog and building rise */
  travelRange: number;
  /** how far out anonymous "?" blips are sensed */
  blipRange: number;
  /** after dark: edge of sight in metres, and how black it is past it (0 = day) */
  veilRadiusM: number;
  veilAlpha: number;
  exploredArea: ExploredCircle[];
  /** active walking glide, if the player is mid-travel */
  travelAnim: TravelAnim | null;
  /** id of the extraction zone — shown as an always-visible beacon */
  evacZoneId: string | null;
  /** expanding rings of noise the player has made */
  noisePulses: NoisePulse[];
  /** diegetic frame feedback — no numbers, just the edges of vision */
  /** Bleeding is deliberately absent — it reads on the body doll, not here. */
  vitals: { exhausted: boolean; infected: boolean };
  /** hazard pockets the survivor can currently sense */
  hazards: HazardZone[];
  /** ids of pockets the previewed path actually crosses */
  pathHazardIds?: string[];
  /** today's sky — drives the cosmetic weather overlay only */
  weather: WeatherKind;
  time: TimeOfDay;
  /** open-ground spot the player is considering crossing to */
  trekTarget: { lat: number; lng: number } | null;
  /** land-aware preview / en-route polyline (null = nothing to draw) */
  travelPath: { lat: number; lng: number }[] | null;
  /** true when the chord has no dry land route — preview still drawn, confirm blocked */
  travelPathBlocked?: boolean;
  /** External camera nudge (e.g. stash logbook "Show on map"). Token forces re-pan. */
  focusTarget?: { lat: number; lng: number; token: number } | null;
  /** Smudged-map rumoured sites — fuzzy pins until the target POI is found. */
  mapAnnotations?: MapAnnotation[];
  /** Desktop HUD: px of the right edge covered by the open timeline. */
  padRight?: number;
  /** Desktop HUD: px of the left edge covered by the dock. */
  padLeft?: number;
  /** Desktop HUD: px of the bottom covered by the here / target cards. */
  padBottom?: number;
  /** Desktop HUD: px of the top covered by chrome over the map. */
  padTop?: number;
  /**
   * A place view holds the camera (HDB block in 3D, faction site): it eases
   * onto the place inside the pad box and back out when this goes null. Keep
   * the object's identity stable; the map is memoised.
   */
  placeFocus?: PlaceFocus | null;
  /** Desktop HUD: px the map's own top-right buttons shift left (timeline / ticker). */
  chromeRight?: number;
  /** The 3D / rail toggles on the map itself. Desktop moves them to the rail. */
  showModeToggles?: boolean;
  onSelect: (poi: Poi) => void;
  onPickGround: (lat: number, lng: number) => void;
}

/**
 * Swap the camera's HUD padding without moving what is on screen. Padding
 * moves the point the camera centres on, so a bare padding change (a dock
 * panel opening or closing, the here / target cards appearing) would slide
 * the whole map sideways. Re-aim so the ground under `pivot` (default: the new
 * padded middle) stays under it, and only later focus commands frame inside
 * the new inset.
 *
 * Exact only on the flat map. In 3D padding is a lens shift and the rest of
 * the view shears around the pivot, so CameraChrome never calls this on a
 * tilted camera (padEase.ts).
 */
function padInPlace(map: MlMap, padding: Padding, pivot?: { point: { x: number; y: number }; at: LngLat }) {
  if (samePadding(toPadding(map.getPadding()), padding)) return;
  const box = containerSize(map);
  const point = pivot?.point ?? paddedMiddle(padding, box.x, box.y);
  const at = pivot?.at ?? map.unproject([point.x, point.y]);
  const tr = map.transform.clone();
  tr.setPadding(padding);
  // setLocationAtPoint wants a Point instance; project() hands one out.
  const target = map.project(at);
  target.x = point.x;
  target.y = point.y;
  tr.setLocationAtPoint(at, target);
  map.jumpTo({ center: tr.center, padding });
}

/**
 * One camera command owns both focus and HUD padding. Closing a panel changes
 * both on the same render; separate eases would cancel the requested focus.
 */
function CameraChrome({ target, inset, top, left, right, bottom }: {
  target?: CameraFocusTarget | null;
  inset: boolean;
  top: number; left: number; right: number; bottom: number;
}) {
  const map = useMapGL();
  const focus = useRef(new CameraFocusRequest());
  useEffect(() => {
    const request = focus.current;
    request.update(target);
    if (!inset && !request.pending) return;
    const padding = { top, left, right, bottom };
    let frame = 0;
    let issuing = false;
    // A panel never moves a tilted camera: record the padding for the next
    // camera move to carry in. Flat, padding is a pure pan, so swap it now.
    const padTo = () => {
      setHudPadding(map, padding);
      if (map.getPitch() > FLAT_PITCH || map.isMoving()) return;
      issuing = true;
      padInPlace(map, padding);
      issuing = false;
    };
    const move = () => {
      frame = 0;
      const pending = request.pending;
      if (!inset && !pending) return;
      issuing = true;
      if (pending) {
        // An explicit map focus also releases the travel chase and block orbit.
        // A frame delay lets those controllers attach their listeners on mount.
        if (!inset) map.setCenterElevation(0);
        if (inset) setHudPadding(map, padding);
        map.easeTo({ center: [pending.lng, pending.lat], zoom: Math.max(map.getZoom(), 16), padding, duration: 750 }, { cameraFocus: true });
        issuing = false;
      } else {
        issuing = false;
        padTo();
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(move);
    };
    const settle = () => {
      if (issuing) return;
      request.settle(map.getCenter(), map.getZoom());
      if (request.pending) { schedule(); return; }
      if (!inset) return;
      if (!samePadding(toPadding(map.getPadding()), padding)) padTo();
    };
    const userMove = (event: { originalEvent?: unknown }) => {
      if (!event.originalEvent) return;
      request.cancel();
      cancelAnimationFrame(frame);
    };
    const resized = () => { if (request.pending) schedule(); };
    map.on('moveend', settle);
    map.on('movestart', userMove);
    map.on('resize', resized);
    if (request.pending) schedule();
    else move();
    return () => {
      cancelAnimationFrame(frame);
      map.off('moveend', settle);
      map.off('movestart', userMove);
      map.off('resize', resized);
    };
    // Token is the request identity; layout changes restart only pending focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, target?.token, target?.lat, target?.lng, inset, top, left, right, bottom]);
  return null;
}


const TRAIL_DONE = 'trail-done';
const TRAIL_AHEAD = 'trail-ahead';
const TRAIL_PREVIEW = 'trail-preview';

const travelledStroke = (progress: number): ExpressionSpecification =>
  ['step', ['line-progress'], '#9ad7eb', progress, 'transparent'];

/**
 * The route line. Planning: one dashed preview (red when there is no dry
 * route). En route: traversed (solid) vs ahead (faint dash), driven by the
 * same `startedAt`/`durationMs`/`travelEase` clock as the pin, imperatively,
 * so GameScreen does not re-render at 60 Hz.
 */
function TravelPath({
  path,
  travelAnim,
  blocked,
}: {
  path: { lat: number; lng: number }[] | null;
  travelAnim: TravelAnim | null;
  blocked: boolean;
}) {
  const map = useMapGL();
  useEffect(
    () =>
      installOverlay(map, 'trail', {
        [TRAIL_DONE]: { type: 'geojson', data: EMPTY_FC, lineMetrics: true, tolerance: 0 },
        [TRAIL_AHEAD]: 'geojson',
        [TRAIL_PREVIEW]: 'geojson',
      }, [
        {
          id: 'trail-preview-line',
          type: 'line',
          source: TRAIL_PREVIEW,
          filter: ['!', ['get', 'blocked']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#7ec8e3', 'line-width': 2.5, 'line-opacity': 0.75, 'line-dasharray': [3.2, 4] },
        },
        {
          id: 'trail-preview-blocked',
          type: 'line',
          source: TRAIL_PREVIEW,
          filter: ['get', 'blocked'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#d92d2d', 'line-width': 2.5, 'line-opacity': 0.85, 'line-dasharray': [1.6, 3.2] },
        },
        {
          id: 'trail-ahead-line',
          type: 'line',
          source: TRAIL_AHEAD,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#7ec8e3', 'line-width': 2.5, 'line-opacity': 0.4, 'line-dasharray': [3.2, 4] },
        },
        {
          id: 'trail-done-line',
          type: 'line',
          source: TRAIL_DONE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-gradient': travelledStroke(0), 'line-width': 3, 'line-opacity': 0.9 },
        },
      ]),
    [map],
  );

  useEffect(() => {
    const clear = () => {
      setData(map, TRAIL_DONE, EMPTY_FC);
      setData(map, TRAIL_AHEAD, EMPTY_FC);
      setData(map, TRAIL_PREVIEW, EMPTY_FC);
    };
    if (!path || path.length < 2) {
      clear();
      return;
    }
    if (!travelAnim || blocked) {
      clear();
      setData(map, TRAIL_PREVIEW, fc([lineFeature(path, { blocked })]));
      return;
    }
    setData(map, TRAIL_PREVIEW, EMPTY_FC);
    // Tile the path once. Reveal the solid stroke over the stationary dashes
    // by distance along the line, without sending new geometry to workers.
    const route = fc([lineFeature(path)]);
    setData(map, TRAIL_DONE, route);
    setData(map, TRAIL_AHEAD, route);
    const { startedAt, durationMs } = travelAnim;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Math.min(1, (Date.now() - startedAt) / durationMs);
      map.setPaintProperty('trail-done-line', 'line-gradient', travelledStroke(t >= 1 ? 1.001 : travelEase(t)));
      if (t < 1) timer = setTimeout(tick, 32);
    };
    tick();
    return () => clearTimeout(timer);
  }, [map, path, travelAnim, blocked]);

  return null;
}

/**
 * The planning ring: how far you can push on this energy, also the live
 * boundary of fog reveal and building rise.
 * Non-interactive: taps inside are ground picks.
 */
/** Ring vertices: smooth at any zoom you can see the whole ring from. */
const RING_STEPS = 96;

/** Ring line at rest (a quiet edge) and while planning a trip (the read you need). */
const RING_QUIET = { width: 1, opacity: 0.4 };
const RING_PLANNING = { width: 1.5, opacity: 0.95 };

const RangeRing = memo(function RangeRing({
  home,
  range,
  planning,
}: {
  home: { lat: number; lng: number };
  range: RangeMotion;
  planning: boolean;
}) {
  const map = useMapGL();
  useEffect(
    () =>
      installOverlay(map, 'ring', { 'range-src': 'geojson' }, [
        { id: 'range-fill', type: 'fill', source: 'range-src', paint: { 'fill-color': '#e8e5dd', 'fill-opacity': 0.03 } },
        {
          id: 'range-line',
          type: 'line',
          source: 'range-src',
          paint: {
            'line-color': '#e8e5dd',
            'line-width': RING_QUIET.width,
            'line-opacity': RING_QUIET.opacity,
            'line-dasharray': [2.7, 4],
            'line-width-transition': { duration: 200, delay: 0 },
            'line-opacity-transition': { duration: 200, delay: 0 },
          },
        },
      ]),
    [map],
  );
  // Only on a planning change: a short paint transition, then still.
  useEffect(() => {
    if (!map.getLayer('range-line')) return;
    const look = planning ? RING_PLANNING : RING_QUIET;
    map.setPaintProperty('range-line', 'line-width', look.width);
    map.setPaintProperty('range-line', 'line-opacity', look.opacity);
  }, [map, planning]);
  // One small polygon per animation frame while the range eases; nothing
  // once it lands.
  useEffect(() => {
    const draw = (r: number) =>
      setData(map, 'range-src', r > 0 ? fc([circleFeature(home.lat, home.lng, r, {}, RING_STEPS)]) : EMPTY_FC);
    draw(range.value);
    return range.subscribe(draw);
  }, [map, home.lat, home.lng, range]);
  return null;
});

/** Hazard pockets you can sense. Nearby same-kind discs fuse into one blob. */
const HazardRings = memo(function HazardRings({ hazards, pathIds }: { hazards: HazardZone[]; pathIds: ReadonlySet<string> }) {
  const map = useMapGL();
  useEffect(
    () =>
      installOverlay(map, 'hazard', { 'hazard-src': 'geojson' }, [
        {
          id: 'hazard-fill',
          type: 'fill',
          source: 'hazard-src',
          filter: ['>', ['get', 'fop'], 0],
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'fop'], 'fill-outline-color': 'transparent' },
        },
        {
          id: 'hazard-line-dash',
          type: 'line',
          source: 'hazard-src',
          filter: ['all', ['!', ['get', 'onPath']], ['!=', ['get', 'core'], true], ['!=', ['get', 'wall'], true]],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'w'],
            'line-opacity': ['get', 'op'],
            'line-dasharray': [2.4, 4],
          },
        },
        {
          id: 'hazard-line',
          type: 'line',
          source: 'hazard-src',
          filter: ['all', ['any', ['get', 'onPath'], ['==', ['get', 'wall'], true]], ['!=', ['get', 'core'], true]],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'op'] },
        },
      ]),
    [map],
  );

  useEffect(() => {
    const features: Feature[] = [];
    for (const blob of hazardBlobDrawList(hazards, pathIds)) {
      // Background pockets share the street surface. Reserve broad washes for
      // route crossings so unrelated zones cannot stack into a solid colour.
      const props = {
        color: HAZARD_CONFIG[blob.kind].color,
        onPath: blob.onPath,
        fop: blob.onPath ? 0.08 + blob.severity * 0.025 : 0,
        w: blob.onPath ? 2.25 : blob.area ? 1.5 : 1,
        op: blob.onPath ? 0.9 : 0.34 + blob.severity * 0.09,
        wall: !!blob.area,
      };
      for (const ring of blob.rings) {
        if (ring.length < 3) continue;
        features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [toLngLatRing(ring)] } });
      }
      // The place itself — the school, the market — reads as the heart of the zone.
      if (blob.cores) {
        const outlines = bakedOutlineByOsmId();
        const coreProps = { ...props, core: true, fop: (blob.onPath ? 0.16 : 0.06) + blob.severity * 0.025 };
        for (const id of blob.cores) {
          const ring = outlines?.get(id) ?? hazardSiteById(id)?.hull;
          if (!ring || ring.length < 3) continue;
          features.push({ type: 'Feature', properties: coreProps, geometry: { type: 'Polygon', coordinates: [toLngLatRing(ring)] } });
        }
      }
    }
    setData(map, 'hazard-src', fc(features));
  }, [map, hazards, pathIds]);
  return null;
});

interface PoiLayerProps {
  pois: Poi[];
  home: { lat: number; lng: number };
  blipRange: number;
  selectedId: string | null;
  hereId: string | null;
  playerAtSite: boolean;
  onSelect: (poi: Poi) => void;
  /** The 3D building engine, when the map is in 3D. */
  engine: BuildingEngine | null;
  /** Quarter-steps cleared, by worked block id. */
  worked: ReadonlyMap<string, number>;
  /** The extraction zone, whose badge (like an outpost's) rides its 3D beacon. */
  evacZoneId: string | null;
}

/** The danger ring the player actually sees on a location: its standing level
 *  plus whatever noise it has heard lately. The colour steps in whole points,
 *  so that's the resolution anything comparing on it needs. */
function ringDanger(poi: Poi, here: boolean): number {
  const base = here ? poi.currentDanger : poi.lastSeen?.currentDanger ?? poi.currentDanger;
  // The boost is live, not remembered, and deliberately so: the noise is
  // *yours*, and you can reason about what it stirred up whether or not you
  // are standing there to watch it happen.
  return base + (poi.tempDangerBoost ?? 0);
}

/** Only the fields that reach the screen. Everything else about a location can
 *  churn — and does, on every noise pulse — without the map looking different. */
function poiLooksSame(a: Poi, b: Poi): boolean {
  return (
    a === b ||
    (a.id === b.id &&
      a.lat === b.lat &&
      a.lng === b.lng &&
      a.category === b.category &&
      a.outline === b.outline &&
      a.discovered === b.discovered &&
      a.identified === b.identified &&
      a.exhausted === b.exhausted &&
      a.isFactionOutpost === b.isFactionOutpost &&
      a.factionId === b.factionId &&
      a.isFactionRevealed === b.isFactionRevealed &&
      a.destruction === b.destruction &&
      // Compared at both `here` settings so the memo holds regardless of which
      // one this location is rendered at.
      Math.round(ringDanger(a, true)) === Math.round(ringDanger(b, true)) &&
      Math.round(ringDanger(a, false)) === Math.round(ringDanger(b, false)) &&
      a.lastSeen === b.lastSeen)
  );
}

/** How one drawn site looks: its pin, and (if it has one) its outline. */
interface PoiLook {
  poi: Poi;
  icon: ReturnType<typeof poiIcon>;
  opacity: number;
  outline: Record<string, unknown> | null;
  /** Its building's colour in 3D. */
  color3d: string;
  /** Known ruin tier, which its 3D building wears. */
  ruin?: DestructionTier;
}

/** A sensed, unidentified site's building in 3D: neutral, like its outline. */
const DETECTED_BUILDING = '#9a9c94';

function lookOf(
  poi: Poi,
  vis: 'detected' | 'visible' | string,
  selected: boolean,
  here: boolean,
  worked = 0,
): PoiLook {
  // Sensed but unidentified: the building outline still shows (in neutral),
  // capped with a "?" badge. Locations without an outline are just the badge.
  if (vis === 'detected' || vis === 'identified') {
    return {
      poi,
      icon: vis === 'identified' ? identifiedIcon(poi.category) : unknownIcon(),
      opacity: selected ? 1 : 0.85,
      outline: {
        id: poi.id,
        dashed: true,
        fill: UNKNOWN_STROKE,
        fop: selected ? 0.22 : 0.14,
        line: UNKNOWN_STROKE,
        lop: 0.95,
        w: selected ? 2.5 : 1.5,
      },
      color3d: DETECTED_BUILDING,
    };
  }
  // Visited: live data only while standing here, otherwise last-known memory.
  const mem = poi.lastSeen;
  const danger = ringDanger(poi, here);
  const exhausted = here ? poi.exhausted : mem?.exhausted ?? poi.exhausted;
  const factionRevealed = here ? poi.isFactionRevealed : mem?.isFactionRevealed ?? poi.isFactionRevealed;
  const display: Poi = { ...poi, currentDanger: danger, exhausted, isFactionRevealed: factionRevealed };
  const factionColor = knownFactionColor(display);
  const ring = factionColor ?? (exhausted ? '#555' : dangerColor(Math.round(danger)));
  const own = factionColor ?? POI_CONFIG[poi.category].color;
  return {
    poi,
    icon: poiIcon(display),
    opacity: here || selected || factionColor ? 1 : 0.55,
    outline: {
      id: poi.id,
      dashed: false,
      fill: own,
      fop: exhausted ? 0.1 : selected ? 0.5 : here ? 0.35 : 0.18,
      line: ring,
      lop: here ? 1 : factionColor ? 0.85 : 0.65,
      w: selected ? 2.5 : factionColor ? 2 : 1,
    },
    // Remembered sites read dimmer than the one you stand in; picked-clean darker still.
    // A worked block steps down toward that shade by the quarter of doors you opened.
    // Keep known territory legible even when the site's supplies are spent.
    color3d: dimHex(own, Math.max(factionColor ? 0.75 : 0, exhausted ? 0.35 : workedShade(here ? 1 : 0.55, worked))),
    ruin: here ? poi.destruction : mem?.destruction ?? poi.destruction,
  };
}

/** Brightness of a block `worked` quarters cleared: from `base` down to the exhausted 0.35. */
function workedShade(base: number, worked: number): number {
  return base - (base - 0.35) * Math.min(4, Math.max(0, worked)) / 4;
}

/**
 * Quarter-steps of doors cleared per worked block. Cached on the `hdbBlocks`
 * identity so the selector stays cheap on every store tick, and keyed as a
 * string so the map only hears about a step change.
 */
let workedFor: Record<string, HdbDungeon> | null = null;
let workedKeyCache = '';
function workedKeyOf(blocks: Record<string, HdbDungeon>): string {
  if (blocks === workedFor) return workedKeyCache;
  workedFor = blocks;
  const out: string[] = [];
  for (const [id, d] of Object.entries(blocks)) {
    const q = Math.round(hdbScar(d).clearedFrac * 4);
    if (q > 0) out.push(`${id}:${q}`);
  }
  workedKeyCache = out.sort().join(',');
  return workedKeyCache;
}

const NO_WORKED: ReadonlyMap<string, number> = new Map();

const POI_LAYERS = [POI_FILL_LAYER, 'poi-line', 'poi-line-dash'];
/** A dot's own opacity, hidden under its badge, faded in from POI_HIDE_ZOOM. */
const dotFade: ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  POI_HIDE_ZOOM, 0,
  POI_HIDE_ZOOM + POI_HIDE_FADE, ['case', ['boolean', ['feature-state', 'badge'], false], 0, ['coalesce', ['feature-state', 'opacity'], 0]],
];
const NO_ROOFS: ReadonlyMap<string, number> = new Map();

const PoiLayer = memo(
  function PoiLayer({ pois, home, blipRange, selectedId, hereId, playerAtSite, onSelect, engine, worked, evacZoneId }: PoiLayerProps) {
    const map = useMapGL();
    const recognition = useGame(s => s.nearbyRecognition);
    const hinted = useRecognitionHint();
    const reduced = useReducedMotion();
    const box = usePaddedBounds();
    const [detail, setDetail] = useState(() => map.getZoom() >= POI_DETAIL_ZOOM);
    const [fullCapsule, setFullCapsule] = useState(() => map.getZoom() >= PLAYER_CAPSULE_ZOOM);
    const [far, setFar] = useState(() => map.getZoom() < POI_HIDE_ZOOM);
    // Only crossing a detail boundary re-renders React during a zoom. The
    // circle layer's zoom range follows the camera directly between those crossings.
    useMapEvent('zoom', () => {
      const next = map.getZoom() >= POI_DETAIL_ZOOM;
      if (next !== detail) setDetail(next);
      const out = map.getZoom() < POI_HIDE_ZOOM;
      if (out !== far) setFar(out);
      const full = map.getZoom() >= PLAYER_CAPSULE_ZOOM;
      if (full !== fullCapsule) setFullCapsule(full);
    });

    const looks = useMemo(() => {
      const inView: { poi: Poi; d: number; vis: string }[] = [];
      for (const poi of pois) {
        if (!boxContains(box, poi.lat, poi.lng)) continue;
        const d = haversine(home.lat, home.lng, poi.lat, poi.lng);
        const vis = visibilityOf(poi, d, blipRange);
        if (vis === 'hidden') continue;
        inView.push({ poi, d, vis });
      }
      let drawn = inView;
      if (inView.length > MAX_POIS_ON_SCREEN) {
        const cLat = (box.north + box.south) / 2;
        const cLng = (box.east + box.west) / 2;
        drawn = inView
          .map((x) => ({
            x, c: haversine(cLat, cLng, x.poi.lat, x.poi.lng),
            priority: x.poi.id === selectedId || x.poi.id === hereId ? 0
              : beaconKindOf(x.poi, evacZoneId) ? 1 : 2,
          }))
          .sort((a, b) => a.priority - b.priority || a.c - b.c)
          .slice(0, MAX_POIS_ON_SCREEN)
          .map(({ x }) => x);
      }
      return drawn.map(({ poi, vis }) =>
        lookOf(poi, vis, selectedId === poi.id, poi.id === hereId, worked.get(poi.id) ?? 0),
      );
    }, [pois, box, home.lat, home.lng, blipRange, selectedId, hereId, worked, evacZoneId]);

    const badges = useMemo(() => looks
      .filter((l) => detail || l.poi.id === selectedId || l.poi.id === hereId || (!far && recognition.includes(l.poi.id)) || beaconKindOf(l.poi, evacZoneId) !== null)
      .map((look) => ({ id: look.poi.id, look })), [looks, detail, far, selectedId, hereId, evacZoneId, recognition]);
    const fadingBadges = useMarkerPresence(badges, reduced ? 0 : REVEAL_MS, MAX_POIS_ON_SCREEN);

    useEffect(
      () =>
        // Site ids are OSM strings ("way/123"); MapLibre only keys feature-state
        // by numeric feature ids, so promote the `id` property instead. Without
        // it every feature gets no state and its colours fall back to black.
        installOverlay(map, 'poi', {
          'poi-src': { type: 'geojson', data: EMPTY_FC, promoteId: 'id' },
          'poi-dots-src': { type: 'geojson', data: EMPTY_FC, promoteId: 'id' },
        }, [
          {
            id: POI_FILL_LAYER,
            type: 'fill',
            source: 'poi-src',
            paint: { 'fill-color': ['feature-state', 'fill'], 'fill-opacity': ['feature-state', 'fop'] },
          },
          {
            id: 'poi-line',
            type: 'line',
            source: 'poi-src',

            paint: { 'line-color': ['feature-state', 'line'], 'line-width': ['feature-state', 'w'], 'line-opacity': ['case', ['boolean', ['feature-state', 'dashed'], false], 0, ['feature-state', 'lop']] },
          },
          {
            id: 'poi-line-dash',
            type: 'line',
            source: 'poi-src',

            paint: {
              'line-color': ['feature-state', 'line'],
              'line-width': ['feature-state', 'w'],
              'line-opacity': ['case', ['boolean', ['feature-state', 'dashed'], false], ['feature-state', 'lop'], 0],
              'line-dasharray': [2.7, 2],
            },
          },
          {
            id: POI_DOT_LAYER,
            type: 'circle',
            source: 'poi-dots-src',
            minzoom: POI_HIDE_ZOOM,
            maxzoom: POI_DETAIL_ZOOM,

            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], POI_HIDE_ZOOM, 3, POI_DETAIL_ZOOM, 6],
              'circle-color': ['feature-state', 'fill'],
              'circle-opacity': dotFade,
              'circle-stroke-color': ['feature-state', 'line'],
              'circle-stroke-width': 1.5,
              'circle-stroke-opacity': dotFade,
            },
          },
        ]),
      [map],
    );

    const byId = useRef(new Map<string, Poi>());
    const sources = useRef(new PoiSources());
    useEffect(() => {
      byId.current = new Map(looks.map((l) => [l.poi.id, l.poi]));
      sources.current.update(map, looks.map((l) => ({
        id: l.poi.id, lat: l.poi.lat, lng: l.poi.lng,
        ring: l.outline ? l.poi.outline : undefined,
        outline: l.outline,
        dot: {
          fill: l.outline?.fill ?? l.color3d,
          line: l.outline?.line ?? l.color3d,
          opacity: l.opacity,
          badge: l.poi.id === selectedId || l.poi.id === hereId || recognition.includes(l.poi.id) || beaconKindOf(l.poi, evacZoneId) !== null,
        },
      })));
    }, [map, looks, selectedId, hereId, evacZoneId, recognition]);

    // In 3D the buildings take over from the outlines once they stand: a site
    // with a building is its building, one without is just its badge.
    useEffect(() => {
      for (const id of POI_LAYERS) if (map.getLayer(id)) map.setLayerZoomRange(id, POI_DETAIL_ZOOM, engine ? LOD_ZOOM : 24);
    }, [map, engine]);

    const [roofs, setRoofs] = useState<ReadonlyMap<string, number>>(NO_ROOFS);
    useEffect(() => {
      if (!engine) {
        setRoofs(NO_ROOFS);
        return;
      }
      // The store hears roofs too: a block's real height sizes its cutaway.
      const publish = (r: ReadonlyMap<string, number>) => {
        setRoofs(r);
        useGame.getState().setSiteRoofs(engine.roofHeights());
      };
      publish(engine.roofHeights(true));
      engine.onRoofs = publish;
      return () => {
        engine.onRoofs = null;
      };
    }, [engine]);

    useEffect(() => {
      if (!engine) return;
      engine.setSites(
        looks.map(
          (l): Site3d => ({
            id: l.poi.id,
            lat: l.poi.lat,
            lng: l.poi.lng,
            outline: l.poi.outline,
            category: l.poi.category,
            color: l.color3d,
            ruin: l.ruin,
          }),
        ),
      );
    }, [engine, looks]);

    // Outline taps select the site; GroundPicker skips the same hits.
    useLayerEvent('click', POI_FILL_LAYER, (e) => {
      const id = e.features?.[0]?.properties?.id;
      const poi = typeof id === 'string' ? byId.current.get(id) : undefined;
      if (poi) onSelect(poi);
    });
    useLayerEvent('mouseenter', POI_FILL_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    useLayerEvent('mouseleave', POI_FILL_LAYER, () => {
      map.getCanvas().style.cursor = '';
    });
    useLayerEvent('click', POI_DOT_LAYER, (e) => {
      const id = e.features?.[0]?.properties?.id;
      const poi = typeof id === 'string' ? byId.current.get(id) : undefined;
      if (poi) onSelect(poi);
    });
    useLayerEvent('mouseenter', POI_DOT_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    useLayerEvent('mouseleave', POI_DOT_LAYER, () => {
      map.getCanvas().style.cursor = '';
    });

    return (
      <>
        {fadingBadges.map(({ item: { look: l }, removeAt }) => {
          const playerHere = playerAtSite && l.poi.id === hereId;
          return (
            <MapMarker
              key={l.poi.id}
              lat={l.poi.lat}
              lng={l.poi.lng}
              icon={playerHere ? playerLocationIcon(l.icon, !fullCapsule) : l.icon}
              opacity={l.opacity}
              visible={removeAt === null}
              fadeMs={reduced ? 0 : REVEAL_MS}
              roof={!playerHere && engine ? roofs.get(l.poi.id) ?? 0 : 0}
              ring={l.poi.id === selectedId}
              recognized={recognition.includes(l.poi.id)}
              hinted={hinted.has(l.poi.id)}
              // Nearby sites stay visible and tappable even inside the capsule's footprint.
              zIndex={playerHere ? 0 : l.poi.id === selectedId ? 10 : 1}
              beacon={!playerHere && engine ? beaconKindOf(l.poi, evacZoneId) : null}
              onClick={() => onSelect(l.poi)}
            />
          );
        })}
      </>
    );
  },
  (prev, next) =>
    prev.home === next.home &&
    prev.blipRange === next.blipRange &&
    prev.selectedId === next.selectedId &&
    prev.hereId === next.hereId &&
    prev.playerAtSite === next.playerAtSite &&
    prev.onSelect === next.onSelect &&
    prev.engine === next.engine &&
    prev.worked === next.worked &&
    prev.evacZoneId === next.evacZoneId &&
    prev.pois.length === next.pois.length &&
    prev.pois.every((p, i) => poiLooksSame(p, next.pois[i])),
);

const RumourLayer = memo(function RumourLayer({ annotations }: { annotations: MapAnnotation[] }) {
  const box = usePaddedBounds();
  const drawn = useMemo(() => annotations.filter((a) => boxContains(box, a.lat, a.lng)), [annotations, box]);
  return (
    <>
      {drawn.map((ann) => (
        <MapMarker key={ann.id} lat={ann.lat} lng={ann.lng} icon={rumourIcon()} zIndex={650} opacity={0.9} />
      ))}
    </>
  );
});

/**
 * Viewport-cull + `poiLooksSame`: hidden and off-screen POIs must not become
 * markers. Mapping the whole `locations` dict does not scale with an island
 * crossing. SightLayers samples the moving centre and sensing-radius tween
 * for marker visibility, keeping those updates out of GameScreen.
 */
/** How long the travel range takes to ease to a new value. */
const RANGE_EASE_MS = 600;

function GameMapInner({
  inCombat,
  home,
  pois,
  selectedId,
  hereId,
  travelRange,
  blipRange,
  veilRadiusM,
  veilAlpha,
  exploredArea,
  travelAnim,
  evacZoneId,
  noisePulses,
  vitals,
  hazards,
  pathHazardIds = [],
  weather,
  time,
  trekTarget,
  travelPath,
  travelPathBlocked,
  focusTarget,
  mapAnnotations = [],
  padRight = 0,
  padLeft = 0,
  padBottom = 0,
  padTop = 0,
  placeFocus = null,
  chromeRight = 0,
  showModeToggles = true,
  onSelect,
  onPickGround,
}: Props) {
  const { t } = useT();
  const evacPoi = evacZoneId ? pois.find((p) => p.id === evacZoneId) : null;
  // The ranges ease outside React: nothing here re-renders while they move.
  const reducedMotion = useReducedMotion();
  const [reach] = useState(() => new RangeMotion(travelRange, RANGE_EASE_MS));
  const [sensed] = useState(() => new RangeMotion(blipRange, REVEAL_MS));
  // A swing spends game time. Apply the resulting range once during combat
  // so fog geometry and buildings don't compete with the hit animation.
  const instantRange = reducedMotion || inCombat;
  useEffect(() => reach.set(travelRange, instantRange), [reach, travelRange, instantRange]);
  useEffect(() => sensed.set(blipRange, instantRange), [sensed, blipRange, instantRange]);
  useEffect(
    () => () => {
      reach.destroy();
      sensed.destroy();
    },
    [reach, sensed],
  );
  const pathIdSet = useMemo(() => new Set(pathHazardIds), [pathHazardIds]);
  const view3d = useSetting('mapView3d') === 'on';
  const desktop = useShadowCapableLayout();
  const playerAtSite = !!hereId && !travelAnim;
  // The place view owns padding and the keyboard camera while it holds the map.
  const placeCam = !!placeFocus && (placeFocus.kind === 'site' || view3d);
  const [initial] = useState(() => ({
    zoom: loadZoom(view3d ? DEFAULT_ZOOM_3D : DEFAULT_ZOOM),
    pitch: view3d ? PITCH_3D : 0,
  }));
  const [engine, setEngine] = useState<BuildingEngine | null>(null);
  // WeatherFx renders the 3D weather's DOM; Atmosphere3d drives it from the map.
  const boltRef = useRef<HTMLDivElement>(null);
  const depthRef = useRef<HTMLDivElement>(null);
  const [weatherDom] = useState<WeatherDom>(() => ({ bolt: boltRef, depth: depthRef }));
  // Building taps carry an id; resolve it against the latest locations.
  const poisRef = useRef(pois);
  poisRef.current = pois;
  const selectSite = useCallback(
    (id: string) => {
      const poi = poisRef.current.find((p) => p.id === id);
      if (poi) onSelect(poi);
    },
    [onSelect],
  );

  // The rail network is a separate file, fetched the first time the player asks
  // to see it (or already in memory, if the world build got there first).
  // The on/off state is a setting, so this button and the one on the spawn
  // screen are two views of one value rather than two stale local copies.
  const showMrt = useSetting('railOverlay') === 'on';
  const setSetting = useSettings((s) => s.setSetting);
  const net = useMrtNetwork(showMrt);
  const workedKey = useGame((s) => workedKeyOf(s.hdbBlocks));
  const worked = useMemo<ReadonlyMap<string, number>>(() => {
    if (!workedKey) return NO_WORKED;
    return new Map(
      workedKey.split(',').map((pair) => {
        const i = pair.lastIndexOf(':');
        return [pair.slice(0, i), Number(pair.slice(i + 1))] as const;
      }),
    );
  }, [workedKey]);

  const toggleMrt = () => setSetting('railOverlay', showMrt ? 'off' : 'on');
  const toggle3d = () => setSetting('mapView3d', view3d ? 'off' : 'on');

  return (
    <div className="relative h-full w-full" data-guide-map="">
      <MapView
        center={home}
        zoom={initial.zoom}
        pitch={initial.pitch}
        maxPitch={MAX_PITCH_3D}
        rotate
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        bounds={RUN_BOX}
        className="h-full w-full"
        style={{ background: '#08080a' }}
      >
        <ZoomMemory />
        <CameraChrome target={focusTarget} inset={!placeCam} top={padTop} left={padLeft} right={padRight} bottom={padBottom} />
        <Camera3d on={view3d} />
        {!placeCam && <KeyboardCamera home={home} />}
        {view3d && <Atmosphere3d kind={weather} time={time} dom={weatherDom} />}
        {/* Night roads: cool white with a soft glow (one paint change per hour band). */}
        <BasemapTime time={time} />
        <GroundPicker onPick={onPickGround} engine={engine} onSite={selectSite} />
        {/* Water and forest wash — under fog so only explored ground shows. */}
        <VegetationOverlay />
        <DistrictLines />
        {/* The sealed Johor border: blown Causeway, barricaded Second Link, searchlights. */}
        <BorderLayers view3d={view3d} time={time} />
        <DistrictNames />
        {!(view3d && desktop) && <MapGrain />}
        {/* Outside the island disc the world fades to black. */}
        <EdgeVignette />
        {/* Fog + 3D buildings. Overlays draw by slot, not mount order. */}
        <SightLayers
          home={home}
          travelAnim={travelAnim}
          exploredArea={exploredArea}
          reach={reach}
          sensed={sensed}
          view3d={view3d}
          onEngine={setEngine}
          poiLayer={{ pois, selectedId, hereId, playerAtSite, onSelect, engine, worked, evacZoneId }}
          planning={!!travelPath && travelPath.length > 1 && !travelAnim}
        />

        {/* Drawn under the pins — ground, not a destination. */}
        <HazardRings hazards={hazards} pathIds={pathIdSet} />

        <TravelPath path={travelPath} travelAnim={travelAnim} blocked={!!travelPathBlocked} />

        {trekTarget && <MapMarker lat={trekTarget.lat} lng={trekTarget.lng} icon={trekTargetIcon()} zIndex={800} />}

        <BlockView engine={engine} pois={pois} pad={`${padTop}:${padLeft}:${padRight}:${padBottom}`} focus={placeCam ? placeFocus : null} />

        {mapAnnotations.length > 0 && <RumourLayer annotations={mapAnnotations} />}

        {/* Light pillars over evac and faction outposts, readable from afar when tilted. */}
        {view3d && <Beacons3d pois={pois} evacZoneId={evacZoneId} />}

        {/* extraction beacon — always visible so the goal is never lost */}
        {evacPoi && (
          <MapMarker
            lat={evacPoi.lat}
            lng={evacPoi.lng}
            icon={evacIcon()}
            zIndex={900}
            beacon={view3d ? 'evac' : null}
            onClick={() => onSelect(evacPoi)}
          />
        )}

        <NoiseWaves pulses={noisePulses} />
        <PlayerMarker
          home={home}
          atSite={playerAtSite}
          travelAnim={travelAnim}
          veilRadiusM={veilRadiusM}
          veilAlpha={veilAlpha}
          yieldCamera={placeCam}
        />
        {showMrt && net && <MrtOverlay net={net} />}
        <GuideMapAdapter />
      </MapView>

      {/* ---- 3D + rail network toggles (phone; desktop keeps them on the rail), rail legend ---- */}
      {showModeToggles && (
      <div
        className="absolute right-2 top-2 z-[500] flex gap-1.5 transition-[right] duration-200"
        style={chromeRight ? { right: chromeRight } : undefined}
      >
        <button
          onClick={toggle3d}
          aria-pressed={view3d}
          {...tip(t('ui.hud.view3dTip'), { label: true })}
          className={`rounded border px-2 py-1.5 text-body font-semibold shadow-signage transition-colors ${
            view3d
              ? 'border-astral/50 bg-astral/20 text-astral'
              : 'border-white/15 bg-concrete-900/95 text-white/60 hover:text-white/90'
          }`}
        >
          3D
        </button>
        <button
          onClick={toggleMrt}
          aria-pressed={showMrt}
          {...tip(t('ui.hud.railTip'), { label: true })}
          className={`flex items-center gap-1.5 rounded border px-2 py-1.5 text-body font-semibold shadow-signage transition-colors ${
            showMrt
              ? 'border-astral/50 bg-astral/20 text-astral'
              : 'border-white/15 bg-concrete-900/95 text-white/60 hover:text-white/90'
          }`}
        >
          <Icon name="action.mrt" size={14} /> {t('ui.hud.railMap')}
        </button>
      </div>
      )}

      {showMrt && net && (
        <div
          className={`absolute right-2 z-[500] ${showModeToggles ? 'top-11' : 'top-2'}`}
          style={chromeRight ? { right: chromeRight } : undefined}
        >
          <MrtLineLegend net={net} />
        </div>
      )}

      {/* ---- the sky, over everything on the map but under the chrome ---- */}
      <WeatherFx kind={weather} time={time} view3d={view3d} dom={weatherDom} />
      <TimeOfDayFx time={time} />

      {/* ---- diegetic vignettes: the frame tells you how bad it is ---- */}
      {vitals.infected && <div className="vignette-infection pointer-events-none absolute inset-0 z-[450]" />}
      {vitals.exhausted && <div className="vignette-fatigue pointer-events-none absolute inset-0 z-[450]" />}
    </div>
  );
}

/**
 * `pois` and `noisePulses` are fresh arrays on every store write that touches a
 * location, so a plain shallow compare would let a fight repaint the map on
 * every swing. Compare them on content instead; everything else is stable by
 * construction in the caller.
 */
function propsEqual(a: Props, b: Props): boolean {
  for (const k of Object.keys(a) as (keyof Props)[]) {
    if (k === 'pois' || k === 'noisePulses' || k === 'pathHazardIds') continue;
    if (a[k] !== b[k]) return false;
  }
  if (a.pois.length !== b.pois.length) return false;
  if (!a.pois.every((p, i) => poiLooksSame(p, b.pois[i]))) return false;
  // Pulses are append-and-prune: same count and same newest id means same set.
  if (a.noisePulses.length !== b.noisePulses.length) return false;
  if (!a.noisePulses.every((p, i) => p.id === b.noisePulses[i].id)) return false;
  const aPath = a.pathHazardIds ?? [];
  const bPath = b.pathHazardIds ?? [];
  if (aPath.length !== bPath.length) return false;
  return aPath.every((id, i) => id === bPath[i]);
}

export const GameMap = memo(GameMapInner, propsEqual);

