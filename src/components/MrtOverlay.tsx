import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Marker, Popup, type MapLayerMouseEvent } from 'maplibre-gl';
import type { Feature } from 'geojson';
import { typeCss } from '../ui/type';
import { linesAt, stationColor, type MrtNetwork, type MrtStation } from '../game/mrt';
import { edgeKey } from '../game/mrt';
import { useT } from '../i18n';
import { useMapGL, useMapEvent } from '../map/hooks';
import { installOverlay, setData, alive } from '../map/layers';
import { fc } from '../map/geo';

/**
 * The rail network drawn over the map — and over the tunnel planner, which
 * reuses this overlay so both views share geometry and liveries. Real track
 * shapes, official colours, codes on the dots once you're zoomed in far
 * enough to read them.
 *
 * Deliberately drawn *over* the fog (slot `mrt`). The MRT map is the one piece
 * of the city everybody already carries in their head — the fog hides what's
 * in a station, never where the line runs.
 */


/** Station dots; ground-click handlers skip hits on this layer. */
export const MRT_STATION_LAYER = 'mrt-stations';

const SRC_TRACKS = 'mrt-tracks';
const SRC_STATIONS = 'mrt-stations';

/** Zoom at which station codes stop being clutter (MapLibre zoom; Leaflet 15). */
const LABEL_ZOOM = 14;

interface Props {
  net: MrtNetwork;
  /**
   * Consecutive station ids of a planned crawl. Matching hops draw gold and
   * thicker; used by the tunnel planner so it shares this overlay with the
   * world map instead of tracing its own straight chords.
   */
  routeIds?: readonly string[];
  fromStationId?: string;
  toStationId?: string | null;
  onStationClick?: (station: MrtStation) => void;
  /** Zoom at which name labels appear. World map stays at 14; planner can go lower. */
  labelZoom?: number;
}

