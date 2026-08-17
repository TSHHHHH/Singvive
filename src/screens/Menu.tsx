import { useEffect, useState } from 'react';
import { fetchOnlineScores, type OnlineScore } from '../api/scores';
import { ScoreBoard, ScoreBoardTabs } from '../components/ScoreBoard';
import { useGame } from '../game/store';

export function Menu() {
  const { goToCharacter, continueRun, hasSavedRun, highScores } = useGame();
  const [tab, setTab] = useState<'world' | 'device'>('world');
  const [world, setWorld] = useState<OnlineScore[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetchOnlineScores().then((list) => {
      if (!cancelled) setWorld(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const localRows = highScores.slice(0, 5).map((h) => ({
    name: h.name,
    days: h.days,
    score: h.score,
    escaped: h.cause === 'Escaped Singapore by evac.',
  }));

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
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

        <div className="mx-auto mt-8 max-w-md text-left">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">Top scores</h2>
          <ScoreBoardTabs value={tab} onChange={setTab} />
          {tab === 'world' ? (
            world === undefined ? (
              <p className="text-sm text-white/40">Loading worldwide scores…</p>
            ) : world === null ? (
              <p className="text-sm text-white/40">Worldwide board unreachable.</p>
            ) : (
              <ScoreBoard rows={world.slice(0, 10)} empty="No worldwide scores yet." />
            )
          ) : (
            <ScoreBoard rows={localRows} empty="No scores on this device yet." />
          )}
        </div>

        <p className="mx-auto mt-10 max-w-md text-xs leading-relaxed text-white/30">
          A roguelike survival game on the real map of Singapore — 9400+ OSM places to scavenge,
          manage your body, climb the score, or get out with a lift before the horde peaks. How to
          play opens in-run on first launch; reopen it anytime from Settings.
        </p>
      </div>
    </div>
  );
}
