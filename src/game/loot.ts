import type { ItemDef, PoiCategory } from './types';
import type { Rng } from './rng';

// ---------- Item catalogue ----------
// w/h are Tetris-grid footprints (in cells).
export const ITEMS: Record<string, ItemDef> = {
  // --- Food ---
  canned_food: { id: 'canned_food', name: 'Canned Food', w: 1, h: 1, weight: 0.4, effect: { kind: 'food', hunger: 30 }, value: 8, stackable: true, maxStack: 5, color: '#b5651d' },
  rice_pack: { id: 'rice_pack', name: 'Bag of Rice', w: 2, h: 2, weight: 2.5, effect: { kind: 'food', hunger: 55 }, value: 14, stackable: false, maxStack: 1, color: '#c9b458' },
  instant_noodles: { id: 'instant_noodles', name: 'Instant Noodles', w: 2, h: 1, weight: 0.3, effect: { kind: 'food', hunger: 35 }, value: 6, stackable: true, maxStack: 4, color: '#d98c3f' },
  snacks: { id: 'snacks', name: 'Snacks', w: 1, h: 1, weight: 0.2, effect: { kind: 'food', hunger: 15 }, value: 3, stackable: true, maxStack: 6, color: '#d9a441' },
  hawker_meal: { id: 'hawker_meal', name: 'Leftover Hawker Meal', w: 2, h: 1, weight: 0.5, effect: { kind: 'food', hunger: 45 }, value: 5, stackable: false, maxStack: 1, color: '#a86f34' },
  // --- Water ---
  water_bottle: { id: 'water_bottle', name: 'Bottled Water', w: 1, h: 2, weight: 0.6, effect: { kind: 'water', thirst: 35 }, value: 5, stackable: true, maxStack: 3, color: '#2f7fb5' },
  soft_drink: { id: 'soft_drink', name: 'Soft Drink', w: 1, h: 1, weight: 0.4, effect: { kind: 'water', thirst: 20 }, value: 4, stackable: true, maxStack: 4, color: '#3a6ea5' },
  isotonic: { id: 'isotonic', name: '100PLUS', w: 1, h: 2, weight: 0.5, effect: { kind: 'water', thirst: 30 }, value: 6, stackable: true, maxStack: 3, color: '#2f9fb5' },
  // --- Medicine ---
  bandage: { id: 'bandage', name: 'Bandage', w: 1, h: 1, weight: 0.1, effect: { kind: 'heal', health: 8, partHeal: 25, stopsBleeding: 'one' }, value: 8, stackable: true, maxStack: 5, color: '#d7d2c4' },
  painkillers: { id: 'painkillers', name: 'Painkillers', w: 1, h: 1, weight: 0.1, effect: { kind: 'heal', health: 15 }, value: 7, stackable: true, maxStack: 4, color: '#cfc9de' },
  medkit: { id: 'medkit', name: 'First-Aid Kit', w: 2, h: 2, weight: 1.2, effect: { kind: 'heal', health: 40, partHeal: 60, stopsBleeding: 'all' }, value: 25, stackable: false, maxStack: 1, color: '#c94f4f' },
  antibiotics: { id: 'antibiotics', name: 'Antibiotics', w: 1, h: 1, weight: 0.1, effect: { kind: 'cure', infection: 45 }, value: 30, stackable: true, maxStack: 3, color: '#7fbf6b' },
  antiseptic: { id: 'antiseptic', name: 'Antiseptic', w: 1, h: 1, weight: 0.2, effect: { kind: 'cure', infection: 25 }, value: 15, stackable: true, maxStack: 3, color: '#8fcf7b' },
  // --- Stimulants / energy ---
  coffee: { id: 'coffee', name: 'Kopi Packet', w: 1, h: 1, weight: 0.1, effect: { kind: 'energy', energy: 25 }, value: 4, stackable: true, maxStack: 4, color: '#6b4423' },
  energy_drink: { id: 'energy_drink', name: 'Energy Drink', w: 1, h: 2, weight: 0.4, effect: { kind: 'energy', energy: 40 }, value: 9, stackable: true, maxStack: 3, color: '#c0392b' },
  // --- Weapons (melee, mainHand) ---
  kitchen_knife: { id: 'kitchen_knife', name: 'Kitchen Knife', w: 1, h: 2, weight: 0.3, effect: { kind: 'weapon', damage: 10, accuracy: 1, ranged: false }, value: 10, stackable: false, maxStack: 1, color: '#9aa0a6', slot: 'mainHand' },
  hammer: { id: 'hammer', name: 'Claw Hammer', w: 1, h: 2, weight: 0.7, effect: { kind: 'weapon', damage: 14, accuracy: 0, ranged: false }, value: 12, stackable: false, maxStack: 1, color: '#8a8f94', slot: 'mainHand' },
  crowbar: { id: 'crowbar', name: 'Crowbar', w: 1, h: 3, weight: 1.5, effect: { kind: 'weapon', damage: 18, accuracy: 1, ranged: false }, value: 18, stackable: false, maxStack: 1, color: '#b5451d', slot: 'mainHand' },
  fire_axe: { id: 'fire_axe', name: 'Fire Axe', w: 1, h: 3, weight: 2.5, effect: { kind: 'weapon', damage: 24, accuracy: 0, ranged: false }, value: 26, stackable: false, maxStack: 1, color: '#a63a2a', slot: 'mainHand' },
  parang: { id: 'parang', name: 'Parang', w: 1, h: 3, weight: 0.8, effect: { kind: 'weapon', damage: 20, accuracy: 2, ranged: false }, value: 22, stackable: false, maxStack: 1, color: '#7f8c8d', slot: 'mainHand' },
  // --- Weapons (ranged, mainHand) ---
  pistol: { id: 'pistol', name: 'Service Pistol', w: 2, h: 1, weight: 1.0, effect: { kind: 'weapon', damage: 28, accuracy: 3, ranged: true }, value: 45, stackable: false, maxStack: 1, color: '#4a4f55', slot: 'mainHand' },
  shotgun: { id: 'shotgun', name: 'Shotgun', w: 4, h: 1, weight: 3.5, effect: { kind: 'weapon', damage: 40, accuracy: 2, ranged: true }, value: 60, stackable: false, maxStack: 1, color: '#5a3a1d', slot: 'mainHand' },
  ammo_box: { id: 'ammo_box', name: 'Box of Ammo', w: 1, h: 1, weight: 0.8, effect: { kind: 'misc' }, value: 20, stackable: true, maxStack: 5, color: '#c9a441' },
  // --- Armour: head ---
  hard_hat: { id: 'hard_hat', name: 'Hard Hat', w: 1, h: 1, weight: 0.4, effect: { kind: 'misc' }, value: 8, stackable: false, maxStack: 1, color: '#e0b020', slot: 'head', modifiers: { defenseBonus: 1 } },
  riot_helmet: { id: 'riot_helmet', name: 'Riot Helmet', w: 2, h: 2, weight: 1.5, effect: { kind: 'misc' }, value: 22, stackable: false, maxStack: 1, color: '#3a4048', slot: 'head', modifiers: { defenseBonus: 3 } },
  // --- Armour: body ---
  leather_jacket: { id: 'leather_jacket', name: 'Leather Jacket', w: 2, h: 2, weight: 1.2, effect: { kind: 'misc' }, value: 14, stackable: false, maxStack: 1, color: '#5a3a24', slot: 'body', modifiers: { defenseBonus: 2 } },
  work_vest: { id: 'work_vest', name: 'Utility Vest', w: 2, h: 2, weight: 1.0, effect: { kind: 'misc' }, value: 16, stackable: false, maxStack: 1, color: '#7a6b3a', slot: 'body', modifiers: { defenseBonus: 1, weightCapacityBonus: 6 } },
  kevlar_vest: { id: 'kevlar_vest', name: 'Kevlar Vest', w: 2, h: 3, weight: 3.5, effect: { kind: 'misc' }, value: 40, stackable: false, maxStack: 1, color: '#2f3a2a', slot: 'body', modifiers: { defenseBonus: 5 } },
  // --- Armour: offHand ---
  riot_shield: { id: 'riot_shield', name: 'Riot Shield', w: 2, h: 3, weight: 4.0, effect: { kind: 'misc' }, value: 30, stackable: false, maxStack: 1, color: '#37506b', slot: 'offHand', modifiers: { defenseBonus: 4, attackBonus: -1 } },
  torch: { id: 'torch', name: 'Torch', w: 1, h: 2, weight: 0.3, effect: { kind: 'misc' }, value: 8, stackable: false, maxStack: 1, color: '#c9a441', slot: 'offHand', modifiers: { attackBonus: 1 } },
  // --- Misc / fuel / crafting ---
  fuel_can: { id: 'fuel_can', name: 'Jerry Can (Fuel)', w: 2, h: 2, weight: 5.0, effect: { kind: 'fuel' }, value: 22, stackable: false, maxStack: 1, color: '#c0392b' },
  duct_tape: { id: 'duct_tape', name: 'Duct Tape', w: 1, h: 1, weight: 0.2, effect: { kind: 'misc' }, value: 6, stackable: true, maxStack: 4, color: '#7f8c8d' },
  batteries: { id: 'batteries', name: 'Batteries', w: 1, h: 1, weight: 0.2, effect: { kind: 'misc' }, value: 7, stackable: true, maxStack: 5, color: '#3a5a40' },
  scrap_metal: { id: 'scrap_metal', name: 'Scrap Metal', w: 2, h: 1, weight: 1.5, effect: { kind: 'misc' }, value: 4, stackable: true, maxStack: 4, color: '#6b7075' },
  toolbox: { id: 'toolbox', name: 'Toolbox', w: 2, h: 2, weight: 3.0, effect: { kind: 'misc' }, value: 16, stackable: false, maxStack: 1, color: '#c0392b' },
  jewellery: { id: 'jewellery', name: 'Jewellery', w: 1, h: 1, weight: 0.1, effect: { kind: 'misc' }, value: 35, stackable: true, maxStack: 3, color: '#d4af37' },
};

