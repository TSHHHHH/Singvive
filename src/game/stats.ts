import type { IconName } from '../icons/keys';
import type { RunStats } from './types';

/**
 * Run counters and how to present them.
 *
 * The store owns the numbers; this module owns their shape, their reset value
 * and the display descriptors. Adding a counter means one field here plus one
 * `bumpStats` call at the site where it happens — the Stats panel picks it up
 * automatically from STAT_GROUPS. Labels are i18n keys under `ui.stats.*`.
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
  /** Message key under `ui.stats.*`. */
  labelKey: string;
  icon: IconName;
  /** How the raw number reads on screen. */
  format?: (n: number) => string;
}

export interface StatGroup {
  /** Message key under `ui.stats.*`. */
  titleKey: string;
  rows: StatRow[];
}

const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);

export const STAT_GROUPS: StatGroup[] = [
  {
    titleKey: 'ui.stats.combat',
    rows: [
      { key: 'zombieKills', labelKey: 'ui.stats.zombieKills', icon: 'combat.enemyZombie' },
      { key: 'humanKills', labelKey: 'ui.stats.humanKills', icon: 'combat.enemyHuman' },
      { key: 'animalKills', labelKey: 'ui.stats.animalKills', icon: 'combat.enemyAnimal' },
      { key: 'fightsFled', labelKey: 'ui.stats.fightsFled', icon: 'stance.disengage' },
    ],
  },
  {
    titleKey: 'ui.stats.exploration',
    rows: [
      { key: 'distanceM', labelKey: 'ui.stats.distanceWalked', icon: 'action.travel', format: km },
      { key: 'poisSearched', labelKey: 'ui.stats.sitesSearched', icon: 'action.search' },
      { key: 'hdbUnitsCleared', labelKey: 'ui.stats.hdbUnitsCleared', icon: 'hdb.unit' },
    ],
  },
  {
    titleKey: 'ui.stats.survival',
    rows: [
      { key: 'nightsSlept', labelKey: 'ui.stats.timesSlept', icon: 'action.sleep' },
      { key: 'itemsLooted', labelKey: 'ui.stats.itemsLooted', icon: 'action.stash' },
      { key: 'lootValue', labelKey: 'ui.stats.lootValue', icon: 'stat.value' },
    ],
  },
];
