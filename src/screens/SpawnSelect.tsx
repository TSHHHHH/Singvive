import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useGame } from '../game/store';
import {
  NEIGHBOURHOODS,
  SG_BOUNDS,
  SG_CENTER,
  inSingapore,
} from '../game/singapore';
import { playerIcon } from '../components/mapIcons';
import {
  TILE_ATTRIBUTION,
  TILE_MAX_NATIVE_ZOOM,
  TILE_SUBDOMAINS,
  TILE_URL,
} from '../components/tileConfig';

const bounds = L.latLngBounds(
  [SG_BOUNDS.minLat, SG_BOUNDS.minLng],
  [SG_BOUNDS.maxLat, SG_BOUNDS.maxLng],
);

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

function ClickCatcher({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (inSingapore(e.latlng.lat, e.latlng.lng)) {
        onPick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

export function SpawnSelect() {
  const { setSpawn, resetToMenu } = useGame();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [loading, setLoading] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  const randomSpawn = () => {
    const n = NEIGHBOURHOODS[Math.floor(Math.random() * NEIGHBOURHOODS.length)];
    setRejected(null);
    // jitter a little so it isn't always the town centroid
    setPicked({
      lat: n.lat + (Math.random() - 0.5) * 0.008,
      lng: n.lng + (Math.random() - 0.5) * 0.008,
      name: n.name,
    });
  };

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

  const confirm = async () => {
    if (!picked || loading) return;
    setLoading(true);
    setRejected(null);
    // Single map load. 'remote' = the spot has too little to scavenge → let the
    // player pick again. 'ok' switches to the game phase.
    const result = await setSpawn(picked);
    if (result === 'remote') {
      setLoading(false);
      setRejected('Area too remote or lacks infrastructure. Please select an urbanized zone.');
    }
  };

  return (
    <div className="flex h-full flex-col p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:justify-between">
        <button onClick={resetToMenu} className="text-xs text-white/40 hover:text-white/70">
          ← Back
        </button>
        <h2 className="order-first w-full text-center text-base font-bold text-signal sm:order-none sm:w-auto sm:text-lg">
          Choose where you wake up
        </h2>
        <button
          onClick={randomSpawn}
          className="ml-auto rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 sm:ml-0"
        >
          Random
        </button>
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
          <ClickCatcher
            onPick={(lat, lng) => {
              setRejected(null);
              setPicked({ lat, lng, name: nearestName(lat, lng) });
            }}
          />
          {picked && <Marker position={[picked.lat, picked.lng]} icon={playerIcon()} />}
        </MapContainer>

        {loading && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/70 text-center">
            <div>
              <div className="mb-2 animate-pulse text-2xl">📡</div>
              <p className="text-sm text-white/70">Scanning the neighbourhood for supplies…</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-sm text-white/50">
          {picked ? (
            <>
              Spawn: <span className="text-signal">{picked.name}</span>
            </>
          ) : (
            'Tap anywhere in Singapore, or roll a random spawn.'
          )}
        </p>
        <button
          onClick={confirm}
          disabled={!picked || loading}
          className="w-full rounded-lg bg-signal/80 px-6 py-2.5 font-bold text-black transition hover:bg-signal disabled:opacity-30 sm:w-auto"
        >
          Wake up here →
        </button>
      </div>
    </div>
  );
}
