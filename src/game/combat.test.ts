import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  DODGE_ENERGY_COST,
  MAX_DODGE_CHANCE,
  playerDodgeChance,
  resolveEnemyAction,
  resolvePlayerAction,
  STANCES,
  TERRAIN,
  terrainForCategory,
  type PlayerCombatStats,
} from './combat';
import { emptyEquipment } from './inventory';
import { energyDodgeBonus, initialBodyParts } from './survival';
import type { Attributes, Zombie } from './types';

const BASE_PLAYER: PlayerCombatStats = {
  attack: 5,
  defense: 10,
  gearDefense: 0,
  damage: 8,
  infectionResist: 0,
  weaponName: 'Fists',
  ranged: false,
  roundsPerShot: 0,
  wearRate: 1,
  nightAccuracyPenaltyRemoved: false,
  nightAccuracyExtra: 0,
  zombieAttackMod: 0,
  speedFactor: 1,
  weaponAccuracy: 0,
  strength: 10,
  dexterity: 10,
  offHand: null,
};

const SHAMBLER: Zombie = {
  name: 'Shambler',
  kind: 'zombie',
  hp: 20,
  maxHp: 20,
  attack: 0,
  defense: 2,
  damage: 4,
  infectious: 0.1,
  armor: 0,
  speed: 5,
};

const CLEAR_WEATHER = { kind: 'clear' as const, time: 'day' as const };
const OPEN_TERRAIN = terrainForCategory('supermarket');

const ATTRS: Attributes = {
  strength: 5,
  dexterity: 12,
  endurance: 5,
  perception: 5,
  wits: 5,
};

describe('resolvePlayerAction', () => {
  it('golden-seed: deterministic hit outcome', () => {
    const rng = new Rng('COMBAT-GOLDEN-v1');
    const result = resolvePlayerAction(
      rng,
      BASE_PLAYER,
      SHAMBLER,
      CLEAR_WEATHER,
      1,
      STANCES.aggressive,
      OPEN_TERRAIN,
      80,
    );
    expect(result.hit).toBe(true);
    expect(result.critical).toBe(false);
    expect(result.damageDealt).toBe(13);
    expect(result.zombieHpAfter).toBe(7);
    expect(result.roundsSpent).toBe(0);
  });

  it('golden-seed: deterministic miss outcome', () => {
    const rng = new Rng('COMBAT-GOLDEN-MISS');
    const weak: PlayerCombatStats = { ...BASE_PLAYER, attack: -10, damage: 1 };
    const tough: Zombie = { ...SHAMBLER, defense: 15, armor: 5 };
    const result = resolvePlayerAction(
      rng,
      weak,
      tough,
      CLEAR_WEATHER,
      1,
      STANCES.guarded,
      OPEN_TERRAIN,
      20,
    );
    expect(result.hit).toBe(false);
    expect(result.damageDealt).toBe(0);
    expect(result.zombieHpAfter).toBe(20);
  });
});

describe('playerDodgeChance', () => {
  it('hard-caps at MAX_DODGE_CHANCE even when every bonus stacks', () => {
    const chance = playerDodgeChance(
      ATTRS,
      ['calm_hands'],
      emptyEquipment(),
      100,
      initialBodyParts(100),
      STANCES.guarded,
      TERRAIN.void_deck,
      0,
    );
    expect(chance).toBe(MAX_DODGE_CHANCE);
    expect(MAX_DODGE_CHANCE).toBe(0.28);
  });

  it('energy contributes at most ±10%', () => {
    expect(energyDodgeBonus(100)).toBeCloseTo(0.1);
    expect(energyDodgeBonus(0)).toBeCloseTo(-0.1);
    expect(energyDodgeBonus(50)).toBe(0);
  });
});

describe('resolveEnemyAction dodge', () => {
  const bruiser: Zombie = { ...SHAMBLER, attack: 20, damage: 6 };

  it('never dodges a natural 20, even with max dodge chance', () => {
    let found = false;
    for (let i = 0; i < 5000; i++) {
      const seed = `nat20-dodge-${i}`;
      const probe = new Rng(seed);
      if (probe.d20() !== 20) continue;
      const res = resolveEnemyAction(
        new Rng(seed),
        BASE_PLAYER,
        bruiser,
        CLEAR_WEATHER,
        1,
        STANCES.guarded,
        TERRAIN.void_deck,
        100,
        ATTRS,
        ['calm_hands'],
        emptyEquipment(),
        initialBodyParts(100),
        0,
      );
      expect(res.dodged).toBe(false);
      expect(res.energyCost).toBe(0);
      expect(res.hitZone).toBe('head');
      found = true;
      break;
    }
    expect(found).toBe(true);
  });

  it('successful dodge spends DODGE_ENERGY_COST', () => {
    let found = false;
    for (let i = 0; i < 8000; i++) {
      const seed = `dodge-cost-${i}`;
      const res = resolveEnemyAction(
        new Rng(seed),
        BASE_PLAYER,
        bruiser,
        CLEAR_WEATHER,
        1,
        STANCES.guarded,
        TERRAIN.void_deck,
        100,
        ATTRS,
        ['calm_hands'],
        emptyEquipment(),
        initialBodyParts(100),
        0,
      );
      if (!res.dodged) continue;
      expect(res.energyCost).toBe(DODGE_ENERGY_COST);
      expect(res.playerDamage).toBe(0);
      expect(res.hitZone).toBeNull();
      found = true;
      break;
    }
    expect(found).toBe(true);
  });
});
