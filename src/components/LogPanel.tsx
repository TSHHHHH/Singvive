import { useEffect, useRef } from 'react';
import { useGame } from '../game/store';
import { itemDef } from '../game/loot';
import { Icon } from '../icons/Icon';
import { formatClock } from '../game/survival';
import { LOG_VIEW_MODES, logViewMode, useClockFormat, useSetting, useSettings } from '../game/settings';
import { itemIcon } from './Inventory/itemIcon';
import { ATTRIBUTE_ICONS, ATTRIBUTE_LABELS } from '../game/character';
import type { ChoiceKind } from '../game/events';
import type { IconName } from '../icons/keys';
import { EncounterPrompt } from './EncounterPrompt';
import { SearchSessionNode } from './SearchSessionNode';
import { highlightLogText } from './logHighlight';

const toneClass: Record<string, string> = {
  good: 'text-signal',
  bad: 'text-hiss',
  info: 'text-white/60',
};

/** Every control in the timeline header shares one box, so the row reads even. */
const CTRL =
  'flex h-6 w-8 shrink-0 items-center justify-center rounded border border-white/10 text-2xs leading-none transition';

/** One glyph per kind of choice, so a decision reads before it's read. */
const CHOICE_ICON: Record<ChoiceKind, IconName> = {
  check: 'choice.check',
  pay: 'choice.pay',
  fight: 'choice.fight',
  leave: 'choice.leave',
};

const dotClass: Record<string, string> = {
  good: 'bg-signal',
  bad: 'bg-hiss',
  info: 'bg-white/30',
};

/**
 * The run's timeline — today, and only today. Entries read oldest → newest down
 * a connecting spine. Everything from previous days is rolled into the Day Logs
 * archive so this column stays short enough to actually read; how much of
 * *today* is shown is still driven by the `logView` setting (Full / Latest /
 * Recent N). A pending event lands as a live, interactive node at the end; the
 * most recent item is always highlighted.
 */
