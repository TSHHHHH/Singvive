import type { Map as MlMap } from 'maplibre-gl';
import { BASEMAP, GROUND_COLOR } from './mapStyle';
import { dimHex, mixHex } from './geo';
import { FOG_BANDS, FOG_COLOUR, FOG_TOTAL } from './fogGeometry';
import { alive } from './layers';
import { gradePaint, gradeRgb, type Grade } from './lighting';

/**
 * Applies the time of day to the basemap itself (see lighting.ts).
 *
 * Cost model: every change here is a handful of `setPaintProperty` calls on
 * zoom-only paint values (shader uniforms, no re-tessellation), made only
 * when the clock crosses a light step and the look actually moves. Between those the driver
 * does nothing at all, so the map still reaches zero renders at idle.
 */

/** Paint properties that hold the basemap's colours. Text stays as styled, for legibility. */
const COLOR_PROPS: Record<string, string[]> = {
  background: ['background-color'],
  fill: ['fill-color', 'fill-outline-color'],
  line: ['line-color'],
};

/**
 * Where ground shadows go in the basemap stack: under the first road line,
 * above land, parks and water. Roads stay crisp over a shadow, and the
 * shadows can be opaque, so overlapping ones never stack darker.
 */
export function groundShadowBefore(map: MlMap): string | undefined {
  for (const l of map.getStyle().layers) {
    if (l.type === 'line' && 'source' in l && l.source === BASEMAP.source) return l.id;
  }
  return undefined;
}

const hex = (rgb: number[]) =>
  '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');

const gradeHex = (h: string, g: Grade) => {
  const n = parseInt(h.slice(1), 16);
  return hex(gradeRgb((n >> 16) & 255, (n >> 8) & 255, n & 255, g));
};

/** The basemap ground's colour under a grade. */
export const groundColor = (g: Grade) => gradeHex(GROUND_COLOR, g);

/** The opaque colour of a shadow on the graded ground, at a strength 0..1. */
export function shadowColor(grade: Grade, strength: number): string {
  const k = Math.max(0, Math.min(1, strength));
  // A shadow halves the ground. By day it goes a little further and leans
  // blue (sky-lit): on the light map the plain building fills are themselves
  // mid-grey, and a shadow any lighter than them disappears into them.
  const g = groundColor(grade);
  const light = grade.light;
  return mixHex(g, mixHex(dimHex(g, 0.5 - 0.05 * light), '#2a3550', 0.2 * light), k);
}

/** Night's (the original) plain building colour; see buildings.ts. */
const NIGHT_BUILDING = '#2a2e2a';
/** A plain building by day: pale concrete, a step darker than the lit ground. */
const DAY_BUILDING = '#aca79b';
/** The fog over unexplored ground by day: a murky haze, still well darker than the lit city. */
const DAY_FOG = '#3e413b';

/** The fog's colour under a grade. */
export function fogColor(g: Grade): string {
  const c = mixHex(FOG_COLOUR, DAY_FOG, g.light);
  const n = parseInt(c.slice(1), 16);
  return hex([(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => v * g.tint[i]));
}

/** Plain-building colours for the 3D engine: standing, and lying flat in the fog. */
export function buildingTone(g: Grade | null): { base: string; flat: string } {
  // null: lighting off, the colours as they always were.
  if (!g) return { base: NIGHT_BUILDING, flat: dimHex(mixHex(GROUND_COLOR, FOG_COLOUR, FOG_TOTAL), 0.7) };
  const b = parseInt(mixHex(NIGHT_BUILDING, DAY_BUILDING, g.light).slice(1), 16);
  const base = hex([(b >> 16) & 255, (b >> 8) & 255, b & 255].map((v, i) => v * g.tint[i]));
  return { base, flat: dimHex(mixHex(groundColor(g), fogColor(g), FOG_TOTAL), 0.7) };
}

const FOG_LAYERS = Array.from({ length: FOG_BANDS }, (_, k) => `fog-${k}-fill`);

export class DaylightDriver {
  private readonly map: MlMap;
  /** The basemap's own colours, as styled, by layer and property. */
  private readonly original = new Map<string, Map<string, unknown>>();
  private grade = '';
  private fog = FOG_COLOUR;

  constructor(map: MlMap) {
    this.map = map;
    // The fog overlay may mount after this driver; give it the phase's
    // colour when it appears. A cheap check, and a no-op once it matches.
    map.on('styledata', this.paintFog);
    for (const l of map.getStyle().layers) {
      const props = COLOR_PROPS[l.type];
      if (!props) continue;
      if (l.type !== 'background' && !('source' in l && l.source === BASEMAP.source)) continue;
      const own = new Map<string, unknown>();
      for (const p of props) {
        const v = map.getPaintProperty(l.id, p);
        if (v !== undefined) own.set(p, v);
      }
      if (own.size) this.original.set(l.id, own);
    }
  }

  /** Grade the basemap; null restores it as styled. Skipped when nothing moved. */
  setGrade(g: Grade | null) {
    const key = g ? JSON.stringify(g, (_, v) => (typeof v === 'number' ? +v.toFixed(3) : v)) : '';
    if (key === this.grade || !alive(this.map)) return;
    this.grade = key;
    for (const [id, props] of this.original) {
      if (!this.map.getLayer(id)) continue;
      for (const [p, v] of props) this.map.setPaintProperty(id, p, g ? gradePaint(v, g) : v);
    }
    this.fog = g ? fogColor(g) : FOG_COLOUR;
    this.paintFog();
  }

  private paintFog = () => {
    const map = this.map;
    if (!alive(map)) return;
    for (const id of FOG_LAYERS) {
      if (map.getLayer(id) && map.getPaintProperty(id, 'fill-color') !== this.fog) map.setPaintProperty(id, 'fill-color', this.fog);
    }
  };

  destroy() {
    if (!alive(this.map)) return;
    this.map.off('styledata', this.paintFog);
    this.setGrade(null);
  }
}
