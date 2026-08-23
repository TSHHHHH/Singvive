import {
  BED_LABEL,
  BED_MULT,
  ENCLOSED_LABEL,
  ENCLOSED_MULT,
  ROOF_LABEL,
  ROOF_MULT,
  type RestPreview,
} from '../game/sleep';
import { restAmbushLabel } from '../game/wilds';
import { Icon } from '../icons/Icon';
import { resolveIcon } from '../icons/registry';
import { TipHint } from './TipHint';
import { msgOr, useT } from '../i18n';

function pct(mult: number): string {
  return `${Math.round(mult * 100)}%`;
}

function factorTone(mult: number): string {
  if (mult >= 1) return 'text-white/80';
  if (mult >= 0.8) return 'text-white/55';
  return 'text-hiss/80';
}

function ambushTextKey(chance: number): string {
  if (chance <= 0) return 'safe';
  if (chance < 0.15) return 'uneasy';
  if (chance < 0.4) return 'exposed';
  return 'suicide';
}

/** Wide short roof — asset is ~2:1, so skip the square Icon box. Sized in em so it tracks HUD type. */
function SleepRoof({ active }: { active: boolean }) {
  const src = resolveIcon('sleep.roof').asset?.src;
  if (!src) {
    return (
      <Icon
        name="sleep.roof"
        className={`absolute left-1/2 top-0 -translate-x-1/2 ${active ? '' : 'opacity-20'}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`absolute left-1/2 top-0 h-[0.95em] w-full -translate-x-1/2 ${active ? 'opacity-100' : 'opacity-20'}`}
      style={{
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
 * House-shaped rest quality glyph to the left of Rest: roof, walls, and bed
 * as condition flags; recovery % and night ambush sit beside the silhouette.
 */
export function SleepQualityIndicator({ preview }: { preview: RestPreview }) {
  const { t } = useT();
  const conditions = preview.conditions;
  const roofOn = conditions.roof === 'yes';
  const bedOn = conditions.bed === 'bed';
  const wallOpacity =
    conditions.enclosed === 'full' ? 1 : conditions.enclosed === 'partial' ? 0.45 : 0.15;
  const totalPct = Math.round(conditions.recoveryMult * 100);
  const ambushPct = Math.round(preview.ambushChance * 100);
  const ambush = restAmbushLabel(preview.ambushChance);
  const ambushLabel = msgOr(
    `ui.sleep.ambush.${ambushTextKey(preview.ambushChance)}`,
    ambush.text,
  );

  return (
    <TipHint className="inline-flex" tip={<SleepTip preview={preview} />}>
      <div
        className="flex cursor-help items-center gap-1 border-b border-dashed border-white/20 text-xs text-white"
        aria-label={t('ui.sleep.aria', {
          pct: totalPct,
          ambushPct,
          ambush: ambushLabel,
          summary: conditions.summary,
        })}
      >
        <div className="relative h-[2.25em] w-[2.4em] shrink-0" aria-hidden>
          <SleepRoof active={roofOn} />
          <div className="absolute inset-x-[0.08em] bottom-0 top-[0.8em] grid grid-cols-[0.18em_1fr_0.18em] items-stretch gap-x-[0.12em]">
            <span
              className="rounded-[1px] bg-current"
              style={{ opacity: wallOpacity }}
            />
            <div className="flex items-center justify-center">
              <Icon name="sleep.bed" className={bedOn ? 'opacity-100' : 'opacity-20'} />
            </div>
            <span
              className="rounded-[1px] bg-current"
              style={{ opacity: wallOpacity }}
            />
          </div>
        </div>
        <div className="flex flex-col items-start leading-none">
          <span className="font-bold tabular-nums text-white/90">{totalPct}%</span>
          <span className="mt-0.5 font-bold tabular-nums" style={{ color: ambush.color }}>
            {preview.ambushChance <= 0 ? t('ui.sleep.safe') : `${ambushPct}%`}
          </span>
        </div>
      </div>
    </TipHint>
  );
}

function SleepTip({ preview }: { preview: RestPreview }) {
  const { t } = useT();
  const conditions = preview.conditions;
  const enclosedMult = ENCLOSED_MULT[conditions.enclosed];
  const roofMult = ROOF_MULT[conditions.roof];
  const bedMult = BED_MULT[conditions.bed];
  const ambush = restAmbushLabel(preview.ambushChance);
  const ambushLabel = msgOr(
    `ui.sleep.ambush.${ambushTextKey(preview.ambushChance)}`,
    ambush.text,
  );
  const enclosedLabel = msgOr(
    `ui.sleep.enclosed.${conditions.enclosed}`,
    ENCLOSED_LABEL[conditions.enclosed],
  );
  const roofLabel = msgOr(`ui.sleep.roofLevel.${conditions.roof}`, ROOF_LABEL[conditions.roof]);
  const bedLabel = msgOr(`ui.sleep.bedLevel.${conditions.bed}`, BED_LABEL[conditions.bed]);
  const rows = [
    {
      key: 'enclosed',
      label: t('ui.sleep.walls', { label: enclosedLabel }),
      mult: enclosedMult,
    },
    {
      key: 'roof',
      label: t('ui.sleep.roof', { label: roofLabel }),
      mult: roofMult,
    },
    {
      key: 'bed',
      label: t('ui.sleep.bed', { label: bedLabel }),
      mult: bedMult,
    },
  ] as const;

  return (
    <div className="w-max min-w-[14rem] max-w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-white/15 bg-concrete-900 p-2.5 text-left shadow-signage">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
          {t('ui.sleep.restRecovery')}
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
        <span className="text-white/40">{t('ui.sleep.combined')}</span>
        <span className="font-semibold tabular-nums text-white/80">
          ×{conditions.recoveryMult.toFixed(2)}
        </span>
      </div>
      <div className="mt-1.5 border-t border-white/10 pt-1.5">
        <div className="text-xs font-semibold uppercase tracking-widest text-white/40">
          {t('ui.sleep.nightAmbush')}
        </div>
        <div className="mt-0.5 text-xs font-bold tabular-nums" style={{ color: ambush.color }}>
          {preview.ambushChance <= 0
            ? t('ui.sleep.safe')
            : `${Math.round(preview.ambushChance * 100)}% · ${ambushLabel}`}
        </div>
      </div>
      {conditions.occupancyNotes.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {conditions.occupancyNotes.map((note) => (
            <li key={note} className="text-2xs leading-snug text-white/45">
              {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
