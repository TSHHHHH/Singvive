import { useEffect, useMemo, useRef } from 'react';
import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { LOG_VIEW_MODES, logViewMode, useClockFormat, useSetting, useSettings } from '../game/settings';
import { tip } from './tips';
import { EncounterPrompt } from './EncounterPrompt';
import { SearchSessionNode } from './SearchSessionNode';
import { PendingEventChoices } from './PendingEventChoices';
import type { GuideTopic } from '../content/guideContent';
import { useT } from '../i18n';
import { GroupedLogList, useActiveLogScopeKey } from './logTimeline';
import { formatClock } from '../game/survival';

/** Every control in the timeline header shares one box, so the row reads even. */
const CTRL =
  'flex h-6 w-8 shrink-0 items-center justify-center rounded border border-white/10 text-2xs leading-none transition';

/**
 * Where live interactive nodes (event / contact / search) should render.
 * Phone Map owns them during interruptions; desktop timeline always does.
 */
export type LiveNodesHost = 'timeline' | 'map';

/**
 * The run's timeline — today, and only today. Entries read oldest → newest down
 * a connecting spine. Everything from previous days is rolled into the Day Logs
 * archive so this column stays short enough to actually read; how much of
 * *today* is shown is still driven by the `logView` setting (Full / Latest /
 * Recent N). A pending event lands as a live, interactive node at the end when
 * `liveNodes` is `timeline`; otherwise the phone Map tab owns those controls.
 */
