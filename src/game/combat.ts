import type {
  Attributes,
  CombatContext,
  CombatLogEntry,
  Enemy,
  Equipment,
  EquipSlot,
  FactionId,
  BodyPartId,
  BodyParts,
  PoiCategory,
  StanceDef,
  StanceId,
  TerrainId,
  TerrainModifier,
  WeatherState,
  WeaponEffect,
  Zombie,
} from './types';
import type { Rng } from './rng';
import { environmentCombatMods } from './weather';
import { itemDef } from './loot';
import { hasTraitFlag, sumTraitMod } from './character';
import {
  armorScaledMod,
  effectiveDamage,
  equipAccuracyBonus,
  equipDefenseBonus,
  isBroken,
  isTwoHandedEquipped,
  limbArmorForZone,
  scaledMod,
  slotForZone,
  statusResistForZone,
  ALL_EQUIP_SLOTS,
} from './inventory';
import {
  BODY_PART_LABEL,
  energyAttackBonus,
  energyDodgeBonus,
  energyFleeDcModifier,
  headCritReductionFromGear,
  headTargetReductionFromGear,
  legTravelFactor,
  rollHitZone,
} from './survival';
import {
  combatLine,
  enemyKeys,
  playerOutcomeKey,
  soakNote,
} from './combatFlavor';
import {
  gunClubAccuracy,
  gunClubDamageMult,
  gunClubSpeed,
  GUN_CLUB_WEAR_MULT,
  gunshotDangerApplies,
  gunshotNoiseIntensity,
  isRangedWeaponEffect,
  reloadSpeedFor,
} from './firearms';
import { fullEquipment } from './equipmentSlots';
import {
  ENEMIES,
  rollElite,
  rollHuman,
  rollLoner,
  rollZombie,
  rollAnimal,
  rollAnimalById,
  type LonerKind,
  type AnimalHabitat,
} from './enemies';

export type { LonerKind, AnimalHabitat } from './enemies';

const EQUIP_SLOTS = ALL_EQUIP_SLOTS;

export interface PlayerCombatStats {
  attack: number; // added to d20 attack roll
  defense: number; // target number enemies must beat
  /** The gear-only slice of `defense`, post-cap — how much of the target
   *  number the kit is holding up. Drives deflection wear. */
  gearDefense: number;
  damage: number; // damage on a hit
  infectionResist: number; // 0..1
  weaponName: string;
  /** Swinging a holstered gun from mainHand as a club. */
  gunClub?: boolean;
  /** @deprecated Melee track never shoots; kept for test compat. */
  ranged: boolean;
  /** @deprecated Always 0 on melee track. */
  roundsPerShot: number;
  /** The equipped weapon's `wearRate` — see ItemDef. 1 when unarmed. */
  wearRate: number;
  /** Ignore night/dusk accuracy penalties from the environment. */
  nightAccuracyPenaltyRemoved: boolean;
  /** Extra accuracy at night/dusk (negative = worse). */
  nightAccuracyExtra: number;
  /** Attack delta applied only vs undead. */
  zombieAttackMod: number;
  /** Multiplier on gauge fill from the weapon (or fists). */
  speedFactor: number;
  /** Main-hand accuracy term, so an off-hand follow-up can swap it. */
  weaponAccuracy: number;
  strength: number;
  dexterity: number;
  /** Light off-hand weapon, if dual-wielding. */
  offHand: { damage: number; accuracy: number; name: string; wearRate: number } | null;
}

// ---------------------------------------------------------------- wear ------
// What a swing costs the weapon.
//
// These used to be 1.5 on a hit (3.0 against armour) and 0.8 on a miss, which
// worked out to a whole weapon roughly every 115 swings. That sounds generous
// until you count it in kills: a Parang died after 3, a Katana — an 18%-scarcity
// find — after 2 at high danger, because a blunting weapon needs more swings per
// kill, which blunts it faster. Durability wasn't a resource to manage, it was
// the thing you spent the run fighting.

const WEAR_ON_HIT = 0.5;
/** Extra on top of a hit when the target is armoured. */
const WEAR_ARMOR_EXTRA = 0.4;
const WEAR_ON_MISS = 0.2;

/**
 * What a turned blow costs the kit that turned it.
 *
 * Armour used to wear only when something got through, which is exactly
 * backwards: the better the loadout, the fewer hits landed, the less it aged.
 * The strongest kits in the game were the ones that never paid upkeep. A swing
 * that would have connected against a bare survivor and didn't now scuffs the
 * armour that stopped it — lighter than a real hit, but it accumulates.
 */
const WEAR_ON_DEFLECT = 0.6;

/**
 * Ceiling on the gear contribution to defence.
 *
 * Defence is a d20 target number, so a point of it is a flat 5% off every
 * incoming attack — linear on the stat sheet, runaway in play. Uncapped, a full
 * riot kit reached +13 and left an Abomination hitting on a natural 20 and
 * nothing else. Six points is the most a kit may buy (30%); past that armour
 * has to justify itself through soak and status resist, not evasion.
 */
const MAX_EQUIP_DEFENSE = 6;

// ---------------------------------------------------------------- stances --
// Accuracy modifiers everywhere are expressed in d20 roll points (1 point ≈ 5%).

