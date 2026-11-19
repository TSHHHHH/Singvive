import { Icon } from '../icons/Icon';
import { GuideInfoButton } from './GuideInfoButton';
import type { GuideTopic } from '../content/guideContent';
import { useT } from '../i18n';

interface Props {
  evacZoneName: string | null;
  evacDist: number;
  atEvac: boolean;
  evacContacted: boolean;
  evacDisabled: boolean;
  evacCooldownHours: number | null;
  dayMult: number;
  projectedScore: number;
  projectedEvacBonus: number;
  windowText: string | null;
  urgent: boolean;
  onEvac: () => void;
  onLocateEvac: () => void;
  onOpenGuide?: (topic: GuideTopic) => void;
  /** Map notes in the backpack waiting to be deciphered. */
  intelNoteCount?: number;
  /** Active rumoured pins on the map. */
  rumourCount?: number;
}

/** Survival score and the published, two-step evacuation procedure. */
export function ObjectivesPanel({
  evacZoneName,
  evacDist,
  atEvac,
  evacContacted,
  evacDisabled,
  evacCooldownHours,
  dayMult,
  projectedScore,
  projectedEvacBonus,
  windowText,
  urgent,
  onEvac,
  onLocateEvac,
  onOpenGuide,
  intelNoteCount = 0,
  rumourCount = 0,
}: Props) {
  const { t } = useT();

  const reachBlurb = (() => {
    if (!evacZoneName) return null;
    const full = t('ui.objective.reach', { zone: evacZoneName });
    const idx = full.indexOf(evacZoneName);
    if (idx < 0) return full;
    return (
      <>
        {full.slice(0, idx)}
        <span className="font-semibold text-signal">{evacZoneName}</span>
        {full.slice(idx + evacZoneName.length)}
      </>
    );
  })();

  return (
    <div className="flex flex-col gap-3">
      {/* ---- Score ladder ---- */}
      <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-read font-bold text-concrete-50">{t('ui.objective.scoreLadder')}</span>
            {onOpenGuide && (
              <GuideInfoButton
                topic="evac"
                onOpen={onOpenGuide}
                label={t('ui.objective.evacAndScore')}
              />
            )}
          </div>
          <span className="shrink-0 text-body tabular-nums text-signal">
            {t('ui.objective.dayMult', { mult: dayMult.toFixed(1) })}
          </span>
        </div>
        <p className="mt-1 text-body text-white/50">{t('ui.objective.scoreBlurb')}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center">
          <div className="rounded bg-white/5 px-2 py-1.5">
            <div className="text-title tabular-nums text-concrete-50">
              {projectedScore}
            </div>
            <div className="text-label uppercase text-white/35">
              {t('ui.objective.ifYouDieNow')}
            </div>
          </div>
          <div className="rounded bg-signal/10 px-2 py-1.5">
            <div className="text-title tabular-nums text-signal">
              +{projectedEvacBonus}
            </div>
            <div className="text-label uppercase text-white/35">
              {t('ui.objective.evacBonus')}
            </div>
          </div>
        </div>
      </section>

      {/* ---- Extraction ---- */}
      <section className="rounded-lg border border-signal/40 bg-signal/[0.06] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-read font-bold text-signal">
            <Icon name="action.evac" /> {t('ui.objective.escapeSingapore')}
          </span>
          <span className="shrink-0 text-body text-white/40">
            {atEvac
              ? t('ui.objective.youAreHere')
              : evacZoneName
                ? t('ui.objective.metersAway', { m: evacDist })
                : '—'}
          </span>
        </div>
        {evacZoneName ? (
          <p className="mt-1 text-read text-white/70">{reachBlurb}</p>
        ) : (
          <p className="mt-1 text-read text-white/50">{t('ui.objective.noActiveWindow')}</p>
        )}

        {windowText && (
          <div
            className={`mt-2 text-body font-semibold ${
              urgent ? 'animate-pulse text-hiss' : 'text-concrete-200'
            }`}
          >
            {t('ui.objective.windowCloses', { window: windowText })}
          </div>
        )}

        {!evacZoneName && evacCooldownHours != null && (
          <p className="mt-2 text-body tabular-nums text-concrete-200">
            {t('ui.objective.nextWindowIn', { hours: evacCooldownHours })}
          </p>
        )}
        <p className="mt-3 text-body text-white/65">{t('ui.objective.procedure')}</p>
        {evacZoneName && (
          <p className="mt-2 text-body text-signal">
            {t(evacContacted ? 'ui.objective.readyToBoard' : 'ui.objective.reportAtPoint')}
          </p>
        )}
        <button
          type="button"
          onClick={onLocateEvac}
          disabled={!evacZoneName}
          className="mt-3 w-full rounded-lg border border-signal/40 py-2 text-body text-signal transition hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Icon name="action.target" /> {t('ui.objective.locateEvac')}
        </button>

        {atEvac && (
          <button
            type="button"
            onClick={onEvac}
            disabled={evacDisabled}
            className="mt-3 w-full rounded-lg bg-signal/80 py-2 text-read font-bold text-black transition hover:bg-signal disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t(evacContacted ? 'ui.game.callEvac' : 'ui.game.raiseChannel')}
          </button>
        )}
      </section>

      {(intelNoteCount > 0 || rumourCount > 0) && (
        <section className="rounded-lg border border-[#c4b07a]/30 bg-[#c4b07a]/[0.06] p-3">
          <p className="text-label uppercase text-[#c4b07a]/80">
            {t('ui.objective.leadsTitle')}
          </p>
          <p className="mt-1 text-read text-white/70">
            {intelNoteCount > 0 && rumourCount > 0
              ? t('ui.objective.leadsBoth', { notes: intelNoteCount, rumours: rumourCount })
              : intelNoteCount > 0
                ? t('ui.objective.leadsNotes', { count: intelNoteCount })
                : t('ui.objective.leadsRumours', { count: rumourCount })}
          </p>
          <p className="mt-1.5 text-micro text-white/35">{t('ui.objective.leadsBlurb')}</p>
        </section>
      )}

    </div>
  );
}
