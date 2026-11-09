import type { Feature, FeatureCollection } from 'geojson';
import {
  Marker,
  type FilterSpecification,
  type GeoJSONSource,
  type LngLat,
  type Map as MlMap,
  type MapSourceDataEvent,
} from 'maplibre-gl';
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { ExploredCircle } from '../game/fog';
import type { DestructionTier, PoiCategory } from '../game/types';
import { BASEMAP, GROUND_COLOR, slotId } from './mapStyle';
import { FOG_COLOUR, FOG_TOTAL } from './fogGeometry';
import { anchorOf, dimHex, inDisc, mixHex, pointInRing, pxPerMetre, toLngLatRing, type Disc, type LngLatPair } from './geo';
import { alive } from './layers';
import { breakBuilding, type RuinKind } from './ruinModel';

/**
 * The 3D run map's buildings: the basemap's own footprints extruded to their
 * real heights.
 *
 * - **Fog.** A building stands only once it's been seen: inside the live sight
 *   disc, any explored disc, or under a sensed site. Everything else lies flat
 *   in the fog's colour, so the unexplored island stays dark. Revealed
 *   buildings rise out of the ground (feature-state `rise`, 0 → 1) instead of
 *   popping in.
 * - **Sites.** Each game location is matched to the basemap building it sits
 *   in, which then takes the site's colour, lifts its badge to the roof and
 *   takes its taps. A small shop inside a tower (TENANT_MAX_M) keeps a plain
 *   street-level badge: colouring a 200 m tower as a 7-Eleven breaks the read.
 * - **Ruin.** A visited street site's building wears its ruin tier: Damaged
 *   is scorched, Ravaged is cut down to a stump, Gutted is swapped for a
 *   broken model (ruinModel.ts) near the player and a low stump further out.
 *   Height cuts are a feature-state factor (`ruin`), never a filter.
 * - **City damage.** The rest of the city is hit too, picked by a stable hash
 *   of the feature id: some buildings are scorched, a few have collapsed
 *   (stumps, with broken models for the nearest), and a handful burn (ground
 *   glow, flames and a smoke column on the nearest). A site's own states
 *   override these.
 * - **Zoom.** Below LOD_ZOOM the basemap's flat building fills draw instead;
 *   heights grow in across one zoom level, so pinching in raises the city.
 *
 * Imperative on purpose: it touches thousands of features and animates them
 * per frame, which React would only get in the way of.
 */

/** Extrusions draw from here. CARTO's building ids are stable from z15 tiles. */
export const LOD_ZOOM = 15;
/** Heights grow from 0 to full across this much zoom above LOD_ZOOM. */
const ZOOM_RISE_SPAN = 1;
/** How long a building takes to rise out of the ground when revealed. */
const RISE_MS = 600;
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
export const SELECTED_COLOR = '#f0c040';
const BASE_BUILDING_COLOR = '#2a2e2a';
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
/** Broken-model piece shades; the site colour is mixed in so its state still reads. */
const RUIN_COLORS: Record<RuinKind, string> = {
  shell: '#27241f',
  slab: '#3a352d',
  pillar: '#302c26',
  rubble: '#3f392f',
};
const RUIN_SITE_TINT = 0.4;
/** Only the nearest Gutted sites get a broken model; the rest stay stumps. */
const MAX_RUINS = 30;
const RUIN_RANGE_M = 900;
/** Model generation budget per slice, so a burst of sites never hitches. */
const RUIN_BUDGET_MS = 8;
/** Lower than this there is nothing to break: it just stays a stump. */
const RUIN_MIN_H = 6;

