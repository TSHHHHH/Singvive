import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LngLat, Map as MlMap, Marker } from 'maplibre-gl';
import type { Feature } from 'geojson';
import type { DestructionTier, Poi, TimeOfDay, WeatherKind, MapAnnotation } from '../game/types';
import { WeatherFx } from './WeatherFx';
import { Atmosphere3d } from './Atmosphere3d';
import type { WeatherDom } from './useAtmosphere';
import { TimeOfDayFx } from './TimeOfDayFx';
import { poiIcon, playerIcon, unknownIcon, evacIcon, dangerColor, rumourIcon, trekTargetIcon, knownFactionColor } from './mapIcons';
import { POI_CONFIG } from '../game/poi';
import { haversine } from '../game/overpass';
import { visibilityOf } from '../game/fog';
import { FogOverlay } from './FogOverlay';
import type { ExploredCircle } from '../game/fog';
import type { TravelAnim } from '../game/store';
import { useGame } from '../game/store';
import { useSetting, useSettings } from '../game/settings';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { NoisePulse } from '../game/noise';
import { HAZARD_CONFIG, type HazardZone } from '../game/wilds';
import { hazardBlobDrawList } from '../game/hazardBlob';
import { NoiseWaves } from './NoiseWaves';
import { MrtOverlay, MrtLineLegend, MRT_STATION_LAYER } from './MrtOverlay';
import { useMrtNetwork } from './useMrtNetwork';
import { VegetationOverlay } from './UnplayableOverlay';
import { ISLAND_STATUS_ZOOM, NeighbourhoodWash } from './NeighbourhoodWash';
import { Icon } from '../icons/Icon';
import { pathFromProgress, pathUntil, pointAlongPath } from '../game/route';
import { useAnimatedNumber, useThrottledNumber } from '../hooks/useAnimatedNumber';
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
import { RUN_BOX, SG_BOX } from '../map/mapStyle';
import { KeyboardCamera } from './KeyboardCamera';
import { EdgeVignette } from './EdgeVignette';
import { Beacons3d } from './Beacons3d';
import { beaconKindOf } from '../map/beacons';
import { useLayerEvent, useMapEvent, useMapGL } from '../map/hooks';
import { MapMarker } from '../map/markers';
import { createMarker } from '../map/markerDom';
import { installOverlay, setData } from '../map/layers';
import { EMPTY_FC, boxContains, circleFeature, dimHex, fc, lineFeature, padBox, toLngLatRing, type LatLngBox } from '../map/geo';
import { BuildingEngine, LOD_ZOOM, type Site3d } from '../map/buildings';
import { hdbScar, STOREY_M, type HdbDungeon } from '../game/hdbDungeon';
import { blockFraming } from '../map/blockFraming';
import { useT } from '../i18n';
import { FOG_COLOUR, REACH_SHADE, VEIL_BANDS, bandOpacity, reachShade, veilBands } from '../map/fogGeometry';

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
        map.easeTo({ pitch: PITCH_3D, zoom, duration, essential: true });
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
    map.easeTo({ pitch: 0, bearing: 0, duration, essential: true });
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

/**
 * Inside an HDB block, in 3D: ease onto the block on entry and back to where
 * you were on exit, and light the storey band for the landing you are on
 * (or pointing at). Selects scalars only; the band is redrawn when its row moves.
 */
