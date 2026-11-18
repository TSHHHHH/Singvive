import type { InjuryEffect } from '../game/injuryEffects';
import type { useT } from '../i18n';

type T = ReturnType<typeof useT>['t'];

export function injuryEffectText(effect: InjuryEffect, t: T): string {
  return t(`ui.injury.effect.${effect.key}`, { n: effect.value });
}
