import { Icon } from '../icons/Icon';

interface Props {
  evacZoneName: string | null;
  evacDist: number;
  atEvac: boolean;
  windowText: string | null;
  urgent: boolean;
  doom: number;
  doomColor: string;
  doomLabel: string;
  /** Opens the full objectives sheet (checklist, quests, the long version). */
  onOpen: () => void;
}

/**
 * The always-on objective readout for the left rail: what you're supposed to be
 * doing, how far off it is, and how long the city has left. Detail lives one
 * click away in the side panel (ObjectivesPanel) — this is the glanceable version.
 */
export function ObjectiveBar({
  evacZoneName,
  evacDist,
  atEvac,
  windowText,
  urgent,
  doom,
  doomColor,
  doomLabel,
  onOpen,
}: Props) {
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-lg border border-signal/25 bg-signal/[0.07] p-2.5 text-left transition hover:bg-signal/[0.12]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-signal/70">
          <Icon name="action.objectives" /> Objective
        </span>
        <span
          className={`shrink-0 text-[11px] tabular-nums ${
            urgent ? 'animate-pulse text-hiss' : 'text-concrete-200'
          }`}
        >
          {atEvac ? 'at evac' : windowText ? `⏳ ${windowText}` : evacZoneName ? `${evacDist} m` : '—'}
        </span>
      </div>

      <div className="mt-0.5 truncate text-[13px] text-concrete-50">
        {evacZoneName ? (
          <>
            <Icon name="action.evac" /> Reach{' '}
            <span className="font-semibold text-signal">{evacZoneName}</span>
          </>
        ) : (
          <span className="text-white/40">No active evac window.</span>
        )}
      </div>

      {/* doom clock — the one thing that gets worse whether you act or not */}
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded bg-black/50">
          <div
            className="h-full transition-all"
            style={{ width: `${Math.min(100, doom)}%`, background: doomColor }}
          />
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-white/35">
          {doomLabel}
        </span>
      </div>
    </button>
  );
}