function BlockView({
  engine,
  pois,
  pad,
}: {
  engine: BuildingEngine | null;
  pois: Poi[];
  /** "top:left:right:bottom" of the building viewport, clear of the floor panel. */
  pad: string;
}) {
  const map = useMapGL();
  const { t } = useT();
  const reduced = useReducedMotion();
  const siteId = useGame((s) => s.hdb?.locationId ?? null);
  const roof = useGame((s) => (siteId ? s.siteRoofs[siteId] : undefined));
  // "lo:hi:real" storeys of the band row, as one string so equal rows don't re-run.
  const band = useGame((s) => {
    const h = s.hdb;
    if (!h) return null;
    const level = s.hdbHoverLevel ?? h.pos.level;
    const f = h.floors[level - 1];
    if (!f) return null;
    const lo = f.span?.[0] ?? f.storey ?? level;
    const hi = f.span?.[1] ?? f.storey ?? level;
    return `${lo}:${hi}:${h.realStoreys ?? h.floors[h.height - 1]?.storey ?? h.height}`;
  });
  const poisRef = useRef(pois);
  poisRef.current = pois;
  const realStoreys = useGame((s) => s.hdb?.realStoreys ?? 0);
  const on = !!engine;

  // Entry: remember the camera to ease back to, and pick the bearing once.
  const backRef = useRef<{
    center: LngLat; zoom: number; pitch: number; bearing: number; elevation: number;
    maxZoom: number; clamped: boolean;
  } | null>(null);
  const bearingRef = useRef(0);
  const restoreRef = useRef(0);
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
      bearingRef.current =
        squareBearing(site.outline, back.bearing, (lat, lng, b) =>
          engine ? engine.occlusion(lat, lng, b) : 0,
        ) ?? back.bearing;
    }
    backRef.current = back;
    return () => {
      // A frame late, so CameraInset's padding ease on leaving can't cut it
      // short (its settle pass finishes the padding).
      restoreRef.current = requestAnimationFrame(() => {
        backRef.current = null;
        try {
          map.setCenterClampedToGround(back.clamped);
          map.setMaxZoom(back.maxZoom);
          map.setCenterElevation(back.elevation);
          map.easeTo({ ...back, duration: reduced ? 0 : 900 });
        } catch {
          // The map went away with the run; nothing to ease back.
        }
      });
    };
  }, [map, on, engine, siteId, reduced]);

  // Orbit the middle of the building, not its ground-level POI marker. Only
  // this controller owns padding inside a block; the general HUD inset is off.
  const roofM = roof ?? (realStoreys > 0 ? realStoreys * STOREY_M : STOREY_M * 12);
  const frameBuilding = useCallback(() => {
    if (!on || !siteId || !backRef.current) return;
    const site = poisRef.current.find((p) => p.id === siteId);
    if (!site) return;
    const [top, left, right, bottom] = pad.split(':').map(Number);
    const box = map.getContainer();
    const framing = blockFraming(site, roofM, box.clientWidth - left - right,
      box.clientHeight - top - bottom, bearingRef.current, MAX_PITCH_3D);
    // MapLibre's easeTo does not interpolate elevation; set the orbit target first.
    map.setCenterElevation(framing.elevation);
    map.easeTo({
      ...framing,
      pitch: MAX_PITCH_3D,
      bearing: bearingRef.current,
      padding: { top, left, right, bottom },
      duration: reduced ? 0 : 650,
    });
  }, [map, on, siteId, pad, roofM, reduced]);
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
      if (drag || (e.pointerType === 'mouse' && e.button !== 0) || !isSurface(e.target)) return;
      map.stop();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, bearing: map.getBearing(), pitch: map.getPitch() };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const pitch = drag.pitch - (e.clientY - drag.y) * ORBIT_PITCH_PER_PX;
      map.jumpTo({
        bearing: drag.bearing + (e.clientX - drag.x) * ORBIT_DEG_PER_PX,
        pitch: Math.min(MAX_PITCH_3D, Math.max(ORBIT_MIN_PITCH, pitch)),
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
  }, [map, on, siteId, zoomBy]);

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
          <button type="button" onClick={frameBuilding} className="min-h-9 px-2 text-body text-signal hover:bg-white/10">{t('ui.hdb.cameraFrame')}</button>
          <button type="button" onClick={() => zoomBy(0.5)} aria-label={t('ui.hdb.cameraZoomIn')} className="h-9 w-9 text-title text-concrete-50 hover:bg-white/10">+</button>
        </div>
        <span className="pointer-events-none text-body text-concrete-200 [text-shadow:0_1px_4px_#000]">{t('ui.hdb.cameraHint')}</span>
      </div>
    </>
  );
}

