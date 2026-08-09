import type {
  Attributes,
  CombatLogEntry,
  Enemy,
  Equipment,
  EquipSlot,
  FactionId,
  PoiCategory,
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

const ZOMBIE_TYPES = [
  { name: 'Shambler', hp: 26, atk: 0, def: 0, dmg: 7, inf: 0.25 },
  { name: 'Walker', hp: 34, atk: 1, def: 1, dmg: 9, inf: 0.3 },
  { name: 'Runner', hp: 30, atk: 3, def: 2, dmg: 10, inf: 0.35 },
  { name: 'Lurcher', hp: 46, atk: 2, def: 1, dmg: 13, inf: 0.4 },
  { name: 'Brute', hp: 68, atk: 3, def: 2, dmg: 18, inf: 0.5 },
];

/** Build a zombie scaled to the location's danger (1..5). */
export function makeZombie(rng: Rng, danger: number, _category: PoiCategory): Enemy {
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
  };
}

const HUMAN_NAMES: Record<Exclude<FactionId, null>, string> = {
  raiders: 'Void Deck Raider',
  saf: 'SAF Deserter',
  hawker: 'Hawker Enforcer',
  transit: 'Transit Marshal',
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
): RoundResult {
  const env = environmentCombatMods(weather);
  const log: CombatLogEntry[] = [];
  let zombieHp = zombie.hp;
  let playerDamage = 0;
  let infectionGain = 0;

  // --- Player attack ---
  const pRoll = rng.d20();
  const pTotal = pRoll + player.attack + env.playerAccuracy;
  const pTarget = 10 + zombie.defense;
  const crit = pRoll === 20;
  if (crit || pTotal >= pTarget) {
    let dmg = player.damage + rng.int(0, 3);
    if (crit) dmg = Math.round(dmg * 1.75);
    zombieHp -= dmg;
    log.push({
      round,
      tone: 'roll',
      text: `You attack (d20 ${pRoll}${fmt(player.attack + env.playerAccuracy)} = ${pTotal} vs ${pTarget})`,
    });
    log.push({
      round,
      tone: 'good',
      text: crit
        ? `CRITICAL! ${player.weaponName} tears in for ${dmg} damage.`
        : `Hit! ${player.weaponName} deals ${dmg} damage.`,
    });
  } else {
    log.push({
      round,
      tone: 'roll',
      text: `You attack (d20 ${pRoll}${fmt(player.attack + env.playerAccuracy)} = ${pTotal} vs ${pTarget})`,
    });
    log.push({ round, tone: 'info', text: `Miss — your ${player.weaponName} swings wide.` });
  }

  if (zombieHp <= 0) {
    log.push({ round, tone: 'good', text: `The ${zombie.name} drops. You survive the encounter.` });
    return { zombieHpAfter: 0, playerDamage, infectionGain, log, zombieDead: true };
  }

  // --- Zombie attack ---
  const zRoll = rng.d20();
  const zTotal = zRoll + zombie.attack + env.zombieAttack;
  if (zRoll === 20 || zTotal >= player.defense) {
    const dmg = zombie.damage + rng.int(0, 3);
    playerDamage += dmg;
    log.push({
      round,
      tone: 'roll',
      text: `${zombie.name} lunges (d20 ${zRoll}${fmt(zombie.attack + env.zombieAttack)} = ${zTotal} vs ${player.defense})`,
    });
    log.push({ round, tone: 'bad', text: `It rakes you for ${dmg} damage.` });
    // infection check on a connecting hit
    const infChance = zombie.infectious * (1 - player.infectionResist);
    if (rng.chance(infChance)) {
      const inf = rng.int(8, 18);
      infectionGain += inf;
      log.push({ round, tone: 'bad', text: `A bite breaks skin — infection +${inf}.` });
    }
  } else {
    log.push({
      round,
      tone: 'roll',
      text: `${zombie.name} lunges (d20 ${zRoll}${fmt(zombie.attack + env.zombieAttack)} = ${zTotal} vs ${player.defense})`,
    });
    log.push({ round, tone: 'player', text: `You dodge its grasp.` });
  }

  if (env.note && round === 1) {
    log.push({ round, tone: 'info', text: `Conditions: ${env.note}.` });
  }

  return { zombieHpAfter: zombieHp, playerDamage, infectionGain, log, zombieDead: false };
}

export interface FleeResult {
  success: boolean;
  playerDamage: number;
  log: CombatLogEntry[];
}

/** Attempt to flee. Failure lets the zombie get a parting hit. */
export function attemptFlee(
  rng: Rng,
  attrs: Attributes,
  player: PlayerCombatStats,
  zombie: Zombie,
  round: number,
): FleeResult {
  const roll = rng.d20();
  const total = roll + Math.floor((attrs.dexterity + attrs.perception) / 2);
  const target = 12 + zombie.attack;
  const log: CombatLogEntry[] = [];
  if (roll === 20 || total >= target) {
    log.push({ round, tone: 'roll', text: `Flee check (d20 ${roll} = ${total} vs ${target})` });
    log.push({ round, tone: 'good', text: `You break away and escape into the streets.` });
    return { success: true, playerDamage: 0, log };
  }
  const dmg = zombie.damage + rng.int(0, 2);
  log.push({ round, tone: 'roll', text: `Flee check (d20 ${roll} = ${total} vs ${target})` });
  log.push({ round, tone: 'bad', text: `You stumble — the ${zombie.name} catches you for ${dmg}.` });
  void player;
  return { success: false, playerDamage: dmg, log };
}

function fmt(n: number): string {
  if (n === 0) return '';
  return n > 0 ? `+${n}` : `${n}`;
}
