import { useEffect, useState } from 'react';
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { FeatureCollection } from 'geojson';
import type { ZonesData, ZoneRing } from '../game/playable';
import { ensureZonesLoaded, getZones, seaMaskOuter } from '../game/playable';
import { useT } from '../i18n';
import { useMapGL } from '../map/hooks';
import { installOverlay, setData } from '../map/layers';
import { EMPTY_FC, toLngLatRing } from '../map/geo';
import { withoutCrossingDecks } from '../map/crossingGeometry';
import { getBorder, loadBorder } from '../map/borderData';

/**
 * Terrain washes from the zones bake: open sea, inland water, restricted
 * ground and vegetation. Each class is unioned once into a single
 * MultiPolygon, so overlapping OSM rings never stack their opacity (the old
 * Leaflet build painted rasters for the same reason).
 *
 * All of it sits in slot `terrain`, under the fog: only explored greenery reads.
 */

const WATER = { color: '#4d7a8c', opacity: 0.48 };
const RESTRICTED = { color: '#6b4a32', opacity: 0.42 };
const VEGETATION = { color: '#2f5a38', opacity: 0.38 };
/** The run map's water: a low-saturation dark blue-grey, so the coast and
 *  reservoirs read as water without competing with faction / hazard colours. */
const RUN_WATER = { color: '#1a242c', opacity: 0.7 };
/** The run map's greenery: a dark green-grey, read as texture, not colour. */
const RUN_VEGETATION = { color: '#26302a', opacity: 0.45 };

const toPoly = (ring: ZoneRing): Polygon | null => (ring.length >= 3 ? [toLngLatRing(ring)] : null);
const polys = (rings: ZoneRing[]) => rings.map(toPoly).filter((p): p is Polygon => !!p);

function union(rings: ZoneRing[]): MultiPolygon {
  const ps = polys(rings);
  if (!ps.length) return [];
  try {
    return polygonClipping.union(ps[0], ...ps.slice(1));
  } catch {
    // Degenerate OSM ring: fall back to the raw rings (opacity may stack).
    return ps;
  }
}

const asFc = (m: MultiPolygon): FeatureCollection =>
  m.length
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: m } }] }
    : EMPTY_FC;

interface Terrain {
  sea: FeatureCollection;
  water: FeatureCollection;
  restricted: FeatureCollection;
  vegetation: FeatureCollection;
}

/** Raw water geometry, kept so the deck cut-out can run later. */
interface WaterShapes {
  sea: MultiPolygon;
  water: MultiPolygon;
}

/** Unions are a one-off ~50 ms; keep them for the page's lifetime. */
const terrainCache = new WeakMap<ZonesData, Terrain>();
const shapesCache = new WeakMap<ZonesData, WaterShapes>();
const deckCutCache = new WeakMap<ZonesData, Pick<Terrain, 'sea' | 'water'>>();
const vegCache = new WeakMap<ZonesData, FeatureCollection>();

function vegetationOf(zones: ZonesData): FeatureCollection {
  let v = vegCache.get(zones);
  if (!v) {
    v = asFc(union(zones.vegetation ?? []));
    vegCache.set(zones, v);
  }
  return v;
}

function waterShapesOf(zones: ZonesData): WaterShapes {
  const hit = shapesCache.get(zones);
  if (hit) return hit;
  let sea: MultiPolygon = [];
  const outer = toPoly(seaMaskOuter());
  if (outer) {
    const land = polys(zones.land);
    try {
      sea = land.length ? polygonClipping.difference(outer, ...land) : [outer];
    } catch {
      sea = [];
    }
  }
  const shapes = { sea, water: union(zones.water) };
  shapesCache.set(zones, shapes);
  return shapes;
}

/** The tint without bridge cut-outs: cheap, shown at once. */
function terrainOf(zones: ZonesData): Terrain {
  const hit = terrainCache.get(zones);
  if (hit) return hit;
  const { sea, water } = waterShapesOf(zones);
  const t: Terrain = {
    sea: asFc(sea),
    water: asFc(water),
    restricted: asFc(union(zones.restricted)),
    vegetation: vegetationOf(zones),
  };
  terrainCache.set(zones, t);
  return t;
}

/** Sea and water with walkable decks cleared (~300 ms once with ~1200 bridges). */
function deckCutOf(zones: ZonesData): Pick<Terrain, 'sea' | 'water'> {
  const hit = deckCutCache.get(zones);
  if (hit) return hit;
  const { sea, water } = waterShapesOf(zones);
  const cut = { sea: asFc(withoutCrossingDecks(sea)), water: asFc(withoutCrossingDecks(water)) };
  deckCutCache.set(zones, cut);
  return cut;
}

/**
 * Show the plain tint now and the deck cut-outs when the browser is idle, so
 * the bridge clipping never stalls the first map frame. Returns a cancel.
 */
