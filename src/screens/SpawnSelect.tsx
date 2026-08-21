import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useGame } from '../game/store';
import { NEIGHBOURHOODS, SG_BOUNDS, SG_CENTER } from '../game/singapore';
import {
  ensureZonesLoaded,
  getZones,
  isWalkable,
  unplayableMessage,
  walkabilityOf,
  type ZonesData,
} from '../game/playable';
import { playerIcon } from '../components/mapIcons';
import { UnplayableLegend, UnplayableOverlay } from '../components/UnplayableOverlay';
import { MrtLineLegend, MrtOverlay, useMrtNetwork } from '../components/MrtOverlay';
import {
  TILE_ATTRIBUTION,
  TILE_MAX_NATIVE_ZOOM,
  TILE_SUBDOMAINS,
  TILE_URL,
} from '../components/tileConfig';
import { Icon } from '../icons/Icon';
import { useT } from '../i18n';

const bounds = L.latLngBounds(
  [SG_BOUNDS.minLat, SG_BOUNDS.minLng],
  [SG_BOUNDS.maxLat, SG_BOUNDS.maxLng],
);

/** Shared with GameMap — survives reloads and stays in sync across screens. */
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

interface Picked {
  lat: number;
  lng: number;
  name: string;
}

function SizeFix() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

function ClickCatcher({
  onPick,
  onReject,
}: {
  onPick: (lat: number, lng: number) => void;
  onReject: (msg: string) => void;
}) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      const reason = walkabilityOf(lat, lng);
      if (reason !== 'ok') {
        onReject(unplayableMessage(reason, 'spawn'));
        return;
      }
      onPick(lat, lng);
    },
  });
  return null;
}

/**
 * Concurrent pan+zoom via setView. Prefer this over flyTo — flyTo re-zooms every
 * frame and desyncs ImageOverlay terrain washes on the spawn map.
 */
function FocusSpawn({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    const targetZoom = Math.max(map.getZoom(), 15);
    map.setView([lat, lng], targetZoom, { animate: true, duration: 0.8 });
  }, [map, lat, lng]);
  return null;
}

const RANDOM_TRIES = 24;

