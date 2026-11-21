import type { Feature, FeatureCollection } from 'geojson';
import {
  type FilterSpecification,
  type GeoJSONSource,
  type LngLat,
  type Map as MlMap,
  type MapSourceDataEvent,
} from 'maplibre-gl';
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { DestructionTier, PoiCategory } from '../game/types';
import { BASEMAP, GROUND_COLOR, slotId } from './mapStyle';
import { FOG_COLOUR, FOG_TOTAL } from './fogGeometry';
import { anchorOf, dimHex, inDisc, mixHex, pointInRing, pxPerMetre, toLngLatRing, type Disc, type LngLatPair } from './geo';
import { alive } from './layers';
import { breakBuilding, isRuinDetail, RUIN_COLORS, type RuinKind } from './ruinModel';
import { cityBlocks, type BlockGeometry } from './cityBlocks';
import { cityDamage, hash01 } from './cityDamage';
import { campEntrance, FactionCamps } from './factionCamps';
import { landmarkBaseHeight } from './landmarkGeometry';
import { REVEAL_MS } from './revealMotion';

/**
 * The 3D run map's buildings: the basemap's own footprints extruded to their
 * real heights.
 *
 * - **Range.** A building stands only inside the live travel-range disc,
 *   even at explored or discovered sites. Everything else lies flat
 *   in the fog's colour; discovered location badges remain. Revealed
 *   buildings rise out of the ground (feature-state `rise`, 0 → 1) instead of
 *   popping in.
 * - **Sites.** Each game location is matched to the basemap building it sits
 *   in, which then takes the site's colour, lifts its badge to the roof and
 *   takes its taps. A small shop inside a tower (TENANT_MAX_M) keeps a plain
 *   street-level badge: colouring a 200 m tower as a 7-Eleven breaks the read.
 * - **Ruin.** A matched street site wears its condition: Damaged is scorched,
 *   Ravaged has a local roof breach and Gutted has a wider structural collapse.
 *   Height cuts are a feature-state factor (`ruin`), never a filter.
 * - **City damage.** The rest of the city is hit too, picked by a stable hash
 *   of the feature id. A matched site uses its own tier.
 * - **Zoom.** Below LOD_ZOOM the basemap's flat building fills draw instead;
 *   heights grow in across one zoom level, so pinching in raises the city.
 *
 * Imperative on purpose: it touches thousands of features and animates them
 * per frame, which React would only get in the way of.
 */

/** Extrusions draw from here. CARTO's building ids are stable from z15 tiles. */
export const LOD_ZOOM = 15;
/** Heights grow from 0 to full across this much zoom above LOD_ZOOM. */
export const ZOOM_RISE_SPAN = 1;
/** How long a building takes to rise out of the ground when revealed. */
/** After tiles load, wait this long before indexing their buildings. */
const INDEX_DEBOUNCE_MS = 300;
/**
 * The camera counts as settled after this long without a `move`. The index
 * scan (10–20 ms) waits for it so it never lands mid-pan. Reveals do not wait:
 * they are cheap and follow the walker's sight disc, so holding them would
 * only pile them up for the moment the player arrives.
 */
const SETTLE_MS = 220;
/** A pan slower than this is a camera easing out, not motion. */
const CREEP_PX_PER_S = 30;
/** A long pan still gets its buildings after this long. */
const MAX_DEFER_MS = 2000;

export const BUILDINGS_LAYER = 'buildings-3d';
/**
 * Ordinary buildings shade by height: low blocks sink toward the ground, towers
 * catch more light, so the city reads as a skyline instead of one grey mass. A
 * small per-building nudge (by feature id) breaks up rows of equal blocks.
 * Data-driven paint, set once: no per-frame or per-tick cost.
 */
/** Metres of "virtual height" the id nudge adds at most. */
const SHADE_JITTER_M = 8;
const SHADE_HEIGHT = [
  '+', ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
  ['*', ['%', ['to-number', ['id'], 0], 5], SHADE_JITTER_M / 4],
];
function concreteRamp(low: string, mid: string, high: string, tower: string) {
  return ['interpolate', ['linear'], SHADE_HEIGHT, 0, low, 15, mid, 40, high, 120, tower];
}
// Multipart complexes can contain overlapping shells and slabs with different
// IDs. Give those parts one finish to avoid mottling where their faces meet.
const BASE_BUILDING_COLOR = [
  'match', ['case', ['==', ['get', 'kind'], 'building_part'], 0, ['%', ['abs', ['to-number', ['id'], 0]], 3]],
  1, concreteRamp('#202120', '#2b2d2b', '#393c39', '#50524e'), // chalk
  2, concreteRamp('#221f1b', '#2d2924', '#393530', '#4c4740'), // aged beige
  concreteRamp('#181a1f', '#22252b', '#2e3239', '#434953'), // cool cement
];
/**
 * An unrevealed footprint draws over the ground fog, so it takes the colour
 * the fog gives the ground, undershot a little: extrusion lighting brightens
 * roofs, which would otherwise outline every footprint in the dark.
 */
const FLAT_COLOR = dimHex(mixHex(GROUND_COLOR, FOG_COLOUR, FOG_TOTAL), 0.7);

/** Ruin models: a separate extrusion layer of broken pieces. */
export const RUINS_LAYER = 'ruins-3d';
const RUINS_SOURCE = 'ruins-3d-src';
/** Soot the site colour is pulled toward, by ruin tier. */
const SCORCH_COLOR = '#17140f';
const SCORCH_BY_TIER: Record<DestructionTier, number> = { 0: 0, 1: 0.3, 2: 0.45, 3: 0.55 };
const RUIN_SITE_TINT = 0.4;
/** Detailed site models have their own budget alongside ordinary wrecks. */
const MAX_RUINS = 30;
const RUIN_RANGE_M = 900;
/** Model generation budget per slice, so a burst of sites never hitches. */
const RUIN_BUDGET_MS = 8;
/** Lower than this there is nothing to break: it just stays a stump. */
const RUIN_MIN_H = 6;

/** Broken models for collapsed ordinary buildings, after the sites' own. */
const MAX_WRECKS = 36;
const REPICK_M = 25;
/** The storey band: a lit collar round the block you are inside, at your row. */
const BAND_SOURCE = 'storey-band-src';
export const BAND_LAYER = 'storey-band';
const BAND_COLOR = '#f0a020';
/** How far the collar stands off the wall, so it never z-fights the facade. */
const BAND_STANDOFF_M = 1.2;
/**
 * The block you are inside, drawn solid on its own layer while every other
 * building (and ruin) ghosts, so the tower reads through the estate.
 */
export const FOCUS_LAYER = 'focus-3d';
const GHOST_OPACITY = 0.18;
const SOLID_OPACITY = 1;

