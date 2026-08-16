import type { ReactNode } from 'react';

/**
 * Tall phone overlay that replaces idle map chrome during contact, events, or
 * search. Map may peek above; bottom nav stays clear.
 */
export function MapInterruptCard({
  children,
  accent = 'signal',
}: {
  children: ReactNode;
  accent?: 'signal' | 'hiss';
}) {
  const border =
    accent === 'hiss' ? 'border-hiss/50' : 'border-white/15';

  return (
    <div
      className={`pointer-events-auto absolute left-3 right-3 z-[640] flex max-h-[min(70vh,calc(100dvh-var(--mobile-nav-h)-var(--mobile-status-bar-h)-env(safe-area-inset-bottom,0px)-1.25rem))] flex-col overflow-hidden rounded-lg border bg-concrete-900/95 shadow-signage lg:hidden ${border}`}
      style={{
        bottom:
          'calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px) + 1.75rem)',
      }}
      data-map-interrupt=""
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">{children}</div>
    </div>
  );
}
