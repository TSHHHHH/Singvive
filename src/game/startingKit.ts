import type { EquipSlot } from './types';
import { ITEMS, itemDef } from './loot';
import { getTrait } from './character';
import type { Rng } from './rng';

import { getOccupation } from './occupations';
import { OPPORTUNIST_FINDS, SCAVENGER_FINDS, type KitEntry, type RoleKit, type TraitKit } from './kitFinds';

export type { KitEntry, RoleKit, TraitKit } from './kitFinds';

// ---------- Starting kit ----------
// The role (occupations.ts) lays down the first layer: what that survivor
// still carries months after the outbreak. Classic Survivor uses the standard
// kit (items flagged `startingItem` in items.json, editable in the DEV loot
// browser). Traits then add at most one signature item each:
//
//   - Ordinary traits add a small themed extra.
//   - Gear-only traits are nothing *but* that item.
//
// Slot rules: a trait's wearable replaces whatever the role put in that slot.
// If another trait already claimed the slot, a positive trait's item goes in
// the pack instead (you can swap it in), and a flaw's item is simply not
// there. Traits apply dearest first.
//
// Everything is fixed per build except `pool` picks, which roll off the run
// seed — same seed, same kit.

export const TRAIT_KITS: Record<string, TraitKit> = {
  // Job outfits live on the roles (occupations.ts). A trait gives at most one
  // signature item, so it changes a playstyle without dressing the survivor.

  // ── Ordinary traits: a themed extra ──
  ns_combat: { items: [{ id: 'army_ration' }] },
  medic: { items: [{ id: 'bandage', count: 2 }] },
  hawker_cook: { items: [{ id: 'cooking_pot' }] },
  marathoner: { items: [{ id: 'energy_gel', count: 3 }] },
  karang_guni: { pool: { pick: 1, from: SCAVENGER_FINDS } },
  tekong_legs: { items: [{ id: 'hiking_boots' }] },
  night_owl: { items: [{ id: 'torch' }] },
  kiasuism: { pool: { pick: 1, from: OPPORTUNIST_FINDS } },
  kampong_spirit: { items: [{ id: 'kopi_sachets', count: 3 }] },
  ah_long_debt: { items: [{ id: 'four_d_ticket', count: 3 }] },
  water_baby: { items: [{ id: 'water_bottle' }] },
  handyman: { items: [{ id: 'zip_ties', count: 4 }] },
  deep_sleeper: { items: [{ id: 'camp_pillow' }] },
  iron_stomach: { items: [{ id: 'canned_sardines', count: 2 }] },
  field_dressing: { items: [{ id: 'improvised_bandage', count: 3 }] },
  frugal: { items: [{ id: 'hardtack', count: 3 }] },
  umbrella_city: { items: [{ id: 'golf_umbrella' }] },
  haze_mask: { items: [{ id: 'n95_mask' }] },
  void_deck_chat: { items: [{ id: 'chin_chow', count: 2 }] },
  train_memory: { items: [{ id: 'headlamp' }] },

  // ── Gear-only traits ──
  go_bag: { items: [{ id: 'large_water_bottle' }] },
  prepper: { items: [{ id: 'canned_food', count: 3 }] },
  medicine_cabinet: { items: [{ id: 'painkillers' }] },
  heirloom_blade: { items: [{ id: 'parang' }] },
  weekend_cyclist: { items: [{ id: 'bike_helmet' }] },
  supper_run: { items: [{ id: 'bak_kwa' }] },
  just_popped_out: {
    items: [{ id: 'flip_flops' }],
    drop: ['leather_jacket'],
  },
};

export function traitKit(traitId: string): TraitKit | null {
  return TRAIT_KITS[traitId] ?? null;
}

export function hasTraitKit(traitId: string): boolean {
  return traitId in TRAIT_KITS;
}

/** The standard (Classic Survivor) kit: `startingItem` flags in items.json. */
export function baseKit(): KitEntry[] {
  return Object.values(ITEMS)
    .filter((d) => d.startingItem)
    .map((d) => ({ id: d.id, count: Math.max(1, d.startingCount ?? 1) }));
}

export type KitSource = 'role' | { trait: string };

export interface KitLine {
  id: string;
  count: number;
  source: KitSource;
}

export interface ResolvedKit {
  equip: Partial<Record<EquipSlot, KitLine>>;
  /** Merged by item id, in the order first added. */
  pack: KitLine[];
  /** Pools not rolled (no rng given) — for previews. */
  pools: { source: KitSource; pick: number; from: KitEntry[] }[];
}

