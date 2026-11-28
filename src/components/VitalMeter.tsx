import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { dynamicMeterColor } from './MeterBar';
import { tip } from './tips';

const GAIN = '#5fbf6a';
const LOSS = '#d9542b';
const TWEEN_MS = 600;
/** The trailing segment waits this long, so the change reads before it closes. */
const LAG_MS = 350;

const clampPct = (v: number, max: number) => Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100));

/** Count a number toward its new value instead of snapping. */
function useTweened(value: number, still: boolean): number {
  const [shown, setShown] = useState(Math.round(value));
  const from = useRef(value);
  useEffect(() => {
    if (still) {
      from.current = value;
      setShown(Math.round(value));
      return;
    }
    const start = from.current;
    if (start === value) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / TWEEN_MS);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = start + (value - start) * eased;
      from.current = v;
      setShown(Math.round(v));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, still]);
  return shown;
}

function DeltaBadge({ diff }: { diff: number }) {
  const color = diff > 0 ? GAIN : diff < 0 ? LOSS : 'rgba(255,255,255,0.45)';
  return (
    <span
      className="rounded px-1 text-micro font-bold tabular-nums"
      style={{ color, backgroundColor: diff === 0 ? 'rgba(255,255,255,0.06)' : `${color}26` }}
    >
      {diff > 0 ? `▲${diff}` : diff < 0 ? `▼${-diff}` : '±0'}
    </span>
  );
}

/**
 * The left dock's vital readout: label + value over a thin bar.
 *
 * Live, a change animates — the number counts, the bar slides, and the chunk
 * gained or lost lingers as a green or red segment before it settles.
 * With `preview`, it shows a planned change instead: `now → then`, the kept
 * part in the meter's colour, the gain glowing green and the cost hatched red.
 */