function labelElement(station: MrtStation, color: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '0';
  el.style.height = '0';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '0';
  const codes = station.codes
    .map(
      (c) =>
        `<span style="background:${color};color:#08080a;border-radius:3px;padding:0 3px;font-weight:var(--type-plate-weight);">${c}</span>`,
    )
    .join(' ');
  const inner = document.createElement('div');
  inner.style.cssText = `transform:translate(14px,-50%);display:flex;align-items:center;gap:4px;white-space:nowrap;${typeCss('micro')}color:#e8e5dd;text-shadow:0 1px 3px #000,0 0 6px #000;pointer-events:none;`;
  inner.innerHTML = codes;
  const name = document.createElement('span');
  name.textContent = station.name;
  inner.appendChild(name);
  el.appendChild(inner);
  return el;
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
function hopGeometry(shapes: [number, number][][], a: MrtStation, b: MrtStation): [number, number][] {
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

export function MrtOverlay({
  net,
  routeIds,
  fromStationId,
  toStationId,
  onStationClick,
  labelZoom = LABEL_ZOOM,
}: Props) {
  const { t } = useT();
  const map = useMapGL();
  const routeIndex = useMemo(() => {
    if (!routeIds || routeIds.length === 0) return null;
    const idx = new Map<string, number>();
    routeIds.forEach((id, i) => idx.set(id, i));
    return idx;
  }, [routeIds]);

  useEffect(
    () =>
      installOverlay(map, 'mrt', { [SRC_TRACKS]: 'geojson', [SRC_STATIONS]: 'geojson' }, [
        {
          id: 'mrt-track',
          type: 'line',
          source: SRC_TRACKS,
          layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'sort'] },
          paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'op'] },
        },
        {
          id: MRT_STATION_LAYER,
          type: 'circle',
          source: SRC_STATIONS,
          layout: { 'circle-sort-key': ['get', 'r'] },
          paint: {
            'circle-radius': ['get', 'r'],
            'circle-color': ['get', 'fill'],
            'circle-stroke-color': ['get', 'stroke'],
            'circle-stroke-width': 2,
          },
        },
      ]),
    [map],
  );

  /** One stroke per adjacent hop, so a planned route can light up hop by hop. */
  useEffect(() => {
    const out: Feature[] = [];
    const seen = new Set<string>();
    for (const line of net.lines) {
      // Branches share parent track geometry — still emit hops so a planned
      // CG/CE route lights up on the same stroke as EW.
      const shapes =
        line.shape.length > 0 ? line.shape : line.parent ? (net.lineByCode.get(line.parent)?.shape ?? []) : [];
      for (let i = 1; i < line.stations.length; i++) {
        const a = net.byCode.get(line.stations[i - 1]);
        const b = net.byCode.get(line.stations[i]);
        if (!a || !b || a.id === b.id) continue;
        const key = edgeKey(a.id, b.id);
        const ia = routeIndex?.get(a.id);
        const ib = routeIndex?.get(b.id);
        const active = ia !== undefined && ib !== undefined && Math.abs(ia - ib) === 1;
        // A trunk and a branch can share one undirected edge; draw it once,
        // and let the active (planned) stroke win.
        const drawKey = `${key}:${active ? 'a' : 'n'}`;
        if (seen.has(drawKey)) continue;
        if (active) seen.add(`${key}:n`);
        seen.add(drawKey);
        out.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: hopGeometry(shapes, a, b).map(([la, ln]) => [ln, la]) },
          properties: {
            color: active ? '#e8c547' : line.color,
            w: active ? 5 : 3,
            op: active ? 1 : 0.85,
            sort: active ? 1 : 0,
          },
        });
      }
    }
    setData(map, SRC_TRACKS, fc(out));
  }, [map, net, routeIndex]);

  useEffect(() => {
    const feats: Feature[] = net.stations.map((s) => {
      const color = stationColor(net, s);
      const interchange = s.codes.length > 1;
      const isFrom = s.id === fromStationId;
      const isTo = !!toStationId && s.id === toStationId;
      const onPath = !!routeIndex?.has(s.id);
      let radius = interchange ? 6 : 4;
      if (onPath) radius = Math.max(radius, 5);
      if (isFrom || isTo) radius = 7;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: {
          id: s.id,
          r: radius,
          stroke: isFrom ? '#2bc4d9' : isTo ? '#e8c547' : '#08080a',
          fill: isFrom ? '#2bc4d9' : isTo ? '#e8c547' : interchange ? '#e8e5dd' : color,
        },
      };
    });
    setData(map, SRC_STATIONS, fc(feats));
  }, [map, net, fromStationId, toStationId, routeIndex]);

  // --- Labels: DOM markers for stations in view, past the label zoom. -------
  const labels = useRef(new Map<string, { marker: Marker; key: string }>());
  const labelArgs = useRef({ net, fromStationId, toStationId, labelZoom });
  labelArgs.current = { net, fromStationId, toStationId, labelZoom };

  const syncLabels = useRef(() => {});
  syncLabels.current = () => {
    if (!alive(map)) return;
    const { net: n, fromStationId: from, toStationId: to, labelZoom: lz } = labelArgs.current;
    const zoom = map.getZoom();
    const b = map.getBounds();
    const want = new Set<string>();
    for (const s of n.stations) {
      if (!b.contains([s.lng, s.lat])) continue;
      const pinned = s.id === from || s.id === to;
      if (!pinned && zoom < lz) continue;
      want.add(s.id);
      const color = s.id === from ? '#2bc4d9' : s.id === to ? '#e8c547' : stationColor(n, s);
      const key = `${s.codes.join(',')}|${color}`;
      const had = labels.current.get(s.id);
      if (had && had.key === key) continue;
      had?.marker.remove();
      const marker = new Marker({ element: labelElement(s, color), anchor: 'top-left' })
        .setLngLat([s.lng, s.lat])
        .addTo(map);
      labels.current.set(s.id, { marker, key });
    }
    for (const [id, l] of labels.current) {
      if (!want.has(id)) {
        l.marker.remove();
        labels.current.delete(id);
      }
    }
  };
  useMapEvent('moveend', () => syncLabels.current());
  useEffect(() => {
    syncLabels.current();
  }, [net, fromStationId, toStationId, labelZoom]);
  useEffect(() => {
    const all = labels.current;
    return () => {
      for (const l of all.values()) l.marker.remove();
      all.clear();
    };
  }, []);

  // --- Hover card + click ----------------------------------------------------
  const tipArgs = useRef({ net, fromStationId, toStationId, onStationClick, t });
  tipArgs.current = { net, fromStationId, toStationId, onStationClick, t };

  useEffect(() => {
    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'map-tip', anchor: 'bottom' });
    const stationAt = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      return id ? tipArgs.current.net.stations.find((s) => s.id === id) : undefined;
    };
    const show = (e: MapLayerMouseEvent) => {
      const s = stationAt(e);
      if (!s) return;
      const { net: n, fromStationId: from, toStationId: to, t: tr, onStationClick: click } = tipArgs.current;
      map.getCanvas().style.cursor = click ? 'pointer' : '';
      const box = document.createElement('div');
      const name = document.createElement('span');
      name.className = 'font-bold';
      name.textContent = s.name;
      box.appendChild(name);
      const suffix = s.id === from ? tr('ui.mrt.tooltipHere') : to && s.id === to ? tr('ui.mrt.tooltipDestination') : '';
      if (suffix) box.appendChild(document.createTextNode(suffix));
      box.appendChild(document.createElement('br'));
      box.appendChild(
        document.createTextNode(`${s.codes.join(' · ')} — ${linesAt(n, s).map((l) => l.name).join(', ')}`),
      );
      popup.setLngLat([s.lng, s.lat]).setDOMContent(box).addTo(map);
    };
    const hide = () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    };
    const click = (e: MapLayerMouseEvent) => {
      const s = stationAt(e);
      if (s) tipArgs.current.onStationClick?.(s);
    };
    map.on('mousemove', MRT_STATION_LAYER, show);
    map.on('mouseleave', MRT_STATION_LAYER, hide);
    map.on('click', MRT_STATION_LAYER, click);
    return () => {
      popup.remove();
      if (!alive(map)) return;
      map.off('mousemove', MRT_STATION_LAYER, show);
      map.off('mouseleave', MRT_STATION_LAYER, hide);
      map.off('click', MRT_STATION_LAYER, click);
    };
  }, [map]);

  return null;
}

/** The lines a legend should list: branches ride under their parent's name. */
function legendLines(net: MrtNetwork) {
  return net.lines.filter((l) => !l.parent);
}

/** Line-colour key used on the world map and the tunnel planner. */
export function MrtLineLegend({
  net,
  extra,
}: {
  net: MrtNetwork;
  extra?: ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="max-w-[45vw] rounded border border-white/15 bg-concrete-900/95 p-2 text-micro text-white/70 shadow-signage">
      {legendLines(net).map((line) => (
        <div key={line.code} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 shrink-0 rounded" style={{ background: line.color }} />
          <span className="truncate">{line.name}</span>
        </div>
      ))}
      {extra}
      <div className="mt-1 border-t border-white/10 pt-1 text-white/35">
        {t('ui.mrt.osmBaked', { date: net.generatedAt })}
      </div>
    </div>
  );
}
