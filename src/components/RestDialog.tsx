import { useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { REST_LENGTHS, REST_WAKE_FLOOR, type RestLength, type RestOutcome } from '../game/restPlan';
import { formatClock } from '../game/survival';
import { useClockFormat } from '../game/settings';
import { restAmbushLabel } from '../game/wilds';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { useT } from '../i18n';
import { ModalShell } from './ModalShell';

const LENGTHS: RestLength[] = [...REST_LENGTHS, 'morning'];

function hoursLabel(hours: number, t: ReturnType<typeof useT>['t']): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return t('ui.sleep.dialog.minutes', { m });
  return m === 0 ? t('ui.sleep.dialog.hours', { h }) : t('ui.sleep.dialog.hoursMinutes', { h, m });
}

const GAIN = '#5fbf6a';
const LOSS = '#d9542b';

/**
 * Before → after as a meter: the part you keep in the meter's colour, what the
 * rest adds as a bright green segment, what it costs as a red hatched one.
 */
function Row({
  icon,
  label,
  from,
  to,
  max = 100,
  color,
  goodWhenUp = true,
  floor,
}: {
  icon: IconName;
  label: string;
  from: number;
  to: number;
  max?: number;
  color: string;
  goodWhenUp?: boolean;
  /** Draw the starving line on the track. */
  floor?: number;
}) {
  const a = Math.round(from);
  const b = Math.round(to);
  const diff = b - a;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  const lo = pct(Math.min(from, to));
  const hi = pct(Math.max(from, to));
  const good = diff === 0 ? null : diff > 0 === goodWhenUp;
  const deltaColor = good === null ? 'rgba(255,255,255,0.35)' : good ? GAIN : LOSS;
  const rising = to > from;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 text-body">
        <span className="flex items-center gap-1.5 text-white/70">
          <Icon name={icon} /> {label}
        </span>
        <span className="flex items-center gap-2 tabular-nums">
          <span className="text-white/45">{a}</span>
          <span className="text-white/30">→</span>
          <span className="font-bold text-white/90">{b}</span>
          <span
            className="min-w-[3.25rem] rounded px-1.5 py-0.5 text-center text-body font-bold"
            style={{ color: deltaColor, backgroundColor: good === null ? 'rgba(255,255,255,0.06)' : `${deltaColor}26` }}
          >
            {diff > 0 ? `▲ ${diff}` : diff < 0 ? `▼ ${-diff}` : '±0'}
          </span>
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-sm bg-white/[0.07]" aria-hidden>
        <div className="absolute inset-y-0 left-0" style={{ width: `${lo}%`, backgroundColor: color, opacity: 0.55 }} />
        {hi > lo && (
          <div
            className="absolute inset-y-0"
            style={
              rising
                ? {
                    left: `${lo}%`,
                    width: `${hi - lo}%`,
                    backgroundColor: deltaColor,
                    boxShadow: `0 0 8px ${deltaColor}`,
                  }
                : {
                    left: `${lo}%`,
                    width: `${hi - lo}%`,
                    backgroundImage: `repeating-linear-gradient(135deg, ${deltaColor} 0 3px, transparent 3px 6px)`,
                    outline: `1px solid ${deltaColor}`,
                    outlineOffset: '-1px',
                  }
            }
          />
        )}
        {floor != null && (
          <div className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-hiss" style={{ left: `${pct(floor)}%` }} />
        )}
      </div>
    </li>
  );
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

      <ul className="flex flex-col gap-2.5">
        <Row icon="meter.energy" label={t('ui.condition.energy')} from={outcome.before.energy} to={outcome.after.energy} color="#e8e5dd" />
        <Row icon="meter.health" label={t('ui.condition.health')} from={outcome.hpBefore} to={outcome.hpAfter} max={outcome.hpMax} color="#d92d2d" />
        <Row icon="meter.hunger" label={t('ui.condition.hunger')} from={outcome.before.hunger} to={outcome.after.hunger} color="#b7b3a9" floor={REST_WAKE_FLOOR} />
        <Row icon="meter.thirst" label={t('ui.condition.thirst')} from={outcome.before.thirst} to={outcome.after.thirst} color="#2bc4d9" floor={REST_WAKE_FLOOR} />
        {outcome.infectionDelta > 0 && (
          <Row
            icon="meter.infection"
            label={t('ui.condition.infection')}
            from={outcome.before.infection}
            to={outcome.before.infection + outcome.infectionDelta}
            goodWhenUp={false}
            color="#8fbf4a"
          />
        )}
      </ul>

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