/** Share of ordinary buildings that are scorched, collapsed, burning. */
const SCORCH_SHARE = 0.07;
const COLLAPSE_SHARE = 0.03;
const FIRE_SHARE = 0.01;
const BURN_COLOR = '#2c1a10';
/** Shorter than this a building has nothing to collapse / no roof worth a fire. */
const COLLAPSE_MIN_H = 10;
const FIRE_MIN_H = 6;
/** Broken models for collapsed ordinary buildings, after the sites' own. */
const MAX_WRECKS = 24;
/** Fires with a glow and a smoke column; the rest just look burnt. */
const MAX_FIRES = 14;
const FIRE_RANGE_M = 1600;
const FIRE_FLICKER_MS = 110;
/** Wrecks and fires are re-picked once the sight disc moves this far. */
const REPICK_M = 25;
const FIRE_SOURCE = 'fires-3d-src';
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
const SOLID_OPACITY = 0.9;
const FIRE_GLOW_LAYER = 'fires-3d-glow';
const FIRE_CORE_LAYER = 'fires-3d-core';

/** Stable 0..1 hash of a site id, so a ruin looks the same every visit. */
function hash01(id: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** How much of a ruined building still stands (height × this). */
function stumpFactor(siteId: string, tier: DestructionTier): number {
  if (tier === 2) return 0.5 + 0.25 * hash01(siteId, 3);
  if (tier === 3) return 0.18 + 0.14 * hash01(siteId, 3);
  return 1;
}

/** How much of a collapsed ordinary building still stands. */
const ambientStump = (key: string): number => 0.3 + 0.3 * hash01(key, 3);

/** Flames and a smoke column, one marker per fire (index.css .fx-*). */
function smokeElement(seed: number): { el: HTMLDivElement; puffs: HTMLDivElement } {
  const el = document.createElement('div');
  el.style.pointerEvents = 'none';
  const puffs = document.createElement('div');
  puffs.className = 'fx-smoke';
  const salt = Math.floor(seed * 1e6);
  // Flames first so the smoke rolls over them.
  for (let i = 0; i < 3; i++) {
    const flame = document.createElement('div');
    flame.className = 'fx-flame';
    flame.style.setProperty('--fx-dx', `${(i - 1) * 9}px`);
    flame.style.animationDelay = `${(-i * 0.17 - seed).toFixed(2)}s`;
    flame.style.animationDuration = `${(0.35 + 0.2 * hash01(String(i), salt + 1)).toFixed(2)}s`;
    if (i !== 1) flame.style.height = '22px';
    puffs.appendChild(flame);
  }
  // One wind direction per fire, with a little spread per puff.
  const lean = seed < 0.5 ? -1 : 1;
  for (let i = 0; i < 12; i++) {
    const puff = document.createElement('div');
    puff.className = 'fx-puff';
    puff.style.animationDelay = `${(-i * 0.58 - seed * 7).toFixed(2)}s`;
    puff.style.setProperty('--fx-drift', `${Math.round(lean * (25 + 45 * hash01(String(i), salt)))}px`);
    puffs.appendChild(puff);
  }
  el.appendChild(puffs);
  return { el, puffs };
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
  mrt: 30,
};

type FeatureId = string | number;

export interface Site3d {
  id: string;
  lat: number;
  lng: number;
  /** Footprint from the bake, `[lat, lng]` (sites without one match by point). */
  outline?: ReadonlyArray<readonly [number, number]>;
  category: PoiCategory;
  /** The building's colour while it stands for this site. */
  color: string;
  selected: boolean;
  /** Known ruin tier (visited street sites); absent draws it intact. */
  ruin?: DestructionTier;
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
    ? ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0]
    : ['coalesce', ['get', 'render_height'], ['get', 'height'], 8];
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    LOD_ZOOM,
    0,
    LOD_ZOOM + ZOOM_RISE_SPAN,
    ['*', own, ['coalesce', ['feature-state', 'rise'], 0], ['coalesce', ['feature-state', 'ruin'], ['feature-state', 'aruin'], 1]],
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

/** Selected → gold; otherwise the fogged flat colour while down, `color` once standing. */
function standingColor(color: unknown) {
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false],
    SELECTED_COLOR,
    ['interpolate', ['linear'], ['coalesce', ['feature-state', 'rise'], 0], 0, FLAT_COLOR, 1, ['to-color', color]],
  ] as unknown as string;
}

interface RuinModel {
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
  key: string;
  ids: FeatureId[];
  h: number;
  site?: string;
  lat?: number;
  lng?: number;
}

