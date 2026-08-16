import { Fragment, useEffect, useMemo, useState } from 'react';
import { CircleMarker, Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  getMrtNetwork,
  linesAt,
  loadMrtNetwork,
  stationColor,
  type MrtNetwork,
  type MrtStation,
} from '../game/mrt';
import { edgeKey } from '../game/mrtDamage';

/**
 * The rail network drawn over the map: real track geometry in the official
 * liveries, every station in its line's colour, codes on the dots once you're
 * zoomed in far enough to read them.
 *
 * Deliberately drawn *over* the fog. The MRT map is the one piece of the city
 * everybody already carries in their head — the fog hides what's in a station,
 * never where the line runs. Collapsed hops keep the same livery but draw
 * dashed and muted — one stroke per segment, not a second overlay line.
 */

/**
 * The network, fetching it once if it isn't in memory yet. `enabled` is for
 * callers that shouldn't pay for the file until the player asks to see it.
 */
export function useMrtNetwork(enabled = true): MrtNetwork | null {
  const [net, setNet] = useState<MrtNetwork | null>(getMrtNetwork);
  useEffect(() => {
    if (!enabled || net) return;
    let live = true;
    void loadMrtNetwork().then((n) => {
      if (live) setNet(n);
    });
    return () => {
      live = false;
    };
  }, [enabled, net]);
  return net;
}

/** Above the fog (250) but below the pins (600). */
const MRT_PANE = 'mrt';
const MRT_PANE_Z = 450;

/** Zoom at which station codes stop being clutter and start being useful. */
const LABEL_ZOOM = 15;

interface Props {
  net: MrtNetwork;
  /** Undirected edge keys destroyed this run — drawn as collapsed bores. */
  destroyedEdges?: readonly string[];
}

/** Re-renders on pan/zoom so the labels can track the viewport. */
function useViewport() {
  const map = useMap();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  useMapEvents({
    moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
    zoomend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
  });
  return view;
}

const labelIconCache = new Map<string, L.DivIcon>();