export const STANCES: Record<StanceId, StanceDef> = {
  aggressive: {
    id: 'aggressive',
    name: 'Aggressive',
    icon: 'stance.aggressive',
    description: 'All forward pressure. +2 to hit, +2 damage, −3 defence, −3% dodge.',
    attackMod: 2,
    damageMod: 2,
    defenseMod: -3,
    limbDamageMult: 1,
    dodgeMod: -0.03,
    critChanceBonus: 0,
    ignoresArmor: false,
    timeCostHours: 0,
    speedMod: 2,
    fleeDcMod: 0,
    opportunityAttack: false,
    opportunityAccuracy: 0,
  },
  guarded: {
    id: 'guarded',
    name: 'Guarded',
    icon: 'stance.guarded',
    description: 'Cover up. +3 defence, +5% dodge, −2 to hit, limb damage taken ×0.75.',
    attackMod: -2,
    damageMod: 0,
    defenseMod: 3,
    limbDamageMult: 0.75,
    dodgeMod: 0.05,
    critChanceBonus: 0,
    ignoresArmor: false,
    timeCostHours: 0,
    speedMod: -1,
    fleeDcMod: 0,
    opportunityAttack: false,
    opportunityAccuracy: 0,
  },
  precision: {
    id: 'precision',
    name: 'Precision',
    icon: 'stance.precision',
    description: '+15% crit, ignores armour, costs an extra hour per round.',
    attackMod: 0,
    damageMod: 0,
    defenseMod: 0,
    limbDamageMult: 1,
    dodgeMod: 0,
    critChanceBonus: 0.15,
    ignoresArmor: true,
    timeCostHours: 1,
    speedMod: -3,
    fleeDcMod: 0,
    opportunityAttack: false,
    opportunityAccuracy: 0,
  },
  disengage: {
    id: 'disengage',
    name: 'Disengage',
    icon: 'stance.disengage',
    description: 'Break contact. Flee DC −4, but they get one parting swing at −2.',
    attackMod: 0,
    damageMod: 0,
    defenseMod: 0,
    limbDamageMult: 1,
    dodgeMod: 0,
    critChanceBonus: 0,
    ignoresArmor: false,
    timeCostHours: 0,
    speedMod: 0,
    fleeDcMod: -4,
    opportunityAttack: true,
    opportunityAccuracy: -2,
  },
};

/** All stances, including the flee profile used by Break off. */
export const STANCE_ORDER: StanceId[] = ['aggressive', 'guarded', 'precision', 'disengage'];

/** Stances you can hold and switch between while the fight is running. */
export const FIGHT_STANCE_ORDER: StanceId[] = ['aggressive', 'guarded', 'precision'];

// ---------------------------------------------------------------- terrain --

export const TERRAIN: Record<TerrainId, TerrainModifier> = {
  hdb_corridor: {
    id: 'hdb_corridor',
    name: 'HDB Corridor',
    defenseMod: 0,
    dodgeMod: -0.2,
    fleeDcMod: 3,
    meleeAccuracyMod: 2,
    rangedAccuracyMod: 0,
    ambushRateMod: 0,
    gunshotDangerMod: 0,
  },
  void_deck: {
    id: 'void_deck',
    name: 'Void Deck',
    defenseMod: 0,
    dodgeMod: 0.15,
    fleeDcMod: -2,
    meleeAccuracyMod: 0,
    rangedAccuracyMod: 2,
    ambushRateMod: 0,
    gunshotDangerMod: 0,
  },
  supermarket_aisle: {
    id: 'supermarket_aisle',
    name: 'Supermarket Aisle',
    defenseMod: 2,
    dodgeMod: 0,
    fleeDcMod: 1,
    meleeAccuracyMod: 0,
    rangedAccuracyMod: 0,
    ambushRateMod: 0.1,
    gunshotDangerMod: 0,
  },
  mrt_concourse: {
    id: 'mrt_concourse',
    name: 'MRT Concourse',
    defenseMod: 1,
    dodgeMod: 0.1,
    fleeDcMod: -3,
    meleeAccuracyMod: 0,
    rangedAccuracyMod: 0,
    ambushRateMod: 0,
    gunshotDangerMod: 1,
  },
  /**
   * A running tunnel, not a station hall: one train wide, nowhere to sidestep
   * and nowhere to break for. Cover is total and useless at the same time —
   * you can put your back to a wall, but a rifle in here is a bad idea and
   * there is no direction to run that isn't the way they're coming.
   */
  tunnel_bore: {
    id: 'tunnel_bore',
    name: 'Tunnel Bore',
    defenseMod: 2,
    dodgeMod: -0.1,
    fleeDcMod: 3,
    meleeAccuracyMod: 1,
    rangedAccuracyMod: -1,
    ambushRateMod: 0.15,
    gunshotDangerMod: 2,
  },
  open_ground: {
    id: 'open_ground',
    name: 'Open Ground',
    defenseMod: 0,
    dodgeMod: 0,
    fleeDcMod: 0,
    meleeAccuracyMod: 0,
    rangedAccuracyMod: 0,
    ambushRateMod: 0,
    gunshotDangerMod: 0,
  },
};

/** Which terrain a fight at this kind of site plays out on. */
export function terrainForCategory(category: PoiCategory, roadAmbush = false): TerrainModifier {
  if (roadAmbush) return TERRAIN.open_ground;
  switch (category) {
    case 'residential':
      return TERRAIN.hdb_corridor;
    case 'foodcourt':
      return TERRAIN.void_deck;
    case 'supermarket':
    case 'convenience':
    case 'pharmacy':
    case 'clinic':
    case 'hardware':
      return TERRAIN.supermarket_aisle;
    case 'mrt':
      return TERRAIN.mrt_concourse;
    default:
      return TERRAIN.open_ground;
  }
}

