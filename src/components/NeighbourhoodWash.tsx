import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Marker, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
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

const TOWN_PANE = 'singvive-towns';
const TOWN_PANE_Z = 430;

/**
 * Zoom at which the map stops being a street and becomes a situation overlay.
 * 13+ stays clean; 12 and below is the island front.
 */
export const ISLAND_STATUS_ZOOM = 13;

/** Match Leaflet's `.leaflet-zoom-anim` duration so the wash eases with the tiles. */
const FADE_MS = 250;
const FADE_EASE = 'cubic-bezier(0, 0, 0.25, 1)';
const FADE_TRANSITION = `opacity ${FADE_MS}ms ${FADE_EASE}`;

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

function islandOverlayOn(zoom: number): boolean {
  return zoom < ISLAND_STATUS_ZOOM;
}

function ensureTownPane(map: L.Map): HTMLElement {
  const existing = map.getPane(TOWN_PANE);
  if (existing) return existing;
  const pane = map.createPane(TOWN_PANE);
  pane.style.zIndex = String(TOWN_PANE_Z);
  pane.style.pointerEvents = 'none';
  pane.classList.toggle('is-wash-off', !islandOverlayOn(map.getZoom()));
  return pane;
}

function useMapZoom(): number {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({
    // Recalc after the animation — per-frame zoom rebuilt polygons + labels.
    zoomend: (e) => setZoom(e.target.getZoom()),
  });
  return zoom;
}

/**
 * Fade the town pane with Leaflet's zoom animation. Class is toggled from
 * `zoomanim` (destination zoom) so the ease starts with the tiles. Layers stay
 * mounted so fade-in has painted polygons. `filter: opacity()` groups Leaflet's
 * zoom-transformed canvas; pane `opacity` alone leaves those layers painted.
 */
function TownPaneGate() {
  const map = useMap();
  ensureTownPane(map);

  useLayoutEffect(() => {
    const pane = map.getPane(TOWN_PANE);
    if (!pane) return;
    pane.style.pointerEvents = 'none';

    let animating = false;

    const apply = (zoom: number, instant: boolean) => {
      if (instant) pane.classList.add('is-wash-instant');
      pane.classList.toggle('is-wash-off', !islandOverlayOn(zoom));
      if (instant) {
        void pane.getBoundingClientRect();
        pane.classList.remove('is-wash-instant');
      }
    };

    apply(map.getZoom(), true);

    const onAnim = (e: L.ZoomAnimEvent) => {
      animating = true;
      if (typeof e.zoom === 'number') apply(e.zoom, false);
    };
    const onZoom = () => {
      // Wheel/dblclick: zoomanim already set the destination. Pinch has no
      // zoomanim, so follow live zoom.
      if (animating) return;
      apply(map.getZoom(), false);
    };
    const onEnd = () => {
      animating = false;
      apply(map.getZoom(), false);
    };

    map.on('zoomanim', onAnim);
    map.on('zoom', onZoom);
    map.on('zoomend', onEnd);
    return () => {
      map.off('zoomanim', onAnim);
      map.off('zoom', onZoom);
      map.off('zoomend', onEnd);
    };
  }, [map]);

  return null;
}

function TownPolygonLayer({
  areas,
  pressureByTown,
}: {
  areas: TownArea[];
  pressureByTown: Map<string, number>;
}) {
  const map = useMap();
  ensureTownPane(map);

  return (
    <>
      {areas.flatMap((area) => {
        const tier = townTier(pressureByTown.get(area.townId) ?? 0);
        return area.polygons.map((rings, i) => (
          <Polygon
            key={`${area.name}-${i}`}
            positions={rings}
            pane={TOWN_PANE}
            interactive={false}
            pathOptions={{
              stroke: true,
              color: '#050508',
              weight: 1,
              opacity: 0.55,
              fillColor: TIER_SWATCH[tier],
              fillOpacity: TIER_FILL_OPACITY[tier],
              interactive: false,
            }}
          />
        ));
      })}
    </>
  );
}

function TownLabelLayer({
  pressures,
  zoom,
}: {
  pressures: number[];
  zoom: number;
}) {
  const { t } = useT();
  const map = useMap();
  ensureTownPane(map);

  const tight = zoom < 11;
  const namePx = tight ? 9 : 11;
  const tierPx = tight ? 8 : 9;
  return (
    <>
      {TOWNS.map((town, i) => {
        const tier = townTier(pressures[i] ?? 0);
        const color = TIER_LABEL[tier];
        const tierName = t(`ui.town.${tier}`);
        const icon = L.divIcon({
          className: '',
          html: `<div style="
              transform:translate(-50%,-50%);
              text-align:center;pointer-events:none;
              text-shadow:0 1px 3px #000,0 0 8px #000;
            ">
              <div style="
                font-size:${namePx}px;font-weight:700;letter-spacing:0.06em;
                text-transform:uppercase;color:${color};white-space:nowrap;opacity:0.95;
              ">${town.name}</div>
              <div style="
                font-size:${tierPx}px;font-weight:600;letter-spacing:0.04em;
                text-transform:uppercase;color:${color};opacity:0.8;margin-top:1px;
              ">${tierName}</div>
            </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        return (
          <Marker
            key={town.id}
            position={[town.lat, town.lng]}
            icon={icon}
            interactive={false}
            pane={TOWN_PANE}
            alt={`${town.name} · ${tierName}`}
          />
        );
      })}
    </>
  );
}

function TownStatusLegend({ visible }: { visible: boolean }) {
  const { t } = useT();
  const map = useMap();
  return createPortal(
    <div
      className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded border border-white/15 bg-black/75 px-2.5 py-2 text-[11px] leading-relaxed text-white/75 backdrop-blur-sm"
      style={{ opacity: visible ? 1 : 0, transition: FADE_TRANSITION }}
    >
      <div className="mb-1 font-medium uppercase tracking-widest text-white/90">
        {t('ui.town.legendTitle')}
      </div>
      {TOWN_TIER_ORDER.map((tier) => (
        <div key={tier} className="mt-0.5 flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: TIER_SWATCH[tier] }}
          />
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
  const zoom = useMapZoom();
  const island = islandOverlayOn(zoom);
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
      <TownPaneGate />
      {areas && areas.length > 0 && (
        <TownPolygonLayer areas={areas} pressureByTown={pressureByTown} />
      )}
      <TownLabelLayer pressures={pressures} zoom={zoom} />
      <TownStatusLegend visible={island} />
    </>
  );
}
