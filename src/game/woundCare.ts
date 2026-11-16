import type { BodyPart, BodyPartId, BodyParts } from './types';

export type CareAction = 'bandage' | 'clean' | 'pain' | 'splint' | 'firstAid' | 'support';

export const CARE_MINUTES: Record<CareAction, number> = {
  bandage: 3, clean: 5, pain: 1, splint: 10, firstAid: 8, support: 1,
};
export const PAIN_RELIEF_HOURS = 4;
export const DRESSING_SOIL_HOURS = 12;
export const FRACTURE_RECOVERY_HOURS = 72;

/** Water and undisturbed shelter sleep support all tissue and fracture recovery. */
export function recoverySupportMultiplier(thirst: number, restQuality = 0): number {
  return (thirst < 35 ? 0.5 : 1) * (1 + Math.max(0, restQuality) * 0.5);
}

const PART_IDS: BodyPartId[] = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

export function careForItem(defId: string): CareAction | null {
  switch (defId) {
    case 'bandage': case 'improvised_bandage': case 'plasters': return 'bandage';
    case 'antiseptic': return 'clean';
    case 'painkillers': case 'tiger_balm': return 'pain';
    case 'splint': return 'splint';
    case 'medkit': case 'ifak_pouch': return 'firstAid';
    case 'vitamin_c': return 'support';
    default: return null;
  }
}

export function canCareForPart(part: BodyPart, action: CareAction): boolean {
  const injured = part.hp < part.maxHp || part.bleed !== 'none' || !!part.fractured || !!part.crippled;
  switch (action) {
    case 'bandage': return part.bleed !== 'none' || (injured && (part.wound === 'cut' || part.wound === 'deep') && part.dressing !== 'clean');
    case 'clean': return injured && !!part.dirty;
    case 'pain': return injured && (part.painReliefHours ?? 0) <= 0;
    case 'splint': return !!part.fractured && !part.splinted;
    case 'support': return injured && (part.recoveryBoostHours ?? 0) <= 0;
    case 'firstAid': return injured && (['bandage', 'clean', 'pain', 'splint'] as const).some((care) => canCareForPart(part, care));
  }
}

/** Improvised cloth buys bleeding control, but cannot improve an already stable dressing. */
export function canCareWithItem(part: BodyPart, defId: string): boolean {
  const action = careForItem(defId);
  return !!action && canCareForPart(part, action)
    && (defId !== 'improvised_bandage' || part.bleed !== 'none');
}

/** Prefer an emergency, then unsupported fractures, then the greatest relative loss. */
export function chooseCareTarget(parts: BodyParts, action: CareAction): BodyPartId | null {
  let target: BodyPartId | null = null;
  let best = -Infinity;
  for (const id of PART_IDS) {
    const part = parts[id];
    if (!canCareForPart(part, action)) continue;
    const score = (part.bleed === 'major' ? 100 : part.bleed === 'minor' ? 50 : 0)
      + (part.fractured && !part.splinted ? 10 : 0)
      + 1 - part.hp / Math.max(1, part.maxHp);
    if (score > best) { target = id; best = score; }
  }
  return target;
}

/** Care changes stabilization only. Invalid care preserves both record and part identity. */
export function applyCare(parts: BodyParts, id: BodyPartId, action: CareAction): BodyParts {
  const part = parts[id];
  if (!part || !canCareForPart(part, action)) return parts;
  let next: BodyPart;
  switch (action) {
    case 'support': {
      const supported = { ...parts };
      for (const partId of PART_IDS) {
        if (canCareForPart(parts[partId], 'support')) {
          supported[partId] = { ...parts[partId], recoveryBoostHours: 8 };
        }
      }
      return supported;
    }
    case 'bandage': next = { ...part, bleed: 'none', bleedHours: 0, dressing: 'clean', dressingHours: 0 }; break;
    case 'clean': next = { ...part, dirty: false }; break;
    case 'pain': next = { ...part, painReliefHours: PAIN_RELIEF_HOURS }; break;
    case 'splint': next = { ...part, splinted: true }; break;
    case 'firstAid': next = {
      ...part, bleed: 'none', bleedHours: 0, dirty: false,
      dressing: part.wound === 'bruise' && part.bleed === 'none' ? part.dressing : 'clean',
      dressingHours: 0, splinted: !!part.fractured || !!part.splinted,
      painReliefHours: PAIN_RELIEF_HOURS,
    }; break;
  }
  return { ...parts, [id]: next };
}
