import type {
  Attributes,
  CombatLogEntry,
  Enemy,
  Equipment,
  EquipSlot,
  FactionId,
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
import { sumTraitMod } from './character';
import { effectiveDamage, equipDefenseBonus, isBroken } from './inventory';
import { energyAttackBonus, energyDodgeBonus, energyFleeDcModifier } from './survival';

const EQUIP_SLOTS: EquipSlot[] = ['head', 'body', 'mainHand', 'offHand'];

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
    description: 'All forward pressure. +2 to hit, +2 damage, −3 defence.',
    attackMod: 2,
    damageMod: 2,
    defenseMod: -3,
    limbDamageMult: 1,
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
    description: 'Cover up. +3 defence, −2 to hit, limb damage taken ×0.75.',
    attackMod: -2,
    damageMod: 0,
    defenseMod: 3,
    limbDamageMult: 0.75,
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
    critChanceBonus: 0,
    ignoresArmor: false,
    timeCostHours: 0,
    speedMod: 0,
    fleeDcMod: -4,
    opportunityAttack: true,
    opportunityAccuracy: -2,
  },
};

export const STANCE_ORDER: StanceId[] = ['aggressive', 'guarded', 'precision', 'disengage'];

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
    case 'hardware':
      return TERRAIN.supermarket_aisle;
    case 'mrt':
      return TERRAIN.mrt_concourse;
    default:
      return TERRAIN.open_ground;
  }
}

/**
 * `spd` is what the archetype reads as on the initiative track, and it is the
 * lever that makes two enemies with similar numbers feel nothing alike: a Brute
 * hits for 18 but only gets there once in the time a Runner lands two.
 */
const ZOMBIE_TYPES = [
  { name: 'Shambler', hp: 26, atk: 0, def: 0, dmg: 7, inf: 0.25, armor: 0, spd: 5 },
  { name: 'Walker', hp: 34, atk: 1, def: 1, dmg: 9, inf: 0.3, armor: 0, spd: 7 },
  { name: 'Runner', hp: 30, atk: 3, def: 2, dmg: 10, inf: 0.35, armor: 1, spd: 13 },
  { name: 'Lurcher', hp: 46, atk: 2, def: 1, dmg: 13, inf: 0.4, armor: 2, spd: 7 },
  { name: 'Brute', hp: 68, atk: 3, def: 2, dmg: 18, inf: 0.5, armor: 3, spd: 6 },
];

/** Build a zombie scaled to the location's danger (1..5). */
export function makeZombie(rng: Rng, danger: number, _category?: PoiCategory): Enemy {
  const tierRng = rng.fork('zombie');
  // danger biases which archetype shows up
  const idx = Math.max(0, Math.min(ZOMBIE_TYPES.length - 1, danger - 1 + tierRng.int(-1, 0)));
  const t = ZOMBIE_TYPES[idx];
  const hp = t.hp + tierRng.int(-4, 6);
  return {
    name: t.name,
    kind: 'zombie',
    hp,
    maxHp: hp,
    attack: t.atk,
    defense: t.def,
    damage: t.dmg,
    infectious: t.inf,
    armor: t.armor,
    speed: t.spd,
  };
}

/**
 * Deliberately kept out of ZOMBIE_TYPES: no ordinary danger roll can ever
 * reach it. This is only what a block sends once its heat is pinned.
 */
const BLOCK_HUNTER = {
  name: 'Corridor Hulk',
  hp: 110,
  atk: 5,
  def: 3,
  dmg: 26,
  inf: 0.6,
  armor: 5,
  spd: 7,
};

/** The thing a maxed-out block sends down the corridor after you. */
export function makeBlockHunter(rng: Rng, danger: number): Enemy {
  const r = rng.fork('hunter');
  const hp = BLOCK_HUNTER.hp + danger * 4 + r.int(-6, 8);
  return {
    name: BLOCK_HUNTER.name,
    kind: 'zombie',
    hp,
    maxHp: hp,
    attack: BLOCK_HUNTER.atk,
    defense: BLOCK_HUNTER.def,
    damage: BLOCK_HUNTER.dmg,
    infectious: BLOCK_HUNTER.inf,
    armor: BLOCK_HUNTER.armor,
    speed: BLOCK_HUNTER.spd,
  };
}

/**
 * The other end of the same idea, for tunnels: unreachable by any danger roll,
 * and only ever what a bore sends once the pressure gauge is pinned. Faster and
 * meaner than the block hulk, and less armoured — it has been running the
 * tunnels a long time.
 */
