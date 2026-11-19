import polygonClipping, { type MultiPolygon, type Pair, type Polygon, type Ring } from 'polygon-clipping';
import { pointInRing } from './geo';

/**
 * Procedural ruin of one building footprint, as flat pieces to extrude.
 * Drawn for Gutted sites in the 3D run map (buildings.ts).
 *
 * Align bays to the building. One wing lies in fragments, a torn cross-section
 * exposes floors and party walls, and the surviving end keeps its skyline.
 */

export type RuinKind = 'shell' | 'slab' | 'pillar' | 'rubble' | 'window' | 'vine' | 'leaves' | 'glass' | 'steel';

export const RUIN_COLORS: Record<RuinKind, string> = {
  shell: '#635f56', slab: '#a49986', pillar: '#5e5850', rubble: '#6c6052',
  window: '#252f30', vine: '#425436', leaves: '#708253',
  glass: '#526970', steel: '#805a48',
};

export function isRuinDetail(kind: RuinKind) {
  return kind === 'window' || kind === 'glass' || kind === 'vine' || kind === 'leaves';
}

export interface RuinPiece {
  /** [lng, lat] rings. */
  poly: Polygon;
  base: number;
  top: number;
  kind: RuinKind;
}

const FLOOR_M = 3.2;
const HIGH_RISE_M = 60;
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

/** A fallen wedge of concrete, in local metres. */
function fragment(cx: number, cy: number, half: number, rot: number): Polygon {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const corners: Pair[] = [
    [-1, -1],
    [1.5, -0.4],
    [0.8, 0.6],
    [-0.7, 0.35],
    [-1, -1],
  ];
  return [corners.map(([u, v]) => [cx + (u * c - v * s) * half, cy + (u * s + v * c) * half] as Pair)];
}

