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

const EQUIP_SLOTS: EquipSlot[] = ['head', 'body', 'mainHand', 'offHand'];

export interface PlayerCombatStats {
  attack: number; // added to d20 attack roll
  defense: number; // target number enemies must beat
  damage: number; // damage on a hit
  infectionResist: number; // 0..1
  weaponName: string;
  ranged: boolean;
}

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

const ZOMBIE_TYPES = [
  { name: 'Shambler', hp: 26, atk: 0, def: 0, dmg: 7, inf: 0.25, armor: 0 },
  { name: 'Walker', hp: 34, atk: 1, def: 1, dmg: 9, inf: 0.3, armor: 0 },
  { name: 'Runner', hp: 30, atk: 3, def: 2, dmg: 10, inf: 0.35, armor: 1 },
  { name: 'Lurcher', hp: 46, atk: 2, def: 1, dmg: 13, inf: 0.4, armor: 2 },
  { name: 'Brute', hp: 68, atk: 3, def: 2, dmg: 18, inf: 0.5, armor: 3 },
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
  };
}

/** Derive the player's combat stats from attributes, traits and equipped gear.
 *  `armPenalty` reflects injured arms lowering accuracy. */
export function playerCombatStats(
  attrs: Attributes,
  traitIds: string[],
  equipment: Equipment,
  armPenalty = 0,
): PlayerCombatStats {
  const weaponDef = equipment.mainHand ? itemDef(equipment.mainHand.defId) : null;
  const w = weaponDef && weaponDef.effect.kind === 'weapon' ? weaponDef.effect : null;

  let atkBonus = sumTraitMod(traitIds, 'attackMod');
  let defBonus = sumTraitMod(traitIds, 'defenseMod');
  for (const slot of EQUIP_SLOTS) {
    const inst = equipment[slot];
    if (!inst) continue;
    const mods = itemDef(inst.defId).modifiers;
    atkBonus += mods?.attackBonus ?? 0;
    defBonus += mods?.defenseBonus ?? 0;
  }

  const attack = attrs.dexterity + (w?.accuracy ?? 0) + atkBonus - armPenalty;
  const defense = 10 + Math.floor(attrs.dexterity / 2) + defBonus;
  const baseDamage = w ? w.damage : 4; // unarmed
  const damage = baseDamage + Math.floor(attrs.strength / 2);
  const infectionResist = sumTraitMod(traitIds, 'infectionResist');
  return {
    attack,
    defense,
    damage,
    infectionResist: Math.min(1, Math.max(0, infectionResist)),
    weaponName: weaponDef?.name ?? 'Fists',
    ranged: w?.ranged ?? false,
  };
}

