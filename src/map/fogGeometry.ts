import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { FeatureCollection } from 'geojson';
import type { ExploredCircle } from '../game/fog';
import { discPolygon, EMPTY_FC, type LngLatPair } from './geo';

/**
 * Fog of war as ground polygons: the world rectangle minus every explored
 * disc, then minus the live sight disc. Drawn as a fill layer under the
 * pins, so the fog hides basemap ground and labels but not the game UI.
 *
 * The explored union is the expensive part (tens of ms on a long run) and
 * only changes when a new circle is banked; it is cached per band. Each live
 * tick subtracts one disc from the cached base, which costs ~1 ms.
 *
 * Soft edge: `bands` stacked translucent fills whose holes shrink by
 * `SOFT_STEP_M` each, so the edge steps from clear to full fog.
 */

/** Generous box around the island; the fog never needs to reach further. */
const WORLD: Polygon = [
  [
    [103.4, 1.05],
    [104.3, 1.05],
    [104.3, 1.55],
    [103.4, 1.55],
    [103.4, 1.05],
  ],
];

export const FOG_BANDS = 3;
/** Fog tint and total opacity. Near-black: the unexplored island recedes.
 *  The 3D buildings match their unrevealed footprints to it (buildings.ts). */
export const FOG_COLOUR = '#060806';
export const FOG_TOTAL = 0.92;
export const SOFT_STEP_M = 45;

/** Per-band opacity so `bands` stacked layers compound to `total`. */
export const bandOpacity = (total: number, bands = FOG_BANDS) => 1 - (1 - total) ** (1 / bands);

const discOf = (lat: number, lng: number, r: number) => discPolygon({ lat, lng, r }, 40) as Polygon;

function multiToFc(m: MultiPolygon): FeatureCollection {
  if (!m.length) return EMPTY_FC;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'MultiPolygon', coordinates: m as LngLatPair[][][] },
      },
    ],
  };
}

export class FogGeometry {
  private explored: readonly ExploredCircle[] | null = null;
  private bases: MultiPolygon[] = [];

  /**
   * One FeatureCollection per band. `explored` is compared by identity; pass
   * the store's array as-is so the union is rebuilt only when it changes.
   */
  compute(
    explored: readonly ExploredCircle[],
    live: { lat: number; lng: number; radius: number },
    bands = FOG_BANDS,
  ): FeatureCollection[] {
    if (explored !== this.explored) {
      this.explored = explored;
      this.bases = [];
    }
    const out: FeatureCollection[] = [];
    for (let k = 0; k < bands; k++) {
      const shrink = k * SOFT_STEP_M;
      let base = this.bases[k];
      if (!base) {
        const holes = explored
          .filter((c) => c.radius - shrink > 1)
          .map((c) => discOf(c.lat, c.lng, c.radius - shrink));
        base = holes.length ? polygonClipping.difference(WORLD, ...holes) : [WORLD];
        this.bases[k] = base;
      }
      const r = live.radius - shrink;
      const fog = r > 1 ? polygonClipping.difference(base, discOf(live.lat, live.lng, r)) : base;
      out.push(multiToFc(fog));
    }
    return out;
  }
}

export const VEIL_BANDS = 6;
/** The veil is clear inside this share of the sight radius, then ramps to full. */
const VEIL_CLEAR = 0.58;

/**
 * The night veil: everything outside the sight disc, with a soft rim, as one
 * FeatureCollection of `bands` holed rectangles (property `k`). The holes
 * step from `VEIL_CLEAR · r` out to `r`, so stacked at `bandOpacity(alpha)`
 * they ramp like the old radial gradient. A single hole needs no clipping:
 * the world ring plus the disc as an inner ring, wound the other way.
 */
export function veilBands(lat: number, lng: number, radius: number, bands = VEIL_BANDS): FeatureCollection {
  const outer = WORLD[0] as LngLatPair[];
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: bands }, (_, k) => {
      const r = radius * (VEIL_CLEAR + ((1 - VEIL_CLEAR) * k) / Math.max(1, bands - 1));
      const hole = (discOf(lat, lng, Math.max(1, r))[0] as LngLatPair[]).slice().reverse();
      return {
        type: 'Feature' as const,
        properties: { k },
        geometry: { type: 'Polygon' as const, coordinates: [outer, hole] },
      };
    }),
  };
}
