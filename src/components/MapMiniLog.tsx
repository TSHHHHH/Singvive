import { useGame } from '../game/store';
import { formatClock } from '../game/survival';
import { useClockFormat } from '../game/settings';

const toneClass: Record<string, string> = {
  good: 'text-signal',
  bad: 'text-hiss',
  info: 'text-white/60',
};

/**
 * Phone map chrome: the two newest events for today, above the bottom nav.
 * Tap opens the full Timeline tab.
 */
export function MapMiniLog({
  onOpenLog,
  aboveHereBar = false,
}: {
  onOpenLog: () => void;
  /** When the here bar is showing, sit above it; otherwise clear the nav only. */
  aboveHereBar?: boolean;
}) {
  const log = useGame((s) => s.log);
  const day = useGame((s) => s.day);
  const clock = useClockFormat();
  const entries = log.filter((e) => e.day === day).slice(0, 2);

  const bottom = aboveHereBar
    ? 'calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px) + var(--mobile-here-bar-h) + 0.75rem)'
    : 'calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px) + 0.5rem)';

  return (
    <button
      type="button"
      onClick={onOpenLog}
      className="pointer-events-auto absolute left-3 right-3 z-[640] rounded-lg border border-white/15 bg-concrete-900/95 px-2.5 py-1.5 text-left shadow-signage lg:hidden"
      style={{
        bottom,
        minHeight: 'var(--mobile-mini-log-h)',
      }}
      aria-label="Open log"
    >
      {entries.length === 0 ? (
        <div className="text-2xs text-white/35">Nothing logged yet</div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {entries.map((e) => (
            <div
              key={e.id}
              className={`truncate text-2xs leading-snug ${toneClass[e.tone] ?? toneClass.info}`}
            >
              <span className="mr-1.5 tabular-nums text-white/35">
                {formatClock(e.hour, clock)}
              </span>
              {e.text}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