/**
 * Encounter kits live in `src/game/data/enemies.json` (DEV enemy browser).
 * These wrappers keep call sites stable while rolls go through `enemies.ts`.
 */

/** Build a zombie scaled to the location's danger (1..5). */
export function makeZombie(rng: Rng, danger: number, _category?: PoiCategory): Enemy {
  return rollZombie(ENEMIES, rng, danger);
}

/** The thing a maxed-out block sends down the corridor after you. */
export function makeHulk(rng: Rng, danger: number): Enemy {
  return rollElite(ENEMIES, rng, ENEMIES.spawn.eliteBindings.hdb, danger, 'hunter');
}

/** Rare tunnel Contact — something that has been keeping pace down the bore. */
export function makeStalker(rng: Rng, danger: number): Enemy {
  return rollElite(ENEMIES, rng, ENEMIES.spawn.eliteBindings.tunnel, danger, 'stalker');
}

/**
 * Build a human enemy scaled to danger. Humans don't infect (infectious: 0)
 * but hit harder and defend better than a comparable zombie.
 */
export function makeHuman(rng: Rng, faction: Exclude<FactionId, null>, danger: number): Enemy {
  return rollHuman(ENEMIES, rng, faction, danger);
}

/**
 * Not everyone who fights you belongs to somebody. A doorway argument with a
 * scavenger or a starving stranger is its own thing — no colours, no armour,
 * and no organisation to answer to afterwards.
 */
export function makeLoner(rng: Rng, kind: LonerKind, danger: number): Enemy {
  return rollLoner(ENEMIES, rng, kind, danger);
}

/** Infected wildlife — habitat table, not the zombie ladder. */
export function makeAnimal(rng: Rng, habitat: AnimalHabitat, danger: number): Enemy {
  return rollAnimal(ENEMIES, rng, habitat, danger);
}

/** Named animal (e.g. the Turned Otter in a flooded bore). */
export function makeAnimalById(rng: Rng, id: string, danger: number): Enemy {
  return rollAnimalById(ENEMIES, rng, id, danger);
}

/** Derive the player's combat stats from attributes, traits and equipped gear.
 *  Melee track only — holstered firearms use resolvePlayerFireAction. */
export function playerCombatStats(
  attrs: Attributes,
  traitIds: string[],
  equipment: Equipment,
  armPenalty = 0,
  loadAttackMod = 0,
): PlayerCombatStats {
  const eq = fullEquipment(equipment);
  const mainHand = eq.mainHand;
  const usableWeapon = mainHand && !isBroken(mainHand) ? mainHand : null;
  const weaponDef = usableWeapon ? itemDef(usableWeapon.defId) : null;
  const rawEffect = weaponDef && weaponDef.effect.kind === 'weapon' ? weaponDef.effect : null;
  const gunClub = !!(rawEffect && isRangedWeaponEffect(rawEffect));
  const w = rawEffect && !gunClub ? rawEffect : gunClub && rawEffect ? rawEffect : null;

  let atkBonus = sumTraitMod(traitIds, 'attackMod');
  let gearDef = 0;
  for (const slot of EQUIP_SLOTS) {
    const inst = eq[slot];
    if (!inst) continue;
    const mods = itemDef(inst.defId).modifiers;
    atkBonus += mods?.attackBonus ?? 0;
    gearDef += equipDefenseBonus(inst);
  }
  atkBonus += equipAccuracyBonus(eq);
  // Traits sit outside the cap — it is a rail on what a loadout can buy, not on
  // who the survivor is.
  const gearDefense = Math.min(MAX_EQUIP_DEFENSE, gearDef);
  const defBonus = sumTraitMod(traitIds, 'defenseMod') + gearDefense;

  let weaponAcc = w?.accuracy ?? 0;
  let baseDamage = usableWeapon && w ? effectiveDamage(usableWeapon) : 4;
  let wearRate = weaponDef?.wearRate ?? 1;
  let speedFactor =
    usableWeapon && w ? weaponSpeedFactor(w, !!weaponDef?.twoHanded) : FIST_SPEED_FACTOR;

  if (gunClub && usableWeapon && rawEffect) {
    weaponAcc += gunClubAccuracy(usableWeapon.defId);
    baseDamage = Math.max(
      4,
      Math.round(effectiveDamage(usableWeapon) * gunClubDamageMult(usableWeapon.defId)),
    );
    wearRate *= GUN_CLUB_WEAR_MULT;
    speedFactor = gunClubSpeed(usableWeapon.defId);
  }

  const attack = attrs.dexterity + weaponAcc + atkBonus - armPenalty + loadAttackMod;
  const defense = 10 + Math.floor(attrs.dexterity / 2) + defBonus;
  const damage = baseDamage + Math.floor(attrs.strength / 2);
  const infectionResist = sumTraitMod(traitIds, 'infectionResist');
  const brokenName = mainHand && isBroken(mainHand) ? itemDef(mainHand.defId).name : null;
  const weaponName = weaponDef
    ? gunClub
      ? `${weaponDef.name} (bashing)`
      : weaponDef.name
    : brokenName
      ? `Fists (${brokenName} broken)`
      : 'Fists';

  let offHand: PlayerCombatStats['offHand'] = null;
  if (offHandRole(eq) === 'weapon' && eq.offHand) {
    const ohInst = eq.offHand;
    const ohDef = itemDef(ohInst.defId);
    if (ohDef.effect.kind === 'weapon' && !ohDef.effect.ranged) {
      offHand = {
        damage: effectiveDamage(ohInst),
        accuracy: ohDef.effect.accuracy,
        name: ohDef.name,
        wearRate: ohDef.wearRate ?? 1,
      };
    }
  }

  return {
    attack,
    defense,
    gearDefense,
    damage,
    infectionResist: Math.min(1, Math.max(-0.5, infectionResist)),
    weaponName,
    gunClub,
    ranged: false,
    roundsPerShot: 0,
    wearRate,
    nightAccuracyPenaltyRemoved: hasTraitFlag(traitIds, 'nightAccuracyPenaltyRemoved'),
    nightAccuracyExtra: sumTraitMod(traitIds, 'nightAccuracyExtra'),
    zombieAttackMod: sumTraitMod(traitIds, 'zombieAttackMod'),
    speedFactor,
    weaponAccuracy: weaponAcc,
    strength: attrs.strength,
    dexterity: attrs.dexterity,
    offHand,
  };
}