/** Dress only long outer walls and actual ledges. All distances here are in local metres. */
function dressRuin(structure: RuinPiece[], footprint: MultiPolygon, h: number, seed: number): RuinPiece[] {
  const rnd = mulberry32(seed ^ 0x79af142);
  const detail: RuinPiece[] = [];
  const faces: { a: Pair; b: Pair; base: number; top: number; length: number }[] = [];
  const ledges: RuinPiece[] = [];
  for (const piece of structure) {
    if (piece.kind === 'slab' || piece.kind === 'shell') ledges.push(piece);
    if (piece.kind !== 'shell' || piece.top < 2 * FLOOR_M) continue;
    const ring = piece.poly[0];
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 4) continue;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      // Clipped shell rings run counterclockwise. A probe just outside the
      // edge excludes internal grid seams, even along a skewed footprint.
      const px = mx + (b[1] - a[1]) / length * 0.08;
      const py = my - (b[0] - a[0]) / length * 0.08;
      if (footprint.some(poly => pointInRing(px, py, poly[0]) && !poly.slice(1).some(hole => pointInRing(px, py, hole)))) continue;
      faces.push({ a, b, base: piece.base, top: piece.top, length });
    }
  }
  // A fixed budget per building even when the source is a very tall tower.
  const rows = Math.max(1, Math.min(7, Math.floor(100 / Math.max(1, faces.length * 2))));
  const glassRows = Math.max(2, Math.min(16, Math.floor(175 / Math.max(1, faces.length))));
  for (const { a, b, base, top, length } of faces) {
    const dx = (b[0] - a[0]) / length, dy = (b[1] - a[1]) / length;
    const at = (t: number, offset: number): Pair => [a[0] + dx * t + dy * offset, a[1] + dy * t - dx * offset];
    const storeys = Math.floor((top - base) / FLOOR_M);
    const step = Math.max(1, Math.ceil(storeys / rows));
    if (h >= HIGH_RISE_M && storeys > 0) {
      // Narrow banks of curtain wall with an irregular missing panel at each
      // end. Vertical mullions are the exposed concrete between adjacent bays.
      const groups = Math.min(storeys, glassRows);
      const missing = Math.floor(rnd() * (groups + 1));
      for (let group = 0; group < groups && detail.length < 175; group++) {
        if (missing === group) continue;
        const start = Math.floor(storeys * group / groups);
        const end = Math.floor(storeys * (group + 1) / groups);
        const left = length * (group === missing + 1 ? 0.38 : 0.035);
        const right = length * (group === missing - 1 ? 0.72 : 0.965);
        detail.push({ kind: 'glass', base: base + start * FLOOR_M + 0.28, top: base + end * FLOOR_M - 0.2,
          poly: [[at(left, -0.12), at(right, -0.12), at(right, 0.28), at(left, 0.28), at(left, -0.12)]] });
      }
      continue;
    }
    for (let floor = storeys - 1; floor >= 0 && detail.length < 100; floor -= step) {
      for (let col = 0; col < 2 && detail.length < 100; col++) {
        if (rnd() < 0.14) continue;
        const left = length * (col * 0.5 + 0.045), right = left + length * 0.40;
        detail.push({ kind: 'window', base: base + floor * FLOOR_M + 0.7, top: base + floor * FLOOR_M + 2.65,
          poly: [[at(left, -0.12), at(right, -0.12), at(right, 0.23), at(left, 0.23), at(left, -0.12)]] });
      }
    }
  }

  // Each patch straddles one slab edge. Leaf crowns share their roots with
  // uneven hanging runners, giving the growth a silhouette from either view.
  const patches = Math.min(ledges.length, 5 + Math.floor(rnd() * 4));
  for (let n = 0; n < patches; n++) {
    const index = Math.floor(rnd() * ledges.length);
    const ledge = ledges.splice(index, 1)[0];
    const ring = ledge.poly[0];
    const edges = ring.slice(1).map((b, i) => ({ a: ring[i], b, length: Math.hypot(b[0] - ring[i][0], b[1] - ring[i][1]) }))
      .filter(e => e.length >= 2);
    // Alternate exposed deck edges with street-facing parapets so some vines
    // can run down an uninterrupted wall for several storeys.
    const facade = n % 2 === 0 && faces.length ? faces[Math.floor(rnd() * faces.length)] : undefined;
    const root = facade?.top ?? ledge.top;
    if ((!facade && !edges.length) || h - root < 0.2) continue;
    const { a, b, length } = facade ?? edges[Math.floor(rnd() * edges.length)];
    const dx = (b[0] - a[0]) / length, dy = (b[1] - a[1]) / length;
    const spread = Math.min(5, length * 0.39);
    const mid = 0.4 + rnd() * 0.2;
    for (let i = 0; i < 4; i++) {
      const t = mid * length + (i - 1.5) * spread / 2;
      const x = a[0] + dx * t, y = a[1] + dy * t;
      const width = spread * (0.35 + rnd() * 0.25);
      const crown = Math.min(h, root + 0.4 + rnd() * 1.8);
      const outline: Ring = [];
      for (let k = 0; k < 8; k++) {
        const angle = k * Math.PI / 4, radius = width * (0.7 + rnd() * 0.3);
        outline.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
      }
      outline.push(outline[0]);
      detail.push({ poly: [outline], base: root, top: crown, kind: 'leaves' });
      const tail = fragment(x + dy * width * 0.65, y - dx * width * 0.65, width * 0.57, Math.atan2(dy, dx));
      detail.push({ poly: tail, base: Math.max(0, root - 1 - rnd() * (facade ? 14 : 6)), top: root + 0.1, kind: 'vine' });
    }
  }
  return detail;
}

