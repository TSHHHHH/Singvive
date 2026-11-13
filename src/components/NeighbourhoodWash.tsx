import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Feature } from 'geojson';
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
import { useLayerEvent, useMapGL, useMapEvent } from '../map/hooks';
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

/** Whether the island overlay is on. Updates only on change. */
function useIslandZoom(): boolean {
  const map = useMapGL();
  const [island, setIsland] = useState(() => islandOverlayOn(map.getZoom()));
  useMapEvent('zoom', () => setIsland(islandOverlayOn(map.getZoom())));
  return island;
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

const HOVER: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];

function TownPolygonLayer({ areas, pressureByTown }: { areas: TownArea[]; pressureByTown: Map<string, number> }) {
  const map = useMapGL();

  useEffect(
    () =>
      installOverlay(map, 'wash', { 'town-src': 'geojson' }, [
        {
          id: 'town-fill',
          type: 'fill',
          source: 'town-src',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': zoomFade(['case', HOVER, ['min', 0.92, ['+', ['get', 'op'], 0.14]], ['get', 'op']]),
          },
        },
        {
          id: 'town-line',
          type: 'line',
          source: 'town-src',
          paint: {
            'line-color': ['case', HOVER, '#e8e5dd', '#050508'],
            'line-width': ['case', HOVER, 1.5, 1],
            'line-opacity': zoomFade(['case', HOVER, 0.85, 0.55]),
          },
        },
      ]),
    [map],
  );

  useEffect(() => {
    const features: Feature[] = [];
    areas.forEach((area, id) => {
      const tier = townTier(pressureByTown.get(area.townId) ?? 0);
      for (const rings of area.polygons) {
        // Every polygon of one area shares its id, so hover lights the whole area.
        features.push({
          type: 'Feature',
          id,
          properties: { color: TIER_SWATCH[tier], op: TIER_FILL_OPACITY[tier], name: area.name, tier },
          geometry: { type: 'Polygon', coordinates: rings.map(toLngLatRing) },
        });
      }
    });
    setData(map, 'town-src', fc(features));
  }, [map, areas, pressureByTown]);

  return <TownHoverTip />;
}

interface HoverInfo {
  id: number;
  name: string;
  tier: TownTier;
}

/**
 * Hovering an area names it and its tier. Replaces always-on labels, which
 * piled up over the island. Content changes only when the area does; the
 * position is written straight to the element.
 */
function TownHoverTip() {
  const { t } = useT();
  const map = useMapGL();
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const hoverId = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const clear = () => {
    if (hoverId.current != null) map.setFeatureState({ source: 'town-src', id: hoverId.current }, { hover: false });
    hoverId.current = null;
    setHover(null);
  };

  useLayerEvent('mousemove', 'town-fill', (e) => {
    const f = e.features?.[0];
    if (!f || typeof f.id !== 'number' || !islandOverlayOn(map.getZoom() + FADE_SPAN / 2)) {
      clear();
      return;
    }
    if (hoverId.current !== f.id) {
      if (hoverId.current != null) map.setFeatureState({ source: 'town-src', id: hoverId.current }, { hover: false });
      hoverId.current = f.id;
      map.setFeatureState({ source: 'town-src', id: f.id }, { hover: true });
      const p = f.properties as { name: string; tier: TownTier };
      setHover({ id: f.id, name: p.name, tier: p.tier });
    }
    if (boxRef.current) boxRef.current.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
  });
  useLayerEvent('mouseleave', 'town-fill', clear);
  useMapEvent('zoomstart', clear);
  useMapEvent('dragstart', clear);

  return createPortal(
    <div
      ref={boxRef}
      className="pointer-events-none absolute left-0 top-0 z-[520] rounded border border-white/20 bg-concrete-900/95 px-2 py-1.5 shadow-signage backdrop-blur-sm"
      style={{ display: hover ? 'block' : 'none' }}
      role="tooltip"
    >
      {hover && (
        <>
          <div className="whitespace-nowrap text-body text-concrete-50">{hover.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-micro" style={{ color: TIER_LABEL[hover.tier] }}>
            <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: TIER_SWATCH[hover.tier] }} />
            {t(`ui.town.${hover.tier}`)}
          </div>
        </>
      )}
    </div>,
    map.getContainer(),
  );
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
  const island = useIslandZoom();
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
      <TownStatusLegend visible={island} />
    </>
  );
}
