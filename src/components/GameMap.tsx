import { MapContainer, TileLayer, Marker, Circle, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import type { Poi, TimeOfDay, WeatherKind, MapAnnotation } from '../game/types';
import { WeatherFx } from './WeatherFx';
import { TimeOfDayFx } from './TimeOfDayFx';
import { poiIcon, playerIcon, unknownIcon, evacIcon, dangerColor, rumourIcon } from './mapIcons';
import {
  TILE_ATTRIBUTION,
  TILE_MAX_NATIVE_ZOOM,
  TILE_SUBDOMAINS,
  TILE_URL,
} from './tileConfig';
import { POI_CONFIG } from '../game/poi';
import { FACTION_CONFIG } from '../game/factions';
import { haversine } from '../game/overpass';
import { visibilityOf } from '../game/fog';
import { FogOverlay } from './FogOverlay';
import type { ExploredCircle } from '../game/fog';
import type { TravelAnim } from '../game/store';
import { useGame } from '../game/store';
import type { NoisePulse } from '../game/noise';
import { HAZARD_CONFIG, type HazardZone } from '../game/wilds';
import { hazardBlobDrawList } from '../game/hazardBlob';
import { NoiseWaves } from './NoiseWaves';
import { trekTargetIcon } from './mapIcons';
import { MrtOverlay, MrtLineLegend, useMrtNetwork } from './MrtOverlay';
import { VegetationOverlay } from './UnplayableOverlay';
import { NeighbourhoodWash } from './NeighbourhoodWash';
import { Icon } from '../icons/Icon';
import { pointAlongPath } from '../game/route';
import { useAnimatedNumber, useThrottledNumber } from '../hooks/useAnimatedNumber';
import { tip } from './tips';

// White outline for buildings you can see but haven't identified — stands out
// against the dark map like the "?" blips do.
const UNKNOWN_STROKE = '#e8e5dd';

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** How close to the viewport edge the walker gets before the camera follows,
 *  as a fraction of the map's shorter side. */
const FOLLOW_MARGIN = 0.28;

// The player's chosen zoom persists across the whole game (and future sessions)
// so moving around never snaps it back.
const ZOOM_KEY = 'singvive.mapZoom';
const DEFAULT_ZOOM = 15;
const MIN_ZOOM = 10;

/** Viewport pad + debounce: hidden/off-screen POIs must not become Leaflet layers. */
const VIEWPORT_PAD = 0.2;
const VIEWPORT_DEBOUNCE_MS = 100;
/** Steering budget. Dense HDB downtown may exceed it — keep nearest to centre. */
const MAX_POIS_ON_SCREEN = 450;

function usePaddedBounds() {
  const map = useMap();
  const [bounds, setBounds] = useState(() => map.getBounds().pad(VIEWPORT_PAD));
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      if (t != null) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        setBounds(map.getBounds().pad(VIEWPORT_PAD));
      }, VIEWPORT_DEBOUNCE_MS);
    };
    map.on('moveend', update);
    map.on('zoomend', update);
    return () => {
      map.off('moveend', update);
      map.off('zoomend', update);
      if (t != null) clearTimeout(t);
    };
  }, [map]);
  return bounds;
}

function loadZoom(): number {
  const raw = Number(localStorage.getItem(ZOOM_KEY));
  return Number.isFinite(raw) && raw >= MIN_ZOOM && raw <= 20 ? raw : DEFAULT_ZOOM;
}

function saveZoom(zoom: number): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

// Whether the rail network is drawn over the map. Like the zoom, this is a
// view preference and survives reloads.
const MRT_KEY = 'singvive.mrtOverlay';

function loadMrtPref(): boolean {
  return localStorage.getItem(MRT_KEY) === '1';
}

