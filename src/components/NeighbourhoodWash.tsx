import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Marker, type ExpressionSpecification } from 'maplibre-gl';
import type { Feature } from 'geojson';
import { typeCss } from '../ui/type';
import {
  TOWNS,
  TOWN_TIER_ORDER,
  getTown,
  townPressure,
  townTier,
  type TownTier,
} from '../game/townField';
import { useGame } from '../game/store';
import { useT } from '../i18n';
import { useMapGL, useMapEvent } from '../map/hooks';
import { installOverlay, setData } from '../map/layers';
import { fc, toLngLatRing } from '../map/geo';

/**
 * Zoom at which the map stops being a street and becomes a situation overlay.
 * 12+ stays clean; below it is the island front. (MapLibre zoom: Leaflet − 1.)
 */
export const ISLAND_STATUS_ZOOM = 12;

/** The wash fades across this much zoom, so it eases in with the pinch. */
const FADE_SPAN = 0.5;
const FADE_MS = 250;
const FADE_TRANSITION = `opacity ${FADE_MS}ms cubic-bezier(0, 0, 0.25, 1)`;

const TIER_FILL_OPACITY: Record<TownTier, number> = {
  stirring: 0.32,
  restless: 0.48,
  massing: 0.58,
  fallen: 0.7,
  lost: 0.82,
};

const TIER_SWATCH: Record<TownTier, string> = {
  stirring: '#969e94',
  restless: '#c9a848',
  massing: '#d9683d',
  fallen: '#b02424',
  lost: '#5a0a0a',
};

const TIER_LABEL: Record<TownTier, string> = {
  stirring: '#c8ccc4',
  restless: '#e0c56a',
  massing: '#e07a48',
  fallen: '#e05050',
  lost: '#ff6a6a',
};

type LatLng = [number, number];
type Ring = LatLng[];
type Poly = Ring[];

export interface TownArea {
  name: string;
  townId: string;
  polygons: Poly[];
}

interface TownAreasFile {
  areas: TownArea[];
}

let areasCache: TownArea[] | null = null;
let areasPending: Promise<TownArea[]> | null = null;

