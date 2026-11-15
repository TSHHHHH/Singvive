import { useEffect, useMemo, useState } from 'react';
import { fetchOnlineScores, type OnlineScore } from '../api/scores';
import { ScoreBoard, ScoreBoardTabs } from '../components/ScoreBoard';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';
import { SettingsModal } from '../components/settings';
import { HowToPlayModal } from '../components/HowToPlayModal';
import { MenuBackdrop } from '../components/MenuBackdrop';
import { sceneFor } from '../map/menuScenes';
import { loadRun } from '../game/storage';
import { formatClock } from '../game/survival';
import { useClockFormat } from '../game/settings';

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
  const clock = useClockFormat();
  // What the Continue card shows. Read once per save slot change, not per render.
  const saved = useMemo(() => {
    if (!hasSavedRun) return null;
    const run = loadRun();
    if (!run) return null;
    const here = run.currentPositionId ? run.locations[run.currentPositionId] : undefined;
    // Out on the street (no site entered yet): name the spawn if still there.
    const atSpawn =
      Math.abs(run.currentPos.lat - run.spawn.lat) < 1e-4 && Math.abs(run.currentPos.lng - run.spawn.lng) < 1e-4;
    const evac = run.evacZoneId ? run.locations[run.evacZoneId] : undefined;
    return {
      name: run.character.name,
      day: run.day,
      hour: run.hour,
      place: here?.name ?? (atSpawn ? run.spawn.name : null),
      scene: sceneFor(run.currentPos, evac ? { lat: evac.lat, lng: evac.lng } : null),
    };
  }, [hasSavedRun]);
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
      <MenuBackdrop start={saved?.scene ?? null} />
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

      <div className="relative w-full max-w-md text-center">
        <h1 className="mb-1 text-banner text-signal drop-shadow">
          SINGVIVE
        </h1>
        <p className="mb-2 text-read uppercase tracking-marquee text-white/40">
          {t('ui.menu.tagline')}
        </p>
        <p className="mb-8 text-body text-white/45">{t('ui.menu.subtitle')}</p>

        <div className="mx-auto flex max-w-md flex-col gap-3">
          {saved && (
            <button
              onClick={continueRun}
              className="group rounded-sm bg-signal/85 px-5 py-3 text-left text-black transition hover:bg-signal"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-bold">{t('ui.menu.continueRun')}</span>
                <span className="shrink-0 text-body font-semibold tabular-nums text-black/60">
                  {t('ui.menu.continueDetail', { day: saved.day, time: formatClock(saved.hour, clock) })}
                </span>
              </span>
              <span className="mt-1 flex items-baseline justify-between gap-3 text-body">
                <span className="truncate font-semibold">{saved.name}</span>
                <span className="truncate text-black/60">{saved.place ?? t('ui.menu.unknownPlace')}</span>
              </span>
            </button>
          )}
          <button
            onClick={goToCharacter}
            className={
              saved
                ? 'rounded-sm border border-white/20 bg-black/30 px-6 py-3 font-semibold text-white/80 transition hover:bg-white/5'
                : 'rounded-sm bg-signal/80 px-6 py-3 font-bold text-black transition hover:bg-signal'
            }
          >
            {t('ui.menu.newSurvivor')}
          </button>
          {import.meta.env.MODE !== 'itch' && (
            <a
              href="/?coop=1"
              className="flex items-center justify-between gap-3 rounded-sm border border-white/15 bg-black/30 px-5 py-3 text-left text-read text-white/70 transition hover:border-white/40 hover:bg-white/5 hover:text-white"
            >
              <span>{t('ui.coop.menu')}</span>
              <span className="text-label uppercase text-white/40">{t('ui.coop.menuBadge')}</span>
            </a>
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