export type OffHandRole = 'shield' | 'weapon' | 'empty' | 'utility';

/** What the off-hand slot is actually doing this fight. */
export function offHandRole(equipment: Equipment): OffHandRole {
  const inst = equipment.offHand;
  if (!inst) return 'empty';
  const def = itemDef(inst.defId);
  if (!isBroken(inst) && (def.modifiers?.blockChance ?? 0) > 0) return 'shield';
  if (!isBroken(inst) && def.effect.kind === 'weapon') return 'weapon';
  return 'utility';
}

/** Bonuses from a free off-hand — not from iterating equipped items. */
export function offHandCombatMods(equipment: Equipment): { speed: number; dodge: number } {
  if (offHandRole(equipment) === 'empty' && !isTwoHandedEquipped(equipment)) {
    return { speed: 0.6, dodge: 0.03 };
  }
  return { speed: 0, dodge: 0 };
}

// ------------------------------------------------------- initiative track --
/**
 * The two markers race along one track; the first to the far end swings and is
 * sent back to the start. Gauge units are earned per real second at 1× playback,
 * so a Speed of 10 fills the track in `GAUGE_FULL / 10` seconds (5s here).
 *
 * Kept at 50 (not 100) so listed speeds — player formula, enemy catalog, gear
 * tooltips — are the rates the track actually uses. Raising the fill ceiling
 * instead of secretly ×2-ing rates was how initiative used to drift out of sync
 * with the SPD numbers on screen.
 */
export const GAUGE_FULL = 50;

/** Playback rates offered by the on-screen controls. */
export const COMBAT_SPEEDS = [0.5, 1, 2, 4] as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Unarmed swing rate — a little quicker than a light blade. */
export const FIST_SPEED_FACTOR = 1.15;

/**
 * Gauge-fill multiplier from the weapon. Heavy hits land slower; an authored
 * `speedFactor` wins when the damage-derived value feels wrong.
 *
 * knife(10)→1.25, hammer(14)→1.17, crowbar(18)→1.09, parang(20)→1.05,
 * fire_axe(24,2H)→0.82, pistol(28)→0.89, shotgun(40,2H)→0.55.
 */
export function weaponSpeedFactor(e: WeaponEffect | null, twoHanded = false): number {
  if (!e) return FIST_SPEED_FACTOR;
  if (e.speedFactor != null) return e.speedFactor;
  const derived = clamp(1.45 - e.damage * 0.02, 0.65, 1.4);
  return twoHanded ? derived * 0.85 : derived;
}

/**
 * How fast the player's marker crawls. Dexterity is the bulk of it; the stance
 * is the part you actually chose, and a mauled leg or an empty tank is the part
 * the run chose for you. Weapon speed is a multiplier on the whole rate.
 */
export function playerSpeed(
  attrs: Attributes,
  stance: StanceDef,
  energy = 50,
  legFactor = 1,
  equipSpeed = 0,
  weaponFactor = 1,
  loadSpeedMult = 1,
): number {
  const energyMod = energy < 20 ? -2 : energy < 45 ? -1 : 0;
  const base = 6 + attrs.dexterity * 0.8 + stance.speedMod + energyMod + equipSpeed;
  return Math.max(2, base * Math.max(0.4, legFactor) * weaponFactor * Math.max(0.25, loadSpeedMult));
}

/** Seconds of track time one action costs at the given speed. */
export function secondsPerAction(speed: number): number {
  return GAUGE_FULL / Math.max(0.1, speed);
}

export interface PlayerActionResult {
  zombieHpAfter: number;
  log: CombatLogEntry[];
  zombieDead: boolean;
  /** Whether this swing connected (including crits). */
  hit: boolean;
  /** Natural high roll / Precision crit band. */
  critical: boolean;
  /** Damage applied after soak; 0 on a miss. */
  damageDealt: number;
  /** In-game hours the swing burned beyond the usual scuffle. */
  timeCostHours: number;
  /** Extra local danger from noise (gunfire in echoing terrain). */
  dangerNoise: number;
  /** Condition the main-hand weapon lost. */
  weaponWear: number;
  /** Condition the off-hand weapon lost on a follow-up strike. */
  offHandWear: number;
  /** Ammunition spent — 1 for a shot that actually went off. */
  roundsSpent: number;
}