export type LootEntry = readonly [itemId: string, weight: number];

// Per-category weighted loot tables. Weights are relative.
export const LOOT_TABLES: Record<PoiCategory, LootEntry[]> = {
  supermarket: [
    ['canned_food', 10], ['rice_pack', 6], ['instant_noodles', 9], ['snacks', 8],
    ['water_bottle', 10], ['soft_drink', 7], ['isotonic', 5], ['kitchen_knife', 3],
    ['painkillers', 2], ['batteries', 3], ['coffee', 4],
  ],
  convenience: [
    ['snacks', 10], ['soft_drink', 8], ['instant_noodles', 6], ['water_bottle', 6],
    ['coffee', 5], ['energy_drink', 4], ['batteries', 3], ['painkillers', 2],
  ],
  pharmacy: [
    ['bandage', 10], ['painkillers', 8], ['antiseptic', 7], ['antibiotics', 5],
    ['medkit', 3], ['batteries', 2], ['water_bottle', 3],
  ],
  hospital: [
    ['medkit', 9], ['antibiotics', 8], ['bandage', 8], ['antiseptic', 7],
    ['painkillers', 6], ['jewellery', 2], ['kevlar_vest', 2],
  ],
  hardware: [
    ['hammer', 8], ['crowbar', 6], ['fire_axe', 4], ['parang', 4], ['toolbox', 5],
    ['duct_tape', 7], ['scrap_metal', 8], ['batteries', 5], ['fuel_can', 3],
    ['hard_hat', 5], ['work_vest', 4], ['torch', 4], ['leather_jacket', 2],
  ],
  fuel: [
    ['fuel_can', 9], ['snacks', 6], ['soft_drink', 6], ['energy_drink', 4],
    ['coffee', 4], ['duct_tape', 3], ['batteries', 3], ['torch', 3],
  ],
  police: [
    ['pistol', 6], ['shotgun', 3], ['ammo_box', 9], ['crowbar', 4],
    ['bandage', 5], ['batteries', 3], ['riot_helmet', 5], ['kevlar_vest', 4],
    ['riot_shield', 4],
  ],
  residential: [
    ['snacks', 8], ['canned_food', 6], ['water_bottle', 6], ['kitchen_knife', 4],
    ['painkillers', 3], ['batteries', 4], ['jewellery', 2], ['duct_tape', 3],
    ['scrap_metal', 3], ['hammer', 2], ['leather_jacket', 2],
  ],
  foodcourt: [
    ['hawker_meal', 10], ['snacks', 7], ['soft_drink', 8], ['isotonic', 5],
    ['canned_food', 4], ['coffee', 4],
  ],
  mrt: [
    ['snacks', 8], ['soft_drink', 7], ['water_bottle', 5], ['isotonic', 4],
    ['coffee', 4], ['batteries', 3], ['torch', 2],
  ],
  // Roadside scraps only. Waypoints exist so the map is walkable, not so it's
  // farmable — anything richer here would undercut going to a real building.
  waypoint: [
    ['scrap_metal', 10], ['duct_tape', 5], ['water_bottle', 4], ['snacks', 4],
    ['batteries', 3], ['fuel_can', 2],
  ],
};

export interface LootStack {
  defId: string;
  count: number;
}

/**
 * Roll loot for a scavenge. Quantity scales with the POI's "richness"
 * (higher for supermarkets, lower for already-thin categories) plus
 * perception & scavenger bonuses supplied by the caller.
 */
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
    // ~20% of rolls come up empty (ransacked shelves)
    if (rng.chance(0.2)) continue;
    const id = rng.weighted(table);
    const def = ITEMS[id];
    const qty = def.stackable ? rng.int(1, Math.min(3, def.maxStack)) : 1;
    out.set(id, (out.get(id) ?? 0) + qty);
  }
  return [...out.entries()].map(([defId, count]) => ({ defId, count }));
}

export function itemDef(id: string): ItemDef {
  return ITEMS[id];
}
