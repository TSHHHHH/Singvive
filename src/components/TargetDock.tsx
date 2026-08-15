import type { ReactNode } from 'react';

/**
 * Target / trek card docked to the bottom-right of the map so the travel line
 * stays visible. Sits above Leaflet's attribution strip on desktop.
 */
export function TargetDock({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[600]">
      <div
        className={
          'pointer-events-auto absolute right-3 flex w-[min(268px,calc(100%-1.5rem))] ' +
          'max-h-[min(50vh,420px)] flex-col overflow-hidden rounded-lg border ' +
          'border-white/15 bg-concrete-900/90 shadow-lg backdrop-blur-sm ' +
          // Mobile: above tab chrome. Desktop: clear the ~24px attribution bar.
          'bottom-[calc(var(--mobile-chrome-bottom)+0.5rem)] lg:bottom-8'
        }
      >
        <div
          className={
            'min-h-0 flex-1 overflow-y-auto p-2 text-white/80 ' +
            '[&_button]:py-1.5 [&_button]:text-xs'
          }
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-2xs font-semibold uppercase tracking-widest text-white/30">
              {title}
            </span>
            {onClose && (
              <button
                onClick={onClose}
                className="-my-1 shrink-0 px-1 text-xs leading-none text-white/25 hover:text-white/60"
              >
                ✕
              </button>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