export function breakBuilding(footprint: MultiPolygon, h: number, seed: number, tier: 2 | 3 = 3): RuinPiece[] {
  if (!footprint.length || !footprint[0][0]?.length) return [];
  const rnd = mulberry32(seed);
  // Local metres around the first vertex (flat earth is fine at block scale).
  const [lng0, lat0] = footprint[0][0][0];
  const kx = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const toM = (p: Pair): Pair => [(p[0] - lng0) * kx, (p[1] - lat0) * M_PER_DEG];
  const toLL = (p: Pair): Pair => [lng0 + p[0] / kx, lat0 + p[1] / M_PER_DEG];
  const metres = footprint.map(poly => poly.map(ring => ring.map(toM)));
  // Use the longest facade as the local grid axis, including on diagonal streets.
  let longest = 0;
  let angle = 0;
  for (const [outline] of metres) {
    for (let i = 1; i < outline.length; i++) {
      const dx = outline[i][0] - outline[i - 1][0];
      const dy = outline[i][1] - outline[i - 1][1];
      const length = dx * dx + dy * dy;
      if (length > longest) { longest = length; angle = Math.atan2(dy, dx); }
    }
  }
  if (rnd() < 0.5) angle += Math.PI;
  const c = Math.cos(angle), s = Math.sin(angle);
  // The facade-aligned edge should be horizontal. Sub-millimetre rotation
  // noise beside a grid line can leave polygon-clipping with an open ring.
  const mm = (m: number) => Math.round(m * 1000) / 1000;
  const fp: MultiPolygon = metres.map(poly => poly.map(ring => ring.map(([x, y]): Pair =>
    [mm(x * c + y * s), mm(-x * s + y * c)])));
  const world = ([x, y]: Pair) => toLL([x * c - y * s, x * s + y * c]);

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

  const breach = 0.20 + rnd() * 0.18;
  const diagonal = (rnd() - 0.5) * 0.36;
  const tower = h >= HIGH_RISE_M;
  const breachLevel = 0.38 + mulberry32(seed ^ 0x62418)() * 0.18;

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
      const w = Math.min(cell, x1 - x), d = Math.min(cell, y1 - y);
      const across = (x + w / 2 - x0) / (x1 - x0)
        + diagonal * ((y + d / 2 - y0) / (y1 - y0) - 0.5);
      if (tier === 3 && !tower && across < breach) {
        // Pancaked concrete breaks into overlapping shards with bare ground between them.
        for (let i = 0; i < 3; i++) {
          const shard = fragment(x + w * rnd(), y + d * rnd(), Math.min(w, d) * (0.22 + rnd() * 0.32), rnd() * Math.PI);
          push(polygonClipping.intersection(part, shard), 0, Math.min(h, 0.4 + rnd() * 1.7), 'rubble');
        }
        continue;
      }
      const fraction = Math.min(1, tier === 2 ? 0.67 + across * 0.31 + rnd() * 0.04 :
        tower ? 0.59 + across * 0.44 + rnd() * 0.05 : 0.38 + across * 0.55 + rnd() * 0.14);
      const floors = Math.max(1, Math.floor(h * fraction / FLOOR_M));
      const midBreach = tier === 3 && tower && across < breach + 0.23;
      const exposed = tier === 2 ? (across < breach ? Math.min(2, floors) : 0) :
        midBreach ? 4 : across < breach + 0.44 ? Math.min(4, floors) : 0;
      const lowerFloors = midBreach ? Math.min(floors - exposed - 1,
        Math.max(1, Math.floor(h / FLOOR_M * (breachLevel + across * 0.12)))) : floors - exposed;
      const shell = Math.min(h, lowerFloors * FLOOR_M);
      if (shell > 0) push(part, 0, shell, 'shell');
      if (exposed === 0) continue;

      // All broken decks meet the surviving wall on the high side. Their
      // free edges step back independently, leaving the rooms open to the sky.
      const back = x + w;
      const wallX = back - Math.min(w * 0.2, 1.1);
      const wall = polygonClipping.intersection(part, [[
        [wallX, y], [back, y], [back, y + d], [wallX, y + d], [wallX, y],
      ]]);
      const roof = Math.min(h, (lowerFloors + exposed) * FLOOR_M);
      if (!wall.length) {
        // A narrow footprint tip can end before the wall. Leave it collapsed.
        if (shell === 0) push(part, 0, Math.min(h, 1), 'rubble');
        continue;
      }
      push(wall, shell, Math.min(h, roof + 1.2), 'pillar');
      if (midBreach) {
        push(part, roof, floors * FLOOR_M, 'shell');
        const px = x + w * 0.23, py = y + d * 0.22;
        push(polygonClipping.intersection(part, fragment(px, py, 0.48, 0)), shell, roof, 'steel');
      } else if (tower) {
        // An exposed column projects above the last surviving deck.
        const post = polygonClipping.intersection(wall, fragment(wallX + 0.45, y + d * 0.5, 0.54, 0));
        const tip = Math.min(h, roof + FLOOR_M * (1 + rnd()));
        if (tip > roof) push(post, roof, tip, 'steel');
      }
      for (let floor = 1; floor <= exposed; floor++) {
        const top = Math.min(h, shell + floor * FLOOR_M);
        const lip = x + w * (0.07 + rnd() * 0.24);
        const deck = polygonClipping.intersection(part, [[
          [lip, y], [back, y], [back, y + d], [lip + w * 0.12, y + d],
          [lip + w * (0.14 + rnd() * 0.24), y + d * 0.45], [lip, y],
        ]]);
        push(deck, Math.max(shell, top - SLAB_M), top, 'slab');
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
      poly: fragment(ax + (bx - ax) * t + Math.cos(ang) * dist, ay + (by - ay) * t + Math.sin(ang) * dist, 0.7 + rnd() * 2.3, ang),
      base: 0,
      top: 0.4 + rnd() * 1.8,
      kind: 'rubble',
    });
  }

  const detail = dressRuin(out, fp, h, seed);
  return [...out, ...detail].map((p) => ({ ...p, poly: p.poly.map((r) => r.map(world)) }));
}
