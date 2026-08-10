import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';

interface Props {
  label: string;
  value: number;
  max: number;
  color: string;
  danger?: boolean; // invert: higher is worse (infection)
  icon: IconName;
}

export function MeterBar({ label, value, max, color, danger, icon }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const low = danger ? pct > 60 : pct < 25;
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-center text-sm" title={label}>
        <Icon name={icon} title={label} />
      </span>
      <div className="relative h-3 flex-1 overflow-hidden rounded bg-black/50 ring-1 ring-white/10">
        <div
          className={`h-full transition-all duration-300 ${low ? 'pulse-danger' : ''}`}
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="w-9 text-right text-sm tabular-nums text-white/70">
        {Math.round(value)}
      </span>
    </div>
  );
}