const TUNNEL_STALKER = {
  name: 'Tunnel Stalker',
  hp: 92,
  atk: 7,
  def: 4,
  dmg: 22,
  inf: 0.5,
  armor: 2,
  spd: 15,
};

export function makeTunnelStalker(rng: Rng, danger: number): Enemy {
  const r = rng.fork('stalker');
  const hp = TUNNEL_STALKER.hp + danger * 5 + r.int(-8, 8);
  return {
    name: TUNNEL_STALKER.name,
    kind: 'zombie',
    hp,
    maxHp: hp,
    attack: TUNNEL_STALKER.atk,
    defense: TUNNEL_STALKER.def,
    damage: TUNNEL_STALKER.dmg,
    infectious: TUNNEL_STALKER.inf,
    armor: TUNNEL_STALKER.armor,
    speed: TUNNEL_STALKER.spd,
  };
}

const HUMAN_NAMES: Record<Exclude<FactionId, null>, string> = {
  syndicate_88: '88 Syndicate Runner',
  idtf: 'IDTF Deserter',
  pasir_panjang: 'Co-op Enforcer',
  sta: 'STA Tunnel Marshal',
};

const HUMAN_ARMOR: Record<Exclude<FactionId, null>, number> = {
  syndicate_88: 1,
  idtf: 4,
  pasir_panjang: 1,
  sta: 2,
};

/**
 * Build a human enemy scaled to danger. Humans don't infect (infectious: 0)
 * but hit harder and defend better than a comparable zombie.
 */
export function makeHuman(rng: Rng, faction: Exclude<FactionId, null>, danger: number): Enemy {
  const r = rng.fork('human');
  const hp = 30 + danger * 6 + r.int(-4, 8);
  return {
    name: HUMAN_NAMES[faction],
    kind: 'human',
    hp,
    maxHp: hp,
    attack: 1 + Math.floor(danger / 2) + r.int(0, 1),
    defense: 1 + Math.floor(danger / 2),
    damage: 8 + danger * 2 + r.int(0, 3),
    infectious: 0,
    armor: HUMAN_ARMOR[faction],
    // People move like people — heavier kit costs them a little of it.
    speed: 11 - HUMAN_ARMOR[faction],
  };
}

/**
 * Not everyone who fights you belongs to somebody. A doorway argument with a
 * scavenger or a starving stranger is its own thing — no colours, no armour,
 * and no organisation to answer to afterwards. They hit softer than a faction
 * runner because they are not soldiers; they're just in your way, or you're
 * in theirs.
 */
const LONER_NAMES = {
  scavenger: 'Rival Scavenger',
  survivor: 'Desperate Survivor',
} as const;

export type LonerKind = keyof typeof LONER_NAMES;

export function makeLoner(rng: Rng, kind: LonerKind, danger: number): Enemy {
  const r = rng.fork('loner');
  // The scavenger came equipped and fed; the survivor came because they had to.
  const tough = kind === 'scavenger';
  const hp = (tough ? 26 : 18) + danger * 4 + r.int(-3, 6);
  return {
    name: LONER_NAMES[kind],
    kind: 'human',
    hp,
    maxHp: hp,
    attack: 1 + Math.floor(danger / 3) + (tough ? 1 : 0),
    defense: Math.floor(danger / 3),
    damage: (tough ? 7 : 5) + danger + r.int(0, 2),
    infectious: 0,
    armor: tough ? 1 : 0,
    // The starving one is quick because it is all they have left.
    speed: tough ? 10 : 11,
  };
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
    infectionResist: Math.min(1, Math.max(0, infectionResist)),
    weaponName,
    ranged: w?.ranged ?? false,
    dry,
    roundsPerShot: dry ? 0 : perShot,
    wearRate: weaponDef?.wearRate ?? 1,
  };
}

// ------------------------------------------------------- initiative track --
/**
 * The two markers race along one track; the first to the far end swings and is
 * sent back to the start. Gauge units are earned per real second, so a Speed of
 * 10 is one action a second at 1× — which is what the speed controls scale.
 */
