import { Icon } from '../icons/Icon';

interface ChecklistItem {
  id: string;
  name: string;
  have: boolean;
}

interface Props {
  evacZoneName: string | null;
  evacDist: number;
  atEvac: boolean;
  checklist: ChecklistItem[];
  windowText: string | null;
  urgent: boolean;
  doom: number;
  doomColor: string;
  doomLabel: string;
  evacReady: boolean;
  onEvac: () => void;
}

/**
 * The run's objectives in full: the evac contract, its kit checklist, the doom
 * clock, and room for quests to come. Rendered as the body of the side panel —
 * the same slot Inventory / Logbook / Stats use, so every "more detail" request
 * from the rail lands in the same place.
 */
export function ObjectivesPanel({
  evacZoneName,
  evacDist,
  atEvac,
  checklist,
  windowText,
  urgent,
  doom,
  doomColor,
  doomLabel,
  evacReady,
  onEvac,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/* ---- Extraction ---- */}
      <section className="rounded-lg border border-signal/30 bg-signal/[0.06] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-signal">
            <Icon name="action.evac" /> Escape Singapore
          </span>
          <span className="shrink-0 text-[11px] text-white/40">
            {atEvac ? 'you are here' : evacZoneName ? `${evacDist} m away` : '—'}
          </span>
        </div>
        {evacZoneName ? (
          <p className="mt-1 text-[13px] text-white/70">
            Reach <span className="font-semibold text-signal">{evacZoneName}</span> with the full
            evac kit and signal for a lift out.
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-white/50">No active evac window.</p>
        )}

        {windowText && (
          <div
            className={`mt-2 text-[11px] font-semibold ${
              urgent ? 'animate-pulse text-hiss' : 'text-concrete-200'
            }`}
          >
            ⏳ Window closes in {windowText}
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {checklist.map((r) => (
            <span
              key={r.id}
              className={`rounded px-1.5 py-0.5 text-[11px] ${
                r.have ? 'bg-signal/15 text-signal' : 'bg-white/5 text-white/40'
              }`}
            >
              {r.have ? '✓' : '○'} {r.name}
            </span>
          ))}
        </div>

        {atEvac && (
          <button
            onClick={onEvac}
            disabled={!evacReady}
            className="mt-3 w-full rounded-lg bg-signal/80 py-2 text-sm font-bold text-black transition hover:bg-signal disabled:opacity-30"
          >
            {evacReady ? '🚁 Call for evac — escape!' : 'Evac kit incomplete'}
          </button>
        )}
      </section>

      {/* ---- Doom clock ---- */}
      <section className="rounded-lg border border-white/10 bg-black/30 p-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-white/40">
          <span>Horde · {doomLabel}</span>
          <span className="tabular-nums">{Math.round(doom)}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-black/50">
          <div
            className="h-full transition-all"
            style={{ width: `${Math.min(100, doom)}%`, background: doomColor }}
          />
        </div>
        <p className="mt-1.5 text-[10px] text-white/30">
          The city is lost when the horde hits 100%. Escape before then.
        </p>
      </section>

      {/* ---- Quests (future) ---- */}
      <section>
        <h4 className="mb-1 text-[10px] uppercase tracking-widest text-white/30">Quests</h4>
        <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[12px] text-white/30">
          No side quests yet — coming soon.
        </div>
      </section>
    </div>
  );
}