export function LogPanel({
  onOpenSettings,
  onOpenDayLogs,
  onFocusMap,
  onOpenGuide,
  liveNodes = 'timeline',
}: {
  onOpenSettings?: () => void;
  onOpenDayLogs?: () => void;
  /** Pan the map camera to a timeline focus target (e.g. intel tip). */
  onFocusMap?: (lat: number, lng: number) => void;
  onOpenGuide?: (topic: GuideTopic) => void;
  /** When `map`, hide live event / contact / search controls (phone Map owns them). */
  liveNodes?: LiveNodesHost;
}) {
  const { locale, t } = useT();
  const log = useGame((s) => s.log);
  const day = useGame((s) => s.day);
  const pending = useGame((s) => s.pendingEvent);
  const pendingSearch = useGame((s) => s.pendingSearch);
  const hdb = useGame((s) => s.hdb);
  const tunnel = useGame((s) => s.tunnel);
  const locations = useGame((s) => s.locations);
  const traveling = useGame((s) => !!s.travelAnim);
  const combatContext = useGame((s) => s.combat?.context ?? null);
  // Identity of the live search only — slot ticks must not re-pin scroll.
  const pendingSearchNonce = pendingSearch?.nonce ?? null;
  // A fight waiting on a stance is a live node at the foot of the timeline,
  // exactly like a pending event — see EncounterPrompt.
  const awaitingStance = useGame((s) => !!s.combat?.awaitingStance);

  const hour = useGame((s) => s.hour);

  const viewId = useSetting('logView');
  const clock = useClockFormat();

  // Every row hangs its wrapped lines under the text rather than under the
  // timestamp, so the prose keeps one left edge all the way down the column.
  // The gutter is just wide enough for the longest time the format can print.
  const timeW = clock === '12' ? '3.4rem' : '2.5rem';
  const hang = { paddingLeft: timeW, textIndent: `-${timeW}` };
  const setSetting = useSettings((s) => s.setSetting);
  const mode = logViewMode(viewId);

  const scrollRef = useRef<HTMLDivElement>(null);

  // `log` is capped at 4000 entries, so both passes are re-derived on every
  // render otherwise — and this panel re-renders on any store write.
  const earlierDays = useMemo(() => log.some((e) => e.day < day), [log, day]);
  // stored newest-first; show chronologically, and only what happened today
  const chronological = useMemo(
    () => log.filter((e) => e.day === day).reverse(),
    [log, day],
  );
  const total = chronological.length;
  const shown =
    mode.count === Infinity ? chronological : chronological.slice(Math.max(0, total - mode.count));
  const hiddenCount = total - shown.length;

  const ev = pending?.event;
  const showLive = liveNodes === 'timeline';
  // The newest log entry is "latest" only when there's no live node below it.
  const latestId =
    !(showLive && ev) &&
    !(showLive && awaitingStance) &&
    !(showLive && pendingSearchNonce) &&
    shown.length > 0
      ? shown[shown.length - 1].id
      : null;

  const activeKey = useActiveLogScopeKey({
    pendingSearch,
    pendingEvent: pending ? { locationId: pending.locationId } : null,
    combat: combatContext ? { context: combatContext } : null,
    hdb,
    tunnel,
    locations,
    traveling,
  });

  // Pin to the newest entry when the day/view changes or a live node appears —
  // not on every in-progress search tick (those rewrite pendingSearch often).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, pending, pendingSearchNonce, awaitingStance, viewId, day, liveNodes]);

  const hasLiveNode =
    showLive && (!!ev || awaitingStance || !!pendingSearchNonce);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-xs uppercase tracking-widest text-white/30">
          {t('ui.log.timelineDay', { day })}
        </h3>
        {/* One row of identically-sized controls — the view toggles and the two
            sheet openers all read as the same kind of thing, so they look it. */}
        <div className="flex items-center gap-1">
          {onOpenDayLogs && (
            <button
              onClick={onOpenDayLogs}
              {...tip(t('ui.log.dayLogsTitle'), { label: true })}
              className={`${CTRL} text-white/40 hover:bg-white/5 hover:text-white/70`}
            >
              <Icon name="action.dayLogs" />
            </button>
          )}
          {LOG_VIEW_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setSetting('logView', m.id)}
              {...tip(t('ui.log.showMode', { mode: m.label.toLowerCase() }))}
              className={`${CTRL} ${
                viewId === m.id
                  ? 'bg-signal/20 text-signal'
                  : 'text-white/40 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              {m.shortLabel}
            </button>
          ))}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              {...tip(t('ui.log.settings'), { label: true })}
              className={`${CTRL} text-white/40 hover:bg-white/5 hover:text-white/70`}
            >
              <Icon name="action.settings" />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pl-1.5 pr-2">
        {shown.length === 0 && !hasLiveNode ? (
          <p className="text-white/30">
            {earlierDays ? t('ui.log.freshDay') : t('ui.log.storyStarts')}
          </p>
        ) : (
          <ol className="relative flex flex-col">
            {/* connecting spine */}
            <div className="absolute bottom-2 left-[5px] top-1 w-px bg-white/10" />

            {(hiddenCount > 0 || earlierDays) && (
              <li className="relative mb-1 pl-6 text-2xs italic text-white/25">
                {hiddenCount > 0 &&
                  (hiddenCount === 1
                    ? t('ui.log.earlierHidden', { n: hiddenCount })
                    : t('ui.log.earlierHiddenPlural', { n: hiddenCount }))}
                {hiddenCount > 0 && earlierDays && ' · '}
                {earlierDays && onOpenDayLogs && (
                  <button onClick={onOpenDayLogs} className="underline hover:text-white/50">
                    {t('ui.log.previousDays')}
                  </button>
                )}
              </li>
            )}

            <GroupedLogList
              entries={shown}
              locale={locale}
              clock={clock}
              timeW={timeW}
              hang={hang}
              latestId={latestId}
              onFocusMap={onFocusMap}
              tr={t}
              activeKey={activeKey}
            />

            {showLive && ev && (
              <li className="relative flex gap-2 rounded bg-white/[0.07] py-1 pl-6">
                <span className="absolute left-0 top-[7px] h-[11px] w-[11px] animate-pulse rounded-full border-2 border-concrete-900 bg-signal" />
                <div className="min-w-0 flex-1">
                  <p
                    style={hang}
                    className="whitespace-normal break-words text-xs leading-snug text-white/70"
                  >
                    <span
                      className="inline-block font-mono text-2xs tabular-nums text-white/25"
                      style={{ width: timeW, textIndent: 0 }}
                    >
                      {formatClock(hour, clock)}
                    </span>
                    <span className="font-semibold text-concrete-50">{ev.title}</span>
                    {' — '}
                    {ev.text}
                  </p>
                  <div className="mt-1.5" style={{ paddingLeft: timeW }}>
                    <PendingEventChoices event={ev} />
                  </div>
                </div>
              </li>
            )}

            {showLive && <EncounterPrompt timeW={timeW} hang={hang} />}

            {showLive && pendingSearchNonce && (
              <SearchSessionNode timeW={timeW} hang={hang} onOpenGuide={onOpenGuide} />
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