export interface EnemyActionResult {
  playerDamage: number;
  infectionGain: number;
  log: CombatLogEntry[];
  limbDamageMult: number;
  armorWear: number;
  /** Slot that should take the brunt of armor wear for this hit. */
  wearSlot: EquipSlot | null;
  dodged: boolean;
  /** Off-hand shield fully negated this hit. */
  blocked: boolean;
  hitZone: BodyPartId | null;
  critical: boolean;
  headCritReduction: number;
  statusResist: number;
}

/** Dodge chance when an attack roll already beat defence — 0..0.45 cap. */
export function playerDodgeChance(
  attrs: Attributes,
  traitIds: string[],
  equipment: Equipment,
  energy: number,
  parts: BodyParts,
  stance: StanceDef,
  terrain: TerrainModifier,
  loadDodgeMod = 0,
): number {
  const dexBase = (attrs.dexterity - 5) * 0.02;
  let gearDodge = 0;
  for (const slot of EQUIP_SLOTS) {
    const inst = equipment[slot];
    if (!inst) continue;
    gearDodge += scaledMod(inst, 'dodgeBonus');
  }
  const traitDodge = sumTraitMod(traitIds, 'dodgeMod');
  const legFactor = legTravelFactor(parts);
  const legPenalty = (legFactor - 1) * 0.1;
  const ohDodge = offHandCombatMods(equipment).dodge;
  const raw =
    dexBase +
    traitDodge +
    gearDodge +
    ohDodge +
    stance.dodgeMod +
    terrain.dodgeMod +
    energyDodgeBonus(energy) +
    legPenalty +
    loadDodgeMod;
  return Math.max(0, Math.min(0.45, raw));
}

/** Player's effective defence for a round, including stance and terrain. */
export function effectiveDefense(
  player: PlayerCombatStats,
  stance: StanceDef,
  terrain: TerrainModifier,
): number {
  return player.defense + stance.defenseMod + terrain.defenseMod;
}

/** Terrain accuracy bonus that applies to the equipped weapon type. */
function terrainAccuracyMelee(terrain: TerrainModifier): number {
  return terrain.meleeAccuracyMod;
}

function fireAccuracyMod(enemy: Enemy, terrain: TerrainModifier): number {
  let mod = terrain.rangedAccuracyMod;
  if (enemy.kind === 'zombie') mod -= 1;
  else if (enemy.kind === 'human') mod += 2;
  else if (enemy.kind === 'animal') mod -= 1;
  return mod;
}

/**
 * One swing from the player — fired the moment their marker reaches the end of
 * the track, with no assumption that the enemy gets a reply. Pure; returns
 * deltas for the store to apply.
 */
