import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { LngLatPair } from './geo';

/**
 * The sealed Singapore–Johor border, built from `public/border.json`
 * (`npm run bake:border`): the Causeway blown through its open-water span,
 * the Second Link standing but barricaded, the RTS Link viaduct sealed, and
 * Johor Bahru across the strait as a quarantine zone.
 *
 * Everything here is pure and deterministic: the same bake always yields the
 * same debris, the same stalled cars and the same barriers. Solids carry
 * `base` / `top` in metres for one fill-extrusion layer, the way the
 * landmarks float SkyPark: no imported 3D models.
 */

export interface BorderData {
  causeway: {
    /** SG shore → JB shore over open water. */
    span: LngLatPair[];
    /** The Johor-side embankment, shore → CIQ. */
    embankment: LngLatPair[];
    /** The water mains laid along the Causeway. */
    pipes: LngLatPair[][];
    /** Northbound lanes on the Singapore approach. */
    queue: LngLatPair[];
  };
  secondLink: {
    /** The bridge's own outline, Malaysian end first. */
    outline: LngLatPair[];
    queue: LngLatPair[];
  };
  rts: LngLatPair[];
  checkpoints: Record<'woodlands' | 'johorBahru' | 'tuas', { lat: number; lng: number }>;
  johorShore: LngLatPair[];
}

export type SolidKind = 'deck' | 'pier' | 'debris' | 'barrier' | 'car' | 'pipe' | 'rail';

export interface BorderScene {
  /** Ground footprints of everything, for the 2D map. */
  flat: FeatureCollection;
  /** Extrusions (properties base, top, color) for the 3D map. */
  solids: FeatureCollection;
  /** Pipes, viaduct and razor wire as lines. */
  lines: FeatureCollection;
  /** Opaque water over the blown span, hiding the basemap's road under it. */
  breach: FeatureCollection;
  /** Johor Bahru's land, closed off to the north. */
  johor: FeatureCollection;
  /** Where the breach smokes. */
  smoke: { lat: number; lng: number };
  /** Searchlights on the Johor side: position and the bearing they sweep around. */
  lights: { lat: number; lng: number; bearing: number }[];
  labels: { id: 'causeway' | 'secondLink' | 'rts' | 'johor'; lat: number; lng: number }[];
}

/** What part of the Causeway's open-water span is gone, as a fraction from the SG shore. */
export const BREACH = { from: 0.3, to: 0.72 } as const;
/** Causeway deck: road plus the old KTM track beside it. */
const CAUSEWAY_HALF_M = 17;
const CAUSEWAY_DECK = { base: 2.4, top: 4 };
const SECOND_LINK_HALF_M = 14;
/** The Second Link climbs to its navigation span mid-strait. */
const SECOND_LINK_CLEARANCE_M = 25;
const SECOND_LINK_DECK_M = 2.4;
const RTS_HALF_M = 4.5;
const RTS_DECK = { base: 14, top: 15.6 };

export const COLORS = {
  deck: '#3b3d3a',
  deckBroken: '#2e2a27',
  pier: '#2a2c2a',
  debris: '#34302b',
  barrier: '#8c8a80',
  pipe: '#5d6b70',
  rts: '#44474a',
  cars: ['#4a4c4f', '#5b4b40', '#3d4a52', '#5a5a52', '#4f3f3f', '#6a6658'],
} as const;

// --- Local metric frame -------------------------------------------------------

const M_LAT = 111_320;
const M_LNG = M_LAT * Math.cos((1.4 * Math.PI) / 180);
type XY = [number, number];
const toXY = ([lng, lat]: LngLatPair): XY => [lng * M_LNG, lat * M_LAT];
const toLL = ([x, y]: XY): LngLatPair => [x / M_LNG, y / M_LAT];

