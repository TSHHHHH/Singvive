/**
 * HUD padding: the part of the map a dock panel, the timeline or the here /
 * target cards cover, so focus moves frame inside what is left free.
 *
 * In 3D, camera padding is a lens shift, not a pan: re-aiming the centre can
 * hold one screen row still, but rows nearer and farther slide opposite ways
 * (at pitch 50 a 360 px dock panel swings the top of the map ~60 px one way and
 * the bottom ~65 px the other, a 640 px one over 110 px). Eased or not, that
 * reads as the camera turning whenever a panel opens. So a panel never touches
 * a tilted camera: the padding it wants is only recorded here
 * (`setHudPadding`), and the next camera move that is moving anyway (a focus
 * ease, the travel chase, a recentre, a 2D / 3D switch, leaving a place view)
 * carries it in (`hudPadding`). On the flat map padding is a pure pan, so it is
 * applied at once with nothing on screen moving.
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

/** At or below this pitch padding is a pure pan and can be swapped in place. */
export const FLAT_PITCH = 0.5;

const wanted = new WeakMap<object, Padding>();

/** Record the HUD padding a panel wants, for the next camera move to carry. */
export function setHudPadding(map: object, padding: Padding): void {
  wanted.set(map, padding);
}

/** The HUD padding camera moves should frame with: the recorded one, else the camera's own. */
export function hudPadding(map: { getPadding(): Partial<Padding> }): Padding {
  return wanted.get(map) ?? toPadding(map.getPadding());
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