export function resolvePlayerAction(
  rng: Rng,
  player: PlayerCombatStats,
  zombie: Zombie,
  weather: WeatherState,
  round: number,
  stance: StanceDef,
  terrain: TerrainModifier,
  energy = 50,
): PlayerActionResult {
  const env = environmentCombatMods(weather);
  // Night owl ignores the time-of-day accuracy hit; Afraid of the Dark stacks extra.
  let envAccuracy = env.playerAccuracy;
  if (weather.time === 'night' || weather.time === 'dusk') {
    const timePenalty = weather.time === 'night' ? -2 : -1;
    if (player.nightAccuracyPenaltyRemoved) envAccuracy -= timePenalty;
    envAccuracy += player.nightAccuracyExtra;
  }
  const log: CombatLogEntry[] = [];
  let zombieHp = zombie.hp;
  const dangerNoise = 0;
  const roundsSpent = 0;
  // Swinging costs the weapon something whether or not it connects; landing on
  // armour costs it more.
  let weaponWear = 0;
  let offHandWear = 0;
  let hit = false;
  let damageDealt = 0;

  const vsUndead = zombie.kind === 'zombie' ? player.zombieAttackMod : 0;
  const pAtkMod =
    player.attack +
    envAccuracy +
    stance.attackMod +
    terrainAccuracyMelee(terrain) +
    energyAttackBonus(energy) +
    vsUndead;
  const pRoll = rng.d20();
  const pTotal = pRoll + pAtkMod;
  const pTarget = 10 + zombie.defense;
  // Precision widens the crit band (+15% ≈ crit on 17+).
  const critFloor = 20 - Math.round(stance.critChanceBonus * 20);
  const crit = pRoll >= critFloor;
  log.push({
    round,
    side: 'player',
    tone: 'roll',
    text: `You attack · ${stance.name} (d20 ${pRoll}${fmt(pAtkMod)} = ${pTotal} vs ${pTarget})`,
  });
  if (crit || pTotal >= pTarget) {
    hit = true;
    let dmg = player.damage + stance.damageMod + rng.int(0, 3);
    if (crit) dmg = Math.round(dmg * 1.75);
    const soak = stance.ignoresArmor ? 0 : zombie.armor;
    dmg = Math.max(1, dmg - soak);
    damageDealt = dmg;
    zombieHp -= dmg;
    weaponWear = (WEAR_ON_HIT + (zombie.armor > 0 ? WEAR_ARMOR_EXTRA : 0)) * player.wearRate;
    const hitCtx = {
      weapon: player.weaponName,
      dmg,
      soakNote: soakNote(soak, 'armour'),
    };
    log.push({
      round,
      side: 'player',
      tone: 'good',
      text: combatLine(playerOutcomeKey(crit ? 'crit' : 'hit', false), hitCtx),
    });
    if (stance.ignoresArmor && zombie.armor > 0) {
      log.push({
        round,
        side: 'player',
        tone: 'player',
        text: combatLine('playerPierce'),
      });
    }
  } else {
    weaponWear = WEAR_ON_MISS * player.wearRate;
    log.push({
      round,
      side: 'player',
      tone: 'info',
      text: combatLine(playerOutcomeKey('miss', false), {
        weapon: player.weaponName,
      }),
    });
  }

  if (dangerNoise > 0) {
    log.push({
      round,
      tone: 'bad',
      text: combatLine('gunshotEcho', { place: terrain.name.toLowerCase() }),
    });
  }

  const oh = player.offHand;
  if (oh && zombieHp > 0) {
    const followChance = 0.35 + (player.dexterity - 5) * 0.02;
    if (rng.chance(followChance)) {
      const ohAtkMod =
        player.attack -
        player.weaponAccuracy +
        oh.accuracy -
        2 +
        envAccuracy +
        stance.attackMod +
        terrainAccuracyMelee(terrain) +
        energyAttackBonus(energy) +
        vsUndead;
      const ohRoll = rng.d20();
      const ohTotal = ohRoll + ohAtkMod;
      log.push({
        round,
        side: 'player',
        tone: 'roll',
        text: `Off-hand · ${oh.name} (d20 ${ohRoll}${fmt(ohAtkMod)} = ${ohTotal} vs ${pTarget})`,
      });
      if (ohRoll === 20 || ohTotal >= pTarget) {
        hit = true;
        let ohDmg = Math.round(oh.damage * 0.6) + Math.floor(player.strength / 2) + rng.int(0, 3);
        const ohSoak = stance.ignoresArmor ? 0 : zombie.armor;
        ohDmg = Math.max(1, ohDmg - ohSoak);
        damageDealt += ohDmg;
        zombieHp -= ohDmg;
        offHandWear = (WEAR_ON_HIT + (zombie.armor > 0 ? WEAR_ARMOR_EXTRA : 0)) * oh.wearRate;
        log.push({
          round,
          side: 'player',
          tone: 'good',
          text: combatLine('playerOffHandHit', {
            weapon: oh.name,
            dmg: ohDmg,
            soakNote: soakNote(ohSoak, 'armour'),
          }),
        });
      } else {
        offHandWear = WEAR_ON_MISS * oh.wearRate;
        log.push({
          round,
          side: 'player',
          tone: 'info',
          text: combatLine('playerOffHandMiss', { weapon: oh.name }),
        });
      }
    }
  }

  if (zombieHp <= 0) {
    log.push({
      round,
      side: 'player',
      tone: 'good',
      text: combatLine('playerKill', { enemy: zombie.name }),
    });
  }

  return {
    zombieHpAfter: Math.max(0, zombieHp),
    log,
    zombieDead: zombieHp <= 0,
    hit,
    critical: hit && crit,
    damageDealt,
    timeCostHours: stance.timeCostHours,
    dangerNoise,
    weaponWear,
    offHandWear,
    roundsSpent,
  };
}

export interface FireActionResult extends Omit<PlayerActionResult, 'offHandWear'> {
  offHandWear: 0;
  applyGunshotDanger: boolean;
  gunshotIntensity: number;
}

/** One shot from a holstered firearm — separate from the melee initiative track. */
export function resolvePlayerFireAction(
  rng: Rng,
  gunDefId: string,
  gunDamage: number,
  gunAccuracy: number,
  gunWearRate: number,
  enemy: Enemy,
  weather: WeatherState,
  round: number,
  terrain: TerrainModifier,
  context: CombatContext,
  energy = 50,
  traitAttack = 0,
  envAccuracyExtra = 0,
  zombieAttackMod = 0,
): FireActionResult {
  const env = environmentCombatMods(weather);
  let envAccuracy = env.playerAccuracy + envAccuracyExtra;
  const log: CombatLogEntry[] = [];
  let zombieHp = enemy.hp;
  let weaponWear = 0;
  let hit = false;
  let damageDealt = 0;

  const pAtkMod =
    gunAccuracy +
    2 +
    traitAttack +
    envAccuracy +
    fireAccuracyMod(enemy, terrain) +
    energyAttackBonus(energy) +
    (enemy.kind === 'zombie' ? zombieAttackMod : 0);
  const pRoll = rng.d20();
  const pTotal = pRoll + pAtkMod;
  const pTarget = 10 + enemy.defense;
  const crit = pRoll >= 17;
  const weaponName = itemDef(gunDefId).name;

  log.push({
    round,
    side: 'player',
    tone: 'roll',
    text: `You fire · ${weaponName} (d20 ${pRoll}${fmt(pAtkMod)} = ${pTotal} vs ${pTarget})`,
  });

  if (crit || pTotal >= pTarget) {
    hit = true;
    let dmg = gunDamage + rng.int(0, 3);
    if (crit) dmg = Math.round(dmg * 1.75);
    if (enemy.kind === 'human' && enemy.armor > 0) dmg += 1;
    const soak = enemy.armor;
    dmg = Math.max(1, dmg - soak);
    damageDealt = dmg;
    zombieHp -= dmg;
    weaponWear = (WEAR_ON_HIT + (enemy.armor > 0 ? WEAR_ARMOR_EXTRA : 0)) * gunWearRate * 0.5;
    log.push({
      round,
      side: 'player',
      tone: 'good',
      text: combatLine(playerOutcomeKey(crit ? 'crit' : 'hit', true), {
        weapon: weaponName,
        dmg,
        soakNote: soakNote(soak, 'armour'),
      }),
    });
  } else {
    weaponWear = WEAR_ON_MISS * gunWearRate * 0.5;
    log.push({
      round,
      side: 'player',
      tone: 'info',
      text: combatLine(playerOutcomeKey('miss', true), { weapon: weaponName }),
    });
  }

  const applyGunshotDanger = gunshotDangerApplies(context, terrain.id);
  const gunshotIntensity = applyGunshotDanger ? gunshotNoiseIntensity(gunDefId) : 0;
  if (applyGunshotDanger) {
    log.push({
      round,
      tone: 'bad',
      text: combatLine('gunshotEcho', { place: terrain.name.toLowerCase() }),
    });
  }

  if (zombieHp <= 0) {
    log.push({
      round,
      side: 'player',
      tone: 'good',
      text: combatLine('playerKill', { enemy: enemy.name }),
    });
  }

  return {
    zombieHpAfter: Math.max(0, zombieHp),
    log,
    zombieDead: zombieHp <= 0,
    hit,
    critical: hit && crit,
    damageDealt,
    timeCostHours: 0.05,
    dangerNoise: gunshotIntensity,
    weaponWear,
    offHandWear: 0,
    roundsSpent: 1,
    applyGunshotDanger,
    gunshotIntensity,
  };
}

