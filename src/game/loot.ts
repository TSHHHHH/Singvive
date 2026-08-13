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
  // Perishables must be non-stackable — a stack has no single wear value. It
  // reads right anyway: one abandoned takeaway container is one item.
  hawker_meal: { id: 'hawker_meal', name: 'Leftover Hawker Meal', w: 2, h: 1, weight: 0.5, effect: { kind: 'food', hunger: 45 }, value: 5, stackable: false, maxStack: 1, color: '#a86f34', maxCondition: 100, perishable: true },
  // Keeps for the whole run: the food you want when you're planning three days
  // ahead rather than solving tonight.
  bak_kwa: { id: 'bak_kwa', name: 'Vacuum-Packed Bak Kwa', w: 2, h: 1, weight: 0.4, effect: { kind: 'food', hunger: 50 }, value: 16, stackable: true, maxStack: 3, color: '#8c2f28', scarcity: 0.6 },
  army_ration: { id: 'army_ration', name: 'SAF Ration Pack', w: 2, h: 2, weight: 0.9, effect: { kind: 'food', hunger: 70 }, value: 24, stackable: false, maxStack: 1, color: '#4a5240', scarcity: 0.35 },
  milo_tin: { id: 'milo_tin', name: 'Tin of Milo', w: 1, h: 2, weight: 1.4, effect: { kind: 'food', hunger: 30 }, value: 10, stackable: false, maxStack: 1, color: '#3c6b3a' },
  condensed_milk: { id: 'condensed_milk', name: 'Condensed Milk', w: 1, h: 1, weight: 0.4, effect: { kind: 'food', hunger: 25 }, value: 7, stackable: true, maxStack: 4, color: '#d9c9a3' },
  // Perishables are all non-stackable — a stack has no single wear value.
  kaya_toast: { id: 'kaya_toast', name: 'Kaya Toast', w: 1, h: 1, weight: 0.2, effect: { kind: 'food', hunger: 20 }, value: 4, stackable: false, maxStack: 1, color: '#7a5a2a', maxCondition: 100, perishable: true },
  curry_puff: { id: 'curry_puff', name: 'Curry Puff', w: 1, h: 1, weight: 0.2, effect: { kind: 'food', hunger: 25 }, value: 5, stackable: false, maxStack: 1, color: '#c98a3f', maxCondition: 100, perishable: true },
  nasi_lemak: { id: 'nasi_lemak', name: 'Packet Nasi Lemak', w: 2, h: 1, weight: 0.5, effect: { kind: 'food', hunger: 50 }, value: 8, stackable: false, maxStack: 1, color: '#3f6b4a', maxCondition: 100, perishable: true },
  wild_boar_meat: { id: 'wild_boar_meat', name: 'Wild Boar Meat', w: 2, h: 2, weight: 2.2, effect: { kind: 'food', hunger: 65 }, value: 12, stackable: false, maxStack: 1, color: '#8a4a44', maxCondition: 100, perishable: true },
  river_fish: { id: 'river_fish', name: 'River Fish', w: 2, h: 1, weight: 0.8, effect: { kind: 'food', hunger: 35 }, value: 6, stackable: false, maxStack: 1, color: '#6b8a94', maxCondition: 100, perishable: true },
  // The one that makes you choose. Three cells and two kilos of it, it goes off
  // in a day, and every nose in the block knows you're carrying it.
  durian: { id: 'durian', name: 'Durian', w: 3, h: 2, weight: 2.0, effect: { kind: 'food', hunger: 80 }, value: 15, stackable: false, maxStack: 1, color: '#9c8f3a', maxCondition: 100, perishable: true, scarcity: 0.5 },
  // --- Water ---
  // Clean water is the scarce one. What the city actually has lying around is
  // whatever was standing in a tank, and you boil it or you gamble.
  water_bottle: { id: 'water_bottle', name: 'Bottled Water', w: 1, h: 2, weight: 0.6, effect: { kind: 'water', thirst: 35 }, value: 5, stackable: true, maxStack: 3, color: '#2f7fb5', scarcity: 0.45 },
  newater: { id: 'newater', name: 'NEWater Bottle', w: 1, h: 2, weight: 0.6, effect: { kind: 'water', thirst: 40 }, value: 7, stackable: true, maxStack: 3, color: '#2fb5a5' },
  dirty_water: { id: 'dirty_water', name: 'Murky Water', w: 1, h: 2, weight: 0.7, effect: { kind: 'water', thirst: 18 }, value: 1, stackable: true, maxStack: 3, color: '#5a6b4a' },
  purification_tabs: { id: 'purification_tabs', name: 'Purification Tablets', w: 1, h: 1, weight: 0.1, effect: { kind: 'misc' }, value: 12, stackable: true, maxStack: 5, color: '#9fd8e8' },
  soft_drink: { id: 'soft_drink', name: 'Soft Drink', w: 1, h: 1, weight: 0.4, effect: { kind: 'water', thirst: 20 }, value: 4, stackable: true, maxStack: 4, color: '#3a6ea5' },
  isotonic: { id: 'isotonic', name: '100PLUS', w: 1, h: 2, weight: 0.5, effect: { kind: 'water', thirst: 30 }, value: 6, stackable: true, maxStack: 3, color: '#2f9fb5' },
  tiger_beer: { id: 'tiger_beer', name: 'Warm Tiger Beer', w: 1, h: 1, weight: 0.4, effect: { kind: 'energy', energy: 20 }, value: 5, stackable: true, maxStack: 4, color: '#b58a2a' },
  chin_chow: { id: 'chin_chow', name: 'Grass Jelly Drink', w: 1, h: 1, weight: 0.4, effect: { kind: 'water', thirst: 25 }, value: 5, stackable: true, maxStack: 4, color: '#3a3a3a' },
  yakult: { id: 'yakult', name: 'Yakult', w: 1, h: 1, weight: 0.2, effect: { kind: 'cure', infection: 8 }, value: 6, stackable: true, maxStack: 5, color: '#e3d5b8' },
  // --- Medicine ---
  bandage: { id: 'bandage', name: 'Bandage', w: 1, h: 1, weight: 0.1, effect: { kind: 'heal', health: 8, partHeal: 25, stopsBleeding: 'one' }, value: 8, stackable: true, maxStack: 5, color: '#d7d2c4' },
  // The floor of the bleeding economy. Torn cloth always stops the bleed, so a
  // bad loot streak can never leave you with no answer at all — but it dresses
  // a wound with a dirty shirt, and the infection is the bill for that. Clean
  // bandages stay strictly better; they are just no longer mandatory.
  improvised_bandage: { id: 'improvised_bandage', name: 'Improvised Dressing', w: 1, h: 1, weight: 0.1, effect: { kind: 'heal', health: 3, partHeal: 10, stopsBleeding: 'one', infectionRisk: 10 }, value: 3, stackable: true, maxStack: 5, color: '#9a8f7d' },
  painkillers: { id: 'painkillers', name: 'Painkillers', w: 1, h: 1, weight: 0.1, effect: { kind: 'heal', health: 15 }, value: 7, stackable: true, maxStack: 4, color: '#cfc9de' },
  // Evac requires carrying one of these out, so it must not be double-gated: a
  // tight scarcity roll on top of a thin table presence made it a 3%-of-runs item.
  medkit: { id: 'medkit', name: 'First-Aid Kit', w: 2, h: 2, weight: 1.2, effect: { kind: 'heal', health: 40, partHeal: 60, stopsBleeding: 'all' }, value: 25, stackable: false, maxStack: 1, color: '#c94f4f', scarcity: 0.75 },
  antibiotics: { id: 'antibiotics', name: 'Antibiotics', w: 1, h: 1, weight: 0.1, effect: { kind: 'cure', infection: 45 }, value: 30, stackable: true, maxStack: 3, color: '#7fbf6b', scarcity: 0.5 },
  antiseptic: { id: 'antiseptic', name: 'Antiseptic', w: 1, h: 1, weight: 0.2, effect: { kind: 'cure', infection: 25 }, value: 15, stackable: true, maxStack: 3, color: '#8fcf7b' },
  tiger_balm: { id: 'tiger_balm', name: 'Tiger Balm', w: 1, h: 1, weight: 0.1, effect: { kind: 'heal', health: 10 }, value: 6, stackable: true, maxStack: 5, color: '#c98a2a' },
  axe_oil: { id: 'axe_oil', name: 'Medicated Oil', w: 1, h: 1, weight: 0.1, effect: { kind: 'energy', energy: 18 }, value: 6, stackable: true, maxStack: 4, color: '#7a9c4a' },
  po_chai: { id: 'po_chai', name: 'Po Chai Pills', w: 1, h: 1, weight: 0.1, effect: { kind: 'cure', infection: 18 }, value: 10, stackable: true, maxStack: 4, color: '#b5432a' },
  splint: { id: 'splint', name: 'Splint', w: 1, h: 2, weight: 0.3, effect: { kind: 'heal', health: 5, partHeal: 70 }, value: 14, stackable: false, maxStack: 1, color: '#a8935f' },
  mosquito_coil: { id: 'mosquito_coil', name: 'Mosquito Coil', w: 1, h: 1, weight: 0.2, effect: { kind: 'cure', infection: 6 }, value: 4, stackable: true, maxStack: 4, color: '#7a6b4a' },
  // --- Stimulants / energy ---
  coffee: { id: 'coffee', name: 'Kopi Packet', w: 1, h: 1, weight: 0.1, effect: { kind: 'energy', energy: 25 }, value: 4, stackable: true, maxStack: 4, color: '#6b4423' },
  energy_drink: { id: 'energy_drink', name: 'Energy Drink', w: 1, h: 2, weight: 0.4, effect: { kind: 'energy', energy: 40 }, value: 9, stackable: true, maxStack: 3, color: '#c0392b' },
  // --- Weapons (melee, mainHand) ---
  kitchen_knife: { id: 'kitchen_knife', name: 'Kitchen Knife', w: 1, h: 2, weight: 0.3, effect: { kind: 'weapon', damage: 10, accuracy: 1, ranged: false }, value: 10, stackable: false, maxStack: 1, color: '#9aa0a6', slot: 'mainHand', wearRate: 1.25 },
  hammer: { id: 'hammer', name: 'Claw Hammer', w: 1, h: 2, weight: 0.7, effect: { kind: 'weapon', damage: 14, accuracy: 0, ranged: false }, value: 12, stackable: false, maxStack: 1, color: '#8a8f94', slot: 'mainHand', wearRate: 0.8 },
  crowbar: { id: 'crowbar', name: 'Crowbar', w: 1, h: 3, weight: 1.5, effect: { kind: 'weapon', damage: 18, accuracy: 1, ranged: false }, value: 18, stackable: false, maxStack: 1, color: '#b5451d', slot: 'mainHand', wearRate: 0.45 },
  fire_axe: { id: 'fire_axe', name: 'Fire Axe', w: 1, h: 3, weight: 2.5, effect: { kind: 'weapon', damage: 24, accuracy: 0, ranged: false }, value: 26, stackable: false, maxStack: 1, color: '#a63a2a', slot: 'mainHand', wearRate: 0.65 },
  parang: { id: 'parang', name: 'Parang', w: 1, h: 3, weight: 0.8, effect: { kind: 'weapon', damage: 20, accuracy: 2, ranged: false }, value: 22, stackable: false, maxStack: 1, color: '#7f8c8d', slot: 'mainHand', wearRate: 0.85 },
  // A length of timber. Barely a weapon on its own — it's here to be lashed to
  // a blade, which is the only reason to pick one up.
  wooden_stick: { id: 'wooden_stick', name: 'Wooden Stick', w: 1, h: 3, weight: 0.5, effect: { kind: 'weapon', damage: 6, accuracy: 0, ranged: false }, value: 2, stackable: false, maxStack: 1, color: '#8a6f4a', slot: 'mainHand', wearRate: 1.6, maxCondition: 60 },
  meat_cleaver: { id: 'meat_cleaver', name: 'Meat Cleaver', w: 1, h: 2, weight: 0.6, effect: { kind: 'weapon', damage: 16, accuracy: 1, ranged: false }, value: 14, stackable: false, maxStack: 1, color: '#a8adb2', slot: 'mainHand', wearRate: 1.2 },
  golf_club: { id: 'golf_club', name: 'Golf Club', w: 1, h: 3, weight: 0.9, effect: { kind: 'weapon', damage: 15, accuracy: 2, ranged: false }, value: 11, stackable: false, maxStack: 1, color: '#c0c4c8', slot: 'mainHand', wearRate: 1.3 },
  baseball_bat: { id: 'baseball_bat', name: 'Baseball Bat', w: 1, h: 3, weight: 1.1, effect: { kind: 'weapon', damage: 18, accuracy: 1, ranged: false }, value: 13, stackable: false, maxStack: 1, color: '#a8804a', slot: 'mainHand', wearRate: 1 },
  changkol: { id: 'changkol', name: 'Changkol', w: 1, h: 3, weight: 2.8, effect: { kind: 'weapon', damage: 22, accuracy: -1, ranged: false }, value: 15, stackable: false, maxStack: 1, color: '#7a6b4a', slot: 'mainHand', wearRate: 0.7 },
  // Somebody's display piece off a living-room wall. It cuts beautifully and
  // it was never made to be used — hence a ceiling well below pristine, so a
  // katana is always a little further gone than you'd like.
  katana: { id: 'katana', name: 'Katana', w: 1, h: 4, weight: 1.2, effect: { kind: 'weapon', damage: 30, accuracy: 2, ranged: false }, value: 48, stackable: false, maxStack: 1, color: '#8f9498', slot: 'mainHand', wearRate: 0.7, exotic: true, scarcity: 0.18, maxCondition: 75 },
  // --- Weapons (lashed spears, craft-only) ---
  // Reach: a spear out-ranges the blade it was built from, at the cost of a
  // fourth cell, a stick and the blade itself.
  //
  // No `maxCondition` cap on these. A spear you lashed together this morning is
  // sound — capping it would mean a freshly built one could never reach its own
  // printed damage, which made the parang spear barely worth the parang.
  spear_knife: { id: 'spear_knife', name: 'Knife Spear', w: 1, h: 4, weight: 0.8, effect: { kind: 'weapon', damage: 16, accuracy: 2, ranged: false }, value: 12, stackable: false, maxStack: 1, color: '#9aa0a6', slot: 'mainHand', wearRate: 1.4 },
  spear_cleaver: { id: 'spear_cleaver', name: 'Cleaver Spear', w: 1, h: 4, weight: 1.1, effect: { kind: 'weapon', damage: 21, accuracy: 2, ranged: false }, value: 18, stackable: false, maxStack: 1, color: '#a8adb2', slot: 'mainHand', wearRate: 1.2 },
  spear_parang: { id: 'spear_parang', name: 'Parang Spear', w: 1, h: 4, weight: 1.3, effect: { kind: 'weapon', damage: 26, accuracy: 3, ranged: false }, value: 28, stackable: false, maxStack: 1, color: '#7f8c8d', slot: 'mainHand', wearRate: 1 },
  // --- Weapons (ranged, mainHand) ---
  pistol: { id: 'pistol', name: 'Service Pistol', w: 2, h: 1, weight: 1.0, effect: { kind: 'weapon', damage: 28, accuracy: 3, ranged: true }, value: 45, stackable: false, maxStack: 1, color: '#4a4f55', slot: 'mainHand', wearRate: 0.5, exotic: true, scarcity: 0.6 },
  shotgun: { id: 'shotgun', name: 'Shotgun', w: 4, h: 1, weight: 3.5, effect: { kind: 'weapon', damage: 40, accuracy: 2, ranged: true, roundsPerShot: 2 }, value: 60, stackable: false, maxStack: 1, color: '#5a3a1d', slot: 'mainHand', wearRate: 0.5, exotic: true, scarcity: 0.3 },
  // A sealed box is the good find — loose shells are what you actually keep
  // turning up. Both feed the same magazine; the box just goes further.
  //
  // No scarcity gate on the box: it's an evac requirement, and being confined
  // to police stations and old shelters is already the whole of its rarity.
  ammo_box: { id: 'ammo_box', name: 'Box of Ammo', w: 1, h: 1, weight: 0.8, effect: { kind: 'ammo', rounds: 12 }, value: 20, stackable: true, maxStack: 5, color: '#c9a441' },
  ammo_shell: { id: 'ammo_shell', name: 'Loose Shells', w: 1, h: 1, weight: 0.3, effect: { kind: 'ammo', rounds: 4 }, value: 8, stackable: true, maxStack: 6, color: '#a8862f' },
  // --- Armour: head ---
  // Light utility — filters haze, barely stops a swing.
  n95_mask: {
    id: 'n95_mask',
    name: 'N95 Mask',
    w: 1,
    h: 1,
    weight: 0.1,
    effect: { kind: 'misc' },
    value: 9,
    stackable: false,
    maxStack: 1,
    color: '#d8d5cc',
    slot: 'head',
    modifiers: { defenseBonus: 1, limbArmor: 1, statusResist: 0.05 },
  },
  hard_hat: {
    id: 'hard_hat',
    name: 'Hard Hat',
    w: 1,
    h: 1,
    weight: 0.4,
    effect: { kind: 'misc' },
    value: 8,
    stackable: false,
    maxStack: 1,
    color: '#e0b020',
    slot: 'head',
    modifiers: {
      defenseBonus: 1,
      limbArmor: 2,
      statusResist: 0.15,
      dodgeBonus: -0.02,
      headTargetReduction: 0.35,
      headCritReduction: 0.25,
    },
  },
  motorcycle_helmet: {
    id: 'motorcycle_helmet',
    name: 'Motorcycle Helmet',
    w: 2,
    h: 2,
    weight: 1.2,
    effect: { kind: 'misc' },
    value: 16,
    stackable: false,
    maxStack: 1,
    color: '#2a2e34',
    slot: 'head',
    modifiers: {
      defenseBonus: 2,
      limbArmor: 3,
      statusResist: 0.22,
      dodgeBonus: -0.04,
      headTargetReduction: 0.38,
      headCritReduction: 0.3,
    },
  },
  riot_helmet: {
    id: 'riot_helmet',
    name: 'Riot Helmet',
    w: 2,
    h: 2,
    weight: 1.5,
    effect: { kind: 'misc' },
    value: 22,
    stackable: false,
    maxStack: 1,
    color: '#3a4048',
    slot: 'head',
    modifiers: {
      defenseBonus: 3,
      limbArmor: 4,
      statusResist: 0.3,
      dodgeBonus: -0.06,
      headTargetReduction: 0.4,
      headCritReduction: 0.4,
    },
  },
  // --- Armour: body ---
  leather_jacket: {
    id: 'leather_jacket',
    name: 'Leather Jacket',
    w: 2,
    h: 2,
    weight: 1.2,
    effect: { kind: 'misc' },
    value: 14,
    stackable: false,
    maxStack: 1,
    color: '#5a3a24',
    slot: 'body',
    modifiers: { defenseBonus: 2, limbArmor: 2, statusResist: 0.1, dodgeBonus: 0.02 },
  },
  work_vest: {
    id: 'work_vest',
    name: 'Utility Vest',
    w: 2,
    h: 2,
    weight: 1.0,
    effect: { kind: 'misc' },
    value: 16,
    stackable: false,
    maxStack: 1,
    color: '#7a6b3a',
    slot: 'body',
    modifiers: { defenseBonus: 1, limbArmor: 1, weightCapacityBonus: 6 },
  },
  army_uniform: {
    id: 'army_uniform',
    name: 'Army Camo Uniform',
    w: 2,
    h: 3,
    weight: 1.4,
    effect: { kind: 'misc' },
    value: 28,
    stackable: false,
    maxStack: 1,
    color: '#4a5a3a',
    slot: 'body',
    modifiers: {
      defenseBonus: 1,
      limbArmor: 1,
      statusResist: 0.08,
      dodgeBonus: 0.03,
      encounterChanceMod: -0.08,
      awarenessMod: 1,
    },
    exotic: true,
    scarcity: 0.35,
  },
  kevlar_vest: {
    id: 'kevlar_vest',
    name: 'Kevlar Vest',
    w: 2,
    h: 3,
    weight: 3.5,
    effect: { kind: 'misc' },
    value: 40,
    stackable: false,
    maxStack: 1,
    color: '#2f3a2a',
    slot: 'body',
    modifiers: {
      defenseBonus: 5,
      limbArmor: 5,
      statusResist: 0.25,
      dodgeBonus: -0.05,
    },
    exotic: true,
    scarcity: 0.25,
  },
  sbo_vest: {
    id: 'sbo_vest',
    name: 'SBO Load-Bearing Vest',
    w: 2,
    h: 2,
    weight: 1.8,
    effect: { kind: 'misc' },
    value: 34,
    stackable: false,
    maxStack: 1,
    color: '#4a5240',
    slot: 'body',
    modifiers: { defenseBonus: 2, limbArmor: 2, statusResist: 0.12, weightCapacityBonus: 10 },
    exotic: true,
    scarcity: 0.3,
  },
  // --- Hands ---
  work_gloves: {
    id: 'work_gloves',
    name: 'Work Gloves',
    w: 1,
    h: 1,
    weight: 0.2,
    effect: { kind: 'misc' },
    value: 7,
    stackable: false,
    maxStack: 1,
    color: '#8a7a5a',
    slot: 'hands',
    modifiers: { limbArmor: 1, statusResist: 0.08, accuracyBonus: 1 },
  },
  cut_gloves: {
    id: 'cut_gloves',
    name: 'Cut-Resistant Gloves',
    w: 1,
    h: 1,
    weight: 0.25,
    effect: { kind: 'misc' },
    value: 11,
    stackable: false,
    maxStack: 1,
    color: '#6a7080',
    slot: 'hands',
    modifiers: { limbArmor: 2, statusResist: 0.18 },
  },
  grip_gloves: {
    id: 'grip_gloves',
    name: 'Grip Gloves',
    w: 1,
    h: 1,
    weight: 0.15,
    effect: { kind: 'misc' },
    value: 9,
    stackable: false,
    maxStack: 1,
    color: '#3a3a3a',
    slot: 'hands',
    modifiers: { limbArmor: 1, statusResist: 0.06, attackBonus: 1 },
  },
  tactical_gloves: {
    id: 'tactical_gloves',
    name: 'Tactical Gloves',
    w: 1,
    h: 1,
    weight: 0.18,
    effect: { kind: 'misc' },
    value: 14,
    stackable: false,
    maxStack: 1,
    color: '#2f3530',
    slot: 'hands',
    modifiers: { limbArmor: 1, statusResist: 0.1, speedBonus: 1.2, accuracyBonus: 1 },
    scarcity: 0.55,
  },
  // --- Legs ---
  jeans: {
    id: 'jeans',
    name: 'Jeans',
    w: 2,
    h: 2,
    weight: 0.7,
    effect: { kind: 'misc' },
    value: 6,
    stackable: false,
    maxStack: 1,
    color: '#3a5070',
    slot: 'legs',
    modifiers: { limbArmor: 1, statusResist: 0.06, dodgeBonus: 0.02 },
  },
  work_trousers: {
    id: 'work_trousers',
    name: 'Work Trousers',
    w: 2,
    h: 2,
    weight: 0.9,
    effect: { kind: 'misc' },
    value: 10,
    stackable: false,
    maxStack: 1,
    color: '#6a5a3a',
    slot: 'legs',
    modifiers: { limbArmor: 2, statusResist: 0.12 },
  },
  camo_pants: {
    id: 'camo_pants',
    name: 'Camo Pants',
    w: 2,
    h: 2,
    weight: 0.8,
    effect: { kind: 'misc' },
    value: 18,
    stackable: false,
    maxStack: 1,
    color: '#4a5a38',
    slot: 'legs',
    modifiers: {
      limbArmor: 1,
      statusResist: 0.08,
      dodgeBonus: 0.03,
      encounterChanceMod: -0.05,
    },
    scarcity: 0.4,
  },
  riot_pads: {
    id: 'riot_pads',
    name: 'Riot Leg Pads',
    w: 2,
    h: 2,
    weight: 2.2,
    effect: { kind: 'misc' },
    value: 24,
    stackable: false,
    maxStack: 1,
    color: '#3a4048',
    slot: 'legs',
    modifiers: { defenseBonus: 1, limbArmor: 3, statusResist: 0.2, dodgeBonus: -0.04 },
    exotic: true,
    scarcity: 0.3,
  },
  // --- Feet (travel / stealth; no combat soak) ---
  flip_flops: {
    id: 'flip_flops',
    name: 'Flip-Flops',
    w: 1,
    h: 1,
    weight: 0.2,
    effect: { kind: 'misc' },
    value: 2,
    stackable: false,
    maxStack: 1,
    color: '#c9a88a',
    slot: 'feet',
    modifiers: { travelSpeedBonus: -0.12, encounterChanceMod: 0.04 },
  },
  sneakers: {
    id: 'sneakers',
    name: 'Sneakers',
    w: 2,
    h: 1,
    weight: 0.6,
    effect: { kind: 'misc' },
    value: 8,
    stackable: false,
    maxStack: 1,
    color: '#d8d5cc',
    slot: 'feet',
    modifiers: { travelSpeedBonus: 0.08, encounterChanceMod: -0.02, speedBonus: 0.4 },
  },
  hiking_boots: {
    id: 'hiking_boots',
    name: 'Hiking Boots',
    w: 2,
    h: 1,
    weight: 1.2,
    effect: { kind: 'misc' },
    value: 14,
    stackable: false,
    maxStack: 1,
    color: '#5a4030',
    slot: 'feet',
    modifiers: { travelSpeedBonus: 0.12, encounterChanceMod: -0.03 },
  },
  combat_boots: {
    id: 'combat_boots',
    name: 'Combat Boots',
    w: 2,
    h: 1,
    weight: 1.5,
    effect: { kind: 'misc' },
    value: 20,
    stackable: false,
    maxStack: 1,
    color: '#2a2a28',
    slot: 'feet',
    modifiers: { travelSpeedBonus: 0.1, encounterChanceMod: 0.03, speedBonus: 0.3 },
    scarcity: 0.45,
  },
  // --- Off hand ---
  riot_shield: {
    id: 'riot_shield',
    name: 'Riot Shield',
    w: 2,
    h: 3,
    weight: 4.0,
    effect: { kind: 'misc' },
    value: 30,
    stackable: false,
    maxStack: 1,
    color: '#37506b',
    slot: 'offHand',
    modifiers: { defenseBonus: 4, attackBonus: -1, dodgeBonus: 0.08 },
    exotic: true,
    scarcity: 0.3,
  },
  torch: {
    id: 'torch',
    name: 'Torch',
    w: 1,
    h: 2,
    weight: 0.3,
    effect: { kind: 'misc' },
    value: 8,
    stackable: false,
    maxStack: 1,
    color: '#c9a441',
    slot: 'offHand',
    modifiers: { attackBonus: 1 },
  },
  // --- Misc / fuel / crafting ---
  fuel_can: { id: 'fuel_can', name: 'Jerry Can (Fuel)', w: 2, h: 2, weight: 5.0, effect: { kind: 'fuel' }, value: 22, stackable: false, maxStack: 1, color: '#c0392b' },
  duct_tape: { id: 'duct_tape', name: 'Duct Tape', w: 1, h: 1, weight: 0.2, effect: { kind: 'misc' }, value: 6, stackable: true, maxStack: 4, color: '#7f8c8d' },
  batteries: { id: 'batteries', name: 'Batteries', w: 1, h: 1, weight: 0.2, effect: { kind: 'misc' }, value: 7, stackable: true, maxStack: 5, color: '#3a5a40' },
  scrap_metal: { id: 'scrap_metal', name: 'Scrap Metal', w: 2, h: 1, weight: 1.5, effect: { kind: 'misc' }, value: 4, stackable: true, maxStack: 4, color: '#6b7075' },
  toolbox: { id: 'toolbox', name: 'Toolbox', w: 2, h: 2, weight: 3.0, effect: { kind: 'misc' }, value: 16, stackable: false, maxStack: 1, color: '#c0392b' },
  jewellery: { id: 'jewellery', name: 'Jewellery', w: 1, h: 1, weight: 0.1, effect: { kind: 'misc' }, value: 35, stackable: true, maxStack: 3, color: '#d4af37', scarcity: 0.45 },
  // Pays the turnstile. A card is what a turnstile wants; a can of food was
  // always an absurd thing to hand a machine.
  ez_link_card: { id: 'ez_link_card', name: 'EZ-Link Card', w: 1, h: 1, weight: 0.05, effect: { kind: 'misc' }, value: 6, stackable: true, maxStack: 4, color: '#2f6fb5' },
  red_packet: { id: 'red_packet', name: 'Ang Bao', w: 1, h: 1, weight: 0.05, effect: { kind: 'misc' }, value: 18, stackable: true, maxStack: 5, color: '#b5322a', scarcity: 0.55 },
  joss_paper: { id: 'joss_paper', name: 'Joss Paper', w: 1, h: 1, weight: 0.1, effect: { kind: 'misc' }, value: 2, stackable: true, maxStack: 5, color: '#c9a441' },
  rain_tarp: { id: 'rain_tarp', name: 'Rain Tarp', w: 2, h: 1, weight: 0.9, effect: { kind: 'misc' }, value: 10, stackable: false, maxStack: 1, color: '#3a5a6b' },
  powerbank: { id: 'powerbank', name: 'Powerbank', w: 1, h: 1, weight: 0.3, effect: { kind: 'misc' }, value: 13, stackable: false, maxStack: 1, color: '#3a4048', maxCondition: 100 },
  // Junk, and deliberately so. Now that the pack is tight, the thing that isn't
  // worth its cell is a decision rather than a freebie.
  four_d_ticket: { id: 'four_d_ticket', name: '4D Ticket', w: 1, h: 1, weight: 0.01, effect: { kind: 'misc' }, value: 0, stackable: true, maxStack: 8, color: '#8a867e' },
  // --- Crafting stock ---
  cloth_rags: { id: 'cloth_rags', name: 'Cloth Rags', w: 1, h: 1, weight: 0.2, effect: { kind: 'misc' }, value: 2, stackable: true, maxStack: 6, color: '#8c8377' },
  // Parked: kept so the molotov can come back as a one-line change, but out of
  // every loot table meanwhile — with nothing to craft from it, it was just
  // cargo. Put it back in supermarket/foodcourt/residential when it has a use.
  glass_bottle: { id: 'glass_bottle', name: 'Empty Bottle', w: 1, h: 1, weight: 0.3, effect: { kind: 'misc' }, value: 2, stackable: true, maxStack: 4, color: '#6b8f7a' },
  spare_parts: { id: 'spare_parts', name: 'Spare Parts', w: 1, h: 1, weight: 0.6, effect: { kind: 'misc' }, value: 12, stackable: true, maxStack: 4, color: '#8a8f94' },
  whetstone: { id: 'whetstone', name: 'Whetstone', w: 1, h: 1, weight: 0.4, effect: { kind: 'misc' }, value: 9, stackable: true, maxStack: 3, color: '#6f7276' },
  gun_oil: { id: 'gun_oil', name: 'Gun Oil', w: 1, h: 1, weight: 0.2, effect: { kind: 'misc' }, value: 11, stackable: true, maxStack: 3, color: '#4d5a3a' },
};

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

