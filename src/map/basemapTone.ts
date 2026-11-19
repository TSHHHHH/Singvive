import type { Map as MlMap, LayerSpecification, ExpressionSpecification } from 'maplibre-gl';
import type { TimeOfDay } from '../game/types';
import { BASEMAP, GROUND_COLOR } from './mapStyle';
import { alive } from './layers';
import { mixHex } from './geo';

/**
 * The basemap's own colours, re-tuned for contrast.
 *
 * CARTO Dark Matter paints every road a similar dim blue-grey on near-black,
 * so the street plan barely reads once the fog lifts. This pass, run once at
 * style load, repaints the basemap by *what a layer draws* (its source-layer
 * and the features' `kind` / `class`), never by CARTO's layer ids, so it keeps
 * working if CARTO renames or splits layers:
 *
 * - **Roads** get a clear hierarchy: main roads warm grey, secondary muted
 *   grey, minor streets dark grey, paths darkest. Casings go to the ground
 *   colour so each road has a crisp edge.
 * - **Ground** is a neutral, slightly deeper grey (no green or blue cast), so
 *   faction colours, hazard zones and beacons own the colour on the map.
 * - **Water and green space** are low-saturation blue-grey and green-grey.
 *
 * At night the roads switch to a cool grey and a soft glow layer comes on
 * under them (`setBasemapTime`). That is a paint change on the hour band
 * flipping: an event, never a timer, so the map still idles at 0 renders.
 */

export type RoadTier = 'main' | 'secondary' | 'minor' | 'path';

export interface RoadTone {
  main: string;
  secondary: string;
  minor: string;
  path: string;
}

/** Neutral ground: Dark Matter's #0e0e0e, a touch deeper and dead neutral. */
export const TONE_GROUND = GROUND_COLOR;
/** Built-up land use (residential, commercial…): just off the ground. */
export const TONE_LANDUSE = '#111214';
/** Parks, woods, grass: a dark green-grey, not a green. */
export const TONE_GREEN = '#1a211d';
/** Sea and reservoirs: a dark blue-grey. */
export const TONE_WATER = '#161d23';
export const TONE_WATERWAY = '#25313a';
/** Road casings: the ground, a shade darker, so every road has an edge. */
export const TONE_CASING = '#070808';

export const DAY_ROADS: RoadTone = {
  main: '#b4b0a4',
  secondary: '#858781',
  minor: '#4b4f54',
  path: '#2c2f33',
};

/** Night: cool greys with a soft glow on the big roads. */
export const NIGHT_ROADS: RoadTone = {
  main: '#99a7ba',
  secondary: '#737f90',
  minor: '#3e4550',
  path: '#272c33',
};

/** The night glow under main and secondary roads. */
const GLOW_COLOR = '#8fb0ff';
export const ROAD_GLOW_LAYER = 'tone-road-glow';

export function roadsFor(time: TimeOfDay): RoadTone {
  return time === 'night' ? NIGHT_ROADS : DAY_ROADS;
}

const KIND = ['coalesce', ['get', 'kind'], ''] as ExpressionSpecification;
/** Protomaps `kind_detail` is the OSM highway tag; OpenMapTiles calls it `class`. */
const DETAIL = ['coalesce', ['get', 'kind_detail'], ['get', 'class'], ''] as ExpressionSpecification;
const isIn = (e: ExpressionSpecification, values: string[]) =>
  ['in', e, ['literal', values]] as unknown as ExpressionSpecification;

const MAIN_DETAIL = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link'];
const SECONDARY_DETAIL = ['secondary', 'secondary_link', 'tertiary', 'tertiary_link'];
const PATH_DETAIL = ['path', 'footway', 'cycleway', 'steps', 'pedestrian', 'track', 'bridleway', 'service'];

/** Which tier a road feature is, from either tile schema. */
export const ROAD_TIER = [
  'case',
  ['any', ['==', KIND, 'highway'], isIn(DETAIL, MAIN_DETAIL)],
  'main',
  ['any', ['==', KIND, 'major_road'], isIn(DETAIL, SECONDARY_DETAIL)],
  'secondary',
  ['any', isIn(KIND, ['path', 'other']), isIn(DETAIL, PATH_DETAIL)],
  'path',
  'minor',
] as unknown as ExpressionSpecification;

export function roadColor(tone: RoadTone): ExpressionSpecification {
  return ['match', ROAD_TIER, 'main', tone.main, 'secondary', tone.secondary, 'path', tone.path, tone.minor] as unknown as ExpressionSpecification;
}

const GREEN_KINDS = [
  'park',
  'forest',
  'wood',
  'grass',
  'garden',
  'golf_course',
  'nature_reserve',
  'national_park',
  'protected_area',
  'meadow',
  'scrub',
  'heath',
  'wetland',
  'cemetery',
  'grave_yard',
  'recreation_ground',
  'village_green',
  'allotments',
  'farmland',
  'orchard',
  'pitch',
];
const GREEN = ['any', isIn(KIND, GREEN_KINDS), isIn(['coalesce', ['get', 'class'], ''] as ExpressionSpecification, GREEN_KINDS), isIn(['coalesce', ['get', 'subclass'], ''] as ExpressionSpecification, GREEN_KINDS)] as unknown as ExpressionSpecification;

const ROAD_LAYERS = new Set(['roads', 'transportation']);
const LAND_LAYERS = new Set(['landuse', 'landcover', 'natural', 'park']);
const GROUND_LAYERS = new Set(['earth']);

export type ToneRole = 'background' | 'ground' | 'land' | 'water' | 'waterway' | 'road' | 'tunnel' | 'casing';

