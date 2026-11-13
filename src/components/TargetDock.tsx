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
  /**
   * See-through, for a card floating over the map (`MapCallouts`): the ground
   * behind it stays legible as shapes while the blur keeps the text on top
   * readable. Firms up under the pointer or keyboard focus.
   */
  glass?: boolean;
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
  glass = false,
}: CardProps) {
  const { t } = useT();
  const shut = !!(collapsed && onToggleCollapse);
  return (
    <div
      className={
        'pointer-events-auto flex max-h-[min(50vh,420px)] flex-col overflow-hidden rounded-lg border ' +
        (glass ? 'hud-glass border-white/20 ' : 'border-white/15 bg-concrete-900/95 ') +
        'shadow-signage ' +
        className
      }
    >
      <div
        className={
          'min-h-0 flex-1 overflow-y-auto p-3 text-concrete-50'
        }
      >
        <div className={`flex items-center justify-between gap-2 ${shut ? '' : 'mb-2'}`}>
          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!shut}
              className="-my-1 flex min-w-0 items-center gap-1.5 py-1 text-left text-label uppercase text-concrete-400 hover:text-concrete-50"
            >
              <span className="truncate">{title}</span>
              <span className="shrink-0 text-concrete-400" aria-hidden>
                {shut ? '▴' : '▾'}
              </span>
              <span className="sr-only">{shut ? t('ui.hud.expand') : t('ui.hud.collapse')}</span>
            </button>
          ) : (
            <span className="text-label uppercase text-concrete-400">{title}</span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              aria-label={t('ui.hud.close')}
              className="-my-1 shrink-0 px-1 py-1 text-body leading-none text-concrete-400 hover:text-concrete-50"
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
