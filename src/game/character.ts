import type { Attributes, AttributeKey, Character, Equipment, Trait } from './types';
import type { IconName } from '../icons/keys';
import { EMOJI_FALLBACK } from '../icons/keys';
import { itemDef } from './loot';
import { clampStanding, emptyStanding, type FactionStanding } from './factions';

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

/**
 * Icon key per attribute. UI renders via `<Icon name={…} />`, which picks up
 * drop-in art from `src/assets/icons/attr-*.png` the same way as every other
 * icon (emoji until a file is present). Logs use `attrEmoji` as a plain-text
 * fallback only — they cannot embed the PNG.
 */
export const ATTRIBUTE_ICONS: Record<AttributeKey, IconName> = {
  strength: 'attr.strength',
  dexterity: 'attr.dexterity',
  endurance: 'attr.endurance',
  perception: 'attr.perception',
  wits: 'attr.wits',
};

/** Plain-text emoji fallback for attribute mentions in logs (not the PNG path). */
export function attrEmoji(key: AttributeKey): string {
  return EMOJI_FALLBACK[ATTRIBUTE_ICONS[key]] ?? '·';
}

/**
 * Swap bare attribute names in a string for "emoji Name" so log lines and
 * trait blurbs skim faster without needing React markup.
 */
export function withAttrEmojis(text: string): string {
  let out = text;
  // Longest labels first so "Perception" isn't partially matched oddly.
  const ordered = [...ATTRIBUTE_KEYS].sort(
    (a, b) => ATTRIBUTE_LABELS[b].length - ATTRIBUTE_LABELS[a].length,
  );
  for (const key of ordered) {
    const label = ATTRIBUTE_LABELS[key];
    const emoji = attrEmoji(key);
    out = out.replace(new RegExp(`\\b${label}\\b`, 'g'), `${emoji} ${label}`);
  }
  return out;
}

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
// Start at 0 points. Negatives refund; positives spend. Count is uncapped —
// a build is legal iff points remaining ≥ 0.

export const TRAIT_BUDGET = 0;