/**
 * What a basemap layer draws, from its source-layer, type and id. Null leaves
 * it alone (labels, boundaries, rail, the 2D building fill, anything else).
 */
export function toneRole(layer: LayerSpecification): ToneRole | null {
  if (layer.type === 'background') return 'background';
  if (!('source-layer' in layer) || typeof layer['source-layer'] !== 'string') return null;
  const sl = layer['source-layer'];
  const id = layer.id.toLowerCase();
  if (sl === BASEMAP.buildingLayer) return null;
  if (layer.type === 'fill') {
    if (sl === 'water') return 'water';
    if (GROUND_LAYERS.has(sl)) return 'ground';
    if (LAND_LAYERS.has(sl)) return 'land';
    return null;
  }
  if (layer.type === 'line') {
    if (sl === 'water' || sl === 'waterway') return 'waterway';
    if (!ROAD_LAYERS.has(sl)) return null;
    if (/rail|ferry|aeroway|runway|taxiway|boundary/.test(id)) return null;
    if (/case|casing|outline/.test(id)) return 'casing';
    if (/tunnel/.test(id)) return 'tunnel';
    return 'road';
  }
  return null;
}

interface ToneState {
  surfaces: { id: string; role: 'background' | 'ground' | 'land' }[];
  daylight: number;
  roads: string[];
  tunnels: string[];
  glow: boolean;
  time: TimeOfDay | null;
}

const states = new WeakMap<MlMap, ToneState>();

/**
 * Repaint the freshly loaded basemap. Call once on style load, before any
 * overlay is added (it only looks at the style's own layers).
 */
export function toneBasemap(map: MlMap) {
  const st: ToneState = { surfaces: [], daylight: 0, roads: [], tunnels: [], glow: false, time: null };
  let roadSrc: { source: string; sourceLayer: string; before: string | undefined } | null = null;
  const layers = map.getStyle().layers;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const role = toneRole(layer);
    if (!role) continue;
    const id = layer.id;
    if (role === 'background' || role === 'ground' || role === 'land') st.surfaces.push({ id, role });
    switch (role) {
      case 'background':
        map.setPaintProperty(id, 'background-color', TONE_GROUND);
        break;
      case 'ground':
        map.setPaintProperty(id, 'fill-color', TONE_GROUND);
        map.setPaintProperty(id, 'fill-opacity', 1);
        break;
      case 'land':
        map.setPaintProperty(id, 'fill-color', ['case', GREEN, TONE_GREEN, TONE_LANDUSE] as ExpressionSpecification);
        map.setPaintProperty(id, 'fill-opacity', 1);
        break;
      case 'water':
        map.setPaintProperty(id, 'fill-color', TONE_WATER);
        break;
      case 'waterway':
        map.setPaintProperty(id, 'line-color', TONE_WATERWAY);
        break;
      case 'casing':
        map.setPaintProperty(id, 'line-color', TONE_CASING);
        break;
      case 'road':
      case 'tunnel': {
        (role === 'road' ? st.roads : st.tunnels).push(id);
        map.setPaintProperty(id, 'line-opacity', role === 'road' ? 1 : 0.45);
        if (!roadSrc && 'source' in layer && typeof layer.source === 'string') {
          // The glow sits just under the first road fill, over every casing.
          roadSrc = { source: layer.source, sourceLayer: (layer as { 'source-layer': string })['source-layer'], before: id };
        }
        break;
      }
    }
  }
  if (roadSrc) {
    map.addLayer(
      {
        id: ROAD_GLOW_LAYER,
        type: 'line',
        source: roadSrc.source,
        'source-layer': roadSrc.sourceLayer,
        minzoom: 11,
        filter: ['match', ROAD_TIER, ['main', 'secondary'], true, false] as unknown as ExpressionSpecification,
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': GLOW_COLOR,
          'line-opacity': ['match', ROAD_TIER, 'main', 0.2, 0.09] as unknown as ExpressionSpecification,
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, 3, 14, 10, 17, 34, 19, 70],
          'line-blur': ['interpolate', ['exponential', 1.6], ['zoom'], 11, 2, 14, 7, 17, 24, 19, 50],
        },
      },
      roadSrc.before,
    );
    st.glow = true;
  }
  states.set(map, st);
  setBasemapTime(map, 'day');
}

/** Give cast shadows a readable sunlit surface. These layers sit below the fog and gameplay overlays. */
export function setGroundDaylight(map: MlMap, daylight: number) {
  const st = states.get(map);
  if (!st || st.daylight === daylight || !alive(map)) return;
  st.daylight = daylight;
  const ground = mixHex(TONE_GROUND, '#68624e', daylight);
  const land = mixHex(TONE_LANDUSE, '#756c50', daylight);
  const green = mixHex(TONE_GREEN, '#515b46', daylight);
  for (const { id, role } of st.surfaces) {
    if (!map.getLayer(id)) continue;
    if (role === 'background') map.setPaintProperty(id, 'background-color', ground);
    else map.setPaintProperty(id, 'fill-color', role === 'land' ? ['case', GREEN, green, land] : ground);
  }
}

/** Day / dusk roads are warm grey; night turns them cool and lights the glow. */
export function setBasemapTime(map: MlMap, time: TimeOfDay) {
  const st = states.get(map);
  if (!st || st.time === time || !alive(map)) return;
  st.time = time;
  const color = roadColor(roadsFor(time));
  for (const id of st.roads) if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', color);
  for (const id of st.tunnels) if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', color);
  if (st.glow && map.getLayer(ROAD_GLOW_LAYER)) {
    map.setLayoutProperty(ROAD_GLOW_LAYER, 'visibility', time === 'night' ? 'visible' : 'none');
  }
}
