import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { TIME_LABEL } from '../game/weather';
import type { TimeOfDay } from '../game/types';

/**
 * Prominent LCD-style clock. Time drives danger, encounters and survival, so it
 * gets pride of place at the top of the hub.
 */
export function DigitalClock({
  day,
  hour,
  band,
}: {
  day: number;
  hour: number;
  band: TimeOfDay;
}) {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');

  const night = band === 'night';
  const dusk = band === 'dusk';
  const icon: IconName = night ? 'time.night' : dusk ? 'time.dusk' : 'time.day';
  // amber at dusk, cold blue at night, signal green by day
  const color = night ? '#2bc4d9' : dusk ? '#cfccc4' : '#e8e5dd';

  return (
    <div
      className="flex items-center justify-between rounded-lg border border-white/10 bg-black/50 px-3 py-2"
      style={{ boxShadow: 'inset 0 0 12px rgba(0,0,0,.6)' }}
    >
      <div className="flex flex-col leading-none">
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Day {day}</span>
        <span className="mt-0.5 text-[11px] uppercase tracking-widest text-white/45">
          {TIME_LABEL[band]}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <Icon name={icon} size={18} className="leading-none" />
        <span
          className="font-mono text-3xl font-bold leading-none tabular-nums"
          style={{ color, textShadow: `0 0 8px ${color}66` }}
        >
          {hh}
          <span className="animate-pulse">:</span>
          {mm}
        </span>
      </div>
    </div>
  );
}
