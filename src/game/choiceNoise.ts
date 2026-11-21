import type { DisturbanceKind } from './disturbance';
import type { EventChoice, EventEffect } from './events';

/**
 * What a choice does to the street, read straight off its effects so the card
 * can say it before the player commits:
 *  - `loud`: picking it leaves a disturbance, whatever the dice say.
 *  - `riskLoud`: only failing the check does.
 *  - `quiet`: succeeding ends a disturbance (pulling the alarm).
 */
export type ChoiceNoise =
  | { tag: 'loud'; kind: DisturbanceKind }
  | { tag: 'riskLoud'; kind: DisturbanceKind }
  | { tag: 'quiet' };

function loudIn(effects: EventEffect[] | undefined, gunKind: DisturbanceKind): DisturbanceKind | null {
  for (const e of effects ?? []) {
    if (e.t === 'disturb') return e.kind;
    if (e.t === 'fireShot') return gunKind;
  }
  return null;
}

export function choiceNoise(choice: EventChoice, gunKind: DisturbanceKind = 'gunshot'): ChoiceNoise | null {
  const onWin = loudIn(choice.onSuccess, gunKind);
  if (choice.kind !== 'check') return onWin ? { tag: 'loud', kind: onWin } : null;
  const onLose = loudIn(choice.onFailure, gunKind);
  if (onWin) return { tag: 'loud', kind: onWin };
  if (choice.onSuccess.some((e) => e.t === 'quiet')) return { tag: 'quiet' };
  if (onLose) return { tag: 'riskLoud', kind: onLose };
  return null;
}
