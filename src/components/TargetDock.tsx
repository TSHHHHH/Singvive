import type { ReactNode } from 'react';
import { useT } from '../i18n';

interface CardProps {
  title: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  /** Shrunk to its title line. Only meaningful with `onToggleCollapse`. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

/**
 * The here / target card itself, without placement. Desktop lays two of them
 * side by side at bottom centre (`RoutePair`); the phone docks one to a corner
 * through `TargetDock`.
 *
 * Wide enough for hospital names and faction outpost labels without ellipsis.
 */
export function HudCard({
  title,
  onClose,
  children,
  collapsed,
  onToggleCollapse,
  className = '',
}: CardProps) {
  const { t } = useT();
  const shut = !!(collapsed && onToggleCollapse);
  return (
    <div
      className={
        'pointer-events-auto flex max-h-[min(50vh,420px)] flex-col overflow-hidden rounded-lg border ' +
        'border-white/15 bg-concrete-900/95 shadow-signage ' +
        className
      }
    >
      <div
        className={
          'min-h-0 flex-1 overflow-y-auto p-2.5 text-white/80 ' +
          '[&_button]:py-1.5 [&_button]:text-body'
        }
      >
        <div className={`flex items-center justify-between gap-2 ${shut ? '' : 'mb-1.5'}`}>
          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!shut}
              className="-my-1 flex min-w-0 items-center gap-1.5 text-left text-label uppercase text-white/30 hover:text-white/60"
            >
              <span className="truncate">{title}</span>
              <span className="shrink-0 text-white/25" aria-hidden>
                {shut ? '▴' : '▾'}
              </span>
              <span className="sr-only">{shut ? t('ui.hud.expand') : t('ui.hud.collapse')}</span>
            </button>
          ) : (
            <span className="text-label uppercase text-white/30">{title}</span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="-my-1 shrink-0 px-1 text-body leading-none text-white/25 hover:text-white/60"
            >
              ✕
            </button>
          )}
        </div>
        {!shut && children}
      </div>
    </div>
  );
}

/** Phone: the target card docked bottom-right, above the tab chrome. */
export function TargetDock(props: CardProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[600]">
      <HudCard
        {...props}
        className="absolute bottom-[calc(var(--mobile-chrome-bottom)+0.5rem)] right-3 w-[min(20.5rem,calc(100%-1.5rem))]"
      />
    </div>
  );
}
