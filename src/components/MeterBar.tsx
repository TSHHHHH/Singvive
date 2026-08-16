import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import type { MeterModifier } from '../game/survival';
import { TipHint } from './TipHint';

interface Props {
  label: string;
  value: number;
  max: number;
  color: string;
  danger?: boolean; // invert: higher is worse (infection)
  icon: IconName;
  /** Colour the fill by how far the meter sits from the 50% baseline. */
  dynamic?: boolean;
  /** Modifier lines shown on hover ("+15% travel speed"). */
  modifiers?: MeterModifier[];
}

// Baseline-relative colouring: above 55 you're being buffed, below 45 you're
// being taxed, and the band between is the neutral middle.
const GOOD = '#5fbf6a';
const NEUTRAL = '#d9c14a';
const BAD = '#d9542b';

export function dynamicMeterColor(pct: number): string {
  if (pct > 55) return GOOD;
  if (pct >= 45) return NEUTRAL;
  return BAD;
}

export function MeterBar({ label, value, max, color, danger, icon, dynamic, modifiers }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const low = danger ? pct > 60 : pct < 35;
  const fill = dynamic ? dynamicMeterColor(pct) : color;
  const hasTip = !!modifiers?.length;

  const bar = (
    <>
      <span className="w-5 text-center text-sm" title={label}>
        <Icon name={icon} title={label} />
      </span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-none bg-black/50 ring-1 ring-white/15">
        <div
          className={`h-full transition-all duration-300 ${low ? 'pulse-danger' : ''}`}
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>
      <span className="w-9 text-right text-sm tabular-nums text-white/70">
        {Math.round(value)}
      </span>
    </>
  );

  if (!hasTip) {
    return <div className="flex items-center gap-2">{bar}</div>;
  }

  return (
    <TipHint
      className="flex items-center gap-2"
      tipClassName="absolute bottom-full left-5 mb-1 w-max max-w-[200px] rounded border border-white/15 bg-black/90 px-2 py-1.5 text-2xs leading-relaxed shadow-signage"
      tip={
        <>
          <div className="mb-0.5 uppercase tracking-widest text-white/40">{label}</div>
          {modifiers!.map((m) => (
            <div key={m.text} className={m.good ? 'text-emerald-300' : 'text-hiss'}>
              {m.text}
            </div>
          ))}
        </>
      }
    >
      {bar}
    </TipHint>
  );
}
