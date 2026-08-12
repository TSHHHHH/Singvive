import { useGame } from '../game/store';

export function Menu() {
  const { goToCharacter, continueRun, hasSavedRun, highScores } = useGame();

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-1 text-5xl font-black tracking-tight text-signal drop-shadow">
          SINGVIVE
        </h1>
        <p className="mb-8 text-sm uppercase tracking-[0.3em] text-white/40">
          Singapore has fallen
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={goToCharacter}
            className="rounded-lg bg-signal/80 px-6 py-3 font-bold text-black transition hover:bg-signal"
          >
            New Survivor
          </button>
          {hasSavedRun && (
            <button
              onClick={continueRun}
              className="rounded-lg border border-white/20 px-6 py-3 font-semibold text-white/80 transition hover:bg-white/5"
            >
              Continue Run
            </button>
          )}
        </div>

        {highScores.length > 0 && (
          <div className="mt-10 text-left">
            <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">
              Longest survivors
            </h2>
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

        <p className="mt-10 text-xs leading-relaxed text-white/30">
          A roguelike survival game on the real map of Singapore. Scavenge real
          places, manage your body, and last as long as you can.
        </p>
      </div>
    </div>
  );
}
