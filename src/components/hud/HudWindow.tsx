import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../../icons/Icon';
import type { IconName } from '../../icons/keys';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useT } from '../../i18n';

/**
 * A floating desktop panel that rises out of the dock. Same concrete card and
 * signal header the old slide-out used, so the look carries over; only where
 * it lives has changed. Height is capped by the row it sits in, and the body
 * scrolls.
 */
export function HudWindow({
  icon,
  title,
  widthPx,
  onClose,
  children,
}: {
  icon: IconName;
  title: ReactNode;
  /** Preferred width. The window never grows past the row it sits in. */
  widthPx: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useT();
  const reduced = useReducedMotion();
  // Mount hidden, then lift into place on the next frame.
  const [shown, setShown] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);

  return (
    <section
      className={`pointer-events-auto flex max-h-full min-h-0 min-w-0 shrink flex-col overflow-hidden rounded-lg border border-white/15 bg-concrete-900/95 shadow-signage backdrop-blur-sm transition-[opacity,transform] duration-200 ease-out ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      style={{ width: widthPx }}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <h3 className="truncate text-read font-bold text-signal">
          <Icon name={icon} /> {title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-body text-white/40 hover:text-white/70"
        >
          {t('ui.common.close')}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  );
}