function labelIcon(station: MrtStation, color: string): L.DivIcon {
  const key = `${station.codes.join(',')}|${color}`;
  const cached = labelIconCache.get(key);
  if (cached) return cached;

  const codes = station.codes
    .map(
      (c) =>
        `<span style="background:${color};color:#08080a;border-radius:3px;padding:0 3px;font-weight:700;">${c}</span>`,
    )
    .join(' ');
  const icon = L.divIcon({
    className: '',
    html: `<div style="
      transform:translate(14px,-50%);
      display:flex;align-items:center;gap:4px;white-space:nowrap;
      font-size:10px;line-height:14px;color:#e8e5dd;
      text-shadow:0 1px 3px #000,0 0 6px #000;
      pointer-events:none;
    ">${codes}<span>${station.name}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
  labelIconCache.set(key, icon);
  return icon;
}

function nearestVertex(path: [number, number][], lat: number, lng: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < path.length; i++) {
    const dLat = path[i][0] - lat;
    const dLng = path[i][1] - lng;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Slice track geometry between two stations on a line. Falls back to a straight
 * chord when the bake has no shape (or the stations sit on different pieces).
 */
function hopGeometry(
  shapes: [number, number][][],
  a: MrtStation,
  b: MrtStation,
): [number, number][] {
  let bestPath: [number, number][] | null = null;
  let bestScore = Infinity;
  for (const path of shapes) {
    if (path.length < 2) continue;
    const ia = nearestVertex(path, a.lat, a.lng);
    const ib = nearestVertex(path, b.lat, b.lng);
    if (ia === ib) continue;
    const score =
      (path[ia][0] - a.lat) ** 2 +
      (path[ia][1] - a.lng) ** 2 +
      (path[ib][0] - b.lat) ** 2 +
      (path[ib][1] - b.lng) ** 2;
    if (score < bestScore) {
      bestScore = score;
      const lo = Math.min(ia, ib);
      const hi = Math.max(ia, ib);
      bestPath = path.slice(lo, hi + 1);
    }
  }
  if (bestPath && bestPath.length >= 2) return bestPath;
  return [
    [a.lat, a.lng],
    [b.lat, b.lng],
  ];
}

interface TrackSeg {
  key: string;
  path: [number, number][];
  color: string;
  destroyed: boolean;
}

export function MrtOverlay({ net, destroyedEdges = [] }: Props) {
  const map = useMap();
  const { zoom, bounds } = useViewport();
  const destroyed = useMemo(() => new Set(destroyedEdges), [destroyedEdges]);

  // A pane of its own, so the whole network sits above the fog in one move
  // rather than fighting the draw order layer by layer.
  const renderer = useMemo(() => {
    if (!map.getPane(MRT_PANE)) {
      const pane = map.createPane(MRT_PANE);
      pane.style.zIndex = String(MRT_PANE_Z);
    }
    return L.svg({ pane: MRT_PANE });
  }, [map]);

  useEffect(() => {
    const pane = map.getPane(MRT_PANE);
    if (pane) pane.style.zIndex = String(MRT_PANE_Z);
  }, [map]);

  /**
   * One stroke per adjacent hop. Intact = solid livery; collapsed = same colour,
   * dashed and muted. Avoids a second “damage” polyline sitting beside the track.
   */
  const tracks = useMemo(() => {
    const out: TrackSeg[] = [];
    const seen = new Set<string>();
    for (const line of net.lines) {
      // Branches share parent track geometry — still emit hops so a collapsed
      // CG/CE edge shows on the same stroke as EW.
      const shapes =
        line.shape.length > 0
          ? line.shape
          : line.parent
            ? (net.lineByCode.get(line.parent)?.shape ?? [])
            : [];
      for (let i = 1; i < line.stations.length; i++) {
        const a = net.byCode.get(line.stations[i - 1]);
        const b = net.byCode.get(line.stations[i]);
        if (!a || !b || a.id === b.id) continue;
        const key = edgeKey(a.id, b.id);
        const dead = destroyed.has(key);
        // Prefer drawing the destroyed style when both a trunk and branch hop
        // share the same undirected edge.
        const drawKey = `${key}:${dead ? 'd' : 'n'}`;
        if (seen.has(drawKey)) continue;
        if (dead) seen.add(`${key}:n`); // suppress a later intact twin
        if (!dead && seen.has(`${key}:d`)) continue;
        seen.add(drawKey);
        out.push({
          key: `${line.code}:${key}:${i}`,
          path: hopGeometry(shapes, a, b),
          color: line.color,
          destroyed: dead,
        });
      }
    }
    return out;
  }, [net, destroyed]);

  const labelled = zoom >= LABEL_ZOOM ? net.stations.filter((s) => bounds.contains([s.lat, s.lng])) : [];

  return (
    <>
      {tracks.map(({ key, path, color, destroyed: dead }) => (
        <Polyline
          key={key}
          positions={path}
          renderer={renderer}
          pane={MRT_PANE}
          interactive={false}
          pathOptions={{
            color,
            weight: 3,
            opacity: dead ? 0.45 : 0.85,
            dashArray: dead ? '6 8' : undefined,
            lineCap: dead ? 'butt' : 'round',
            lineJoin: 'round',
          }}
        />
      ))}

      {net.stations.map((s) => {
        const color = stationColor(net, s);
        const interchange = s.codes.length > 1;
        return (
          <Fragment key={s.id}>
            <CircleMarker
              center={[s.lat, s.lng]}
              radius={interchange ? 6 : 4}
              renderer={renderer}
              pane={MRT_PANE}
              pathOptions={{
                color: '#08080a',
                weight: 2,
                fillColor: interchange ? '#e8e5dd' : color,
                fillOpacity: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span className="font-bold">{s.name}</span>
                <br />
                {s.codes.join(' · ')} — {linesAt(net, s).map((l) => l.name).join(', ')}
              </Tooltip>
            </CircleMarker>
            {labelled.includes(s) && (
              <Marker
                position={[s.lat, s.lng]}
                icon={labelIcon(s, color)}
                interactive={false}
                zIndexOffset={-500}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/** The lines a legend should list: branches ride under their parent's name. */
export function legendLines(net: MrtNetwork) {
  return net.lines.filter((l) => !l.parent);
}