export interface RoundResult {
  zombieHpAfter: number;
  playerDamage: number; // HP the player loses
  infectionGain: number; // infection points gained
  log: CombatLogEntry[];
  zombieDead: boolean;
  /** Multiplier the store applies to limb (body-part) damage. */
  limbDamageMult: number;
  /** In-game hours the round burned beyond the usual scuffle. */
  timeCostHours: number;
  /** Extra local danger from noise (gunfire in echoing terrain). */
  dangerNoise: number;
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
 * Resolve one full round: player strikes, then the zombie retaliates if alive.
 * Pure — returns deltas for the store to apply.
 */
export function resolveRound(
  rng: Rng,
  player: PlayerCombatStats,
  zombie: Zombie,
  weather: WeatherState,
  round: number,
  stance: StanceDef,
  terrain: TerrainModifier,
): RoundResult {
  const env = environmentCombatMods(weather);
  const log: CombatLogEntry[] = [];
  let zombieHp = zombie.hp;
  let playerDamage = 0;
  let infectionGain = 0;
  const defense = effectiveDefense(player, stance, terrain);
  const dangerNoise = player.ranged ? terrain.gunshotDangerMod : 0;

  // --- Player attack ---
  const pAtkMod = player.attack + env.playerAccuracy + stance.attackMod + terrainAccuracy(player, terrain);
  const pRoll = rng.d20();
  const pTotal = pRoll + pAtkMod;
  const pTarget = 10 + zombie.defense;
  // Precision widens the crit band (+15% ≈ crit on 17+).
  const critFloor = 20 - Math.round(stance.critChanceBonus * 20);
  const crit = pRoll >= critFloor;
  log.push({
    round,
    tone: 'roll',
    text: `You attack · ${stance.name} (d20 ${pRoll}${fmt(pAtkMod)} = ${pTotal} vs ${pTarget})`,
  });
  if (crit || pTotal >= pTarget) {
    let dmg = player.damage + stance.damageMod + rng.int(0, 3);
    if (crit) dmg = Math.round(dmg * 1.75);
    const soak = stance.ignoresArmor ? 0 : zombie.armor;
    dmg = Math.max(1, dmg - soak);
    zombieHp -= dmg;
    log.push({
      round,
      tone: 'good',
      text: crit
        ? `CRITICAL! ${player.weaponName} tears in for ${dmg} damage.`
        : `Hit! ${player.weaponName} deals ${dmg} damage.${
            soak > 0 ? ` (${soak} soaked by armour)` : ''
          }`,
    });
    if (stance.ignoresArmor && zombie.armor > 0) {
      log.push({ round, tone: 'player', text: `You slip the blow past its armour.` });
    }
  } else {
    log.push({ round, tone: 'info', text: `Miss — your ${player.weaponName} swings wide.` });
  }

  if (zombieHp <= 0) {
    log.push({ round, tone: 'good', text: `The ${zombie.name} drops. You survive the encounter.` });
    return {
      zombieHpAfter: 0,
      playerDamage,
      infectionGain,
      log,
      zombieDead: true,
      limbDamageMult: stance.limbDamageMult,
      timeCostHours: stance.timeCostHours,
      dangerNoise,
    };
  }

  // --- Zombie attack ---
  const zRoll = rng.d20();
  const zTotal = zRoll + zombie.attack + env.zombieAttack;
  log.push({
    round,
    tone: 'roll',
    text: `${zombie.name} lunges (d20 ${zRoll}${fmt(zombie.attack + env.zombieAttack)} = ${zTotal} vs ${defense})`,
  });
  if (zRoll === 20 || zTotal >= defense) {
    // Terrain footing gives a last chance to slip the blow.
    const dodgeChance = Math.max(0, Math.min(0.9, terrain.dodgeMod));
    if (dodgeChance > 0 && rng.chance(dodgeChance)) {
      log.push({ round, tone: 'player', text: `You twist clear — the ${terrain.name} gives you room.` });
    } else {
      const dmg = zombie.damage + rng.int(0, 3);
      playerDamage += dmg;
      log.push({ round, tone: 'bad', text: `It rakes you for ${dmg} damage.` });
      // infection check on a connecting hit
      const infChance = zombie.infectious * (1 - player.infectionResist);
      if (rng.chance(infChance)) {
        const inf = rng.int(8, 18);
        infectionGain += inf;
        log.push({ round, tone: 'bad', text: `A bite breaks skin — infection +${inf}.` });
      }
    }
  } else {
    log.push({ round, tone: 'player', text: `You dodge its grasp.` });
  }

  if (round === 1) {
    log.push({ round, tone: 'info', text: `Ground: ${terrain.name}.` });
    if (env.note) log.push({ round, tone: 'info', text: `Conditions: ${env.note}.` });
  }
  if (dangerNoise > 0) {
    log.push({ round, tone: 'bad', text: `The gunshot rings down the ${terrain.name.toLowerCase()}.` });
  }

  return {
    zombieHpAfter: zombieHp,
    playerDamage,
    infectionGain,
    log,
    zombieDead: false,
    limbDamageMult: stance.limbDamageMult,
    timeCostHours: stance.timeCostHours,
    dangerNoise,
  };
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
      tone: 'roll',
      text: `Opportunity attack (d20 ${oRoll}${fmt(zombie.attack + stance.opportunityAccuracy)} = ${oTotal} vs ${defense})`,
    });
    if (oRoll === 20 || oTotal >= defense) {
      const dmg = zombie.damage + rng.int(0, 2);
      playerDamage += dmg;
      log.push({ round, tone: 'bad', text: `It catches you on the way out for ${dmg}.` });
    } else {
      log.push({ round, tone: 'player', text: `Its parting swing goes wide.` });
    }
  }

  const roll = rng.d20();
  const total = roll + Math.floor((attrs.dexterity + attrs.perception) / 2);
  const target = 12 + zombie.attack + terrain.fleeDcMod + stance.fleeDcMod;
  log.push({ round, tone: 'roll', text: `Flee check (d20 ${roll} = ${total} vs ${target})` });
  if (roll === 20 || total >= target) {
    log.push({ round, tone: 'good', text: `You break away and escape into the streets.` });
    return { success: true, playerDamage, log, limbDamageMult: stance.limbDamageMult };
  }
  const dmg = zombie.damage + rng.int(0, 2);
  playerDamage += dmg;
  log.push({ round, tone: 'bad', text: `You stumble — the ${zombie.name} catches you for ${dmg}.` });
  return { success: false, playerDamage, log, limbDamageMult: stance.limbDamageMult };
}

function fmt(n: number): string {
  if (n === 0) return '';
  return n > 0 ? `+${n}` : `${n}`;
}
