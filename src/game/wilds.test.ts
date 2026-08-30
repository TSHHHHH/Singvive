import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { quietPathAmbush, resolveCrossing, type TrekRisk } from './wilds';

const emptyRisk = (encounterChance = 1): TrekRisk => ({
  encounterChance,
  energyCost: 5,
  combatDanger: 2,
  hazards: [],
});

describe('quietPathAmbush', () => {
  it('picks more than horde_pocket given context', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 120; i++) {
      kinds.add(
        quietPathAmbush(new Rng(`amb-${i}`), {
          band: 'night',
          habitat: 'urban',
          pressure: 0.8,
          mode: 'trek',
          forest: true,
        }),
      );
    }
    expect(kinds.has('night_swarm')).toBe(true);
    expect(kinds.size).toBeGreaterThan(2);
  });
});

describe('resolveCrossing quiet path', () => {
  it('produces varied non-hazard outcomes on open ground', () => {
    const tags = new Set<string>();
    for (let i = 0; i < 250; i++) {
      const rng = new Rng(`quiet-road-${i}`);
      const o = resolveCrossing(rng, emptyRisk(), {
        mode: 'road',
        dexterity: 10,
        checkBonus: 0,
        band: 'day',
        habitat: 'urban',
        pressure: 0.4,
        forest: false,
        weather: 'rain',
      });
      if (o.travelFind === 'road') tags.add('find');
      else if (o.travelDetour) tags.add('detour');
      else if (o.weatherDrain) tags.add('weather');
      else if (o.ambush) tags.add(`ambush:${o.ambush.hazard}`);
      else tags.add('nothing');
    }
    expect(tags.has('find')).toBe(true);
    expect(tags.has('detour')).toBe(true);
    expect(tags.has('weather')).toBe(true);
    expect([...tags].some((t) => t.startsWith('ambush:'))).toBe(true);
    expect([...tags].some((t) => t.startsWith('ambush:') && t !== 'ambush:horde_pocket')).toBe(true);
  });

  it('can find loot on a quiet trek', () => {
    let found = false;
    for (let i = 0; i < 300; i++) {
      const rng = new Rng(`quiet-trek-${i}`);
      const o = resolveCrossing(rng, emptyRisk(), {
        mode: 'trek',
        dexterity: 10,
        checkBonus: 0,
        band: 'day',
        habitat: 'forest',
        pressure: 0,
        forest: true,
        weather: 'clear',
      });
      if (o.travelFind === 'trek') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    const opts = {
      mode: 'road' as const,
      dexterity: 12,
      checkBonus: 1,
      band: 'night' as const,
      habitat: 'urban' as const,
      pressure: 0.5,
      forest: false,
      weather: 'rain' as const,
    };
    const a = resolveCrossing(new Rng('CROSS-SEED'), emptyRisk(), opts);
    const b = resolveCrossing(new Rng('CROSS-SEED'), emptyRisk(), opts);
    expect(a).toEqual(b);
  });
});
