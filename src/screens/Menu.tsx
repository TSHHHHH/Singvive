import { useEffect, useState } from 'react';
import { fetchOnlineScores, type OnlineScore } from '../api/scores';
import { ScoreBoard, ScoreBoardTabs } from '../components/ScoreBoard';
import { useGame } from '../game/store';
import { useSettings } from '../game/settings';
import { LOCALES, useLocale, useT } from '../i18n';

export function Menu() {
  const { goToCharacter, continueRun, hasSavedRun, highScores } = useGame();
  const { t } = useT();
  const locale = useLocale();
  const setSetting = useSettings((s) => s.setSetting);
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
    <div className="relative flex min-h-full items-center justify-center p-6">
      <div
        className="absolute right-4 top-4 z-10 flex gap-1 sm:right-6 sm:top-6"
        role="group"
        aria-label={t('settings.language.label')}
      >
        {LOCALES.map((opt) => {
          const active = locale === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSetting('language', opt.id)}
              className={`rounded border px-2.5 py-1 text-xs transition ${
                active
                  ? 'border-signal bg-signal/15 text-signal'
                  : 'border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/70'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="w-full max-w-md text-center">
        <h1 className="mb-1 text-5xl font-black tracking-tight text-signal drop-shadow">
          SINGVIVE
        </h1>
        <p className="mb-2 text-sm uppercase tracking-[0.3em] text-white/40">
          {t('ui.menu.tagline')}
        </p>
        <p className="mb-8 text-xs text-white/45">{t('ui.menu.subtitle')}</p>

        <div className="mx-auto flex max-w-md flex-col gap-3">
          <button
            onClick={goToCharacter}
            className="rounded-sm bg-signal/80 px-6 py-3 font-bold text-black transition hover:bg-signal"
          >
            {t('ui.menu.newSurvivor')}
          </button>
          {hasSavedRun && (
            <button
              onClick={continueRun}
              className="rounded-sm border border-white/20 px-6 py-3 font-semibold text-white/80 transition hover:bg-white/5"
            >
              {t('ui.menu.continueRun')}
            </button>
          )}
        </div>

        <div className="mx-auto mt-8 max-w-md text-left">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">
            {t('ui.menu.topScores')}
          </h2>
          <ScoreBoardTabs value={tab} onChange={setTab} />
          {tab === 'world' ? (
            world === undefined ? (
              <p className="text-sm text-white/40">{t('ui.menu.loadingWorld')}</p>
            ) : world === null ? (
              <p className="text-sm text-white/40">{t('ui.menu.worldUnreachable')}</p>
            ) : (
              <ScoreBoard rows={world.slice(0, 10)} empty={t('ui.menu.noWorldScores')} />
            )
          ) : (
            <ScoreBoard rows={localRows} empty={t('ui.menu.noDeviceScores')} />
          )}
        </div>

        <p className="mx-auto mt-10 max-w-md text-xs leading-relaxed text-white/30">
          {t('ui.menu.blurb')}
        </p>
      </div>
    </div>
  );
}
