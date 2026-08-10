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

/**
 * The rail network drawn over the map: real track geometry in the official
 * liveries, every station in its line's colour, codes on the dots once you're
 * zoomed in far enough to read them.
 *
 * Deliberately drawn *over* the fog. The MRT map is the one piece of the city
 * everybody already carries in their head — the fog hides what's in a station,
 * never where the line runs.
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

export function MrtOverlay({ net }: Props) {
  const map = useMap();
  const { zoom, bounds } = useViewport();

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

  // A branch has no track of its own — it runs on its parent's rails. Where a
  // line has no geometry at all, joining its stops is a truthful-enough
  // schematic and beats drawing nothing.
  const tracks = useMemo(
    () =>
      net.lines.flatMap((line) => {
        if (line.shape.length) {
          return line.shape.map((path, i) => ({ key: `${line.code}:${i}`, path, color: line.color }));
        }
        if (line.parent) return [];
        const path = line.stations
          .map((code) => net.byCode.get(code))
          .filter((s): s is MrtStation => !!s)
          .map((s) => [s.lat, s.lng] as [number, number]);
        return path.length > 1 ? [{ key: `${line.code}:joined`, path, color: line.color }] : [];
      }),
    [net],
  );

  const labelled = zoom >= LABEL_ZOOM ? net.stations.filter((s) => bounds.contains([s.lat, s.lng])) : [];

  return (
    <>
      {tracks.map(({ key, path, color }) => (
        <Polyline
          key={key}
          positions={path}
          renderer={renderer}
          pane={MRT_PANE}
          interactive={false}
          pathOptions={{ color, weight: 3, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
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
