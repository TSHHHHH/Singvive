import type { LocationState } from '../game/types';

export type KnownFacilityKind = 'water' | 'shelter' | 'stove' | 'collector';

/** Presence is remembered; remote stock, heat and rain totals stay private. */
export function knownFacilityKinds(loc: Pick<LocationState, 'visited' | 'facilities'>): KnownFacilityKind[] {
  if (!loc.visited || !loc.facilities) return [];
  const kinds: KnownFacilityKind[] = [];
  if (loc.facilities.water) kinds.push('water');
  if (loc.facilities.rainShelter) kinds.push('shelter');
  if (loc.facilities.stove) kinds.push('stove');
  if (loc.facilities.collector) kinds.push('collector');
  return kinds;
}
