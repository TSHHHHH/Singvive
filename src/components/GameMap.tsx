import { MapContainer, TileLayer, Marker, Circle, Polygon, useMap, useMapEvents } from 'react-leaflet';
import { Fragment, memo, useCallback, useEffect, useRef, useState } from 'react';
import type L from 'leaflet';
import type { Poi, TimeOfDay, WeatherKind } from '../game/types';
import { WeatherFx } from './WeatherFx';
import { poiIcon, playerIcon, unknownIcon, evacIcon, dangerColor } from './mapIcons';
import {
  TILE_ATTRIBUTION,
  TILE_MAX_NATIVE_ZOOM,
  TILE_SUBDOMAINS,
  TILE_URL,
} from './tileConfig';
import { POI_CONFIG } from '../game/poi';
import { haversine } from '../game/overpass';
import { visibilityOf } from '../game/fog';
import { FogOverlay } from './FogOverlay';
import type { ExploredCircle } from '../game/fog';
import type { TravelAnim } from '../game/store';
import type { NoisePulse } from '../game/noise';
import { HAZARD_CONFIG, type HazardZone } from '../game/wilds';
import { NoiseWaves } from './NoiseWaves';
import { trekTargetIcon } from './mapIcons';
import { MrtOverlay, legendLines, useMrtNetwork } from './MrtOverlay';
import { Icon } from '../icons/Icon';

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

