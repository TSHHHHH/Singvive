import { useEffect, useRef } from 'react';
import { useGame } from '../game/store';
import { itemDef } from '../game/loot';
import { formatClock } from '../game/survival';
import { LOG_VIEW_MODES, logViewMode, useSetting, useSettings } from '../game/settings';

const toneClass: Record<string, string> = {
  good: 'text-toxic',
  bad: 'text-red-400',
  info: 'text-white/60',
};

const dotClass: Record<string, string> = {
  good: 'bg-toxic',
  bad: 'bg-red-400',
  info: 'bg-white/30',
};

/**
 * The run's timeline. Entries read oldest → newest down a connecting spine, each
 * stamped with the in-game day/time. How many entries are shown is driven by the
 * `logView` setting (Full / Latest / Recent N). A pending event lands as a live,
 * interactive node at the end; the most recent item is always highlighted.
 */
export function LogPanel({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const log = useGame((s) => s.log);
  const pending = useGame((s) => s.pendingEvent);
  const items = useGame((s) => s.items);
  const resolveEvent = useGame((s) => s.resolveEvent);

  const viewId = useSetting('logView');
  const setSetting = useSettings((s) => s.setSetting);
  const mode = logViewMode(viewId);

  const scrollRef = useRef<HTMLDivElement>(null);

  const chronological = [...log].reverse(); // stored newest-first; show chronologically
  const total = chronological.length;
  const shown =
    mode.count === Infinity ? chronological : chronological.slice(Math.max(0, total - mode.count));
  const hiddenCount = total - shown.length;

  const ev = pending?.event;
  // The newest log entry is "latest" only when there's no live event above it.
  const latestId = !ev && shown.length > 0 ? shown[shown.length - 1].id : null;

  // keep the newest entry (and any live event) in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, pending, viewId]);

  const hasItem = (defId?: string) =>
    !defId || items.some((i) => i.container === 'backpack' && i.defId === defId);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-xs uppercase tracking-widest text-white/30">Timeline</h3>
        <div className="flex items-center gap-1">
          {/* inline view toggle (mirrors the Settings panel) */}
          <div className="flex overflow-hidden rounded border border-white/10">
            {LOG_VIEW_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setSetting('logView', m.id)}
                title={`Show ${m.label.toLowerCase()}`}
                className={`px-1.5 py-0.5 text-[10px] transition ${
                  viewId === m.id
                    ? 'bg-toxic/20 text-toxic'
                    : 'text-white/40 hover:bg-white/5 hover:text-white/70'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title="Settings"
              className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-white/40 hover:bg-white/5 hover:text-white/70"
            >
              ⚙
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pl-1.5 pr-2">
        {shown.length === 0 && !ev ? (
          <p className="text-white/30">Your story starts here…</p>
        ) : (
          <ol className="relative flex flex-col">
            {/* connecting spine */}
            <div className="absolute bottom-2 left-[5px] top-1 w-px bg-white/10" />

            {hiddenCount > 0 && (
              <li className="relative mb-1 pl-4 text-[10px] italic text-white/25">
                …{hiddenCount} earlier {hiddenCount === 1 ? 'entry' : 'entries'} hidden
              </li>
            )}

            {shown.map((e) => {
              const isLatest = e.id === latestId;
              return (
                <li
                  key={e.id}
                  className={`relative flex gap-3 pb-3 pl-4 ${
                    isLatest ? 'rounded bg-white/[0.04]' : ''
                  }`}
                >
                  <span
                    className={`absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full border-2 border-rot-900 ${
                      dotClass[e.tone] ?? 'bg-white/30'
                    } ${isLatest ? 'ring-2 ring-toxic/60' : ''}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-white/25">
                        Day {e.day} · {formatClock(e.hour)}
                      </span>
                      {isLatest && (
                        <span className="rounded bg-toxic/20 px-1 text-[9px] font-semibold uppercase tracking-wide text-toxic">
                          Latest
                        </span>
                      )}
                    </div>
                    <div className={`whitespace-normal break-words text-[13px] leading-snug ${toneClass[e.tone] ?? 'text-white/60'}`}>
                      {e.text}
                    </div>
                  </div>
                </li>
              );
            })}

            {/* live event node — always the most recent item when present */}
            {ev && (
              <li className="relative flex gap-3 pl-4">
                <span className="absolute left-0 top-[5px] h-[11px] w-[11px] animate-pulse rounded-full border-2 border-rot-900 bg-amber-400" />
                <div className="min-w-0 flex-1 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-300">{ev.title}</span>
                    <span className="rounded bg-amber-400/20 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                      Now
                    </span>
                  </div>
                  <p className="mt-1 break-words text-[13px] leading-snug text-white/70">{ev.text}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {ev.choices.map((c) => {
                      const affordable = c.kind !== 'pay' || hasItem(c.itemId);
                      const tone =
                        c.kind === 'fight'
                          ? 'border-red-500/50 text-red-300 hover:bg-red-500/10'
                          : c.kind === 'leave'
                            ? 'border-white/15 text-white/60 hover:bg-white/5'
                            : 'border-toxic/40 text-toxic hover:bg-toxic/10';
                      return (
                        <button
                          key={c.id}
                          disabled={!affordable}
                          onClick={() => resolveEvent(c.id)}
                          className={`whitespace-normal break-words rounded border px-3 py-2 text-left text-sm transition disabled:opacity-30 ${tone}`}
                        >
                          {c.label}
                          {c.kind === 'pay' && !affordable && c.itemId && (
                            <span className="ml-1 text-[11px] text-red-400">
                              (no {itemDef(c.itemId).name})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </li>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