/** How much of a ruined building still stands (height × this). */
function stumpFactor(siteId: string, tier: DestructionTier): number {
  if (tier === 1) return 0.94 + 0.06 * hash01(siteId, 3);
  if (tier === 2) return 0.5 + 0.25 * hash01(siteId, 3);
  if (tier === 3) return 0.18 + 0.14 * hash01(siteId, 3);
  return 1;
}


const metresBetween = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const k = Math.cos((aLat * Math.PI) / 180);
  return Math.hypot((aLat - bLat) * 111_320, (aLng - bLng) * 111_320 * k);
};

/**
 * Largest building (metres) a site of this kind can *be*. Taller, and the
 * site is a tenant (a shop in a tower block): it keeps a street-level marker.
 */
const TENANT_MAX_M: Partial<Record<PoiCategory, number>> = {
  convenience: 15,
  pharmacy: 15,
  clinic: 20,
  fuel: 12,
  hardware: 20,
  supermarket: 25,
  foodcourt: 25,
  eatery: 15,
  community: 25,
  mrt: 30,
};

type FeatureId = string | number;

/** Geometry for one animated shadow caster. Ruin pieces move as one wreck. */
export interface ShadowBlock {
  target: { source: string; sourceLayer?: string; id: FeatureId };
  parts: { polygons: Polygon[]; base: number; top: number }[];
  wreck: boolean;
}

export interface Site3d {
  id: string;
  lat: number;
  lng: number;
  /** Footprint from the bake, `[lat, lng]` (sites without one match by point). */
  outline?: ReadonlyArray<readonly [number, number]>;
  category: PoiCategory;
  /** The building's colour while it stands for this site. */
  color: string;
  /** Known ruin tier (visited street sites); absent draws it intact. */
  ruin?: DestructionTier;
  occupied?: boolean;
}

export type BuildingHit = { kind: 'site'; id: string } | { kind: 'building'; lat: number; lng: number };

interface Rise {
  from: number;
  to: number;
  start: number;
  v: number;
}

interface Box {
  b: [number, number, number, number];
  ring: number[][];
  h: number;
  id: FeatureId | undefined;
  part: boolean;
}

/** Height (or base) × rise × ruin, grown in across the LOD zoom band. */
function heightExpr(base: boolean) {
  const own = base
    ? ['coalesce', ['feature-state', 'baseHeight'], ['get', 'render_min_height'], ['get', 'min_height'], 0]
    : ['coalesce', ['get', 'render_height'], ['get', 'height'], 8];
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    LOD_ZOOM,
    0,
    LOD_ZOOM + ZOOM_RISE_SPAN,
    ['*', own, ['coalesce', ['feature-state', 'rise'], 0], ['coalesce', ['feature-state', 'ruin'], ['feature-state', 'wreckHidden'], ['feature-state', 'aruin'], 1]],
  ] as unknown as number;
}

/** A ruin piece's own base / top × rise, on the same zoom ramp. */
function pieceExpr(prop: 'base' | 'top') {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    LOD_ZOOM,
    0,
    LOD_ZOOM + ZOOM_RISE_SPAN,
    ['*', ['get', prop], ['coalesce', ['feature-state', 'rise'], 0]],
  ] as unknown as number;
}

/** Fogged flat colour while down, site colour once standing; selection lives on the badge. */
function standingColor(color: unknown) {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['feature-state', 'rise'], 0],
    0,
    FLAT_COLOR,
    1,
    ['to-color', color],
  ] as unknown as string;
}

interface RuinModel {
  signature?: string;
  tier?: DestructionTier;
  pieces: Feature[];
  /** Tallest piece: where the badge sits. */
  top: number;
  /** Building parts flattened with it (collapsed ordinary buildings only). */
  parts: FeatureId[];
  /** The building it stands in for (collapsed ordinary buildings only). */
  owner?: FeatureId;
}

/** A building wanted as a broken model: a Gutted site, or `b:<id>` for the city's. */
interface Wreck {
  block?: BlockGeometry;
  signature?: string;
  key: string;
  ids: FeatureId[];
  h: number;
  site?: string;
  tier?: DestructionTier;
}

interface Indexed {
  lat: number;
  lng: number;
  h: number;
  part: boolean;
}

const ringBox = (ring: ReadonlyArray<ReadonlyArray<number>>): [number, number, number, number] => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
};

export class BuildingEngine {
  private readonly map: MlMap;
  /** Called with every site's roof height (metres) when matching finds more. */
  onRoofs: ((roofs: ReadonlyMap<string, number>) => void) | null = null;
  private readonly src = BASEMAP.source;
  private readonly sl = BASEMAP.buildingLayer;
  private destroyed = false;
  /** Rises snap instead of animating (reduced motion). */
  private instant = false;

  // Reveal inputs.
  private live: Disc | null = null;
  private camps: FactionCamps;
  private campEntrances = new Map<string, LngLatPair>();

  // Sites and their matched buildings.
  private sites = new Map<string, Site3d>();
  private rings = new Map<string, LngLatPair[] | null>();
  private tried = new Set<string>();
  private roofs = new Map<string, number>();
  private siteFeatures = new Map<string, FeatureId[]>();
  private featureToSite = new Map<FeatureId, string>();
  /** Feature-state currently applied to site buildings, keyed by id. */
  private applied = new Map<FeatureId, string>();
  /** Effective roofs (after ruin) last sent through onRoofs. */
  private published = new Map<string, number>();

  // Gutted sites' broken models.
  private ruinCache = new Map<string, RuinModel>();
  private ruinShown = new Set<string>();
  private ruinWant: Wreck[] = [];
  private ruinTimer: ReturnType<typeof setTimeout> | null = null;
  /** Piece colour applied, by site. */
  private ruinApplied = new Map<string, string>();
  /** The rise last written to each model's pieces (feature-state persists across setData). */
  private pieceRise = new Map<string, number>();
  private nextPieceId = 1;
  /** Building feature → the wreck key whose pieces rise with it. */
  private wreckOf = new Map<FeatureId, string>();

  // City damage (see markDamage).
  private collapsed = new Map<FeatureId, BlockGeometry>();
  /** Buildings whose scorch / stump state is already on. */
  private ambient = new Map<FeatureId, number>();
  private heightCorrected = new Set<FeatureId>();
  private lastPick: Disc | null = null;

