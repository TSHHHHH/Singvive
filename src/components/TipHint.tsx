import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** True when the device has no reliable hover (phones / most tablets). */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return coarse;
}

const VIEW_PAD = 8;

/** Shift a tip so its box stays inside the visual viewport. */
function clampIntoView(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const vv = window.visualViewport;
  const left = vv?.offsetLeft ?? 0;
  const top = vv?.offsetTop ?? 0;
  const right = left + (vv?.width ?? window.innerWidth);
  const bottom = top + (vv?.height ?? window.innerHeight);

  let x = 0;
  let y = 0;
  if (rect.left < left + VIEW_PAD) x = left + VIEW_PAD - rect.left;
  else if (rect.right > right - VIEW_PAD) x = right - VIEW_PAD - rect.right;
  if (rect.top < top + VIEW_PAD) y = top + VIEW_PAD - rect.top;
  else if (rect.bottom > bottom - VIEW_PAD) y = bottom - VIEW_PAD - rect.bottom;
  return { x, y };
}

/**
 * Hover tooltip on fine pointers; tap-to-toggle on coarse / no-hover devices.
 * Tap outside (or tap again) closes. Tips are nudged to stay on-screen.
 */
export function TipHint({
  tip,
  tipClassName,
  children,
  className = '',
}: {
  tip: ReactNode;
  tipClassName?: string;
  children: ReactNode;
  className?: string;
}) {
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const clampRef = useRef<HTMLDivElement>(null);

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
      setShift({ x: 0, y: 0 });
      return;
    }
    const el = clampRef.current;
    if (!el) return;
    // Clear any prior nudge so we measure the natural anchor position.
    el.style.transform = 'none';
    const next = clampIntoView(el);
    el.style.transform = '';
    setShift(next);
  }, [visible, tip]);

  useEffect(() => {
    if (!visible) return;
    const recalc = () => {
      const el = clampRef.current;
      if (!el) return;
      el.style.transform = 'none';
      const next = clampIntoView(el);
      el.style.transform = '';
      setShift(next);
    };
    window.addEventListener('resize', recalc);
    window.visualViewport?.addEventListener('resize', recalc);
    window.visualViewport?.addEventListener('scroll', recalc);
    return () => {
      window.removeEventListener('resize', recalc);
      window.visualViewport?.removeEventListener('resize', recalc);
      window.visualViewport?.removeEventListener('scroll', recalc);
    };
  }, [visible]);

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
      <div
        className={`pointer-events-none z-[50] ${tipClassName ?? ''} ${
          visible ? 'block' : 'hidden'
        }`}
      >
        <div
          ref={clampRef}
          style={
            shift.x || shift.y
              ? { transform: `translate(${shift.x}px, ${shift.y}px)` }
              : undefined
          }
        >
          {tip}
        </div>
      </div>
    </div>
  );
}
