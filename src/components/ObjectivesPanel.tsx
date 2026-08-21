import { Icon } from '../icons/Icon';
import { GuideInfoButton } from './GuideInfoButton';
import type { GuideTopic } from '../content/guideContent';
import type { EvacVibe } from '../game/goal';
import { useT } from '../i18n';

interface Props {
  evacZoneName: string | null;
  evacDist: number;
  atEvac: boolean;
  vibe: EvacVibe;
  vibeLine: string;
  dayMult: number;
  projectedScore: number;
  projectedEvacBonus: number;
  windowText: string | null;
  urgent: boolean;
  doom: number;
  doomColor: string;
  doomLabel: string;
  onEvac: () => void;
  onOpenGuide?: (topic: GuideTopic) => void;
}

const VIBE_FILL: Record<EvacVibe, string> = {
  thin: '#e8a54b',
  maybe: '#e8c54b',
  promising: '#7ec8a0',
};

/** Coarse bar only — never a percent that reverse-engineers demand. */
const VIBE_WIDTH: Record<EvacVibe, number> = {
  thin: 28,
  maybe: 55,
  promising: 82,
};

/**
 * The run's objectives in full: dual-path score (survive mult + extract),
 * fogged radio vibe (no quota numbers), doom clock.
 */
export function ObjectivesPanel({
  evacZoneName,
  evacDist,
  atEvac,
  vibe,
  vibeLine,
  dayMult,
  projectedScore,
  projectedEvacBonus,
  windowText,
  urgent,
  doom,
  doomColor,
  doomLabel,
  onEvac,
  onOpenGuide,
}: Props) {
  const { t } = useT();

  const reachBlurb = (() => {
    if (!evacZoneName) return null;
    const full = t('ui.objective.reachHaul', { zone: evacZoneName });
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
            <span className="text-sm font-bold text-concrete-50">{t('ui.objective.scoreLadder')}</span>
            {onOpenGuide && (
              <GuideInfoButton
                topic="evac"
                onOpen={onOpenGuide}
                label={t('ui.objective.evacAndScore')}
              />
            )}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-signal">
            {t('ui.objective.dayMult', { mult: dayMult.toFixed(1) })}
          </span>
        </div>
        <p className="mt-1 text-xs leading-snug text-white/50">{t('ui.objective.scoreBlurb')}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center">
          <div className="rounded bg-white/5 px-2 py-1.5">
            <div className="text-lg font-black tabular-nums text-concrete-50">
              {projectedScore}
            </div>
            <div className="text-2xs uppercase tracking-wide text-white/35">
              {t('ui.objective.ifYouDieNow')}
            </div>
          </div>
          <div className="rounded bg-signal/10 px-2 py-1.5">
            <div className="text-lg font-black tabular-nums text-signal">
              +{projectedEvacBonus}
            </div>
            <div className="text-2xs uppercase tracking-wide text-white/35">
              {t('ui.objective.evacBonus')}
            </div>
          </div>
        </div>
      </section>

      {/* ---- Extraction ---- */}
      <section className="rounded-lg border border-signal/40 bg-signal/[0.06] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-signal">
            <Icon name="action.evac" /> {t('ui.objective.escapeSingapore')}
          </span>
          <span className="shrink-0 text-xs text-white/40">
            {atEvac
              ? t('ui.objective.youAreHere')
              : evacZoneName
                ? t('ui.objective.metersAway', { m: evacDist })
                : '—'}
          </span>
        </div>
        {evacZoneName ? (
          <p className="mt-1 text-sm text-white/70">{reachBlurb}</p>
        ) : (
          <p className="mt-1 text-sm text-white/50">{t('ui.objective.noActiveWindow')}</p>
        )}

        {windowText && (
          <div
            className={`mt-2 text-xs font-semibold ${
              urgent ? 'animate-pulse text-hiss' : 'text-concrete-200'
            }`}
          >
            {t('ui.objective.windowCloses', { window: windowText })}
          </div>
        )}

        <div className="mt-3">
          <div className="flex items-center justify-between text-2xs uppercase tracking-wide text-white/40">
            <span>{t('ui.objective.radioRead')}</span>
            <span className="normal-case tracking-normal text-white/55">{vibeLine}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-black/50">
            <div
              className="h-full transition-all"
              style={{
                width: `${VIBE_WIDTH[vibe]}%`,
                background: VIBE_FILL[vibe],
              }}
            />
          </div>
          <p className="mt-1.5 text-2xs text-white/35">{t('ui.objective.radioBlurb')}</p>
        </div>

        {atEvac && (
          <button
            onClick={onEvac}
            className="mt-3 w-full rounded-lg bg-signal/80 py-2 text-sm font-bold text-black transition hover:bg-signal"
          >
            {t('ui.game.callEvac')}
          </button>
        )}
      </section>

      {/* ---- Doom clock ---- */}
      <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
        <div className="flex items-center justify-between text-2xs uppercase tracking-wide text-white/40">
          <span>{t('ui.objective.horde', { label: doomLabel })}</span>
          <span className="tabular-nums">{Math.round(doom)}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-black/50">
          <div
            className="h-full transition-all"
            style={{ width: `${Math.min(100, doom)}%`, background: doomColor }}
          />
        </div>
        <p className="mt-1.5 text-2xs text-white/30">{t('ui.objective.hordeBlurb')}</p>
      </section>
    </div>
  );
}