function loadTownAreas(): Promise<TownArea[]> {
  if (areasCache) return Promise.resolve(areasCache);
  if (!areasPending) {
    areasPending = fetch(`${import.meta.env.BASE_URL}towns.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`towns.json ${res.status}`);
        return res.json() as Promise<TownAreasFile>;
      })
      .then((data) => {
        const areas = Array.isArray(data.areas) ? data.areas : [];
        areasCache = areas;
        return areas;
      })
      .catch((err: unknown) => {
        areasPending = null;
        throw err;
      });
  }
  return areasPending;
}

function useTownAreas(): TownArea[] | null {
  const [areas, setAreas] = useState<TownArea[] | null>(areasCache);
  useEffect(() => {
    if (areasCache) return;
    let live = true;
    void loadTownAreas()
      .then((next) => {
        if (live) setAreas(next);
      })
      .catch(() => {
        if (live) setAreas([]);
      });
    return () => {
      live = false;
    };
  }, []);
  return areas;
}

const islandOverlayOn = (zoom: number) => zoom < ISLAND_STATUS_ZOOM;

/** Whether the island overlay is on, and whether labels should shrink. Updates only on change. */
function useIslandZoom(): { island: boolean; dense: boolean } {
  const map = useMapGL();
  const read = () => {
    const z = map.getZoom();
    return { island: islandOverlayOn(z), dense: z < 10 };
  };
  const [state, setState] = useState(read);
  useMapEvent('zoom', () => {
    const next = read();
    setState((s) => (s.island === next.island && s.dense === next.dense ? s : next));
  });
  return state;
}

/** Zoom-driven fade: full value below the threshold, gone by it. */
const zoomFade = (value: ExpressionSpecification | number): ExpressionSpecification => [
  'interpolate',
  ['linear'],
  ['zoom'],
  ISLAND_STATUS_ZOOM - FADE_SPAN,
  value,
  ISLAND_STATUS_ZOOM,
  0,
];

function TownPolygonLayer({ areas, pressureByTown }: { areas: TownArea[]; pressureByTown: Map<string, number> }) {
  const map = useMapGL();

  useEffect(
    () =>
      installOverlay(map, 'wash', { 'town-src': 'geojson' }, [
        {
          id: 'town-fill',
          type: 'fill',
          source: 'town-src',
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': zoomFade(['get', 'op']) },
        },
        {
          id: 'town-line',
          type: 'line',
          source: 'town-src',
          paint: { 'line-color': '#050508', 'line-width': 1, 'line-opacity': zoomFade(0.55) },
        },
      ]),
    [map],
  );

  useEffect(() => {
    const features: Feature[] = [];
    for (const area of areas) {
      const tier = townTier(pressureByTown.get(area.townId) ?? 0);
      for (const rings of area.polygons) {
        features.push({
          type: 'Feature',
          properties: { color: TIER_SWATCH[tier], op: TIER_FILL_OPACITY[tier] },
          geometry: { type: 'Polygon', coordinates: rings.map(toLngLatRing) },
        });
      }
    }
    setData(map, 'town-src', fc(features));
  }, [map, areas, pressureByTown]);

  return null;
}

function labelHtml(name: string, tierName: string, color: string, scale: number) {
  return `<div style="
      transform:translate(-50%,-50%);
      text-align:center;pointer-events:none;
      text-shadow:0 1px 3px #000,0 0 8px #000;
    ">
      <div style="
        ${typeCss('label', { scale })}
        text-transform:uppercase;color:${color};white-space:nowrap;opacity:0.95;
      ">${name}</div>
      <div style="
        ${typeCss('micro', { scale })}
        text-transform:uppercase;color:${color};opacity:0.8;margin-top:1px;
      ">${tierName}</div>
    </div>`;
}

/**
 * Town names over the wash. Kept as DOM markers (type stays on the type.ts
 * scale, no glyph fonts); built once, restyled in place, faded with CSS.
 */
function TownLabelLayer({ pressures, island, dense }: { pressures: number[]; island: boolean; dense: boolean }) {
  const { t } = useT();
  const map = useMapGL();
  const markers = useRef(new Map<string, { marker: Marker; inner: HTMLDivElement }>());

  useEffect(() => {
    const own = markers.current;
    for (const town of TOWNS) {
      const el = document.createElement('div');
      el.style.width = '0';
      el.style.height = '0';
      el.style.pointerEvents = 'none';
      const inner = document.createElement('div');
      inner.style.transition = FADE_TRANSITION;
      el.appendChild(inner);
      const marker = new Marker({ element: el, anchor: 'top-left' }).setLngLat([town.lng, town.lat]).addTo(map);
      own.set(town.id, { marker, inner });
    }
    return () => {
      for (const { marker } of own.values()) marker.remove();
      own.clear();
    };
  }, [map]);

  // Dense zooms shrink the labels as a fraction of the role, so they still
  // track the Font size setting.
  const scale = dense ? 0.85 : 1;
  useEffect(() => {
    TOWNS.forEach((town, i) => {
      const m = markers.current.get(town.id);
      if (!m) return;
      const tier = townTier(pressures[i] ?? 0);
      const tierName = t(`ui.town.${tier}`);
      m.inner.innerHTML = labelHtml(town.name, tierName, TIER_LABEL[tier], scale);
      m.inner.setAttribute('aria-label', `${town.name} · ${tierName}`);
    });
  }, [pressures, scale, t]);

  useEffect(() => {
    for (const { inner } of markers.current.values()) inner.style.opacity = island ? '1' : '0';
  }, [island]);

  return null;
}

function TownStatusLegend({ visible }: { visible: boolean }) {
  const { t } = useT();
  const map = useMapGL();
  return createPortal(
    <div
      className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded border border-white/15 bg-black/75 px-2.5 py-2 text-body leading-relaxed text-white/75 backdrop-blur-sm"
      style={{ opacity: visible ? 1 : 0, transition: FADE_TRANSITION }}
    >
      <div className="mb-1 text-plate uppercase text-white/90">{t('ui.town.legendTitle')}</div>
      {TOWN_TIER_ORDER.map((tier) => (
        <div key={tier} className="mt-0.5 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: TIER_SWATCH[tier] }} />
          {t(`ui.town.${tier}`)}
        </div>
      ))}
    </div>,
    map.getContainer(),
  );
}

/**
 * Island neighbourhood wash — URA planning-area shapes, readable through fog
 * like the MRT overlay. Only draws when the island fits in view. Spawn select
 * does not mount this.
 */
export function NeighbourhoodWash() {
  const seed = useGame((s) => s.seed);
  const groundZeroId = useGame((s) => s.groundZeroId);
  const hordeLevel = useGame((s) => s.hordeLevel);
  const { island, dense } = useIslandZoom();
  const areas = useTownAreas();

  const pressures = useMemo(() => {
    if (!groundZeroId || !getTown(groundZeroId)) return null;
    return TOWNS.map((t) => townPressure(seed, groundZeroId, hordeLevel, t.id));
  }, [seed, groundZeroId, hordeLevel]);

  const pressureByTown = useMemo(() => {
    const map = new Map<string, number>();
    if (!pressures) return map;
    for (let i = 0; i < TOWNS.length; i++) {
      map.set(TOWNS[i].id, pressures[i] ?? 0);
    }
    return map;
  }, [pressures]);

  if (!pressures) return null;

  return (
    <>
      {areas && areas.length > 0 && <TownPolygonLayer areas={areas} pressureByTown={pressureByTown} />}
      <TownLabelLayer pressures={pressures} island={island} dense={dense} />
      <TownStatusLegend visible={island} />
    </>
  );
}