/** Mounts the 3D building engine and feeds it the fog reveal. */
function Buildings3d({
  exploredArea,
  home,
  radius,
  reach,
  onEngine,
}: {
  exploredArea: ExploredCircle[];
  home: { lat: number; lng: number };
  /** max travel range: buildings inside it stand */
  radius: number;
  /** current travel range: standing buildings past it are dimmed */
  reach: number;
  onEngine: (engine: BuildingEngine | null) => void;
}) {
  const map = useMapGL();
  const reduced = useReducedMotion();
  const [engine, setEngine] = useState<BuildingEngine | null>(null);

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

  useEffect(() => {
    engine?.setReveal(exploredArea, { lat: home.lat, lng: home.lng, radius }, reach);
  }, [engine, exploredArea, home.lat, home.lng, radius, reach]);

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

/** How often the sight disc catches up with the walking pin (ms). */
const SIGHT_STEP_MS = 100;

/**
 * Where the player can see from: `home`, or during a glide the pin's spot on
 * the same clock as `PlayerMarker`, sampled every SIGHT_STEP_MS. The fog edge
 * and the buildings then move with the walker, so arrival has nothing left to
 * reveal. Cosmetic only: POI visibility still keys off the store's position.
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
 * The fog, the 3D buildings and the two range rings, all centred on where the
 * player can see from. `maxRange` (stable) opens the fog and stands the
 * buildings; `reach` (energy-driven) only draws the inner ring and dims what
 * lies past it.
 */
function SightLayers({
  home,
  travelAnim,
  exploredArea,
  maxRange,
  reach,
  ringReach,
  ringMax,
  view3d,
  onEngine,
}: {
  home: { lat: number; lng: number };
  travelAnim: TravelAnim | null;
  exploredArea: ExploredCircle[];
  /** throttled, for the fog and the buildings */
  maxRange: number;
  reach: number;
  /** per-frame tweens, for the ring lines */
  ringReach: number;
  ringMax: number;
  view3d: boolean;
  onEngine: (engine: BuildingEngine | null) => void;
}) {
  const sight = useSightCenter(home, travelAnim);
  return (
    <>
      <FogOverlay exploredArea={exploredArea} currentRevealCenter={sight} currentRevealRadius={maxRange} />
      {view3d && <Buildings3d exploredArea={exploredArea} home={sight} radius={maxRange} reach={reach} onEngine={onEngine} />}
      {/* Never hit-tested: the fills cover everywhere you can walk, so a
          clickable ring would swallow every ground pick inside your range. */}
      <RangeRing home={sight} travelRange={ringReach} maxRange={ringMax} />
    </>
  );
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
  travelAnim,
  veilRadiusM,
  veilAlpha,
  onMove,
}: {
  home: { lat: number; lng: number };
  travelAnim: TravelAnim | null;
  veilRadiusM: number;
  veilAlpha: number;
  onMove?: (lat: number, lng: number) => void;
}) {
  const map = useMapGL();
  const rafRef = useRef<number | undefined>(undefined);
  const markerRef = useRef<Marker | null>(null);
  const posRef = useRef(home);
  const veilRef = useRef({ radiusM: veilRadiusM, on: veilAlpha > 0 });
  veilRef.current = { radiusM: veilRadiusM, on: veilAlpha > 0 };
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  // The veil rides the pin: rebuilt wherever the pin is set.
  const place = (lat: number, lng: number) => {
    posRef.current = { lat, lng };
    markerRef.current?.setLngLat([lng, lat]);
    const v = veilRef.current;
    if (v.on) setData(map, VEIL_SRC, veilBands(lat, lng, v.radiusM));
    moveRef.current?.(lat, lng);
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
      if (!target || c.held) return;
      const dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 1 / 60;
      c.last = now;
      const center = map.getCenter();
      const tp = map.project([target.lng, target.lat]);
      const cp = map.project(center);
      if (Math.hypot(tp.x - cp.x, tp.y - cp.y) <= CAMERA_SETTLE_PX) {
        // Settled. Mid-glide the target keeps moving and kicks the loop
        // again; after arrival the chase is done.
        c.last = 0;
        if (!c.gliding) c.target = null;
        return;
      }
      const k = chaseStep(dt);
      map.jumpTo({
        center: [center.lng + (target.lng - center.lng) * k, center.lat + (target.lat - center.lat) * k],
      });
      c.raf = requestAnimationFrame(frame);
    };
    c.kick = () => {
      if (!c.raf && !c.held) c.raf = requestAnimationFrame(frame);
    };
    // Only gestures carry `originalEvent`; our own jumpTo does not.
    const onStart = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return;
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

  // The pin hangs above the point it marks, so in a dense block it can cover a
  // POI just north of the player. It never takes pointer events, so the fade
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
      // Footprint relative to the anchor (the tip): 30px wide, 36px tall above it.
      el.classList.toggle('is-faded', dx > -16 && dx < 16 && dy > -38 && dy < 4);
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
  home: { lat: number; lng: number };
  pois: Poi[];
  selectedId: string | null;
  /** id of the location the player is standing at (live data), if any */
  hereId: string | null;
  /** inner ring: how far the survivor can comfortably travel right now */
  travelRange: number;
  /** outer ring: the rested, unhindered range. Drives fog and 3D building rise. */
  maxTravelRange: number;
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
  /** Desktop HUD: px of headroom the floating here card needs above the pin. */
  padTop?: number;
  /** The loaded map, for chrome that follows it (null when it goes away). */
  onMap?: (map: MlMap | null) => void;
  /** Every move of the player pin, glide included. */
  onPinMove?: (lat: number, lng: number) => void;
  /** Desktop HUD: px the map's own top-right buttons shift left (timeline / ticker). */
  chromeRight?: number;
  /** Island view: the whole island in frame (the rail's island-front button). */
  islandView?: boolean;
  /** Island view ended by the map itself (zoomed back in by hand). */
  onIslandViewExit?: () => void;
  /** The 3D / rail toggles on the map itself. Desktop moves them to the rail. */
  showModeToggles?: boolean;
  onSelect: (poi: Poi) => void;
  onPickGround: (lat: number, lng: number) => void;
}

