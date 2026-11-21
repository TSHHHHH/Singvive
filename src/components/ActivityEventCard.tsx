import type { CSSProperties } from 'react';
import type { GameLogEntry } from '../game/types';
import { formatClock, type ClockFormat } from '../game/survival';
import { useT } from '../i18n';

/**
 * Street scenes from older saves were answered from a card inside the
 * timeline. They are story events now (see streetScenes.ts); old rows stay as
 * read-only history.
 */
export function ActivityEventCard({ entry, clock, timeW, hang, compact }: {
  entry: GameLogEntry; clock: ClockFormat; timeW: string; hang?: CSSProperties; compact: boolean;
}) {
  const { t } = useT();
  const event = entry.activityEvent!;
  const outcome = event.outcome ?? t(event.resolution === 'responded'
    ? 'ui.surroundings.responded' : event.resolution === 'dismissed'
      ? 'ui.surroundings.dismissed' : 'ui.surroundings.expired');
  return (
    <div className="min-w-0 flex-1" data-activity-event-id={event.id}>
      <p style={compact ? undefined : hang} className="whitespace-normal break-words text-body text-white/70">
        <span className="inline-block text-micro tabular-nums text-white/25" style={{ width: timeW, textIndent: 0 }}>{formatClock(entry.hour, clock)}</span>
        <span className="font-semibold text-concrete-50">{t(`ui.surroundings.events.${event.kind}.title`)}</span>
        {' — '}{t(`ui.surroundings.events.${event.kind}.description`)}
      </p>
      {!compact && <p className="mt-1 text-micro text-white/50" style={{ paddingLeft: timeW }}>{outcome}</p>}
    </div>
  );
}
