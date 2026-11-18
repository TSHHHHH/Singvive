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

// ---------- Open wounds: closing, the max-HP they hold back, infection ----------

/** Recovery-equivalent hours a wound needs to close at the dressed, clean rate. */
export const WOUND_CLOSE_HOURS = { cut: 12, deep: 36 } as const;
/** Share of the part's max HP an open wound holds back until it closes. */
export const WOUND_MAX_HP_LOSS = { cut: 0.12, deep: 0.25 } as const;
/** An open wound is checked for infection each time it has gone this long without closing. */
export const WOUND_INFECT_CHECK_HOURS = 24;
/** Infected wounds recover and close at this share of their normal rate. */
export const INFECTED_RECOVERY_MULT = 0.35;
/** One course of antibiotics clears infected wounds and covers new checks for this long. */
export const ANTIBIOTIC_COVER_HOURS = 24;

export function isOpenWound(part: BodyPart): part is BodyPart & { wound: 'cut' | 'deep' } {
  return part.wound === 'cut' || part.wound === 'deep';
}

/** Highest HP the part can hold while its wound is open (its own max once closed). */
export function openWoundCap(part: BodyPart): number {
  if (!isOpenWound(part) || part.maxHp < 2) return part.maxHp;
  return Math.min(part.maxHp - 1, Math.floor(part.maxHp * (1 - WOUND_MAX_HP_LOSS[part.wound])));
}

/** Max HP an open wound is holding back right now (0 when none). */
export function openWoundHpLoss(part: BodyPart): number {
  return part.maxHp - openWoundCap(part);
}

/** How fast the wound closes: a clean dressing helps most; dirt and infection hold it open. */
export function woundCloseRate(part: BodyPart): number {
  const dressing = part.dressing === 'clean' ? 1 : part.dressing === 'soiled' ? 0.8 : 0.55;
  return dressing * (part.dirty ? 0.8 : 1) * (part.woundInfected ? INFECTED_RECOVERY_MULT : 1);
}

/**
 * Chance an open wound turns at a daily check. Cleaning (antiseptic, first-aid
 * kit) or antibiotic cover cuts it hard; a dressing on a dirty wound only
 * helps somewhat.
 */
export function woundInfectChance(part: BodyPart): number {
  if (!isOpenWound(part) || part.woundInfected) return 0;
  const base = !part.dirty ? 0.08
    : part.dressing && part.dressing !== 'none' ? 0.3
      : 0.5;
  const cover = (part.antibioticHours ?? 0) > 1e-9 ? 0.2 : 1;
  return base * (part.wound === 'deep' ? 1.2 : 1) * cover;
}

/** Deterministic roll for check `k` (1, 2, …) of a wound seeded with `seed`. */
export function woundCheckRoll(seed: number, k: number): number {
  const x = Math.sin((seed * 9973 + k * 7919.13) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** A course of antibiotics: clears wound infection and covers every part for a day. */
export function applyAntibiotics(parts: BodyParts): BodyParts {
  const next = { ...parts };
  for (const id of PART_IDS) {
    next[id] = { ...parts[id], woundInfected: false, antibioticHours: ANTIBIOTIC_COVER_HOURS };
  }
  return next;
}