export const GAUGE_FULL = 100;

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
): number {
  const energyMod = energy < 20 ? -2 : energy < 45 ? -1 : 0;
  const base = 6 + attrs.dexterity * 0.8 + stance.speedMod + energyMod;
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
  playerDamage: number; // HP the player loses
  infectionGain: number; // infection points gained
  log: CombatLogEntry[];
  /** Multiplier the store applies to limb (body-part) damage. */
  limbDamageMult: number;
  /** Condition each worn armour piece lost. */
  armorWear: number;
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
  const log: CombatLogEntry[] = [];
  let zombieHp = zombie.hp;
  const dangerNoise = player.ranged ? terrain.gunshotDangerMod : 0;
  // A shot leaves the barrel every time you fight with a loaded firearm —
  // there is no "aiming" turn that costs nothing.
  const roundsSpent = player.ranged ? player.roundsPerShot : 0;
  // Swinging costs the weapon something whether or not it connects; landing on
  // armour costs it more.
  let weaponWear = 0;

  const pAtkMod =
    player.attack +
    env.playerAccuracy +
    stance.attackMod +
    terrainAccuracy(player, terrain) +
    energyAttackBonus(energy);
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
    log.push({
      round,
      side: 'player',
      tone: 'good',
      text: crit
        ? `CRITICAL! ${player.weaponName} tears in for ${dmg} damage.`
        : `Hit! ${player.weaponName} deals ${dmg} damage.${
            soak > 0 ? ` (${soak} soaked by armour)` : ''
          }`,
    });
    if (stance.ignoresArmor && zombie.armor > 0) {
      log.push({ round, side: 'player', tone: 'player', text: `You slip the blow past its armour.` });
    }
  } else {
    weaponWear = WEAR_ON_MISS * player.wearRate;
    log.push({
      round,
      side: 'player',
      tone: 'info',
      text: `Miss — your ${player.weaponName} swings wide.`,
    });
  }

  if (dangerNoise > 0) {
    log.push({
      round,
      tone: 'bad',
      text: `The gunshot rings down the ${terrain.name.toLowerCase()}.`,
    });
  }

  if (zombieHp <= 0) {
    log.push({
      round,
      side: 'player',
      tone: 'good',
      text: `The ${zombie.name} drops. You survive the encounter.`,
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
): EnemyActionResult {
  const env = environmentCombatMods(weather);
  const log: CombatLogEntry[] = [];
  let playerDamage = 0;
  let infectionGain = 0;
  let armorWear = 0;
  const defense = effectiveDefense(player, stance, terrain);

  const zRoll = rng.d20();
  const zTotal = zRoll + zombie.attack + env.zombieAttack;
  log.push({
    round,
    side: 'enemy',
    tone: 'roll',
    text: `${zombie.name} lunges (d20 ${zRoll}${fmt(zombie.attack + env.zombieAttack)} = ${zTotal} vs ${defense})`,
  });
  if (zRoll === 20 || zTotal >= defense) {
    // Terrain footing — plus whatever reflexes you have left — gives a last
    // chance to slip the blow.
    const dodgeChance = Math.max(0, Math.min(0.9, terrain.dodgeMod + energyDodgeBonus(energy)));
    if (dodgeChance > 0 && rng.chance(dodgeChance)) {
      log.push({
        round,
        side: 'enemy',
        tone: 'player',
        text: `You twist clear — the ${terrain.name} gives you room.`,
      });
    } else {
      const dmg = zombie.damage + rng.int(0, 3);
      playerDamage += dmg;
      // What your armour turned aside, it paid for.
      armorWear = 0.5 + dmg * 0.15;
      log.push({ round, side: 'enemy', tone: 'bad', text: `It rakes you for ${dmg} damage.` });
      // infection check on a connecting hit
      const infChance = zombie.infectious * (1 - player.infectionResist);
      if (rng.chance(infChance)) {
        const inf = rng.int(8, 18);
        infectionGain += inf;
        log.push({
          round,
          side: 'enemy',
          tone: 'bad',
          text: `A bite breaks skin — infection +${inf}.`,
        });
      }
    }
  } else {
    log.push({ round, side: 'enemy', tone: 'player', text: `You dodge its grasp.` });
  }

  return { playerDamage, infectionGain, log, limbDamageMult: stance.limbDamageMult, armorWear };
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
        text: `It catches you on the way out for ${dmg}.`,
      });
    } else {
      log.push({ round, side: 'enemy', tone: 'player', text: `Its parting swing goes wide.` });
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
      text: `You break away and escape into the streets.`,
    });
    return { success: true, playerDamage, log, limbDamageMult: stance.limbDamageMult };
  }
  const dmg = zombie.damage + rng.int(0, 2);
  playerDamage += dmg;
  log.push({
    round,
    side: 'player',
    tone: 'bad',
    text: `You stumble — the ${zombie.name} catches you for ${dmg}.`,
  });
  return { success: false, playerDamage, log, limbDamageMult: stance.limbDamageMult };
}

function fmt(n: number): string {
  if (n === 0) return '';
  return n > 0 ? `+${n}` : `${n}`;
}
