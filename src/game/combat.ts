import type {
  Attributes,
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
  Zombie,
} from './types';
import type { Rng } from './rng';
import { environmentCombatMods } from './weather';
import { itemDef } from './loot';
import { hasTraitFlag, sumTraitMod } from './character';
import { effectiveDamage, equipAccuracyBonus, equipDefenseBonus, isBroken, limbArmorForZone, slotForZone, statusResistForZone, ALL_EQUIP_SLOTS } from './inventory';
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
  ENEMIES,
  rollElite,
  rollHuman,
  rollLoner,
  rollZombie,
  type LonerKind,
} from './enemies';

export type { LonerKind } from './enemies';

const EQUIP_SLOTS = ALL_EQUIP_SLOTS;

export interface PlayerCombatStats {
  attack: number; // added to d20 attack roll
  defense: number; // target number enemies must beat
  damage: number; // damage on a hit
  infectionResist: number; // 0..1
  weaponName: string;
  ranged: boolean;
  /** A firearm being swung as a club because there are no rounds left. */
  dry?: boolean;
  /** Rounds one shot burns; 0 for anything that isn't currently a firearm. */
  roundsPerShot: number;
  /** The equipped weapon's `wearRate` — see ItemDef. 1 when unarmed. */
  wearRate: number;
  /** Ignore night/dusk accuracy penalties from the environment. */
  nightAccuracyPenaltyRemoved: boolean;
  /** Extra accuracy at night/dusk (negative = worse). */
  nightAccuracyExtra: number;
  /** Attack delta applied only vs undead. */
  zombieAttackMod: number;
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
export function makeBlockHunter(rng: Rng, danger: number): Enemy {
  return rollElite(ENEMIES, rng, ENEMIES.spawn.eliteBindings.hdb, danger, 'hunter');
}

/** Pinned tunnel pressure — only reachable via the elite binding, not danger tiers. */
export function makeTunnelStalker(rng: Rng, danger: number): Enemy {
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

/** Derive the player's combat stats from attributes, traits and equipped gear.
 *  `armPenalty` reflects injured arms lowering accuracy. */
export function playerCombatStats(
  attrs: Attributes,
  traitIds: string[],
  equipment: Equipment,
  armPenalty = 0,
  rounds = Infinity,
): PlayerCombatStats {
  const mainHand = equipment.mainHand;
  // A weapon worn through to nothing is a lump of metal — it stops counting as
  // a weapon entirely rather than quietly dealing reduced damage forever.
  const usableWeapon = mainHand && !isBroken(mainHand) ? mainHand : null;
  const weaponDef = usableWeapon ? itemDef(usableWeapon.defId) : null;
  const rawEffect = weaponDef && weaponDef.effect.kind === 'weapon' ? weaponDef.effect : null;

  // Out of ammo: the gun is still the best club you own. It keeps its weight
  // and its slot, loses its range, its accuracy and most of its damage — which
  // is what makes a box of ammo worth carrying rather than worth selling.
  const perShot = rawEffect?.ranged ? (rawEffect.roundsPerShot ?? 1) : 0;
  const dry = rawEffect?.ranged === true && rounds < perShot;
  const w = rawEffect && dry ? { ...rawEffect, accuracy: 0, ranged: false } : rawEffect;

  let atkBonus = sumTraitMod(traitIds, 'attackMod');
  let defBonus = sumTraitMod(traitIds, 'defenseMod');
  for (const slot of EQUIP_SLOTS) {
    const inst = equipment[slot];
    if (!inst) continue;
    const mods = itemDef(inst.defId).modifiers;
    atkBonus += mods?.attackBonus ?? 0;
    defBonus += equipDefenseBonus(inst);
  }
  atkBonus += equipAccuracyBonus(equipment);

  const attack = attrs.dexterity + (w?.accuracy ?? 0) + atkBonus - armPenalty;
  const defense = 10 + Math.floor(attrs.dexterity / 2) + defBonus;
  let baseDamage = usableWeapon && w ? effectiveDamage(usableWeapon) : 4; // unarmed
  if (dry) baseDamage = Math.max(4, Math.round(baseDamage * 0.28));
  const damage = baseDamage + Math.floor(attrs.strength / 2);
  const infectionResist = sumTraitMod(traitIds, 'infectionResist');
  const brokenName = mainHand && isBroken(mainHand) ? itemDef(mainHand.defId).name : null;
  const weaponName = weaponDef
    ? dry
      ? `${weaponDef.name} (empty)`
      : weaponDef.name
    : brokenName
      ? `Fists (${brokenName} broken)`
      : 'Fists';
  return {
    attack,
    defense,
    damage,
    infectionResist: Math.min(1, Math.max(-0.5, infectionResist)),
    weaponName,
    ranged: w?.ranged ?? false,
    dry,
    roundsPerShot: dry ? 0 : perShot,
    wearRate: weaponDef?.wearRate ?? 1,
    nightAccuracyPenaltyRemoved: hasTraitFlag(traitIds, 'nightAccuracyPenaltyRemoved'),
    nightAccuracyExtra: sumTraitMod(traitIds, 'nightAccuracyExtra'),
    zombieAttackMod: sumTraitMod(traitIds, 'zombieAttackMod'),
  };
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

/**
 * How fast the player's marker crawls. Dexterity is the bulk of it; the stance
 * is the part you actually chose, and a mauled leg or an empty tank is the part
 * the run chose for you.
 */
export function playerSpeed(
  attrs: Attributes,
  stance: StanceDef,
  energy = 50,
  legFactor = 1,
  equipSpeed = 0,
): number {
  const energyMod = energy < 20 ? -2 : energy < 45 ? -1 : 0;
  const base = 6 + attrs.dexterity * 0.8 + stance.speedMod + energyMod + equipSpeed;
  return Math.max(2, base * Math.max(0.4, legFactor));
}

/** Seconds of track time one action costs at the given speed. */
export function secondsPerAction(speed: number): number {
  return GAUGE_FULL / Math.max(0.1, speed);
}

export interface PlayerActionResult {
  zombieHpAfter: number;
  log: CombatLogEntry[];
  zombieDead: boolean;
  /** In-game hours the swing burned beyond the usual scuffle. */
  timeCostHours: number;
  /** Extra local danger from noise (gunfire in echoing terrain). */
  dangerNoise: number;
  /** Condition the main-hand weapon lost. */
  weaponWear: number;
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
): number {
  const dexBase = (attrs.dexterity - 5) * 0.02;
  let gearDodge = 0;
  for (const slot of EQUIP_SLOTS) {
    const inst = equipment[slot];
    if (!inst) continue;
    gearDodge += itemDef(inst.defId).modifiers?.dodgeBonus ?? 0;
  }
  const traitDodge = sumTraitMod(traitIds, 'dodgeMod');
  const legFactor = legTravelFactor(parts);
  const legPenalty = (legFactor - 1) * 0.1;
  const raw =
    dexBase +
    traitDodge +
    gearDodge +
    stance.dodgeMod +
    terrain.dodgeMod +
    energyDodgeBonus(energy) +
    legPenalty;
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
function terrainAccuracy(player: PlayerCombatStats, terrain: TerrainModifier): number {
  return player.ranged ? terrain.rangedAccuracyMod : terrain.meleeAccuracyMod;
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
  const dangerNoise = player.ranged ? terrain.gunshotDangerMod : 0;
  // A shot leaves the barrel every time you fight with a loaded firearm —
  // there is no "aiming" turn that costs nothing.
  const roundsSpent = player.ranged ? player.roundsPerShot : 0;
  // Swinging costs the weapon something whether or not it connects; landing on
  // armour costs it more.
  let weaponWear = 0;

  const vsUndead = zombie.kind !== 'human' ? player.zombieAttackMod : 0;
  const pAtkMod =
    player.attack +
    envAccuracy +
    stance.attackMod +
    terrainAccuracy(player, terrain) +
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
    let dmg = player.damage + stance.damageMod + rng.int(0, 3);
    if (crit) dmg = Math.round(dmg * 1.75);
    const soak = stance.ignoresArmor ? 0 : zombie.armor;
    dmg = Math.max(1, dmg - soak);
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
      text: combatLine(playerOutcomeKey(crit ? 'crit' : 'hit', player.ranged), hitCtx),
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
      text: combatLine(playerOutcomeKey('miss', player.ranged), {
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
    timeCostHours: stance.timeCostHours,
    dangerNoise,
    weaponWear,
    roundsSpent,
  };
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
): EnemyActionResult {
  const env = environmentCombatMods(weather);
  const log: CombatLogEntry[] = [];
  let playerDamage = 0;
  let infectionGain = 0;
  let armorWear = 0;
  let dodged = false;
  let hitZone: BodyPartId | null = null;
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
    const dodgeChance = playerDodgeChance(attrs, traitIds, equipment, energy, bodyParts, stance, terrain);
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
  } else {
    log.push({
      round,
      side: 'enemy',
      tone: 'player',
      text: combatLine(ek.miss),
    });
  }

  const wearSlot = hitZone ? (slotForZone(hitZone) ?? 'body') : null;
  const statusResist = hitZone ? statusResistForZone(equipment, hitZone) : 0;

  return {
    playerDamage,
    infectionGain,
    log,
    limbDamageMult: stance.limbDamageMult,
    armorWear,
    wearSlot,
    dodged,
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
    12 + zombie.attack + terrain.fleeDcMod + stance.fleeDcMod + energyFleeDcModifier(energy);
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
