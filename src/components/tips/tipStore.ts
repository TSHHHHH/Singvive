import type { Placement } from './clamp';

export interface TipState {
  /** Plain text, read from the anchor's `data-tip`. */
  text: string;
  /** The hovered element. Also polled for `isConnected` and live text changes. */
  el: HTMLElement;
  placement: Placement;
  /** Trail the cursor instead of anchoring to the element (big surfaces). */
  follow: boolean;
  cx: number;
  cy: number;
  /** Bumped whenever the panel must re-measure. */
  seq: number;
}

/**
 * A tiny external store rather than React context: the driver is a raw
 * document listener, and a context update would re-render the whole app on
 * every hover. Only <TipLayer /> subscribes.
 */
let state: TipState | null = null;
const listeners = new Set<() => void>();

export function getTip(): TipState | null {
  return state;
}

export function setTip(next: TipState | null): void {
  if (state === next) return;
  state = next;
  for (const fn of listeners) fn();
}

export function subscribeTip(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