/** External request to look at a lat/lng (stash logbook, etc.). */
function FocusCamera({ target }: { target: { lat: number; lng: number; token: number } | null | undefined }) {
  const map = useMapGL();
  useEffect(() => {
    if (!target) return;
    map.easeTo({ center: [target.lng, target.lat], duration: 750 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, target?.token, target?.lat, target?.lng]);
  return null;
}

interface SavedCamera {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

/**
 * Island view: pull back until the whole island fits, so the island front
 * reads at once; leaving it flies back to the view you had. Zooming in past
 * the island overlay by hand also ends the mode.
 * Moves are `essential` so MapLibre follows the game's Reduce motion setting
 * rather than second-guessing it with the OS flag.
 */
function IslandCamera({ on, onExit }: { on: boolean; onExit?: () => void }) {
  const map = useMapGL();
  const reduced = useReducedMotion();
  const saved = useRef<SavedCamera | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const toggled = !first.current;
    first.current = false;
    if (!toggled) return;
    const duration = reduced ? 0 : 1400;
    if (on) {
      const c = map.getCenter();
      saved.current = { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
      const cam = map.cameraForBounds(
        [
          [SG_BOX.west, SG_BOX.south],
          [SG_BOX.east, SG_BOX.north],
        ],
        { padding: 24, bearing: map.getBearing(), pitch: map.getPitch() },
      );
      if (!cam) return;
      map.flyTo({ ...cam, pitch: map.getPitch(), duration, curve: 1.2, essential: true });
      return;
    }
    const back = saved.current;
    saved.current = null;
    if (!back) return;
    // The 3D toggle may have changed while out at island level; keep the pitch it set.
    map.flyTo({ center: back.center, zoom: back.zoom, bearing: back.bearing, pitch: map.getPitch(), duration, curve: 1.2, essential: true });
  }, [map, on, reduced]);

  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  useMapEvent('zoomend', () => {
    if (on && map.getZoom() >= ISLAND_STATUS_ZOOM) {
      saved.current = null;
      exitRef.current?.();
    }
  });
  return null;
}

/**
 * Desktop HUD: keep the camera's centre in the part of the map the chrome
 * leaves open, so following the pin and focus pans land where you can see
 * them. A chase-camera jump can cut an ease short, so the padding is re-set
 * once the camera settles.
 */
function CameraInset({ top, left, right, bottom }: { top: number; left: number; right: number; bottom: number }) {
  const map = useMapGL();
  useEffect(() => {
    const padding = { top, left, right, bottom };
    map.easeTo({ padding, duration: 400 });
    const settle = () => {
      const p = map.getPadding();
      if (p.top !== top || p.left !== left || p.right !== right || p.bottom !== bottom) map.setPadding(padding);
    };
    map.once('moveend', settle);
    return () => {
      map.off('moveend', settle);
    };
  }, [map, top, left, right, bottom]);
  return null;
}

/** Hands the loaded map to whoever hosts the screen (and takes it back). */
function MapHandle({ onMap }: { onMap: (map: MlMap | null) => void }) {
  const map = useMapGL();
  useEffect(() => {
    onMap(map);
    return () => onMap(null);
  }, [map, onMap]);
  return null;
}

const TRAIL_DONE = 'trail-done';
const TRAIL_AHEAD = 'trail-ahead';
const TRAIL_PREVIEW = 'trail-preview';

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
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(
    () =>
      installOverlay(map, 'trail', { [TRAIL_DONE]: 'geojson', [TRAIL_AHEAD]: 'geojson', [TRAIL_PREVIEW]: 'geojson' }, [
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
          paint: { 'line-color': '#9ad7eb', 'line-width': 3, 'line-opacity': 0.9 },
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
    const { startedAt, durationMs } = travelAnim;
    const tick = () => {
      const t = Math.min(1, (Date.now() - startedAt) / durationMs);
      const e = travelEase(t);
      const done = pathUntil(path, e);
      const rest = pathFromProgress(path, e);
      setData(map, TRAIL_DONE, done.length >= 2 ? fc([lineFeature(done)]) : EMPTY_FC);
      const ahead = rest.length >= 2 ? rest : [done[done.length - 1] ?? path[0], path[path.length - 1]];
      setData(map, TRAIL_AHEAD, fc([lineFeature(ahead)]));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [map, path, travelAnim, blocked]);

  return null;
}

/**
 * The planning rings. Outer, solid and faint: the max travel range, the edge
 * of what the map shows. Inner, dashed: how far you can push on this energy.
 * Ground past the inner ring is shaded, so the walkable disc reads brighter.
 * Non-interactive: taps inside are ground picks.
 */
const RangeRing = memo(function RangeRing({
  home,
  travelRange,
  maxRange,
}: {
  home: { lat: number; lng: number };
  travelRange: number;
  maxRange: number;
}) {
  const map = useMapGL();
  useEffect(
    () =>
      installOverlay(map, 'ring', { 'reach-shade-src': 'geojson', 'range-max-src': 'geojson', 'range-src': 'geojson' }, [
        {
          id: 'reach-shade',
          type: 'fill',
          source: 'reach-shade-src',
          paint: { 'fill-color': FOG_COLOUR, 'fill-opacity': REACH_SHADE, 'fill-antialias': false },
        },
        { id: 'range-fill', type: 'fill', source: 'range-src', paint: { 'fill-color': '#e8e5dd', 'fill-opacity': 0.03 } },
        {
          id: 'range-max-line',
          type: 'line',
          source: 'range-max-src',
          paint: { 'line-color': '#e8e5dd', 'line-width': 1, 'line-opacity': 0.34 },
        },
        {
          id: 'range-line',
          type: 'line',
          source: 'range-src',
          paint: { 'line-color': '#e8e5dd', 'line-width': 1.5, 'line-opacity': 1, 'line-dasharray': [2.7, 4] },
        },
      ]),
    [map],
  );
  useEffect(() => {
    const on = travelRange > 0;
    setData(map, 'range-src', on ? fc([circleFeature(home.lat, home.lng, travelRange, {}, 96)]) : EMPTY_FC);
    setData(map, 'reach-shade-src', reachShade(home.lat, home.lng, travelRange));
  }, [map, home.lat, home.lng, travelRange]);
  useEffect(() => {
    setData(map, 'range-max-src', maxRange > 0 ? fc([circleFeature(home.lat, home.lng, maxRange, {}, 96)]) : EMPTY_FC);
  }, [map, home.lat, home.lng, maxRange]);
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
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'fop'] },
        },
        {
          id: 'hazard-line-dash',
          type: 'line',
          source: 'hazard-src',
          filter: ['!', ['get', 'onPath']],
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
          filter: ['get', 'onPath'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'op'] },
        },
      ]),
    [map],
  );

  useEffect(() => {
    const features: Feature[] = [];
    for (const blob of hazardBlobDrawList(hazards, pathIds)) {
      const night = blob.kind === 'night_swarm';
      const props = {
        color: HAZARD_CONFIG[blob.kind].color,
        onPath: blob.onPath,
        fop: night ? 0.16 + blob.severity * 0.05 : blob.onPath ? 0.14 + blob.severity * 0.05 : 0.1 + blob.severity * 0.04,
        w: blob.onPath ? 2 : night ? 1.5 : 1.25,
        op: blob.onPath ? 0.9 : 0.5 + blob.severity * 0.12,
      };
      for (const ring of blob.rings) {
        if (ring.length < 3) continue;
        features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [toLngLatRing(ring)] } });
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
  if (vis === 'detected') {
    return {
      poi,
      icon: unknownIcon(),
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
const NO_ROOFS: ReadonlyMap<string, number> = new Map();

const PoiLayer = memo(
  function PoiLayer({ pois, home, blipRange, selectedId, hereId, onSelect, engine, worked, evacZoneId }: PoiLayerProps) {
    const map = useMapGL();
    const box = usePaddedBounds();
    const [detail, setDetail] = useState(() => map.getZoom() >= POI_DETAIL_ZOOM);
    // Only crossing the detail boundary re-renders React during a zoom. The
    // circle layer's maxzoom follows the camera directly between those crossings.
    useMapEvent('zoom', () => {
      const next = map.getZoom() >= POI_DETAIL_ZOOM;
      if (next !== detail) setDetail(next);
    });

    const keepBadge = (poi: Poi) =>
      poi.id === selectedId || poi.id === hereId || beaconKindOf(poi, evacZoneId) !== null;

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

    useEffect(
      () =>
        installOverlay(map, 'poi', { 'poi-src': 'geojson', 'poi-dots-src': 'geojson' }, [
          {
            id: POI_FILL_LAYER,
            type: 'fill',
            source: 'poi-src',
            paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['get', 'fop'] },
          },
          {
            id: 'poi-line',
            type: 'line',
            source: 'poi-src',
            filter: ['!', ['get', 'dashed']],
            paint: { 'line-color': ['get', 'line'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'lop'] },
          },
          {
            id: 'poi-line-dash',
            type: 'line',
            source: 'poi-src',
            filter: ['get', 'dashed'],
            paint: {
              'line-color': ['get', 'line'],
              'line-width': ['get', 'w'],
              'line-opacity': ['get', 'lop'],
              'line-dasharray': [2.7, 2],
            },
          },
          {
            id: POI_DOT_LAYER,
            type: 'circle',
            source: 'poi-dots-src',
            maxzoom: POI_DETAIL_ZOOM,
            filter: ['!', ['get', 'badge']],
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, POI_DETAIL_ZOOM, 6],
              'circle-color': ['get', 'fill'],
              'circle-opacity': ['get', 'opacity'],
              'circle-stroke-color': ['get', 'line'],
              'circle-stroke-width': 1.5,
              'circle-stroke-opacity': ['get', 'opacity'],
            },
          },
        ]),
      [map],
    );

    const byId = useRef(new Map<string, Poi>());
    useEffect(() => {
      const features: Feature[] = [];
      const dots: Feature[] = [];
      byId.current = new Map();
      for (const l of looks) {
        byId.current.set(l.poi.id, l.poi);
        // Share the same visibility/cap and remembered colours as full badges.
        // Never put an undiscovered, out-of-sight site in this source.
        dots.push({
          type: 'Feature',
          properties: {
            id: l.poi.id,
            fill: l.outline?.fill ?? l.color3d,
            line: l.outline?.line ?? l.color3d,
            opacity: l.opacity,
            badge: l.poi.id === selectedId || l.poi.id === hereId || beaconKindOf(l.poi, evacZoneId) !== null,
          },
          geometry: { type: 'Point', coordinates: [l.poi.lng, l.poi.lat] },
        });
        const ring = l.poi.outline;
        if (!l.outline || !ring || ring.length < 3) continue;
        features.push({ type: 'Feature', properties: l.outline, geometry: { type: 'Polygon', coordinates: [toLngLatRing(ring)] } });
      }
      setData(map, 'poi-src', fc(features));
      setData(map, 'poi-dots-src', fc(dots));
    }, [map, looks, selectedId, hereId, evacZoneId]);

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
        useGame.getState().setSiteRoofs(r);
      };
      publish(engine.roofHeights());
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
        {looks.filter((l) => detail || keepBadge(l.poi)).map((l) => (
          <MapMarker
            key={l.poi.id}
            lat={l.poi.lat}
            lng={l.poi.lng}
            icon={l.icon}
            opacity={l.opacity}
            roof={engine ? roofs.get(l.poi.id) ?? 0 : 0}
            ring={l.poi.id === selectedId}
            zIndex={l.poi.id === selectedId ? 10 : undefined}
            beacon={engine ? beaconKindOf(l.poi, evacZoneId) : null}
            onClick={() => onSelect(l.poi)}
          />
        ))}
      </>
    );
  },
  (prev, next) =>
    prev.home === next.home &&
    prev.blipRange === next.blipRange &&
    prev.selectedId === next.selectedId &&
    prev.hereId === next.hereId &&
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
 * crossing. `blipRange` is the stable sensing radius — do not pass the
 * travel-ring tween in here or every marker rememos for 600 ms after a walk.
 */