function loadZoom(): number {
  const raw = Number(localStorage.getItem(ZOOM_KEY));
  return Number.isFinite(raw) && raw >= 11 && raw <= 20 ? raw : DEFAULT_ZOOM;
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
 * The player's marker. When a `travelAnim` is active it glides from origin to
 * destination and pans the camera to follow at the current zoom; otherwise it
 * sits at `home` and smoothly pans there on discrete jumps (e.g. MRT).
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
      // Discrete move (spawn/MRT): follow at the current zoom, don't reset it.
      map.panTo([home.lat, home.lng], { animate: true, duration: 0.6 });
      return;
    }
    const { fromLat, fromLng, toLat, toLng, startedAt, durationMs } = travelAnim;
    const tick = () => {
      const t = Math.min(1, (Date.now() - startedAt) / durationMs);
      const e = easeInOut(t);
      const lat = fromLat + (toLat - fromLat) * e;
      const lng = fromLng + (toLng - fromLng) * e;
      setPos({ lat, lng });

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

      if (t < 1) rafRef.current = requestAnimationFrame(tick);
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

/** Where a lat/lng currently sits in map-container pixels, plus the size of the
 *  container it sits in — enough for the caller to float something over it and
 *  keep that thing on screen. */
export interface MapPoint {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Reports where `anchor` currently is in container pixels, and keeps reporting
 * while the map moves. The card that points at it is rendered by the caller,
 * outside the Leaflet panes — Leaflet owns everything inside them, and a card
 * with buttons in it has no business being dragged around by the map.
 */
function AnchorTracker({
  anchor,
  onPoint,
}: {
  anchor: { lat: number; lng: number } | null;
  onPoint: (pt: MapPoint | null) => void;
}) {
  const map = useMap();
  const report = useCallback(() => {
    if (!anchor) {
      onPoint(null);
      return;
    }
    const p = map.latLngToContainerPoint([anchor.lat, anchor.lng]);
    const s = map.getSize();
    onPoint({ x: p.x, y: p.y, width: s.x, height: s.y });
  }, [anchor, map, onPoint]);

  // `move`/`zoom` (not just their -end twins) so the card tracks the marker
  // through a pan instead of snapping to it afterwards.
  useMapEvents({ move: report, zoom: report, resize: report });

  useEffect(() => {
    report();
    return () => onPoint(null);
  }, [report, onPoint]);

  return null;
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
  /** today's sky — drives the cosmetic weather overlay only */
  weather: WeatherKind;
  time: TimeOfDay;
  /** open-ground spot the player is considering crossing to */
  trekTarget: { lat: number; lng: number } | null;
  /** the spot the caller's floating target card points at, if any */
  bubbleAnchor: { lat: number; lng: number } | null;
  /** where that spot currently is, in map-container pixels */
  onBubblePoint: (pt: MapPoint | null) => void;
  /** External camera nudge (e.g. stash logbook "Show on map"). Token forces re-pan. */
  focusTarget?: { lat: number; lng: number; token: number } | null;
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

/** Hazard pockets you can sense. Ground, not a destination — never clickable. */
const HazardRings = memo(function HazardRings({ hazards }: { hazards: HazardZone[] }) {
  return (
    <>
      {hazards.map((z) => {
        const cfg = HAZARD_CONFIG[z.kind];
        return (
          <Circle
            key={z.id}
            center={[z.lat, z.lng]}
            radius={z.radiusM}
            interactive={false}
            pathOptions={{
              color: cfg.color,
              weight: 1,
              opacity: 0.35 + z.severity * 0.12,
              dashArray: '3 5',
              fillColor: cfg.color,
              fillOpacity: 0.05 + z.severity * 0.035,
            }}
          />
        );
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
      // Compared at both `here` settings so the memo holds regardless of which
      // one this location is rendered at.
      Math.round(ringDanger(a, true)) === Math.round(ringDanger(b, true)) &&
      Math.round(ringDanger(a, false)) === Math.round(ringDanger(b, false)) &&
      a.lastSeen === b.lastSeen)
  );
}

const PoiLayer = memo(
  function PoiLayer({ pois, home, blipRange, selectedId, hereId, onSelect }: PoiLayerProps) {
    return (
      <>
        {pois.map((poi) => {
          const d = haversine(home.lat, home.lng, poi.lat, poi.lng);
          const vis = visibilityOf(poi, d, blipRange);
          if (vis === 'hidden') return null;

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
          const display: Poi = { ...poi, currentDanger: danger, exhausted };
          const ring = exhausted ? '#555' : dangerColor(Math.round(danger));

          return (
            <Fragment key={poi.id}>
              {poi.outline && (
                <Polygon
                  positions={poi.outline}
                  eventHandlers={{ click: () => onSelect(poi) }}
                  pathOptions={{
                    color: ring,
                    weight: selected ? 2.5 : 1,
                    fillColor: POI_CONFIG[poi.category].color,
                    fillOpacity: exhausted ? 0.1 : selected ? 0.5 : here ? 0.35 : 0.18,
                    opacity: here ? 1 : 0.65,
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

/**
 * Rendering the map means handing react-leaflet a Marker and a Polygon for
 * every visible POI, so a re-render is never cheap — it is memoised, and every
 * prop it takes is kept identity-stable by the caller where it can be. Where it
 * can't (`pois` is rebuilt whenever any location's bookkeeping changes, which
 * combat does constantly), the layers below compare on what they actually draw.
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
  weather,
  time,
  trekTarget,
  bubbleAnchor,
  onBubblePoint,
  focusTarget,
  onSelect,
  onPickGround,
}: Props) {
  const evacPoi = evacZoneId ? pois.find((p) => p.id === evacZoneId) : null;

  // The rail network is a separate file, fetched the first time the player asks
  // to see it (or already in memory, if the world build got there first).
  const [showMrt, setShowMrt] = useState(loadMrtPref);
  const net = useMrtNetwork(showMrt);

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
      preferCanvas
      className="h-full w-full"
      style={{ background: '#08080a' }}
      zoomControl={false}
    >
      <ZoomMemory />
      <SizeWatcher />
      <FocusCamera target={focusTarget} />
      <GroundPicker onPick={onPickGround} />
      <AnchorTracker anchor={bubbleAnchor} onPoint={onBubblePoint} />
      <TileLayer
        attribution={TILE_ATTRIBUTION}
        url={TILE_URL}
        subdomains={TILE_SUBDOMAINS}
        maxZoom={20}
        maxNativeZoom={TILE_MAX_NATIVE_ZOOM}
      />
      <FogOverlay
        exploredArea={exploredArea}
        currentRevealCenter={home}
        currentRevealRadius={travelRange}
      />

      {/* Travelable range — a planning ring, not vision. Must stay
          non-interactive: its fill covers everywhere you can actually walk, so
          a hit-testable ring would swallow every ground-pick inside your own
          range and leave only out-of-range taps working. */}
      <RangeRing home={home} travelRange={travelRange} />

      {/* Drawn under the pins — ground, not a destination. */}
      <HazardRings hazards={hazards} />

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
      {showMrt && net && <MrtOverlay net={net} />}
    </MapContainer>

      {/* ---- rail network toggle + legend ---- */}
      <button
        onClick={toggleMrt}
        aria-pressed={showMrt}
        title="Show the MRT & LRT network"
        className={`absolute right-2 top-2 z-[500] flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs font-semibold shadow-lg backdrop-blur transition-colors ${
          showMrt
            ? 'border-astral/50 bg-astral/20 text-astral'
            : 'border-white/15 bg-black/70 text-white/60 hover:text-white/90'
        }`}
      >
        <Icon name="action.mrt" size={14} /> Rail map
      </button>

      {showMrt && net && (
        <div className="absolute right-2 top-11 z-[500] max-w-[45vw] rounded border border-white/10 bg-black/80 p-2 text-2xs leading-tight text-white/70 shadow-lg backdrop-blur">
          {legendLines(net).map((line) => (
            <div key={line.code} className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 shrink-0 rounded"
                style={{ background: line.color }}
              />
              <span className="truncate">{line.name}</span>
            </div>
          ))}
          <div className="mt-1 border-t border-white/10 pt-1 text-white/35">
            OSM · baked {net.generatedAt}
          </div>
        </div>
      )}

      {/* ---- the sky, over everything on the map but under the chrome ---- */}
      <WeatherFx kind={weather} time={time} />

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
    if (k === 'pois' || k === 'noisePulses') continue;
    if (a[k] !== b[k]) return false;
  }
  if (a.pois.length !== b.pois.length) return false;
  if (!a.pois.every((p, i) => poiLooksSame(p, b.pois[i]))) return false;
  // Pulses are append-and-prune: same count and same newest id means same set.
  if (a.noisePulses.length !== b.noisePulses.length) return false;
  return a.noisePulses.every((p, i) => p.id === b.noisePulses[i].id);
}

export const GameMap = memo(GameMapInner, propsEqual);
