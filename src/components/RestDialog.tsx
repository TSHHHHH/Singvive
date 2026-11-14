import { useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { REST_LENGTHS, type RestLength, type RestOutcome } from '../game/restPlan';
import { formatClock } from '../game/survival';
import { useClockFormat } from '../game/settings';
import { restAmbushLabel } from '../game/wilds';
import { Icon } from '../icons/Icon';
import { useT } from '../i18n';
import { ModalShell } from './ModalShell';
import { VitalMeter } from './VitalMeter';

const LENGTHS: RestLength[] = [...REST_LENGTHS, 'morning'];

function hoursLabel(hours: number, t: ReturnType<typeof useT>['t']): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return t('ui.sleep.dialog.minutes', { m });
  return m === 0 ? t('ui.sleep.dialog.hours', { h }) : t('ui.sleep.dialog.hoursMinutes', { h, m });
}

/**
 * Pick how long to sleep and see what it costs before committing. Every number
 * comes from `peekRestPlan`, the same plan `rest()` applies.
 */
export function RestDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const clock = useClockFormat();
  const peekRestPlan = useGame((s) => s.peekRestPlan);
  const rest = useGame((s) => s.rest);
  const hour = useGame((s) => s.hour);
  const [length, setLength] = useState<RestLength>(() => (hour >= 20 || hour < 6 ? 'morning' : 4));

  const plans = useMemo(
    () => Object.fromEntries(LENGTHS.map((l) => [String(l), peekRestPlan(l)])),
    [peekRestPlan],
  );
  const { preview, outcome } = plans[String(length)] as {
    preview: ReturnType<typeof peekRestPlan>['preview'];
    outcome: RestOutcome;
  };
  const canRest = outcome.hours > 0;
  const ambush = restAmbushLabel(outcome.ambushChance);

  const confirm = () => {
    onClose();
    rest(length);
  };

  return (
    <ModalShell
      title={t('ui.sleep.dialog.title')}
      onClose={onClose}
      maxWidth="md"
      footer={
        <>
          <button
            type="button"
            className="rounded px-3 py-1.5 text-body font-semibold text-white/55 hover:bg-white/5 hover:text-white/80"
            onClick={onClose}
          >
            {t('ui.common.cancel')}
          </button>
          <button
            type="button"
            disabled={!canRest}
            className="rounded bg-signal/20 px-3 py-1.5 text-body font-semibold text-signal hover:bg-signal/30 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={confirm}
          >
            <Icon name="action.sleep" />{' '}
            {canRest
              ? t('ui.sleep.dialog.confirm', { dur: hoursLabel(outcome.hours, t) })
              : t('ui.sleep.dialog.cannot')}
          </button>
        </>
      }
    >
      <div className="mb-3 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={t('ui.sleep.dialog.length')}>
        {LENGTHS.map((l) => {
          const plan = plans[String(l)];
          const active = l === length;
          return (
            <button
              key={String(l)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLength(l)}
              className={`rounded border px-1 py-1.5 text-body leading-tight transition ${
                active
                  ? 'border-signal/60 bg-signal/15 text-signal'
                  : 'border-white/15 text-white/70 hover:bg-white/5'
              }`}
            >
              <span className="block font-semibold">
                {l === 'morning' ? t('ui.sleep.dialog.morning') : hoursLabel(l, t)}
              </span>
              {l === 'morning' && (
                <span className="block text-micro text-white/45 tabular-nums">
                  {hoursLabel(plan.outcome.requestedHours, t)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-plate uppercase text-white/40">{t('ui.sleep.dialog.wake')}</span>
        <span className="text-body font-bold tabular-nums text-white/85">
          {t('ui.clock.day', { day: outcome.endDay })} · {formatClock(outcome.endHour, clock)}
        </span>
      </div>

      {outcome.wokeBy && (
        <p className="mb-2 rounded border border-hiss/30 bg-hiss/10 px-2 py-1.5 text-body text-hiss">
          {canRest
            ? t(`ui.sleep.dialog.woke.${outcome.wokeBy}`, { dur: hoursLabel(outcome.hours, t) })
            : t(`ui.sleep.dialog.blocked.${outcome.wokeBy === 'blood' ? 'blood' : 'meters'}`)}
        </p>
      )}

      <section
        aria-label={t('ui.dock.vitals')}
        className="rounded-lg border border-white/15 bg-black/15 p-2.5"
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <VitalMeter label={t('ui.condition.health')} icon="meter.health" value={outcome.hpBefore} preview={outcome.hpAfter} max={outcome.hpMax} />
          <VitalMeter label={t('ui.condition.energy')} icon="meter.energy" value={outcome.before.energy} preview={outcome.after.energy} />
          <VitalMeter label={t('ui.dock.food')} icon="meter.hunger" value={outcome.before.hunger} preview={outcome.after.hunger} />
          <VitalMeter label={t('ui.dock.water')} icon="meter.thirst" value={outcome.before.thirst} preview={outcome.after.thirst} />
          {outcome.infectionDelta > 0 && (
            <VitalMeter
              label={t('ui.condition.infection')}
              icon="meter.infection"
              value={outcome.before.infection}
              preview={outcome.before.infection + outcome.infectionDelta}
              goodWhenUp={false}
            />
          )}
        </div>
      </section>

      <div className="mt-3 border-t border-white/10 pt-2">
        <div className="flex items-baseline justify-between gap-2 text-body">
          <span className="text-white/55">{t('ui.sleep.dialog.ambush')}</span>
          <span className="font-bold tabular-nums" style={{ color: ambush.color }}>
            {outcome.ambushChance <= 0 ? t('ui.sleep.safe') : `${Math.round(outcome.ambushChance * 100)}%`}
          </span>
        </div>
        {outcome.collapseChance > 0 && (
          <div className="flex items-baseline justify-between gap-2 text-body">
            <span className="text-white/55">{t('ui.sleep.dialog.collapse')}</span>
            <span className="font-bold tabular-nums text-hiss">
              {Math.round(outcome.collapseChance * 100)}%
            </span>
          </div>
        )}
        <p className="mt-1 text-micro text-white/45">
          {t('ui.sleep.dialog.recovery', { pct: Math.round(preview.conditions.recoveryMult * 100) })}
        </p>
      </div>
    </ModalShell>
  );
}
