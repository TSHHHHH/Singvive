import { Icon } from '../icons/Icon';

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
  readinessRatio: number;
  /** Opens the full objectives sheet (checklist, quests, the long version). */
  onOpen: () => void;
}

/**
 * The always-on objective readout for the left rail: dual-path glance
 * (survival mult + readiness) plus doom. Detail lives one click away.
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
  readinessRatio,
  onOpen,
}: Props) {
  const readyPct = Math.round(readinessRatio * 100);

  return (
    <button
      onClick={onOpen}
      className="w-full rounded-lg border border-signal/35 bg-signal/[0.07] p-2.5 text-left transition hover:bg-signal/[0.12]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-widest text-signal/70">
          <Icon name="action.objectives" /> Objective
        </span>
        <span
          className={`shrink-0 text-xs tabular-nums ${
            urgent ? 'animate-pulse text-hiss' : 'text-concrete-200'
          }`}
        >
          {atEvac
            ? 'at evac'
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
          <>
            <Icon name="action.evac" /> Reach{' '}
            <span className="font-semibold text-signal">{evacZoneName}</span>
          </>
        ) : (
          <span className="text-white/40">
            {evacCooldownHours != null
              ? 'Channel dark. Command is staging another lift — sit tight or stock up.'
              : 'No active evac window — survive for score, or wait for a bird.'}
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
            <span className="w-8 shrink-0 text-2xs text-white/35">{readyPct}%</span>
            <div className="h-1 flex-1 overflow-hidden rounded bg-black/50">
              <div
                className="h-full transition-all"
                style={{
                  width: `${readyPct}%`,
                  background: readyPct >= 100 ? '#7ec8a0' : '#e8a54b',
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
