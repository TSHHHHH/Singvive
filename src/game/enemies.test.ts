import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { ENEMIES, rollAnimalById, rollElite, rollHuman, rollLoner, rollZombie } from './enemies';

describe('enemy unarmedMult', () => {
  it('rolled enemies carry unarmedMult from the catalog', () => {
    const shambler = rollZombie({ ...ENEMIES, zombies: [ENEMIES.zombies[0]!] }, new Rng('u'), 1);
    expect(shambler.templateId).toBe('shambler');
    expect(shambler.unarmedMult).toBe(1);
    expect(rollElite(ENEMIES, new Rng('u'), 'hulk', 3, 'e').unarmedMult).toBe(0.15);
    expect(rollAnimalById(ENEMIES, new Rng('u'), 'rat', 1).unarmedMult).toBe(1);
    expect(rollLoner(ENEMIES, new Rng('u'), 'raider', 2).unarmedMult).toBe(0.4);
  });

  it('faction humans fall back to humanDefaults.unarmedMult', () => {
    expect(rollHuman(ENEMIES, new Rng('u'), 'muster', 2).unarmedMult).toBe(0.5);
  });

  it('every catalog unarmedMult is within 0..1', () => {
    const all = [
      ...ENEMIES.zombies,
      ...Object.values(ENEMIES.elites),
      ...ENEMIES.animals,
      ...Object.values(ENEMIES.loners),
      ENEMIES.humanDefaults,
    ];
    for (const e of all) {
      expect(e.unarmedMult).toBeGreaterThanOrEqual(0);
      expect(e.unarmedMult).toBeLessThanOrEqual(1);
    }
  });
});