/** Traits in the order their kits apply: dearest first, then pick order. */
function kitOrder(traitIds: string[]): string[] {
  return traitIds
    .filter(hasTraitKit)
    .map((id, i) => ({ id, i, cost: Math.abs(getTrait(id).cost) }))
    .sort((a, b) => b.cost - a.cost || a.i - b.i)
    .map((x) => x.id);
}

/** `pick` distinct entries from a pool, seeded. */
export function rollKitPool(rng: Rng, pick: number, from: KitEntry[]): KitEntry[] {
  const left = [...from];
  const out: KitEntry[] = [];
  for (let n = 0; n < pick && left.length > 0; n++) {
    out.push(left.splice(rng.int(0, left.length - 1), 1)[0]);
  }
  return out;
}

/** A role's kit; an unknown or missing id is the Classic Survivor. */
export function roleKit(occupationId: string | undefined): RoleKit {
  return (occupationId ? getOccupation(occupationId) : null)?.kit ?? { standard: true };
}

/** A role kit's fixed entries, the standard kit expanded. */
function roleKitEntries(kit: RoleKit): KitEntry[] {
  return [...(kit.standard ? baseKit() : []), ...(kit.items ?? [])];
}

/**
 * Resolve a starting kit: the role's kit first, then each trait's on top.
 * Pass the run rng to roll pools (the store does); omit it to get the fixed
 * part plus the unrolled pools (the preview).
 */
export function resolveStartingKit(
  occupationId: string | undefined,
  traitIds: string[],
  rng?: Rng,
): ResolvedKit {
  const equip: Partial<Record<EquipSlot, KitLine>> = {};
  const pack: KitLine[] = [];
  const pools: ResolvedKit['pools'] = [];

  const toPack = (line: KitLine) => {
    const same = pack.find((p) => p.id === line.id);
    if (same) same.count += line.count;
    else pack.push({ ...line });
  };

  const order = kitOrder(traitIds);
  const dropped = new Set(order.flatMap((id) => TRAIT_KITS[id].drop ?? []));

  const role = roleKit(occupationId);
  const roleEntries = roleKitEntries(role);
  if (role.pool) {
    if (rng) {
      roleEntries.push(
        ...rollKitPool(rng.fork(`kit:role:${occupationId ?? 'survivor'}`), role.pool.pick, role.pool.from),
      );
    } else pools.push({ source: 'role', pick: role.pool.pick, from: role.pool.from });
  }
  for (const e of roleEntries) {
    if (dropped.has(e.id)) continue;
    const def = itemDef(e.id);
    const line: KitLine = { id: e.id, count: e.count ?? 1, source: 'role' };
    if (def.slot && !equip[def.slot]) equip[def.slot] = { ...line, count: 1 };
    else toPack(line);
  }

  for (const traitId of order) {
    const kit = TRAIT_KITS[traitId];
    const positive = getTrait(traitId).category === 'positive';
    const entries = [...(kit.items ?? [])];
    if (kit.pool) {
      if (rng) entries.push(...rollKitPool(rng.fork(`kit:${traitId}`), kit.pool.pick, kit.pool.from));
      else pools.push({ source: { trait: traitId }, pick: kit.pool.pick, from: kit.pool.from });
    }
    for (const e of entries) {
      const def = itemDef(e.id);
      const line: KitLine = { id: e.id, count: e.count ?? 1, source: { trait: traitId } };
      const slot = def.slot;
      if (slot) {
        const held = equip[slot];
        if (!held || held.source === 'role') {
          equip[slot] = { ...line, count: 1 };
          continue;
        }
        if (!positive) continue;
      }
      toPack(line);
    }
  }

  // A two-handed weapon leaves no hand for the off-hand item: pack it.
  const main = equip.mainHand;
  if (main && itemDef(main.id).twoHanded && equip.offHand) {
    toPack(equip.offHand);
    delete equip.offHand;
  }

  return { equip, pack, pools };
}

/** All lines in a resolved kit, worn first. */
export function kitLines(kit: ResolvedKit): KitLine[] {
  return [...Object.values(kit.equip), ...kit.pack].filter((l): l is KitLine => l != null);
}

/** What one trait adds on its own (UI: trait detail panel). */
export function traitKitEntries(traitId: string): KitEntry[] {
  return TRAIT_KITS[traitId]?.items ?? [];
}

/** Sum of item `value` × count — a rough worth used by the balance test. */
export function kitEntriesValue(entries: KitEntry[]): number {
  return entries.reduce((s, e) => s + (itemDef(e.id).value ?? 0) * (e.count ?? 1), 0);
}
