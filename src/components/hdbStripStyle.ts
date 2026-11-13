import type { IconName } from '../icons/keys';
import type { HdbUnitType, SealKind } from '../game/hdbDungeon';

/**
 * Shared colours and icons for the HDB landing strips and their dock. The
 * bureau rule holds here too: greys for everything, red only for danger, cyan
 * only for what your senses read.
 */

export const SEAL_ICON: Record<SealKind, IconName> = {
  collapsed: 'hdb.sealedCollapsed',
  flooded: 'hdb.sealedFlooded',
  welded: 'hdb.sealedWelded',
  burnt: 'hdb.sealedBurnt',
};

/** Room icon ink: red for the rooms that can hurt you, signage white for the rest. */
export function unitFaceClass(type: HdbUnitType): string {
  if (type === 'trapped' || type === 'den' || type === 'burning' || type === 'nest') {
    return 'text-hiss';
  }
  if (type === 'notice') return 'text-signal';
  return 'text-concrete-200';
}

/**
 * Heat-meter fill per band index (Quiet → Swarm): grey warming to red, so a
 * hot landing never reads like the off-white "you are here" plate.
 */
export const BAND_FILL = [
  'bg-concrete-600',
  'bg-concrete-400',
  'bg-concrete-200',
  'bg-hiss/70',
  'bg-hiss',
];

export function bandText(idx: number, hunting: boolean): string {
  if (hunting || idx >= 3) return 'text-hiss';
  if (idx >= 1) return 'text-concrete-200';
  return 'text-concrete-400';
}