/** A small seeded generator so the wreckage never moves between page loads. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lengthM(line: readonly LngLatPair[]): number {
  let d = 0;
  for (let i = 1; i < line.length; i++) {
    const a = toXY(line[i - 1]);
    const b = toXY(line[i]);
    d += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return d;
}

/** The point `m` metres along a line, with the unit direction there. */
export function along(line: readonly LngLatPair[], m: number): { at: XY; dir: XY } {
  let left = Math.max(0, m);
  for (let i = 1; i < line.length; i++) {
    const a = toXY(line[i - 1]);
    const b = toXY(line[i]);
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg === 0) continue;
    const dir: XY = [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
    if (left <= seg || i === line.length - 1) {
      const t = Math.min(left, seg);
      return { at: [a[0] + dir[0] * t, a[1] + dir[1] * t], dir };
    }
    left -= seg;
  }
  const p = toXY(line[0]);
  return { at: p, dir: [0, 1] };
}

/** The stretch of a line from `fromM` to `toM` metres along it. */
export function slice(line: readonly LngLatPair[], fromM: number, toM: number): LngLatPair[] {
  const out: LngLatPair[] = [toLL(along(line, fromM).at)];
  let d = 0;
  for (let i = 1; i < line.length; i++) {
    const a = toXY(line[i - 1]);
    const b = toXY(line[i]);
    d += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > fromM && d < toM) out.push(line[i]);
  }
  out.push(toLL(along(line, toM).at));
  return out;
}

/** A rectangle `len` × `wid` metres centred on `c`, its length along `dir`. */
function box(c: XY, dir: XY, len: number, wid: number): LngLatPair[] {
  const n: XY = [-dir[1], dir[0]];
  const hl = len / 2;
  const hw = wid / 2;
  const corners: XY[] = [
    [c[0] - dir[0] * hl - n[0] * hw, c[1] - dir[1] * hl - n[1] * hw],
    [c[0] + dir[0] * hl - n[0] * hw, c[1] + dir[1] * hl - n[1] * hw],
    [c[0] + dir[0] * hl + n[0] * hw, c[1] + dir[1] * hl + n[1] * hw],
    [c[0] - dir[0] * hl + n[0] * hw, c[1] - dir[1] * hl + n[1] * hw],
  ];
  const ring = corners.map(toLL);
  ring.push(ring[0]);
  return ring;
}

const rotate = ([x, y]: XY, rad: number): XY => [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];

/**
 * A deck slab between `fromM` and `toM` along a centre line, `half` metres
 * either side. A `ragged` end is torn: its edge zigzags instead of running
 * straight across, which is what reads as "blown" from above.
 */
export function deckSlab(
  line: readonly LngLatPair[],
  fromM: number,
  toM: number,
  half: number,
  ragged: { start?: boolean; end?: boolean } = {},
  rnd: () => number = seeded(1),
): LngLatPair[] {
  const steps = Math.max(1, Math.ceil((toM - fromM) / 20));
  const left: XY[] = [];
  const right: XY[] = [];
  for (let i = 0; i <= steps; i++) {
    const { at, dir } = along(line, fromM + ((toM - fromM) * i) / steps);
    const n: XY = [-dir[1], dir[0]];
    left.push([at[0] + n[0] * half, at[1] + n[1] * half]);
    right.push([at[0] - n[0] * half, at[1] - n[1] * half]);
  }
  const tear = (m: number, sign: 1 | -1): XY[] => {
    // Teeth across the width, biting up to 9 m back into the slab.
    const { at, dir } = along(line, m);
    const n: XY = [-dir[1], dir[0]];
    const teeth: XY[] = [];
    const k = 6;
    for (let i = 1; i < k; i++) {
      const w = half - (2 * half * i) / k;
      const bite = (2 + 7 * rnd()) * sign;
      teeth.push([at[0] + n[0] * w - dir[0] * bite, at[1] + n[1] * w - dir[1] * bite]);
    }
    return teeth;
  };
  const ring: XY[] = [...left];
  if (ragged.end) ring.push(...tear(toM, 1));
  ring.push(...right.reverse());
  if (ragged.start) ring.push(...tear(fromM, -1).reverse());
  const out = ring.map(toLL);
  out.push(out[0]);
  return out;
}

interface Solid {
  ring: LngLatPair[];
  base: number;
  top: number;
  color: string;
  kind: SolidKind;
}

const solidFeature = (s: Solid): Feature<Polygon> => ({
  type: 'Feature',
  properties: { base: s.base, top: s.top, color: s.color, kind: s.kind },
  geometry: { type: 'Polygon', coordinates: [s.ring] },
});

