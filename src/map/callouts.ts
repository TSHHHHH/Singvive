/**
 * Placement for the floating here / target cards (components/MapCallouts.tsx):
 * pure screen geometry, so it can be pinned by tests.
 *
 * A card sits above the marker it describes, its tail on the marker. Two cards
 * lean away from each other so neither covers the other; near an edge a card
 * slides along its marker rather than leave the map, and drops below the
 * marker when there is no room above.
 */

/** A marker on screen and the card that belongs to it. */
export interface CalloutPoint {
  /** The anchored map point, px in the map box. */
  x: number;
  y: number;
  /** Px the marker's badge rides above that point (roof or beacon). */
  lift: number;
  /** Px from the badge's point up to its top edge. */
  gap: number;
  /** The card's size, px. */
  w: number;
  h: number;
}

/** The map box and how much of each edge other chrome covers, px. */
export interface CalloutFrame {
  w: number;
  h: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type CalloutSide = 'centre' | 'left' | 'right';

export interface CalloutBox {
  /** The card's top-left corner, px in the map box. */
  left: number;
  top: number;
  side: CalloutSide;
  /** Hung under the marker: there was no room above it. */
  below: boolean;
  /** The tail's centre, px from the card's left edge. */
  tail: number;
  /** The marker is past the card's reach (off screen): no tail to draw. */
  adrift: boolean;
}

/** Air between a card and the marker it points at, px. */
export const CALLOUT_GAP = 12;
/** How far in from its corner a leaning card's tail sits, px. */
export const CALLOUT_TAIL_INSET = 28;
/** The tail never comes closer than this to a card corner, px. */
const TAIL_MIN = 16;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** A marker this far past a card's corner still gets a tail, pinned to the corner, px. */
const TAIL_REACH = 40;

function placeOne(p: CalloutPoint, side: CalloutSide, f: CalloutFrame, nudge = 0): CalloutBox {
  const minX = f.left;
  const maxX = f.w - f.right - p.w;
  const wanted =
    side === 'centre' ? p.x - p.w / 2 : side === 'left' ? p.x - p.w + CALLOUT_TAIL_INSET : p.x - CALLOUT_TAIL_INSET;
  const left = clamp(wanted + nudge, minX, maxX);

  const minY = f.top;
  const maxY = f.h - f.bottom - p.h;
  const above = p.y - p.lift - p.gap - CALLOUT_GAP - p.h;
  const under = p.y + CALLOUT_GAP;
  // Above unless it would be cut off and there is room underneath.
  const below = above < minY && under <= maxY;
  const top = clamp(below ? under : above, minY, maxY);

  const tail = p.x - left;
  const adrift =
    tail < -TAIL_REACH ||
    tail > p.w + TAIL_REACH ||
    // The marker is under the card itself, or far off its pointing edge.
    (below ? top - p.y > CALLOUT_GAP * 3 : p.y - p.lift - p.gap - (top + p.h) < 0);
  return {
    left: Math.round(left),
    top: Math.round(top),
    side,
    below,
    tail: Math.round(clamp(tail, TAIL_MIN, p.w - TAIL_MIN)),
    adrift,
  };
}

/** Air kept between the two cards when they have to be pushed apart, px. */
export const CALLOUT_APART = 8;

/**
 * Place the here and target cards. Alone, a card centres on its marker.
 * Together they lean apart: the one whose marker is further left hangs to the
 * left of it, the other to the right. Markers too close for that to clear are
 * pushed further apart, as far as the map's edges allow.
 */
export function placeCallouts(
  here: CalloutPoint | null,
  target: CalloutPoint | null,
  frame: CalloutFrame,
): { here: CalloutBox | null; target: CalloutBox | null } {
  if (!here || !target) {
    return {
      here: here ? placeOne(here, 'centre', frame) : null,
      target: target ? placeOne(target, 'centre', frame) : null,
    };
  }
  const targetRight = target.x >= here.x;
  const [l, r] = targetRight ? [here, target] : [target, here];
  let lb = placeOne(l, 'left', frame);
  let rb = placeOne(r, 'right', frame);
  const overlapY = Math.min(lb.top + l.h, rb.top + r.h) - Math.max(lb.top, rb.top);
  const overlapX = lb.left + l.w + CALLOUT_APART - rb.left;
  if (overlapY > 0 && overlapX > 0) {
    // Split the push; whatever one side can't take at its edge, the other does.
    const half = overlapX / 2;
    const l1 = placeOne(l, 'left', frame, -half);
    const r1 = placeOne(r, 'right', frame, half);
    const lGot = lb.left - l1.left;
    const rGot = r1.left - rb.left;
    lb = placeOne(l, 'left', frame, -(half + (half - rGot)));
    rb = placeOne(r, 'right', frame, half + (half - lGot));
  }
  return targetRight ? { here: lb, target: rb } : { here: rb, target: lb };
}
