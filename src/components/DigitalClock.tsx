import type { CSSProperties } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { TIME_LABEL } from '../game/weather';
import { useClockFormat } from '../game/settings';
import { formatDuration } from '../game/travel';
import type { TimeOfDay } from '../game/types';
import { useClockAdvance } from './useClockAdvance';

const BAND_COLOR: Record<TimeOfDay, string> = {
  day: '#e8e5dd',
  dusk: '#e0a04a',
  night: '#2bc4d9',
};

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
  const clock = useClockFormat();
  const fx = useClockAdvance(day, hour);
  const h24 = ((Math.floor(hour) % 24) + 24) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  const twelve = clock === '12';
  // 12-hour reads better unpadded — "8:30 pm", not "08:30 pm".
  const hh = twelve ? String(h24 % 12 === 0 ? 12 : h24 % 12) : String(h24).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const meridiem = twelve ? (h24 < 12 ? 'am' : 'pm') : null;

  const night = band === 'night';
  const dusk = band === 'dusk';
  const icon: IconName = night ? 'time.night' : dusk ? 'time.dusk' : 'time.day';
  const color = BAND_COLOR[band];
  const pulse = fx ? (fx.kind === 'band' ? 'clock-pulse-band' : 'clock-pulse-tick') : '';

  return (
    <div
      key={fx?.nonce ?? 'idle'}
      className={`relative flex items-center justify-between overflow-visible rounded-lg border border-white/15 bg-concrete-900/80 px-3 py-2 ${pulse}`}
      style={
        {
          boxShadow: 'inset 0 0 12px rgba(0,0,0,.6)',
          '--clock-accent': color,
        } as CSSProperties
      }
    >
      <div className="flex flex-col leading-none">
        <span
          className={`text-2xs uppercase tracking-[0.2em] text-white/35 ${fx?.dayChanged ? 'clock-label-flash' : ''}`}
        >
          Day {day}
        </span>
        <span
          className={`mt-0.5 text-xs uppercase tracking-widest text-white/45 ${fx?.kind === 'band' ? 'clock-label-flash' : ''}`}
        >
          {TIME_LABEL[band]}
        </span>
      </div>
      <div className="relative flex items-baseline gap-1.5">
        <Icon name={icon} size={18} className="leading-none" />
        <span
          className="font-mono text-3xl font-bold leading-none tabular-nums"
          style={{ color, textShadow: `0 0 8px ${color}66` }}
        >
          {hh}
          <span className="animate-pulse">:</span>
          {mm}
        </span>
        {meridiem && (
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>
            {meridiem}
          </span>
        )}
        {fx && (
          <span className="clock-delta-chip pointer-events-none absolute -top-1.5 right-0" aria-hidden>
            +{formatDuration(Math.round(fx.deltaHours * 60))}
          </span>
        )}
      </div>
    </div>
  );
}
