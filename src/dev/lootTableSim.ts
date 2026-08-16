import { DUD_CHANCE, ITEMS } from '../game/loot';
import { Rng } from '../game/rng';
import type { LootTableEntry } from './validateLootTables';

/** Mirrors live `rollQuantity` — keep in lockstep with `loot.ts`. */
function rollQuantity(rng: Rng, maxStack: number): number {
  if (maxStack <= 1) return 1;
  const r = rng.chance(0.65) ? 1 : rng.chance(0.8) ? 2 : 3;
  return Math.min(r, maxStack);
}

function commonAlternative(rng: Rng, table: LootTableEntry[]): string | null {
  const plain = table.filter(([id]) => (ITEMS[id]?.scarcity ?? 1) >= 1);
  return plain.length ? rng.weighted(plain) : null;
}

/**
 * Simulate `searches` scavenges against a draft table (not the live module
 * constant), including dud rolls, scarcity gates, and stack quantities.
 */
export function simulateTableRolls(
  table: LootTableEntry[],
  richness: number,
  searches: number,
  seed: string,
): { counts: Map<string, number>; pulls: number; duds: number; scarcityFails: number } {
  const rng = new Rng(seed);
  const counts = new Map<string, number>();
  let pulls = 0;
  let duds = 0;
  let scarcityFails = 0;
  const rollsPer = Math.max(1, richness);

  for (let s = 0; s < searches; s++) {
    for (let i = 0; i < rollsPer; i++) {
      if (rng.chance(DUD_CHANCE)) {
        duds += 1;
        continue;
      }
      let id = rng.weighted(table);
      const scarcity = ITEMS[id]?.scarcity ?? 1;
      if (scarcity < 1 && !rng.chance(scarcity)) {
        scarcityFails += 1;
        const fallback = commonAlternative(rng, table);
        if (!fallback) continue;
        id = fallback;
      }
      const def = ITEMS[id];
      const qty = def?.stackable ? rollQuantity(rng, def.maxStack) : 1;
      counts.set(id, (counts.get(id) ?? 0) + qty);
      pulls += 1;
    }
  }

  return { counts, pulls, duds, scarcityFails };
}
