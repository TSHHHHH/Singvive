import type { IconName } from '../icons/keys';
import type { RunStats } from './types';

/**
 * Run counters and how to present them.
 *
 * The store owns the numbers; this module owns their shape, their reset value
 * and the display descriptors. Adding a counter means one field here plus one
 * `bumpStats` call at the site where it happens — the Stats panel picks it up
 * automatically from STAT_GROUPS.
 */

export function emptyRunStats(): RunStats {
  return {
    zombieKills: 0,
    humanKills: 0,
    animalKills: 0,
    fightsFled: 0,
    distanceM: 0,
    poisSearched: 0,
    hdbUnitsCleared: 0,
    itemsLooted: 0,
    lootValue: 0,
    nightsSlept: 0,
  };
}

/** Old saves predate the counters, and partial objects predate newer fields. */
export function normalizeRunStats(raw: Partial<RunStats> | undefined): RunStats {
  return { ...emptyRunStats(), ...(raw ?? {}) };
}

export interface StatRow {
  key: keyof RunStats;
  label: string;
  icon: IconName;
  /** How the raw number reads on screen. */
  format?: (n: number) => string;
}

export interface StatGroup {
  title: string;
  rows: StatRow[];
}

const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);

export const STAT_GROUPS: StatGroup[] = [
  {
    title: 'Combat',
    rows: [
      { key: 'zombieKills', label: 'Zombies killed', icon: 'combat.enemyZombie' },
      { key: 'humanKills', label: 'Humans killed', icon: 'combat.enemyHuman' },
      { key: 'animalKills', label: 'Animals killed', icon: 'combat.enemyAnimal' },
      { key: 'fightsFled', label: 'Fights fled', icon: 'stance.disengage' },
    ],
  },
  {
    title: 'Exploration',
    rows: [
      { key: 'distanceM', label: 'Distance walked', icon: 'action.travel', format: km },
      { key: 'poisSearched', label: 'Sites searched', icon: 'action.search' },
      { key: 'hdbUnitsCleared', label: 'HDB units cleared', icon: 'hdb.unit' },
    ],
  },
  {
    title: 'Survival',
    rows: [
      { key: 'nightsSlept', label: 'Times slept', icon: 'action.sleep' },
      { key: 'itemsLooted', label: 'Items looted', icon: 'action.stash' },
      { key: 'lootValue', label: 'Loot value', icon: 'stat.value' },
    ],
  },
];
