import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { useClockFormat } from '../game/settings';
import { countBleeding, formatClock, totalHp, totalMaxHp } from '../game/survival';
import { dynamicMeterColor } from './MeterBar';

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
      title={`${Math.round(value)}/${Math.round(max)}`}
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
  const { day, hour, meters, bodyParts } = useGame(
    useShallow((s) => ({
      day: s.day,
      hour: s.hour,
      meters: s.meters,
      bodyParts: s.bodyParts,
    })),
  );
  const clock = useClockFormat();
  const hp = totalHp(bodyParts);
  const hpMax = totalMaxHp(bodyParts);
  const bleeding = countBleeding(bodyParts, 'major') + countBleeding(bodyParts, 'minor');

  return (
    <button
      type="button"
      onClick={onOpenStatus}
      className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-concrete-900/95 px-2.5 py-1.5 lg:hidden"
      style={{ minHeight: 'var(--mobile-status-bar-h)' }}
      aria-label="Open status"
    >
      <span className="shrink-0 tabular-nums text-2xs text-white/50">
        D{day} <span className="text-white/80">{formatClock(hour, clock)}</span>
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
          Bleed
        </span>
      )}
    </button>
  );
}