interface Indexed {
  lat: number;
  lng: number;
  h: number;
  part: boolean;
}

interface Fire {
  lat: number;
  lng: number;
  h: number;
  phase: number;
  smoke: Marker;
  puffs: HTMLDivElement;
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
  private explored: readonly ExploredCircle[] = [];
  private live: Disc | null = null;

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
  /** Piece state applied, by site: colour|selected. */
  private ruinApplied = new Map<string, string>();
  private nextPieceId = 1;
  /** Building feature → the wreck key whose pieces rise with it. */
  private wreckOf = new Map<FeatureId, string>();

  // City damage (see markDamage).
  private partIds = new Set<FeatureId>();
  private collapsedIds = new Set<FeatureId>();
  private fireIds = new Set<FeatureId>();
  /** Buildings whose scorch / stump state is already on. */
  private damaged = new Set<FeatureId>();
  private lastPick: { lat: number; lng: number } | null = null;
  private fires = new Map<FeatureId, Fire>();
  private fireTimer: ReturnType<typeof setInterval> | null = null;

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

  constructor(map: MlMap) {
    this.map = map;
    this.install();
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

  roofHeights(): ReadonlyMap<string, number> {
    const out = new Map<string, number>();
    for (const [id, h] of this.roofs) out.set(id, this.roofOf(id, h));
    return out;
  }

  private roofOf(id: string, h: number): number {
    const tier = this.sites.get(id)?.ruin ?? 0;
    if (tier === 3 && this.ruinShown.has(id)) return this.ruinCache.get(id)?.top ?? 0;
    return h * stumpFactor(id, tier);
  }

  /** Tell the badges when a roof moved (matching, a ruin tier, a model swap). */
  private publishRoofs() {
    const next = this.roofHeights();
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
              ['boolean', ['feature-state', 'burn'], false],
              BURN_COLOR,
              ['boolean', ['feature-state', 'scorch'], false],
              SCORCH_COLOR,
              BASE_BUILDING_COLOR,
            ],
          ]),
          'fill-extrusion-height': heightExpr(false),
          'fill-extrusion-base': heightExpr(true),
          'fill-extrusion-opacity': 0.9,
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
    map.addSource(RUINS_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
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
          'fill-extrusion-opacity': 0.9,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      slotId('buildings'),
    );
    // Fire light on the ground, under the extrusions so buildings stand in it.
    map.addSource(FIRE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const glow = (id: string, color: string, k: number, blur: number, op: number) =>
      map.addLayer(
        {
          id,
          type: 'circle',
          source: FIRE_SOURCE,
          minzoom: 13,
          paint: {
            'circle-color': color,
            'circle-radius': [
              'interpolate',
              ['exponential', 2],
              ['zoom'],
              12,
              ['*', ['get', 's'], k * pxPerMetre(12, 1.35)],
              20,
              ['*', ['get', 's'], k * pxPerMetre(20, 1.35)],
            ],
            'circle-blur': blur,
            'circle-opacity': ['*', op, ['get', 'w']],
            'circle-pitch-alignment': 'map',
            'circle-pitch-scale': 'map',
          },
        },
        BUILDINGS_LAYER,
      );
    glow(FIRE_GLOW_LAYER, '#ff5a14', 1, 1, 0.85);
    glow(FIRE_CORE_LAYER, '#ffb04a', 0.4, 0.9, 0.95);
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
    const map = this.map;
    map.off('sourcedata', this.onSourceData);
    map.off('idle', this.onIdle);
    map.off('move', this.onMove);
    if (this.indexTimer) clearTimeout(this.indexTimer);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.riseRaf) cancelAnimationFrame(this.riseRaf);
    if (this.ruinTimer) clearTimeout(this.ruinTimer);
    if (this.fireTimer) clearInterval(this.fireTimer);
    for (const f of this.fires.values()) f.smoke.remove();
    this.fires.clear();
    if (!alive(map)) return;
    map.getContainer().style.removeProperty('--roof-lift');
    if (map.getLayer(FOCUS_LAYER)) map.removeLayer(FOCUS_LAYER);
    if (map.getLayer(BUILDINGS_LAYER)) map.removeLayer(BUILDINGS_LAYER);
    if (map.getLayer(RUINS_LAYER)) map.removeLayer(RUINS_LAYER);
    if (map.getSource(RUINS_SOURCE)) map.removeSource(RUINS_SOURCE);
    for (const id of [FIRE_CORE_LAYER, FIRE_GLOW_LAYER]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(FIRE_SOURCE)) map.removeSource(FIRE_SOURCE);
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

  /** `explored` is compared by identity; pass the store's array as-is. */
  setReveal(explored: readonly ExploredCircle[], live: { lat: number; lng: number; radius: number }) {
    const same =
      explored === this.explored &&
      this.live?.lat === live.lat &&
      this.live.lng === live.lng &&
      this.live.r === live.radius;
    if (same) return;
    this.explored = explored;
    this.live = { lat: live.lat, lng: live.lng, r: live.radius };
    this.updateReveal(false);
    this.pickDamage();
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
    this.pickRuins();
    this.applySiteStates();
    this.publishRoofs();
    // A site's building stands even in fog, so membership changes the reveal.
    if (fresh || gone) this.updateReveal(false);
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
    this.placeSmoke();
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
    this.partIds.clear();
    this.collapsedIds.clear();
    this.fireIds.clear();
    for (const f of map.querySourceFeatures(this.src, { sourceLayer: this.sl })) {
      if (f.id === undefined || next.has(f.id)) continue;
      const at = anchorOf(f.geometry);
      if (!at) continue;
      const props = f.properties as Record<string, unknown>;
      const h = Number(props.render_height ?? props.height ?? 0);
      const c: Indexed = { lat: at[1], lng: at[0], h: Number.isFinite(h) ? h : 0, part: props.kind === 'building_part' };
      next.set(f.id, c);
      this.markDamage(f.id, c);
    }
    const first = this.index.size === 0;
    this.index = next;
    this.pickDamage(true);
    // The first reveal (entering 3D, loading a run) is instant; tiles that
    // load later rise in.
    this.updateReveal(first);
  }

  private updateReveal(instant: boolean) {
    const map = this.map;
    if (this.destroyed || !this.live || !this.index.size || !map.getLayer(BUILDINGS_LAYER)) return;
    const cosLat = Math.cos((this.live.lat * Math.PI) / 180);
    // Only explored discs that can touch the loaded area are worth testing.
    const b = map.getBounds();
    const padLat = 0.02;
    const discs: Disc[] = [];
    for (const c of this.explored) {
      const r = c.radius / 111_320;
      if (
        c.lat + r < b.getSouth() - padLat ||
        c.lat - r > b.getNorth() + padLat ||
        c.lng + r < b.getWest() - padLat ||
        c.lng - r > b.getEast() + padLat
      ) {
        continue;
      }
      discs.push({ lat: c.lat, lng: c.lng, r: c.radius });
    }
    const siteIds = new Set<FeatureId>();
    for (const [site, ids] of this.siteFeatures) if (this.sites.has(site)) for (const id of ids) siteIds.add(id);

    const snap = instant || this.instant;
    const now = performance.now();
    for (const [id, c] of this.index) {
      const cur = this.rise.get(id);
      const curTo = cur?.to ?? 0;
      const want =
        siteIds.has(id) || inDisc(c.lat, c.lng, this.live, cosLat) || discs.some((d) => inDisc(c.lat, c.lng, d, cosLat))
          ? 1
          : 0;
      if (want === curTo) continue;
      if (snap) {
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
    if (this.rising.size && !this.riseRaf) this.riseRaf = requestAnimationFrame(this.stepRise);
  }

  private stepRise = (now: number) => {
    this.riseRaf = 0;
    if (this.destroyed || !alive(this.map) || !this.map.getLayer(BUILDINGS_LAYER)) return;
    for (const id of this.rising) {
      const r = this.rise.get(id);
      if (!r) {
        this.rising.delete(id);
        continue;
      }
      const t = Math.min(1, (now - r.start) / RISE_MS);
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
    if (!changed) return;
    this.pickRuins();
    this.applySiteStates();
    this.publishRoofs();
    this.updateReveal(false);
    if (this.focus) this.drawFocus();
  }

  /** Push site colours, selection and ruin onto the buildings that are sites. */
  private applySiteStates() {
    const map = this.map;
    if (this.destroyed || !map.getLayer(BUILDINGS_LAYER)) return;
    const want = new Map<FeatureId, { color: string; selected: boolean; ruin: number }>();
    for (const [site, ids] of this.siteFeatures) {
      const s = this.sites.get(site);
      if (!s) continue;
      const tier = s.ruin ?? 0;
      const color = tier ? mixHex(s.color, SCORCH_COLOR, SCORCH_BY_TIER[tier]) : s.color;
      // A broken model stands in for the box, which lies flat under it.
      const ruin = tier === 3 && this.ruinShown.has(site) ? 0 : stumpFactor(site, tier);
      for (const id of ids) want.set(id, { color, selected: s.selected, ruin });
    }
    for (const id of [...this.applied.keys()]) {
      if (want.has(id)) continue;
      const target = { source: this.src, sourceLayer: this.sl, id };
      map.removeFeatureState(target, 'color');
      map.removeFeatureState(target, 'selected');
      map.removeFeatureState(target, 'ruin');
      this.applied.delete(id);
    }
    for (const [id, s] of want) {
      const key = `${s.color}|${s.selected ? 1 : 0}|${s.ruin}`;
      if (this.applied.get(id) === key) continue;
      map.setFeatureState({ source: this.src, sourceLayer: this.sl, id }, s);
      this.applied.set(id, key);
    }
    this.applyPieceStates();
  }

  // --- City damage ---------------------------------------------------------------

  /**
   * Fold one freshly indexed building into the city's damage: soot, a stump, a
   * fire. Picks are a stable hash of the feature id, so the same buildings are
   * wrecked every visit. A site's own states override these (see heightExpr).
   */
  private markDamage(id: FeatureId, c: Indexed) {
    if (c.part) {
      this.partIds.add(id);
      return;
    }
    const key = String(id);
    const fire = c.h >= FIRE_MIN_H && hash01(key, 7) < FIRE_SHARE;
    const collapse = c.h >= COLLAPSE_MIN_H && hash01(key, 2) < COLLAPSE_SHARE;
    if (fire) this.fireIds.add(id);
    if (collapse && !fire) this.collapsedIds.add(id);
    if (this.damaged.has(id)) return;
    if (!fire && !collapse && hash01(key, 1) >= SCORCH_SHARE) return;
    this.damaged.add(id);
    const state: Record<string, unknown> = { scorch: true };
    if (collapse) state.aruin = ambientStump(key);
    this.map.setFeatureState({ source: this.src, sourceLayer: this.sl, id }, state);
  }

  /** Re-pick wrecks and fires once the sight disc has moved far enough. */
  private pickDamage(force = false) {
    const live = this.live;
    if (!live) return;
    const last = this.lastPick;
    if (!force && last && metresBetween(last.lat, last.lng, live.lat, live.lng) < REPICK_M) return;
    this.lastPick = { lat: live.lat, lng: live.lng };
    this.pickRuins();
    this.pickFires();
  }

  // --- Ruin models --------------------------------------------------------------

  /**
   * The wrecks that get a broken model: the nearest Gutted sites, then the
   * nearest collapsed ordinary buildings. Everything else stays a stump.
   */
  private pickRuins() {
    if (this.destroyed || !this.live || !this.map.getLayer(RUINS_LAYER)) return;
    const live = this.live;
    const sites: Array<[number, Wreck]> = [];
    for (const [id, s] of this.sites) {
      const ids = this.siteFeatures.get(id);
      const h = this.roofs.get(id) ?? 0;
      if (s.ruin !== 3 || !ids || h < RUIN_MIN_H) continue;
      const d = metresBetween(live.lat, live.lng, s.lat, s.lng);
      if (d <= RUIN_RANGE_M) sites.push([d, { key: id, ids, h, site: id }]);
    }
    const city: Array<[number, Wreck]> = [];
    for (const id of this.collapsedIds) {
      const c = this.index.get(id);
      if (!c || this.featureToSite.has(id)) continue;
      const d = metresBetween(live.lat, live.lng, c.lat, c.lng);
      if (d <= RUIN_RANGE_M) city.push([d, { key: `b:${id}`, ids: [id], h: c.h, lat: c.lat, lng: c.lng }]);
    }
    sites.sort((a, b) => a[0] - b[0]);
    city.sort((a, b) => a[0] - b[0]);
    const next = [...sites.slice(0, MAX_RUINS), ...city.slice(0, MAX_WRECKS)].map(([, w]) => w);
    const keep = new Set(next.map((w) => w.key));
    let dropped = false;
    for (const key of [...this.ruinShown]) {
      if (keep.has(key)) continue;
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
      if (!model) {
        const built = this.makeRuin(w);
        if (!built) continue; // its tiles are not in yet: the next pick retries
        model = built;
        this.ruinCache.set(w.key, model);
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
    // A collapsed building takes the towers drawn as parts inside it down
    // too, and the tallest of them sets how tall the wreck can stand.
    const parts: FeatureId[] = [];
    let h = w.h;
    const { lat, lng } = w;
    if (!w.site && lat !== undefined && lng !== undefined) {
      for (const id of this.partIds) {
        const p = this.index.get(id);
        if (!p || Math.abs(p.lat - lat) > 0.003 || Math.abs(p.lng - lng) > 0.003) continue;
        if (!footprint.some((poly) => pointInRing(p.lng, p.lat, poly[0]))) continue;
        parts.push(id);
        h = Math.max(h, p.h);
      }
    }
    const pieces = breakBuilding(footprint, h, Math.floor(hash01(w.key, 9) * 2 ** 31));
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
    this.map.setFeatureState(target(model.owner), { aruin: on ? 0 : ambientStump(String(model.owner)) });
    for (const id of model.parts) this.map.setFeatureState(target(id), { aruin: on ? 0 : 1 });
  }

  /** A model came or went: redraw the pieces, re-flatten boxes, move badges. */
  private afterRuinChange() {
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
    // New data starts without feature-state: colour and rise go back on.
    this.ruinApplied.clear();
    for (const [id, key] of this.wreckOf) this.setPieceRise(key, this.rise.get(id)?.v ?? 0);
    this.applySiteStates();
    this.publishRoofs();
  }

  /** Pieces rise with the building they stand in for. */
  private risePieces(feature: FeatureId, v: number) {
    const key = this.wreckOf.get(feature);
    if (key !== undefined) this.setPieceRise(key, v);
  }

  private setPieceRise(key: string, rise: number) {
    for (const f of this.ruinCache.get(key)?.pieces ?? []) {
      this.map.setFeatureState({ source: RUINS_SOURCE, id: f.id as number }, { rise });
    }
  }

  /** Piece colours: their own shade (a site's colour mixed in), and selection. */
  private applyPieceStates() {
    if (!this.map.getSource(RUINS_SOURCE)) return;
    for (const key of this.ruinShown) {
      const model = this.ruinCache.get(key);
      if (!model) continue;
      const s = key.startsWith('b:') ? null : this.sites.get(key);
      if (!s && !key.startsWith('b:')) continue;
      const stateKey = s ? `${s.color}|${s.selected ? 1 : 0}` : 'city';
      if (this.ruinApplied.get(key) === stateKey) continue;
      for (const f of model.pieces) {
        const own = RUIN_COLORS[(f.properties as { kind: RuinKind }).kind];
        this.map.setFeatureState(
          { source: RUINS_SOURCE, id: f.id as number },
          s ? { color: mixHex(own, s.color, RUIN_SITE_TINT), selected: s.selected } : { color: own },
        );
      }
      this.ruinApplied.set(key, stateKey);
    }
  }

  // --- Fires -------------------------------------------------------------------

  /** Keep a glow and a smoke column on the nearest burning buildings. */
  private pickFires() {
    if (this.destroyed || !this.live || !this.map.getLayer(FIRE_GLOW_LAYER)) return;
    const live = this.live;
    const near: Array<[number, FeatureId]> = [];
    for (const id of this.fireIds) {
      const c = this.index.get(id);
      if (!c || this.featureToSite.has(id)) continue;
      const d = metresBetween(live.lat, live.lng, c.lat, c.lng);
      if (d <= FIRE_RANGE_M) near.push([d, id]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const want = new Set(near.slice(0, MAX_FIRES).map(([, id]) => id));
    for (const [id, f] of this.fires) {
      if (want.has(id)) continue;
      f.smoke.remove();
      this.map.setFeatureState({ source: this.src, sourceLayer: this.sl, id }, { burn: false });
      this.fires.delete(id);
    }
    for (const id of want) {
      if (this.fires.has(id)) continue;
      const c = this.index.get(id);
      if (!c) continue;
      const at = this.footprintCentre(id) ?? { lat: c.lat, lng: c.lng };
      const phase = hash01(String(id), 5);
      const { el, puffs } = smokeElement(phase);
      const smoke = new Marker({ element: el, anchor: 'center' }).setLngLat([at.lng, at.lat]).addTo(this.map);
      this.map.setFeatureState({ source: this.src, sourceLayer: this.sl, id }, { burn: true });
      this.fires.set(id, { ...at, h: c.h, phase: phase * Math.PI * 2, smoke, puffs });
    }
    if (this.fires.size && !this.fireTimer) {
      this.fireTimer = setInterval(this.flickerFires, FIRE_FLICKER_MS);
    } else if (!this.fires.size && this.fireTimer) {
      clearInterval(this.fireTimer);
      this.fireTimer = null;
    }
    this.flickerFires();
  }

  /** An indexed anchor is one tile's clipped piece; smoke leaves the whole roof's centre. */
  private footprintCentre(id: FeatureId): { lat: number; lng: number } | null {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const filter = ['==', ['id'], id] as unknown as FilterSpecification;
    for (const f of this.map.querySourceFeatures(this.src, { sourceLayer: this.sl, filter })) {
      const g = f.geometry;
      const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
      for (const ring of rings) {
        for (const [x, y] of ring) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return x0 === Infinity ? null : { lat: (y0 + y1) / 2, lng: (x0 + x1) / 2 };
  }

  /** Two out-of-step sines per fire read as flicker without looking periodic. */
  private flickerFires = () => {
    if (this.destroyed || !alive(this.map)) return;
    const t = performance.now() / 1000;
    const features: Feature[] = [];
    for (const f of this.fires.values()) {
      const w = 0.62 + 0.24 * Math.sin(t * 6.1 + f.phase) + 0.14 * Math.sin(t * 14.3 + f.phase * 3);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
        properties: { w, s: 38 + Math.min(f.h, 80) * 0.6 },
      });
    }
    (this.map.getSource(FIRE_SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    this.placeSmoke();
  };

  /** Smoke leaves the roof of a standing burning building (none in fog or zoomed out). */
  private placeSmoke() {
    if (!this.fires.size) return;
    const map = this.map;
    const z = map.getZoom();
    const zoomRise = Math.min(1, Math.max(0, (z - LOD_ZOOM) / ZOOM_RISE_SPAN));
    const lift = Math.sin((map.getPitch() * Math.PI) / 180) * zoomRise;
    const scale = Math.min(1.8, Math.max(0.45, 2 ** (z - 16.5)));
    for (const [id, f] of this.fires) {
      const rise = z < LOD_ZOOM ? 0 : this.rise.get(id)?.v ?? 0;
      const el = f.smoke.getElement();
      el.style.display = rise > 0.5 ? '' : 'none';
      if (rise <= 0.5) continue;
      f.smoke.setOffset([0, -f.h * rise * pxPerMetre(z, f.lat) * lift]);
      f.puffs.style.transform = `scale(${scale.toFixed(2)})`;
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