function GameMapInner({
  home,
  pois,
  selectedId,
  hereId,
  travelRange,
  maxTravelRange,
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
  onMap,
  onPinMove,
  chromeRight = 0,
  islandView = false,
  onIslandViewExit,
  showModeToggles = true,
  onSelect,
  onPickGround,
}: Props) {
  const { t } = useT();
  const evacPoi = evacZoneId ? pois.find((p) => p.id === evacZoneId) : null;
  // Tween lives here so GameScreen does not re-render at 60 fps after travel.
  // The outer ring only moves when the build or gear changes; the inner one
  // follows energy and can never pass it.
  const ringMax = useAnimatedNumber(Math.max(maxTravelRange, travelRange), 600);
  const ringRange = Math.min(useAnimatedNumber(travelRange, 600), ringMax);
  const fogRevealRadius = useThrottledNumber(ringMax, 80);
  const reachRadius = useThrottledNumber(ringRange, 80);
  const pathIdSet = useMemo(() => new Set(pathHazardIds), [pathHazardIds]);
  const view3d = useSetting('mapView3d') === 'on';
  const inBlock = useGame((s) => !!s.hdb);
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
  const destroyedTunnelEdges = useGame((s) => s.destroyedTunnelEdges);
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
    <div className="relative h-full w-full">
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
        <FocusCamera target={focusTarget} />
        <IslandCamera on={islandView} onExit={onIslandViewExit} />
        {!(view3d && inBlock) && <CameraInset top={padTop} left={padLeft} right={padRight} bottom={padBottom} />}
        {onMap && <MapHandle onMap={onMap} />}
        <Camera3d on={view3d} />
        {!(view3d && inBlock) && <KeyboardCamera home={home} />}
        {view3d && <Atmosphere3d kind={weather} time={time} dom={weatherDom} />}
        <GroundPicker onPick={onPickGround} engine={engine} onSite={selectSite} />
        {/* Soft-cost forest wash — under fog so only explored ground shows green. */}
        <VegetationOverlay />
        {/* Outside the island disc the world fades to black. */}
        <EdgeVignette />
        {/* Fog + 3D buildings. Overlays draw by slot, not mount order. */}
        <SightLayers
          home={home}
          travelAnim={travelAnim}
          exploredArea={exploredArea}
          maxRange={fogRevealRadius}
          reach={reachRadius}
          ringReach={ringRange}
          ringMax={ringMax}
          view3d={view3d}
          onEngine={setEngine}
        />
        <NeighbourhoodWash />

        {/* Drawn under the pins — ground, not a destination. */}
        <HazardRings hazards={hazards} pathIds={pathIdSet} />

        <TravelPath path={travelPath} travelAnim={travelAnim} blocked={!!travelPathBlocked} />

        {trekTarget && <MapMarker lat={trekTarget.lat} lng={trekTarget.lng} icon={trekTargetIcon()} zIndex={800} />}

        <PoiLayer
          pois={pois}
          home={home}
          blipRange={blipRange}
          selectedId={selectedId}
          hereId={hereId}
          onSelect={onSelect}
          engine={engine}
          worked={worked}
          evacZoneId={evacZoneId}
        />
        <BlockView engine={engine} pois={pois} pad={`${padTop}:${padLeft}:${padRight}:${padBottom}`} />

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
          travelAnim={travelAnim}
          veilRadiusM={veilRadiusM}
          veilAlpha={veilAlpha}
          onMove={onPinMove}
        />
        {showMrt && net && <MrtOverlay net={net} destroyedEdges={destroyedTunnelEdges} />}
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
          <MrtLineLegend net={net} destroyedCount={destroyedTunnelEdges.length} />
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

