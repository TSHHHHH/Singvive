/**
 * Label placement for the tunnel metro map. Pure geometry: the view measures
 * each label and platform box, hands them in with the drawn track, and gets
 * back a side per label and a spot per roundel that keep text off the track,
 * off the stops and off each other.
 *
 * Greedy, most important first: the stop you're on and the ones you can walk
 * to choose before the far, unrevealed ones. Every candidate is scored by how
 * much it covers (labels, platform boxes, stop discs, roundels) and how much
 * track runs under it; the cheapest wins, ties go to the preferred side.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LabelSide = 'above' | 'below' | 'left' | 'right' | 'ne' | 'se' | 'nw' | 'sw';

export interface LabelInput {
  id: string;
  /** The stop's centre. */
  at: Pt;
  /** Measured label size. */
  w: number;
  h: number;
  /** Lower goes first. */
  priority: number;
  /** Sides in order of preference; the rest are tried after. */
  prefer: LabelSide[];
}

export interface BoxInput {
  id: string;
  /** Centre of a platform box, and its measured size. */
  at: Pt;
  w: number;
  h: number;
  /** Where its line roundel may go, in order of preference. Empty = none. */
  roundel: LabelSide[];
}

export interface PlacementInput {
  labels: LabelInput[];
  boxes: BoxInput[];
  /** Every stop disc that isn't a platform box. */
  stops: Pt[];
  /** The drawn track, as polylines. */
  tracks: Pt[][];
}

export interface Placement {
  sides: Record<string, LabelSide>;
  /** Top-left of each placed label. */
  rects: Record<string, Rect>;
  /** Roundel centres, keyed by box id. */
  roundels: Record<string, Pt>;
}

/** Stop disc radius (interchange squares are 11 + casing). */
export const STOP_R = 13;
/** Space between a stop and its label. */
export const LABEL_GAP = 5;
export const ROUNDEL_R = 23;
/** Half the widest stroke plus a hair, so text never kisses a line. */
const TRACK_PAD = 7;
const SAMPLE = 4;

const ALL_SIDES: LabelSide[] = ['below', 'above', 'right', 'left', 'se', 'ne', 'sw', 'nw'];

export function labelRect(at: Pt, w: number, h: number, side: LabelSide): Rect {
  const r = STOP_R + LABEL_GAP;
  // Diagonal corners sit on the 45° ray, a touch tighter than a full radius.
  const d = r * 0.72;
  switch (side) {
    case 'above':
      return { x: at.x - w / 2, y: at.y - r - h, w, h };
    case 'below':
      return { x: at.x - w / 2, y: at.y + r, w, h };
    case 'right':
      return { x: at.x + r, y: at.y - h / 2, w, h };
    case 'left':
      return { x: at.x - r - w, y: at.y - h / 2, w, h };
    case 'ne':
      return { x: at.x + d, y: at.y - d - h, w, h };
    case 'se':
      return { x: at.x + d, y: at.y + d, w, h };
    case 'nw':
      return { x: at.x - d - w, y: at.y - d - h, w, h };
    case 'sw':
      return { x: at.x - d - w, y: at.y + d, w, h };
  }
}

function roundelAt(box: BoxInput, side: LabelSide): Pt {
  const gap = 10 + ROUNDEL_R;
  const hw = box.w / 2;
  const hh = box.h / 2;
  switch (side) {
    case 'above':
      return { x: box.at.x, y: box.at.y - hh - gap };
    case 'below':
      return { x: box.at.x, y: box.at.y + hh + gap };
    case 'left':
      return { x: box.at.x - hw - gap, y: box.at.y };
    case 'right':
      return { x: box.at.x + hw + gap, y: box.at.y };
    case 'ne':
      return { x: box.at.x + hw, y: box.at.y - hh - gap };
    case 'se':
      return { x: box.at.x + hw, y: box.at.y + hh + gap };
    case 'nw':
      return { x: box.at.x - hw, y: box.at.y - hh - gap };
    case 'sw':
      return { x: box.at.x - hw, y: box.at.y + hh + gap };
  }
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

function circleRect(c: Pt, r: number): Rect {
  return { x: c.x - r, y: c.y - r, w: r * 2, h: r * 2 };
}

/** Track samples, spaced SAMPLE px apart, built once per placement. */
function sampleTracks(tracks: Pt[][]): Pt[] {
  const out: Pt[] = [];
  for (const line of tracks) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.ceil(len / SAMPLE));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
  }
  return out;
}

