import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  crossingFightChance,
  quietPathAmbush,
  resolveCrossing,
  riskLabel,
  trekRisk,
  type HazardZone,
  type TrekRisk,
} from './wilds';

const emptyRisk = (encounterChance = 1): TrekRisk => ({
  encounterChance,
  fightChance: encounterChance,
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

describe('route fight chance', () => {
  const zone = (kind: HazardZone['kind'], severity: number) =>
    ({ id: `${kind}${severity}`, kind, severity, lat: 1.3, lng: 103.8, radiusM: 60 }) as HazardZone;
  const priced = (hazards: HazardZone[], band: 'day' | 'night', dist = 400) =>
    trekRisk(
      'seed',
      { lat: 1.3, lng: 103.8 },
      { lat: 1.3 + dist / 111000, lng: 103.8 },
      { band, hordeIntensity: 0.2, weatherEncounterMod: 0, traitEncounterMod: 0 },
      hazards,
    );
  const measured = (risk: TrekRisk, band: 'day' | 'night', n = 6000) => {
    let fights = 0;
    for (let i = 0; i < n; i++) {
      const o = resolveCrossing(new Rng(`F${i}`), risk, {
        mode: 'road',
        siteDanger: 2,
        dexterity: 5,
        checkBonus: 0,
        band,
        habitat: null,
        pressure: 0.2,
        forest: false,
        weather: 'clear',
      });
      if (o.ambush) fights++;
    }
    return fights / n;
  };

  it('predicts what resolveCrossing actually does', () => {
    for (const [hz, band] of [
      [[], 'day'],
      [[], 'night'],
      [[zone('gang_patrol', 1)], 'day'],
      [[zone('night_swarm', 2)], 'night'],
    ] as const) {
      const risk = priced([...hz], band);
      expect(Math.abs(measured(risk, band) - risk.fightChance)).toBeLessThan(0.03);
    }
  });

  it('labels a patrolled road worse than a long quiet one', () => {
    const patrol = priced([zone('gang_patrol', 1)], 'day');
    const longQuiet = priced([], 'night', 1200);
    expect(patrol.fightChance).toBeGreaterThan(longQuiet.fightChance);
    expect(riskLabel(patrol.fightChance).text).not.toBe('Uneasy');
  });

  it('counts the floodwater animal and ignores terrain-only hazards', () => {
    expect(crossingFightChance(0.5, [zone('floodwater', 1)], false)).toBeCloseTo(0.55);
    expect(crossingFightChance(0.5, [zone('collapse', 2)], false)).toBe(0);
  });
});
