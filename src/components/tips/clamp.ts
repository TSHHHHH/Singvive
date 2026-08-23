/**
 * Shared viewport-clamping maths for every floating surface in the game:
 * the global hover tip, the inventory item card, and the item context menu.
 * All three used to carry their own near-identical copy of this.
 */

export const VIEW_PAD = 8;

export type Placement = 'top' | 'bottom' | 'left' | 'right';

export interface ViewBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The visual viewport inset by `pad` — follows pinch-zoom and mobile URL bars. */
export function viewBox(pad = VIEW_PAD): ViewBox {
  const vv = window.visualViewport;
  const ox = vv?.offsetLeft ?? 0;
  const oy = vv?.offsetTop ?? 0;
  return {
    left: ox + pad,
    top: oy + pad,
    right: ox + (vv?.width ?? window.innerWidth) - pad,
    bottom: oy + (vv?.height ?? window.innerHeight) - pad,
  };
}

/** Nudge a w×h box whose preferred origin is (left, top) back inside the viewport. */
export function clampBox(
  w: number,
  h: number,
  left: number,
  top: number,
  pad = VIEW_PAD,
): { left: number; top: number } {
  const vb = viewBox(pad);
  let x = left;
  let y = top;
  if (x + w > vb.right) x = vb.right - w;
  if (x < vb.left) x = vb.left;
  if (y + h > vb.bottom) y = vb.bottom - h;
  if (y < vb.top) y = vb.top;
  return { left: x, top: y };
}

const FLIP: Record<Placement, Placement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/**
 * Sit a w×h panel beside `anchor` on the requested side, flipping to the
 * opposite side when there is no room, then clamping along the other axis.
 */
export function placeNear(
  anchor: DOMRect,
  w: number,
  h: number,
  placement: Placement,
  gap = 6,
  pad = VIEW_PAD,
): { left: number; top: number; placement: Placement } {
  const vb = viewBox(pad);

  const fits = (p: Placement): boolean => {
    switch (p) {
      case 'top':
        return anchor.top - gap - h >= vb.top;
      case 'bottom':
        return anchor.bottom + gap + h <= vb.bottom;
      case 'left':
        return anchor.left - gap - w >= vb.left;
      case 'right':
        return anchor.right + gap + w <= vb.right;
    }
  };

  let p = placement;
  if (!fits(p) && fits(FLIP[p])) p = FLIP[p];

  let left: number;
  let top: number;
  if (p === 'top' || p === 'bottom') {
    left = anchor.left + anchor.width / 2 - w / 2;
    top = p === 'top' ? anchor.top - gap - h : anchor.bottom + gap;
  } else {
    top = anchor.top + anchor.height / 2 - h / 2;
    left = p === 'left' ? anchor.left - gap - w : anchor.right + gap;
  }

  return { ...clampBox(w, h, left, top, pad), placement: p };
}

/**
 * Translate-nudge variant for tips already positioned by Tailwind classes:
 * measures where the element landed and returns the offset that pulls it in.
 */
export function clampShift(el: HTMLElement, pad = VIEW_PAD): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const vb = viewBox(pad);
  let x = 0;
  let y = 0;
  if (rect.left < vb.left) x = vb.left - rect.left;
  else if (rect.right > vb.right) x = vb.right - rect.right;
  if (rect.top < vb.top) y = vb.top - rect.top;
  else if (rect.bottom > vb.bottom) y = vb.bottom - rect.bottom;
  return { x, y };
}
