import { Icon } from '../icons/Icon';
import type { EvacVibe } from '../game/goal';
import { useT } from '../i18n';

interface Props {
  evacZoneName: string | null;
  evacDist: number;
  atEvac: boolean;
  windowText: string | null;
  /**
   * Hours until the next window is staged, while the channel is dark. Waiting
   * with no objective at all reads as a bug; waiting with a countdown reads as
   * the cost of missing the last one.
   */
  evacCooldownHours: number | null;
  urgent: boolean;
  doom: number;
  doomColor: string;
  doomLabel: string;
  dayMult: number;
  vibe: EvacVibe;
  vibeLine: string;
  /** Opens the full objectives sheet (checklist, quests, the long version). */
  onOpen: () => void;
}

const VIBE_FILL: Record<EvacVibe, string> = {
  thin: '#e8a54b',
  maybe: '#e8c54b',
  promising: '#7ec8a0',
};

const VIBE_WIDTH: Record<EvacVibe, number> = {
  thin: 28,
  maybe: 55,
  promising: 82,
};

function ReachLine({ zone }: { zone: string }) {
  const { t } = useT();
  const full = t('ui.objective.reach', { zone });
  const idx = full.indexOf(zone);
  if (idx < 0) {
    return (
      <>
        <Icon name="action.evac" /> {full}
      </>
    );
  }
  return (
    <>
      <Icon name="action.evac" /> {full.slice(0, idx)}
      <span className="font-semibold text-signal">{zone}</span>
      {full.slice(idx + zone.length)}
    </>
  );
}

/**
 * The always-on objective readout for the left rail: dual-path glance
 * (survival mult + fogged radio vibe) plus doom. Detail lives one click away.
 */
export function ObjectiveBar({
  evacZoneName,
  evacDist,
  atEvac,
  windowText,
  evacCooldownHours,
  urgent,
  doom,
  doomColor,
  doomLabel,
  dayMult,
  vibe,
  vibeLine,
  onOpen,
}: Props) {
  const { t } = useT();
  const vibeShort =
    vibe === 'thin'
      ? t('ui.objective.vibeThin')
      : vibe === 'maybe'
        ? t('ui.objective.vibeMaybe')
        : t('ui.objective.vibeOk');

  return (
    <button
      onClick={onOpen}
      className="w-full rounded-lg border border-signal/35 bg-signal/[0.07] p-2.5 text-left transition hover:bg-signal/[0.12]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-widest text-signal/70">
          <Icon name="action.objectives" /> {t('ui.objective.title')}
        </span>
        <span
          className={`shrink-0 text-xs tabular-nums ${
            urgent ? 'animate-pulse text-hiss' : 'text-concrete-200'
          }`}
        >
          {atEvac
            ? t('ui.objective.atEvac')
            : windowText
              ? `${windowText}`
              : evacZoneName
                ? `${evacDist} m`
                : evacCooldownHours != null
                  ? `${evacCooldownHours}h`
                  : '—'}
        </span>
      </div>

      <div className="mt-0.5 truncate text-sm text-concrete-50">
        {evacZoneName ? (
          <ReachLine zone={evacZoneName} />
        ) : (
          <span className="text-white/40">
            {evacCooldownHours != null
              ? t('ui.objective.channelDark')
              : t('ui.objective.noWindowSurvive')}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="w-8 shrink-0 text-2xs text-white/35">×{dayMult.toFixed(1)}</span>
            <div className="h-1 flex-1 overflow-hidden rounded bg-black/50">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.min(100, ((dayMult - 1) / 1.2) * 100)}%`,
                  background: '#e8e5dd',
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-10 shrink-0 truncate text-2xs text-white/35" title={vibeLine}>
              {vibeShort}
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded bg-black/50">
              <div
                className="h-full transition-all"
                style={{
                  width: `${VIBE_WIDTH[vibe]}%`,
                  background: VIBE_FILL[vibe],
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex w-14 shrink-0 flex-col items-end gap-0.5">
          <div className="h-1 w-full overflow-hidden rounded bg-black/50">
            <div
              className="h-full transition-all"
              style={{ width: `${Math.min(100, doom)}%`, background: doomColor }}
            />
          </div>
          <span className="text-2xs uppercase tracking-wide text-white/35">{doomLabel}</span>
        </div>
      </div>
    </button>
  );
}