  /** Buildings in the loaded z15+ tiles: id → anchor. */
  private index = new Map<FeatureId, Indexed>();
  private rise = new Map<FeatureId, Rise>();
  private rising = new Set<FeatureId>();
  private riseRaf = 0;
  private indexTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMoveAt = 0;
  private lastCam: { c: LngLat; z: number; b: number; p: number; t: number } | null = null;
  private deferSince = 0;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingIndex = false;
  /** Flat basemap building layers and their original zoom ranges. */
  private flatLayers: { id: string; min: number; max: number }[] = [];
  private band: { site: string; base: number; top: number } | null = null;
  /** Site drawn solid while the rest ghost; the ids it was last drawn with. */
  private focus: string | null = null;
  private focusDrawn = '';
  shadowGeometryRevision = 0;
  shadowHeightRevision = 0;
  shadowRuinRevision = 0;
  private shadowTiles?: ReturnType<MlMap['querySourceFeatures']>;
  private shadowFootprints?: Map<FeatureId, ShadowBlock>;
  private wreckShadows = new WeakMap<RuinModel, ShadowBlock>();

  releaseShadowFootprints() {
    this.shadowTiles = undefined;
    this.shadowFootprints = undefined;
  }

  get shadowDisc() {
    return this.focus || this.destroyed ? null : this.live;
  }

  /** The same live rise written to the native extrusion by updateReveal / stepRise. */
  buildingRise(id: FeatureId): number {
    return this.rise.get(id)?.v ?? 0;
  }

  /** Read tile fragments only when the loaded neighbourhood or ruin set changes. */
  shadowBlocks(lat: number, lng: number, radius: number): ShadowBlock[] {
    this.shadowTiles ??= this.map.querySourceFeatures(this.src, { sourceLayer: this.sl });
    this.shadowFootprints ??= this.groupShadowFootprints(this.shadowTiles);
    const disc = { lat, lng, r: radius };
    const cosLat = Math.cos(lat * Math.PI / 180);
    const result: ShadowBlock[] = [];
    const nearby = (id: FeatureId) => {
      const c = this.index.get(id);
      return c !== undefined && inDisc(c.lat, c.lng, disc, cosLat);
    };
    for (const [id, block] of this.shadowFootprints) {
      if (nearby(id)) result.push(block);
    }
    for (const key of this.ruinShown) {
      const model = this.ruinCache.get(key);
      if (!model?.pieces.length || model.owner === undefined || !nearby(model.owner)) continue;
      // One block object per model, so the shadow layer's identity check skips it.
      const cached = this.wreckShadows.get(model);
      if (cached) {
        result.push(cached);
        continue;
      }
      const block: ShadowBlock = {
        target: { source: RUINS_SOURCE, id: model.pieces[0].id! },
        wreck: true,
        parts: model.pieces.flatMap(({ geometry, properties }) => {
          if (geometry.type !== 'Polygon' || !properties || isRuinDetail(properties.kind)) return [];
          const base = Number(properties.base);
          const top = Number(properties.top);
          if (!Number.isFinite(base) || !Number.isFinite(top) || top <= base) return [];
          return [{ polygons: [geometry.coordinates as Polygon], base, top }];
        }),
      };
      this.wreckShadows.set(model, block);
      result.push(block);
    }
    return result;
  }

  private groupShadowFootprints(features: ReturnType<MlMap['querySourceFeatures']>) {
    const blocks = new Map<FeatureId, ShadowBlock>();
    for (const f of features) {
      if (f.id === undefined) continue;
      const g = f.geometry;
      if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') continue;
      let block = blocks.get(f.id);
      if (!block) {
        const p = f.properties;
        const top = Number(p.render_height ?? p.height ?? 8);
        const base = landmarkBaseHeight(this.src, f.id, p) ?? Number(p.render_min_height ?? p.min_height ?? 0);
        if (!Number.isFinite(top) || !Number.isFinite(base) || top <= base) continue;
        block = { target: { source: this.src, sourceLayer: this.sl, id: f.id }, wreck: false, parts: [{ polygons: [], base, top }] };
        blocks.set(f.id, block);
      }
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      block.parts[0].polygons.push(...polys as Polygon[]);
    }
    return blocks;
  }

  constructor(map: MlMap) {
    this.map = map;
    this.install();
    this.camps = new FactionCamps(map);
  }

  /** Roof heights (metres, after ruin) of the sites matched so far, by site id. */
  /**
   * How badly loaded buildings would hide a point seen from `bearing` (camera on the
   * near side, looking along it): height over distance of every building inside a
   * ±25° cone 15–160 m back toward the camera. Lower is clearer.
   */
  occlusion(lat: number, lng: number, bearing: number): number {
    const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
    const ky = 110_540;
    const rad = (bearing * Math.PI) / 180;
    // Unit vector from the point back toward the camera.
    const bx = -Math.sin(rad);
    const by = -Math.cos(rad);
    let score = 0;
    for (const b of this.index.values()) {
      const dx = (b.lng - lng) * kx;
      const dy = (b.lat - lat) * ky;
      const d = Math.hypot(dx, dy);
      if (d < 15 || d > 160) continue;
      if ((dx * bx + dy * by) / d < 0.9) continue;
      score += b.h / d;
    }
    return score;
  }

  /** Physical roof heights for cutaways, or standing heights for map badges. */
  roofHeights(standingOnly = false): ReadonlyMap<string, number> {
    const out = new Map<string, number>();
    for (const [id, h] of this.roofs) {
      const standing = !standingOnly || this.siteFeatures.get(id)?.some((feature) => this.rise.get(feature)?.to === 1);
      out.set(id, standing ? this.roofOf(id, h) : 0);
    }
    return out;
  }

  private roofOf(id: string, h: number): number {
    const tier = this.sites.get(id)?.ruin ?? 0;
    if (tier >= 2 && this.ruinShown.has(id)) return this.ruinCache.get(id)?.top ?? 0;
    return h * stumpFactor(id, tier);
  }

  /** Tell badges when a roof or its range membership changes; never publish per frame. */
  private publishRoofs() {
    const next = this.roofHeights(true);
    let changed = next.size !== this.published.size;
    if (!changed) for (const [id, h] of next) if (this.published.get(id) !== h) changed = true;
    if (!changed) return;
    this.published = new Map(next);
    this.onRoofs?.(next);
  }

  // --- Lifecycle ---------------------------------------------------------------

