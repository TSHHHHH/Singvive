import type { Attributes, AttributeKey, Character, Equipment, PoiCategory, Trait } from './types';
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
// Start at 0 points. Negatives refund; positives spend.
// Caps: max 1 signature (cost ≥ 4), max 1 curse (cost ≤ −3), max 2 negatives.
// A build is legal iff points remaining ≥ 0 and the caps hold.

export const TRAIT_BUDGET = 0;

export const TRAITS: Trait[] = [
  // ===== POSITIVE TRAITS =====
  {
    id: 'ns_combat',
    name: 'Reservist',
    description: 'Muscle memory from mandatory service drills that never quite left. The Muster still counts you as one of theirs.',
    category: 'positive',
    cost: 2,
    icon: 'trait.ns_combat',
    effects: ['+1 Strength', '+2 attack', '+1 defense', 'Start Known with the Muster'],
    conflicts: ['clumsy'],
    strengthMod: 1,
    attackMod: 2,
    defenseMod: 1,
    factionStandingMod: { muster: 1 },
  },
  {
    id: 'medic',
    name: 'Trained Medic',
    description: 'Clinic shifts taught you triage the hard way.',
    category: 'positive',
    cost: 2,
    icon: 'trait.medic',
    effects: ['Healing items restore +5 HP', '35% less infection gain'],
    conflicts: ['thin_blood'],
    healBonus: 5,
    infectionResist: 0.35,
  },
  {
    id: 'hawker_cook',
    name: 'Home Cook',
    description: 'Years behind a wok — or a home kitchen that worked like one.',
    category: 'positive',
    cost: 1,
    icon: 'trait.hawker_cook',
    effects: ['Food restores 30% more hunger'],
    conflicts: ['picky_eater', 'weak_stomach'],
    foodEffectMod: 0.3,
  },
  {
    id: 'marathoner',
    name: 'Distance Runner',
    description: 'The kind of fitness that used to earn a gold standard.',
    category: 'positive',
    cost: 2,
    icon: 'trait.marathoner',
    effects: ['+1 Endurance', '+15 max HP', '−10% energy drain'],
    conflicts: ['bad_knees', 'glass_jaw', 'out_of_shape'],
    enduranceMod: 1,
    maxHpBonus: 15,
    energyDrainMod: -0.1,
  },
  {
    id: 'karang_guni',
    name: 'Scavenger',
    description: 'You already knew which blocks had the good stuff.',
    category: 'positive',
    cost: 2,
    icon: 'trait.karang_guni',
    effects: ['+1 loot', '+1 extra search per POI', '+10% search speed'],
    conflicts: ['hoarder', 'light_pockets'],
    lootMod: 1,
    searchBonusMod: 1,
    searchSpeedMod: 0.1,
  },
  {
    id: 'tekong_legs',
    name: 'Trail Legs',
    description: 'Route marches forged these calves — island or otherwise.',
    category: 'positive',
    cost: 1,
    icon: 'trait.tekong_legs',
    effects: ['+1 Dexterity', '+15% travel speed'],
    conflicts: ['bad_knees', 'lost_without_maps'],
    dexterityMod: 1,
    travelSpeedMod: 0.15,
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Years of shift work pay off.',
    category: 'positive',
    cost: 1,
    icon: 'trait.night_owl',
    effects: ['No accuracy penalty at night'],
    conflicts: ['poor_sleep', 'afraid_of_dark', 'young_blood'],
    nightAccuracyPenaltyRemoved: true,
  },
  {
    id: 'thick_skin',
    name: 'Thick Skin',
    description: 'Mosquito-hardened immune system.',
    category: 'positive',
    cost: 2,
    icon: 'trait.thick_skin',
    effects: ['30% infection resist', '+1 defense'],
    conflicts: ['hemophilia', 'thin_blood'],
    infectionResist: 0.3,
    defenseMod: 1,
  },
  {
    id: 'kiasuism',
    name: 'Opportunist',
    description: 'Must. Get. More. — queue culture never dies.',
    category: 'positive',
    cost: 1,
    icon: 'trait.kiasuism',
    effects: ['+1 Wits', '+10% loot value'],
    conflicts: ['squeamish', 'short_fuse'],
    witsMod: 1,
    lootValueMod: 0.1,
  },
  {
    id: 'kampong_spirit',
    name: 'Community Ties',
    description: 'Neighbour bonds transcend the apocalypse. Their counters are open from day one.',
    category: 'positive',
    cost: 2,
    icon: 'trait.kampong_spirit',
    effects: ['Start Known with the Muster', 'Start Known with Gotong'],
    conflicts: ['ah_long_debt'],
    factionStandingMod: { muster: 1, gotong: 1 },
  },
  {
    id: 'ah_long_debt',
    name: 'Underworld Contact',
    description:
      'Somebody in the 88 Syndicate remembers you. They will not shoot on sight and their court is open — but the Muster has read the same file.',
    category: 'positive',
    cost: 2,
    icon: 'trait.ah_long_debt',
    effects: ['88 Syndicate will not shoot on sight', 'Muster starts wary of you'],
    conflicts: ['kampong_spirit'],
    factionStandingMod: { syndicate_88: 1, muster: -1 },
  },
  {
    id: 'water_baby',
    name: 'Strong Swimmer',
    description: 'Weekend reservoir laps paid off.',
    category: 'positive',
    cost: 1,
    icon: 'trait.water_baby',
    effects: ['−20% thirst drain'],
    conflicts: ['aircon_addict', 'dehydrated'],
    thirstDrainMod: -0.2,
  },
  {
    id: 'handyman',
    name: 'Handyman',
    description: 'Cable ties, scrap, and a flat-repair habit go a long way.',
    category: 'positive',
    cost: 1,
    icon: 'trait.handyman',
    effects: ['Craft recipes cost −1 material', 'HDB picks +2', 'HDB Force 20% faster'],
    conflicts: ['site_foreman'],
    craftCostMod: -1,
    hdbPickMod: 2,
    hdbBreachMinutesMult: -0.2,
  },
  {
    id: 'sixth_sense',
    name: 'Sixth Sense',
    description: 'You feel them before you see them.',
    category: 'positive',
    cost: 4,
    icon: 'trait.sixth_sense',
    effects: ['+1 Perception', '+30% detection radius', 'Ambush chance halved', '+2 awareness'],
    conflicts: ['noisy', 'heavy_sleeper', 'shadow_habit', 'sharp_eye', 'loud_soles'],
    perceptionMod: 1,
    detectRadiusMod: 0.3,
    ambushChanceMod: -0.5,
    awarenessMod: 2,
  },
  {
    id: 'pack_rat',
    name: 'Pack Rat',
    description: 'Every pocket has a pocket.',
    category: 'positive',
    cost: 2,
    icon: 'trait.pack_rat',
    effects: ['Backpack +1 column'],
    conflicts: ['hoarder', 'light_pockets', 'mule'],
    gridWidthBonus: 1,
  },
  {
    id: 'mule',
    name: 'Mule',
    description: 'You were built to haul.',
    category: 'positive',
    cost: 4,
    icon: 'trait.mule',
    effects: ['Backpack +2 columns', '+6 kg carry capacity'],
    conflicts: ['hoarder', 'light_pockets', 'pack_rat'],
    gridWidthBonus: 2,
    carryCapacityMod: 6,
  },
  {
    id: 'light_pockets',
    name: 'Light Pockets',
    description: 'Travel light — refunds a trait point.',
    category: 'negative',
    cost: -1,
    icon: 'trait.light_pockets',
    effects: ['Backpack −1 column'],
    conflicts: ['pack_rat', 'mule', 'karang_guni'],
    gridWidthBonus: -1,
  },
  {
    id: 'deep_sleeper',
    name: 'Deep Sleeper',
    description: 'When you are out, you are out.',
    category: 'positive',
    cost: 1,
    icon: 'trait.deep_sleeper',
    effects: ['Sleep restores 25% more energy'],
    conflicts: ['poor_sleep', 'heavy_sleeper'],
    sleepRestoreMod: 0.25,
  },
  {
    id: 'quiet_step',
    name: 'Quiet Step',
    description: 'Soft soles, softer habits.',
    category: 'positive',
    cost: 1,
    icon: 'trait.quiet_step',
    effects: ['−10% encounter chance when travelling', 'HDB door heat −25%', 'HDB picks +2'],
    conflicts: ['noisy', 'loud_soles'],
    encounterChanceMod: -0.1,
    hdbDoorHeatMult: -0.25,
    hdbPickMod: 2,
  },
  {
    id: 'strong_back',
    name: 'Strong Back',
    description: 'Years of hauling crates or laundry bags.',
    category: 'positive',
    cost: 1,
    icon: 'trait.strong_back',
    effects: ['+4 kg carry capacity'],
    conflicts: [],
    carryCapacityMod: 4,
  },
  {
    id: 'iron_stomach',
    name: 'Iron Stomach',
    description: 'You can eat almost anything and keep moving.',
    category: 'positive',
    cost: 1,
    icon: 'trait.iron_stomach',
    effects: ['−15% hunger drain'],
    conflicts: ['picky_eater', 'weak_stomach'],
    hungerDrainMod: -0.15,
  },
  {
    id: 'heat_hardened',
    name: 'Heat Hardened',
    description: 'You stopped complaining about the weather years ago.',
    category: 'positive',
    cost: 1,
    icon: 'trait.heat_hardened',
    effects: ['−15% energy drain outdoors and in heat'],
    conflicts: ['aircon_addict', 'mall_rat'],
    outdoorEnergyDrainMod: -0.15,
  },
  {
    id: 'silver_tongue',
    name: 'Silver Tongue',
    description: 'You talk your way through more doors than you kick.',
    category: 'positive',
    cost: 2,
    icon: 'trait.silver_tongue',
    effects: ['+1 Wits', '+2 on doorway and dialogue checks'],
    conflicts: ['short_fuse', 'tone_deaf', 'void_deck_chat'],
    witsMod: 1,
    checkBonusMod: 2,
  },
  {
    id: 'field_dressing',
    name: 'Field Dressing',
    description: 'You keep a roll of gauze in every pocket.',
    category: 'positive',
    cost: 1,
    icon: 'trait.field_dressing',
    effects: ['Healing items restore +3 HP', 'Leg injuries heal 30% faster'],
    conflicts: [],
    healBonus: 3,
    legHealMod: 0.3,
  },
  {
    id: 'calm_hands',
    name: 'Calm Hands',
    description: 'You flinch less when something lunges.',
    category: 'positive',
    cost: 1,
    icon: 'trait.calm_hands',
    effects: ['+4% dodge chance'],
    conflicts: [],
    dodgeMod: 0.04,
  },
  {
    id: 'frugal',
    name: 'Frugal',
    description: 'You stretch every packet.',
    category: 'positive',
    cost: 1,
    icon: 'trait.frugal',
    effects: ['Food restores 15% more hunger'],
    conflicts: ['picky_eater'],
    foodEffectMod: 0.15,
  },
  {
    id: 'shadow_habit',
    name: 'Shadow Habit',
    description: 'You learned which corridors stay quiet after midnight.',
    category: 'positive',
    cost: 2,
    icon: 'trait.shadow_habit',
    effects: ['−15% encounter chance when travelling', '−20% ambush chance'],
    conflicts: ['noisy', 'stall_voice', 'heavy_hands', 'loud_soles', 'sixth_sense'],
    encounterChanceMod: -0.15,
    ambushChanceMod: -0.2,
  },
  {
    id: 'umbrella_city',
    name: 'Umbrella City',
    description: 'You grew up walking through squalls with a folding umbrella and a dry bag.',
    category: 'positive',
    cost: 1,
    icon: 'trait.umbrella_city',
    effects: ['−10% outdoor / heat energy drain', '+5% travel speed', '−5% thirst drain'],
    conflicts: ['aircon_addict', 'never_outdoors', 'mall_rat'],
    outdoorEnergyDrainMod: -0.1,
    travelSpeedMod: 0.05,
    thirstDrainMod: -0.05,
  },
  {
    id: 'haze_mask',
    name: 'Haze Habit',
    description: 'PSI days taught you to keep a mask and keep walking.',
    category: 'positive',
    cost: 1,
    icon: 'trait.haze_mask',
    effects: ['−15% outdoor / heat energy drain', '10% infection resist'],
    conflicts: ['aircon_addict', 'thin_blood'],
    outdoorEnergyDrainMod: -0.15,
    infectionResist: 0.1,
  },
  {
    id: 'void_deck_chat',
    name: 'Void Deck Chat',
    description: 'You know how to open a conversation under fluorescent tubes.',
    category: 'positive',
    cost: 1,
    icon: 'trait.void_deck_chat',
    effects: ['+1 on doorway and dialogue checks', 'Start Known with Gotong'],
    conflicts: ['short_fuse', 'tone_deaf', 'silver_tongue', 'warrant'],
    checkBonusMod: 1,
    factionStandingMod: { gotong: 1 },
  },
  {
    id: 'train_memory',
    name: 'Train Memory',
    description: 'Every interchange is still in your feet. The tunnels feel like a second street.',
    category: 'positive',
    cost: 2,
    icon: 'trait.train_memory',
    effects: ['+10% travel speed', '+1 awareness', 'Richer MRT loot'],
    conflicts: ['never_outdoors', 'lost_without_maps', 'desk_body'],
    travelSpeedMod: 0.1,
    awarenessMod: 1,
    poiLootBonus: { mrt: 1 },
  },
  {
    id: 'sharp_eye',
    name: 'Sharp Eye',
    description: 'You notice the wrong shadow before it notices you.',
    category: 'positive',
    cost: 2,
    icon: 'trait.sharp_eye',
    effects: ['+1 Perception', '+1 awareness'],
    conflicts: ['heavy_sleeper', 'sixth_sense'],
    perceptionMod: 1,
    awarenessMod: 1,
  },

  // ===== NEGATIVE TRAITS =====
  {
    id: 'aircon_addict',
    name: 'Soft Living',
    description: 'Never spent a day without climate control.',
    category: 'negative',
    cost: -1,
    icon: 'trait.aircon_addict',
    effects: ['+20% energy drain outdoors and in heat'],
    conflicts: ['water_baby', 'heat_hardened', 'umbrella_city', 'haze_mask'],
    outdoorEnergyDrainMod: 0.2,
  },
  {
    id: 'picky_eater',
    name: 'Picky Eater',
    description: 'Texture and branding still matter somehow.',
    category: 'negative',
    cost: -1,
    icon: 'trait.picky_eater',
    effects: ['Food restores 25% less hunger'],
    conflicts: ['hawker_cook', 'iron_stomach', 'frugal'],
    foodEffectMod: -0.25,
  },
  {
    id: 'glass_jaw',
    name: 'Glass Jaw',
    description: 'One hit and it is lights out.',
    category: 'negative',
    cost: -2,
    icon: 'trait.glass_jaw',
    effects: ['−1 Endurance', '−15 max HP'],
    conflicts: ['marathoner'],
    enduranceMod: -1,
    maxHpBonus: -15,
  },
  {
    id: 'clumsy',
    name: 'Clumsy',
    description: 'Trips over flat ground.',
    category: 'negative',
    cost: -1,
    icon: 'trait.clumsy',
    effects: ['−1 Dexterity', '−1 attack', '+5% ambush chance'],
    conflicts: ['ns_combat'],
    dexterityMod: -1,
    attackMod: -1,
    ambushChanceMod: 0.05,
  },
  {
    id: 'hoarder',
    name: 'Hoarder',
    description: 'It might be useful later. You cannot bring yourself to throw anything away.',
    category: 'negative',
    cost: -1,
    icon: 'trait.hoarder',
    effects: ['Cannot voluntarily drop items'],
    conflicts: ['karang_guni', 'pack_rat', 'mule'],
    cannotDropItems: true,
  },
  {
    id: 'noisy',
    name: 'Noisy',
    description: 'Cannot stop talking — or clattering.',
    category: 'negative',
    cost: -1,
    icon: 'trait.noisy',
    effects: ['+15% encounter chance when travelling', 'HDB door heat +25%'],
    conflicts: ['sixth_sense', 'quiet_step', 'shadow_habit'],
    encounterChanceMod: 0.15,
    hdbDoorHeatMult: 0.25,
  },
  {
    id: 'bad_knees',
    name: 'Bad Knees',
    description: 'Years of hard floors took their toll.',
    category: 'negative',
    cost: -2,
    icon: 'trait.bad_knees',
    effects: ['−1 Dexterity', '−20% travel speed', 'Leg injuries heal 50% slower'],
    conflicts: ['marathoner', 'tekong_legs'],
    dexterityMod: -1,
    travelSpeedMod: -0.2,
    legHealMod: -0.5,
  },
  {
    id: 'hemophilia',
    name: 'Hemophiliac',
    description: 'Carry bandages or die.',
    category: 'negative',
    cost: -2,
    icon: 'trait.hemophilia',
    effects: ['Bleeding never self-stops'],
    conflicts: ['thick_skin'],
    bleedingSelfStopDisabled: true,
  },
  {
    id: 'poor_sleep',
    name: 'Light Sleeper',
    description: 'Every sound jolts you awake.',
    category: 'negative',
    cost: -1,
    icon: 'trait.poor_sleep',
    effects: ['Sleep restores 30% less energy'],
    conflicts: ['night_owl', 'deep_sleeper'],
    sleepRestoreMod: -0.3,
  },
  {
    id: 'squeamish',
    name: 'Squeamish',
    description: 'The rot still makes you gag.',
    category: 'negative',
    cost: -1,
    icon: 'trait.squeamish',
    effects: ['−1 attack vs the undead'],
    conflicts: ['kiasuism'],
    zombieAttackMod: -1,
  },
  {
    id: 'out_of_shape',
    name: 'Out of Shape',
    description: 'Desk years caught up.',
    category: 'negative',
    cost: -2,
    icon: 'trait.out_of_shape',
    effects: ['+15% energy drain', '−10% travel speed'],
    conflicts: ['marathoner'],
    energyDrainMod: 0.15,
    travelSpeedMod: -0.1,
  },
  {
    id: 'weak_stomach',
    name: 'Weak Stomach',
    description: 'Meals do not stick around long.',
    category: 'negative',
    cost: -1,
    icon: 'trait.weak_stomach',
    effects: ['+20% hunger drain'],
    conflicts: ['iron_stomach', 'hawker_cook'],
    hungerDrainMod: 0.2,
  },
  {
    id: 'dehydrated',
    name: 'Always Thirsty',
    description: 'Your mouth is dry before noon.',
    category: 'negative',
    cost: -1,
    icon: 'trait.dehydrated',
    effects: ['+20% thirst drain'],
    conflicts: ['water_baby'],
    thirstDrainMod: 0.2,
  },
  {
    id: 'afraid_of_dark',
    name: 'Afraid of the Dark',
    description: 'Shadows still win.',
    category: 'negative',
    cost: -1,
    icon: 'trait.afraid_of_dark',
    effects: ['+10% encounter chance at night', 'Extra −1 accuracy after dark'],
    conflicts: ['night_owl'],
    nightEncounterChanceMod: 0.1,
    nightAccuracyExtra: -1,
  },
  {
    id: 'thin_blood',
    name: 'Thin Blood',
    description: 'Cuts go septic faster than they should.',
    category: 'negative',
    cost: -1,
    icon: 'trait.thin_blood',
    effects: ['−20% infection resistance'],
    conflicts: ['thick_skin', 'medic', 'haze_mask'],
    infectionResist: -0.2,
  },
  {
    id: 'short_fuse',
    name: 'Short Fuse',
    description: 'Pressure turns into shouting before it turns into plans.',
    category: 'negative',
    cost: -1,
    icon: 'trait.short_fuse',
    effects: ['−1 Wits'],
    conflicts: ['silver_tongue', 'kiasuism', 'void_deck_chat'],
    witsMod: -1,
  },
  {
    id: 'heavy_sleeper',
    name: 'Heavy Sleeper',
    description: 'You do not hear trouble until it is on you.',
    category: 'negative',
    cost: -1,
    icon: 'trait.heavy_sleeper',
    effects: ['+10% ambush chance'],
    conflicts: ['deep_sleeper', 'sixth_sense', 'sharp_eye'],
    ambushChanceMod: 0.1,
  },
  {
    id: 'combat_veteran',
    name: 'Combat Veteran',
    description: 'NS, then the real thing. The first blow never lands the way they want it to. The Muster still has your name on a roster.',
    category: 'positive',
    cost: 5,
    icon: 'trait.combat_veteran',
    effects: ['+2 Strength', '+4 attack', '+2 defense', 'First hit each fight is halved', 'Start Known with the Muster'],
    conflicts: ['ns_combat', 'clumsy'],
    strengthMod: 2,
    attackMod: 4,
    defenseMod: 2,
    firstHitDamageMult: 0.5,
    factionStandingMod: { muster: 1 },
  },
  {
    id: 'trauma_medic',
    name: 'Trauma Medic',
    description: 'A&E nights. You close holes other people would bleed out of.',
    category: 'positive',
    cost: 5,
    icon: 'trait.trauma_medic',
    effects: ['Healing items restore +12 HP', '55% infection resist', 'Minor bleeds clot much faster'],
    conflicts: ['medic', 'thin_blood', 'hemophilia'],
    healBonus: 12,
    infectionResist: 0.55,
    bleedStopBonus: 2,
  },
  {
    id: 'hyrox_champion',
    name: 'Hyrox Champion',
    description: 'Stadium heats, sandbag lunges, the whole circus. The engine is still there.',
    category: 'positive',
    cost: 5,
    icon: 'trait.hyrox_champion',
    effects: ['+2 Endurance', '+30 max HP', '+25% travel speed', '−20% energy drain'],
    conflicts: ['marathoner', 'out_of_shape', 'glass_jaw', 'bad_knees'],
    enduranceMod: 2,
    maxHpBonus: 30,
    travelSpeedMod: 0.25,
    energyDrainMod: -0.2,
  },
  {
    id: 'young_blood',
    name: 'Young Blood',
    description: 'Campus legs, 3am suppers, and a body that has not learned to quit.',
    category: 'positive',
    cost: 4,
    icon: 'trait.young_blood',
    effects: ['+1 Dexterity', '+1 Endurance', '+15% travel speed', 'No night accuracy penalty', '+1 on checks'],
    conflicts: ['aircon_addict', 'afraid_of_dark', 'night_owl'],
    dexterityMod: 1,
    enduranceMod: 1,
    travelSpeedMod: 0.15,
    nightAccuracyPenaltyRemoved: true,
    checkBonusMod: 1,
  },
  {
    id: 'estate_kitchen',
    name: 'Estate Kitchen',
    description: 'Thirty years of service, extra rice, and a stall the whole block still names.',
    category: 'positive',
    cost: 4,
    icon: 'trait.estate_kitchen',
    effects: ['Food restores 50% more hunger', 'Gotong starts Known', 'Richer hawker-centre loot'],
    conflicts: ['hawker_cook', 'picky_eater', 'weak_stomach'],
    foodEffectMod: 0.5,
    factionStandingMod: { gotong: 1 },
    poiLootBonus: { foodcourt: 2 },
  },
  {
    id: 'estate_memory',
    name: 'Estate Memory',
    description: 'You already knew which blocks had the good stuff — and how many rooms were left.',
    category: 'positive',
    cost: 5,
    icon: 'trait.estate_memory',
    effects: ['+2 loot', '+2 searches per POI', '+20% search speed', '+2 awareness', 'See remaining searches'],
    conflicts: ['karang_guni', 'hoarder', 'light_pockets', 'noisy', 'heavy_sleeper', 'lost_without_maps'],
    lootMod: 2,
    searchBonusMod: 2,
    searchSpeedMod: 0.2,
    awarenessMod: 2,
    showSearchesRemaining: true,
  },
  {
    id: 'operator',
    name: 'Operator',
    description: 'Soft hands, sharp elbows, and a bag that always had one more pocket.',
    category: 'positive',
    cost: 4,
    icon: 'trait.operator',
    effects: ['+2 Wits', '+20% loot value', 'Backpack +1 column', '+1 on checks', 'See remaining searches'],
    conflicts: ['kiasuism', 'short_fuse', 'squeamish'],
    witsMod: 2,
    lootValueMod: 0.2,
    gridWidthBonus: 1,
    checkBonusMod: 1,
    showSearchesRemaining: true,
  },
  {
    id: 'site_foreman',
    name: 'Site Foreman',
    description: 'You built these blocks. You know which walls hide what, and which ones come down.',
    category: 'positive',
    cost: 5,
    icon: 'trait.site_foreman',
    effects: ['+1 Strength', 'Craft recipes cost −2 materials', 'Richer hardware and industrial loot', 'Better HDB corridor reads', 'HDB picks +1', 'HDB Force 20% faster', 'HDB door heat −15%'],
    conflicts: ['quiet_step', 'handyman'],
    strengthMod: 1,
    craftCostMod: -2,
    poiLootBonus: { hardware: 2, industrial: 1 },
    hdbScoutBonus: 0.25,
    hdbPickMod: 1,
    hdbBreachMinutesMult: -0.2,
    hdbDoorHeatMult: -0.15,
  },
  {
    id: 'made_man',
    name: 'Made Man',
    description: 'They know your face. The void decks are open ground. The checkpoints are not.',
    category: 'positive',
    cost: 5,
    icon: 'trait.made_man',
    effects: ['88 Syndicate starts Trusted+', 'Muster starts wary'],
    conflicts: ['kampong_spirit', 'ah_long_debt'],
    factionStandingMod: { syndicate_88: 3, muster: -1 },
  },
  {
    id: 'hypervigilant',
    name: 'Hypervigilant',
    description: 'Training never lets you drop the watch. Sleep is a rumour.',
    category: 'negative',
    cost: -5,
    icon: 'trait.hypervigilant',
    effects: ['Sleep restores 50% less energy', 'Extra encounters at night'],
    conflicts: ['deep_sleeper', 'night_owl'],
    sleepRestoreMod: -0.5,
    nightEncounterChanceMod: 0.2,
  },
  {
    id: 'shift_burnout',
    name: 'Shift Burnout',
    description: 'Twelve-hour nights stacked until the tank never fills.',
    category: 'negative',
    cost: -5,
    icon: 'trait.shift_burnout',
    effects: ['Sleep restores 40% less energy', '+20% energy drain'],
    conflicts: ['deep_sleeper'],
    sleepRestoreMod: -0.4,
    energyDrainMod: 0.2,
  },
  {
    id: 'restlessness',
    name: 'Restlessness',
    description: 'Still training for a race that is not coming. You cannot sit still, or quiet.',
    category: 'negative',
    cost: -5,
    icon: 'trait.restlessness',
    effects: ['Sleep restores 50% less energy', '+15% encounter chance'],
    conflicts: ['quiet_step', 'deep_sleeper'],
    sleepRestoreMod: -0.5,
    encounterChanceMod: 0.15,
  },
  {
    id: 'never_outdoors',
    name: 'Never Outdoors',
    description: 'Lecture halls, malls, aircon. The island heat is a foreign country.',
    category: 'negative',
    cost: -4,
    icon: 'trait.never_outdoors',
    effects: ['+25% energy drain outdoors and in heat', '−1 attack vs the undead', '+15% thirst drain'],
    conflicts: ['heat_hardened', 'water_baby', 'umbrella_city', 'train_memory', 'haze_mask'],
    outdoorEnergyDrainMod: 0.25,
    zombieAttackMod: -1,
    thirstDrainMod: 0.15,
  },
  {
    id: 'stall_voice',
    name: 'Stall Voice',
    description: 'Everyone on the estate knows that voice. So does everything that hunts by sound.',
    category: 'negative',
    cost: -4,
    icon: 'trait.stall_voice',
    effects: ['+25% encounter chance', '+10% ambush chance'],
    conflicts: ['quiet_step', 'sixth_sense', 'shadow_habit'],
    encounterChanceMod: 0.25,
    ambushChanceMod: 0.1,
  },
  {
    id: 'ruined_knees',
    name: 'Ruined Knees',
    description: 'Fourteenth storey, every day, for too many years. The stairs won.',
    category: 'negative',
    cost: -5,
    icon: 'trait.ruined_knees',
    effects: ['−1 Dexterity', '−30% travel speed', 'Leg injuries heal 70% slower'],
    conflicts: ['marathoner', 'tekong_legs', 'hyrox_champion'],
    dexterityMod: -1,
    travelSpeedMod: -0.3,
    legHealMod: -0.7,
  },
  {
    id: 'desk_body',
    name: 'Desk Body',
    description: 'Four reorgs, a return-to-office mandate, and no bus run since 2019.',
    category: 'negative',
    cost: -4,
    icon: 'trait.desk_body',
    effects: ['+15% energy drain', '−10% travel speed', '−1 Dexterity', '−1 attack', '+15% outdoor energy drain'],
    conflicts: ['marathoner', 'hyrox_champion', 'tekong_legs', 'train_memory'],
    energyDrainMod: 0.15,
    travelSpeedMod: -0.1,
    dexterityMod: -1,
    attackMod: -1,
    outdoorEnergyDrainMod: 0.15,
  },
  {
    id: 'heavy_hands',
    name: 'Heavy Hands',
    description: 'You solve things by hitting them. Quiet was never the job.',
    category: 'negative',
    cost: -5,
    icon: 'trait.heavy_hands',
    effects: ['+25% encounter chance', '+10% ambush chance'],
    conflicts: ['quiet_step', 'sixth_sense', 'shadow_habit'],
    encounterChanceMod: 0.25,
    ambushChanceMod: 0.1,
  },
  {
    id: 'warrant',
    name: 'Warrant',
    description: 'The Muster has a file. It is not flattering. Syndicate love is not free.',
    category: 'negative',
    cost: -5,
    icon: 'trait.warrant',
    effects: ['Muster starts Hated'],
    conflicts: ['kampong_spirit', 'void_deck_chat'],
    factionStandingMod: { muster: -4 },
  },
  {
    id: 'mall_rat',
    name: 'Mall Rat',
    description: 'Aircon atriums were your outdoors. Real weather still feels wrong.',
    category: 'negative',
    cost: -1,
    icon: 'trait.mall_rat',
    effects: ['+15% outdoor / heat energy drain', '+10% thirst drain'],
    conflicts: ['heat_hardened', 'umbrella_city', 'haze_mask'],
    outdoorEnergyDrainMod: 0.15,
    thirstDrainMod: 0.1,
  },
  {
    id: 'tone_deaf',
    name: 'Tone Deaf',
    description: 'You say the wrong thing at the wrong door.',
    category: 'negative',
    cost: -1,
    icon: 'trait.tone_deaf',
    effects: ['−1 on doorway and dialogue checks'],
    conflicts: ['silver_tongue', 'void_deck_chat'],
    checkBonusMod: -1,
  },
  {
    id: 'loud_soles',
    name: 'Loud Soles',
    description: 'Hard heels, hard habits. Everything hears you coming.',
    category: 'negative',
    cost: -2,
    icon: 'trait.loud_soles',
    effects: ['+15% encounter chance when travelling'],
    conflicts: ['quiet_step', 'shadow_habit', 'sixth_sense'],
    encounterChanceMod: 0.15,
  },
  {
    id: 'lost_without_maps',
    name: 'Lost Without Maps',
    description: 'Without a pin on your phone you still turn the wrong way at every junction.',
    category: 'negative',
    cost: -1,
    icon: 'trait.lost_without_maps',
    effects: ['−10% travel speed', '−1 awareness'],
    conflicts: ['train_memory', 'tekong_legs', 'estate_memory'],
    travelSpeedMod: -0.1,
    awarenessMod: -1,
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

export const SIGNATURE_MIN_COST = 4;
export const CURSE_MAX_COST = -3;
export const MAX_SIGNATURES = 1;
export const MAX_CURSES = 1;
export const MAX_NEGATIVES = 2;

export function isSignature(t: Trait): boolean {
  return t.category === 'positive' && t.cost >= SIGNATURE_MIN_COST;
}

export function isCurse(t: Trait): boolean {
  return t.category === 'negative' && t.cost <= CURSE_MAX_COST;
}

export function countSignatures(ids: string[]): number {
  return getTraits(ids).filter(isSignature).length;
}

export function countCurses(ids: string[]): number {
  return getTraits(ids).filter(isCurse).length;
}

export function countNegatives(ids: string[]): number {
  return getTraits(ids).filter((t) => t.category === 'negative').length;
}

/** Why a tile cannot be added, or null if it is legal to pick. */
export function pickBlockReason(candidateId: string, selectedIds: string[]): string | null {
  if (selectedIds.includes(candidateId)) return null;
  if (isIncompatible(candidateId, selectedIds)) return 'conflicts with a picked trait';
  const candidate = getTrait(candidateId);
  if (isSignature(candidate) && countSignatures(selectedIds) >= MAX_SIGNATURES) {
    return 'already have a signature';
  }
  if (isCurse(candidate) && countCurses(selectedIds) >= MAX_CURSES) {
    return 'already have a curse';
  }
  if (candidate.category === 'negative' && countNegatives(selectedIds) >= MAX_NEGATIVES) {
    return 'at most two negatives';
  }
  if (candidate.category === 'positive') {
    if (traitBudgetUsed(selectedIds) + candidate.cost > TRAIT_BUDGET) {
      return 'not enough points';
    }
  }
  return null;
}

/** Whether a new trait can be added given the current selection. */
export function canPickTrait(candidateId: string, selectedIds: string[]): boolean {
  if (selectedIds.includes(candidateId)) return false;
  return pickBlockReason(candidateId, selectedIds) === null;
}

/** Whether a finished build is legal to start / save. */
export function isLegalTraitBuild(ids: string[]): boolean {
  if (traitBudgetRemaining(ids) < 0) return false;
  if (countSignatures(ids) > MAX_SIGNATURES) return false;
  if (countCurses(ids) > MAX_CURSES) return false;
  if (countNegatives(ids) > MAX_NEGATIVES) return false;
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
        pct(d * 0.04, 'search speed'),
        num(d, 'awareness (fog & blip range)'),
        num(sense, 'encounter-sense chance', '%'),
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

/** Incoming damage multiplier for the first connecting hit of a fight. */
export function traitFirstHitDamageMult(traitIds: string[]): number {
  const vals = getTraits(traitIds)
    .map((t) => t.firstHitDamageMult)
    .filter((v): v is number => typeof v === 'number');
  return vals.length ? Math.min(...vals) : 1;
}

/** Extra loot richness at a POI category. */
export function traitPoiLootBonus(traitIds: string[], category: PoiCategory): number {
  let n = 0;
  for (const t of getTraits(traitIds)) n += t.poiLootBonus?.[category] ?? 0;
  return n;
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
