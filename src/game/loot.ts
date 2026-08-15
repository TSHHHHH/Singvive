import type { FactionId, ItemDef, PoiCategory } from './types';
import type { Rng } from './rng';
import itemsCatalog from './data/items.json' with { type: 'json' };
import lootTablesCatalog from './data/lootTables.json' with { type: 'json' };
import { FACTION_CONFIG } from './factions';
import { POI_CATEGORIES } from './poi';

// ---------- Item catalogue ----------
// Source of truth is src/game/data/items.json (editable via the DEV loot browser).
// w/h are Tetris-grid footprints (in cells).
export const ITEMS: Record<string, ItemDef> = structuredClone(
  itemsCatalog,
) as Record<string, ItemDef>;

/**
 * Anything you can equip wears out. Defaulting it here beats repeating
 * `maxCondition: 100` on every weapon and vest, and means new gear degrades
 * without anyone having to remember — a def only spells the field out when it
 * wants something other than the default.
 */
for (const def of Object.values(ITEMS)) {
  if (def.slot && def.maxCondition === undefined) def.maxCondition = 100;
}

/**
 * The stacking invariant: a stack of five cans has no single wear value that
 * means anything, so only non-stackable items may carry a condition. `addToGrid`
 * relies on this to merge stacks without reconciling conditions.
 *
 * Nothing in the type system enforces it — every new item field is optional so
 * old saves keep loading — so it is checked once at startup in dev instead.
 */
if (import.meta.env.DEV) {
  for (const def of Object.values(ITEMS)) {
    if (def.maxCondition !== undefined && def.stackable) {
      console.error(
        `[loot] ${def.id} is stackable but has maxCondition — stacks cannot carry wear.`,
      );
    }
    if (def.perishable && def.maxCondition === undefined) {
      console.error(`[loot] ${def.id} is perishable but has no maxCondition to decay.`);
    }
    if (def.scarcity !== undefined && (def.scarcity <= 0 || def.scarcity > 1)) {
      console.error(`[loot] ${def.id} has scarcity ${def.scarcity}; expected 0 < s ≤ 1.`);
    }
  }
}

export type LootEntry = readonly [itemId: string, weight: number];

// Source of truth is src/game/data/lootTables.json (editable via the DEV loot browser).
export const LOOT_TABLES: Record<PoiCategory, LootEntry[]> = structuredClone(
  lootTablesCatalog,
) as unknown as Record<PoiCategory, LootEntry[]>;

if (import.meta.env.DEV) {
  for (const category of POI_CATEGORIES) {
    const table = LOOT_TABLES[category];
    if (!table?.length) {
      console.error(`[loot] LOOT_TABLES.${category} is missing or empty`);
      continue;
    }
    const seen = new Set<string>();
    for (const [id, weight] of table) {
      if (!ITEMS[id]) console.error(`[loot] ${category} references unknown item "${id}"`);
      if (!(weight > 0)) console.error(`[loot] ${category}/${id} has non-positive weight ${weight}`);
      if (seen.has(id)) console.error(`[loot] ${category} has duplicate entry "${id}"`);
      seen.add(id);
    }
  }
}

export interface LootStack {
  defId: string;
  count: number;
}

/**
 * Roll loot for a scavenge. Quantity scales with the POI's "richness"
 * (higher for supermarkets, lower for already-thin categories) plus
 * perception & scavenger bonuses supplied by the caller.
 */
/** Roughly 35% of shelves have already been stripped by someone else. */
const DUD_CHANCE = 0.35;

/**
 * How much of a thing a single roll turns up. Weighted hard toward one: a can
 * of food should be a can of food, not a case of them. The old flat 1–3 was
 * most of the reason a supermarket could feed you for a week.
 */
function rollQuantity(rng: Rng, maxStack: number): number {
  if (maxStack <= 1) return 1;
  const r = rng.chance(0.65) ? 1 : rng.chance(0.8) ? 2 : 3;
  return Math.min(r, maxStack);
}

/** A table entry that isn't gated — what a failed scarcity roll falls back to. */
function commonAlternative(rng: Rng, table: LootEntry[]): string | null {
  const plain = table.filter(([id]) => (ITEMS[id]?.scarcity ?? 1) >= 1);
  return plain.length ? rng.weighted(plain) : null;
}

