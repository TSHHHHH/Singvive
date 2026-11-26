/**
 * Switches for whole game systems. Kept in a leaf module (no imports) so any
 * file under src/game can read them without import cycles.
 */

/**
 * In-run skill layer (`skills.ts`). Off for now: it added little to a run and
 * pushed play towards grinding XP. While off, survivors start and stay at
 * level 0 (so `skillMods` contributes nothing), practice and books grant no
 * XP, skill books leave the loot tables, and the Skills panel / create-screen
 * preview are hidden. The code and data stay so it can come back by flipping
 * this to `true`.
 */
export const SKILLS_ENABLED = false;
