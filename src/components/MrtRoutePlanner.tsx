import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  findRoutes,
  routeOptionLabel,
  routeStationIds,
  stationColor,
  type MrtNetwork,
  type MrtRoute,
  type MrtStation,
} from '../game/mrt';
import { edgeKey } from '../game/mrtDamage';
import { estimateTunnelWalk, formatDuration } from '../game/travel';
import { useGame } from '../game/store';
import { useMrtNetwork } from './MrtOverlay';
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
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 14 });
  }, [map, from, to, route]);
  return null;
}

function PlannerTracks({
  net,
  destroyed,
  routeIds,
}: {
  net: MrtNetwork;
  destroyed: ReadonlySet<string>;
  routeIds: string[];
}) {
  const tracks = useMemo(() => {
    const out: {
      key: string;
      path: [number, number][];
      color: string;
      destroyed: boolean;
      active: boolean;
    }[] = [];
    const drawn = new Set<string>();
    for (const line of net.lines) {
      for (let i = 1; i < line.stations.length; i++) {
        const a = net.byCode.get(line.stations[i - 1]);
        const b = net.byCode.get(line.stations[i]);
        if (!a || !b || a.id === b.id) continue;
        const key = edgeKey(a.id, b.id);
        const ia = routeIds.indexOf(a.id);
        const ib = routeIds.indexOf(b.id);
        const active = ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1;
        const dead = destroyed.has(key);
        const dedupe = `${key}:${active ? 'a' : dead ? 'd' : 'n'}`;
        if (drawn.has(dedupe)) continue;
        drawn.add(dedupe);
        out.push({
          key: `${line.code}:${key}:${i}`,
          path: [
            [a.lat, a.lng],
            [b.lat, b.lng],
          ],
          color: line.color,
          destroyed: dead,
          active,
        });
      }
    }
    return out;
  }, [net, destroyed, routeIds]);

  return (
    <>
      {tracks.map((t) => (
        <Polyline
          key={t.key}
          positions={t.path}
          pathOptions={{
            color: t.active ? '#e8c547' : t.color,
            weight: t.active ? 5 : 3,
            opacity: t.destroyed ? 0.45 : t.active ? 1 : 0.75,
            dashArray: t.destroyed ? '6 8' : undefined,
            lineCap: t.destroyed ? 'butt' : 'round',
          }}
        />
      ))}
    </>
  );
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
          className="h-full w-full"
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
          <PlannerTracks net={net} destroyed={destroyed} routeIds={routeIds} />
          {net.stations.map((s) => {
            const isFrom = s.id === from.id;
            const isTo = s.id === toId;
            const onPath = routeIds.includes(s.id);
            return (
              <CircleMarker
                key={s.id}
                center={[s.lat, s.lng]}
                radius={isFrom || isTo ? 7 : onPath ? 5 : 3.5}
                pathOptions={{
                  color: isFrom ? '#2bc4d9' : isTo ? '#e8c547' : stationColor(net, s),
                  weight: isFrom || isTo ? 2 : 1,
                  fillColor: isFrom ? '#2bc4d9' : isTo ? '#e8c547' : stationColor(net, s),
                  fillOpacity: 0.9,
                }}
                eventHandlers={{
                  click: () => {
                    if (s.id === from.id) return;
                    setToId(s.id);
                    setRouteIdx(0);
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                  <span className="text-xs">
                    {s.name}
                    {isFrom ? ' (here)' : ''}
                  </span>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>

        <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-white/10 bg-black/70 px-2 py-1.5 text-2xs text-white/60">
          <span className="mr-2 inline-block h-0 w-4 border-t-2 border-dashed border-white/50" />{' '}
          Collapsed
          <span className="ml-3 mr-2 inline-block h-0.5 w-4 bg-[#e8c547]" /> Route
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
