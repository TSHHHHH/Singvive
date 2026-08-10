import { MapContainer, TileLayer, Marker, Circle, Polygon, useMap, useMapEvents } from 'react-leaflet';
import { Fragment, memo, useEffect, useRef, useState } from 'react';
import type { Poi } from '../game/types';
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
import { trekTargetIcon } from './mapIcons';

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

  return <Marker position={[pos.lat, pos.lng]} icon={playerIcon()} zIndexOffset={1000} />;
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
  /** open-ground spot the player is considering crossing to */
  trekTarget: { lat: number; lng: number } | null;
  onSelect: (poi: Poi) => void;
  onPickGround: (lat: number, lng: number) => void;
}

/** Rings fade themselves out; this just drops them once they're done. */
function NoiseRings({ pulses }: { pulses: NoisePulse[] }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (pulses.length === 0) return;
    const t = setInterval(() => force((n) => n + 1), 300);
    return () => clearInterval(t);
  }, [pulses.length]);

  const now = Date.now();
  return (
    <>
      {pulses.map((p) => {
        const t = Math.min(1, (now - p.startedAt) / 1500);
        if (t >= 1) return null;
        return (
          <Circle
            key={p.id}
            center={[p.lat, p.lng]}
            radius={p.radiusMeters * (0.2 + 0.8 * t)}
            className="noise-ring"
            interactive={false}
            pathOptions={{
              color: '#d92d2d',
              weight: 3,
              opacity: 0.6 * (1 - t),
              fillOpacity: 0.05 * (1 - t),
              fillColor: '#d92d2d',
            }}
          />
        );
      })}
    </>
  );
}

/**
 * Rendering the map means handing react-leaflet a Marker and a Polygon for
 * every visible POI, so a re-render is never cheap — it is memoised, and every
 * prop it takes is kept identity-stable by the caller.
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
  trekTarget,
  onSelect,
  onPickGround,
}: Props) {
  const evacPoi = evacZoneId ? pois.find((p) => p.id === evacZoneId) : null;
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
      <GroundPicker onPick={onPickGround} />
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
      <Circle
        center={[home.lat, home.lng]}
        radius={travelRange}
        interactive={false}
        pathOptions={{ color: '#e8e5dd', weight: 1.5, fillOpacity: 0.03, dashArray: '4 6' }}
      />

      {/* Hazard pockets you can sense. Drawn under the pins — this is ground,
          not a destination, and it's never clickable. */}
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

      {trekTarget && (
        <Marker
          position={[trekTarget.lat, trekTarget.lng]}
          icon={trekTargetIcon()}
          zIndexOffset={800}
          interactive={false}
        />
      )}

      {pois.map((poi) => {
        const d = haversine(home.lat, home.lng, poi.lat, poi.lng);
        const vis = visibilityOf(poi, d, blipRange);
        if (vis === 'hidden') return null;

        const selected = selectedId === poi.id;

        // Sensed but unidentified: the building outline still shows (in neutral),
        // capped with a "?" badge. Locations without an outline are just the badge.
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
        const danger = here ? poi.currentDanger : mem?.currentDanger ?? poi.currentDanger;
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

      {/* extraction beacon — always visible so the goal is never lost */}
      {evacPoi && (
        <Marker
          position={[evacPoi.lat, evacPoi.lng]}
          icon={evacIcon()}
          zIndexOffset={900}
          eventHandlers={{ click: () => onSelect(evacPoi) }}
        />
      )}

      <NoiseRings pulses={noisePulses} />
      <PlayerMarker home={home} travelAnim={travelAnim} />
    </MapContainer>

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

export const GameMap = memo(GameMapInner);
