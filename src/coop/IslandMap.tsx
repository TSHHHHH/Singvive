import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useT } from '../i18n/useT';
import { BASEMAP, SLOTS, slotId } from '../map/mapStyle';
import { installOverlay, markRemoved, setData } from '../map/layers';
import { EMPTY_FC, boxContains, fc, lineFeature, padBox } from '../map/geo';
import { FogGeometry, FOG_COLOUR, FOG_TOTAL, bandOpacity } from '../map/fogGeometry';
import { typeCss } from '../ui/type';
import { ISLAND_SIGHT_M, type IslandPoint } from './islandModel';
import type { RoomState, Survivor } from './model';

interface Props {
  room: RoomState;
  me: Survivor;
  selected: string;
  ground: IslandPoint | null;
  onSelect: (id: string) => void;
  onGround: (point: IslandPoint) => void;
}

/** Position is presentation only. The server commits the destination on arrival. */
function survivorPoint(room: RoomState, player: Survivor): IslandPoint | undefined {
  const route = player.action?.kind === 'travel' ? player.action.route : undefined;
  if (!route || route.length < 2 || !player.action) return room.world?.locations[player.site];
  const action = player.action;
  const fraction = Math.max(0, Math.min(1, (room.simMs - action.startedAt) / Math.max(1, action.endsAt - action.startedAt)));
  const lengths = route.slice(1).map((point, n) => Math.hypot(point.lat - route[n].lat, (point.lng - route[n].lng) * Math.cos(point.lat * Math.PI / 180)));
  let left = lengths.reduce((a, b) => a + b, 0) * fraction;
  for (let n = 0; n < lengths.length; n++) {
    if (left <= lengths[n]) {
      const blend = lengths[n] ? left / lengths[n] : 0;
      return { lat: route[n].lat + (route[n + 1].lat - route[n].lat) * blend, lng: route[n].lng + (route[n + 1].lng - route[n].lng) * blend };
    }
    left -= lengths[n];
  }
  return route[route.length - 1];
}