function withDeckCut(zones: ZonesData, apply: (t: Pick<Terrain, 'sea' | 'water'>) => void): () => void {
  const ready = deckCutCache.get(zones);
  if (ready) {
    apply(ready);
    return () => {};
  }
  const t = terrainOf(zones);
  apply(t);
  const run = () => apply(deckCutOf(zones));
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 2000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(run, 50);
  return () => clearTimeout(id);
}

function johorOf(scene: ReturnType<typeof getBorder>): Polygon | null {
  const g = scene?.johor.features[0]?.geometry;
  return g?.type === 'Polygon' ? (g.coordinates as Polygon) : null;
}

/** The run map's sea minus Johor's land; computed once per page. */
let seaCut: { from: FeatureCollection; to: FeatureCollection } | null = null;
function seaWithout(sea: FeatureCollection, land: Polygon): FeatureCollection {
  if (seaCut?.from === sea) return seaCut.to;
  const g = sea.features[0]?.geometry;
  let to = sea;
  if (g?.type === 'MultiPolygon') {
    try {
      to = asFc(polygonClipping.difference(g.coordinates as MultiPolygon, land));
    } catch {
      to = sea;
    }
  }
  seaCut = { from: sea, to };
  return to;
}

const fillLayer = (id: string, source: string, s: { color: string; opacity: number }) => ({
  id,
  type: 'fill' as const,
  source,
  paint: { 'fill-color': s.color, 'fill-opacity': s.opacity, 'fill-antialias': false },
});

/**
 * The in-run world map's terrain read: water (sea and reservoirs) and the
 * soft-cost forest wash. Loads zones if needed; fog sits above so only
 * explored ground reads. All static: data is set once. Roads come from the
 * basemap itself, re-toned at load (map/basemapTone.ts).
 */
export function VegetationOverlay() {
  const map = useMapGL();
  const [zones, setZones] = useState<ZonesData | null>(getZones);

  useEffect(() => {
    if (zones) return;
    let cancelled = false;
    void ensureZonesLoaded()
      .then((z) => {
        if (!cancelled) setZones(z);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [zones]);

  useEffect(
    () =>
      installOverlay(map, 'terrain', { 'run-water-src': 'geojson', 'veg-src': 'geojson' }, [
        fillLayer('run-water-fill', 'run-water-src', RUN_WATER),
        fillLayer('veg-fill', 'veg-src', RUN_VEGETATION),
      ]),
    [map],
  );
  // Johor Bahru is land, not sea: the border set piece cuts it out of the
  // run map's water so its shore and the Causeway embankment read as ground.
  const [johor, setJohor] = useState<Polygon | null>(() => johorOf(getBorder()));
  useEffect(() => {
    if (johor) return;
    let live = true;
    void loadBorder()
      .then((b) => {
        if (live) setJohor(johorOf(b));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [johor]);

  useEffect(() => {
    if (!zones) return;
    setData(map, 'veg-src', terrainOf(zones).vegetation);
    return withDeckCut(zones, (t) =>
      setData(map, 'run-water-src', {
        type: 'FeatureCollection',
        features: [...(johor ? seaWithout(t.sea, johor) : t.sea).features, ...t.water.features],
      }),
    );
  }, [map, zones, johor]);

  return null;
}

/**
 * Spawn-only wash: open sea + inland water + restricted + vegetation.
 * Non-interactive so the ground click keeps the picks.
 */
export function UnplayableOverlay({ zones }: { zones: ZonesData }) {
  const map = useMapGL();

  useEffect(
    () =>
      installOverlay(
        map,
        'terrain',
        { 'zone-sea': 'geojson', 'zone-water': 'geojson', 'zone-restricted': 'geojson', 'zone-veg': 'geojson' },
        [
          fillLayer('zone-sea-fill', 'zone-sea', WATER),
          fillLayer('zone-veg-fill', 'zone-veg', VEGETATION),
          fillLayer('zone-water-fill', 'zone-water', WATER),
          fillLayer('zone-restricted-fill', 'zone-restricted', RESTRICTED),
        ],
      ),
    [map],
  );

  useEffect(() => {
    const t = terrainOf(zones);
    setData(map, 'zone-restricted', t.restricted);
    setData(map, 'zone-veg', t.vegetation);
    return withDeckCut(zones, (w) => {
      setData(map, 'zone-sea', w.sea);
      setData(map, 'zone-water', w.water);
    });
  }, [map, zones]);

  return null;
}

/** Corner legend for the spawn map. */
export function UnplayableLegend() {
  const { t } = useT();
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded border border-white/15 bg-black/70 px-2.5 py-2 text-body leading-relaxed text-white/75 backdrop-blur-sm">
      <div className="mb-1 font-semibold text-white/90">{t('ui.terrain.title')}</div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#4d7a8c]" />
        {t('ui.terrain.water')}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#6b4a32]" />
        {t('ui.terrain.restricted')}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#2f5a38]" />
        {t('ui.terrain.vegetation')}
      </div>
    </div>
  );
}