/** How many px of track run under a rect (sample count × spacing). */
function trackUnder(r: Rect, samples: readonly Pt[]): number {
  const box = inflate(r, TRACK_PAD);
  let n = 0;
  for (const p of samples) {
    if (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) n++;
  }
  return n * SAMPLE;
}

/** Weights: covering text is worst, then stops, then running over track. */
const W_LABEL = 6;
const W_BOX = 6;
const W_STOP = 4;
const W_TRACK = 14;
/** Each step down the preference list costs about one short track crossing. */
const W_ORDER = 40;

export function placeLabels(input: PlacementInput): Placement {
  const samples = sampleTracks(input.tracks);
  const boxRects = input.boxes.map((b) => ({ x: b.at.x - b.w / 2, y: b.at.y - b.h / 2, w: b.w, h: b.h }));
  const stopRects = input.stops.map((s) => circleRect(s, STOP_R));
  const taken: Rect[] = [];

  const coverCost = (r: Rect, skipBox = -1) => {
    let c = 0;
    for (const t of taken) c += overlapArea(r, inflate(t, 2)) * W_LABEL;
    boxRects.forEach((b, i) => {
      if (i !== skipBox) c += overlapArea(r, inflate(b, 4)) * W_BOX;
    });
    for (const s of stopRects) c += overlapArea(r, s) * W_STOP;
    return c;
  };

  // Roundels first: few, big, and anchored to boxes that can't move.
  const roundels: Record<string, Pt> = {};
  input.boxes.forEach((box, bi) => {
    let best: { pt: Pt; cost: number } | null = null;
    box.roundel.forEach((side, order) => {
      const pt = roundelAt(box, side);
      const r = circleRect(pt, ROUNDEL_R);
      const cost = coverCost(r, bi) + trackUnder(r, samples) * W_TRACK + order * W_ORDER;
      if (!best || cost < best.cost) best = { pt, cost };
    });
    if (best) {
      const { pt } = best as { pt: Pt };
      roundels[box.id] = pt;
      taken.push(circleRect(pt, ROUNDEL_R));
    }
  });

  const sides: Record<string, LabelSide> = {};
  const rects: Record<string, Rect> = {};
  const order = [...input.labels].sort((a, b) => a.priority - b.priority);
  for (const label of order) {
    const tried = [...label.prefer, ...ALL_SIDES.filter((s) => !label.prefer.includes(s))];
    // Its own stop is never in the way.
    const own = stopRects.findIndex((s) => s.x + STOP_R === label.at.x && s.y + STOP_R === label.at.y);
    let best: { side: LabelSide; rect: Rect; cost: number } | null = null;
    tried.forEach((side, i) => {
      const rect = labelRect(label.at, label.w, label.h, side);
      let cost = coverCost(rect) + trackUnder(rect, samples) * W_TRACK + i * W_ORDER;
      if (own >= 0) cost -= overlapArea(rect, stopRects[own]) * W_STOP;
      if (!best || cost < best.cost) best = { side, rect, cost };
    });
    const pick = best as unknown as { side: LabelSide; rect: Rect };
    sides[label.id] = pick.side;
    rects[label.id] = pick.rect;
    taken.push(pick.rect);
  }
  return { sides, rects, roundels };
}

/** Text alignment that reads away from the stop. */
export function sideAlign(side: LabelSide): 'start' | 'center' | 'end' {
  if (side === 'left' || side === 'nw' || side === 'sw') return 'end';
  if (side === 'right' || side === 'ne' || side === 'se') return 'start';
  return 'center';
}

/** Total overlap a placement still has — for tests and the dev rig. */
export function placementClashes(input: PlacementInput, out: Placement): { labels: number; track: number } {
  const samples = sampleTracks(input.tracks);
  const list = Object.values(out.rects);
  let labels = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) if (overlapArea(list[i], list[j]) > 0) labels++;
  }
  let track = 0;
  for (const r of list) track += trackUnder(r, samples);
  return { labels, track };
}
