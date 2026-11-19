import { useGame } from '../game/store';
import type { CrossingChoice } from '../game/crossingEvent';
import { useT } from '../i18n';

/** Shared by the timeline and phone map; GameScreen assigns a single host. */
export function PendingCrossingCard() {
  const crossing = useGame((s) => s.pendingCrossing);
  const choose = useGame((s) => s.chooseCrossing);
  const { t } = useT();
  if (!crossing) return null;

  return (
    <section className="space-y-2" aria-label={t('ui.crossing.title')}>
      <div className="text-label uppercase text-signal">{t('ui.crossing.title')}</div>
      <p className="text-body text-white/75">{t('ui.crossing.beforeDeparture')}</p>
      <ul className="space-y-1 text-body text-white/70">
        {crossing.hazards.map((hazard) => (
          <li key={hazard.id}>
            <span className="font-semibold text-concrete-50">{t(`ui.crossing.kind.${hazard.kind}`)}</span>
            {' · '}{t('ui.crossing.severity', { n: hazard.severity })}
            <p>{t(`ui.crossing.scene.${hazard.kind}`)}</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1">
        {(['careful', 'direct', 'withdraw'] as const).map((choice: CrossingChoice) => (
          <button
            key={choice}
            type="button"
            onClick={() => choose(crossing.id, choice)}
            className={`w-full rounded border px-2 py-1.5 text-left text-body transition ${
              choice === 'direct' ? 'border-hiss/50 text-hiss hover:bg-hiss/10'
                : choice === 'withdraw' ? 'border-white/15 text-white/65 hover:bg-white/5'
                  : 'border-signal/40 text-signal hover:bg-signal/10'
            }`}
          >
            <span className="block font-semibold">{t(`ui.crossing.choice.${choice}`)}</span>
            <span className="block text-label opacity-75">{t(`ui.crossing.detail.${choice}`, { minutes: crossing.carefulMinutes })}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
