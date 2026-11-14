import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { GameLogEntry } from '../game/types';
import { useGame } from '../game/store';
import { isCarried } from '../game/inventory';
import { haversine } from '../game/overpass';
import { formatClock, type ClockFormat } from '../game/survival';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';

/** An optional street scene uses the same prose and choices as story events. */
export function ActivityEventCard({ entry, clock, timeW, hang, compact }: {
  entry: GameLogEntry; clock: ClockFormat; timeW: string; hang?: CSSProperties; compact: boolean;
}) {
  const { t } = useT();
  const event = entry.activityEvent!;
  const { liveId, liveResolved, now, lat, lng, blocked, energy, cleanWater } = useGame(useShallow((s) => ({
    liveId: s.activity.event?.id, liveResolved: s.activity.event?.resolved,
    now: (s.day - 1) * 24 + s.hour, lat: s.currentPos.lat, lng: s.currentPos.lng,
    blocked: s.phase !== 'game' || !!(s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim || s.hdb || s.tunnel),
    energy: s.meters.energy,
    cleanWater: s.items.some((i) => isCarried(i.container) && i.stack > 0 && !i.contaminationRisk
      && (i.defId === 'water_bottle' || i.defId === 'newater')),
  })));
  const done = event.resolved || event.resolution || (liveId === event.id && liveResolved);
  const expired = !done && (event.expiresAt <= now || liveId !== event.id);
  const inReach = haversine(lat, lng, event.lat, event.lng) <= 120;
  const cost = event.kind === 'gunfire' ? 5 : event.kind === 'scavengers' ? 0 : 4;
  const affordable = energy >= cost && (event.kind !== 'scavengers' || cleanWater);
  const disabled = !!done || expired || blocked || !inReach || !affordable;
  const outcome = event.outcome ?? (done ? t(event.resolution === 'dismissed'
    ? 'ui.surroundings.dismissed' : 'ui.surroundings.responded') : expired ? t('ui.surroundings.expired') : null);
  return (
    <div className="min-w-0 flex-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
      data-activity-event-id={event.id} tabIndex={-1}>
      <p style={compact ? undefined : hang} className="whitespace-normal break-words text-body text-white/70">
        <span className="inline-block text-micro tabular-nums text-white/25" style={{ width: timeW, textIndent: 0 }}>{formatClock(entry.hour, clock)}</span>
        <span className="font-semibold text-concrete-50">{t(`ui.surroundings.events.${event.kind}.title`)}</span>
        {' — '}{t(`ui.surroundings.events.${event.kind}.description`)}
      </p>
      <div className="mt-1.5 flex flex-col gap-1" style={{ paddingLeft: compact ? 0 : timeW }}>
        {!compact && <>
          <button type="button" disabled={disabled} onClick={() => useGame.getState().respondToActivity(event.id)}
            className="flex w-full items-center gap-1.5 rounded border border-signal/40 px-2 py-1 text-left text-body text-signal transition hover:bg-signal/10 disabled:opacity-30">
            <Icon name="choice.pay" size={13} className="shrink-0" />
            <span>{t(`ui.surroundings.events.${event.kind}.action`)}<span className="block text-micro text-white/50">{t(`ui.surroundings.events.${event.kind}.cost`)}</span></span>
          </button>
          <button type="button" disabled={!!done || expired || blocked} onClick={() => useGame.getState().dismissActivity(event.id)}
            className="flex w-full items-center gap-1.5 rounded border border-white/15 px-2 py-1 text-left text-body text-white/60 transition hover:bg-white/5 disabled:opacity-30">
            <Icon name="choice.leave" size={13} className="shrink-0" />{t('ui.surroundings.ignore')}
          </button>
        </>}
        {outcome ? <p className="text-micro text-white/50">{outcome}</p> : !compact && (
          <p className="text-micro text-white/45">{t(blocked ? 'ui.surroundings.busy' : !inReach ? 'ui.surroundings.outOfReach' : !affordable ? 'ui.surroundings.needSupplies' : 'ui.surroundings.ignoreConsequence')}</p>
        )}
      </div>
    </div>
  );
}
