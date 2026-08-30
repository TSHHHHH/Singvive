import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { useClockFormat } from '../game/settings';
import { countBleeding, formatClock, totalHp, totalMaxHp } from '../game/survival';
import { formatDuration } from '../game/travel';
import { timeOfDay } from '../game/weather';
import { dynamicMeterColor } from './MeterBar';
import { useT } from '../i18n';
import { tip } from './tips';
import { useClockAdvance } from './useClockAdvance';

/** Tiny icon + fill used in the phone chrome strip. */
function MiniMeter({
  icon,
  value,
  max,
  color,
  danger,
  dynamic,
}: {
  icon: IconName;
  value: number;
  max: number;
  color: string;
  danger?: boolean;
  dynamic?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const low = danger ? pct > 60 : pct < 35;
  const fill = dynamic ? dynamicMeterColor(pct) : color;
  return (
    <span
      className="flex min-w-0 flex-1 items-center gap-1"
      {...tip(`${Math.round(value)}/${Math.round(max)}`)}
    >
      <span className="shrink-0 text-2xs leading-none">
        <Icon name={icon} size={12} />
      </span>
      <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-none bg-black/50 ring-1 ring-white/15">
        <span
          className={`absolute inset-y-0 left-0 transition-all duration-300 ${low ? 'pulse-danger' : ''}`}
          style={{ width: `${pct}%`, background: fill }}
        />
      </span>
    </span>
  );
}

/**
 * Phone-only vitals glance: day, clock, and the survival meters you need
 * without opening Status. Tap jumps to the hub.
 */
export function PhoneStatusBar({ onOpenStatus }: { onOpenStatus: () => void }) {
  const { t } = useT();
  const { day, hour, meters, bodyParts } = useGame(
    useShallow((s) => ({
      day: s.day,
      hour: s.hour,
      meters: s.meters,
      bodyParts: s.bodyParts,
    })),
  );
  const clock = useClockFormat();
  const fx = useClockAdvance(day, hour);
  const band = timeOfDay(hour);
  const accent = band === 'night' ? '#2bc4d9' : band === 'dusk' ? '#e0a04a' : '#e8e5dd';
  const pulse = fx
    ? fx.kind === 'band'
      ? 'clock-pulse-phone clock-pulse-band'
      : 'clock-pulse-phone clock-pulse-tick'
    : '';
  const hp = totalHp(bodyParts);
  const hpMax = totalMaxHp(bodyParts);
  const bleeding = countBleeding(bodyParts, 'major') + countBleeding(bodyParts, 'minor');

  return (
    <button
      type="button"
      onClick={onOpenStatus}
      className="relative z-[720] flex shrink-0 items-center gap-2 overflow-visible border-b border-white/10 bg-concrete-900/95 px-2.5 py-1.5 lg:hidden"
      style={{ minHeight: 'var(--mobile-status-bar-h)' }}
      aria-label={t('ui.phone.openStatus')}
    >
      <span
        key={fx?.nonce ?? 'idle'}
        className={`relative shrink-0 tabular-nums text-2xs text-white/50 ${pulse}`}
        style={{ '--clock-accent': accent } as CSSProperties}
      >
        D{day}{' '}
        <span style={{ color: accent }}>{formatClock(hour, clock)}</span>
        {fx && (
          <span className="clock-delta-chip pointer-events-none absolute -right-0.5 -top-1 z-10" aria-hidden>
            +{formatDuration(Math.round(fx.deltaHours * 60))}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <MiniMeter icon="meter.health" value={hp} max={hpMax || 1} color="#d92d2d" />
        <MiniMeter icon="meter.hunger" value={meters.hunger} max={100} color="#b7b3a9" dynamic />
        <MiniMeter icon="meter.thirst" value={meters.thirst} max={100} color="#2bc4d9" dynamic />
        <MiniMeter icon="meter.energy" value={meters.energy} max={100} color="#e8e5dd" dynamic />
        {meters.infection > 0 && (
          <MiniMeter
            icon="meter.infection"
            value={meters.infection}
            max={100}
            color="#2bc4d9"
            danger
          />
        )}
      </span>
      {bleeding > 0 && (
        <span className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-hiss">
          {t('ui.phone.bleed')}
        </span>
      )}
    </button>
  );
}