function MapCanvas(props: Props) {
  const { t } = useT();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const latest = useRef({ ...props, t });
  const refresh = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    latest.current = { ...props, t };
    refresh.current();
  }, [props, t]);

  useEffect(() => {
    if (!container.current) return;
    const initial = latest.current;
    const spawn = initial.room.world?.locations[initial.room.world.spawn];
    let map: MlMap;
    try {
      map = new maplibregl.Map({ container: container.current, style: BASEMAP.style,
        center: [spawn?.lng ?? 103.8483, spawn?.lat ?? 1.3508], zoom: 14,
        minZoom: 10, maxZoom: 19, attributionControl: false, pitchWithRotate: false,
        maxBounds: [[103.55, 1.15], [104.15, 1.52]], });
    } catch { setFailed(true); setLoading(false); return; }
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    const sites = new Map<string, Marker>();
    const squad = new Map<string, Marker>();
    let groundMarker: Marker | null = null;
    let previousSpawn = '';
    let fogKey = '';
    let routeKey = '';
    const fog = new FogGeometry();
    const uninstall: (() => void)[] = [];

    const update = () => {
      const { room, me, selected, ground, t: translate } = latest.current;
      const world = room.world;
      if (!world || !map.isStyleLoaded()) return;
      if (room.phase === 'lobby' && previousSpawn !== world.spawn) {
        const next = world.locations[world.spawn];
        const duration = previousSpawn ? 700 : 0;
        previousSpawn = world.spawn;
        if (next) map.easeTo({ center: [next.lng, next.lat], zoom: 14, duration });
      }
      previousSpawn = world.spawn;
      // Network snapshots recreate arrays. Coordinate identity prevents repeated
      // polygon unions while only clocks, meters or command state change.
      const nextFogKey = world.explored.map(p => `${p.lat},${p.lng}`).join(';');
      if (nextFogKey !== fogKey || !fogKey) {
        fogKey = nextFogKey;
        const explored = world.explored.map(p => ({ ...p, radius: ISLAND_SIGHT_M }));
        const bands = fog.compute(explored, { lat: 0, lng: 0, radius: 0 });
        bands.forEach((data, n) => setData(map, `coop-fog-${n}`, data));
      }
      const bounds = map.getBounds();
      const box = padBox({ south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() }, 0.2);
      const visible = new Set<string>();
      const zoom = map.getZoom();
      // Only discovered sites are in this record; hidden POIs never become DOM.
      for (const site of Object.values(world.locations)) {
        if (site.interior) continue;
        if (!boxContains(box, site.lat, site.lng) || visible.size >= 450) continue;
        visible.add(site.id);
        let marker = sites.get(site.id);
        if (!marker) {
          const element = document.createElement('button');
          element.type = 'button';
          element.className = 'flex max-w-48 flex-col items-center gap-1 rounded-sm p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal';
          element.addEventListener('click', event => { event.stopPropagation(); latest.current.onSelect(site.id); });
          marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([site.lng, site.lat]).addTo(map);
          sites.set(site.id, marker);
        }
        const element = marker.getElement();
        const name = site.id.startsWith('trek:') ? translate('ui.coopIsland.trekPoint') : site.name;
        element.setAttribute('aria-label', name);
        element.setAttribute('aria-pressed', String(site.id === selected));
        const objective = site.id === world.evac;
        const showLabel = zoom >= 15 || site.id === selected || site.id === me.site || objective || site.id === world.spawn;
        const presentationKey = `${name}:${site.id === selected}:${site.id === me.site}:${objective}:${showLabel}`;
        if (element.dataset.presentation !== presentationKey) {
          element.dataset.presentation = presentationKey;
          element.replaceChildren();
          const pin = document.createElement('span');
          pin.style.cssText = `display:block;width:${objective ? 14 : 10}px;height:${objective ? 14 : 10}px;transform:rotate(45deg);border:1px solid ${site.id === selected ? '#ffffff' : objective ? '#dfc780' : '#b2c0b2'};background:${site.id === selected ? '#e9edda' : site.id === me.site ? '#91c7bb' : '#1e2925'};box-shadow:0 0 0 ${site.id === selected ? 4 : 2}px #0a100acc;`;
          element.append(pin);
          if (showLabel) {
            const label = document.createElement('span');
            label.style.cssText = `${typeCss('body')}max-width:12rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#080d08e8;color:${objective ? '#dfc780' : '#e9edda'};padding:2px 5px;`;
            label.textContent = name;
            element.append(label);
          }
        }
      }
      for (const [id, marker] of sites) if (!visible.has(id)) { marker.remove(); sites.delete(id); }
      for (const player of room.players) {
        const point = survivorPoint(room, player);
        if (!point || player.status === 'extracted' || player.status === 'dead') {
          squad.get(player.id)?.remove(); squad.delete(player.id); continue;
        }
        let marker = squad.get(player.id);
        if (!marker) {
          const element = document.createElement('button');
          element.type = 'button';
          element.className = 'rounded-sm border px-2 py-1 shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal';
          element.style.cssText = typeCss('label');
          element.addEventListener('click', event => {
            event.stopPropagation();
            const current = latest.current.room.players.find(p => p.id === player.id);
            if (current) latest.current.onSelect(current.site);
          });
          marker = new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, -14] })
            .setLngLat([point.lng, point.lat]).addTo(map);
          squad.set(player.id, marker);
        }
        marker.setLngLat([point.lng, point.lat]);
        const element = marker.getElement();
        // MapLibre owns this element's transform; replacing cssText here would
        // erase its screen position after every authoritative snapshot.
        element.style.color = player.status === 'downed' ? '#fca5a5' : player.id === me.id ? '#a8ddd0' : '#e9edda';
        element.style.borderColor = 'currentColor';
        element.style.backgroundColor = '#101a15';
        element.textContent = `${player.status === 'downed' ? '✚' : '●'} ${player.name}`;
        element.setAttribute('aria-label', translate('ui.coopIsland.survivorMarker', { name: player.name, status: translate(`ui.coop.status.${player.status}`) }));
      }
      const nextRouteKey = room.players.map(player => `${player.id}:${player.action?.kind}:${player.action?.startedAt}:${player.action?.target}`).join(';');
      if (nextRouteKey !== routeKey) {
        routeKey = nextRouteKey;
        const routes = room.players.flatMap(player => player.action?.kind === 'travel' && (player.action.route?.length ?? 0) > 1
          ? [lineFeature(player.action.route!, { own: player.id === me.id })] : []);
        setData(map, 'coop-routes', fc(routes));
      }
      groundMarker?.remove();
      groundMarker = null;
      if (ground) {
        const element = document.createElement('span');
        element.style.cssText = `${typeCss('body')}color:#dfc780;background:#101510;padding:4px 8px;border:1px dashed #dfc780;`;
        element.textContent = translate('ui.coopIsland.trekPoint');
        groundMarker = new maplibregl.Marker({ element }).setLngLat([ground.lng, ground.lat]).addTo(map);
      }
    };

    map.once('load', () => {
      for (const slot of SLOTS) map.addLayer({ id: slotId(slot), type: 'background', layout: { visibility: 'none' } });
      for (const layer of map.getStyle().layers) if (layer.type === 'symbol') map.moveLayer(layer.id, slotId('labels'));
      uninstall.push(installOverlay(map, 'fog', Object.fromEntries([0, 1, 2].map(n => [`coop-fog-${n}`, 'geojson' as const])),
        [0, 1, 2].map(n => ({ id: `coop-fog-fill-${n}`, type: 'fill' as const, source: `coop-fog-${n}`,
          paint: { 'fill-color': FOG_COLOUR, 'fill-opacity': bandOpacity(FOG_TOTAL) } }))));
      uninstall.push(installOverlay(map, 'trail', { 'coop-routes': { type: 'geojson', data: EMPTY_FC } }, [
        { id: 'coop-route-line', type: 'line', source: 'coop-routes', paint: {
          'line-color': ['case', ['get', 'own'], '#a8ddd0', '#dfc780'], 'line-width': 3, 'line-opacity': 0.8, 'line-dasharray': [2, 2],
        } },
      ]));
      refresh.current = update;
      update();
      setLoading(false);
      setFailed(false);
    });
    map.on('moveend', update);
    map.on('click', event => latest.current.onGround({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
    map.on('error', () => { setFailed(true); setLoading(false); });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      refresh.current = () => {};
      for (const marker of sites.values()) marker.remove();
      for (const marker of squad.values()) marker.remove();
      groundMarker?.remove();
      uninstall.forEach(remove => remove());
      markRemoved(map);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function focus(id: string) {
    const point = id === props.me.site ? survivorPoint(props.room, props.me) : props.room.world?.locations[id];
    if (point) mapRef.current?.easeTo({ center: [point.lng, point.lat], zoom: 15, duration: 600 });
    props.onSelect(id);
  }

  return <>
    <div ref={container} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label={t('ui.coopIsland.mapAria')} />
    <div className="absolute right-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap justify-end gap-2">
      <button type="button" className="min-h-11 border border-white/25 bg-concrete-950/95 px-3 py-2 text-body text-signal" onClick={() => focus(props.me.site)}>{t('ui.coopIsland.locateMe')}</button>
      <button type="button" className="min-h-11 border border-white/25 bg-concrete-950/95 px-3 py-2 text-body text-signal" onClick={() => focus(props.room.world!.evac)}>{t('ui.coopIsland.evacObjective')}</button>
    </div>
    {loading && <p role="status" className="absolute bottom-10 left-3 bg-concrete-950/95 p-3 text-body text-white/60">{t('ui.coopIsland.mapLoading')}</p>}
    {failed && <p role="status" className="absolute bottom-10 left-3 max-w-xs border border-hiss/40 bg-concrete-950/95 p-3 text-body text-red-200">{t('ui.coopIsland.mapUnavailable')}</p>}
  </>;
}

export default function IslandMap(props: Props) {
  return <section className="relative h-[55dvh] min-h-80 overflow-hidden border border-white/15 bg-concrete-950 lg:h-[calc(100dvh-15rem)] lg:min-h-[32rem]">
    <MapCanvas {...props} />
  </section>;
}