/** Gauge speed while reloading — uses weapon reload profile. */
export function playerReloadSpeed(
  attrs: Attributes,
  stance: StanceDef,
  gunDefId: string,
  energy = 50,
  legFactor = 1,
  equipSpeed = 0,
  loadSpeedMult = 1,
): number {
  const gunDef = itemDef(gunDefId);
  const factor = reloadSpeedFor(gunDef);
  return playerSpeed(attrs, stance, energy, legFactor, equipSpeed, factor, loadSpeedMult);
}

/**
 * One swing from the enemy, fired when *their* marker lands. A fast enemy can
 * reach this twice before the player's marker gets home once — which is the
 * whole point of the track.
 */
export function resolveEnemyAction(
  rng: Rng,
  player: PlayerCombatStats,
  zombie: Zombie,
  weather: WeatherState,
  round: number,
  stance: StanceDef,
  terrain: TerrainModifier,
  energy = 50,
  attrs: Attributes,
  traitIds: string[],
  equipment: Equipment,
  bodyParts: BodyParts,
  loadDodgeMod = 0,
): EnemyActionResult {
  const env = environmentCombatMods(weather);
  const log: CombatLogEntry[] = [];
  let playerDamage = 0;
  let infectionGain = 0;
  let armorWear = 0;
  let dodged = false;
  let blocked = false;
  let hitZone: BodyPartId | null = null;
  /** Zone a turned blow scuffed — wear only, no damage and no hit. */
  let deflectZone: BodyPartId | null = null;
  let critical = false;
  const defense = effectiveDefense(player, stance, terrain);

  const headMods = [equipment.head ? itemDef(equipment.head.defId).modifiers : undefined];
  const headWeightScale = 1 - headTargetReductionFromGear(headMods);
  const headCritReduce = headCritReductionFromGear(headMods);

  const zRoll = rng.d20();
  const zTotal = zRoll + zombie.attack + env.zombieAttack;
  const ek = enemyKeys(zombie.kind);
  const rollVerb = combatLine(ek.roll, { enemy: zombie.name });
  log.push({
    round,
    side: 'enemy',
    tone: 'roll',
    text: `${rollVerb} (d20 ${zRoll}${fmt(zombie.attack + env.zombieAttack)} = ${zTotal} vs ${defense})`,
  });
  if (zRoll === 20 || zTotal >= defense) {
    const dodgeChance = playerDodgeChance(
      attrs,
      traitIds,
      equipment,
      energy,
      bodyParts,
      stance,
      terrain,
      loadDodgeMod,
    );
    if (dodgeChance > 0 && rng.chance(dodgeChance)) {
      dodged = true;
      log.push({
        round,
        side: 'enemy',
        tone: 'player',
        text: combatLine('enemyDodge'),
      });
    } else {
      let dmg = zombie.damage + rng.int(0, 3);
      const forceHead = zRoll === 20;
      hitZone = forceHead ? 'head' : rollHitZone(rng.fork('zone'), headWeightScale);
      critical = hitZone === 'head';
      const ohInst = equipment.offHand;
      const blockChance =
        ohInst && offHandRole(equipment) === 'shield' ? armorScaledMod(ohInst, 'blockChance') : 0;
      if (ohInst && blockChance > 0 && rng.chance(blockChance)) {
        blocked = true;
        playerDamage = 0;
        armorWear = (0.5 + dmg * 0.15) * 2;
        log.push({
          round,
          side: 'enemy',
          tone: 'player',
          text: combatLine('enemyBlocked', { weapon: itemDef(ohInst.defId).name }),
        });
      } else {
        const soak = limbArmorForZone(equipment, hitZone);
        if (soak > 0) dmg = Math.max(1, dmg - soak);
        playerDamage += dmg;
        armorWear = 0.5 + dmg * 0.15;
        const zoneLabel = BODY_PART_LABEL[hitZone].toLowerCase();
        log.push({
          round,
          side: 'enemy',
          tone: 'bad',
          text: combatLine(critical ? ek.crit : ek.hit, {
            zone: zoneLabel,
            dmg: playerDamage,
            soakNote: soakNote(soak, 'gear'),
          }),
        });
        const infChance = zombie.infectious * (1 - player.infectionResist);
        if (rng.chance(infChance)) {
          const inf = rng.int(8, 18);
          infectionGain += inf;
          log.push({
            round,
            side: 'enemy',
            tone: 'bad',
            text: combatLine('enemyBite', { inf }),
          });
        }
      }
    }
  } else {
    // The blow that armour turned is the blow that wears it. If this swing
    // would have landed on the same survivor without their kit, the kit is what
    // stopped it — and it takes a scuff for the trouble. Without this, gear got
    // *cheaper* to own the better it was, because good gear is never hit.
    //
    // The scuff lands on a rolled zone like a real hit would, so the piece that
    // did the work pays for it. Charging every slot in full instead made a full
    // riot kit wear out faster than a leather jacket — five pieces each paying
    // the price of one — which is precisely the wrong incentive.
    if (zTotal >= defense - player.gearDefense) {
      armorWear = WEAR_ON_DEFLECT;
      deflectZone = rollHitZone(rng.fork('deflect'), headWeightScale);
    }
    log.push({
      round,
      side: 'enemy',
      tone: 'player',
      text: combatLine(ek.miss),
    });
  }

  const wearZone = hitZone ?? deflectZone;
  const wearSlot = blocked
    ? 'offHand'
    : wearZone
      ? (slotForZone(wearZone) ?? 'body')
      : null;
  const statusResist = hitZone ? statusResistForZone(equipment, hitZone) : 0;

  return {
    playerDamage,
    infectionGain,
    log,
    limbDamageMult: stance.limbDamageMult,
    armorWear,
    wearSlot,
    dodged,
    blocked,
    hitZone,
    critical,
    headCritReduction: headCritReduce,
    statusResist,
  };
}

