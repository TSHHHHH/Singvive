/**
 * In-run passive skills — soft funnel between traits and mechanical mods.
 * Levels die with the run. Books grant big XP; practice XP is event-based
 * with a soft daily cap (Project Zomboid-inspired, deliberately shorter).
 */

import type { SkillDayXp, SkillId, SkillProgress, SkillsState } from './types';
import { getTraits } from './character';

export type { SkillDayXp, SkillId, SkillProgress, SkillsState };

export const SKILL_IDS: readonly SkillId[] = [
  'fighting',
  'shooting',
  'fitness',
  'scavenging',
  'medicine',
  'trades',
  'stealth',
];

export const SKILL_MAX_LEVEL = 5;

export const SKILL_LABELS: Record<SkillId, string> = {
  fighting: 'Fighting',
  shooting: 'Shooting',
  fitness: 'Fitness',
  scavenging: 'Scavenging',
  medicine: 'Medicine',
  trades: 'Trades',
  stealth: 'Stealth',
};

export const SKILL_BLURBS: Record<SkillId, string> = {
  fighting: 'Melee attack, defence, and dodging.',
  shooting: 'Firearm accuracy and handling.',
  fitness: 'Travel pace, stamina, and carry grit.',
  scavenging: 'Search speed, finds, and haul value.',
  medicine: 'Healing, infection resist, and clotting.',
  trades: 'Crafting cost and HDB site work.',
  stealth: 'Quieter travel and fewer ambushes.',
};

/**
 * XP required to advance from `level` → `level + 1`.
 * Early levels are cheap; 4→5 is rare without books.
 */
export const XP_TO_NEXT: readonly number[] = [15, 30, 50, 80, 120];

/** Soft daily cap on practice XP per skill (books ignore this). */
export const PRACTICE_DAILY_CAP = 25;

/** Book tier 1..4 — higher tiers need a higher current skill level to read. */
export type SkillBookTier = 1 | 2 | 3 | 4;

export const BOOK_MIN_LEVEL: Record<SkillBookTier, number> = {
  1: 0,
  2: 2,
  3: 3,
  4: 4,
};

/** Hours spent reading a book of this tier. */
export const BOOK_HOURS: Record<SkillBookTier, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
};

/**
 * Flat XP when already at/above the book's tier ceiling.
 * Below the ceiling, reading grants one full level instead.
 */
export const BOOK_XP_CHUNK: Record<SkillBookTier, number> = {
  1: 40,
  2: 70,
  3: 100,
  4: 140,
};

/** Mechanical package contributed by skill levels (stacked with traits + gear). */
export interface SkillMods {
  attackMod: number;
  defenseMod: number;
  dodgeMod: number;
  zombieAttackMod: number;
  infectionResist: number;
  nightAccuracyExtra: number;
  /** Flat accuracy added to firearm attack rolls. */
  shootingAccuracy: number;
  lootMod: number;
  searchBonusMod: number;
  searchSpeedMod: number;
  lootValueMod: number;
  healBonus: number;
  bleedStopBonus: number;
  legHealMod: number;
  travelSpeedMod: number;
  energyDrainMod: number;
  carryCapacityMod: number;
  craftCostMod: number;
  hdbPickMod: number;
  hdbBreachMinutesMult: number;
  hdbDoorHeatMult: number;
  encounterChanceMod: number;
  ambushChanceMod: number;
}

const ZERO_MODS: SkillMods = {
  attackMod: 0,
  defenseMod: 0,
  dodgeMod: 0,
  zombieAttackMod: 0,
  infectionResist: 0,
  nightAccuracyExtra: 0,
  shootingAccuracy: 0,
  lootMod: 0,
  searchBonusMod: 0,
  searchSpeedMod: 0,
  lootValueMod: 0,
  healBonus: 0,
  bleedStopBonus: 0,
  legHealMod: 0,
  travelSpeedMod: 0,
  energyDrainMod: 0,
  carryCapacityMod: 0,
  craftCostMod: 0,
  hdbPickMod: 0,
  hdbBreachMinutesMult: 0,
  hdbDoorHeatMult: 0,
  encounterChanceMod: 0,
  ambushChanceMod: 0,
};

