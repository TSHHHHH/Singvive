import { MapContainer, TileLayer, Marker, Circle, Polygon, useMap, useMapEvents } from 'react-leaflet';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { Poi } from '../game/types';
import { poiIcon, playerIcon, unknownIcon, evacIcon, dangerColor } from './mapIcons';
import { TILE_ATTRIBUTION, TILE_MAX_NATIVE_ZOOM, TILE_URL } from './tileConfig';
import { POI_CONFIG } from '../game/poi';
import { haversine } from '../game/overpass';
import { visibilityOf } from '../game/fog';
import { FogOverlay } from './FogOverlay';
import type { ExploredCircle } from '../game/fog';
import type { TravelAnim } from '../game/store';

// Amber outline for buildings you can see but haven't identified — stands out
// against the dark map like the "?" blips do.
const UNKNOWN_STROKE = '#e6b83f';

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

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
      map.panTo([lat, lng], { animate: false });
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
  onSelect: (poi: Poi) => void;
}

export function GameMap({
  home,
  pois,
  selectedId,
  hereId,
  travelRange,
  blipRange,
  exploredArea,
  travelAnim,
  evacZoneId,
  onSelect,
}: Props) {
  const evacPoi = evacZoneId ? pois.find((p) => p.id === evacZoneId) : null;
  return (
    <MapContainer
      center={[home.lat, home.lng]}
      zoom={loadZoom()}
      preferCanvas
      className="h-full w-full"
      style={{ background: '#0b0d0a' }}
      zoomControl={false}
    >
      <ZoomMemory />
      <TileLayer
        attribution={TILE_ATTRIBUTION}
        url={TILE_URL}
        maxZoom={20}
        maxNativeZoom={TILE_MAX_NATIVE_ZOOM}
      />
      <FogOverlay
        exploredArea={exploredArea}
        currentRevealCenter={home}
        currentRevealRadius={travelRange}
      />

      {/* travelable range — a planning ring, not vision */}
      <Circle
        center={[home.lat, home.lng]}
        radius={travelRange}
        pathOptions={{ color: '#6b8e23', weight: 1.5, fillOpacity: 0.03, dashArray: '4 6' }}
      />

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

      <PlayerMarker home={home} travelAnim={travelAnim} />
    </MapContainer>
  );
}
