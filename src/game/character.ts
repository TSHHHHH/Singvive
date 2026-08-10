import type { Attributes, AttributeKey, Character, Equipment, Trait } from './types';
import { itemDef } from './loot';

export const ATTRIBUTE_KEYS: AttributeKey[] = [
  'strength',
  'dexterity',
  'endurance',
  'perception',
  'wits',
];

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  endurance: 'Endurance',
  perception: 'Perception',
  wits: 'Wits',
};

export const ATTRIBUTE_BLURB: Record<AttributeKey, string> = {
  strength: 'Melee damage & carrying grit.',
  dexterity: 'Attack accuracy & dodging.',
  endurance: 'Max health & stamina.',
  perception: 'Spot loot & avoid ambushes.',
  wits: 'Better choices under pressure.',
};

export const BASE_ATTRIBUTE = 5; // baseline per stat — traits are the only stat source now
export const MIN_ATTR = 1;
export const MAX_ATTR = 12;

const ATTRIBUTE_MOD_KEYS: Record<AttributeKey, keyof Trait> = {
  strength: 'strengthMod',
  dexterity: 'dexterityMod',
  endurance: 'enduranceMod',
  perception: 'perceptionMod',
  wits: 'witsMod',
};

// ---------- Trait System ----------

export const TRAIT_BUDGET = 6;
export const MAX_POSITIVE_TRAITS = 4;
export const MAX_NEGATIVE_TRAITS = 3;