/** Per-level packages — cumulative sum from 1..level. */
const LEVEL_PACKAGES: Record<SkillId, Partial<SkillMods>[]> = {
  fighting: [
    { attackMod: 1 },
    { attackMod: 1, defenseMod: 1 },
    { attackMod: 1, dodgeMod: 0.02 },
    { attackMod: 1, defenseMod: 1, zombieAttackMod: 1 },
    { attackMod: 1, defenseMod: 1, dodgeMod: 0.02 },
  ],
  shooting: [
    { shootingAccuracy: 1 },
    { shootingAccuracy: 1, nightAccuracyExtra: 1 },
    { shootingAccuracy: 1 },
    { shootingAccuracy: 2 },
    { shootingAccuracy: 1, nightAccuracyExtra: 1 },
  ],
  fitness: [
    { travelSpeedMod: 0.05 },
    { travelSpeedMod: 0.05, energyDrainMod: -0.05 },
    { carryCapacityMod: 2 },
    { travelSpeedMod: 0.05, energyDrainMod: -0.05 },
    { travelSpeedMod: 0.05, carryCapacityMod: 2 },
  ],
  scavenging: [
    { searchSpeedMod: 0.05 },
    { lootMod: 1 },
    { searchBonusMod: 1, searchSpeedMod: 0.05 },
    { lootValueMod: 0.05 },
    { lootMod: 1, searchSpeedMod: 0.05 },
  ],
  medicine: [
    { healBonus: 2 },
    { infectionResist: 0.05 },
    { healBonus: 2, bleedStopBonus: 0.5 },
    { infectionResist: 0.05, legHealMod: 0.1 },
    { healBonus: 3, bleedStopBonus: 0.5 },
  ],
  trades: [
    { craftCostMod: -1 },
    { hdbPickMod: 1 },
    { hdbBreachMinutesMult: -0.1 },
    { hdbDoorHeatMult: -0.1, craftCostMod: -1 },
    { hdbPickMod: 1, hdbBreachMinutesMult: -0.1 },
  ],
  stealth: [
    { encounterChanceMod: -0.05 },
    { ambushChanceMod: -0.1 },
    { encounterChanceMod: -0.05, hdbDoorHeatMult: -0.1 },
    { ambushChanceMod: -0.1 },
    { encounterChanceMod: -0.05, ambushChanceMod: -0.1 },
  ],
};

export function emptySkills(): SkillsState {
  const out = {} as SkillsState;
  for (const id of SKILL_IDS) out[id] = { level: 0, xp: 0 };
  return out;
}

export function emptySkillDayXp(day = 1): SkillDayXp {
  return { day, gained: {} };
}

export function xpToNext(level: number): number | null {
  if (level < 0 || level >= SKILL_MAX_LEVEL) return null;
  return XP_TO_NEXT[level] ?? null;
}

export function clampSkillLevel(n: number): number {
  return Math.max(0, Math.min(SKILL_MAX_LEVEL, Math.round(n)));
}

function addPartial(dst: SkillMods, src: Partial<SkillMods>): void {
  for (const [k, v] of Object.entries(src) as [keyof SkillMods, number][]) {
    if (typeof v === 'number') dst[k] += v;
  }
}

/** Sum level packages for the given skills. */
export function skillMods(skills: SkillsState): SkillMods {
  const out: SkillMods = { ...ZERO_MODS };
  for (const id of SKILL_IDS) {
    const level = clampSkillLevel(skills[id]?.level ?? 0);
    const packages = LEVEL_PACKAGES[id];
    for (let i = 0; i < level; i++) {
      const pack = packages[i];
      if (pack) addPartial(out, pack);
    }
  }
  return out;
}

/**
 * Starting skill levels from traits (`skillStart` summed, clamped).
 * XP mults are applied later in `gainSkillXp`.
 */
export function skillsFromTraits(traitIds: string[]): SkillsState {
  const skills = emptySkills();
  const starts: Partial<Record<SkillId, number>> = {};
  for (const t of getTraits(traitIds)) {
    if (!t.skillStart) continue;
    for (const id of SKILL_IDS) {
      const n = t.skillStart[id];
      if (typeof n === 'number') starts[id] = (starts[id] ?? 0) + n;
    }
  }
  for (const id of SKILL_IDS) {
    skills[id] = { level: clampSkillLevel(starts[id] ?? 0), xp: 0 };
  }
  return skills;
}

/** Preview starting levels for the create screen (same as skillsFromTraits). */
export function previewStartingSkills(traitIds: string[]): SkillsState {
  return skillsFromTraits(traitIds);
}

export function traitSkillXpMult(traitIds: string[], skill: SkillId): number {
  let mult = 1;
  for (const t of getTraits(traitIds)) {
    const m = t.skillXpMult?.[skill];
    if (typeof m === 'number') mult *= m;
  }
  return Math.max(0.25, Math.min(2, mult));
}

