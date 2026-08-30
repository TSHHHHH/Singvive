import { useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { useClockFormat } from '../game/settings';
import type { GameLogEntry } from '../game/types';
import { useT } from '../i18n';
import { GroupedLogList } from './logTimeline';

/** Group the flat timeline into days, newest day first, entries chronological. */
function groupByDay(log: GameLogEntry[]): { day: number; entries: GameLogEntry[] }[] {
  const byDay = new Map<number, GameLogEntry[]>();
  for (const e of log) {
    const arr = byDay.get(e.day);
    if (arr) arr.push(e);
    else byDay.set(e.day, [e]);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([day, entries]) => ({
      day,
      // The store keeps the log newest-first; a day reads best oldest-first.
      entries: [...entries].sort((a, b) => a.id - b.id),
    }));
}

/**
 * Every day the run has lived through, kept out of the Timeline so that column
 * only ever shows today. Days open one at a time — the newest is open on entry.
 */
export function DayLogsModal({ onClose }: { onClose: () => void }) {
  const { locale, t } = useT();
  const log = useGame((s) => s.log);
  const currentDay = useGame((s) => s.day);
  const clock = useClockFormat();

  const days = useMemo(() => groupByDay(log), [log]);
  const [openDay, setOpenDay] = useState<number | null>(days[0]?.day ?? null);

  const timeW = clock === '12' ? '3.4rem' : '2.5rem';
  const hang = { paddingLeft: timeW, textIndent: `-${timeW}` };

  return (
    <div
      className="absolute inset-0 z-[1200] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88%] w-full max-w-lg flex-col rounded-xl border border-white/15 bg-concrete-900 shadow-signage"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-4">
          <h3 className="text-sm font-bold text-signal">
            <Icon name="action.dayLogs" /> {t('ui.log.dayLogs')}
          </h3>
          <button onClick={onClose} className="text-xs text-white/40 hover:text-white/70">
            {t('ui.common.close')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {days.length === 0 ? (
            <p className="p-4 text-center text-sm text-white/30">{t('ui.log.nothingRecorded')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {days.map(({ day, entries }) => {
                const open = openDay === day;
                const bad = entries.filter((e) => e.tone === 'bad').length;
                const hauls = entries.reduce((n, e) => n + (e.loot?.length ?? 0), 0);
                return (
                  <li
                    key={day}
                    className={`overflow-hidden rounded-lg border ${
                      open ? 'border-signal/30 bg-white/[0.03]' : 'border-white/10'
                    }`}
                  >
                    <button
                      onClick={() => setOpenDay(open ? null : day)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-white/5"
                    >
                      <span className="text-sm font-semibold">
                        {t('ui.log.dayN', { day })}
                        {day === currentDay && (
                          <span className="ml-2 rounded bg-signal/20 px-1 text-2xs font-semibold uppercase tracking-wide text-signal">
                            {t('ui.log.today')}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-white/35">
                        <span>
                          {entries.length === 1
                            ? t('ui.log.entry', { n: entries.length })
                            : t('ui.log.entries', { n: entries.length })}
                        </span>
                        {hauls > 0 && (
                          <span className="text-signal/60">{t('ui.log.hauls', { n: hauls })}</span>
                        )}
                        {bad > 0 && (
                          <span className="text-hiss/70">{t('ui.log.bad', { n: bad })}</span>
                        )}
                        <span className="text-white/25">{open ? '▾' : '▸'}</span>
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-white/10 px-2 py-2">
                        <GroupedLogList
                          entries={entries}
                          locale={locale}
                          clock={clock}
                          timeW={timeW}
                          hang={hang}
                          latestId={null}
                          tr={t}
                          activeKey={null}
                          compact
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