export function rollLoot(
  rng: Rng,
  category: PoiCategory,
  richness: number,
  bonusRolls: number,
): LootStack[] {
  const table = LOOT_TABLES[category];
  const rolls = Math.max(1, richness + bonusRolls);
  const out = new Map<string, number>();
  for (let i = 0; i < rolls; i++) {
    if (rng.chance(DUD_CHANCE)) continue;
    let id = rng.weighted(table);

    /*
     * The scarcity gate. Table weight alone can't make a firearm feel like an
     * event — lower the weight far enough and police stations stop being worth
     * visiting at all. So the good things roll normally and then have to pass a
     * second check; failing it hands you something ordinary off the same shelf
     * rather than nothing, which keeps a search feeling like a search.
     */
    const scarcity = ITEMS[id]?.scarcity ?? 1;
    if (scarcity < 1 && !rng.chance(scarcity)) {
      const fallback = commonAlternative(rng, table);
      if (!fallback) continue;
      id = fallback;
    }

    const def = ITEMS[id];
    const qty = def.stackable ? rollQuantity(rng, def.maxStack) : 1;
    out.set(id, (out.get(id) ?? 0) + qty);
  }
  return [...out.entries()].map(([defId, count]) => ({ defId, count }));
}

/**
 * Extra shelf rolls when ransacking occupied ground — the risk is the point.
 * Category richness is also floored so a thin POI still pays for the fight.
 */
export const RAID_LOOT_BONUS_ROLLS = 3;
/** Guaranteed pulls from the faction's own stock / exclusive cache per search. */
export const RAID_CACHE_PULLS = 2;

/**
 * Loot for a sneak/force raid on faction-held ground: richer category rolls
 * plus pulls from what they keep behind the counter.
 */
export function rollFactionRaidLoot(
  rng: Rng,
  category: PoiCategory,
  richness: number,
  bonusRolls: number,
  factionId: Exclude<FactionId, null>,
): LootStack[] {
  const base = rollLoot(
    rng,
    category,
    Math.max(richness, 4),
    bonusRolls + RAID_LOOT_BONUS_ROLLS,
  );
  const cfg = FACTION_CONFIG[factionId];
  const stock = cfg.stock.filter((id) => ITEMS[id]);
  const exclusive = cfg.exclusiveStock.filter((id) => ITEMS[id]);
  if (!stock.length && !exclusive.length) return base;

  const merged = new Map(base.map((s) => [s.defId, s.count]));
  for (let i = 0; i < RAID_CACHE_PULLS; i++) {
    // Later pulls lean toward exclusive stock — the good stuff they don't sell
    // strangers is exactly what a raid is for.
    const useExclusive = exclusive.length > 0 && (stock.length === 0 || rng.chance(0.4 + i * 0.2));
    const pool = useExclusive ? exclusive : stock.length ? stock : exclusive;
    const id = rng.pick(pool);
    const def = ITEMS[id];
    if (!def) continue;
    const qty = def.stackable ? rollQuantity(rng, def.maxStack) : 1;
    merged.set(id, (merged.get(id) ?? 0) + qty);
  }
  return [...merged.entries()].map(([defId, count]) => ({ defId, count }));
}

export function itemDef(id: string): ItemDef {
  return ITEMS[id];
}

/**
 * What state a found item turns up in.
 *
 * This is where risk buys reward. `bias` runs 0 (a ransacked shopfront anyone
 * could have walked into) to 1 (a barricaded high-floor unit that cost you
 * twenty-five minutes, a lungful of noise and a fight to open), and it moves
 * the whole window: street loot lands Old & Torn to Heavily Used, while the
 * doors nobody else could get through are the only reliable source of gear
 * that still works properly.
 *
 * Returns undefined for items that don't wear at all, which `addToGrid` reads
 * as "no condition".
 */
export function conditionRoll(rng: Rng, defId: string, bias = 0): number | undefined {
  const def = ITEMS[defId];
  if (!def || def.maxCondition === undefined) return undefined;
  const b = Math.max(0, Math.min(1, bias));
  const lo = 18 + b * 52;
  const hi = 52 + b * 48;
  return Math.round(Math.min(def.maxCondition, rng.int(Math.round(lo), Math.round(hi))));
}