export interface GainSkillXpResult {
  skills: SkillsState;
  dayXp: SkillDayXp;
  /** XP actually applied after caps / mult. */
  applied: number;
  leveled: boolean;
  /** True when the daily practice cap blocked further gain. */
  capped: boolean;
}

/**
 * Apply practice or book XP. Practice respects the daily soft cap;
 * set `ignoreDailyCap` for books.
 */
export function gainSkillXp(
  skills: SkillsState,
  dayXp: SkillDayXp,
  day: number,
  skill: SkillId,
  amount: number,
  opts?: { ignoreDailyCap?: boolean; xpMult?: number },
): GainSkillXpResult {
  const nextSkills: SkillsState = {
    ...skills,
    [skill]: { ...skills[skill] },
  };
  let nextDay: SkillDayXp =
    dayXp.day === day ? { day, gained: { ...dayXp.gained } } : emptySkillDayXp(day);

  const ignoreCap = opts?.ignoreDailyCap === true;
  const mult = opts?.xpMult ?? 1;
  let want = Math.max(0, Math.floor(amount * mult));
  let capped = false;

  if (!ignoreCap && want > 0) {
    const already = nextDay.gained[skill] ?? 0;
    const room = Math.max(0, PRACTICE_DAILY_CAP - already);
    if (want > room) {
      want = room;
      capped = true;
    }
    if (want > 0) {
      nextDay = {
        day,
        gained: { ...nextDay.gained, [skill]: already + want },
      };
    }
  }

  if (want <= 0) {
    return { skills: nextSkills, dayXp: nextDay, applied: 0, leveled: false, capped };
  }

  let prog = nextSkills[skill];
  let left = want;
  let leveled = false;

  while (left > 0 && prog.level < SKILL_MAX_LEVEL) {
    const need = xpToNext(prog.level);
    if (need == null) break;
    const into = prog.xp + left;
    if (into >= need) {
      left = into - need;
      prog = { level: prog.level + 1, xp: 0 };
      leveled = true;
    } else {
      prog = { level: prog.level, xp: into };
      left = 0;
    }
  }

  nextSkills[skill] = prog;
  return {
    skills: nextSkills,
    dayXp: nextDay,
    applied: want - left,
    leveled,
    capped,
  };
}

export type BookReadResult =
  | { ok: false; reason: 'too_advanced' | 'maxed' }
  | {
      ok: true;
      skills: SkillsState;
      hours: number;
      gainedLevel: boolean;
      xpGranted: number;
    };

/**
 * Read a skill book. If current level is below the book's tier, grant one
 * full level. Otherwise grant a flat XP chunk (still useful toward the next).
 */
export function applySkillBook(
  skills: SkillsState,
  skill: SkillId,
  tier: SkillBookTier,
): BookReadResult {
  const prog = skills[skill] ?? { level: 0, xp: 0 };
  const minLevel = BOOK_MIN_LEVEL[tier];
  if (prog.level < minLevel) return { ok: false, reason: 'too_advanced' };
  if (prog.level >= SKILL_MAX_LEVEL && prog.xp === 0) {
    return { ok: false, reason: 'maxed' };
  }

  const hours = BOOK_HOURS[tier];
  const next = { ...skills, [skill]: { ...prog } };

  if (prog.level < tier) {
    // One gated level — clear XP toward the new level.
    next[skill] = { level: prog.level + 1, xp: 0 };
    return {
      ok: true,
      skills: next,
      hours,
      gainedLevel: true,
      xpGranted: xpToNext(prog.level) ?? 0,
    };
  }

  const chunk = BOOK_XP_CHUNK[tier];
  const gained = gainSkillXp(next, emptySkillDayXp(), 1, skill, chunk, {
    ignoreDailyCap: true,
  });
  return {
    ok: true,
    skills: gained.skills,
    hours,
    gainedLevel: gained.leveled,
    xpGranted: gained.applied,
  };
}

/** Practice XP amounts for meaningful events (before trait mult / daily cap). */
export const PRACTICE_XP = {
  meleeHit: 2,
  meleeKill: 6,
  firearmShot: 2,
  firearmKill: 6,
  searchComplete: 8,
  trekHour: 3,
  craft: 6,
  healUse: 5,
  fleeSuccess: 4,
  ambushAvoid: 4,
  hdbPick: 5,
  hdbBreach: 5,
} as const;

/** Sum skillStart across traits — used by tests and UI. */
export function sumTraitSkillStart(traitIds: string[], skill: SkillId): number {
  let n = 0;
  for (const t of getTraits(traitIds)) {
    const v = t.skillStart?.[skill];
    if (typeof v === 'number') n += v;
  }
  return n;
}
