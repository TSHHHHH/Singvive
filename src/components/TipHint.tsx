import {
  useEffect,
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

/**
 * Hover tooltip on fine pointers; tap-to-toggle on coarse / no-hover devices.
 * Tap outside (or tap again) closes.
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
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={rootRef}
      className={`group relative ${className}`}
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
          coarse
            ? open
              ? 'block'
              : 'hidden'
            : 'hidden group-hover:block'
        }`}
      >
        {tip}
      </div>
    </div>
  );
}
