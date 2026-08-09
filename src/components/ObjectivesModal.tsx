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
  onClose: () => void;
}

/**
 * The run's objectives, in one dedicated place. Evac is the headline goal today;
 * the Quests section is stubbed so future RPG content slots straight in.
 */
export function ObjectivesModal({
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
  onClose,
}: Props) {
  return (
    <div
      className="absolute inset-0 z-[1200] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90%] w-full max-w-md overflow-y-auto rounded-xl border border-white/10 bg-rot-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-toxic">🎯 Objectives</h3>
          <button onClick={onClose} className="text-xs text-white/40 hover:text-white/70">
            ✕ close
          </button>
        </div>

        {/* ---- Extraction ---- */}
        <section className="rounded-lg border border-toxic/30 bg-toxic/[0.06] p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-toxic">🚁 Escape Singapore</span>
            <span className="text-[11px] text-white/40">
              {atEvac ? 'you are here' : evacZoneName ? `${evacDist} m away` : '—'}
            </span>
          </div>
          {evacZoneName ? (
            <p className="mt-1 text-[13px] text-white/70">
              Reach <span className="font-semibold text-toxic">{evacZoneName}</span> with the full
              evac kit and signal for a lift out.
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-white/50">No active evac window.</p>
          )}

          {windowText && (
            <div
              className={`mt-2 text-[11px] font-semibold ${
                urgent ? 'animate-pulse text-red-400' : 'text-amber-300/90'
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
                  r.have ? 'bg-toxic/15 text-toxic' : 'bg-white/5 text-white/40'
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
              className="mt-3 w-full rounded-lg bg-toxic/80 py-2 text-sm font-bold text-black transition hover:bg-toxic disabled:opacity-30"
            >
              {evacReady ? '🚁 Call for evac — escape!' : 'Evac kit incomplete'}
            </button>
          )}
        </section>

        {/* ---- Doom clock ---- */}
        <section className="mt-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-white/40">
            <span>Horde · {doomLabel}</span>
            <span className="tabular-nums">{Math.round(doom)}%</span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-black/50">
            <div
              className="h-full transition-all"
              style={{ width: `${Math.min(100, doom)}%`, background: doomColor }}
            />
          </div>
          <p className="mt-1 text-[10px] text-white/30">
            The city is lost when the horde hits 100%. Escape before then.
          </p>
        </section>

        {/* ---- Quests (future) ---- */}
        <section className="mt-4">
          <h4 className="mb-1 text-[10px] uppercase tracking-widest text-white/30">Quests</h4>
          <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[12px] text-white/30">
            No side quests yet — coming soon.
          </div>
        </section>
      </div>
    </div>
  );
}
