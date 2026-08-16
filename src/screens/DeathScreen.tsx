import { useGame } from '../game/store';
import { DEATH_TEXT, scoreDayMult } from '../game/survival';

export function DeathScreen() {
  const { deathCause, finalScore, day, kills, highScores, character, escaped, resetToMenu } =
    useGame();
  const mult = scoreDayMult(day);

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-2 text-6xl">{escaped ? '🚁' : '💀'}</div>
        <h1 className={`text-3xl font-black ${escaped ? 'text-signal' : 'text-hiss'}`}>
          {escaped ? 'YOU ESCAPED' : 'YOU DIED'}
        </h1>
        <p className="mt-1 text-sm text-white/50">
          {escaped
            ? 'The chopper lifts off as the horde floods the streets below. You made it out.'
            : deathCause
              ? DEATH_TEXT[deathCause]
              : 'Gone.'}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          <Stat label="Days" value={day} />
          <Stat label="Kills" value={kills} />
          <Stat label="Score" value={finalScore} />
        </div>

        <p className="mt-4 text-sm text-white/50">
          {escaped ? (
            <>
              {character?.name} escaped Singapore on day{' '}
              <span className="text-signal">{day}</span>
              {day > 1 ? (
                <>
                  {' '}
                  (×{mult.toFixed(1)} score mult)
                </>
              ) : null}
              .
            </>
          ) : (
            <>
              {character?.name} lasted <span className="text-signal">{day}</span>{' '}
              {day === 1 ? 'day' : 'days'} in the ruins of Singapore
              {day > 1 ? (
                <>
                  {' '}
                  (×{mult.toFixed(1)} score mult)
                </>
              ) : null}
              .
            </>
          )}
        </p>

        {highScores.length > 0 && (
          <div className="mt-6 text-left">
            <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">Leaderboard</h2>
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

        <button
          onClick={resetToMenu}
          className="mt-8 rounded-sm bg-signal/80 px-8 py-3 font-bold text-black hover:bg-signal"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/15 bg-concrete-900/80 py-3">
      <div className="text-2xl font-black text-signal tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
    </div>
  );
}
