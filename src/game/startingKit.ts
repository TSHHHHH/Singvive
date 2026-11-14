import type { EquipSlot } from './types';
import { ITEMS, itemDef } from './loot';
import { getTrait } from './character';
import type { Rng } from './rng';

// ---------- Starting kit ----------
// Everyone wakes up with the base kit (items flagged `startingItem` in
// items.json — editable in the DEV loot browser). Traits then add what that
// person would plausibly have had on them when it fell:
//
//   - Job-signature traits (one per occupation preset) carry a full outfit,
//     so every preset starts dressed for its job. Because the outfit rides on
//     the trait, not the preset, editing a preset never silently strips it.
//   - Ordinary traits add a small themed extra or two.
//   - Gear-only traits are nothing *but* a kit.
//
// Slot rules: a trait's wearable replaces whatever the base kit put in that
// slot. If another trait already claimed the slot, a positive trait's item
// goes in the pack instead (you can swap it in), and a flaw's item is simply
// not there. Traits apply dearest first, so the job outfit wins ties.
//
// Everything is fixed per build except `pool` picks, which roll off the run
// seed — same seed, same kit.

export interface KitEntry {
  id: string;
  count?: number;
}

export interface TraitKit {
  items?: KitEntry[];
  /** Seeded random finds: `pick` distinct entries from `from`. */
  pool?: { pick: number; from: KitEntry[] };
  /** Base-kit items this trait starts without. */
  drop?: string[];
}

/** Things a scavenger tends to have in a pocket. */
const SCAVENGER_FINDS: KitEntry[] = [
  { id: 'powerbank' },
  { id: 'batteries', count: 2 },
  { id: 'spare_parts' },
  { id: 'duct_tape', count: 2 },
  { id: 'whetstone' },
  { id: 'lighter' },
];

/** Whatever was free, on offer, or not nailed down. */
const OPPORTUNIST_FINDS: KitEntry[] = [
  { id: 'bak_kwa' },
  { id: 'powerbank' },
  { id: 'canned_luncheon_meat', count: 2 },
  { id: 'red_packet', count: 3 },
  { id: 'painkillers', count: 2 },
];

