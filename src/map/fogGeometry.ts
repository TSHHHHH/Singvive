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

/**
 * Box around the island, past EdgeVignette's dark ring (EDGE_DARK_M) on every
 * side, so the fog never ends in a visible straight edge.
 */
const WORLD: Polygon = [
  [
    [103.3, 0.9],
    [104.4, 0.9],
    [104.4, 1.8],
    [103.3, 1.8],
    [103.3, 0.9],
  ],
];

export const FOG_BANDS = 3;
/** Fog tint and total opacity. Near-black: the unexplored island recedes.
 *  The 3D buildings match their unrevealed footprints to it (buildings.ts). */
export const FOG_COLOUR = '#060707';
export const FOG_TOTAL = 0.92;
export const SOFT_STEP_M = 45;

/** Per-band opacity so `bands` stacked layers compound to `total`. */
export const bandOpacity = (total: number, bands = FOG_BANDS) => 1 - (1 - total) ** (1 / bands);

const discOf = (lat: number, lng: number, r: number) => discPolygon({ lat, lng, r }, 40) as Polygon;

/** Every circle shrunk by `shrink` metres, fused. */
function unionOf(circles: readonly ExploredCircle[], shrink: number): MultiPolygon {
  const discs = circles.filter((c) => c.radius - shrink > 1).map((c) => discOf(c.lat, c.lng, c.radius - shrink));
  return discs.length ? polygonClipping.union(discs[0], ...discs.slice(1)) : [];
}

type Box = [number, number, number, number];
interface Boxed { poly: Polygon; b: Box }

function boxOf(poly: Polygon): Box {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of poly[0]) {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
  return b;
}
const withBoxes = (m: MultiPolygon): Boxed[] => m.map((poly) => ({ poly, b: boxOf(poly) }));
const overlaps = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/**
 * The world minus disjoint `clear` polygons, built without clipping: their
 * outer rings become the world's holes, and their own holes (fog islands
 * inside explored ground) become fog polygons of their own.
 */
function complement(clear: Polygon[]): MultiPolygon {
  // polygon-clipping winds outer rings counter-clockwise and holes clockwise,
  // and MapLibre groups rings by winding, so each ring changes role reversed.
  const out: MultiPolygon = [[WORLD[0], ...clear.map((p) => p[0].slice().reverse())]];
  for (const p of clear) for (const hole of p.slice(1)) out.push([hole.slice().reverse()]);
  return out;
}

