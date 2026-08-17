import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  findRoutes,
  routeOptionLabel,
  routeStationIds,
  type MrtRoute,
  type MrtStation,
} from '../game/mrt';
import { estimateTunnelWalk, formatDuration } from '../game/travel';
import { useGame } from '../game/store';
import { MrtLineLegend, MrtOverlay, useMrtNetwork } from './MrtOverlay';
import {
  TILE_ATTRIBUTION,
  TILE_MAX_NATIVE_ZOOM,
  TILE_SUBDOMAINS,
  TILE_URL,
} from './tileConfig';
import { SG_BOUNDS } from '../game/singapore';

/**
 * Fills the map column: pick a destination on the rail map, choose among
 * fewest-stop routes that avoid destroyed tunnels, then descend into one crawl.
 */

const bounds = L.latLngBounds(
  [SG_BOUNDS.minLat, SG_BOUNDS.minLng],
  [SG_BOUNDS.maxLat, SG_BOUNDS.maxLng],
);

function SizeFix() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

function FitTo({
  from,
  to,
  route,
}: {
  from: MrtStation;
  to: MrtStation | null;
  route: MrtRoute | null;
}) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [[from.lat, from.lng]];
    if (to) pts.push([to.lat, to.lng]);
    if (route) {
      for (const leg of route.legs) {
        pts.push([leg.from.lat, leg.from.lng]);
        for (const s of leg.stops) pts.push([s.lat, s.lng]);
      }
    }
    if (pts.length === 1) {
      map.setView(pts[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
  }, [map, from, to, route]);
  return null;
}

interface Props {
  fromStationId: string;
  /** Optional preselected destination (e.g. adjacent station card). */
  initialToStationId?: string | null;
  onClose: () => void;
  onConfirm: (stationIds: string[]) => void;
}

export function MrtRoutePlanner({
  fromStationId,
  initialToStationId = null,
  onClose,
  onConfirm,
}: Props) {
  const net = useMrtNetwork(true);
  const destroyedList = useGame((s) => s.destroyedTunnelEdges);
  const character = useGame((s) => s.character);
  const energy = useGame((s) => s.meters.energy);
  const hour = useGame((s) => s.hour);

  const destroyed = useMemo(() => new Set(destroyedList), [destroyedList]);
  const from = net?.byId.get(fromStationId) ?? null;

  const [toId, setToId] = useState<string | null>(initialToStationId);
  const [routeIdx, setRouteIdx] = useState(0);

  useEffect(() => {
    setToId(initialToStationId);
    setRouteIdx(0);
  }, [initialToStationId]);

  const routes = useMemo(() => {
    if (!net || !from || !toId || toId === from.id) return [];
    return findRoutes(net, from.id, toId, destroyed, 3);
  }, [net, from, toId, destroyed]);

  const route = routes[routeIdx] ?? routes[0] ?? null;
  const routeIds = route && from ? routeStationIds(route, from.id) : from ? [from.id] : [];

  const walkHint = useMemo(() => {
    if (!route || !character) return null;
    return estimateTunnelWalk(route.meters, character.attributes, energy, hour, 1);
  }, [route, character, energy, hour]);

  if (!net || !from) {
    return (
      <div className="flex h-full w-full min-h-0 flex-col items-center justify-center bg-concrete-950 p-4">
        <div className="rounded border border-white/15 bg-concrete-900 p-4 text-sm text-white/70">
          Loading rail map…
          <button type="button" className="mt-3 block text-signal" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const to = toId ? (net.byId.get(toId) ?? null) : null;
  const reachable = !!route;
  const energyLow = energy < 5;

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-concrete-950">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-concrete-600 bg-concrete-900 px-3 py-2.5">
        <div className="min-w-0">
          <div className="signage text-xs text-signal">Tunnel route</div>
          <div className="truncate text-xs text-concrete-400">
            From {from.name}
            {to ? ` → ${to.name}` : ' — tap a station'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
        >
          Back to map
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <MapContainer
          center={[from.lat, from.lng]}
          zoom={12}
          preferCanvas
          zoomControl={false}
          className="h-full w-full"
          style={{ background: '#08080a' }}
          maxBounds={bounds}
          maxBoundsViscosity={1}
        >
          <TileLayer
            url={TILE_URL}
            attribution={TILE_ATTRIBUTION}
            subdomains={TILE_SUBDOMAINS}
            maxNativeZoom={TILE_MAX_NATIVE_ZOOM}
            maxZoom={20}
          />
          <SizeFix />
          <FitTo from={from} to={to} route={route} />
          <MrtOverlay
            net={net}
            destroyedEdges={destroyedList}
            routeIds={routeIds}
            fromStationId={from.id}
            toStationId={toId}
            labelZoom={13}
            onStationClick={(s) => {
              if (s.id === from.id) return;
              setToId(s.id);
              setRouteIdx(0);
            }}
          />
        </MapContainer>

        <div className="pointer-events-none absolute right-2 top-2 z-[500]">
          <MrtLineLegend
            net={net}
            destroyedCount={destroyedList.length}
            extra={
              <div className="mt-1 flex items-center gap-1.5 border-t border-white/10 pt-1 text-white/55">
                <span className="inline-block h-0.5 w-4 shrink-0 bg-[#e8c547]" aria-hidden />
                <span>Gold = planned route</span>
              </div>
            }
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-concrete-600 bg-concrete-900 p-3">
        {to && !reachable && (
          <p className="mb-2 text-xs text-hiss">
            No intact tunnel path to {to.name} — collapsed bores block every route.
          </p>
        )}
        {routes.length > 0 && (
          <div className="mb-2 flex flex-col gap-1.5">
            {routes.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRouteIdx(i)}
                className={`rounded border px-2 py-1.5 text-left text-xs transition ${
                  routeIdx === i || (!routes[routeIdx] && i === 0)
                    ? 'border-signal/50 bg-signal/10 text-signal'
                    : 'border-white/10 text-white/70 hover:bg-white/5'
                }`}
              >
                {routeOptionLabel(r, i)}
                <span className="mt-0.5 block text-2xs text-white/40">
                  {r.meters} m
                  {r.changes > 0
                    ? ` · ${r.changes} change${r.changes === 1 ? '' : 's'}`
                    : ' · no changes'}
                  {i === routeIdx && walkHint ? ` · ~${formatDuration(walkHint.travelMin)}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={!route || energyLow}
          onClick={() => route && from && onConfirm(routeStationIds(route, from.id))}
          className="w-full rounded bg-signal/90 py-2.5 text-sm font-bold text-black hover:bg-signal disabled:opacity-30"
        >
          {energyLow
            ? 'Too spent — rest first'
            : route
              ? `Enter tunnels · ${route.stops} stop${route.stops === 1 ? '' : 's'}`
              : 'Pick a destination'}
        </button>
        <p className="mt-1.5 text-center text-2xs text-concrete-400">
          One crawl for the whole route. You can exit at any station along the way.
        </p>
      </div>
    </div>
  );
}