export const TRAIT_KITS: Record<string, TraitKit> = {
  // ── Job signatures (one per occupation preset) ──
  combat_veteran: {
    items: [
      { id: 'army_uniform' },
      { id: 'combat_boots' },
      { id: 'army_ration' },
    ],
  },
  trauma_medic: {
    items: [
      { id: 'rubber_gloves' },
      { id: 'n95_mask' },
      { id: 'ifak_pouch' },
      { id: 'bandage', count: 2 },
    ],
  },
  hyrox_champion: {
    items: [
      { id: 'cargo_shorts' },
      { id: 'grip_gloves' },
      { id: 'energy_gel', count: 3 },
      { id: 'isotonic', count: 2 },
    ],
  },
  young_blood: {
    items: [{ id: 'school_bag' }, { id: 'jeans' }, { id: 'energy_drink' }, { id: 'bubble_tea' }],
  },
  estate_kitchen: {
    items: [
      { id: 'meat_cleaver' },
      { id: 'rubber_boots' },
      { id: 'tingkat_lunch' },
      { id: 'cooking_pot' },
    ],
  },
  estate_memory: {
    items: [{ id: 'work_gloves' }, { id: 'cloth_rags', count: 2 }],
    pool: { pick: 2, from: SCAVENGER_FINDS },
  },
  operator: {
    items: [
      { id: 'golf_club' },
      { id: 'powerbank' },
      { id: 'phone_charging_cable' },
      { id: 'kopi_sachets', count: 2 },
    ],
  },
  site_foreman: {
    items: [
      { id: 'hard_hat' },
      { id: 'safety_boots' },
      { id: 'hammer' },
      { id: 'duct_tape', count: 2 },
    ],
  },
  made_man: {
    items: [
      { id: 'baseball_bat' },
      { id: 'lockpick', count: 2 },
      { id: 'red_packet', count: 3 },
      { id: 'jewellery', count: 2 },
    ],
  },

  // ── Ordinary traits: a themed extra ──
  ns_combat: { items: [{ id: 'army_ration' }] },
  medic: { items: [{ id: 'bandage', count: 2 }, { id: 'antiseptic' }] },
  hawker_cook: { items: [{ id: 'cooking_pot' }, { id: 'lighter' }] },
  marathoner: { items: [{ id: 'energy_gel', count: 3 }] },
  karang_guni: {
    items: [{ id: 'cloth_rags', count: 2 }],
    pool: { pick: 1, from: SCAVENGER_FINDS },
  },
  tekong_legs: { items: [{ id: 'hiking_boots' }] },
  night_owl: { items: [{ id: 'torch' }] },
  kiasuism: { pool: { pick: 1, from: OPPORTUNIST_FINDS } },
  kampong_spirit: { items: [{ id: 'kopi_sachets', count: 3 }] },
  ah_long_debt: { items: [{ id: 'four_d_ticket', count: 3 }] },
  water_baby: { items: [{ id: 'water_bottle' }] },
  handyman: { items: [{ id: 'duct_tape', count: 2 }, { id: 'zip_ties', count: 4 }] },
  deep_sleeper: { items: [{ id: 'camp_pillow' }] },
  iron_stomach: { items: [{ id: 'canned_sardines', count: 2 }] },
  field_dressing: { items: [{ id: 'improvised_bandage', count: 3 }, { id: 'splint' }] },
  frugal: { items: [{ id: 'hardtack', count: 3 }] },
  umbrella_city: { items: [{ id: 'golf_umbrella' }] },
  haze_mask: { items: [{ id: 'n95_mask' }] },
  void_deck_chat: { items: [{ id: 'chin_chow', count: 2 }] },
  train_memory: { items: [{ id: 'ez_link_card' }, { id: 'headlamp' }] },

  // ── Gear-only traits ──
  go_bag: {
    items: [
      { id: 'torch' },
      { id: 'large_water_bottle' },
      { id: 'hardtack', count: 2 },
      { id: 'emergency_blanket' },
    ],
  },
  prepper: {
    items: [
      { id: 'school_bag' },
      { id: 'canned_food', count: 3 },
      { id: 'purification_tabs', count: 2 },
      { id: 'lighter' },
    ],
  },
  medicine_cabinet: {
    items: [{ id: 'bandage', count: 2 }, { id: 'painkillers' }, { id: 'po_chai' }],
  },
  heirloom_blade: { items: [{ id: 'parang' }] },
  weekend_cyclist: { items: [{ id: 'bike_helmet' }, { id: 'isotonic' }] },
  supper_run: { items: [{ id: 'bak_kwa' }, { id: 'curry_puff' }, { id: 'soya_bean' }] },
  just_popped_out: {
    items: [{ id: 'flip_flops' }, { id: 'grocery_tote' }],
    drop: ['leather_jacket'],
  },
};

export function traitKit(traitId: string): TraitKit | null {
  return TRAIT_KITS[traitId] ?? null;
}

export function hasTraitKit(traitId: string): boolean {
  return traitId in TRAIT_KITS;
}

/** The base kit everyone gets: `startingItem` flags in items.json. */
export function baseKit(): KitEntry[] {
  return Object.values(ITEMS)
    .filter((d) => d.startingItem)
    .map((d) => ({ id: d.id, count: Math.max(1, d.startingCount ?? 1) }));
}

export type KitSource = 'base' | { trait: string };

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
  pools: { trait: string; pick: number; from: KitEntry[] }[];
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

/**
 * Resolve a build's starting kit. Pass the run rng to roll pools (the store
 * does); omit it to get the fixed part plus the unrolled pools (the preview).
 */
export function resolveStartingKit(traitIds: string[], rng?: Rng): ResolvedKit {
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

  for (const e of baseKit()) {
    if (dropped.has(e.id)) continue;
    const def = itemDef(e.id);
    const line: KitLine = { id: e.id, count: e.count ?? 1, source: 'base' };
    if (def.slot && !equip[def.slot]) equip[def.slot] = { ...line, count: 1 };
    else toPack(line);
  }

  for (const traitId of order) {
    const kit = TRAIT_KITS[traitId];
    const positive = getTrait(traitId).category === 'positive';
    const entries = [...(kit.items ?? [])];
    if (kit.pool) {
      if (rng) entries.push(...rollKitPool(rng.fork(`kit:${traitId}`), kit.pool.pick, kit.pool.from));
      else pools.push({ trait: traitId, pick: kit.pool.pick, from: kit.pool.from });
    }
    for (const e of entries) {
      const def = itemDef(e.id);
      const line: KitLine = { id: e.id, count: e.count ?? 1, source: { trait: traitId } };
      const slot = def.slot;
      if (slot) {
        const held = equip[slot];
        if (!held || held.source === 'base') {
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
