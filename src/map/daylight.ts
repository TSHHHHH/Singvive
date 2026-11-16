import type { Map as MlMap } from 'maplibre-gl';
import { BASEMAP, GROUND_COLOR } from './mapStyle';
import { dimHex, mixHex, pxPerMetre } from './geo';
import { FOG_BANDS, FOG_COLOUR, FOG_TOTAL } from './fogGeometry';
import { alive } from './layers';
import { GRADES, gradePaint, gradeRgb, shadowDir, type LightPhase } from './lighting';

/**
 * Applies the time of day to the basemap itself (see lighting.ts).
 *
 * Cost model: every change here is a handful of `setPaintProperty` calls on
 * zoom-only paint values (shader uniforms, no re-tessellation), made once
 * when the light phase or the sun's hour changes. Between those the driver
 * does nothing at all, so the map still reaches zero renders at idle.
 */

/** Paint properties that hold the basemap's colours. Text stays as styled, for legibility. */
const COLOR_PROPS: Record<string, string[]> = {
  background: ['background-color'],
  fill: ['fill-color', 'fill-outline-color'],
  line: ['line-color'],
};

export const DROP_SHADOW_LAYER = 'daylight-drop-shadow';

/** Flat-map drop shadow: what a nominal mid-rise block throws, metres per unit of ratio. */
const DROP_HEIGHT_M = 9;
/** Cap on the flat drop shadow, metres: past this it stops reading as a shadow. */
const DROP_MAX_M = 18;

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

const gradeHex = (h: string, phase: LightPhase) => {
  const n = parseInt(h.slice(1), 16);
  return hex(gradeRgb((n >> 16) & 255, (n >> 8) & 255, n & 255, GRADES[phase]));
};

/** The basemap ground's colour in a light phase. */
export const groundColor = (phase: LightPhase) => gradeHex(GROUND_COLOR, phase);

/** The opaque colour of a shadow on the graded ground, at a strength 0..1. */
export function shadowColor(phase: LightPhase, strength: number): string {
  const k = Math.max(0, Math.min(1, strength));
  // By day a shadow takes a third off the ground and leans blue (sky-lit);
  // on the dark map it halves it.
  const g = groundColor(phase);
  const light = GRADES[phase].light;
  return mixHex(g, mixHex(dimHex(g, 0.5 + 0.17 * light), '#2a3550', 0.15 * light), k);
}

/** Night's (the original) plain building colour; see buildings.ts. */
const NIGHT_BUILDING = '#2a2e2a';
/** A plain building by day: pale concrete, a step darker than the lit ground. */
const DAY_BUILDING = '#aca79b';
/** The fog over unexplored ground by day: a murky haze, still well darker than the lit city. */
const DAY_FOG = '#3e413b';

/** The fog's colour in a light phase. */
export function fogColor(phase: LightPhase): string {
  const g = GRADES[phase];
  const c = mixHex(FOG_COLOUR, DAY_FOG, g.light);
  const n = parseInt(c.slice(1), 16);
  return hex([(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => v * g.tint[i]));
}

/** Plain-building colours for the 3D engine: standing, and lying flat in the fog. */
export function buildingTone(phase: LightPhase | null): { base: string; flat: string } {
  // null: lighting off, the colours as they always were.
  if (!phase) return { base: NIGHT_BUILDING, flat: dimHex(mixHex(GROUND_COLOR, FOG_COLOUR, FOG_TOTAL), 0.7) };
  const g = GRADES[phase];
  const b = parseInt(mixHex(NIGHT_BUILDING, DAY_BUILDING, g.light).slice(1), 16);
  const base = hex([(b >> 16) & 255, (b >> 8) & 255, b & 255].map((v, i) => v * g.tint[i]));
  return { base, flat: dimHex(mixHex(groundColor(phase), fogColor(phase), FOG_TOTAL), 0.7) };
}

const FOG_LAYERS = Array.from({ length: FOG_BANDS }, (_, k) => `fog-${k}-fill`);

export class DaylightDriver {
  private readonly map: MlMap;
  /** The basemap's own colours, as styled, by layer and property. */
  private readonly original = new Map<string, Map<string, unknown>>();
  private phase: LightPhase | null = null;
  private drop: string | null = null;
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

  /** Grade the basemap for a light phase; null restores it as styled. */
  setPhase(phase: LightPhase | null) {
    if (phase === this.phase || !alive(this.map)) return;
    this.phase = phase;
    const g = phase ? GRADES[phase] : null;
    for (const [id, props] of this.original) {
      if (!this.map.getLayer(id)) continue;
      for (const [p, v] of props) this.map.setPaintProperty(id, p, g ? gradePaint(v, g) : v);
    }
    this.fog = phase ? fogColor(phase) : FOG_COLOUR;
    this.paintFog();
  }

  private paintFog = () => {
    const map = this.map;
    if (!alive(map)) return;
    for (const id of FOG_LAYERS) {
      if (map.getLayer(id) && map.getPaintProperty(id, 'fill-color') !== this.fog) map.setPaintProperty(id, 'fill-color', this.fog);
    }
  };

  /**
   * The flat map's drop shadow: a copy of every building footprint, slid
   * away from the sun, under the roads. One fill layer whose offset is a
   * zoom-only expression, so it costs one extra fill draw per frame and
   * nothing at all when the camera is still. null removes it.
   */
  setDropShadow(opts: { az: number; ratio: number; color: string } | null) {
    const map = this.map;
    if (!alive(map)) return;
    const key = opts ? `${opts.az.toFixed(1)}|${opts.ratio.toFixed(3)}|${opts.color}` : null;
    if (key === this.drop) return;
    this.drop = key;
    if (!opts || opts.ratio <= 0) {
      if (map.getLayer(DROP_SHADOW_LAYER)) map.removeLayer(DROP_SHADOW_LAYER);
      return;
    }
    const lat = map.getCenter().lat;
    const len = Math.min(DROP_MAX_M, DROP_HEIGHT_M * opts.ratio);
    const [ex, ny] = shadowDir(opts.az);
    // fill-translate is in screen pixels (y down): metres × px-per-metre,
    // doubling per zoom so the shadow stays the same size on the ground.
    const at = (z: number) => {
      const k = len * pxPerMetre(z, lat);
      return ['literal', [ex * k, -ny * k]];
    };
    const translate = ['interpolate', ['exponential', 2], ['zoom'], 13, at(13), 20, at(20)];
    if (!map.getLayer(DROP_SHADOW_LAYER)) {
      map.addLayer(
        {
          id: DROP_SHADOW_LAYER,
          type: 'fill',
          source: BASEMAP.source,
          'source-layer': BASEMAP.buildingLayer,
          minzoom: 13,
          paint: {
            'fill-color': opts.color,
            'fill-antialias': false,
            'fill-translate-anchor': 'map',
            'fill-translate': translate as unknown as [number, number],
          },
        },
        groundShadowBefore(map),
      );
    } else {
      map.setPaintProperty(DROP_SHADOW_LAYER, 'fill-color', opts.color);
      map.setPaintProperty(DROP_SHADOW_LAYER, 'fill-translate', translate);
    }
  }

  destroy() {
    if (!alive(this.map)) return;
    this.map.off('styledata', this.paintFog);
    this.setPhase(null);
    this.setDropShadow(null);
  }
}
