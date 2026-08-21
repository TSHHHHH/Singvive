import { useEffect, useState } from 'react';
import {
  fetchOnlineScores,
  submitDedupeKey,
  submitOnlineScoreOnce,
  type OnlineScore,
} from '../api/scores';
import { ScoreBoard } from '../components/ScoreBoard';
import { useGame } from '../game/store';
import { DEATH_TEXT, scoreDayMult } from '../game/survival';
import { useT } from '../i18n';
import type { TVars } from '../i18n';

type WorldStatus = 'pending' | 'ok' | 'offline' | 'limited' | 'invalid';

export function DeathScreen() {
  const {
    deathCause,
    finalScore,
    day,
    kills,
    highScores,
    character,
    escaped,
    seed,
    resetToMenu,
  } = useGame();
  const { t } = useT();
  const mult = scoreDayMult(day);
  const [world, setWorld] = useState<OnlineScore[] | null | undefined>(undefined);
  const [worldStatus, setWorldStatus] = useState<WorldStatus>('pending');
  const [postedId, setPostedId] = useState<number | undefined>(undefined);
  const [rank, setRank] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const key = submitDedupeKey(seed, finalScore, escaped);

    void (async () => {
      if (!seed) {
        setWorldStatus('offline');
      } else {
        const result = await submitOnlineScoreOnce(key, {
          name: character?.name ?? 'Survivor',
          days: day,
          score: finalScore,
          cause: escaped
            ? 'Escaped Singapore by evac.'
            : deathCause
              ? DEATH_TEXT[deathCause]
              : 'Gone.',
          seed,
          escaped,
        });
        if (cancelled) return;
        if (result.ok) {
          setPostedId(result.id);
          setRank(result.rank);
          setWorldStatus('ok');
        } else {
          setWorldStatus(result.reason);
        }
      }

      const list = await fetchOnlineScores();
      if (!cancelled) setWorld(list);
    })();

    return () => {
      cancelled = true;
    };
  }, [character?.name, day, deathCause, escaped, finalScore, seed]);

  const localRows = highScores.slice(0, 5).map((h) => ({
    name: h.name,
    days: h.days,
    score: h.score,
    escaped: h.cause === 'Escaped Singapore by evac.',
  }));

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-2 text-6xl">{escaped ? '🚁' : '💀'}</div>
        <h1 className={`text-3xl font-black ${escaped ? 'text-signal' : 'text-hiss'}`}>
          {escaped ? t('ui.death.escaped') : t('ui.death.died')}
        </h1>
        <p className="mt-1 text-sm text-white/50">
          {escaped
            ? t('ui.death.escapeBlurb')
            : deathCause
              ? DEATH_TEXT[deathCause]
              : t('ui.death.gone')}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          <Stat label={t('ui.death.days')} value={day} />
          <Stat label={t('ui.death.kills')} value={kills} />
          <Stat label={t('ui.death.score')} value={finalScore} />
        </div>

        <p className="mt-4 text-sm text-white/50">
          {escaped ? (
            <>
              {character?.name} escaped Singapore on day{' '}
              <span className="text-signal">{day}</span>
              {day > 1 ? <> (×{mult.toFixed(1)} score mult)</> : null}.
            </>
          ) : (
            <>
              {character?.name} lasted <span className="text-signal">{day}</span>{' '}
              {day === 1 ? 'day' : 'days'} in the ruins of Singapore
              {day > 1 ? <> (×{mult.toFixed(1)} score mult)</> : null}.
            </>
          )}
        </p>

        <p className="mt-3 text-xs text-white/40">{statusCopy(worldStatus, rank, t)}</p>

        {localRows.length > 0 && (
          <div className="mt-6 text-left">
            <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">
              {t('ui.death.thisDevice')}
            </h2>
            <ScoreBoard rows={localRows} />
          </div>
        )}

        <div className="mt-6 text-left">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">
            {t('ui.death.worldwide')}
          </h2>
          {world === undefined ? (
            <p className="text-sm text-white/40">{t('ui.death.loadingWorld')}</p>
          ) : world === null ? (
            <p className="text-sm text-white/40">{t('ui.death.worldUnreachable')}</p>
          ) : (
            <ScoreBoard
              rows={world.slice(0, 10)}
              highlightId={postedId}
              empty={t('ui.death.noWorldScores')}
            />
          )}
        </div>

        <button
          onClick={resetToMenu}
          className="mt-8 rounded-sm bg-signal/80 px-8 py-3 font-bold text-black hover:bg-signal"
        >
          {t('ui.death.tryAgain')}
        </button>
      </div>
    </div>
  );
}

function statusCopy(
  status: WorldStatus,
  rank: number | undefined,
  t: (key: string, vars?: TVars) => string,
): string {
  if (status === 'pending') return t('ui.death.posting');
  if (status === 'ok' && rank != null) return t('ui.death.rank', { rank });
  if (status === 'ok') return t('ui.death.posted');
  if (status === 'limited') return t('ui.death.rateLimited');
  if (status === 'invalid') return t('ui.death.invalid');
  return t('ui.death.unreachableSaved');
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/15 bg-concrete-900/80 py-3">
      <div className="text-2xl font-black text-signal tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
    </div>
  );
}