export function VitalMeter({
  label,
  icon,
  value,
  max = 100,
  hint,
  preview,
  goodWhenUp = true,
  locked = 0,
  rate,
  receding = 0,
}: {
  label: string;
  icon: IconName;
  value: number;
  max?: number;
  hint?: string;
  /** Planned value: show the change instead of the live meter. */
  preview?: number;
  goodWhenUp?: boolean;
  /** Part of `max` held back (open wounds): drawn hatched at the bar's end, left out of the shown max. */
  locked?: number;
  /** Per-hour drift shown beside the value ("+1.5/h"); `bad` colours it. */
  rate?: { text: string; bad: boolean } | null;
  /** Part of `value` that will fade on its own: drawn striped at the fill's end. */
  receding?: number;
}) {
  const still = useReducedMotion();
  const shown = useTweened(value, still || preview != null);

  // Which way the last change went, captured at the moment it happened.
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState<{ up: boolean; diff: number; key: number } | null>(null);
  if (value !== prev) {
    setPrev(value);
    const diff = Math.round(value) - Math.round(prev);
    if (diff !== 0) setDir({ up: diff > 0, diff, key: (dir?.key ?? 0) + 1 });
  }
  useEffect(() => {
    if (!dir) return;
    const id = window.setTimeout(() => setDir(null), TWEEN_MS + LAG_MS + 700);
    return () => window.clearTimeout(id);
  }, [dir]);

  const pct = clampPct(value, max);
  // Colour and warning by how good the reading is, not how full the bar is.
  const health = (p: number) => (goodWhenUp ? p : 100 - p);

  if (preview != null) {
    const a = Math.round(value);
    const b = Math.round(preview);
    const diff = b - a;
    const lo = clampPct(Math.min(value, preview), max);
    const hi = clampPct(Math.max(value, preview), max);
    const good = diff === 0 ? null : diff > 0 === goodWhenUp;
    const deltaColor = good === null ? 'rgba(255,255,255,0.35)' : good ? GAIN : LOSS;
    const endPct = clampPct(preview, max);
    return (
      <div {...tip(hint)}>
        <div className="mb-1 flex items-center justify-between gap-2 text-body">
          <span className="flex items-center gap-1.5 text-white/65"><Icon name={icon} size={13} />{label}</span>
          <span className="flex items-center gap-1.5 tabular-nums">
            <span className="text-white/40">{a}</span>
            <span aria-hidden className="text-white/30">→</span>
            <span className={health(endPct) < 35 ? 'font-bold text-hiss' : 'font-bold text-concrete-50'}>{b}</span>
            <DeltaBadge diff={diff} />
          </span>
        </div>
        <div className="relative h-1.5 overflow-hidden bg-white/10" aria-hidden>
          <div className="absolute inset-y-0 left-0" style={{ width: `${lo}%`, background: dynamicMeterColor(health(endPct)) }} />
          {hi > lo && (
            <div
              className="absolute inset-y-0"
              style={
                preview > value
                  ? { left: `${lo}%`, width: `${hi - lo}%`, background: deltaColor, boxShadow: `0 0 6px ${deltaColor}` }
                  : {
                      left: `${lo}%`,
                      width: `${hi - lo}%`,
                      backgroundImage: `repeating-linear-gradient(135deg, ${deltaColor} 0 2px, transparent 2px 4px)`,
                    }
              }
            />
          )}
        </div>
      </div>
    );
  }

  // Live: the leading edge moves at once, the trailing one catches up after a beat.
  const up = dir?.up ?? false;
  const ease = `${TWEEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  const mainTransition = still ? 'none' : `width ${ease} ${up ? LAG_MS : 0}ms, background-color ${ease}`;
  const ghostTransition = still ? 'none' : `width ${ease} ${up ? 0 : LAG_MS}ms`;
  const shownPct = clampPct(shown, max);
  return (
    <div {...tip(hint)}>
      <div className="mb-1 flex items-center justify-between gap-2 text-body">
        <span className="flex items-center gap-1.5 text-white/65"><Icon name={icon} size={13} />{label}</span>
        <span className="flex items-center gap-1.5">
          {rate && (
            <span data-vital-rate="" className="rounded px-1 text-micro font-bold tabular-nums"
              style={{ color: rate.bad ? LOSS : GAIN, backgroundColor: `${rate.bad ? LOSS : GAIN}1f` }}>
              {rate.text}
            </span>
          )}
          {dir && !still && (
            <span key={dir.key} className="vital-delta text-micro font-bold tabular-nums" style={{ color: dir.up ? GAIN : LOSS }}>
              {dir.diff > 0 ? `+${dir.diff}` : dir.diff}
            </span>
          )}
          <span className={health(shownPct) < 35 ? 'tabular-nums text-hiss' : 'tabular-nums text-concrete-50'}>
            {Math.round(shown)}<span className="text-micro text-white/40">/{Math.round(max - locked)}</span>
          </span>
        </span>
      </div>
      <div role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="relative h-1 overflow-hidden bg-white/10">
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${pct}%`, background: up ? GAIN : LOSS, opacity: dir ? 0.9 : 0, transition: ghostTransition }}
        />
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${pct}%`, backgroundColor: dynamicMeterColor(health(pct)), transition: mainTransition }}
        />
        {receding > 0 && (
          <div
            data-vital-receding=""
            className="absolute inset-y-0"
            style={{
              left: `${Math.max(0, pct - clampPct(receding, max))}%`,
              width: `${Math.min(pct, clampPct(receding, max))}%`,
              backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.55) 0 2px, transparent 2px 4px)',
            }}
          />
        )}
        {locked > 0 && (
          <div
            data-vital-locked=""
            className="absolute inset-y-0 right-0"
            style={{
              width: `${clampPct(locked, max)}%`,
              backgroundImage: `repeating-linear-gradient(135deg, ${LOSS} 0 2px, transparent 2px 4px)`,
              opacity: 0.75,
            }}
          />
        )}
      </div>
    </div>
  );
}
