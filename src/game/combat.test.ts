import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  resolvePlayerAction,
  STANCES,
  terrainForCategory,
  type PlayerCombatStats,
} from './combat';
import type { Zombie } from './types';

const BASE_PLAYER: PlayerCombatStats = {
  attack: 5,
  defense: 10,
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
