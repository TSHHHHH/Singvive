import type { CSSProperties } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { TIME_LABEL } from '../game/weather';
import { useClockFormat } from '../game/settings';
import { formatDuration } from '../game/travel';
import type { TimeOfDay } from '../game/types';
import { useClockAdvance } from './useClockAdvance';
import { RollingDigits } from './clockDigits';
import { useTickingClock } from './useTickingClock';
import { useReducedMotion } from '../hooks/useReducedMotion';

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
  variant = 'panel',
}: {
  day: number;
  hour: number;
  band: TimeOfDay;
  /**
   * `lock`: the desktop HUD phone's lock screen — big centred time, day and
   * band above it, no LCD card. Same spent-time cue, as a glow.
   */
  variant?: 'panel' | 'lock';
}) {
  const clock = useClockFormat();
  const fx = useClockAdvance(day, hour);
  const still = useReducedMotion();
  // The face runs through elapsed time; the day label reads the face too, so it
  // turns over at the same instant the hour rolls past midnight.
  const face = useTickingClock(day, hour);
  const { h24, m } = face;
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
  const delta = fx && (
    <span className="clock-delta-chip pointer-events-none absolute -top-1.5 right-0" aria-hidden>
      +{formatDuration(Math.round(fx.deltaHours * 60))}
    </span>
  );

  if (variant === 'lock') {
    return (
      <div className="flex flex-col items-center leading-none">
        <span
          className={`flex items-center gap-1.5 text-label uppercase text-white/50 ${
            fx?.dayChanged || fx?.kind === 'band' ? 'clock-label-flash' : ''
          }`}
        >
          <Icon name={icon} size={12} />
          Day {face.day} · {TIME_LABEL[band]}
        </span>
        <span
          key={fx?.nonce ?? 'idle'}
          className={`relative mt-1 flex items-baseline gap-1 overflow-visible ${
            fx ? `clock-pulse-phone ${pulse}` : ''
          }`}
          style={{ '--clock-accent': color } as CSSProperties}
        >
          <span
            className="text-banner tabular-nums"
            style={{ color, textShadow: `0 0 18px ${color}55` }}
          >
            <RollingDigits text={hh} still={still} />
            <span className="animate-pulse">:</span>
            <RollingDigits text={mm} still={still} />
          </span>
          {meridiem && (
            <span className="text-plate uppercase" style={{ color }}>
              {meridiem}
            </span>
          )}
          {delta}
        </span>
      </div>
    );
  }

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
          className={`text-label uppercase text-white/35 ${fx?.dayChanged ? 'clock-label-flash' : ''}`}
        >
          Day {face.day}
        </span>
        <span
          className={`mt-0.5 text-plate uppercase text-white/45 ${fx?.kind === 'band' ? 'clock-label-flash' : ''}`}
        >
          {TIME_LABEL[band]}
        </span>
      </div>
      <div className="relative flex items-baseline gap-1.5">
        <Icon name={icon} size={18} className="leading-none" />
        <span
          className="text-marquee tabular-nums"
          style={{ color, textShadow: `0 0 8px ${color}66` }}
        >
          <RollingDigits text={hh} still={still} />
          <span className="animate-pulse">:</span>
          <RollingDigits text={mm} still={still} />
        </span>
        {meridiem && (
          <span className="text-plate uppercase" style={{ color }}>
            {meridiem}
          </span>
        )}
        {delta}
      </div>
    </div>
  );
}
