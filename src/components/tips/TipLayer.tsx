import { useLayoutEffect, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { clampBox, placeNear, type Placement } from './clamp';
import { HOVER_DELAY_MS, HOLD_MOVE_PX, LONG_PRESS_MS } from './hold';
import { getTip, setTip, subscribeTip } from './tipStore';
import { useCoarsePointer } from './useCoarsePointer';

/** Sweeping straight from one tipped element to the next re-shows instantly. */
const GRACE_MS = 300;
const GAP = 6;
const CURSOR_OFFSET = 14;
const POLL_MS = 150;
/** Ghost click after a hold: eat clicks only in this window after pointerup. */
const EAT_CLICK_MS = 400;
export const TIP_ID = 'app-tip';

const PANEL =
  'pointer-events-none fixed z-[3000] max-w-[260px] whitespace-pre-line break-words ' +
  'rounded border border-white/20 bg-concrete-900/95 px-2 py-1.5 text-2xs leading-relaxed ' +
  'text-concrete-50 shadow-signage backdrop-blur-sm transition-opacity duration-75';

function readPlacement(el: HTMLElement): Placement {
  const p = el.dataset.tipPlacement;
  return p === 'top' || p === 'left' || p === 'right' ? p : 'bottom';
}

/** Cheap fingerprint of an anchor's box, to notice it moving under a live tip. */
function rectKey(el: HTMLElement): string {
  const r = el.getBoundingClientRect();
  return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
}

/**
 * The one in-game hover tip. Mounted once; a single delegated listener set
 * drives every `[data-tip]` element in the app, so a call site costs one
 * attribute and adds no DOM. Fine pointers hover; coarse pointers long-press
 * to pin (short tap still fires the control).
 */
export function TipLayer() {
  const coarse = useCoarsePointer();
  const state = useSyncExternalStore(subscribeTip, getTip, () => null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ seq: number; left: number; top: number } | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let pending: HTMLElement | null = null;
    let active: HTMLElement | null = null;
    let prevDescribedBy: string | null = null;
    let lastHideAt = 0;
    let lastRect = '';
    let seq = 0;

    let holdPointerId: number | null = null;
    let holdX = 0;
    let holdY = 0;
    let holdStartedAt = 0;
    let holdFired = false;
    let eatClick: ((e: Event) => void) | null = null;
    let eatTimer: number | undefined;

    const clearTimer = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      pending = null;
    };

    const disarmEatClick = () => {
      if (eatTimer !== undefined) {
        clearTimeout(eatTimer);
        eatTimer = undefined;
      }
      if (!eatClick) return;
      document.removeEventListener('click', eatClick, true);
      document.removeEventListener('contextmenu', eatClick, true);
      eatClick = null;
    };

    const armEatClick = () => {
      disarmEatClick();
      eatClick = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        disarmEatClick();
      };
      document.addEventListener('click', eatClick, true);
      document.addEventListener('contextmenu', eatClick, true);
    };

    const hide = () => {
      clearTimer();
      holdPointerId = null;
      holdFired = false;
      if (!active) return;
      // Give back whatever aria-describedby the element had before we borrowed it.
      if (prevDescribedBy === null) active.removeAttribute('aria-describedby');
      else active.setAttribute('aria-describedby', prevDescribedBy);
      prevDescribedBy = null;
      active = null;
      lastHideAt = performance.now();
      setTip(null);
    };

    const show = (el: HTMLElement, cx: number, cy: number, follow: boolean) => {
      const text = el.dataset.tip;
      if (!text) return;
      if (active && active !== el) {
        if (prevDescribedBy === null) active.removeAttribute('aria-describedby');
        else active.setAttribute('aria-describedby', prevDescribedBy);
      }
      prevDescribedBy = el.getAttribute('aria-describedby');
      el.setAttribute('aria-describedby', prevDescribedBy ? `${prevDescribedBy} ${TIP_ID}` : TIP_ID);
      active = el;
      lastRect = rectKey(el);
      setTip({ text, el, placement: readPlacement(el), follow, cx, cy, seq: ++seq });
    };

    const anchorOf = (node: EventTarget | null): HTMLElement | null => {
      const el = node as Element | null;
      const tipped = el?.closest?.('[data-tip]') as HTMLElement | null;
      if (tipped) return tipped;
      // Nothing in the app sets `title` any more, but third-party DOM does —
      // leaflet's zoom and attribution controls, for instance. Adopt any stray
      // native title the first time it is hovered so the grey OS tooltip never
      // appears anywhere. `[title]` matches the attribute only, so SVG <title>
      // children (BodyDoll's body parts) are deliberately left alone.
      const titled = el?.closest?.('[title]') as HTMLElement | null;
      const text = titled?.getAttribute('title');
      if (titled && text) {
        titled.setAttribute('data-tip', text);
        titled.removeAttribute('title');
        return titled;
      }
      return null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // No preventDefault — modals and the item context menu listen for Escape too.
      if (e.key === 'Escape') hide();
    };

    const poll = window.setInterval(() => {
      if (!active) return;
      if (!active.isConnected) {
        hide();
        return;
      }
      const cur = getTip();
      const text = active.dataset.tip;
      if (!cur || !text) {
        hide();
        return;
      }
      const key = rectKey(active);
      if (text !== cur.text || key !== lastRect) {
        lastRect = key;
        setTip({ ...cur, text, seq: ++seq });
      }
    }, POLL_MS);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('wheel', hide, true);
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', hide);

    if (coarse) {
      const onPointerDown = (e: PointerEvent) => {
        // iOS also synthesizes mouse events after touch — only the real finger/pen holds.
        if (e.pointerType === 'mouse') return;
        if (e.button !== 0) return;

        const el = anchorOf(e.target);
        if (active && el === active) {
          // Second tap on the same control: drop the pin so the click can fire.
          hide();
          return;
        }
        hide();
        if (!el) return;

        holdPointerId = e.pointerId;
        holdX = e.clientX;
        holdY = e.clientY;
        holdStartedAt = performance.now();
        holdFired = false;
        pending = el;
        timer = window.setTimeout(() => {
          timer = undefined;
          if (pending !== el || !el.isConnected) return;
          pending = null;
          holdFired = true;
          show(el, holdX, holdY, false);
        }, LONG_PRESS_MS);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (holdPointerId !== e.pointerId || !pending || timer === undefined) return;
        const dx = e.clientX - holdX;
        const dy = e.clientY - holdY;
        if (dx * dx + dy * dy >= HOLD_MOVE_PX * HOLD_MOVE_PX) {
          clearTimer();
          holdPointerId = null;
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        if (holdPointerId !== e.pointerId) return;
        holdPointerId = null;
        const elapsed = performance.now() - holdStartedAt;
        if (pending && timer !== undefined && elapsed >= LONG_PRESS_MS) {
          const el = pending;
          clearTimer();
          holdFired = true;
          show(el, holdX, holdY, false);
        } else {
          clearTimer();
        }
        if (holdFired) {
          armEatClick();
          eatTimer = window.setTimeout(disarmEatClick, EAT_CLICK_MS);
          holdFired = false;
        }
      };

      const onContextMenu = (e: Event) => {
        if (anchorOf(e.target)) e.preventDefault();
      };

      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
      document.addEventListener('contextmenu', onContextMenu, true);

      return () => {
        clearInterval(poll);
        disarmEatClick();
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        document.removeEventListener('contextmenu', onContextMenu, true);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('scroll', hide, true);
        document.removeEventListener('wheel', hide, true);
        window.removeEventListener('blur', hide);
        document.removeEventListener('visibilitychange', hide);
        hide();
      };
    }

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = anchorOf(e.target);
      if (el && el === pending && timer !== undefined) return;
      if (el && el === active) {
        clearTimer();
        return;
      }
      clearTimer();
      hide();
      if (!el) return;
      pending = el;
      const { clientX, clientY } = e;
      const follow = el.dataset.tipFollow === '1';
      const delay = performance.now() - lastHideAt < GRACE_MS ? 0 : HOVER_DELAY_MS;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (pending !== el || !el.isConnected) return;
        pending = null;
        show(el, clientX, clientY, follow);
      }, delay);
    };

    const onOut = (e: PointerEvent) => {
      const anchor = active ?? pending;
      if (!anchor) return;
      const to = e.relatedTarget as Node | null;
      if (to && anchor.contains(to)) return;
      hide();
    };

    const onMove = (e: PointerEvent) => {
      const cur = getTip();
      if (!cur?.follow) return;
      setTip({ ...cur, cx: e.clientX, cy: e.clientY });
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (!target?.matches?.(':focus-visible')) return;
      const el = anchorOf(target);
      if (!el || el === active) return;
      clearTimer();
      hide();
      show(el, 0, 0, false); // keyboard tips are always element-anchored
    };

    const onFocusOut = (e: FocusEvent) => {
      if (active && anchorOf(e.target) === active) hide();
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('pointermove', onMove);
    // Capture, so a click / drag / pan kills the tip before anything else runs.
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      clearInterval(poll);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('wheel', hide, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', hide);
      hide();
    };
  }, [coarse]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!state || !el) return;
    const box = el.getBoundingClientRect();
    const next = state.follow
      ? clampBox(box.width, box.height, state.cx + CURSOR_OFFSET, state.cy + CURSOR_OFFSET)
      : placeNear(state.el.getBoundingClientRect(), box.width, box.height, state.placement, GAP);
    setPos({ seq: state.seq, left: next.left, top: next.top });
  }, [state]);

  if (!state) return null;

  // Until the panel has been measured for this seq it stays parked off-screen
  // and transparent, so a tip never flashes at the previous anchor's spot.
  const ready = pos?.seq === state.seq;

  return createPortal(
    <div
      id={TIP_ID}
      ref={ref}
      role="tooltip"
      className={PANEL}
      style={{
        left: ready ? pos.left : -9999,
        top: ready ? pos.top : -9999,
        opacity: ready ? 1 : 0,
      }}
    >
      {state.text}
    </div>,
    document.body,
  );
}
