import type { IconName } from '../icons/keys';
import type { HdbUnitType, SealKind } from '../game/hdbDungeon';

/** Shared colours and icons for the HDB landing strips and their dock. */

export const SEAL_ICON: Record<SealKind, IconName> = {
  collapsed: 'hdb.sealedCollapsed',
  flooded: 'hdb.sealedFlooded',
  welded: 'hdb.sealedWelded',
  burnt: 'hdb.sealedBurnt',
};

export function unitFaceClass(type: HdbUnitType): string {
  if (type === 'trapped' || type === 'den') return 'text-hiss';
  if (type === 'burning' || type === 'nest') return 'text-amber-400';
  if (type === 'holdout' || type === 'shelter') return 'text-astral';
  if (type === 'notice') return 'text-signal';
  return 'text-concrete-100';
}

/** Heat-meter fill per band index (Quiet → Swarm). */
export const BAND_FILL = ['bg-concrete-400', 'bg-signal', 'bg-signal', 'bg-hiss', 'bg-hiss'];

export function bandText(idx: number, hunting: boolean): string {
  if (hunting || idx >= 3) return 'text-hiss';
  if (idx >= 1) return 'text-signal';
  return 'text-concrete-300';
}