/** Piers in pairs under a deck, every `every` metres between `fromM` and `toM`. */
function piers(line: readonly LngLatPair[], fromM: number, toM: number, every: number, offset: number, height: (m: number) => number, out: Solid[]) {
  for (let m = fromM + every / 2; m < toM; m += every) {
    const { at, dir } = along(line, m);
    const n: XY = [-dir[1], dir[0]];
    for (const s of offset ? [-1, 1] : [0]) {
      const c: XY = [at[0] + n[0] * offset * s, at[1] + n[1] * offset * s];
      out.push({ ring: box(c, dir, 2.6, 2.6), base: 0, top: height(m), color: COLORS.pier, kind: 'pier' });
    }
  }
}

/** Jersey barriers shoulder to shoulder across a road at `m` metres along it. */
function barrierRow(line: readonly LngLatPair[], m: number, half: number, base: number, out: Solid[]) {
  const { at, dir } = along(line, m);
  const n: XY = [-dir[1], dir[0]];
  for (let w = -half + 1.6; w <= half - 1.6; w += 3.3) {
    const c: XY = [at[0] + n[0] * w, at[1] + n[1] * w];
    out.push({ ring: box(c, n, 3, 0.9), base, top: base + 1.1, color: COLORS.barrier, kind: 'barrier' });
  }
}

/**
 * Cars stalled nose to tail where the queue froze on outbreak day. `lanes`
 * are offsets from the centre line; roughly one slot in four stands empty.
 */
function stalledCars(line: readonly LngLatPair[], lanes: number[], base: number, rnd: () => number, out: Solid[], fromM = 0, toM = lengthM(line)) {
  for (const lane of lanes) {
    let m = fromM + 3 + rnd() * 6;
    while (m < toM - 3) {
      const bus = rnd() < 0.08;
      const len = bus ? 11.5 : 4.4;
      if (rnd() > 0.25) {
        const { at, dir } = along(line, m);
        const n: XY = [-dir[1], dir[0]];
        const jog = (rnd() - 0.5) * 0.9;
        const c: XY = [at[0] + n[0] * (lane + jog), at[1] + n[1] * (lane + jog)];
        const skew = rotate(dir, (rnd() - 0.5) * 0.35);
        out.push({
          ring: box(c, skew, len, bus ? 2.5 : 1.8),
          base,
          top: base + (bus ? 3.1 : 1.5),
          color: COLORS.cars[Math.floor(rnd() * COLORS.cars.length)],
          kind: 'car',
        });
      }
      m += len + 1.6 + rnd() * 2.5;
    }
  }
}

/** Broken slabs of deck strewn across the breach, mostly under water. */
function debris(line: readonly LngLatPair[], fromM: number, toM: number, rnd: () => number, out: Solid[]) {
  const n = 9;
  for (let i = 0; i < n; i++) {
    const m = fromM + (toM - fromM) * ((i + 0.3 + rnd() * 0.4) / n);
    const { at, dir } = along(line, m);
    const side: XY = [-dir[1], dir[0]];
    const w = (rnd() - 0.5) * 2 * CAUSEWAY_HALF_M;
    const c: XY = [at[0] + side[0] * w, at[1] + side[1] * w];
    const heading = rotate(dir, (rnd() - 0.5) * 1.6);
    out.push({
      ring: box(c, heading, 6 + rnd() * 10, 4 + rnd() * 6),
      base: 0,
      top: 0.3 + rnd() * 1.6,
      color: COLORS.debris,
      kind: 'debris',
    });
  }
}

/** The Second Link's centre line, from its outline: midpoints of its two short ends. */
export function outlineAxis(outline: readonly LngLatPair[]): LngLatPair[] {
  // The outline's two long edges run end to end; its short ends are the
  // tightest clusters of vertices. Pair each vertex with the one farthest from
  // it, and take the two clusters around that diameter.
  let best = 0;
  let pair: [number, number] = [0, 0];
  const pts = outline.slice(0, -1).map(toXY);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d > best) {
        best = d;
        pair = [i, j];
      }
    }
  }
  const end = (k: number): XY => {
    const near = pts.filter((p) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]) < best * 0.05);
    return [near.reduce((s, p) => s + p[0], 0) / near.length, near.reduce((s, p) => s + p[1], 0) / near.length];
  };
  return [toLL(end(pair[0])), toLL(end(pair[1]))];
}

