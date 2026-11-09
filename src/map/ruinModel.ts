import polygonClipping, { type MultiPolygon, type Pair, type Polygon, type Ring } from 'polygon-clipping';

/**
 * Procedural ruin of one building footprint, as flat pieces to extrude.
 * Drawn for Gutted sites in the 3D run map (buildings.ts).
 *
 * The footprint is cut into a grid (each cell clipped to the real outline).
 * Cell heights follow a tilted break plane, so one side of the block stands
 * taller than the other, snapped to whole floors. Some cells are blown out to
 * a rubble mound; some broken columns keep floor slabs hanging over a gap on
 * a single pillar; loose rubble is scattered round the edge.
 */

export type RuinKind = 'shell' | 'slab' | 'pillar' | 'rubble';

export interface RuinPiece {
  /** [lng, lat] rings. */
  poly: Polygon;
  base: number;
  top: number;
  kind: RuinKind;
}

const FLOOR_M = 3.2;
const SLAB_M = 0.45;
const MAX_CELLS = 40;
const M_PER_DEG = 111_320;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a) / 2;
}

/** A square of half-size `half` centred on (cx, cy), rotated by `rot`. */
function square(cx: number, cy: number, half: number, rot = 0): Polygon {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const corners: Pair[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ];
  return [corners.map(([u, v]) => [cx + (u * c - v * s) * half, cy + (u * s + v * c) * half] as Pair)];
}

export function breakBuilding(footprint: MultiPolygon, h: number, seed: number): RuinPiece[] {
  if (!footprint.length || !footprint[0][0]?.length) return [];
  const rnd = mulberry32(seed);
  // Local metres around the first vertex (flat earth is fine at block scale).
  const [lng0, lat0] = footprint[0][0][0];
  const kx = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const toM = (p: Pair): Pair => [(p[0] - lng0) * kx, (p[1] - lat0) * M_PER_DEG];
  const toLL = (p: Pair): Pair => [lng0 + p[0] / kx, lat0 + p[1] / M_PER_DEG];
  const fp: MultiPolygon = footprint.map((poly) => poly.map((ring) => ring.map(toM)));

  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let area = 0;
  let perimeter = 0;
  for (const poly of fp) {
    poly.forEach((ring, i) => (area += i === 0 ? ringArea(ring) : -ringArea(ring)));
    const outer = poly[0];
    for (let i = 0; i < outer.length; i++) {
      const [x, y] = outer[i];
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      if (i) perimeter += Math.hypot(x - outer[i - 1][0], y - outer[i - 1][1]);
    }
  }
  if (area < 20) return [];

  let cell = Math.min(20, Math.max(5, Math.sqrt(area / 14)));
  while (Math.ceil((x1 - x0) / cell) * Math.ceil((y1 - y0) / cell) > MAX_CELLS) cell *= 1.2;

  // The break plane: tallest on one side, sheared off toward the other.
  const th = rnd() * Math.PI * 2;
  const ux = Math.cos(th);
  const uy = Math.sin(th);
  const projs = [x0 * ux + y0 * uy, x1 * ux + y0 * uy, x0 * ux + y1 * uy, x1 * ux + y1 * uy];
  const pmin = Math.min(...projs);
  const span = Math.max(...projs) - pmin || 1;
  // Steep and clear: one side near full height, the other sheared to stumps.
  const lo = 0.02 + 0.12 * rnd();
  const hi = 0.75 + 0.25 * rnd();

  const out: RuinPiece[] = [];
  const push = (mp: MultiPolygon, base: number, top: number, kind: RuinKind) => {
    for (const poly of mp) out.push({ poly, base, top, kind });
  };

  for (let x = x0; x < x1; x += cell) {
    for (let y = y0; y < y1; y += cell) {
      const sq: Polygon = [
        [
          [x, y],
          [x + cell, y],
          [x + cell, y + cell],
          [x, y + cell],
          [x, y],
        ],
      ];
      const part = polygonClipping.intersection(fp, sq);
      if (!part.length) continue;
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      const s = (cx * ux + cy * uy - pmin) / span;
      let top: number;
      if (rnd() < 0.1) {
        top = 0.6 + rnd() * 1.6; // blown out to a mound
      } else {
        // Mostly the plane (so the shear reads), a little per-cell jag.
        const raw = h * (lo + (hi - lo) * s ** 1.4) * (0.88 + 0.24 * rnd());
        top = Math.min(h, Math.max(FLOOR_M, Math.round(raw / FLOOR_M) * FLOOR_M));
      }
      push(part, 0, top, top < FLOOR_M ? 'rubble' : 'shell');

      // Exposed floors: slabs hanging above the break, held up by one pillar.
      if (top >= FLOOR_M && top < h - FLOOR_M && rnd() < 0.45) {
        let last = top;
        const n = 1 + Math.floor(rnd() * 3);
        for (let k = 1; k <= n; k++) {
          const b = top + k * FLOOR_M - SLAB_M;
          if (b + SLAB_M > h) break;
          if (rnd() < 0.3) continue; // a floor that fell through
          push(part, b, b + SLAB_M, 'slab');
          last = b + SLAB_M;
        }
        if (last > top) push(polygonClipping.intersection(fp, square(cx, cy, 0.45)), top, last, 'pillar');
      }
    }
  }

  // Debris spilled round the edge.
  const count = Math.min(16, Math.max(4, Math.round(perimeter / 9)));
  for (let i = 0; i < count; i++) {
    const ring = fp[Math.floor(rnd() * fp.length)][0];
    const j = Math.floor(rnd() * (ring.length - 1));
    const [ax, ay] = ring[j];
    const [bx, by] = ring[j + 1];
    const t = rnd();
    const ang = rnd() * Math.PI * 2;
    const dist = 0.5 + rnd() * 5;
    out.push({
      poly: square(ax + (bx - ax) * t + Math.cos(ang) * dist, ay + (by - ay) * t + Math.sin(ang) * dist, 0.6 + rnd() * 1.6, rnd() * Math.PI),
      base: 0,
      top: 0.4 + rnd() * 1.8,
      kind: 'rubble',
    });
  }

  return out.map((p) => ({ ...p, poly: p.poly.map((r) => r.map(toLL)) }));
}
