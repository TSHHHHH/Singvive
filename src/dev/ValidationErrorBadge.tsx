import { useEffect, useRef, useState } from 'react';

/**
 * Compact "N errors" chip that opens a click-to-toggle list of validation
 * messages. Used by the DEV loot / tables editors where the badge alone
 * used to hide what actually went wrong.
 */
export function ValidationErrorBadge({ errors }: { errors: string[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length === 0) setOpen(false);
  }, [errors.length]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (errors.length === 0) return null;

  const label = `${errors.length} error${errors.length === 1 ? '' : 's'}`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Show validation errors"
        onClick={() => setOpen((o) => !o)}
        className="rounded bg-red-500/20 px-2 py-0.5 text-2xs uppercase tracking-wider text-red-300 hover:bg-red-500/30"
      >
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Validation errors"
          className="absolute left-0 top-full z-[60] mt-1 w-max min-w-[16rem] max-w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-red-500/30 bg-concrete-900 p-2 shadow-xl"
        >
          <ul className="max-h-56 space-y-1 overflow-y-auto font-mono text-[11px] leading-snug text-red-200/90">
            {errors.map((msg, i) => (
              <li key={`${i}:${msg}`} className="break-words">
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