function saveMrtPref(on: boolean): void {
  try {
    localStorage.setItem(MRT_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** Remembers the player's zoom whenever they change it. */
function ZoomMemory() {
  useMapEvents({
    zoomend: (e) => saveZoom(e.target.getZoom()),
  });
  return null;
}

/**
 * Tapping bare map picks a spot to cross to on foot. Clicks that landed on a
 * marker or a building outline belong to that POI, not to the ground under it,
 * so they're filtered out here — Leaflet still bubbles vector clicks to the map.
 */
function GroundPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      const t = e.originalEvent.target as Element | null;
      if (t && typeof t.closest === 'function' && t.closest('.leaflet-marker-icon')) return;
      if (t && t.classList?.contains('leaflet-interactive')) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * The player's marker. When a `travelAnim` is active it glides along the
 * land route (or straight chord) and pans the camera to follow at the current
 * zoom; otherwise it sits at `home` and smoothly pans there on discrete jumps.
 */
function PlayerMarker({
  home,
  travelAnim,
}: {
  home: { lat: number; lng: number };
  travelAnim: TravelAnim | null;
}) {
  const map = useMap();
  const [pos, setPos] = useState(home);
  const rafRef = useRef<number | undefined>(undefined);
  const markerRef = useRef<L.Marker | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    if (!travelAnim) {
      setPos(home);
      posRef.current = home;
      markerRef.current?.setLatLng([home.lat, home.lng]);
      // Discrete move (spawn/MRT): follow at the current zoom, don't reset it.
      map.panTo([home.lat, home.lng], { animate: true, duration: 0.6 });
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
    // Drive the Leaflet marker imperatively during the glide so React does not
    // re-render every frame (costly on Firefox with many DivIcons). Sync React
    // state only at the start and end of the leg.
    const start = pointAlongPath(path, 0);
    setPos(start);
    posRef.current = start;
    markerRef.current?.setLatLng([start.lat, start.lng]);

    const tick = () => {
      const t = Math.min(1, (Date.now() - startedAt) / durationMs);
      const e = easeInOut(t);
      const { lat, lng } = pointAlongPath(path, e);
      posRef.current = { lat, lng };
      markerRef.current?.setLatLng([lat, lng]);

      // Panning repositions every marker, fog tile and vector on the map, so
      // it must not run per frame. Follow only once the walker has drifted
      // near the edge of the viewport — inside the middle of the screen the
      // camera can simply hold still.
      const p = map.latLngToContainerPoint([lat, lng]);
      const size = map.getSize();
      const margin = Math.min(size.x, size.y) * FOLLOW_MARGIN;
      if (
        p.x < margin ||
        p.y < margin ||
        p.x > size.x - margin ||
        p.y > size.y - margin
      ) {
        map.panTo([lat, lng], { animate: false });
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPos({ lat, lng });
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [travelAnim, home, map]);

  // The pin hangs above the point it marks, so in a dense block it can cover a
  // POI just north of the player. It is non-interactive, so it never steals a
  // click — but it still hides things, so fade it out whenever the cursor is
  // inside its footprint. The listener goes on the container natively rather
  // than through Leaflet's mousemove: markers sitting under the cursor would
  // otherwise swallow the event and the pin would stay opaque exactly when it
  // is in the way.
  useEffect(() => {
    const container = map.getContainer();
    const onMove = (e: MouseEvent) => {
      const el = markerRef.current?.getElement();
      if (!el) return;
      const rect = container.getBoundingClientRect();
      const p = map.latLngToContainerPoint([posRef.current.lat, posRef.current.lng]);
      const dx = e.clientX - rect.left - p.x;
      const dy = e.clientY - rect.top - p.y;
      // Footprint relative to the anchor (the tip): 30px wide, 36px tall above it.
      const over = dx > -16 && dx < 16 && dy > -38 && dy < 4;
      el.classList.toggle('is-faded', over);
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

  return (
    <Marker
      ref={markerRef}
      position={[pos.lat, pos.lng]}
      icon={playerIcon()}
      interactive={false}
      zIndexOffset={1000}
    />
  );
}

interface Props {
  home: { lat: number; lng: number };
  pois: Poi[];
  selectedId: string | null;
  /** id of the location the player is standing at (live data), if any */
  hereId: string | null;
  /** planning ring: how far the survivor can comfortably travel right now */
  travelRange: number;
  /** how far out anonymous "?" blips are sensed */
  blipRange: number;
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
  onSelect: (poi: Poi) => void;
  onPickGround: (lat: number, lng: number) => void;
}

/** External request to look at a lat/lng (stash logbook, etc.). */
function FocusCamera({
  target,
}: {
  target: { lat: number; lng: number; token: number } | null | undefined;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.panTo([target.lat, target.lng], { animate: true, duration: 0.75 });
  }, [map, target?.token, target?.lat, target?.lng]);
  return null;
}

/**
 * Keeps Leaflet's idea of the viewport honest. On mobile the map column is a
 * tab: an event or a fight yanks the player to the Timeline, which sets
 * `display:none` on this whole column and leaves Leaflet believing the map is
 * still the size it was. Coming back, it has to be told otherwise or the tiles
 * and the fog re-lay-out visibly.
 */
function SizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const obs = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) map.invalidateSize({ animate: false });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [map]);
  return null;
}

/** The planning ring. Split out so a parent re-render can't restyle it. */
const RangeRing = memo(function RangeRing({
  home,
  travelRange,
}: {
  home: { lat: number; lng: number };
  travelRange: number;
}) {
  return (
    <Circle
      center={[home.lat, home.lng]}
      radius={travelRange}
      interactive={false}
      pathOptions={{ color: '#e8e5dd', weight: 1.5, fillOpacity: 0.03, dashArray: '4 6' }}
    />
  );
});

/** Hazard pockets you can sense. Nearby same-kind discs fuse into one blob. */
const HazardRings = memo(function HazardRings({
  hazards,
  pathIds,
}: {
  hazards: HazardZone[];
  pathIds: ReadonlySet<string>;
}) {
  const blobs = hazardBlobDrawList(hazards, pathIds);
  return (
    <>
      {blobs.flatMap((blob) => {
        const cfg = HAZARD_CONFIG[blob.kind];
        const night = blob.kind === 'night_swarm';
        const fill = night
          ? 0.16 + blob.severity * 0.05
          : blob.onPath
            ? 0.14 + blob.severity * 0.05
            : 0.1 + blob.severity * 0.04;
        return blob.rings.map((ring, i) => (
          <Polygon
            key={`${blob.key}:${i}`}
            positions={ring}
            interactive={false}
            pathOptions={{
              color: cfg.color,
              weight: blob.onPath ? 2 : night ? 1.5 : 1.25,
              opacity: blob.onPath ? 0.9 : 0.5 + blob.severity * 0.12,
              dashArray: blob.onPath ? undefined : '3 5',
              fillColor: cfg.color,
              fillOpacity: fill,
              lineJoin: 'round',
              lineCap: 'round',
            }}
          />
        ));
      })}
    </>
  );
});

interface PoiLayerProps {
  pois: Poi[];
  home: { lat: number; lng: number };
  blipRange: number;
  selectedId: string | null;
  hereId: string | null;
  onSelect: (poi: Poi) => void;
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
      // Compared at both `here` settings so the memo holds regardless of which
      // one this location is rendered at.
      Math.round(ringDanger(a, true)) === Math.round(ringDanger(b, true)) &&
      Math.round(ringDanger(a, false)) === Math.round(ringDanger(b, false)) &&
      a.lastSeen === b.lastSeen)
  );
}

const PoiLayer = memo(
  function PoiLayer({ pois, home, blipRange, selectedId, hereId, onSelect }: PoiLayerProps) {
    const bounds = usePaddedBounds();
    const drawn = useMemo(() => {
      const inView: Poi[] = [];
      for (const poi of pois) {
        if (!bounds.contains([poi.lat, poi.lng])) continue;
        const d = haversine(home.lat, home.lng, poi.lat, poi.lng);
        if (visibilityOf(poi, d, blipRange) === 'hidden') continue;
        inView.push(poi);
      }
      if (inView.length <= MAX_POIS_ON_SCREEN) return inView;
      const c = bounds.getCenter();
      return inView
        .map((p) => ({ p, d: haversine(c.lat, c.lng, p.lat, p.lng) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_POIS_ON_SCREEN)
        .map((x) => x.p);
    }, [pois, bounds, home.lat, home.lng, blipRange]);

    return (
      <>
        {drawn.map((poi) => {
          const d = haversine(home.lat, home.lng, poi.lat, poi.lng);
          const vis = visibilityOf(poi, d, blipRange);

          const selected = selectedId === poi.id;

          // Sensed but unidentified: the building outline still shows (in
          // neutral), capped with a "?" badge. Locations without an outline are
          // just the badge.
          if (vis === 'detected') {
            return (
              <Fragment key={poi.id}>
                {poi.outline && (
                  <Polygon
                    positions={poi.outline}
                    eventHandlers={{ click: () => onSelect(poi) }}
                    pathOptions={{
                      color: UNKNOWN_STROKE,
                      weight: selected ? 2.5 : 1.5,
                      dashArray: '4 3',
                      fillColor: UNKNOWN_STROKE,
                      fillOpacity: selected ? 0.22 : 0.14,
                      opacity: 0.95,
                    }}
                  />
                )}
                <Marker
                  position={[poi.lat, poi.lng]}
                  icon={unknownIcon()}
                  eventHandlers={{ click: () => onSelect(poi) }}
                  opacity={selected ? 1 : 0.85}
                />
              </Fragment>
            );
          }

          // Visited: live data only while standing here, otherwise last-known memory.
          const here = poi.id === hereId;
          const mem = poi.lastSeen;
          const danger = ringDanger(poi, here);
          const exhausted = here ? poi.exhausted : mem?.exhausted ?? poi.exhausted;
          const factionRevealed = here
            ? poi.isFactionRevealed
            : mem?.isFactionRevealed ?? poi.isFactionRevealed;
          const display: Poi = {
            ...poi,
            currentDanger: danger,
            exhausted,
            isFactionRevealed: factionRevealed,
          };
          const heldRing =
            factionRevealed && poi.factionId && !poi.isFactionOutpost
              ? FACTION_CONFIG[poi.factionId].color
              : null;
          const ring = exhausted ? '#555' : heldRing ?? dangerColor(Math.round(danger));

          return (
            <Fragment key={poi.id}>
              {poi.outline && (
                <Polygon
                  positions={poi.outline}
                  eventHandlers={{ click: () => onSelect(poi) }}
                  pathOptions={{
                    color: ring,
                    weight: selected ? 2.5 : heldRing ? 2 : 1,
                    fillColor: POI_CONFIG[poi.category].color,
                    fillOpacity: exhausted ? 0.1 : selected ? 0.5 : here ? 0.35 : 0.18,
                    opacity: here ? 1 : heldRing ? 0.75 : 0.65,
                  }}
                />
              )}
              <Marker
                position={[poi.lat, poi.lng]}
                icon={poiIcon(display)}
                eventHandlers={{ click: () => onSelect(poi) }}
                opacity={here ? 1 : 0.55}
              />
            </Fragment>
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
    prev.onSelect === next.onSelect &&
    prev.pois.length === next.pois.length &&
    prev.pois.every((p, i) => poiLooksSame(p, next.pois[i])),
);

const RumourLayer = memo(function RumourLayer({
  annotations,
}: {
  annotations: MapAnnotation[];
}) {
  const bounds = usePaddedBounds();
  const drawn = useMemo(() => {
    const inView: MapAnnotation[] = [];
    for (const ann of annotations) {
      if (!bounds.contains([ann.lat, ann.lng])) continue;
      inView.push(ann);
    }
    return inView;
  }, [annotations, bounds]);

  return (
    <>
      {drawn.map((ann) => (
        <Marker
          key={ann.id}
          position={[ann.lat, ann.lng]}
          icon={rumourIcon()}
          zIndexOffset={650}
          interactive={false}
          opacity={0.9}
        />
      ))}
    </>
  );
});

/**
 * Viewport-cull + `poiLooksSame`: hidden and off-screen POIs must not become
 * Leaflet layers. Mapping the whole `locations` dict does not scale with an
 * island crossing. `blipRange` is the stable sensing radius — do not pass the
 * travel-ring tween in here or every marker rememos for 600 ms after a walk.
 */
function GameMapInner({
  home,
  pois,
  selectedId,
  hereId,
  travelRange,
  blipRange,
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
  onSelect,
  onPickGround,
}: Props) {
  const evacPoi = evacZoneId ? pois.find((p) => p.id === evacZoneId) : null;
  // Tween lives here so GameScreen does not re-render at 60 fps after travel.
  const ringRange = useAnimatedNumber(travelRange, 600);
  const fogRevealRadius = useThrottledNumber(ringRange, 80);
  const pathIdSet = useMemo(() => new Set(pathHazardIds), [pathHazardIds]);

  // The rail network is a separate file, fetched the first time the player asks
  // to see it (or already in memory, if the world build got there first).
  const [showMrt, setShowMrt] = useState(loadMrtPref);
  const net = useMrtNetwork(showMrt);
  const destroyedTunnelEdges = useGame((s) => s.destroyedTunnelEdges);

  const toggleMrt = () => {
    setShowMrt((on) => {
      saveMrtPref(!on);
      return !on;
    });
  };

  return (
    <div className="relative h-full w-full">
    <MapContainer
      center={[home.lat, home.lng]}
      zoom={loadZoom()}
      minZoom={MIN_ZOOM}
      preferCanvas
      className="h-full w-full"
      style={{ background: '#08080a' }}
      zoomControl={false}
    >
      <ZoomMemory />
      <SizeWatcher />
      <FocusCamera target={focusTarget} />
      <GroundPicker onPick={onPickGround} />
      <TileLayer
        className="apoc-tiles"
        attribution={TILE_ATTRIBUTION}
        url={TILE_URL}
        subdomains={TILE_SUBDOMAINS}
        maxZoom={20}
        maxNativeZoom={TILE_MAX_NATIVE_ZOOM}
      />
      {/* Soft-cost forest wash — under fog so only explored ground shows green. */}
      <VegetationOverlay />
      <FogOverlay
        exploredArea={exploredArea}
        currentRevealCenter={home}
        currentRevealRadius={fogRevealRadius}
      />
      <NeighbourhoodWash />

      {/* Travelable range — a planning ring, not vision. Must stay
          non-interactive: its fill covers everywhere you can actually walk, so
          a hit-testable ring would swallow every ground-pick inside your own
          range and leave only out-of-range taps working. */}
      <RangeRing home={home} travelRange={ringRange} />

      {/* Drawn under the pins — ground, not a destination. */}
      <HazardRings hazards={hazards} pathIds={pathIdSet} />

      {travelPath && travelPath.length >= 2 && (
        <Polyline
          positions={travelPath.map((p) => [p.lat, p.lng] as [number, number])}
          interactive={false}
          pathOptions={{
            color: travelPathBlocked ? '#d92d2d' : '#7ec8e3',
            weight: 2.5,
            opacity: travelPathBlocked ? 0.85 : 0.75,
            dashArray: travelPathBlocked ? '4 8' : '8 10',
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}

      {trekTarget && (
        <Marker
          position={[trekTarget.lat, trekTarget.lng]}
          icon={trekTargetIcon()}
          zIndexOffset={800}
          interactive={false}
        />
      )}

      <PoiLayer
        pois={pois}
        home={home}
        blipRange={blipRange}
        selectedId={selectedId}
        hereId={hereId}
        onSelect={onSelect}
      />

      {mapAnnotations.length > 0 && (
        <RumourLayer annotations={mapAnnotations} />
      )}

      {/* extraction beacon — always visible so the goal is never lost */}
      {evacPoi && (
        <Marker
          position={[evacPoi.lat, evacPoi.lng]}
          icon={evacIcon()}
          zIndexOffset={900}
          eventHandlers={{ click: () => onSelect(evacPoi) }}
        />
      )}

      <NoiseWaves pulses={noisePulses} />
      <PlayerMarker home={home} travelAnim={travelAnim} />
      {showMrt && net && (
        <MrtOverlay net={net} destroyedEdges={destroyedTunnelEdges} />
      )}
    </MapContainer>

      {/* ---- rail network toggle + legend ---- */}
      <button
        onClick={toggleMrt}
        aria-pressed={showMrt}
        {...tip('Show the MRT & LRT network', { label: true })}
        className={`absolute right-2 top-2 z-[500] flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs font-semibold shadow-signage transition-colors ${
          showMrt
            ? 'border-astral/50 bg-astral/20 text-astral'
            : 'border-white/15 bg-concrete-900/95 text-white/60 hover:text-white/90'
        }`}
      >
        <Icon name="action.mrt" size={14} /> Rail map
      </button>

      {showMrt && net && (
        <div className="absolute right-2 top-11 z-[500]">
          <MrtLineLegend net={net} destroyedCount={destroyedTunnelEdges.length} />
        </div>
      )}

      {/* ---- the sky, over everything on the map but under the chrome ---- */}
      <WeatherFx kind={weather} time={time} />
      <TimeOfDayFx time={time} />

      {/* ---- diegetic vignettes: the frame tells you how bad it is ---- */}
      {vitals.infected && (
        <div className="vignette-infection pointer-events-none absolute inset-0 z-[450]" />
      )}
      {vitals.exhausted && (
        <div className="vignette-fatigue pointer-events-none absolute inset-0 z-[450]" />
      )}
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
