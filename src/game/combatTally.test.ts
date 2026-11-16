import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { resolvePlayerAction, STANCES, terrainForCategory, type PlayerCombatStats } from './combat';
import {
  d20HitChance,
  emptyTally,
  summarizeTally,
  tallyEnemyAction,
  tallyPlayerAction,
} from './combatTally';
import { initialBodyParts } from './survival';
import type { BodyParts, Zombie } from './types';

const PLAYER: PlayerCombatStats = {
  attack: 3,
  defense: 10,
  gearDefense: 0,
  damage: 6,
  infectionResist: 0,
  weaponName: 'Pipe',
  ranged: false,
  roundsPerShot: 0,
  wearRate: 1,
  nightAccuracyPenaltyRemoved: false,
  nightAccuracyExtra: 0,
  zombieAttackMod: 0,
  speedFactor: 1,
  weaponAccuracy: 0,
  strength: 5,
  dexterity: 5,
  offHand: null,
};

const ZOMBIE: Zombie = {
  name: 'Shambler',
  kind: 'zombie',
  hp: 999,
  maxHp: 999,
  attack: 0,
  defense: 3,
  damage: 4,
  infectious: 0,
  armor: 0,
  speed: 5,
};

function hurt(parts: BodyParts, id: keyof BodyParts, patch: Partial<BodyParts['head']>): BodyParts {
  return { ...parts, [id]: { ...parts[id], ...patch } };
}

describe('d20HitChance', () => {
  it('counts the faces that meet the target', () => {
    expect(d20HitChance(0, 11)).toBeCloseTo(0.5); // 11..20
    expect(d20HitChance(5, 11)).toBeCloseTo(0.75); // 6..20
  });

  it('a natural 20 always connects, and a wider crit band adds faces', () => {
    expect(d20HitChance(-50, 30)).toBeCloseTo(0.05);
    expect(d20HitChance(-50, 30, 17)).toBeCloseTo(0.2);
    expect(d20HitChance(50, 2)).toBe(1);
  });

  it('matches the hit rate resolvePlayerAction actually produces', () => {
    const terrain = terrainForCategory('supermarket');
    const weather = { kind: 'clear' as const, time: 'day' as const };
    const rng = new Rng('tally-odds');
    let hits = 0;
    let odds = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const res = resolvePlayerAction(rng.fork(`s${i}`), PLAYER, ZOMBIE, weather, 1, STANCES.guarded, terrain, 60);
      if (res.hit) hits++;
      odds = res.hitChance;
    }
    expect(Math.abs(hits / N - odds)).toBeLessThan(0.03);
  });
});

describe('tallyPlayerAction', () => {
  it('accumulates attacks, hits, crits, damage, best hit and minutes', () => {
    let t = emptyTally();
    t = tallyPlayerAction(t, { hit: true, critical: false, damageDealt: 7, hitChance: 0.6, minutes: 0.25 });
    t = tallyPlayerAction(t, { hit: false, critical: false, damageDealt: 0, hitChance: 0.6, minutes: 0.25 });
    t = tallyPlayerAction(t, { hit: true, critical: true, damageDealt: 12, hitChance: 0.8, minutes: 0.25, shot: true });
    expect(t).toMatchObject({ swings: 3, hits: 2, crits: 1, shots: 1, damageDealt: 19, bestHit: 12 });
    expect(t.minutes).toBeCloseTo(0.75);
    const s = summarizeTally(t, 'win', 100, 100);
    expect(s.hitRate).toBeCloseTo(2 / 3);
    expect(s.hitOdds).toBeCloseTo(2 / 3);
  });

  it('never mutates the tally it was given', () => {
    const t = emptyTally();
    tallyPlayerAction(t, { hit: true, critical: true, damageDealt: 5, hitChance: 1, minutes: 1 });
    expect(t).toEqual(emptyTally());
  });
});