export function SpawnSelect() {
  const { setSpawn, resetToMenu } = useGame();
  const { t } = useT();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [loading, setLoading] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const [zones, setZones] = useState<ZonesData | null>(null);
  const [showMrt, setShowMrt] = useState(loadMrtPref);
  const mrtNet = useMrtNetwork(showMrt);

  const toggleMrt = () => {
    setShowMrt((on) => {
      saveMrtPref(!on);
      return !on;
    });
  };

  useEffect(() => {
    let cancelled = false;
    void ensureZonesLoaded()
      .then((z) => {
        if (!cancelled) setZones(z);
      })
      .catch(() => {
        if (!cancelled) setZones(getZones());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nearestName = (lat: number, lng: number): string => {
    let best = NEIGHBOURHOODS[0];
    let bestD = Infinity;
    for (const n of NEIGHBOURHOODS) {
      const d = (n.lat - lat) ** 2 + (n.lng - lng) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best.name;
  };

  const tryPick = (lat: number, lng: number): boolean => {
    const reason = walkabilityOf(lat, lng);
    if (reason !== 'ok') {
      setPicked(null);
      setRejected(unplayableMessage(reason, 'spawn'));
      return false;
    }
    setRejected(null);
    setPicked({ lat, lng, name: nearestName(lat, lng) });
    return true;
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setRejected(t('ui.spawn.geoUnavailable'));
      return;
    }
    setGeoBusy(true);
    setRejected(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        if (
          lat < SG_BOUNDS.minLat ||
          lat > SG_BOUNDS.maxLat ||
          lng < SG_BOUNDS.minLng ||
          lng > SG_BOUNDS.maxLng
        ) {
          setRejected(t('ui.spawn.outsideSg'));
          return;
        }
        tryPick(lat, lng);
      },
      (err) => {
        setGeoBusy(false);
        if (err.code === err.PERMISSION_DENIED) {
          setRejected(t('ui.spawn.permissionDenied'));
        } else {
          setRejected(t('ui.spawn.geoFailed'));
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 },
    );
  };

  const randomSpawn = () => {
    setRejected(null);
    for (let i = 0; i < RANDOM_TRIES; i++) {
      const n = NEIGHBOURHOODS[Math.floor(Math.random() * NEIGHBOURHOODS.length)];
      const lat = n.lat + (Math.random() - 0.5) * 0.008;
      const lng = n.lng + (Math.random() - 0.5) * 0.008;
      if (isWalkable(lat, lng)) {
        setPicked({ lat, lng, name: n.name });
        return;
      }
    }
    const n = NEIGHBOURHOODS[Math.floor(Math.random() * NEIGHBOURHOODS.length)];
    if (isWalkable(n.lat, n.lng)) {
      setPicked({ lat: n.lat, lng: n.lng, name: n.name });
      return;
    }
    setRejected(t('ui.spawn.noWalkable'));
  };

  const confirm = async () => {
    if (!picked || loading) return;
    const reason = walkabilityOf(picked.lat, picked.lng);
    if (reason !== 'ok') {
      setRejected(unplayableMessage(reason, 'spawn'));
      setPicked(null);
      return;
    }
    setLoading(true);
    setRejected(null);
    const result = await setSpawn(picked);
    if (result === 'remote') {
      setLoading(false);
      setRejected(t('ui.spawn.tooRemote'));
    } else if (result === 'unplayable') {
      setLoading(false);
      setRejected(unplayableMessage(walkabilityOf(picked.lat, picked.lng), 'spawn'));
      setPicked(null);
    }
  };

  return (
    <div className="flex h-full flex-col p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:justify-between">
        <button onClick={resetToMenu} className="text-xs text-white/40 hover:text-white/70">
          {t('ui.common.back')}
        </button>
        <h2 className="order-first w-full text-center text-base font-bold text-signal sm:order-none sm:w-auto sm:text-lg">
          {t('ui.spawn.title')}
        </h2>
        <div className="ml-auto flex gap-2 sm:ml-0">
          <button
            onClick={useMyLocation}
            disabled={geoBusy || loading}
            className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-40"
            title={t('ui.spawn.myLocationTitle')}
          >
            {geoBusy ? t('ui.spawn.locating') : t('ui.spawn.myLocation')}
          </button>
          <button
            onClick={randomSpawn}
            className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
          >
            {t('ui.spawn.random')}
          </button>
        </div>
      </div>

      {rejected && (
        <div className="mb-2 rounded border border-hiss/50 bg-hiss/10 px-3 py-2 text-sm text-hiss">
          {rejected}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10">
        <MapContainer
          center={SG_CENTER}
          zoom={12}
          minZoom={11}
          maxBounds={bounds}
          maxBoundsViscosity={1}
          className="h-full w-full"
          style={{ background: '#0b0d0a' }}
        >
          <TileLayer
            attribution={TILE_ATTRIBUTION}
            url={TILE_URL}
            subdomains={TILE_SUBDOMAINS}
            maxZoom={20}
            maxNativeZoom={TILE_MAX_NATIVE_ZOOM}
          />
          <SizeFix />
          {zones && <UnplayableOverlay zones={zones} />}
          {showMrt && mrtNet && <MrtOverlay net={mrtNet} />}
          <ClickCatcher
            onPick={(lat, lng) => {
              tryPick(lat, lng);
            }}
            onReject={(msg) => {
              setPicked(null);
              setRejected(msg);
            }}
          />
          {picked && (
            <>
              <Marker position={[picked.lat, picked.lng]} icon={playerIcon()} />
              <FocusSpawn lat={picked.lat} lng={picked.lng} />
            </>
          )}
        </MapContainer>

        <button
          onClick={toggleMrt}
          aria-pressed={showMrt}
          title={t('ui.spawn.railMapTitle')}
          className={`absolute right-2 top-2 z-[500] flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs font-semibold shadow-signage transition-colors ${
            showMrt
              ? 'border-astral/50 bg-astral/20 text-astral'
              : 'border-white/15 bg-concrete-900/95 text-white/60 hover:text-white/90'
          }`}
        >
          <Icon name="action.mrt" size={14} /> {t('ui.spawn.railMap')}
        </button>

        {showMrt && mrtNet && (
          <div className="absolute right-2 top-11 z-[500]">
            <MrtLineLegend net={mrtNet} />
          </div>
        )}

        {zones && <UnplayableLegend />}

        {loading && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/70 text-center">
            <div>
              <div className="mb-2 animate-pulse text-2xl">📡</div>
              <p className="text-sm text-white/70">{t('ui.spawn.scanning')}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-sm text-white/50">
          {picked ? (
            <>
              {t('ui.spawn.spawnLabel')} <span className="text-signal">{picked.name}</span>
            </>
          ) : (
            t('ui.spawn.hint')
          )}
        </p>
        <button
          onClick={confirm}
          disabled={!picked || loading}
          className="w-full rounded-lg bg-signal/80 px-6 py-2.5 font-bold text-black transition hover:bg-signal disabled:opacity-30 sm:w-auto"
        >
          {t('ui.spawn.wakeUp')}
        </button>
      </div>
    </div>
  );
}
