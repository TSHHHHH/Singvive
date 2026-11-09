import { SG_BOUNDS } from '../game/singapore';
import type { LatLngBox } from './geo';

// Shared basemap config, so every map (run, spawn, route planner) looks the same.
//
// ACTIVE: CARTO "Dark Matter" vector style. It's the same look as the old
// raster tiles, but the vector tiles carry building heights (`height` /
// `min_height`), which the 3D view extrudes. Vector tiles need no API key and
// are never watermarked (only CARTO's raster tiles are). Glyphs and sprites
// come from the style itself.
//
// CARTO's vector tiles are built to z15 and overzoomed past it; feature ids
// are only unique within z15 tiles (see buildings.ts, LOD_ZOOM).

export interface Basemap {
  /** Style JSON URL. */
  style: string;
  /** Vector source id inside the style that holds the buildings. */
  source: string;
  /** Source-layer holding building footprints. */
  buildingLayer: string;
  /** Fonts the style's glyph server is known to serve (for our own labels). */
  fonts: string[];
  attribution: string;
}

export const CARTO_DARK: Basemap = {
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  source: 'protomaps',
  buildingLayer: 'buildings',
  fonts: ['Montserrat Medium', 'Open Sans Regular', 'Noto Sans Regular'],
  // CARTO's terms require attributing both them and OpenStreetMap.
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
};

// ALTERNATIVE, if CARTO is ever blocked or rate-limited: OpenFreeMap "Dark"
// (OpenMapTiles schema, keyless, no usage limits). Buildings carry
// `render_height` / `render_min_height`, which the height expressions in
// buildings.ts already fall back to.
export const OPENFREEMAP_DARK: Basemap = {
  style: 'https://tiles.openfreemap.org/styles/dark',
  source: 'openmaptiles',
  buildingLayer: 'building',
  fonts: ['Noto Sans Regular'],
  attribution: '&copy; OpenFreeMap &copy; OpenMapTiles &copy; OpenStreetMap contributors',
};

export const BASEMAP: Basemap = CARTO_DARK;

/** Roughly the basemap's own ground colour (Dark Matter background). */
export const GROUND_COLOR = '#0e0e0e';

/**
 * Overlay slots, bottom to top. Each is an invisible marker layer added once
 * the style loads; an overlay inserts its layers *before* its slot's marker,
 * so draw order never depends on which React component mounted first.
 *
 * The basemap's own labels are moved under `fog` so unexplored street names
 * stay hidden, as they were when they were baked into raster tiles. The town
 * `wash` sits above the fog: it is the island-scale situation read.
 */
export const SLOTS = [
  'terrain',
  'labels',
  'fog',
  'wash',
  'hazard',
  'ring',
  'poi',
  'trail',
  'noise',
  'veil',
  'mrt',
  'buildings',
  'edge',
  'top',
] as const;

export type Slot = (typeof SLOTS)[number];

export const slotId = (slot: Slot) => `slot:${slot}`;

/** The island's playable box, as the camera limit for the 2D maps. */
export const SG_BOX: LatLngBox = {
  south: SG_BOUNDS.minLat,
  west: SG_BOUNDS.minLng,
  north: SG_BOUNDS.maxLat,
  east: SG_BOUNDS.maxLng,
};

/**
 * The run map's world is a disc around the island: clear out to
 * `EDGE_CLEAR_M`, fading to near-black by `EDGE_DARK_M` (EdgeVignette).
 * Its camera limit is a square a little inside the dark ring, so panning to
 * any edge shows the fade, never the raw basemap beyond it.
 */
export const ISLAND_CENTRE = { lat: 1.34, lng: 103.825 };
export const EDGE_CLEAR_M = 25_000;
export const EDGE_DARK_M = 40_000;
const RUN_HALF_M = 35_000;
const RUN_HALF_LAT = RUN_HALF_M / 111_320;
const RUN_HALF_LNG = RUN_HALF_M / (111_320 * Math.cos((ISLAND_CENTRE.lat * Math.PI) / 180));
export const RUN_BOX: LatLngBox = {
  south: ISLAND_CENTRE.lat - RUN_HALF_LAT,
  west: ISLAND_CENTRE.lng - RUN_HALF_LNG,
  north: ISLAND_CENTRE.lat + RUN_HALF_LAT,
  east: ISLAND_CENTRE.lng + RUN_HALF_LNG,
};