describe('tallyEnemyAction', () => {
  const before = initialBodyParts(100);

  it('records only what got worse on the part that was hit', () => {
    const preBruised = hurt(before, 'leftArm', { wound: 'bruise' });
    const after = hurt(preBruised, 'leftArm', {
      hp: preBruised.leftArm.hp - 6,
      wound: 'cut',
      bleed: 'minor',
      fractured: true,
    });
    const t = tallyEnemyAction(emptyTally(), { hitChance: 0.4, rollHit: true, zone: 'leftArm', infection: 9 }, preBruised, after);
    expect(t.enemyHits).toBe(1);
    expect(t.damageTaken).toBe(6);
    expect(t.infection).toBe(9);
    expect(t.injuries.leftArm).toEqual({ hits: 1, damage: 6, wound: 'cut', bleed: 'minor', fractured: true });
  });

  it('ignores a pre-existing wound that did not worsen', () => {
    const preCut = hurt(before, 'torso', { wound: 'deep', bleed: 'major' });
    const after = hurt(preCut, 'torso', { hp: preCut.torso.hp - 2 });
    const t = tallyEnemyAction(emptyTally(), { hitChance: 0.4, rollHit: true, zone: 'torso' }, preCut, after);
    expect(t.injuries.torso).toEqual({ hits: 1, damage: 2 });
  });

  it('keeps the worst wound across several blows to one part', () => {
    const a1 = hurt(before, 'head', { hp: before.head.hp - 5, wound: 'deep' });
    const a2 = hurt(a1, 'head', { hp: a1.head.hp - 1 });
    let t = tallyEnemyAction(emptyTally(), { hitChance: 0.5, rollHit: true, zone: 'head' }, before, a1);
    t = tallyEnemyAction(t, { hitChance: 0.5, rollHit: true, zone: 'head' }, a1, a2);
    expect(t.injuries.head).toEqual({ hits: 2, damage: 6, wound: 'deep' });
  });

  it('counts misses, dodges and blocks without injuries', () => {
    let t = tallyEnemyAction(emptyTally(), { hitChance: 0.3, rollHit: false }, before, before);
    t = tallyEnemyAction(t, { hitChance: 0.3, rollHit: true, dodged: true }, before, before);
    t = tallyEnemyAction(t, { hitChance: 0.3, rollHit: true, blocked: true }, before, before);
    expect(t).toMatchObject({ enemyAttacks: 3, enemyRollHits: 2, enemyHits: 0, dodges: 1, blocks: 1, damageTaken: 0 });
    expect(t.injuries).toEqual({});
    expect(summarizeTally(t, 'win', 100, 100).enemyOdds).toBeCloseTo(0.3);
  });

  it('a parting blow while fleeing counts as a hit but not toward their odds', () => {
    const after = hurt(before, 'rightLeg', { hp: before.rightLeg.hp - 3, wound: 'bruise' });
    let t = tallyEnemyAction(emptyTally(), { hitChance: 0.5, rollHit: false }, before, before);
    t = tallyEnemyAction(t, { rollHit: true, zone: 'rightLeg' }, before, after);
    const s = summarizeTally(t, 'flee', 97, 100);
    expect(s.enemyOdds).toBeCloseTo(0.5);
    expect(s.enemyHitRate).toBeCloseTo(0.5);
    expect(s.verdict).toBe('escaped');
  });
});

describe('summarizeTally', () => {
  const before = initialBodyParts(100);

  it('flawless when nothing landed', () => {
    const t = tallyPlayerAction(emptyTally(), { hit: true, critical: false, damageDealt: 9, hitChance: 0.7, minutes: 0.25 });
    const s = summarizeTally(t, 'win', 100, 100);
    expect(s.verdict).toBe('flawless');
    expect(s.enemyHitRate).toBeNull();
  });

  it('clean when only bruised HP, bloodied with a cut, barely with a fracture or low HP', () => {
    const bruise = hurt(before, 'torso', { hp: before.torso.hp - 3 });
    let t = tallyEnemyAction(emptyTally(), { hitChance: 0.4, rollHit: true, zone: 'torso' }, before, bruise);
    expect(summarizeTally(t, 'win', 97, 100).verdict).toBe('clean');
    expect(summarizeTally(t, 'win', 30, 100).verdict).toBe('barely');

    const cut = hurt(bruise, 'leftLeg', { hp: bruise.leftLeg.hp - 4, wound: 'cut' });
    t = tallyEnemyAction(t, { hitChance: 0.4, rollHit: true, zone: 'leftLeg' }, bruise, cut);
    expect(summarizeTally(t, 'win', 93, 100).verdict).toBe('bloodied');

    const broken = hurt(cut, 'rightArm', { hp: cut.rightArm.hp - 8, fractured: true });
    t = tallyEnemyAction(t, { hitChance: 0.4, rollHit: true, zone: 'rightArm' }, cut, broken);
    const s = summarizeTally(t, 'win', 85, 100);
    expect(s.verdict).toBe('barely');
    expect(s.severe).toBe(true);
    // Worst injury first.
    expect(s.injuries.map((i) => i.part)).toEqual(['rightArm', 'leftLeg', 'torso']);
  });

  it('returns null rates when nobody acted', () => {
    const s = summarizeTally(emptyTally(), 'flee', 100, 100);
    expect(s.hitRate).toBeNull();
    expect(s.hitOdds).toBeNull();
    expect(s.enemyOdds).toBeNull();
  });
});
