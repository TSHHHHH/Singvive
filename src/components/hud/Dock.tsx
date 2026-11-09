import { Icon } from '../../icons/Icon';
import type { IconName } from '../../icons/keys';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useT } from '../../i18n';
import { tip } from '../tips';

export interface DockItem {
  id: string;
  icon: IconName;
  label: string;
  /** Its window (or the pinned timeline) is open. */
  active: boolean;
  /** Something behind this button wants a look. */
  badge?: 'signal' | 'hiss' | null;
  /** Printed in the tooltip; the key handler lives with the owner. */
  hotkey?: string;
  onClick: () => void;
}

/** Outer width of the vertical dock, px: 36px tiles + 6px padding each side + 1px border. */
export const DOCK_WIDTH = 50;

/**
 * Desktop launcher, a column down the left edge. Every panel that used to live
 * on a rail opens from here, so the map keeps the screen and the bottom centre
 * stays free for the here / target pair. Hover nudges a tile out; an open
 * panel shows a lit bar beside its tile, the way an app dock marks a running app.
 */
export function Dock({ items }: { items: DockItem[] }) {
  const { t } = useT();
  const reduced = useReducedMotion();
  return (
    <nav
      className="pointer-events-auto box-border flex flex-col items-center gap-1 rounded-xl border border-white/15 bg-concrete-900/80 p-1.5 shadow-signage backdrop-blur-sm"
      style={{ width: DOCK_WIDTH }}
      aria-label="Dock"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          aria-pressed={item.active}
          {...tip(
            item.hotkey ? t('ui.hud.hotkey', { label: item.label, key: item.hotkey }) : item.label,
            { label: true, placement: 'right' },
          )}
          className={`group relative flex h-9 w-9 shrink-0 origin-left flex-col items-center justify-center rounded-lg border transition duration-150 ${
            reduced ? '' : 'hover:translate-x-1 hover:scale-110'
          } ${
            item.active
              ? 'border-signal/60 bg-signal/15 text-signal'
              : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:bg-white/[0.08] hover:text-concrete-50'
          }`}
        >
          <Icon name={item.icon} size={18} />
          {item.badge && (
            <span
              className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${
                item.badge === 'hiss' ? 'bg-hiss' : 'bg-signal'
              } ${reduced ? '' : 'animate-pulse'}`}
            />
          )}
          <span
            className={`absolute -left-[5px] h-4 w-0.5 rounded-full transition-opacity ${
              item.active ? 'bg-signal opacity-100' : 'opacity-0'
            }`}
          />
        </button>
      ))}
    </nav>
  );
}