export function LogPanel({
  onOpenSettings,
  onOpenDayLogs,
  onFocusMap,
}: {
  onOpenSettings?: () => void;
  onOpenDayLogs?: () => void;
  /** Pan the map camera to a timeline focus target (e.g. intel tip). */
  onFocusMap?: (lat: number, lng: number) => void;
}) {
  const log = useGame((s) => s.log);
  const day = useGame((s) => s.day);
  const pending = useGame((s) => s.pendingEvent);
  const pendingSearch = useGame((s) => s.pendingSearch);
  const items = useGame((s) => s.items);
  const resolveEvent = useGame((s) => s.resolveEvent);
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

  const earlierDays = log.some((e) => e.day < day);
  // stored newest-first; show chronologically, and only what happened today
  const chronological = log.filter((e) => e.day === day).reverse();
  const total = chronological.length;
  const shown =
    mode.count === Infinity ? chronological : chronological.slice(Math.max(0, total - mode.count));
  const hiddenCount = total - shown.length;

  const ev = pending?.event;
  // The newest log entry is "latest" only when there's no live node below it.
  const latestId =
    !ev && !awaitingStance && !pendingSearch && shown.length > 0
      ? shown[shown.length - 1].id
      : null;

  // keep the newest entry (and any live node) in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, pending, pendingSearch, awaitingStance, viewId, day]);

  const hasItem = (defId?: string) =>
    !defId || items.some((i) => i.container === 'backpack' && i.defId === defId);

  const hasLiveNode = !!ev || awaitingStance || !!pendingSearch;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-xs uppercase tracking-widest text-white/30">
          Timeline <span className="text-white/20">· day {day}</span>
        </h3>
        {/* One row of identically-sized controls — the view toggles and the two
            sheet openers all read as the same kind of thing, so they look it. */}
        <div className="flex items-center gap-1">
          {onOpenDayLogs && (
            <button
              onClick={onOpenDayLogs}
              title="Day logs — every previous day"
              className={`${CTRL} text-white/40 hover:bg-white/5 hover:text-white/70`}
            >
              <Icon name="action.dayLogs" />
            </button>
          )}
          {LOG_VIEW_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setSetting('logView', m.id)}
              title={`Show ${m.label.toLowerCase()}`}
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
              title="Settings"
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
            {earlierDays ? 'A fresh day. Nothing has happened yet.' : 'Your story starts here…'}
          </p>
        ) : (
          <ol className="relative flex flex-col">
            {/* connecting spine */}
            <div className="absolute bottom-2 left-[5px] top-1 w-px bg-white/10" />

            {(hiddenCount > 0 || earlierDays) && (
              <li className="relative mb-1 pl-6 text-2xs italic text-white/25">
                {hiddenCount > 0 &&
                  `…${hiddenCount} earlier ${hiddenCount === 1 ? 'entry' : 'entries'} today hidden`}
                {hiddenCount > 0 && earlierDays && ' · '}
                {earlierDays && onOpenDayLogs && (
                  <button onClick={onOpenDayLogs} className="underline hover:text-white/50">
                    previous days in Day logs
                  </button>
                )}
              </li>
            )}

            {shown.map((e) => {
              const isLatest = e.id === latestId;
              return (
                // The newest entry is called out by its background alone — a
                // "latest" badge said the same thing a second time, and the
                // timeline is read top-down anyway.
                <li
                  key={e.id}
                  className={`relative flex gap-2 py-1 pl-6 ${
                    isLatest ? 'rounded bg-white/[0.07]' : ''
                  }`}
                >
                  <span
                    className={`absolute left-0 top-[7px] h-[11px] w-[11px] rounded-full border-2 border-concrete-900 ${
                      dotClass[e.tone] ?? 'bg-white/30'
                    } ${isLatest ? 'ring-2 ring-signal/60' : ''}`}
                  />
                  <div className="min-w-0 flex-1">
                    {/* Time and entry share a line: the log is long and the
                        column is narrow, so a whole row per timestamp was the
                        most expensive whitespace on screen. */}
                    <p
                      style={hang}
                      className={`whitespace-normal break-words text-xs leading-snug ${
                        toneClass[e.tone] ?? 'text-white/60'
                      }`}
                    >
                      <span
                        className="inline-block font-mono text-2xs tabular-nums text-white/25"
                        // text-indent inherits, and an inline-block is a block
                        // container — without this reset the hanging indent
                        // above drags the time out of its own box and the
                        // column clips it.
                        style={{ width: timeW, textIndent: 0 }}
                      >
                        {formatClock(e.hour, clock)}
                      </span>
                      {highlightLogText(e.text)}
                    </p>
                    {e.focus && onFocusMap && (
                      <div style={{ paddingLeft: timeW }} className="mt-1">
                        <button
                          type="button"
                          onClick={() => onFocusMap(e.focus!.lat, e.focus!.lng)}
                          className="rounded border border-signal/40 bg-signal/10 px-2 py-0.5 text-2xs text-signal hover:bg-signal/20"
                        >
                          Show on map{e.focus.label ? ` · ${e.focus.label}` : ''}
                        </button>
                      </div>
                    )}
                    {/* a haul reads inline, in the timeline — no popup to
                        dismiss. Indented to the text, not the timestamp, so the
                        haul lines up with the sentence that earned it. */}
                    {e.loot && e.loot.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-px" style={{ paddingLeft: timeW }}>
                        {e.loot.map((s, i) => {
                          const def = itemDef(s.defId);
                          return (
                            <li
                              key={i}
                              className="flex items-center gap-1.5 border-l border-white/15 bg-white/[0.04] px-2 py-0.5 text-xs"
                            >
                              <Icon name={itemIcon(def)} size={13} className="shrink-0" />
                              <span className="min-w-0 flex-1 truncate text-concrete-200">
                                {def.name}
                              </span>
                              <span className="shrink-0 tabular-nums text-signal">×{s.count}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {e.leftover && e.leftover.length > 0 && (
                      <div className="mt-1 text-2xs text-hiss" style={{ paddingLeft: timeW }}>
                        Pack full — left behind{' '}
                        {e.leftover.map((s) => `${itemDef(s.defId).name} ×${s.count}`).join(', ')}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}

            {/* live event node — always the most recent item when present */}
            {ev && (
              // The live event is a timeline row like any other — same
              // timestamp, same hanging indent, same "this is the newest thing"
              // background. It used to be a bordered card at a larger type
              // size, which made the whole column lurch every time one landed.
              // The pulsing dot and the choices are enough to say it's live.
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
                  {/* Lined up under the text, so the choices read as belonging
                      to it rather than as a panel of their own. */}
                  <div className="mt-1.5 flex flex-col gap-1" style={{ paddingLeft: timeW }}>
                    {ev.choices.map((c) => {
                      // A pay choice lists everything they'd take; holding any
                      // one of them is enough.
                      const affordable =
                        c.kind !== 'pay' || !!c.itemIds?.some((id) => hasItem(id));
                      const tone =
                        c.kind === 'fight'
                          ? 'border-hiss/50 text-hiss hover:bg-hiss/10'
                          : c.kind === 'leave'
                            ? 'border-white/15 text-white/60 hover:bg-white/5'
                            : 'border-signal/40 text-signal hover:bg-signal/10';
                      // The roll used to be spelled out inside the label. It's
                      // the price of the choice, not part of the sentence, so
                      // it sits at the far end where prices go — the same place
                      // a haul puts its count.
                      const check =
                        c.kind === 'check' && c.attr && c.dc != null
                          ? { attr: c.attr, dc: c.dc }
                          : null;
                      return (
                        <button
                          key={c.id}
                          disabled={!affordable}
                          onClick={() => resolveEvent(c.id)}
                          className={`flex w-full items-center gap-1.5 rounded border px-2 py-1 text-left text-xs leading-snug transition disabled:opacity-30 ${tone}`}
                        >
                          <Icon name={CHOICE_ICON[c.kind]} size={13} className="shrink-0" />
                          <span className="min-w-0 flex-1 whitespace-normal break-words">
                            {c.label}
                            {c.kind === 'pay' && !affordable && (
                              <span className="ml-1 text-hiss">(you have none)</span>
                            )}
                          </span>
                          {check && (
                            <span className="inline-flex shrink-0 items-center gap-1 tabular-nums opacity-60">
                              <Icon
                                name={ATTRIBUTE_ICONS[check.attr]}
                                size={12}
                                title={ATTRIBUTE_LABELS[check.attr]}
                              />
                              DC {check.dc}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </li>
            )}

            {/* Contact node — the fight's opening decision, sharing the spine
                and the gutter with everything else that happened today. */}
            <EncounterPrompt timeW={timeW} hang={hang} />

            {/* Sequential search — fogged stash grid at the foot of the day. */}
            {pendingSearch && <SearchSessionNode timeW={timeW} hang={hang} />}
          </ol>
        )}
      </div>
    </div>
  );
}
