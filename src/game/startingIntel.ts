import { sumTraitMod } from './character';
import type { OutpostIds } from './factions';
import { applyPreciseReveal } from './intel';
import type { Rng } from './rng';
import type { LocationState } from './types';

/** Spawn-only knowledge: one existing hub per faction, without changing standing. */
export function applyStartingFactionIntel(
  rng: Rng,
  locations: Record<string, LocationState>,
  outposts: OutpostIds,
  traitIds: string[],
): { locations: Record<string, LocationState>; revealed: LocationState[] } {
  const count = sumTraitMod(traitIds, 'startingHubKnowledge');
  if (count <= 0) return { locations, revealed: [] };

  const pools = Object.entries(outposts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([factionId, ids]) => (ids ?? []).filter((id) => {
      const loc = locations[id];
      return loc?.isFactionOutpost && loc.factionId === factionId;
    }).sort())
    .filter((ids) => ids.length > 0);
  const intelRng = rng.fork('startingFactionIntel');
  let next = locations;
  const revealed: LocationState[] = [];
  for (const ids of intelRng.shuffle(pools).slice(0, count)) {
    const applied = applyPreciseReveal(next, intelRng.pick(ids));
    if (!applied) continue;
    next = applied.locs;
    revealed.push(applied.target);
  }
  return { locations: next, revealed };
}
