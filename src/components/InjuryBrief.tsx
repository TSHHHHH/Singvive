import type { CSSProperties } from 'react';
import type { BodyPartId, BodyParts } from '../game/types';
import { injuredPartIds, partInjuryEffects } from '../game/injuryEffects';
import { injuryEffectText } from './injuryCopy';
import { useT } from '../i18n';
import { Icon } from '../icons/Icon';
import { tip } from './tips';

type T = ReturnType<typeof useT>['t'];

/** Status words that matter more than any number: bleeding, a break, an infected wound. */
function partFlags(parts: BodyParts, id: BodyPartId, t: T): string[] {
  const p = parts[id];
  const out: string[] = [];
  if (p.bleed !== 'none') out.push(t('ui.injury.bleeding'));
  if (p.fractured) out.push(t('ui.injury.fractured'));
  if (p.woundInfected) out.push(t('ui.injury.infected'));
  return out;
}

/**
 * The pre-fight line: every hurt part, what is wrong with it and what it costs,
 * in the same numbers the fight will use. Renders nothing for a whole body.
 */
export function InjuryBrief({ parts, className = '', style }: { parts: BodyParts; className?: string; style?: CSSProperties }) {
  const { t } = useT();
  const ids = injuredPartIds(parts).filter((id) =>
    partInjuryEffects(parts, id).length > 0 || partFlags(parts, id, t).length > 0);
  if (ids.length === 0) return null;
  return (
    <div className={`text-micro text-white/55 ${className}`} style={style} data-injury-brief="">
      <div className="font-semibold text-hiss/90" {...tip(t('ui.injury.preFightTip'))}>
        <Icon name="status.bleeding" size={11} className="mr-0.5 inline-block align-[-0.125em]" />
        {t('ui.injury.preFight')}
      </div>
      <ul className="mt-0.5 space-y-0.5">
        {ids.map((id) => {
          const flags = partFlags(parts, id, t);
          const effects = partInjuryEffects(parts, id).map((e) => injuryEffectText(e, t));
          return (
            <li key={id} className="flex flex-wrap gap-x-1.5">
              <span className="text-concrete-100">{t(`ui.body.parts.${id}`)}</span>
              {flags.map((f) => <span key={f} className="text-hiss">{f}</span>)}
              {effects.map((e) => <span key={e} className="whitespace-nowrap">{e}</span>)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
