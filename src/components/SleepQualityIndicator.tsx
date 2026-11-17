import {
  BED_MULT,
  ENCLOSED_MULT,
  ROOF_MULT,
  type RestPreview,
} from '../game/sleep';
import { restAmbushLabel } from '../game/wilds';
import { Icon } from '../icons/Icon';
import { TipHint } from './TipHint';
import { useT } from '../i18n';

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

/**
 * Rest quality chip to the left of Rest: one full-size bed icon, toned by how
 * well you'd recover here, with recovery % over night-ambush %. Walls, roof
 * and bedding are spelled out with their multipliers in the tooltip.
 */
export function SleepQualityIndicator({ preview }: { preview: RestPreview }) {
  const { t } = useT();
  const conditions = preview.conditions;
  const totalPct = Math.round(conditions.recoveryMult * 100);
  const ambushPct = Math.round(preview.ambushChance * 100);
  const ambush = restAmbushLabel(preview.ambushChance);
  const ambushLabel = t(`ui.sleep.ambush.${ambushTextKey(preview.ambushChance)}`);

  return (
    <TipHint className="inline-flex" tip={<SleepTip preview={preview} />}>
      <div
        role="img"
        className="flex h-8 cursor-help items-center gap-1 rounded border border-dashed border-white/20 px-1 text-body"
        aria-label={t('ui.sleep.aria', {
          pct: totalPct,
          ambushPct,
          ambush: ambushLabel,
          summary: sleepSummary(preview, t),
        })}
      >
        <Icon name="sleep.bed" size={18} className={factorTone(conditions.recoveryMult)} />
        <div className="flex flex-col items-start leading-none" aria-hidden>
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
  const ambushLabel = t(`ui.sleep.ambush.${ambushTextKey(preview.ambushChance)}`);
  const enclosedLabel = t(`ui.sleep.enclosed.${conditions.enclosed}`);
  const roofLabel = t(`ui.sleep.roofLevel.${conditions.roof}`);
  const bedLabel = t(`ui.sleep.bedLevel.${conditions.bed}`);
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
        <span className="text-plate uppercase text-white/40">
          {t('ui.sleep.restRecovery')}
        </span>
        <span className="shrink-0 text-body font-bold tabular-nums text-white/80">
          {pct(conditions.recoveryMult)}
        </span>
      </div>
      <p className="mb-1.5 text-micro text-white/45">{sleepSummary(preview, t)}</p>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <li key={row.key} className="flex justify-between gap-3 text-body">
            <span className="text-white/55">{row.label}</span>
            <span className={`shrink-0 tabular-nums ${factorTone(row.mult)}`}>
              ×{row.mult.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex justify-between gap-3 border-t border-white/10 pt-1.5 text-body">
        <span className="text-white/40">{t('ui.sleep.combined')}</span>
        <span className="font-semibold tabular-nums text-white/80">
          ×{conditions.recoveryMult.toFixed(2)}
        </span>
      </div>
      <div className="mt-1.5 border-t border-white/10 pt-1.5">
        <div className="text-plate uppercase text-white/40">
          {t('ui.sleep.nightAmbush')}
        </div>
        <div className="mt-0.5 text-body font-bold tabular-nums" style={{ color: ambush.color }}>
          {preview.ambushChance <= 0
            ? t('ui.sleep.safe')
            : `${Math.round(preview.ambushChance * 100)}% · ${ambushLabel}`}
        </div>
      </div>
      {conditions.occupancyNotes.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {conditions.occupancyNotes.map((note, index) => (
            <li key={note} className="text-micro text-white/45">
              {conditions.occupancyNoteKeys?.[index] ? t(conditions.occupancyNoteKeys[index]) : note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function sleepSummary({ conditions }: RestPreview, t: ReturnType<typeof useT>['t']): string {
  const shelter = conditions.enclosed === 'none' && conditions.roof === 'none'
    ? 'open' : conditions.enclosed === 'full' ? 'enclosed' : 'roofed';
  return t(`ui.sleep.summary.${shelter}.${conditions.bed}`);
}