// Per-category weighted loot tables. Weights are relative.
export const LOOT_TABLES: Record<PoiCategory, LootEntry[]> = {
  supermarket: [
    ['canned_food', 10], ['rice_pack', 5], ['instant_noodles', 9], ['snacks', 8],
    ['condensed_milk', 6], ['bak_kwa', 4], ['milo_tin', 4], ['durian', 2],
    ['dirty_water', 8], ['water_bottle', 4], ['soft_drink', 7], ['isotonic', 5],
    ['chin_chow', 5], ['yakult', 4], ['tiger_beer', 4], ['kitchen_knife', 3],
    ['painkillers', 2], ['batteries', 3], ['coffee', 4], ['cloth_rags', 4],
    ['purification_tabs', 3],
  ],
  convenience: [
    ['snacks', 10], ['soft_drink', 8], ['instant_noodles', 6], ['dirty_water', 6],
    ['water_bottle', 3], ['yakult', 5], ['tiger_beer', 4], ['condensed_milk', 4],
    ['coffee', 5], ['energy_drink', 4], ['batteries', 3], ['painkillers', 2],
    ['ez_link_card', 4], ['four_d_ticket', 5],
  ],
  pharmacy: [
    ['bandage', 10], ['painkillers', 8], ['antiseptic', 7], ['antibiotics', 5],
    ['tiger_balm', 8], ['axe_oil', 6], ['po_chai', 6], ['n95_mask', 6],
    ['mosquito_coil', 5], ['purification_tabs', 5], ['medkit', 3],
    ['batteries', 2], ['dirty_water', 3],
  ],
  hospital: [
    ['medkit', 9], ['antibiotics', 8], ['bandage', 8], ['antiseptic', 7],
    ['painkillers', 6], ['splint', 7], ['n95_mask', 5], ['po_chai', 4],
    ['cloth_rags', 6], ['jewellery', 2], ['kevlar_vest', 2],
  ],
  // Neighbourhood GP / polyclinic — useful meds, not a full trauma ward.
  clinic: [
    ['bandage', 9], ['painkillers', 8], ['antiseptic', 7], ['tiger_balm', 7],
    ['po_chai', 6], ['axe_oil', 5], ['antibiotics', 4], ['n95_mask', 5],
    ['medkit', 3], ['purification_tabs', 4], ['cloth_rags', 5], ['batteries', 2],
  ],
  hardware: [
    ['hammer', 8], ['crowbar', 6], ['fire_axe', 4], ['parang', 4], ['toolbox', 5],
    ['changkol', 5], ['wooden_stick', 8], ['whetstone', 6], ['spare_parts', 4],
    ['duct_tape', 7], ['scrap_metal', 8], ['batteries', 5], ['fuel_can', 3],
    ['hard_hat', 5], ['work_vest', 4], ['torch', 4], ['leather_jacket', 2],
    ['rain_tarp', 4], ['cloth_rags', 5],
    ['work_gloves', 6], ['cut_gloves', 4], ['work_trousers', 4], ['hiking_boots', 5],
    ['sneakers', 3],
  ],
  fuel: [
    ['fuel_can', 9], ['snacks', 6], ['soft_drink', 6], ['energy_drink', 4],
    ['coffee', 4], ['duct_tape', 3], ['batteries', 3], ['torch', 3],
    ['gun_oil', 4], ['four_d_ticket', 4], ['dirty_water', 4],
    ['flip_flops', 3], ['sneakers', 4],
  ],
  police: [
    ['pistol', 7], ['shotgun', 4], ['ammo_box', 12], ['ammo_shell', 9],
    ['crowbar', 4], ['bandage', 5], ['batteries', 3], ['riot_helmet', 5],
    ['kevlar_vest', 4], ['riot_shield', 4], ['sbo_vest', 4], ['gun_oil', 6],
    ['army_ration', 5], ['n95_mask', 3], ['medkit', 5],
    ['tactical_gloves', 4], ['riot_pads', 3], ['combat_boots', 4], ['army_uniform', 3],
  ],
  residential: [
    ['snacks', 8], ['canned_food', 6], ['dirty_water', 6], ['water_bottle', 3],
    ['kitchen_knife', 4], ['condensed_milk', 4], ['milo_tin', 4], ['kaya_toast', 4],
    ['tiger_balm', 5], ['mosquito_coil', 5], ['painkillers', 3], ['batteries', 4],
    ['jewellery', 2], ['red_packet', 3], ['joss_paper', 5], ['four_d_ticket', 5],
    ['ez_link_card', 4], ['duct_tape', 3], ['scrap_metal', 3], ['hammer', 2],
    ['meat_cleaver', 4], ['golf_club', 4], ['baseball_bat', 3], ['katana', 2],
    ['wooden_stick', 4], ['leather_jacket', 2], ['cloth_rags', 6],
    ['powerbank', 3],
    ['jeans', 5], ['sneakers', 6], ['flip_flops', 5], ['grip_gloves', 3],
    ['motorcycle_helmet', 2],
  ],
  foodcourt: [
    ['hawker_meal', 9], ['nasi_lemak', 7], ['curry_puff', 7], ['kaya_toast', 6],
    ['snacks', 6], ['soft_drink', 8], ['isotonic', 5], ['chin_chow', 6],
    ['tiger_beer', 5], ['canned_food', 4], ['coffee', 4], ['durian', 3],
    ['cloth_rags', 4], ['meat_cleaver', 7], ['kitchen_knife', 5],
    ['flip_flops', 3], ['cut_gloves', 3],
  ],
  mrt: [
    ['snacks', 8], ['soft_drink', 7], ['dirty_water', 5], ['isotonic', 4],
    ['coffee', 4], ['batteries', 3], ['torch', 2], ['ez_link_card', 9],
    ['four_d_ticket', 5], ['powerbank', 3],
    ['sneakers', 3], ['flip_flops', 4],
  ],
  // The west's payoff: the best source of materials and fuel outside a hardware
  // store, and the only place a run reliably finds heavy protective gear. Thin
  // on food and medicine — a warehouse feeds nobody.
  industrial: [
    ['scrap_metal', 10], ['duct_tape', 8], ['fuel_can', 8], ['toolbox', 6],
    ['spare_parts', 7], ['whetstone', 5], ['changkol', 4], ['rain_tarp', 5],
    ['crowbar', 5], ['hammer', 5], ['fire_axe', 3], ['hard_hat', 6],
    ['work_vest', 5], ['torch', 4], ['batteries', 4], ['parang', 2],
    ['n95_mask', 5], ['cloth_rags', 6], ['dirty_water', 5], ['wooden_stick', 6],
    ['medkit', 4],
    ['work_gloves', 6], ['work_trousers', 5], ['hiking_boots', 5], ['cut_gloves', 3],
  ],
  // Canteen, sick bay and workshop, in that order — a broad, shallow spread
  // rather than a specialist's stop.
  school: [
    ['snacks', 8], ['dirty_water', 7], ['water_bottle', 3], ['instant_noodles', 5],
    ['canned_food', 4], ['kaya_toast', 4], ['milo_tin', 4], ['bandage', 6],
    ['antiseptic', 4], ['painkillers', 4], ['tiger_balm', 5], ['batteries', 5],
    ['duct_tape', 4], ['scrap_metal', 3], ['hammer', 3], ['torch', 3],
    ['baseball_bat', 6], ['wooden_stick', 6], ['golf_club', 3],
    ['cloth_rags', 6], ['army_ration', 3], ['ez_link_card', 3],
    // Evac needs a box of ammo carried out, and a police station is a place a
    // run can plausibly never walk past. The schools were requisitioned as
    // shelters — which is exactly why there's ordnance left in them.
    ['medkit', 4], ['ammo_box', 7],
    ['sneakers', 5], ['jeans', 4], ['grip_gloves', 3], ['army_uniform', 2], ['camo_pants', 2],
  ],
  // Roadside scraps only. Waypoints exist so the map is walkable, not so it's
  // farmable — anything richer here would undercut going to a real building.
  waypoint: [
    ['scrap_metal', 10], ['duct_tape', 5], ['dirty_water', 6], ['snacks', 4],
    ['batteries', 3], ['fuel_can', 2], ['cloth_rags', 6], ['wooden_stick', 7],
    ['four_d_ticket', 6], ['joss_paper', 4], ['river_fish', 3], ['wild_boar_meat', 2],
    ['flip_flops', 4],
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
