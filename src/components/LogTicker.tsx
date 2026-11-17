import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { useShownLog } from '../ui/diceGate';
import { useClockFormat } from '../game/settings';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useT } from '../i18n';
import { LogEntryBody } from './logTimeline';
import { scheduleChain } from './tickerSequence';
import { tip } from './tips';

/** How many of today's newest lines the ticker holds. */
const TICKER_ROWS = 4;
/** A line stays readable this long after it lands, then fades out. */
const TICKER_HOLD_MS = 8000;

/**
 * Newest log id the ticker has had on screen this page. The ticker unmounts
 * while the full timeline is open (a fight, an event); lines that landed in
 * the meantime are newer than this and flash when it comes back. Ids only
 * grow within a page, so a plain high-water mark is enough. Null until the
 * first mount: a fresh page load replays nothing.
 */
let shownUpTo: number | null = null;

/**
 * Desktop, timeline collapsed: the newest few lines of today float over the
 * top-right of the map and fade once read. Hover brings the lot back; the
 * button above them opens the full timeline. Rows reuse the timeline's own
 * compact renderer so the two never drift apart.
 */
export function LogTicker({
  onExpand,
  onFocusMap,
}: {
  onExpand: () => void;
  onFocusMap?: (lat: number, lng: number) => void;
}) {
  const { locale, t } = useT();
  const log = useShownLog();
  const day = useGame((s) => s.day);
  const clock = useClockFormat();
  const reduced = useReducedMotion();

  // Stored newest-first: the head of the list is what just happened. Take a
  // few extra so a chain longer than the ticker still plays through it.
  const pool = useMemo(
    () =>
      log
        .slice(0, TICKER_ROWS * 3)
        .filter((e) => e.day === day)
        .slice(0, TICKER_ROWS * 2)
        .reverse(),
    [log, day],
  );

  // When each id appears here. On mount, lines the ticker already showed (or
  // everything, on a page load) count as old news; lines that landed while
  // the full timeline had the slot replay as a chain like any other.
  const seen = useRef<Map<number, number> | null>(null);
  const animate = useRef(new Set<number>());
  const cursor = useRef(-Infinity);
  const [now, setNow] = useState(() => Date.now());
  if (seen.current === null) {
    const mark = shownUpTo;
    seen.current = new Map(pool.filter((e) => mark === null || e.id <= mark).map((e) => [e.id, 0]));
  }
  const arrived: Map<number, number> = seen.current;
  // New lines play in order, one after another, so a chain of events reads
  // cause then effect instead of landing as one block.
  const incoming = pool.filter((e) => !arrived.has(e.id));
  if (incoming.length > 0) {
    const plan = scheduleChain(incoming.length, Date.now(), cursor.current, { reduced });
    incoming.forEach((e, i) => {
      arrived.set(e.id, plan.starts[i]);
      if (!reduced) animate.current.add(e.id);
    });
    cursor.current = plan.cursor;
  }
  const newestId = log.length > 0 ? log[0].id : 0;
  useEffect(() => {
    shownUpTo = Math.max(shownUpTo ?? 0, newestId);
  }, [newestId]);

  // Only lines whose turn has come take a slot, so each one slides in at the
  // bottom as the oldest steps off the top.
  const rows = pool.filter((e) => (arrived.get(e.id) ?? 0) <= now).slice(-TICKER_ROWS);

  // Re-render when the next queued line is due, or the next fresh line is
  // due to fade. Fades follow the same order, oldest first.
  const nextTick = pool.reduce((m, e) => {
    const at = arrived.get(e.id) ?? 0;
    if (at > now) return Math.min(m, at);
    const fade = at + TICKER_HOLD_MS;
    return fade > now ? Math.min(m, fade) : m;
  }, Infinity);
  useEffect(() => {
    if (nextTick === Infinity) return;
    const id = window.setTimeout(() => setNow(Date.now()), Math.max(0, nextTick - Date.now()) + 30);
    return () => window.clearTimeout(id);
  }, [nextTick]);
  // A new line arriving restarts the clock so it reads as fresh.
  useEffect(() => {
    setNow(Date.now());
  }, [pool]);

  const timeW = clock === '12' ? '3.4rem' : '2.5rem';

  return (
    <div className="group pointer-events-none flex w-full flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={onExpand}
        {...tip(t('ui.log.expandTicker'), { label: true, placement: 'left' })}
        className="pointer-events-auto rounded border border-white/15 bg-concrete-900/80 px-2 py-1 text-label uppercase text-white/50 shadow-signage backdrop-blur-sm transition hover:border-signal/50 hover:text-signal"
      >
        {t('ui.log.timelineDay', { day })}
      </button>
      {rows.length > 0 && (
        <ol className="flex w-full flex-col gap-1">
          {rows.map((e) => {
            const fresh = now - (arrived.get(e.id) ?? 0) < TICKER_HOLD_MS;
            return (
              <li
                key={e.id}
                className={`rounded border border-white/10 bg-concrete-900/75 px-2 py-1 shadow-signage backdrop-blur-sm ${
                  animate.current.has(e.id) ? 'ticker-line-in' : ''
                } ${
                  reduced ? '' : 'transition-opacity duration-700'
                } ${
                  fresh
                    ? 'pointer-events-auto opacity-100'
                    : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
                }`}
              >
                <LogEntryBody
                  e={e}
                  locale={locale}
                  clock={clock}
                  timeW={timeW}
                  onFocusMap={onFocusMap}
                  tr={t}
                  compact
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
