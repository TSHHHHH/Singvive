import { isCarried } from '../game/inventory';
import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { ATTRIBUTE_ICONS } from '../game/character';
import type { ChoiceKind, GameEvent } from '../game/events';
import type { IconName } from '../icons/keys';
import { formatClock } from '../game/survival';
import { useClockFormat } from '../game/settings';
import { useT } from '../i18n';
import { canFireHolstered } from '../game/firearms';
import { choiceNoise, type ChoiceNoise } from '../game/choiceNoise';
import { disturbanceSpec } from '../game/disturbance';
import { useMemo } from 'react';
import { rollWeather, timeOfDay } from '../game/weather';
import { Rng } from '../game/rng';

/** A small speaker, in the same stroke as the HUD's nearby-noise mark. */
export function NoiseGlyph({ size = 12, loud = true }: { size?: number; loud?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M4 9h3l5-4v14l-5-4H4z" />
      {loud ? <><path d="M16 8.5a5 5 0 0 1 0 7" /><path d="M19 5.5a9 9 0 0 1 0 13" /></> : <path d="M16 10l4 4m0-4l-4 4" />}
    </svg>
  );
}

/** One line under a choice saying what it does to the street. */
function NoiseTag({ noise }: { noise: ChoiceNoise }) {
  const { t } = useT();
  const hour = useGame((s) => s.hour);
  const seed = useGame((s) => s.seed);
  const day = useGame((s) => s.day);
  const wet = useMemo(() => {
    const w = rollWeather(new Rng(seed), day);
    return w === 'rain' || w === 'thunderstorm';
  }, [seed, day]);
  if (noise.tag === 'quiet') {
    return (
      <span className="mt-0.5 flex items-center gap-1 text-micro text-astral">
        <NoiseGlyph loud={false} />{t('ui.disturbance.tagQuiet')}
      </span>
    );
  }
  const spec = disturbanceSpec(noise.kind, { night: timeOfDay(hour) === 'night', wet });
  const vars = { m: spec.radiusM, h: Math.round(spec.hours * 10) / 10 };
  return (
    <span className={`mt-0.5 flex items-center gap-1 text-micro ${noise.tag === 'loud' ? 'text-hiss' : 'text-white/45'}`}>
      <NoiseGlyph />{t(noise.tag === 'loud' ? 'ui.disturbance.tagLoud' : 'ui.disturbance.tagRisk', vars)}
    </span>
  );
}

/** One glyph per kind of choice, so a decision reads before it's read. */
export const CHOICE_ICON: Record<ChoiceKind, IconName> = {
  check: 'choice.check',
  pay: 'choice.pay',
  fight: 'choice.fight',
  leave: 'choice.leave',
};

/**
 * Choice buttons for a pending story event — shared by the timeline live node
 * and the phone map interrupt card.
 */
export function PendingEventChoices({
  event,
  className = '',
}: {
  event: GameEvent;
  className?: string;
}) {
  const items = useGame((s) => s.items);
  const loadedGun = useGame((s) => canFireHolstered(s.equipment));
  const gunKind = useGame((s) => (s.equipment.firearm?.defId === 'shotgun' ? 'shotgun' : 'gunshot'));
  const resolveEvent = useGame((s) => s.resolveEvent);
  const { t } = useT();

  const hasItem = (defId?: string) =>
    !defId || items.some((i) => isCarried(i.container) && i.defId === defId);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {event.choices.map((c) => {
        const affordable =
          (c.kind !== 'pay' || !!c.itemIds?.some((id) => hasItem(id)))
          && (c.needs !== 'loadedGun' || loadedGun);
        const noise = choiceNoise(c, gunKind);
        const tone =
          c.kind === 'fight'
            ? 'border-hiss/50 text-hiss hover:bg-hiss/10'
            : c.kind === 'leave'
              ? 'border-white/15 text-white/60 hover:bg-white/5'
              : 'border-signal/40 text-signal hover:bg-signal/10';
        const check =
          c.kind === 'check' && c.attr && c.dc != null
            ? { attr: c.attr, dc: c.dc }
            : null;
        return (
          <button
            key={c.id}
            type="button"
            disabled={!affordable}
            onClick={() => resolveEvent(c.id)}
            className={`flex w-full items-center gap-1.5 rounded border px-2 py-1 text-left text-body transition disabled:opacity-30 ${tone}`}
          >
            <Icon name={CHOICE_ICON[c.kind]} size={13} className="shrink-0" />
            <span className="min-w-0 flex-1 whitespace-normal break-words">
              {c.label}
              {c.kind === 'pay' && !affordable && (
                <span className="ml-1 text-hiss">{t('ui.pending.youHaveNone')}</span>
              )}
              {c.needs === 'loadedGun' && !loadedGun && (
                <span className="ml-1 text-hiss">{t('ui.disturbance.needsGun')}</span>
              )}
              {noise && <NoiseTag noise={noise} />}
            </span>
            {check && (
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums opacity-60">
                <Icon
                  name={ATTRIBUTE_ICONS[check.attr]}
                  size={12}
                  title={t(`ui.attributes.${check.attr}`)}
                />
                {t('ui.pending.dc', { n: check.dc })}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The same decision appears in the timeline or on the phone map. */
export function PendingEventCardBody({ event }: { event: GameEvent }) {
  const hour = useGame((s) => s.hour);
  const clock = useClockFormat();
  const { t } = useT();
  return (
    <div className="space-y-2">
      <p className="text-body font-semibold text-concrete-50">
        <span className="mr-1.5 text-micro tabular-nums text-white/35">{formatClock(hour, clock)}</span>
        {event.kind === 'smoke_block' ? t('ui.pending.smokeBrief') : event.title}
      </p>
      <PendingEventChoices event={event} />
      {event.text && (
        <details key={event.text} className="text-body text-white/65">
          <summary className="cursor-pointer text-label">{t('ui.pending.sceneDetails')}</summary>
          <p className="mt-1">{event.text}</p>
        </details>
      )}
    </div>
  );
}