const diff = (a: MultiPolygon, b: MultiPolygon): MultiPolygon => (a.length && b.length ? polygonClipping.difference(a, b) : a);

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
  private layerExplored: readonly ExploredCircle[] | null = null;
  private layerBands = 0;
  private clear0: Boxed[] = [];
  private rings: Boxed[][] = [];
  /** Which explored circles reachUnions was built for; null = not built. An
   *  empty reach has key '', so '' cannot double as "not built". */
  private reachKey: string | null = null;
  private reachUnions: MultiPolygon[] = [];

  /**
   * One FeatureCollection per band. `explored` is compared by identity; pass
   * the store's array as-is so the union is rebuilt only when it changes.
   */
  compute(
    explored: readonly ExploredCircle[],
    live: { lat: number; lng: number; radius: number },
    bands = FOG_BANDS,
  ): FeatureCollection[] {
    return this.fogs(explored, live, bands).map(multiToFc);
  }

  /**
   * The same soft edge as the stacked bands, as one layer: disjoint pieces,
   * each tagged with how many bands cover it (`n`, 1…bands; draw it at
   * `layerOpacity(n)`). Every pixel gets the opacity the stack gave it, but
   * the GPU fills the screen once instead of `bands` times.
   *
   * Band k is the world minus a clear area whose holes are shrunk by k steps,
   * so the clear areas nest and so do the bands. Outside the live disc the
   * pieces only change when a circle is banked (cached). Inside it, only the
   * explored circles that reach into it matter, so the per-frame work is the
   * cached pieces minus one disc plus a few small unions.
   */
  computeLayers(
    explored: readonly ExploredCircle[],
    live: { lat: number; lng: number; radius: number },
    bands = FOG_BANDS,
  ): FeatureCollection {
    if (explored !== this.layerExplored || this.layerBands !== bands) {
      this.layerExplored = explored;
      this.layerBands = bands;
      this.reachKey = null;
      const clears = Array.from({ length: bands }, (_, k) => unionOf(explored, k * SOFT_STEP_M));
      this.clear0 = withBoxes(clears[0]);
      this.rings = clears.slice(1).map((clear, i) => withBoxes(diff(clears[i], clear)));
    }
    const features: FeatureCollection['features'] = [];
    const push = (m: MultiPolygon, n: number) => {
      if (m.length) features.push({ type: 'Feature', properties: { n }, geometry: { type: 'MultiPolygon', coordinates: m as LngLatPair[][][] } });
    };
    const r0 = live.radius;
    const d0 = r0 > 1 ? discOf(live.lat, live.lng, r0) : null;
    const box = d0 ? boxOf(d0) : null;
    // Under every band: the world minus the clear area. Only the clear
    // components that reach the live disc are fused with it; the far ones are
    // used as they are, so the world polygon is never clipped.
    const near: Polygon[] = [];
    const clear: Polygon[] = [];
    for (const { poly, b } of this.clear0) (box && overlaps(b, box) ? near : clear).push(poly);
    if (d0) clear.push(...(near.length ? polygonClipping.union(d0, ...near) : [d0]));
    push(complement(clear), bands);
    // Each ring outside it, under one band fewer: the cached rings minus the
    // live disc, clipping only the ring pieces that reach it.
    this.rings.forEach((ring, i) => {
      const keep: Polygon[] = [];
      const cut: Polygon[] = [];
      for (const { poly, b } of ring) (box && overlaps(b, box) ? cut : keep).push(poly);
      push(cut.length && d0 ? [...keep, ...polygonClipping.difference(cut, d0)] : [...keep, ...cut], bands - 1 - i);
    });
    if (!d0) return { type: 'FeatureCollection', features };
    // Inside the live disc band 0 is clear; band k ≥ 1 covers what is outside
    // both its shrunk disc and its shrunk explored circles. Only circles that
    // reach into the disc matter.
    const cosLat = Math.cos((live.lat * Math.PI) / 180);
    const reach = explored.filter((c) => {
      const dx = (c.lng - live.lng) * 111_320 * cosLat;
      const dy = (c.lat - live.lat) * 110_540;
      return Math.hypot(dx, dy) < r0 + c.radius;
    });
    const reachKey = reach.map((c) => explored.indexOf(c)).join(',');
    if (reachKey !== this.reachKey) {
      this.reachKey = reachKey;
      this.reachUnions = Array.from({ length: bands }, (_, k) => (k ? unionOf(reach, k * SOFT_STEP_M) : []));
    }
    let prev: MultiPolygon = [d0];
    for (let k = 1; k < bands; k++) {
      const shrink = k * SOFT_STEP_M;
      const local = this.reachUnions[k];
      const inside = local.length ? polygonClipping.intersection(local, [d0]) : [];
      const rk = r0 - shrink;
      const disc = rk > 1 ? discOf(live.lat, live.lng, rk) : null;
      const next: MultiPolygon = disc ? (inside.length ? polygonClipping.union(inside, disc) : [disc]) : inside;
      push(diff(prev, next), bands - k);
      prev = next;
    }
    return { type: 'FeatureCollection', features };
  }

  private fogs(
    explored: readonly ExploredCircle[],
    live: { lat: number; lng: number; radius: number },
    bands: number,
  ): MultiPolygon[] {
    if (explored !== this.explored) {
      this.explored = explored;
      this.bases = [];
    }
    const out: MultiPolygon[] = [];
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
      out.push(fog);
    }
    return out;
  }
}

/** Opacity of a piece under `n` of `bands` stacked bands that compound to `total`. */
export const layerOpacity = (n: number, total = FOG_TOTAL, bands = FOG_BANDS) => 1 - (1 - bandOpacity(total, bands)) ** n;

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