/** Scene-setting lines pushed once, when the first marker starts moving. */
export function openingNotes(terrain: TerrainModifier, weather: WeatherState): CombatLogEntry[] {
  const env = environmentCombatMods(weather);
  const out: CombatLogEntry[] = [{ round: 0, tone: 'info', text: `Ground: ${terrain.name}.` }];
  if (env.note) out.push({ round: 0, tone: 'info', text: `Conditions: ${env.note}.` });
  return out;
}

export interface FleeResult {
  success: boolean;
  playerDamage: number;
  log: CombatLogEntry[];
  limbDamageMult: number;
}

/** Attempt to flee. Failure lets the zombie get a parting hit. */
export function attemptFlee(
  rng: Rng,
  attrs: Attributes,
  player: PlayerCombatStats,
  zombie: Zombie,
  round: number,
  stance: StanceDef,
  terrain: TerrainModifier,
  energy = 50,
  loadFleeDcMod = 0,
): FleeResult {
  const log: CombatLogEntry[] = [];
  let playerDamage = 0;

  // Disengage trades a free swing for a much easier break.
  if (stance.opportunityAttack) {
    const oRoll = rng.d20();
    const oTotal = oRoll + zombie.attack + stance.opportunityAccuracy;
    const defense = effectiveDefense(player, stance, terrain);
    log.push({
      round,
      side: 'enemy',
      tone: 'roll',
      text: `Opportunity attack (d20 ${oRoll}${fmt(zombie.attack + stance.opportunityAccuracy)} = ${oTotal} vs ${defense})`,
    });
    if (oRoll === 20 || oTotal >= defense) {
      const dmg = zombie.damage + rng.int(0, 2);
      playerDamage += dmg;
      log.push({
        round,
        side: 'enemy',
        tone: 'bad',
        text: combatLine('oppHit', { dmg }),
      });
    } else {
      log.push({
        round,
        side: 'enemy',
        tone: 'player',
        text: combatLine('oppMiss'),
      });
    }
  }

  const roll = rng.d20();
  const total = roll + Math.floor((attrs.dexterity + attrs.perception) / 2);
  const target =
    12 + zombie.attack + terrain.fleeDcMod + stance.fleeDcMod + energyFleeDcModifier(energy) + loadFleeDcMod;
  log.push({
    round,
    side: 'player',
    tone: 'roll',
    text: `Flee check (d20 ${roll} = ${total} vs ${target})`,
  });
  if (roll === 20 || total >= target) {
    log.push({
      round,
      side: 'player',
      tone: 'good',
      text: combatLine('fleeOk'),
    });
    return { success: true, playerDamage, log, limbDamageMult: stance.limbDamageMult };
  }
  const dmg = zombie.damage + rng.int(0, 2);
  playerDamage += dmg;
  log.push({
    round,
    side: 'player',
    tone: 'bad',
    text: combatLine('fleeFail', { enemy: zombie.name, dmg }),
  });
  return { success: false, playerDamage, log, limbDamageMult: stance.limbDamageMult };
}

function fmt(n: number): string {
  if (n === 0) return '';
  return n > 0 ? `+${n}` : `${n}`;
}
