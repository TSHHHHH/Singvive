import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { placeNear, type Placement } from './tips/clamp';
import { useCoarsePointer } from './tips/useCoarsePointer';

export { useCoarsePointer };

const GAP = 6;

function placePanel(
  anchor: HTMLElement,
  panel: HTMLElement,
  placement: Placement,
): { left: number; top: number } {
  const box = panel.getBoundingClientRect();
  const next = placeNear(
    anchor.getBoundingClientRect(),
    box.width,
    box.height,
    placement,
    GAP,
  );
  return { left: next.left, top: next.top };
}

/**
 * Hover tooltip on fine pointers; tap-to-toggle on coarse / no-hover devices.
 * Tap outside (or tap again) closes.
 *
 * The panel is portaled to `document.body` so overflow-y-auto ancestors (the
 * survivor rail, inventory scrollers) cannot clip it — CSS computes overflow-x
 * to auto whenever overflow-y is auto, which used to slice tips at the map.
 *
 * For **rich ReactNode tips only** — plain-string hover text uses `tip()` from
 * `components/tips`, which needs no wrapper element and works on touch-free
 * surfaces this component can't wrap (grid cells, `<th>`, truncating spans).
 */
export function TipHint({
  tip,
  tipClassName,
  placement = 'bottom',
  children,
  className = '',
}: {
  tip: ReactNode;
  tipClassName?: string;
  /** Preferred side of the trigger. Flips when short on room. */
  placement?: Placement;
  children: ReactNode;
  className?: string;
}) {
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const visible = coarse ? open : hover;

  useEffect(() => {
    if (!open || !coarse) return;
    const onDoc = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDoc, true);
    return () => document.removeEventListener('pointerdown', onDoc, true);
  }, [open, coarse]);

  useLayoutEffect(() => {
    if (!visible) {
      setPos(null);
      return;
    }
    const anchor = rootRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const next = placePanel(anchor, panel, placement);
    setPos((prev) =>
      prev && prev.left === next.left && prev.top === next.top ? prev : next,
    );
  }, [visible, tip, placement]);

  useEffect(() => {
    if (!visible) return;
    const hide = () => {
      setHover(false);
      setOpen(false);
    };
    const recalc = () => {
      const anchor = rootRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const next = placePanel(anchor, panel, placement);
      setPos((prev) =>
        prev && prev.left === next.left && prev.top === next.top ? prev : next,
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('resize', recalc);
    window.visualViewport?.addEventListener('resize', recalc);
    window.visualViewport?.addEventListener('scroll', recalc);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', recalc);
      window.visualViewport?.removeEventListener('resize', recalc);
      window.visualViewport?.removeEventListener('scroll', recalc);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [visible, placement]);

  return (
    <div
      ref={rootRef}
      className={`group relative ${className}`}
      onMouseEnter={coarse ? undefined : () => setHover(true)}
      onMouseLeave={coarse ? undefined : () => setHover(false)}
      onClick={
        coarse
          ? (e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }
          : undefined
      }
    >
      {children}
      {visible &&
        createPortal(
          <div
            ref={panelRef}
            role="tooltip"
            className={`pointer-events-none z-[3000] ${tipClassName ?? ''}`}
            style={{
              position: 'fixed',
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              opacity: pos ? 1 : 0,
            }}
          >
            {tip}
          </div>,
          document.body,
        )}
    </div>
  );
}