export const TRAITS: Trait[] = [
  // ===== POSITIVE TRAITS =====
  {
    id: 'ns_combat',
    name: 'Reservist',
    description:
      '+1 Strength, +2 attack, +1 defense. Muscle memory from mandatory service drills that never quite left.',
    category: 'positive',
    cost: 2,
    conflicts: ['clumsy'],
    strengthMod: 1,
    attackMod: 2,
    defenseMod: 1,
  },
  {
    id: 'medic',
    name: 'Trained Medic',
    description:
      'Healing items restore +5 HP. 35% less infection gain. Clinic shifts taught you triage the hard way.',
    category: 'positive',
    cost: 2,
    conflicts: ['thin_blood'],
    healBonus: 5,
    infectionResist: 0.35,
  },
  {
    id: 'hawker_cook',
    name: 'Home Cook',
    description:
      'Food items restore 30% more hunger. Years behind a wok — or a home kitchen that worked like one.',
    category: 'positive',
    cost: 1,
    conflicts: ['picky_eater', 'weak_stomach'],
    foodEffectMod: 0.3,
  },
  {
    id: 'marathoner',
    name: 'Distance Runner',
    description:
      '+1 Endurance, +15 max HP, −10% energy drain. The kind of fitness that used to earn a gold standard.',
    category: 'positive',
    cost: 2,
    conflicts: ['bad_knees', 'glass_jaw', 'out_of_shape'],
    enduranceMod: 1,
    maxHpBonus: 15,
    energyDrainMod: -0.1,
  },
  {
    id: 'karang_guni',
    name: 'Scavenger',
    description:
      '+1 loot, +1 extra search per POI. You already knew which blocks had the good stuff.',
    category: 'positive',
    cost: 2,
    conflicts: ['hoarder'],
    lootMod: 1,
    searchBonusMod: 1,
  },
  {
    id: 'tekong_legs',
    name: 'Trail Legs',
    description:
      '+1 Dexterity, +15% travel speed. Route marches forged these calves — island or otherwise.',
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
    conflicts: ['poor_sleep', 'afraid_of_dark'],
    nightAccuracyPenaltyRemoved: true,
  },
  {
    id: 'thick_skin',
    name: 'Thick Skin',
    description: '30% infection resist, +1 defense. Mosquito-hardened immune system.',
    category: 'positive',
    cost: 2,
    conflicts: ['hemophilia', 'thin_blood'],
    infectionResist: 0.3,
    defenseMod: 1,
  },
  {
    id: 'kiasuism',
    name: 'Opportunist',
    description:
      '+1 Wits, +10% loot value, see POI searches remaining. Must. Get. More. — queue culture never dies.',
    category: 'positive',
    cost: 1,
    conflicts: ['squeamish', 'short_fuse'],
    witsMod: 1,
    lootValueMod: 0.1,
    showSearchesRemaining: true,
  },
  {
    id: 'kampong_spirit',
    name: 'Community Ties',
    description:
      'Start Known with the IDTF and the PP Co-op — their counters are open to you from day one. Neighbour bonds transcend the apocalypse.',
    category: 'positive',
    cost: 2,
    conflicts: ['ah_long_debt'],
    factionStandingMod: { idtf: 1, pasir_panjang: 1 },
  },
  {
    id: 'ah_long_debt',
    name: 'Underworld Contact',
    description:
      'Somebody in the 88 Syndicate remembers you. They will not shoot on sight and their court is open — but the IDTF has read the same file.',
    category: 'positive',
    cost: 2,
    conflicts: ['kampong_spirit'],
    factionStandingMod: { syndicate_88: 1, idtf: -1 },
  },
  {
    id: 'water_baby',
    name: 'Strong Swimmer',
    description: '−20% thirst drain. Weekend reservoir laps paid off.',
    category: 'positive',
    cost: 1,
    conflicts: ['aircon_addict', 'dehydrated'],
    thirstDrainMod: -0.2,
  },
  {
    id: 'handyman',
    name: 'Handyman',
    description:
      'Craft recipes cost −1 material. Cable ties, scrap, and a flat-repair habit go a long way.',
    category: 'positive',
    cost: 1,
    conflicts: [],
    craftCostMod: -1,
  },
  {
    id: 'sixth_sense',
    name: 'Sixth Sense',
    description:
      '+1 Perception, +30% detection radius, ambush chance halved. You feel them before you see them.',
    category: 'positive',
    cost: 3,
    conflicts: ['noisy', 'heavy_sleeper'],
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
  {
    id: 'deep_sleeper',
    name: 'Deep Sleeper',
    description: 'Sleep restores 25% more energy. When you are out, you are out.',
    category: 'positive',
    cost: 1,
    conflicts: ['poor_sleep', 'heavy_sleeper'],
    sleepRestoreMod: 0.25,
  },
  {
    id: 'quiet_step',
    name: 'Quiet Step',
    description: '−10% encounter chance when travelling. Soft soles, softer habits.',
    category: 'positive',
    cost: 1,
    conflicts: ['noisy'],
    encounterChanceMod: -0.1,
  },
  {
    id: 'strong_back',
    name: 'Strong Back',
    description: '+4 kg carry capacity. Years of hauling crates or laundry bags.',
    category: 'positive',
    cost: 1,
    conflicts: [],
    carryCapacityMod: 4,
  },
  {
    id: 'iron_stomach',
    name: 'Iron Stomach',
    description: '−15% hunger drain. You can eat almost anything and keep moving.',
    category: 'positive',
    cost: 1,
    conflicts: ['picky_eater', 'weak_stomach'],
    hungerDrainMod: -0.15,
  },
  {
    id: 'heat_hardened',
    name: 'Heat Hardened',
    description:
      '−15% energy drain outdoors and in heat. You stopped complaining about the weather years ago.',
    category: 'positive',
    cost: 1,
    conflicts: ['aircon_addict'],
    outdoorEnergyDrainMod: -0.15,
  },
  {
    id: 'silver_tongue',
    name: 'Silver Tongue',
    description:
      '+1 Wits, +2 on doorway and dialogue checks. You talk your way through more doors than you kick.',
    category: 'positive',
    cost: 2,
    conflicts: ['short_fuse'],
    witsMod: 1,
    checkBonusMod: 2,
  },
  {
    id: 'field_dressing',
    name: 'Field Dressing',
    description: 'Healing items restore +3 HP. Leg injuries heal 30% faster.',
    category: 'positive',
    cost: 1,
    conflicts: [],
    healBonus: 3,
    legHealMod: 0.3,
  },
  {
    id: 'calm_hands',
    name: 'Calm Hands',
    description: '+4% dodge chance. You flinch less when something lunges.',
    category: 'positive',
    cost: 1,
    conflicts: [],
    dodgeMod: 0.04,
  },
  {
    id: 'frugal',
    name: 'Frugal',
    description: 'Food restores 15% more hunger. You stretch every packet.',
    category: 'positive',
    cost: 1,
    conflicts: ['picky_eater'],
    foodEffectMod: 0.15,
  },

  // ===== NEGATIVE TRAITS =====
  {
    id: 'aircon_addict',
    name: 'Soft Living',
    description:
      '+20% energy drain outdoors and in heat. Never spent a day without climate control.',
    category: 'negative',
    cost: -1,
    conflicts: ['water_baby', 'heat_hardened'],
    outdoorEnergyDrainMod: 0.2,
  },
  {
    id: 'picky_eater',
    name: 'Picky Eater',
    description: 'Food restores 25% less hunger. Texture and branding still matter somehow.',
    category: 'negative',
    cost: -1,
    conflicts: ['hawker_cook', 'iron_stomach', 'frugal'],
    foodEffectMod: -0.25,
  },
  {
    id: 'glass_jaw',
    name: 'Glass Jaw',
    description: '−1 Endurance, −15 max HP. One hit and it is lights out.',
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
    description: 'Cannot voluntarily drop items — must consume or stash. It might be useful later.',
    category: 'negative',
    cost: -1,
    conflicts: ['karang_guni', 'pack_rat'],
    cannotDropItems: true,
  },
  {
    id: 'noisy',
    name: 'Noisy',
    description: '+15% encounter chance when travelling. Cannot stop talking — or clattering.',
    category: 'negative',
    cost: -1,
    conflicts: ['sixth_sense', 'quiet_step'],
    encounterChanceMod: 0.15,
  },
  {
    id: 'bad_knees',
    name: 'Bad Knees',
    description:
      '−1 Dexterity, −20% travel speed, leg injuries heal 50% slower. Years of hard floors took their toll.',
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
    conflicts: ['night_owl', 'deep_sleeper'],
    sleepRestoreMod: -0.3,
  },
  {
    id: 'squeamish',
    name: 'Squeamish',
    description: '−1 attack vs the undead. The rot still makes you gag.',
    category: 'negative',
    cost: -1,
    conflicts: ['kiasuism'],
    zombieAttackMod: -1,
  },
  {
    id: 'out_of_shape',
    name: 'Out of Shape',
    description: '+15% energy drain, −10% travel speed. Desk years caught up.',
    category: 'negative',
    cost: -2,
    conflicts: ['marathoner'],
    energyDrainMod: 0.15,
    travelSpeedMod: -0.1,
  },
  {
    id: 'weak_stomach',
    name: 'Weak Stomach',
    description: '+20% hunger drain. Meals do not stick around long.',
    category: 'negative',
    cost: -1,
    conflicts: ['iron_stomach', 'hawker_cook'],
    hungerDrainMod: 0.2,
  },
  {
    id: 'dehydrated',
    name: 'Always Thirsty',
    description: '+20% thirst drain. Your mouth is dry before noon.',
    category: 'negative',
    cost: -1,
    conflicts: ['water_baby'],
    thirstDrainMod: 0.2,
  },
  {
    id: 'afraid_of_dark',
    name: 'Afraid of the Dark',
    description:
      '+10% encounter chance at night, and an extra −1 accuracy after dark. Shadows still win.',
    category: 'negative',
    cost: -1,
    conflicts: ['night_owl'],
    nightEncounterChanceMod: 0.1,
    nightAccuracyExtra: -1,
  },
  {
    id: 'thin_blood',
    name: 'Thin Blood',
    description: '−20% infection resistance. Cuts go septic faster than they should.',
    category: 'negative',
    cost: -1,
    conflicts: ['thick_skin', 'medic'],
    infectionResist: -0.2,
  },
  {
    id: 'short_fuse',
    name: 'Short Fuse',
    description: '−1 Wits. Pressure turns into shouting before it turns into plans.',
    category: 'negative',
    cost: -1,
    conflicts: ['silver_tongue', 'kiasuism'],
    witsMod: -1,
  },
  {
    id: 'heavy_sleeper',
    name: 'Heavy Sleeper',
    description: '+10% ambush chance. You do not hear trouble until it is on you.',
    category: 'negative',
    cost: -1,
    conflicts: ['deep_sleeper', 'sixth_sense'],
    ambushChanceMod: 0.1,
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

/**
 * Where a build starts on each faction's ladder.
 *
 * Almost always all zeroes — a survivor is nobody to everybody. The traits that
 * move it are the ones that buy a starting relationship, and because hostility
 * lifts at STANDING_KNOWN (+1 on the −5…+5 ladder), a single point here is the
 * difference between the 88 Syndicate shooting at you and selling to you.
 */
export function startingStanding(traitIds: string[]): FactionStanding {
  const out = emptyStanding();
  for (const t of getTraits(traitIds)) {
    if (!t.factionStandingMod) continue;
    for (const [id, delta] of Object.entries(t.factionStandingMod)) {
      const key = id as keyof FactionStanding;
      out[key] = clampStanding(out[key] + (delta ?? 0));
    }
  }
  return out;
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
  if (candidate.conflicts.some((c) => selectedIds.includes(c))) return true;
  for (const id of selectedIds) {
    const t = getTrait(id);
    if (t.conflicts.includes(candidateId)) return true;
  }
  return false;
}

/** Net points spent (positive costs − negative refunds). Absolute magnitude sum. */
export function traitPointsSpent(ids: string[]): number {
  return ids.reduce((sum, id) => sum + Math.abs(getTrait(id).cost), 0);
}

/** Net trait budget used: positive costs minus negative refunds. */
export function traitBudgetUsed(ids: string[]): number {
  return ids.reduce((sum, id) => sum + getTrait(id).cost, 0);
}

/** Points remaining in the pool (start at TRAIT_BUDGET; must stay ≥ 0). */
export function traitBudgetRemaining(ids: string[]): number {
  return TRAIT_BUDGET - traitBudgetUsed(ids);
}

/** Whether a new trait can be added given the current selection. */
export function canPickTrait(candidateId: string, selectedIds: string[]): boolean {
  if (selectedIds.includes(candidateId)) return false;
  if (isIncompatible(candidateId, selectedIds)) return false;
  const candidate = getTrait(candidateId);
  // Negatives only help the pool; positives must leave remaining ≥ 0.
  if (candidate.category === 'positive') {
    if (traitBudgetUsed(selectedIds) + candidate.cost > TRAIT_BUDGET) return false;
  }
  return true;
}

/** Whether a finished build is legal to start / save. */
export function isLegalTraitBuild(ids: string[]): boolean {
  if (traitBudgetRemaining(ids) < 0) return false;
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return false;
    if (isIncompatible(id, [...seen])) return false;
    seen.add(id);
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

/**
 * The concrete buffs/debuffs an attribute value is buying right now, phrased
 * against the BASE_ATTRIBUTE baseline so a 5 reads as neutral. Mirrors the real
 * formulas in combat/inventory/travel/fog/hdbDungeon — keep them in sync.
 */
export interface AttributeEffect {
  label: string;
  good: boolean;
}

// Mirror of hdbDungeon.senseChance — duplicated rather than imported so the
// character module stays free of dungeon imports.
const senseChanceOf = (v: number) => Math.max(0.05, Math.min(0.95, 0.15 + (v - 3) * 0.11));

export function attributeEffects(key: AttributeKey, value: number): AttributeEffect[] {
  const d = value - BASE_ATTRIBUTE;
  const half = Math.floor(value / 2) - Math.floor(BASE_ATTRIBUTE / 2);
  const sense = Math.round((senseChanceOf(value) - senseChanceOf(BASE_ATTRIBUTE)) * 100);
  const num = (n: number, text: string, unit = ''): [number, string] => [
    n,
    `${n > 0 ? '+' : ''}${n}${unit} ${text}`,
  ];
  const pct = (n: number, text: string): [number, string] => [
    n,
    `${n > 0 ? '+' : ''}${Math.round(n * 100)}% ${text}`,
  ];

  let rows: [number, string][];
  switch (key) {
    case 'strength':
      rows = [num(half, 'melee damage'), num(d * 3, 'kg carry capacity')];
      break;
    case 'dexterity':
      rows = [
        num(d, 'attack accuracy'),
        num(half, 'defense'),
        pct(d * 0.02, 'dodge chance'),
        pct(d * 0.03, 'travel speed'),
        num(sense, 'scout read chance', '%'),
        num(d, 'flee & stairwell checks'),
      ];
      break;
    case 'endurance':
      rows = [
        num(d * 6, 'max HP'),
        num(d * 2, 'kg carry capacity'),
        pct(d * 0.06, 'travel speed'),
        num(d, 'stairwell retreat checks'),
      ];
      break;
    case 'perception':
      rows = [
        num(Math.floor(d / 2), 'loot rolls per search'),
        num(d, 'awareness (fog & blip range)'),
        num(sense, 'threat-sense chance', '%'),
        num(Math.floor(d / 2), 'flee checks'),
      ];
      break;
    case 'wits':
      rows = [num(sense, 'chance to read a room', '%')];
      break;
  }
  return rows
    .filter(([n]) => n !== 0)
    .map(([n, label]) => ({ label, good: n > 0 }));
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

/** Blip-range multiplier from detectRadiusMod traits (1.0 = unchanged). */
export function traitDetectRadiusMult(traitIds: string[]): number {
  return 1 + sumTraitMod(traitIds, 'detectRadiusMod');
}

/**
 * Reduce recipe input counts by craftCostMod (negative = fewer materials).
 * Prefer trimming the largest stacks first; never invent negative counts.
 */
export function adjustCraftInputs(
  inputs: Record<string, number>,
  traitIds: string[],
): Record<string, number> {
  const reduce = Math.max(0, Math.round(-sumTraitMod(traitIds, 'craftCostMod')));
  if (reduce <= 0) return { ...inputs };
  const out: Record<string, number> = { ...inputs };
  let left = reduce;
  const keys = Object.keys(out).sort((a, b) => out[b] - out[a]);
  for (const key of keys) {
    if (left <= 0) break;
    const cut = Math.min(out[key], left);
    out[key] -= cut;
    left -= cut;
    if (out[key] <= 0) delete out[key];
  }
  return out;
}
