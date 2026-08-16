import { useGame } from '../game/store';
import { GuideSectionView } from '../components/GuideSectionView';
import { GUIDE_SECTIONS } from '../content/guideContent';

export function Menu() {
  const { goToCharacter, continueRun, hasSavedRun, highScores } = useGame();

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center lg:max-w-6xl">
        <h1 className="mb-1 text-5xl font-black tracking-tight text-signal drop-shadow">
          SINGVIVE
        </h1>
        <p className="mb-2 text-sm uppercase tracking-[0.3em] text-white/40">
          Singapore has fallen
        </p>
        <p className="mb-8 text-xs text-white/45">
          9400+ real locations · permadeath · extract or die
        </p>

        <div className="mx-auto flex max-w-md flex-col gap-3">
          <button
            onClick={goToCharacter}
            className="rounded-sm bg-signal/80 px-6 py-3 font-bold text-black transition hover:bg-signal"
          >
            New Survivor
          </button>
          {hasSavedRun && (
            <button
              onClick={continueRun}
              className="rounded-sm border border-white/20 px-6 py-3 font-semibold text-white/80 transition hover:bg-white/5"
            >
              Continue Run
            </button>
          )}
        </div>

        <div className="mt-8 rounded-lg border border-white/15 bg-concrete-900/80 p-4 text-left">
          <h2 className="mb-3 text-xs uppercase tracking-widest text-signal/80">How to play</h2>
          {/* Phone: stacked scroll. Desktop: four columns side by side. */}
          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-4 lg:gap-4">
            {GUIDE_SECTIONS.map((section) => (
              <GuideSectionView key={section.id} section={section} />
            ))}
          </div>
        </div>

        {highScores.length > 0 && (
          <div className="mx-auto mt-8 max-w-md text-left">
            <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">Top scores</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {highScores.slice(0, 5).map((h, i) => (
                <li
                  key={i}
                  className="flex justify-between rounded bg-white/5 px-3 py-1.5 text-white/70"
                >
                  <span>
                    {i + 1}. {h.name}
                  </span>
                  <span className="tabular-nums">
                    {h.days}d · {h.score}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mx-auto mt-10 max-w-md text-xs leading-relaxed text-white/30">
          A roguelike survival game on the real map of Singapore — 9400+ OSM places to scavenge,
          manage your body, climb the score, or get out with a lift before the horde peaks.
        </p>
      </div>
    </div>
  );
}
