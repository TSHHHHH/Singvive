import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useT } from '../i18n';

// ---------------------------------------------------------------------------
// The one modal shell.
//
// Every overlay in the game was hand-rolling the same backdrop + card + close
// button, which meant `role="dialog"`, Escape and focus restoration would have
// had to be written once per modal. They live here instead.
// ---------------------------------------------------------------------------

/**
 * Open modals, innermost last.
 *
 * Settings can open the how-to-play primer *on top of itself* — both stay
 * mounted — so two shells listen for Escape at once and a single keypress would
 * close both. Only the top of this stack reacts.
 */
const stack: string[] = [];

const MAX_W = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
} as const;

export interface ModalShellProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Sticky bar pinned below the scrolling body. */
  footer?: ReactNode;
  /** Panel width. Spelled out as whole classes — Tailwind scans source text,
   *  so an interpolated `max-w-${x}` would never be generated. */
  maxWidth?: keyof typeof MAX_W;
  /** Stacking order. Raise it for a modal opened from another modal. */
  z?: number;
  /** Extra classes for the scroll/body wrapper. */
  bodyClassName?: string;
}

export function ModalShell({
  title,
  onClose,
  children,
  footer,
  maxWidth = '2xl',
  z = 1200,
  bodyClassName = 'min-h-0 flex-1 overflow-y-auto p-4',
}: ModalShellProps) {
  const { t } = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, but only the topmost shell.
  const id = useId();
  useEffect(() => {
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (stack[stack.length - 1] !== id) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const at = stack.lastIndexOf(id);
      if (at >= 0) stack.splice(at, 1);
    };
  }, [id, onClose]);

  // Move focus in, and hand it back to whatever opened us on the way out —
  // otherwise a keyboard player lands back at the top of the document.
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/80 p-4"
      style={{ zIndex: z }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`flex max-h-[min(88vh,40rem)] w-full ${MAX_W[maxWidth]} flex-col overflow-hidden rounded-xl border border-white/15 bg-concrete-900 shadow-signage outline-none`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h3 id={titleId} className="text-title text-signal">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-body text-white/40 transition hover:text-white/70"
          >
            {t('ui.common.close')}
          </button>
        </div>

        <div className={bodyClassName}>{children}</div>

        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export interface TabRailItem {
  id: string;
  label: string;
}

/**
 * Side tab list. Collapses to a horizontal scroller below `sm`, where a
 * 40-unit rail would eat most of a phone's width.
 */
export function TabRail({
  items,
  active,
  onSelect,
  ariaLabel,
}: {
  items: TabRailItem[];
  active: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <nav
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-2 sm:w-40 sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:border-b-0 sm:border-r"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`shrink-0 rounded px-2.5 py-2 text-left text-plate uppercase transition sm:w-full ${
              selected
                ? 'bg-signal/15 text-signal'
                : 'text-white/45 hover:bg-white/5 hover:text-white/70'
            }`}
            aria-current={selected ? 'page' : undefined}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
