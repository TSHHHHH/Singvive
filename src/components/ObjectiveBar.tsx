import { Icon } from '../icons/Icon';
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
  dayMult: number;
  evacContacted: boolean;
  /** Opens the full objectives sheet (checklist, quests, the long version). */
  onOpen: () => void;
  /** Map notes in the backpack waiting to be deciphered. */
  intelNoteCount?: number;
  /** Active rumoured pins on the map. */
  rumourCount?: number;
  /** One line (where to · how long) for the folded desktop phone. */
  compact?: boolean;
}

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
 * (survival multiplier + evacuation procedure). Detail lives one click away.
 */
export function ObjectiveBar({
  evacZoneName,
  evacDist,
  atEvac,
  windowText,
  evacCooldownHours,
  urgent,
  dayMult,
  evacContacted,
  onOpen,
  intelNoteCount = 0,
  rumourCount = 0,
  compact = false,
}: Props) {
  const { t } = useT();
  const countdown = windowText
    ? windowText
    : atEvac
      ? t('ui.objective.atEvac')
      : evacZoneName
        ? `${evacDist} m`
        : evacCooldownHours != null
          ? t('ui.game.windowH', { h: evacCooldownHours })
          : '—';
  const countdownCls = `shrink-0 text-body tabular-nums ${
    urgent ? 'animate-pulse text-hiss' : 'text-concrete-200'
  }`;
  const reach = evacZoneName ? (
    <ReachLine zone={evacZoneName} />
  ) : (
    <span className="text-white/40">
      {evacCooldownHours != null
        ? t('ui.objective.channelDark')
        : t('ui.objective.noWindowSurvive')}
    </span>
  );

  if (compact) {
    return (
      <button
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-2 rounded border border-signal/35 bg-signal/[0.07] px-2.5 py-1.5 text-left transition hover:bg-signal/[0.12]"
      >
        <span className="min-w-0 truncate text-body text-concrete-50">{reach}</span>
        <span className={countdownCls}>{countdown}</span>
      </button>
    );
  }
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-lg border border-signal/35 bg-signal/[0.07] p-2.5 text-left transition hover:bg-signal/[0.12]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-label uppercase text-signal/70">
          <Icon name="action.objectives" /> {t('ui.objective.title')}
        </span>
        <span className={countdownCls}>{countdown}</span>
      </div>

      <div className="mt-0.5 truncate text-read text-concrete-50">{reach}</div>
      {(intelNoteCount > 0 || rumourCount > 0) && (
        <div className="mt-0.5 truncate text-micro text-[#c4b07a]/90">
          {intelNoteCount > 0 && rumourCount > 0
            ? t('ui.objective.leadsBoth', { notes: intelNoteCount, rumours: rumourCount })
            : intelNoteCount > 0
              ? t('ui.objective.leadsNotes', { count: intelNoteCount })
              : t('ui.objective.leadsRumours', { count: rumourCount })}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="w-8 shrink-0 text-micro text-white/35">×{dayMult.toFixed(1)}</span>
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
          {evacZoneName && (
            <p className="text-micro text-signal/80">
              {t(evacContacted ? 'ui.objective.readyToBoard' : 'ui.objective.reportAtPoint')}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
