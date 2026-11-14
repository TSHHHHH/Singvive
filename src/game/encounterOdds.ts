import type { TimeOfDay } from './types';

// ---------------------------------------------------------------------------
// Search ambush odds.
//
// One function prices the roll and the readout, so what the location card says
// is exactly what the dice do. Two things keep it from feeling arbitrary:
//
//   1. Everything that moves the odds is something the player can see or cause
//      — danger (including the noise you made), the hour, the weather, how far
//      the rot has spread, and their own build.
//   2. A site remembers its last fight. Right after one, the next rummage is
//      calmer — you just cleared what was close. Keep pulling shelves apart and
//      it creeps back up past where it started. On quiet ground the average is
//      unchanged; on hot ground (where the 95% ceiling stops the climb) it comes
//      down a little. Either way the three-ambushes-in-a-row runs mostly go.
// ---------------------------------------------------------------------------

/**
 * Multiplier on the search ambush chance, indexed by searches since the last
 * ambush at this site. A site that has never been fought at sits on
 * {@link SEARCH_STREAK_FRESH}.
 */
export const SEARCH_STREAK_MULT: readonly number[] = [0.5, 0.8, 1.0, 1.25, 1.5];
/** Index a never-fought-at site starts on. */
export const SEARCH_STREAK_FRESH = 2;

export function searchStreakMult(searchesSinceAmbush: number | undefined): number {
  const i = searchesSinceAmbush ?? SEARCH_STREAK_FRESH;
  return SEARCH_STREAK_MULT[Math.max(0, Math.min(SEARCH_STREAK_MULT.length - 1, i))];
}

/** The counter after a search roll resolves at a site. */
export function nextSearchStreak(searchesSinceAmbush: number | undefined, ambushed: boolean): number {
  if (ambushed) return 0;
  const i = searchesSinceAmbush ?? SEARCH_STREAK_FRESH;
  return Math.min(SEARCH_STREAK_MULT.length - 1, i + 1);
}

export interface SearchOddsInput {
  /** Danger including temporary noise boost and town tier (store's `doomDanger`). */
  danger: number;
  band: TimeOfDay;
  weatherMod: number;
  /** Local horde pressure, 0..1. */
  pressure: number;
  /** Trait + skill `encounterChanceMod`. */
  encounterMod: number;
  /** Trait `nightEncounterChanceMod` (applied at dusk and night). */
  nightEncounterMod: number;
  /** Trait + skill `ambushChanceMod`. */
  ambushMod: number;
  searchesSinceAmbush?: number;
}

export function searchAmbushChance(o: SearchOddsInput): number {
  let p = 0.08 + o.danger * 0.12;
  if (o.band === 'night') p += 0.2;
  else if (o.band === 'dusk') p += 0.08;
  p += o.weatherMod;
  // Local neighbourhood pressure — a Fallen town is not a Stirring one.
  p += o.pressure * 0.3;
  p += o.encounterMod;
  if (o.band === 'night' || o.band === 'dusk') p += o.nightEncounterMod;
  // Ambush-prone builds get jumped more often when a search turns into a fight.
  const ambushMult = Math.max(0.15, 1 + o.ambushMod);
  p *= 0.7 + 0.3 * ambushMult;
  p *= searchStreakMult(o.searchesSinceAmbush);
  return Math.max(0.02, Math.min(0.95, p));
}

export type SearchRiskLevel = 'low' | 'uneasy' | 'high' | 'dire';

/** Coarse read for the location card — never an exact percentage. */
export function searchRiskLevel(chance: number): SearchRiskLevel {
  if (chance < 0.2) return 'low';
  if (chance < 0.4) return 'uneasy';
  if (chance < 0.65) return 'high';
  return 'dire';
}

export const SEARCH_RISK_COLOR: Record<SearchRiskLevel, string> = {
  low: '#b7b3a9',
  uneasy: '#cfccc4',
  high: '#d9683d',
  dire: '#d92d2d',
};