export const TRAITS: Trait[] = [
  // ===== POSITIVE TRAITS =====
  {
    id: 'ns_combat',
    name: 'NS Reservist',
    description: '+1 Strength, +2 attack, +1 defense. National Service muscle memory.',
    category: 'positive',
    cost: 2,
    conflicts: ['clumsy'],
    strengthMod: 1,
    attackMod: 2,
    defenseMod: 1,
  },
  {
    id: 'medic',
    name: 'Polyclinic Nurse',
    description: 'Healing items restore +5 HP. 35% less infection gain.',
    category: 'positive',
    cost: 2,
    conflicts: [],
    healBonus: 5,
    infectionResist: 0.35,
  },
  {
    id: 'hawker_cook',
    name: 'Hawker Cook',
    description: 'Food items restore 30% more hunger. A lifetime behind the wok.',
    category: 'positive',
    cost: 1,
    conflicts: ['picky_eater'],
    foodEffectMod: 0.3,
  },
  {
    id: 'marathoner',
    name: 'IPPT Gold',
    description: '+1 Endurance, +15 max HP, −10% energy drain. SAF fitness gold standard.',
    category: 'positive',
    cost: 2,
    conflicts: ['bad_knees', 'glass_jaw'],
    enduranceMod: 1,
    maxHpBonus: 15,
    energyDrainMod: -0.1,
  },
  {
    id: 'karang_guni',
    name: 'Karang Guni',
    description: '+1 loot, +1 extra search per POI. The original scavenger.',
    category: 'positive',
    cost: 2,
    conflicts: ['hoarder'],
    lootMod: 1,
    searchBonusMod: 1,
  },
  {
    id: 'tekong_legs',
    name: 'Tekong Legs',
    description: '+1 Dexterity, +15% travel speed. Route marches forged these calves.',
    category: 'positive',
    cost: 1,
    conflicts: ['bad_knees'],
    dexterityMod: 1,
    travelSpeedMod: 0.15,
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'No accuracy penalty at night. Years of shift work pay off.',
    category: 'positive',
    cost: 1,
    conflicts: ['poor_sleep'],
    nightAccuracyPenaltyRemoved: true,
  },
  {
    id: 'thick_skin',
    name: 'Thick Skin',
    description: '30% infection resist, +1 defense. Mosquito-hardened immune system.',
    category: 'positive',
    cost: 2,
    conflicts: ['hemophilia'],
    infectionResist: 0.3,
    defenseMod: 1,
  },
  {
    id: 'kiasuism',
    name: 'Kiasu',
    description: '+1 Wits, +10% loot value, see POI searches remaining. Must. Get. More.',
    category: 'positive',
    cost: 1,
    conflicts: ['squeamish'],
    witsMod: 1,
    lootValueMod: 0.1,
    showSearchesRemaining: true,
  },
  {
    id: 'kampong_spirit',
    name: 'Kampong Spirit',
    description: 'Faction hostility starts 1 tier lower. Community bonds transcend the apocalypse.',
    category: 'positive',
    cost: 2,
    conflicts: [],
    factionHostilityMod: -1,
  },
  {
    id: 'water_baby',
    name: 'Reservoir Swimmer',
    description: '−20% thirst drain. Trained at MacRitchie every weekend.',
    category: 'positive',
    cost: 1,
    conflicts: ['aircon_addict'],
    thirstDrainMod: -0.2,
  },
  {
    id: 'handyman',
    name: 'HDB Handyman',
    description: 'Barricade/craft items cost −1 material. Can fix anything with cable ties.',
    category: 'positive',
    cost: 1,
    conflicts: [],
  },
  {
    id: 'sixth_sense',
    name: 'Sixth Sense',
    description: '+1 Perception, +30% detection radius, ambush chance halved. You feel them before you see them.',
    category: 'positive',
    cost: 3,
    conflicts: ['noisy'],
    perceptionMod: 1,
    detectRadiusMod: 0.3,
    ambushChanceMod: -0.5,
    awarenessMod: 2,
  },
  {
    id: 'pack_rat',
    name: 'Pack Rat',
    description: 'Backpack +1 column (9×5). Every pocket has a pocket.',
    category: 'positive',
    cost: 2,
    conflicts: ['hoarder'],
    gridWidthBonus: 1,
  },

  // ===== NEGATIVE TRAITS =====
  {
    id: 'aircon_addict',
    name: 'Aircon Addict',
    description: '+20% energy drain outdoors. Never survived without climate control.',
    category: 'negative',
    cost: -1,
    conflicts: ['water_baby'],
    energyDrainMod: 0.2,
  },
  {
    id: 'picky_eater',
    name: 'Picky Eater',
    description: 'Food restores 25% less hunger. Refuses anything that isn\'t nasi lemak.',
    category: 'negative',
    cost: -1,
    conflicts: ['hawker_cook'],
    foodEffectMod: -0.25,
  },
  {
    id: 'glass_jaw',
    name: 'Glass Jaw',
    description: '−1 Endurance, −15 max HP. One hit and it\'s lights out.',
    category: 'negative',
    cost: -2,
    conflicts: ['marathoner'],
    enduranceMod: -1,
    maxHpBonus: -15,
  },
  {
    id: 'clumsy',
    name: 'Clumsy',
    description: '−1 Dexterity, −1 attack, +5% ambush chance. Trips over flat ground.',
    category: 'negative',
    cost: -1,
    conflicts: ['ns_combat'],
    dexterityMod: -1,
    attackMod: -1,
    ambushChanceMod: 0.05,
  },
  {
    id: 'hoarder',
    name: 'Hoarder',
    description: 'Cannot voluntarily drop items — must consume or stash. It might be useful later lah.',
    category: 'negative',
    cost: -1,
    conflicts: ['karang_guni', 'pack_rat'],
    cannotDropItems: true,
  },
  {
    id: 'noisy',
    name: 'Noisy',
    description: '+15% encounter chance when travelling. Can\'t stop talking.',
    category: 'negative',
    cost: -1,
    conflicts: ['sixth_sense'],
    encounterChanceMod: 0.15,
  },
  {
    id: 'bad_knees',
    name: 'Bad Knees',
    description: '−1 Dexterity, −20% travel speed, leg injuries heal 50% slower. Years of parade square took their toll.',
    category: 'negative',
    cost: -2,
    conflicts: ['marathoner', 'tekong_legs'],
    dexterityMod: -1,
    travelSpeedMod: -0.2,
    legHealMod: -0.5,
  },
  {
    id: 'hemophilia',
    name: 'Hemophiliac',
    description: 'Bleeding never self-stops — must treat. Carry bandages or die.',
    category: 'negative',
    cost: -2,
    conflicts: ['thick_skin'],
    bleedingSelfStopDisabled: true,
  },
  {
    id: 'poor_sleep',
    name: 'Light Sleeper',
    description: 'Sleep restores 30% less energy. Every sound jolts you awake.',
    category: 'negative',
    cost: -1,
    conflicts: ['night_owl'],
    sleepRestoreMod: -0.3,
  },
  {
    id: 'squeamish',
    name: 'Squeamish',
    description: '−1 attack vs zombies. The rot still makes you gag.',
    category: 'negative',
    cost: -1,
    conflicts: ['kiasuism'],
    attackMod: -1, // applied only vs zombies in combat resolution
  },
];

// ---------- Trait Helpers ----------

export function getTrait(id: string): Trait {
  return TRAITS.find((t) => t.id === id) ?? TRAITS[0];
}

/** Get all selected traits for a character. */
export function getTraits(ids: string[]): Trait[] {
  return ids.map(getTrait);
}

