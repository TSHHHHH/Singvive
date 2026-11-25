import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import { landCrossings, type LandCrossing } from '../game/crossings';
import { discPolygon } from './geo';

const M_LAT = 111_320;
const M_LNG = M_LAT * Math.cos((1.35 * Math.PI) / 180);
const MIN_JOINT_TURN = (20 * Math.PI) / 180;
/** Quad overlap past a joint, as a share of half-width: covers turns under MIN_JOINT_TURN. */
const JOINT_OVERLAP = Math.tan(MIN_JOINT_TURN / 2);
/** Snap to ~1 cm: near-coincident float edges break polygon-clipping's sweep. */
const SNAP = 1e7;
const snap = (poly: Polygon): Polygon =>
  poly.map((ring) => ring.map(([x, y]) => [Math.round(x * SNAP) / SNAP, Math.round(y * SNAP) / SNAP]));
let deckMask: { from: readonly LandCrossing[]; parts: DeckPart[] } | undefined;

/** One deck as quads plus discs at sharp bends; matches the route capsules. */
function deckPieces({ points, halfWidthM }: LandCrossing): Polygon[] {
  const pieces: Polygon[] = [];
  // Round joints only show where the deck bends sharply: under 20° the gap
  // between quads is a fraction of a metre, and the quad overlap below fills it.
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const p = points[i];
    const b = points[i + 1];
    const h1 = Math.atan2((p.lat - a.lat) * M_LAT, (p.lng - a.lng) * M_LNG);
    const h2 = Math.atan2((b.lat - p.lat) * M_LAT, (b.lng - p.lng) * M_LNG);
    let turn = Math.abs(h2 - h1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn >= MIN_JOINT_TURN) pieces.push(snap(discPolygon({ ...p, r: halfWidthM }, 12)));
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = (b.lng - a.lng) * M_LNG;
    const dy = (b.lat - a.lat) * M_LAT;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const lngOffset = (-dy / length) * halfWidthM / M_LNG;
    const latOffset = (dx / length) * halfWidthM / M_LAT;
    // Square caps at the deck ends cover the route check's round ends; at a
    // gentle bend, a short overlap fills the outer wedge between quads.
    const ux = dx / length / M_LNG;
    const uy = dy / length / M_LAT;
    const back = i === 1 ? halfWidthM : halfWidthM * JOINT_OVERLAP;
    const ahead = i === points.length - 1 ? halfWidthM : halfWidthM * JOINT_OVERLAP;
    const s = { lat: a.lat - uy * back, lng: a.lng - ux * back };
    const e = { lat: b.lat + uy * ahead, lng: b.lng + ux * ahead };
    pieces.push(snap([[
      [s.lng + lngOffset, s.lat + latOffset],
      [e.lng + lngOffset, e.lat + latOffset],
      [e.lng - lngOffset, e.lat - latOffset],
      [s.lng - lngOffset, s.lat - latOffset],
      [s.lng + lngOffset, s.lat + latOffset],
    ]]));
  }
  return pieces;
}

type Box = [minX: number, minY: number, maxX: number, maxY: number];
interface DeckPart {
  shape: MultiPolygon;
  box: Box;
}

function boxOf(rings: Polygon): Box {
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < box[0]) box[0] = x;
      if (y < box[1]) box[1] = y;
      if (x > box[2]) box[2] = x;
      if (y > box[3]) box[3] = y;
    }
  }
  return box;
}

const overlaps = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/**
 * One shape per deck. polygon-clipping is not robust to an island-wide union
 * of ~1200 decks (it throws on near-coincident edges), so each deck is joined
 * on its own; a deck whose union throws keeps its raw pieces.
 */
function crossingDeckParts(): DeckPart[] {
  const crossings = landCrossings();
  if (deckMask?.from === crossings) return deckMask.parts;
  const parts: DeckPart[] = [];
  for (const c of crossings) {
    const pieces = deckPieces(c);
    if (!pieces.length) continue;
    const box = boxOf(pieces.flat());
    try {
      parts.push({ shape: polygonClipping.union(pieces[0], ...pieces.slice(1)), box });
    } catch {
      for (const p of pieces) parts.push({ shape: [p], box: boxOf(p) });
    }
  }
  deckMask = { from: crossings, parts };
  return parts;
}

/**
 * `area` minus `cuts`. When polygon-clipping throws, split the cuts in half
 * and retry; a single deck that still throws is left tinted, never fatal.
 */
function subtract(area: MultiPolygon, cuts: DeckPart[]): MultiPolygon {
  try {
    return polygonClipping.difference(area, ...cuts.map((c) => c.shape));
  } catch {
    if (cuts.length === 1) return area;
    const mid = cuts.length >> 1;
    return subtract(subtract(area, cuts.slice(0, mid)), cuts.slice(mid));
  }
}

/**
 * Remove traversable decks from water tint; never apply to restricted ground.
 * Each polygon is clipped only by the decks over its bounding box, so a river
 * pays for its own bridges and a clipping fault stays local.
 */
export function withoutCrossingDecks(area: MultiPolygon): MultiPolygon {
  if (!area.length) return area;
  const parts = crossingDeckParts();
  if (!parts.length) return area;
  const out: MultiPolygon = [];
  for (const poly of area) {
    const box = boxOf(poly);
    const cuts = parts.filter((p) => overlaps(p.box, box));
    if (cuts.length) out.push(...subtract([poly], cuts));
    else out.push(poly);
  }
  return out;
}
