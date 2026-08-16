import { POI_CONFIG } from '../game/poi';
import { useGame } from '../game/store';
import { formatClock } from '../game/survival';
import { useClockFormat } from '../game/settings';
import { Icon } from '../icons/Icon';
import type { LocationState } from '../game/types';

const toneClass: Record<string, string> = {
  good: 'text-signal',
  bad: 'text-hiss',
  info: 'text-white/60',
};

const ICON_BTN =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded border text-sm transition disabled:opacity-30';

/**
 * Phone map idle chrome: two newest log lines + compact "here" row with
 * icon-only actions. Interrupted moments (combat / event / search) replace
 * this strip entirely — see GameScreen's map chrome priority.
 */
export function MapHereChrome({
  sel,
  atEvac,
  onOpenLog,
  onOpenHere,
  onSearch,
  onOpenStash,
  onEvac,
}: {
  /** Current POI when standing at a site; omit on open ground. */
  sel?: LocationState;
  atEvac?: boolean;
  onOpenLog: () => void;
  onOpenHere?: () => void;
  onSearch?: () => void;
  onOpenStash?: () => void;
  onEvac?: () => void;
}) {
  const log = useGame((s) => s.log);
  const day = useGame((s) => s.day);
  const clock = useClockFormat();
  const entries = log.filter((e) => e.day === day).slice(0, 2);

  const occupied = !!sel?.factionId;
  const primaryTitle = atEvac
    ? 'Call for evac'
    : occupied
      ? 'Approach the gate'
      : sel?.exhausted
        ? 'Nothing left'
        : 'Go inside and search';

  return (
    <div
      className="pointer-events-auto absolute left-3 right-3 z-[640] flex flex-col overflow-hidden rounded-lg border border-white/15 bg-concrete-900/95 shadow-signage lg:hidden"
      style={{
        bottom:
          'calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px) + 1.75rem)',
        minHeight: 'var(--mobile-map-chrome-h)',
      }}
    >
      <button
        type="button"
        onClick={onOpenLog}
        className="w-full border-b border-white/10 px-2.5 py-1.5 text-left"
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

      {sel && (
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <button
            type="button"
            onClick={onOpenHere}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-label={`Open ${sel.name}`}
          >
            <Icon name={POI_CONFIG[sel.category].icon} size={18} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{sel.name}</div>
              <div className="text-xs text-signal/70">
                <Icon name="action.here" /> here
              </div>
            </div>
          </button>

          {atEvac ? (
            <button
              type="button"
              onClick={onEvac}
              title={primaryTitle}
              aria-label={primaryTitle}
              className={`${ICON_BTN} border-signal/50 bg-signal/80 text-black`}
            >
              <Icon name="action.evac" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onSearch}
                disabled={!occupied && !!sel.exhausted}
                title={primaryTitle}
                aria-label={primaryTitle}
                className={`${ICON_BTN} border-signal/50 bg-signal/80 text-black`}
              >
                <Icon name="action.search" />
              </button>
              <button
                type="button"
                onClick={onOpenStash}
                title="Open stash here"
                aria-label="Open stash here"
                className={`${ICON_BTN} border-white/15 text-white/80 hover:bg-white/5`}
              >
                <Icon name="action.stash" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