/** Second Link deck height at a fraction `t` along it: shore, up to the navigation span, down. */
export function secondLinkBase(t: number): number {
  return 4 + (SECOND_LINK_CLEARANCE_M - 4) * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
}

const lineFeature = (coords: readonly LngLatPair[], kind: string): Feature => ({
  type: 'Feature',
  properties: { kind },
  geometry: { type: 'LineString', coordinates: coords.map((c) => [...c]) },
});

const fcOf = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });

const midpoint = (line: readonly LngLatPair[]) => {
  const [lng, lat] = toLL(along(line, lengthM(line) / 2).at);
  return { lat, lng };
};

/**
 * Orient a line so it starts on the Singapore side (the southern end).
 * The bake keeps OSM's drawing direction, which differs per way.
 */
function southFirst(line: readonly LngLatPair[]): LngLatPair[] {
  return line[0][1] <= line[line.length - 1][1] ? [...line] : [...line].reverse();
}

export function buildBorder(data: BorderData): BorderScene {
  const solids: Solid[] = [];
  const lines: Feature[] = [];
  const rnd = seeded(0x5eed);

  // Causeway: the open-water span is blown out in the middle.
  const span = southFirst(data.causeway.span);
  const spanM = lengthM(span);
  const cutA = spanM * BREACH.from;
  const cutB = spanM * BREACH.to;
  const deck = { base: CAUSEWAY_DECK.base, top: CAUSEWAY_DECK.top, kind: 'deck' as const };
  solids.push({ ...deck, ring: deckSlab(span, 0, cutA, CAUSEWAY_HALF_M, { end: true }, rnd), color: COLORS.deck });
  solids.push({ ...deck, ring: deckSlab(span, cutB, spanM, CAUSEWAY_HALF_M, { start: true }, rnd), color: COLORS.deck });
  // The torn lips sag where the charge went off.
  solids.push({ ...deck, base: 1.2, top: 2.6, ring: deckSlab(span, cutA - 1, cutA + 7, CAUSEWAY_HALF_M * 0.8, { end: true }, rnd), color: COLORS.deckBroken });
  solids.push({ ...deck, base: 0.6, top: 2, ring: deckSlab(span, cutB - 6, cutB + 1, CAUSEWAY_HALF_M * 0.7, { start: true }, rnd), color: COLORS.deckBroken });
  piers(span, 0, cutA - 4, 24, 10, () => CAUSEWAY_DECK.base, solids);
  piers(span, cutB + 4, spanM, 24, 10, () => CAUSEWAY_DECK.base, solids);
  debris(span, cutA, cutB, rnd, solids);
  // Barriers on both lips: Singapore sealed its end, Johor its own.
  barrierRow(span, Math.max(4, cutA - 14), CAUSEWAY_HALF_M, CAUSEWAY_DECK.top, solids);
  barrierRow(span, Math.min(spanM - 4, cutB + 16), CAUSEWAY_HALF_M, CAUSEWAY_DECK.top, solids);
  const embankment = southFirst(data.causeway.embankment);
  barrierRow(embankment, 30, CAUSEWAY_HALF_M, 0, solids);
  // The queue that never reached the bridge.
  stalledCars(southFirst(data.causeway.queue), [-4.5, -1.5, 1.5, 4.5], 0, rnd, solids);
  stalledCars(span, [-6, -2, 2], CAUSEWAY_DECK.top, rnd, solids, 6, cutA - 18);
  // The water mains survived: they still cross the breach.
  for (const pipe of data.causeway.pipes) {
    lines.push(lineFeature(pipe, 'pipe'));
    for (let m = 0, len = lengthM(pipe); m < len - 1; m += 12) {
      const seg = slice(pipe, m, Math.min(len, m + 12));
      const { dir } = along(pipe, m + 6);
      const c = along(pipe, m + 6).at;
      solids.push({ ring: box(c, dir, Math.max(1, lengthM(seg)), 0.9), base: CAUSEWAY_DECK.top - 0.4, top: CAUSEWAY_DECK.top + 0.5, color: COLORS.pipe, kind: 'pipe' });
    }
  }

  // Second Link: standing, sealed with barriers at both ends, a few cars abandoned on the deck.
  const axis = southFirst(outlineAxis(data.secondLink.outline));
  const linkM = lengthM(axis);
  const SLABS = 48;
  for (let i = 0; i < SLABS; i++) {
    const a = (linkM * i) / SLABS;
    const b = (linkM * (i + 1)) / SLABS;
    const base = secondLinkBase((a + b) / 2 / linkM);
    solids.push({ ring: deckSlab(axis, a, b + 0.5, SECOND_LINK_HALF_M), base, top: base + SECOND_LINK_DECK_M, color: COLORS.deck, kind: 'deck' });
  }
  piers(axis, 0, linkM, 60, 7, (m) => secondLinkBase(m / linkM), solids);
  for (const t of [0.04, 0.96]) {
    barrierRow(axis, linkM * t, SECOND_LINK_HALF_M, secondLinkBase(t) + SECOND_LINK_DECK_M, solids);
  }
  for (let k = 0; k < 7; k++) {
    const m = linkM * (0.12 + 0.76 * rnd());
    const { at, dir } = along(axis, m);
    const n: XY = [-dir[1], dir[0]];
    const w = (rnd() - 0.5) * 2 * (SECOND_LINK_HALF_M - 3);
    const top = secondLinkBase(m / linkM) + SECOND_LINK_DECK_M;
    solids.push({
      ring: box([at[0] + n[0] * w, at[1] + n[1] * w], rotate(dir, (rnd() - 0.5) * 0.9), 4.4, 1.8),
      base: top,
      top: top + 1.5,
      color: COLORS.cars[Math.floor(rnd() * COLORS.cars.length)],
      kind: 'car',
    });
  }
  stalledCars(southFirst(data.secondLink.queue), [-3, 0, 3], 0, rnd, solids);

  // RTS Link viaduct: finished, never opened, sealed at the Singapore end.
  const rts = southFirst(data.rts);
  const rtsM = lengthM(rts);
  for (let m = 0; m < rtsM; m += 30) {
    solids.push({ ring: deckSlab(rts, m, Math.min(rtsM, m + 30.5), RTS_HALF_M), base: RTS_DECK.base, top: RTS_DECK.top, color: COLORS.rts, kind: 'rail' });
  }
  piers(rts, 0, rtsM, 40, 0, () => RTS_DECK.base, solids);
  barrierRow(rts, 60, RTS_HALF_M, RTS_DECK.top, solids);
  lines.push(lineFeature(rts, 'rts'));

  // Razor wire along the Johor waterfront between the two crossings' ends.
  const shore = data.johorShore.slice(0, -3);
  lines.push(lineFeature(shore, 'cordon'));

  const flat = fcOf(
    solids
      .filter((s) => s.kind !== 'pier' && s.kind !== 'pipe')
      .map((s) => ({ ...solidFeature(s), properties: { kind: s.kind, color: s.color } })),
  );
  const breachRing = deckSlab(span, cutA - 2, cutB + 2, CAUSEWAY_HALF_M + 6);
  const [smokeLng, smokeLat] = toLL(along(span, (cutA + cutB) / 2).at);
  const jb = data.checkpoints.johorBahru;
  const rtsEnd = rts[rts.length - 1];
  const linkEnd = axis[axis.length - 1];

  return {
    flat,
    solids: fcOf(solids.map(solidFeature)),
    lines: fcOf(lines),
    breach: fcOf([{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [breachRing] } }]),
    johor: fcOf([{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [data.johorShore.map((c) => [...c])] } }]),
    smoke: { lat: smokeLat, lng: smokeLng },
    lights: [
      { lat: jb.lat, lng: jb.lng, bearing: 195 },
      { lat: rtsEnd[1], lng: rtsEnd[0], bearing: 150 },
      { lat: linkEnd[1], lng: linkEnd[0], bearing: 140 },
    ],
    labels: [
      { id: 'causeway', ...midpoint(span) },
      { id: 'secondLink', ...midpoint(axis) },
      { id: 'rts', ...midpoint(rts) },
      { id: 'johor', lat: 1.488, lng: 103.745 },
    ],
  };
}
