import { useEffect, useState } from 'react';
import { fetchOnlineScores, type OnlineScore } from '../api/scores';
import { ScoreBoard, ScoreBoardTabs } from '../components/ScoreBoard';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';
import { SettingsModal } from '../components/settings';
import { HowToPlayModal } from '../components/HowToPlayModal';

export function Menu() {
  const { goToCharacter, continueRun, hasSavedRun, highScores } = useGame(
    useShallow((s) => ({
      goToCharacter: s.goToCharacter,
      continueRun: s.continueRun,
      hasSavedRun: s.hasSavedRun,
      highScores: s.highScores,
    })),
  );
  const { t } = useT();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
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
      {/* Language used to sit here as bare pills. It is the first row of the
          first Settings tab now, so a reader who cannot parse the UI still only
          has one thing to find. */}
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-body text-white/60 transition hover:border-white/30 hover:text-white sm:right-6 sm:top-6"
      >
        <Icon name="action.settings" size={14} /> {t('ui.log.settings')}
      </button>

      <div className="w-full max-w-md text-center">
        <h1 className="mb-1 text-banner text-signal drop-shadow">
          SINGVIVE
        </h1>
        <p className="mb-2 text-read uppercase tracking-marquee text-white/40">
          {t('ui.menu.tagline')}
        </p>
        <p className="mb-8 text-body text-white/45">{t('ui.menu.subtitle')}</p>

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
          <h2 className="mb-2 text-plate uppercase text-white/40">
            {t('ui.menu.topScores')}
          </h2>
          <ScoreBoardTabs value={tab} onChange={setTab} />
          {tab === 'world' ? (
            world === undefined ? (
              <p className="text-read text-white/40">{t('ui.menu.loadingWorld')}</p>
            ) : world === null ? (
              <p className="text-read text-white/40">{t('ui.menu.worldUnreachable')}</p>
            ) : (
              <ScoreBoard rows={world.slice(0, 10)} empty={t('ui.menu.noWorldScores')} />
            )
          ) : (
            <ScoreBoard rows={localRows} empty={t('ui.menu.noDeviceScores')} />
          )}
        </div>

        <p className="mx-auto mt-10 max-w-md text-body leading-relaxed text-white/30">
          {t('ui.menu.blurb')}
        </p>
      </div>

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onReviewGuide={() => setHowToPlayOpen(true)}
        />
      )}
      {howToPlayOpen && <HowToPlayModal onClose={() => setHowToPlayOpen(false)} />}
    </div>
  );
}
