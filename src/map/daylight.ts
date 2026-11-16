import type { Map as MlMap } from 'maplibre-gl';
import { BASEMAP, GROUND_COLOR } from './mapStyle';
import { pxPerMetre } from './geo';
import { alive } from './layers';
import { GRADES, gradePaint, shadowDir, type LightPhase } from './lighting';

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

/** The opaque colour of a shadow on the graded ground, at a strength 0..1. */
export function shadowColor(phase: LightPhase, strength: number): string {
  const g = GRADES[phase];
  const n = parseInt(GROUND_COLOR.slice(1), 16);
  const k = 1 - 0.5 * Math.max(0, Math.min(1, strength));
  const ch = (s: number, i: number) =>
    Math.max(0, Math.min(255, Math.round((((n >> s) & 255) * g.gain + g.lift[i]) * k)))
      .toString(16)
      .padStart(2, '0');
  // Shadows are lit by the sky, so they lean a little blue.
  return `#${ch(16, 0)}${ch(8, 1)}${ch(0, 2)}`;
}

export class DaylightDriver {
  private readonly map: MlMap;
  /** The basemap's own colours, as styled, by layer and property. */
  private readonly original = new Map<string, Map<string, unknown>>();
  private phase: LightPhase | null = null;
  private drop: string | null = null;

  constructor(map: MlMap) {
    this.map = map;
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
  }

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
    this.setPhase(null);
    this.setDropShadow(null);
  }
}
