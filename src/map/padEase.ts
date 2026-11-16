/**
 * HUD padding eases with the slide-out instead of snapping.
 *
 * In 3D, camera padding is a lens shift: re-aiming the centre can hold one
 * screen row still, but rows nearer and farther slide opposite ways (at pitch
 * 50 a 360 px dock panel shears the top of the map ~55 px one way and the
 * bottom ~65 px the other). Done in one frame that reads as a camera jerk, so
 * the padding follows the panel's own CSS transition, pivoting on the player.
 */

export interface Padding {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** MapLibre's `getPadding()` types every edge as optional. */
export function toPadding(p: Partial<Padding>): Padding {
  return { top: p.top ?? 0, left: p.left ?? 0, right: p.right ?? 0, bottom: p.bottom ?? 0 };
}

/** Matches the slide-out's `duration-200` (GameScreen). */
export const PAD_EASE_MS = 200;

/**
 * CSS `ease-out`, i.e. cubic-bezier(0, 0, 0.58, 1), so the camera and the
 * panel arrive on the same curve.
 */
export function cssEaseOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x1 = 0;
  const x2 = 0.58;
  const bx = (s: number) => 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3;
  // Bisection is plenty: 24 halvings is far below a pixel.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < t) lo = mid;
    else hi = mid;
  }
  const s = (lo + hi) / 2;
  // y1 = 0, y2 = 1
  return 3 * s * s * (1 - s) + s ** 3;
}

export function mixPadding(from: Padding, to: Padding, k: number): Padding {
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    top: mix(from.top, to.top),
    left: mix(from.left, to.left),
    right: mix(from.right, to.right),
    bottom: mix(from.bottom, to.bottom),
  };
}

export function samePadding(a: Padding, b: Padding, eps = 0.01): boolean {
  return (
    Math.abs(a.top - b.top) < eps &&
    Math.abs(a.left - b.left) < eps &&
    Math.abs(a.right - b.right) < eps &&
    Math.abs(a.bottom - b.bottom) < eps
  );
}

/** Middle of the area the padding leaves free, in container px. */
export function paddedMiddle(padding: Padding, width: number, height: number): { x: number; y: number } {
  return {
    x: padding.left + (width - padding.left - padding.right) / 2,
    y: padding.top + (height - padding.top - padding.bottom) / 2,
  };
}

/**
 * The screen point to hold still while the padding changes: the player when
 * they are inside the area left free both before and after, otherwise the
 * middle of the new free area (what a focus command would frame).
 */
export function padPivot(
  player: { x: number; y: number } | null,
  from: Padding,
  to: Padding,
  width: number,
  height: number,
): { x: number; y: number } {
  if (player && Number.isFinite(player.x) && Number.isFinite(player.y)) {
    const inside = (p: Padding) =>
      player.x >= p.left && player.x <= width - p.right && player.y >= p.top && player.y <= height - p.bottom;
    if (inside(from) && inside(to)) return { x: player.x, y: player.y };
  }
  return paddedMiddle(to, width, height);
}