/** Sum a numeric trait modifier across all selected traits. */
export function sumTraitMod<K extends keyof Trait>(ids: string[], key: K): number {
  let total = 0;
  for (const id of ids) {
    const t = getTrait(id);
    const v = t[key];
    if (typeof v === 'number') total += v;
  }
  return total;
}

/** Check if any selected trait has a boolean flag set. */
export function hasTraitFlag<K extends keyof Trait>(ids: string[], key: K): boolean {
  return ids.some((id) => {
    const t = getTrait(id);
    return t[key] === true;
  });
}

/** Whether a candidate trait conflicts with the current selection. */
export function isIncompatible(candidateId: string, selectedIds: string[]): boolean {
  const candidate = getTrait(candidateId);
  // candidate's conflicts list blocks any already-selected
  if (candidate.conflicts.some((c) => selectedIds.includes(c))) return true;
  // any selected trait's conflicts list blocks the candidate
  for (const id of selectedIds) {
    const t = getTrait(id);
    if (t.conflicts.includes(candidateId)) return true;
  }
  return false;
}

/** Net points spent (positive costs − negative refunds). */
export function traitPointsSpent(ids: string[]): number {
  return ids.reduce((sum, id) => sum + Math.abs(getTrait(id).cost), 0);
}

/** Net trait budget used: positive costs minus negative refunds. */
export function traitBudgetUsed(ids: string[]): number {
  return ids.reduce((sum, id) => sum + getTrait(id).cost, 0);
}

/** Whether a new trait can be added given the current selection. */
export function canPickTrait(candidateId: string, selectedIds: string[]): boolean {
  if (selectedIds.includes(candidateId)) return false;
  if (isIncompatible(candidateId, selectedIds)) return false;
  const candidate = getTrait(candidateId);
  const positiveCount = selectedIds.filter((id) => getTrait(id).category === 'positive').length;
  const negativeCount = selectedIds.filter((id) => getTrait(id).category === 'negative').length;
  if (candidate.category === 'positive') {
    if (positiveCount >= MAX_POSITIVE_TRAITS) return false;
    if (traitBudgetUsed(selectedIds) + candidate.cost > TRAIT_BUDGET) return false;
  } else {
    if (negativeCount >= MAX_NEGATIVE_TRAITS) return false;
  }
  return true;
}

// ---------- Attribute Helpers ----------

export function defaultAttributes(): Attributes {
  return {
    strength: BASE_ATTRIBUTE,
    dexterity: BASE_ATTRIBUTE,
    endurance: BASE_ATTRIBUTE,
    perception: BASE_ATTRIBUTE,
    wits: BASE_ATTRIBUTE,
  };
}

/**
 * Derive a character's attributes purely from their traits: every stat starts
 * at BASE_ATTRIBUTE and traits are the only thing that moves it. Clamped to
 * [MIN_ATTR, MAX_ATTR].
 */
export function attributesFromTraits(traitIds: string[]): Attributes {
  const attrs = defaultAttributes();
  for (const k of ATTRIBUTE_KEYS) {
    const raw = BASE_ATTRIBUTE + sumTraitMod(traitIds, ATTRIBUTE_MOD_KEYS[k]);
    attrs[k] = Math.max(MIN_ATTR, Math.min(MAX_ATTR, raw));
  }
  return attrs;
}

/**
 * Which traits are moving an attribute, and by how much. Drives the hover
 * readout on the attribute row — the player can see *why* a stat isn't 5.
 */
export function attributeSources(
  traitIds: string[],
  key: AttributeKey,
): { name: string; mod: number }[] {
  const modKey = ATTRIBUTE_MOD_KEYS[key];
  return getTraits(traitIds)
    .map((t) => ({ name: t.name, mod: (t[modKey] as number | undefined) ?? 0 }))
    .filter((s) => s.mod !== 0);
}

export function maxHpFor(character: Character): number {
  const bonus = sumTraitMod(character.traitIds, 'maxHpBonus');
  return 60 + character.attributes.endurance * 6 + bonus;
}

/**
 * Compute awareness modifiers from equipped items.
 * Reads the `awarenessMod` field from ItemDef.modifiers for each equipped slot.
 */
export function equipAwarenessMod(equipment: Equipment): number {
  let mod = 0;
  for (const slot of Object.values(equipment)) {
    if (slot) {
      const def = itemDef(slot.defId);
      if (def.modifiers?.awarenessMod) mod += def.modifiers.awarenessMod;
    }
  }
  return mod;
}

/** Total awareness modifier from traits. */
export function traitAwarenessMod(traitIds: string[]): number {
  return sumTraitMod(traitIds, 'awarenessMod');
}