  private install() {
    const map = this.map;
    for (const l of map.getStyle().layers) {
      if (l.type === 'fill' && 'source-layer' in l && l['source-layer'] === this.sl) {
        const min = l.minzoom ?? 0;
        const max = l.maxzoom ?? 24;
        this.flatLayers.push({ id: l.id, min, max });
        map.setLayerZoomRange(l.id, min, Math.min(max, LOD_ZOOM));
      }
    }
    map.addLayer(
      {
        id: BUILDINGS_LAYER,
        type: 'fill-extrusion',
        source: this.src,
        'source-layer': this.sl,
        minzoom: LOD_ZOOM,
        paint: {
          'fill-extrusion-color': standingColor([
            'coalesce',
            ['feature-state', 'color'],
            [
              'case',
              // Colours, not strings: the height-shade branch is an interpolated colour.
              ['boolean', ['feature-state', 'scorch'], false],
              ['to-color', SCORCH_COLOR],
              BASE_BUILDING_COLOR,
            ],
          ]),
          'fill-extrusion-height': heightExpr(false),
          'fill-extrusion-base': heightExpr(true),
          'fill-extrusion-opacity': SOLID_OPACITY,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      slotId('buildings'),
    );
    const solid = map.getLayer(BUILDINGS_LAYER)!;
    map.addLayer(
      {
        id: FOCUS_LAYER,
        type: 'fill-extrusion',
        source: this.src,
        'source-layer': this.sl,
        minzoom: LOD_ZOOM,
        filter: ['in', ['id'], ['literal', []]],
        paint: {
          'fill-extrusion-color': map.getPaintProperty(BUILDINGS_LAYER, 'fill-extrusion-color'),
          'fill-extrusion-height': map.getPaintProperty(BUILDINGS_LAYER, 'fill-extrusion-height'),
          'fill-extrusion-base': map.getPaintProperty(BUILDINGS_LAYER, 'fill-extrusion-base'),
          'fill-extrusion-opacity': 1,
          'fill-extrusion-vertical-gradient': true,
        },
      } as Parameters<MlMap['addLayer']>[0],
      solid.id,
    );
    // Preserve thin section walls and chipped slab edges in the close-up tiles.
    map.addSource(RUINS_SOURCE, { type: 'geojson', tolerance: 0.1, maxzoom: 18, data: { type: 'FeatureCollection', features: [] } });
    map.addLayer(
      {
        id: RUINS_LAYER,
        type: 'fill-extrusion',
        source: RUINS_SOURCE,
        minzoom: LOD_ZOOM,
        paint: {
          'fill-extrusion-color': standingColor(['coalesce', ['feature-state', 'color'], RUIN_COLORS.shell]),
          'fill-extrusion-height': pieceExpr('top'),
          'fill-extrusion-base': pieceExpr('base'),
          'fill-extrusion-opacity': SOLID_OPACITY,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      slotId('buildings'),
    );
    map.addSource(BAND_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer(
      {
        id: BAND_LAYER,
        type: 'fill-extrusion',
        source: BAND_SOURCE,
        minzoom: LOD_ZOOM,
        paint: {
          'fill-extrusion-color': BAND_COLOR,
          'fill-extrusion-height': ['get', 'top'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.8,
        },
      },
      // Under the other buildings, beside the focused block: ghosts in front
      // then tint the band instead of hiding it behind their depth.
      BUILDINGS_LAYER,
    );
    // Sky and light belong to the weather: see atmosphere.ts.

    map.on('sourcedata', this.onSourceData);
    map.on('idle', this.onIdle);
    map.on('move', this.onMove);
    this.placeBadges();
    this.scheduleIndex();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.camps.destroy();
    const map = this.map;
    map.off('sourcedata', this.onSourceData);
    map.off('idle', this.onIdle);
    map.off('move', this.onMove);
    if (this.indexTimer) clearTimeout(this.indexTimer);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.riseRaf) cancelAnimationFrame(this.riseRaf);
    if (this.ruinTimer) clearTimeout(this.ruinTimer);
    if (!alive(map)) return;
    map.getContainer().style.removeProperty('--roof-lift');
    if (map.getLayer(FOCUS_LAYER)) map.removeLayer(FOCUS_LAYER);
    if (map.getLayer(BUILDINGS_LAYER)) map.removeLayer(BUILDINGS_LAYER);
    if (map.getLayer(RUINS_LAYER)) map.removeLayer(RUINS_LAYER);
    if (map.getSource(RUINS_SOURCE)) map.removeSource(RUINS_SOURCE);
    if (map.getLayer(BAND_LAYER)) map.removeLayer(BAND_LAYER);
    if (map.getSource(BAND_SOURCE)) map.removeSource(BAND_SOURCE);
    for (const l of this.flatLayers) if (map.getLayer(l.id)) map.setLayerZoomRange(l.id, l.min, l.max);
    // No id: clears every state this engine put on the building layer.
    if (map.getSource(this.src)) map.removeFeatureState({ source: this.src, sourceLayer: this.sl });
  }

  // --- Inputs ------------------------------------------------------------------

  /**
   * Light one band of a site's building, `base`..`top` metres up: the cutaway
   * row you are on (or pointing at). Redraws only when the band moves.
   */
  setFloorBand(siteId: string, base: number, top: number) {
    const b = this.band;
    if (b && b.site === siteId && b.base === base && b.top === top) return;
    this.band = { site: siteId, base, top };
    this.drawBand();
  }

  /**
   * Draw one site's building solid and ghost the rest (null: all solid). One
   * filter + opacity change per focus change, never per tick; re-applied only
   * when the site's matched buildings change.
   */
  setFocus(siteId: string | null) {
    if (this.focus === siteId) return;
    this.focus = siteId;
    this.drawFocus();
  }

  private drawFocus() {
    if (this.destroyed || !alive(this.map)) return;
    const ids = this.focus ? (this.siteFeatures.get(this.focus) ?? []) : [];
    const key = ids.join(',');
    if (key === this.focusDrawn) return;
    this.focusDrawn = key;
    const map = this.map;
    const on = ids.length > 0;
    const list = ['literal', ids] as unknown as FilterSpecification;
    map.setFilter(FOCUS_LAYER, ['in', ['id'], list] as FilterSpecification);
    map.setFilter(BUILDINGS_LAYER, on ? (['!', ['in', ['id'], list]] as FilterSpecification) : null);
    const op = on ? GHOST_OPACITY : SOLID_OPACITY;
    map.setPaintProperty(BUILDINGS_LAYER, 'fill-extrusion-opacity', op);
    map.setPaintProperty(RUINS_LAYER, 'fill-extrusion-opacity', op);
  }

  clearFloorBand() {
    if (!this.band) return;
    this.band = null;
    this.drawBand();
  }

  private drawBand() {
    if (this.destroyed || !alive(this.map)) return;
    const src = this.map.getSource(BAND_SOURCE) as GeoJSONSource | undefined;
    if (!src) return;
    const b = this.band;
    const site = b ? this.sites.get(b.site) : undefined;
    const ring = site ? this.ringOf(site) : null;
    if (!b || !ring) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    src.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { base: b.base, top: b.top },
          geometry: { type: 'Polygon', coordinates: [standOff(ring, BAND_STANDOFF_M)] },
        },
      ],
    });
  }

  setInstant(instant: boolean) {
    this.instant = instant;
  }

  /** The live disc follows current travel range, so buildings rise and fall with it. */
  setReveal(live: { lat: number; lng: number; radius: number }) {
    const same =
      this.live?.lat === live.lat &&
      this.live.lng === live.lng &&
      this.live.r === live.radius;
    if (same) return;
    this.live = { lat: live.lat, lng: live.lng, r: live.radius };
    this.updateReveal(false);
    this.pickDamage();
    this.camps.update(this.sites.values(), this.live, this.campEntrances);
  }

  /** The sites drawn on screen now (already fog- and viewport-culled). */
  setSites(sites: readonly Site3d[]) {
    const next = new Map<string, Site3d>();
    let fresh = false;
    for (const s of sites) {
      next.set(s.id, s);
      if (!this.sites.has(s.id)) fresh = true;
    }
    const gone = [...this.sites.keys()].some((id) => !next.has(id));
    this.sites = next;
    if (fresh) this.matchSites();
    this.camps.update(next.values(), this.live, this.campEntrances);
    this.pickRuins();
    this.applySiteStates();
    this.publishRoofs();
    // The band's block may only now be on screen (or just left it).
    if (this.band && (fresh || gone)) this.drawBand();
  }

  /** What a tap at this screen point lands on, nearest first. */
  hit(point: { x: number; y: number }): BuildingHit | null {
    if (!this.map.getLayer(BUILDINGS_LAYER)) return null;
    const layers = [RUINS_LAYER, FOCUS_LAYER, BUILDINGS_LAYER].filter((l) => this.map.getLayer(l));
    const top = this.map.queryRenderedFeatures([point.x, point.y], { layers })[0];
    if (!top || top.id === undefined) return null;
    if (top.layer.id === RUINS_LAYER) {
      const { site, owner } = top.properties as { site?: unknown; owner?: unknown };
      if (typeof site === 'string') return this.sites.has(site) ? { kind: 'site', id: site } : null;
      const known = typeof owner === 'string' || typeof owner === 'number' ? this.index.get(owner) : undefined;
      return known ? { kind: 'building', lat: known.lat, lng: known.lng } : null;
    }
    const site = this.featureToSite.get(top.id);
    if (site !== undefined && this.sites.has(site)) return { kind: 'site', id: site };
    // Only a standing building blocks the ground behind it.
    if ((this.rise.get(top.id)?.v ?? 0) < 0.5) return null;
    // Walk to the building, not to the ground the tap ray reaches behind it.
    const known = this.index.get(top.id);
    if (known) return { kind: 'building', lat: known.lat, lng: known.lng };
    const at = anchorOf(top.geometry);
    return at ? { kind: 'building', lat: at[1], lng: at[0] } : null;
  }

  // --- Indexing and reveal ----------------------------------------------------

  private onSourceData = (e: MapSourceDataEvent) => {
    if (e.sourceId !== this.src || !e.tile) return;
    this.scheduleIndex();
  };

  private scheduleIndex() {
    if (this.indexTimer) return;
    this.indexTimer = setTimeout(() => {
      this.indexTimer = null;
      if (this.destroyed) return;
      if (this.moving()) {
        this.pendingIndex = true;
        this.waitForSettle();
        return;
      }
      this.indexBuildings();
    }, INDEX_DEBOUNCE_MS);
  }

  // --- Waiting for the camera ---------------------------------------------------

  private onMove = () => {
    // A camera easing out creeps for a while; only real motion holds rises.
    const map = this.map;
    const cam = this.lastCam;
    const t = performance.now();
    const now = { c: map.getCenter(), z: map.getZoom(), b: map.getBearing(), p: map.getPitch(), t };
    if (
      !cam ||
      Math.abs(now.z - cam.z) > 0.01 ||
      Math.abs(now.b - cam.b) > 0.2 ||
      Math.abs(now.p - cam.p) > 0.2
    ) {
      this.lastMoveAt = t;
    } else {
      const a = map.project(cam.c);
      const b = map.project(now.c);
      // Speed, not distance per event, so 60 Hz and 144 Hz screens agree.
      const pxPerS = (Math.hypot(a.x - b.x, a.y - b.y) * 1000) / Math.max(1, t - cam.t);
      if (pxPerS > CREEP_PX_PER_S) this.lastMoveAt = t;
    }
    this.lastCam = now;
    this.placeBadges();
  };

  /** `isMoving()` is false between per-frame jumpTo calls, so time the gaps. */
  private moving(): boolean {
    const now = performance.now();
    if (now - this.lastMoveAt >= SETTLE_MS) return false;
    return !this.deferSince || now - this.deferSince < MAX_DEFER_MS;
  }

  private waitForSettle() {
    if (this.settleTimer) return;
    if (!this.deferSince) this.deferSince = performance.now();
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (this.destroyed) return;
      if (this.moving()) {
        this.waitForSettle();
        return;
      }
      this.deferSince = 0;
      if (this.pendingIndex) {
        this.pendingIndex = false;
        this.indexBuildings(); // runs the reveal itself
      }
    }, SETTLE_MS);
  }

  /**
   * Rebuild the building index from the loaded tiles. Only what is loaded is
   * kept, so the reveal pass stays sized to the view, not to the whole run.
   */
  private indexBuildings() {
    const map = this.map;
    if (!map.getSource(this.src) || map.getZoom() < LOD_ZOOM) return;
    const next = new Map<FeatureId, Indexed>();
    this.collapsed.clear();
    const loaded = map.querySourceFeatures(this.src, { sourceLayer: this.sl });
    if (this.shadowTiles) {
      this.shadowTiles = loaded;
      this.shadowFootprints = undefined;
    }
    for (const f of loaded) {
      if (f.id === undefined || next.has(f.id)) continue;
      const at = anchorOf(f.geometry);
      if (!at) continue;
      const props = f.properties as Record<string, unknown>;
      const h = Number(props.render_height ?? props.height ?? 0);
      if (!this.heightCorrected.has(f.id)) {
        const baseHeight = landmarkBaseHeight(this.src, f.id, props);
        if (baseHeight !== undefined) {
          map.setFeatureState({ source: this.src, sourceLayer: this.sl, id: f.id }, { baseHeight });
          this.heightCorrected.add(f.id);
        }
      }
      const c: Indexed = { lat: at[1], lng: at[0], h: Number.isFinite(h) ? h : 0, part: props.kind === 'building_part' };
      next.set(f.id, c);

    }
    const first = this.index.size === 0;
    this.index = next;
    this.markDamage(cityBlocks(loaded));
    this.shadowGeometryRevision++;
    this.pickDamage(true);
    // The first reveal (entering 3D, loading a run) is instant; tiles that
    // load later rise in.
    this.updateReveal(first);
  }

  private updateReveal(instant: boolean) {
    const map = this.map;
    if (this.destroyed || !this.live || !this.index.size || !map.getLayer(BUILDINGS_LAYER)) return;
    const cosLat = Math.cos((this.live.lat * Math.PI) / 180);

    const snap = instant || this.instant;
    const now = performance.now();
    for (const [id, c] of this.index) {
      const cur = this.rise.get(id);
      const curTo = cur?.to ?? 0;
      const want = inDisc(c.lat, c.lng, this.live, cosLat) ? 1 : 0;
      if (want === curTo) continue;
      if (snap) {
        this.shadowHeightRevision++;
        this.rise.set(id, { from: want, to: want, start: now, v: want });
        this.rising.delete(id);
        map.setFeatureState({ source: this.src, sourceLayer: this.sl, id }, { rise: want });
        this.risePieces(id, want);
      } else {
        const v = cur?.v ?? 0;
        this.rise.set(id, { from: v, to: want, start: now, v });
        this.rising.add(id);
      }
    }
    this.publishRoofs();
    if (this.rising.size && !this.riseRaf) this.riseRaf = requestAnimationFrame(this.stepRise);
  }

  private stepRise = (now: number) => {
    this.riseRaf = 0;
    if (this.destroyed || !alive(this.map) || !this.map.getLayer(BUILDINGS_LAYER)) return;
    this.shadowHeightRevision++;
    for (const id of this.rising) {
      const r = this.rise.get(id);
      if (!r) {
        this.rising.delete(id);
        continue;
      }
      const t = Math.min(1, (now - r.start) / REVEAL_MS);
      const e = 1 - (1 - t) ** 3; // ease-out: quick start, soft landing
      r.v = t >= 1 ? r.to : r.from + (r.to - r.from) * e;
      this.map.setFeatureState({ source: this.src, sourceLayer: this.sl, id }, { rise: r.v });
      this.risePieces(id, r.v);
      if (t >= 1) this.rising.delete(id);
    }
    if (this.rising.size) this.riseRaf = requestAnimationFrame(this.stepRise);
  };

  // --- Sites → buildings --------------------------------------------------------

  private onIdle = () => {
    this.matchSites();
  };

  private ringOf(site: Site3d): LngLatPair[] | null {
    let ring = this.rings.get(site.id);
    if (ring === undefined) {
      ring = site.outline && site.outline.length >= 3 ? toLngLatRing(site.outline) : null;
      this.rings.set(site.id, ring);
    }
    return ring;
  }

  /**
   * Find each on-screen site's building in the loaded tiles. One building *is*
   * the site: the candidate whose footprint best matches the bake's (towers
   * on a podium are separate buildings and must not be claimed just for
   * sitting inside it), plus any building parts inside the footprint.
   */
  private matchSites() {
    const map = this.map;
    if (this.destroyed || map.getZoom() < LOD_ZOOM || !map.isSourceLoaded(this.src)) return;
    const view = map.getBounds();
    const pending = [...this.sites.values()].filter((s) => !this.tried.has(s.id) && view.contains([s.lng, s.lat]));
    if (!pending.length) return;

    const boxes: Box[] = [];
    for (const f of map.querySourceFeatures(this.src, { sourceLayer: this.sl })) {
      const props = f.properties as Record<string, unknown>;
      const h = Number(props.render_height ?? props.height ?? NaN);
      if (!Number.isFinite(h) || h <= 0) continue;
      const part = props.kind === 'building_part';
      const g = f.geometry;
      const outers =
        g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((pg) => pg[0]) : [];
      for (const ring of outers) if (ring) boxes.push({ b: ringBox(ring), ring, h, id: f.id, part });
    }

    let changed = false;
    for (const site of pending) {
      this.tried.add(site.id);
      if (site.category === 'park') continue; // a park must never claim a nearby building
      const ring = this.ringOf(site);
      const sb = ring ? ringBox(ring) : null;
      const siteArea = sb ? Math.max(1e-12, (sb[2] - sb[0]) * (sb[3] - sb[1])) : 0;
      let main: Box | null = null;
      let mainScore = Infinity;
      const parts: Box[] = [];
      for (const box of boxes) {
        const [x0, y0, x1, y1] = box.b;
        const area = Math.max(1e-12, (x1 - x0) * (y1 - y0));
        if (sb && ring) {
          if (x1 < sb[0] || x0 > sb[2] || y1 < sb[1] || y0 > sb[3]) continue;
          const centreInside = pointInRing((x0 + x1) / 2, (y0 + y1) / 2, ring);
          // A curated landmark can be a whole complex (three towers or a
          // grove). Its constituent buildings share one identity and state.
          if (site.category === 'landmark' && centreInside) {
            parts.push(box);
            continue;
          }
          if (box.part) {
            if (centreInside) parts.push(box);
            continue;
          }
          if (!centreInside && !pointInRing(site.lng, site.lat, box.ring)) continue;
          const score = Math.abs(Math.log(area / siteArea));
          if (score < mainScore) {
            mainScore = score;
            main = box;
          }
        } else {
          // No footprint: the smallest whole building the point stands in.
          if (box.part || site.lng < x0 || site.lng > x1 || site.lat < y0 || site.lat > y1) continue;
          if (!pointInRing(site.lng, site.lat, box.ring)) continue;
          if (area < mainScore) {
            mainScore = area;
            main = box;
          }
        }
      }
      let best = 0;
      const entranceRing = main?.ring ?? ring ?? parts[0]?.ring;
      if (entranceRing?.length) this.campEntrances.set(site.id, campEntrance(entranceRing));
      const ids = new Set<FeatureId>();
      for (const box of main ? [main, ...parts] : parts) {
        if (box.h > best) best = box.h;
        if (box.id !== undefined) ids.add(box.id);
      }
      if (best <= 0) continue;
      const cap = TENANT_MAX_M[site.category];
      if (cap !== undefined && best > cap) continue; // a tenant: street-level badge
      // A building claimed by an earlier site stays with it.
      const own = [...ids].filter((id) => !this.featureToSite.has(id));
      if (!own.length) continue;
      this.siteFeatures.set(site.id, own);
      for (const id of own) this.featureToSite.set(id, site.id);
      this.roofs.set(site.id, best);
      changed = true;
    }
    this.camps.update(this.sites.values(), this.live, this.campEntrances);
    if (!changed) return;
    this.pickRuins();
    this.applySiteStates();
    this.publishRoofs();
    this.updateReveal(false);
    if (this.focus) this.drawFocus();
  }

  /** Push site colours and ruin onto the buildings that are sites. */
  private applySiteStates() {
    const map = this.map;
    if (this.destroyed || !map.getLayer(BUILDINGS_LAYER)) return;
    const want = new Map<FeatureId, { color: string; ruin: number }>();
    for (const [site, ids] of this.siteFeatures) {
      const s = this.sites.get(site);
      if (!s) continue;
      const tier = s.ruin ?? 0;
      const color = tier ? mixHex(s.color, SCORCH_COLOR, SCORCH_BY_TIER[tier]) : s.color;
      // A broken model stands in for the box, which lies flat under it.
      const ruin = tier >= 2 && this.ruinShown.has(site) ? 0 : stumpFactor(site, tier);
      for (const id of ids) want.set(id, { color, ruin });
    }
    for (const id of [...this.applied.keys()]) {
      if (want.has(id)) continue;
      const target = { source: this.src, sourceLayer: this.sl, id };
      map.removeFeatureState(target, 'color');
      map.removeFeatureState(target, 'ruin');
      this.shadowHeightRevision++;
      this.shadowRuinRevision++;
      this.applied.delete(id);
    }
    for (const [id, s] of want) {
      const key = `${s.color}|${s.ruin}`;
      if (this.applied.get(id) === key) continue;
      this.shadowHeightRevision++;
      map.setFeatureState({ source: this.src, sourceLayer: this.sl, id }, s);
      this.shadowRuinRevision++;
      this.applied.set(id, key);
    }
    this.applyPieceStates();
  }

  // --- City damage ---------------------------------------------------------------

  /**
   * Fold one freshly indexed building into the city's damage: scorched walls or a broken silhouette, all from its one destruction severity (cityDamage.ts). Stable per
   * feature id, so the same buildings are wrecked every visit. A site's own
   * states override these (see heightExpr).
   */
  private markDamage(blocks: BlockGeometry[]) {
    const next = new Map<FeatureId, number>();
    for (const block of blocks) {
      const damage = cityDamage(String(block.id), block.h);
      if (damage.level === 'collapsed') this.collapsed.set(block.id, block);
      if (damage.level === 'intact') continue;
      for (const id of block.members) next.set(id, damage.stands);
    }
    const target = (id: FeatureId) => ({ source: this.src, sourceLayer: this.sl, id });
    for (const [id, stands] of next) {
      if (this.ambient.get(id) === stands) continue;
      this.map.setFeatureState(target(id), { scorch: true, aruin: stands });
    }
    for (const id of this.ambient.keys()) {
      if (next.has(id)) continue;
      this.map.removeFeatureState(target(id), 'scorch');
      this.map.removeFeatureState(target(id), 'aruin');
    }
    this.ambient = next;
  }

  /** Re-pick wrecks once the sight disc has moved far enough. */
  private pickDamage(force = false) {
    const live = this.live;
    if (!live) return;
    const last = this.lastPick;
    if (!force && last && Math.abs(last.r - live.r) < REPICK_M &&
      metresBetween(last.lat, last.lng, live.lat, live.lng) < REPICK_M) return;
    this.lastPick = { ...live };
    this.pickRuins();
  }

  // --- Ruin models --------------------------------------------------------------

  /**
   * The wrecks that get a broken model: the nearest Ravaged or Gutted sites, then the
   * nearest collapsed ordinary buildings. Everything else stays a stump.
   */
  private pickRuins() {
    if (this.destroyed || !this.live || !this.map.getLayer(RUINS_LAYER)) return;
    const live = this.live;
    const range = Math.min(RUIN_RANGE_M, live.r + REPICK_M);
    const sites: Array<[number, Wreck]> = [];
    for (const [id, s] of this.sites) {
      const ids = this.siteFeatures.get(id);
      const h = this.roofs.get(id) ?? 0;
      if ((s.ruin ?? 0) < 2 || !ids || h < RUIN_MIN_H) continue;
      const d = metresBetween(live.lat, live.lng, s.lat, s.lng);
      if (d <= range) sites.push([d, { key: id, ids, h, site: id, tier: s.ruin }]);
    }
    const city: Array<[number, Wreck]> = [];
    for (const [id, block] of this.collapsed) {
      const c = this.index.get(block.shape);
      if (!c || block.members.some(member => this.featureToSite.has(member))) continue;
      const d = metresBetween(live.lat, live.lng, c.lat, c.lng);
      if (d > range) continue;
      // Rank by apparent size: a row of nearby shop units must not consume
      // the entire detail budget ahead of a prominent tower in the same view.
      const priority = d / Math.min(4, Math.max(1, Math.sqrt(block.h / 12)));
      city.push([priority, {
        key: `b:${id}`, ids: [block.shape], h: block.h, block,
        signature: [block.shape, block.h, ...block.members].join('/'),
      }]);
    }
    sites.sort((a, b) => a[0] - b[0]);
    city.sort((a, b) => a[0] - b[0]);
    const next = [...sites.slice(0, MAX_RUINS), ...city.slice(0, MAX_WRECKS)].map(([, w]) => w);
    const keep = new Map(next.map(w => [w.key, w]));
    let dropped = false;
    for (const key of [...this.ruinShown]) {
      const wanted = keep.get(key);
      const cached = this.ruinCache.get(key);
      if (wanted && cached?.tier === wanted.tier && cached?.signature === wanted.signature) continue;
      this.flattenUnder(key, false);
      this.ruinShown.delete(key);
      dropped = true;
    }
    this.ruinWant = next;
    if (dropped) this.afterRuinChange();
    if (!this.ruinTimer && next.some((w) => !this.ruinShown.has(w.key))) this.ruinTimer = setTimeout(this.pumpRuins, 0);
  }

  /** Build wanted models within a time budget; the rest next slice. */
  private pumpRuins = () => {
    this.ruinTimer = null;
    if (this.destroyed || !alive(this.map) || !this.map.getLayer(RUINS_LAYER)) return;
    // Lower-zoom tiles reuse feature ids for other buildings (see LOD_ZOOM).
    if (this.map.getZoom() < LOD_ZOOM) return;
    const t0 = performance.now();
    let added = false;
    for (const w of this.ruinWant) {
      if (this.ruinShown.has(w.key)) continue;
      if (performance.now() - t0 > RUIN_BUDGET_MS) {
        this.ruinTimer = setTimeout(this.pumpRuins, 16);
        break;
      }
      let model = this.ruinCache.get(w.key);
      if (!model || model.tier !== w.tier || model.signature !== w.signature) {
        const built = this.makeRuin(w);
        if (!built) continue; // its tiles are not in yet: the next pick retries
        model = { ...built, tier: w.tier, signature: w.signature };
        this.ruinCache.set(w.key, model);
        // Fresh piece ids carry no state yet.
        this.ruinApplied.delete(w.key);
        this.pieceRise.delete(w.key);
      }
      if (!model.pieces.length) continue; // nothing usable: stays a stump
      this.ruinShown.add(w.key);
      this.flattenUnder(w.key, true);
      added = true;
    }
    if (added) this.afterRuinChange();
  };

  private makeRuin(w: Wreck): RuinModel | null {
    const polys: Polygon[] = [];
    const filter = ['in', ['id'], ['literal', w.ids]] as unknown as FilterSpecification;
    for (const f of this.map.querySourceFeatures(this.src, { sourceLayer: this.sl, filter })) {
      const g = f.geometry;
      if (g.type === 'Polygon') polys.push(g.coordinates as Polygon);
      else if (g.type === 'MultiPolygon') polys.push(...(g.coordinates as Polygon[]));
    }
    if (!polys.length) return null;
    let footprint: MultiPolygon;
    try {
      // Tile pieces of one building overlap in the tile buffer; fuse them.
      footprint = polygonClipping.union(polys[0], ...polys.slice(1));
    } catch {
      return { pieces: [], top: 0, parts: [] }; // degenerate footprint: stays a stump
    }
    // Cut the tower footprint when a short podium carries a taller part.
    // Other wings retain their damaged silhouettes below the detailed model.
    const parts = w.block && w.block.shape === w.block.id ? w.block.members.slice(1) : [];
    const h = w.h;
    let pieces: ReturnType<typeof breakBuilding>;
    try {
      pieces = breakBuilding(footprint, h, Math.floor(hash01(w.key, 9) * 2 ** 31), w.tier === 2 ? 2 : 3);
    } catch (error) {
      // Keep the damaged extrusion for this footprint and finish the queue.
      if (import.meta.env.DEV) console.warn('Ruin geometry unavailable', w.key, error);
      return { pieces: [], top: 0, parts: [] };
    }
    let top = 0;
    const owner = w.site ? null : w.ids[0];
    const features = pieces.map((p): Feature => {
      if (p.top > top) top = p.top;
      return {
        type: 'Feature',
        id: this.nextPieceId++,
        geometry: { type: 'Polygon', coordinates: p.poly },
        properties: { site: w.site ?? null, owner, kind: p.kind, base: p.base, top: p.top },
      };
    });
    return { pieces: features, top, parts, owner: w.ids[0] };
  }

  /**
   * A collapsed building's own box (and its towers) lies flat under its model,
   * and stands back up as a stump when the model goes. Sites do this through
   * applySiteStates instead.
   */
  private flattenUnder(key: string, on: boolean) {
    const model = this.ruinCache.get(key);
    if (!key.startsWith('b:') || !model || model.owner === undefined || !this.map.getSource(this.src)) return;
    const target = (id: FeatureId) => ({ source: this.src, sourceLayer: this.sl, id });
    for (const id of [model.owner, ...model.parts]) {
      if (on) this.map.setFeatureState(target(id), { wreckHidden: 0 });
      else this.map.removeFeatureState(target(id), 'wreckHidden');
    }
  }

  /** A model came or went: redraw the pieces, re-flatten boxes, move badges. */
  private afterRuinChange() {
    this.shadowGeometryRevision++;
    const features: Feature[] = [];
    this.wreckOf.clear();
    for (const key of this.ruinShown) {
      const model = this.ruinCache.get(key);
      if (!model) continue;
      features.push(...model.pieces);
      const ids = key.startsWith('b:') ? [model.owner] : this.siteFeatures.get(key) ?? [];
      for (const id of ids) if (id !== undefined) this.wreckOf.set(id, key);
    }
    const fc: FeatureCollection = { type: 'FeatureCollection', features };
    (this.map.getSource(RUINS_SOURCE) as GeoJSONSource | undefined)?.setData(fc);
    // Feature-state outlives setData (it lives on the source, keyed by id), and
    // piece ids are never reused, so only models whose rise moved while hidden,
    // or that are new, need writing. Rewriting every piece of every shown model
    // here cost 150-350 ms per re-pick while walking.
    for (const [id, key] of this.wreckOf) {
      const v = this.rise.get(id)?.v ?? 0;
      if (this.pieceRise.get(key) !== v) this.setPieceRise(key, v);
    }
    this.applySiteStates();
    this.publishRoofs();
  }

  /** Pieces rise with the building they stand in for. */
  private risePieces(feature: FeatureId, v: number) {
    const key = this.wreckOf.get(feature);
    if (key !== undefined) this.setPieceRise(key, v);
  }

  private setPieceRise(key: string, rise: number) {
    this.pieceRise.set(key, rise);
    for (const f of this.ruinCache.get(key)?.pieces ?? []) {
      this.map.setFeatureState({ source: RUINS_SOURCE, id: f.id as number }, { rise });
    }
  }

  /** Piece colours: their own shade with the site's colour mixed in. */
  private applyPieceStates() {
    if (!this.map.getSource(RUINS_SOURCE)) return;
    for (const key of this.ruinShown) {
      const model = this.ruinCache.get(key);
      if (!model) continue;
      const s = key.startsWith('b:') ? null : this.sites.get(key);
      if (!s && !key.startsWith('b:')) continue;
      const stateKey = s?.color ?? 'city';
      if (this.ruinApplied.get(key) === stateKey) continue;
      for (const f of model.pieces) {
        const kind = (f.properties as { kind: RuinKind }).kind;
        const own = RUIN_COLORS[kind];
        this.map.setFeatureState(
          { source: RUINS_SOURCE, id: f.id as number },
          { color: s && !isRuinDetail(kind) ? mixHex(own, s.color, RUIN_SITE_TINT) : own },
        );
      }
      this.ruinApplied.set(key, stateKey);
    }
  }

  // --- Badges ------------------------------------------------------------------

  /**
   * Badges ride their roofs: a marker with a roof translates up by
   * `--roof × --roof-lift` px (index.css). One CSS variable per frame on the
   * container moves every badge, instead of one setOffset per marker.
   */
  private placeBadges = () => {
    const map = this.map;
    if (this.destroyed || !alive(map)) return;
    const z = map.getZoom();
    const zoomRise = Math.min(1, Math.max(0, (z - LOD_ZOOM) / ZOOM_RISE_SPAN));
    const lift = pxPerMetre(z, map.getCenter().lat) * Math.sin((map.getPitch() * Math.PI) / 180) * zoomRise;
    map.getContainer().style.setProperty('--roof-lift', lift.toFixed(4));
  };
}

/** A ring pushed out from its centre by `metres`, so a collar wraps the wall. */
function standOff(ring: LngLatPair[], metres: number): LngLatPair[] {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) {
    cx += x;
    cy += y;
  }
  cx /= ring.length;
  cy /= ring.length;
  const kx = Math.cos((cy * Math.PI) / 180) * 111_320;
  const ky = 110_540;
  return ring.map(([x, y]) => {
    const dx = (x - cx) * kx;
    const dy = (y - cy) * ky;
    const d = Math.hypot(dx, dy);
    const k = d > 0 ? (d + metres) / d : 1;
    return [cx + (dx * k) / kx, cy + (dy * k) / ky];
  });
}
