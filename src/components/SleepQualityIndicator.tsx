import {
  BED_LABEL,
  BED_MULT,
  ENCLOSED_LABEL,
  ENCLOSED_MULT,
  ROOF_LABEL,
  ROOF_MULT,
  type SleepConditions,
} from '../game/sleep';
import { Icon } from '../icons/Icon';
import { resolveIcon } from '../icons/registry';
import { TipHint } from './TipHint';

function pct(mult: number): string {
  return `${Math.round(mult * 100)}%`;
}

function factorTone(mult: number): string {
  if (mult >= 1) return 'text-white/80';
  if (mult >= 0.8) return 'text-white/55';
  return 'text-hiss/80';
}

/** Wide short roof — asset is ~2:1, so skip the square Icon box. */
function SleepRoof({ active }: { active: boolean }) {
  const src = resolveIcon('sleep.roof').asset?.src;
  if (!src) return <Icon name="sleep.roof" size={16} className={active ? '' : 'opacity-20'} />;
  return (
    <span
      aria-hidden
      className={`absolute left-1/2 top-0 -translate-x-1/2 ${active ? 'opacity-100' : 'opacity-20'}`}
      style={{
        width: 32,
        height: 14,
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
      }}
    />
  );
}

/**
 * House-shaped rest quality glyph to the left of Rest: roof, walls, bed, and
 * the combined recovery %. Hover (or tap) opens the factor breakdown.
 */
export function SleepQualityIndicator({ conditions }: { conditions: SleepConditions }) {
  const roofOn = conditions.roof === 'yes';
  const bedOn = conditions.bed === 'bed';
  const wallOpacity =
    conditions.enclosed === 'full' ? 1 : conditions.enclosed === 'partial' ? 0.45 : 0.15;
  const totalPct = Math.round(conditions.recoveryMult * 100);

  return (
    <TipHint
      className="inline-flex"
      tipClassName="absolute right-0 top-full z-[60] mt-1 w-max min-w-[11rem] max-w-[min(16rem,calc(100vw-1.5rem))] rounded-lg border border-white/15 bg-concrete-900 p-2 text-left shadow-signage"
      tip={<SleepTip conditions={conditions} />}
    >
      <div
        className="relative h-7 w-8 cursor-help text-white"
        aria-label={`Rest quality ${totalPct}% — ${conditions.summary}`}
      >
        <SleepRoof active={roofOn} />
        <div className="absolute inset-x-[1px] bottom-0 top-[11px] grid grid-cols-[2px_1fr_2px] items-stretch gap-x-0.5">
          <span
            className="rounded-[1px] bg-current"
            style={{ opacity: wallOpacity }}
            aria-hidden
          />
          <div className="flex flex-col items-center justify-center gap-px leading-none">
            <span className="text-[9px] font-bold tabular-nums tracking-tight text-white/90">
              {totalPct}%
            </span>
            <Icon
              name="sleep.bed"
              size={11}
              className={bedOn ? 'opacity-100' : 'opacity-20'}
            />
          </div>
          <span
            className="rounded-[1px] bg-current"
            style={{ opacity: wallOpacity }}
            aria-hidden
          />
        </div>
      </div>
    </TipHint>
  );
}

function SleepTip({ conditions }: { conditions: SleepConditions }) {
  const enclosedMult = ENCLOSED_MULT[conditions.enclosed];
  const roofMult = ROOF_MULT[conditions.roof];
  const bedMult = BED_MULT[conditions.bed];
  const rows = [
    {
      key: 'enclosed',
      label: `Walls · ${ENCLOSED_LABEL[conditions.enclosed]}`,
      mult: enclosedMult,
    },
    {
      key: 'roof',
      label: `Roof · ${ROOF_LABEL[conditions.roof]}`,
      mult: roofMult,
    },
    {
      key: 'bed',
      label: `Bed · ${BED_LABEL[conditions.bed]}`,
      mult: bedMult,
    },
  ] as const;

  return (
    <>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
          Rest recovery
        </span>
        <span className="shrink-0 text-xs font-bold tabular-nums text-white/80">
          {pct(conditions.recoveryMult)}
        </span>
      </div>
      <p className="mb-1.5 text-2xs leading-snug text-white/45">{conditions.summary}</p>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <li key={row.key} className="flex justify-between gap-3 text-xs">
            <span className="text-white/55">{row.label}</span>
            <span className={`shrink-0 tabular-nums ${factorTone(row.mult)}`}>
              ×{row.mult.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex justify-between gap-3 border-t border-white/10 pt-1.5 text-xs">
        <span className="text-white/40">Combined</span>
        <span className="font-semibold tabular-nums text-white/80">
          ×{conditions.recoveryMult.toFixed(2)}
        </span>
      </div>
    </>
  );
}
