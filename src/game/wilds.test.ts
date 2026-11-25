import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  crossingFightChance,
  hazardCheckDc,
  hazardCheckPassChance,
  quietPathAmbush,
  repriceTrekRisk,
  rollHazardChecks,
  resolveCrossing,
  riskLabel,
  trekRisk,
  type HazardZone,
  type TrekRisk,
} from './wilds';

const emptyRisk = (encounterChance = 1): TrekRisk => ({
  encounterChance,
  fightChance: encounterChance,
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

describe('hazard crossing', () => {
  const hazardRisk = (kind: HazardZone['kind'], severity = 3): TrekRisk => ({
    encounterChance: 1, fightChance: 1, combatDanger: 4,
    hazards: [{ id: 'crossed', kind, severity, lat: 1.3, lng: 103.8, radiusM: 60, discs: [] }],
  });
  const opts = { mode: 'road' as const, dexterity: 0, checkBonus: 0 };

  it('allows a natural twenty to clear severe collapsed ground', () => {
    const seed = Array.from({ length: 1000 }, (_, n) => `collapse-${n}`)
      .find((value) => new Rng(value).d20() === 20)!;
    expect(resolveCrossing(new Rng(seed), hazardRisk('collapse'), opts).woundHp).toBe(0);
  });

  it('keeps a crossing threat to the zone that caused it', () => {
    for (const kind of ['gang_patrol', 'horde_pocket', 'night_swarm', 'wildlife_water', 'wildlife_forest', 'wildlife_urban'] as const) {
      for (let n = 0; n < 50; n++) {
        const outcome = resolveCrossing(new Rng(`choice-${n}`), hazardRisk(kind), opts);
        if (outcome.ambush) expect(outcome.ambush.hazard).toBe(kind);
      }
    }
  });

  it('flood crossings expose the survivor without adding infected encounters', () => {
    let exposure = 0;
    for (let n = 0; n < 200; n++) {
      const outcome = resolveCrossing(new Rng(`water-${n}`), hazardRisk('floodwater'), opts);
      exposure += outcome.infectionDelta;
      expect(outcome.ambush).toBeNull();
    }
    expect(exposure).toBeGreaterThan(0);
  });
});

describe('resolveCrossing quiet path', () => {
  it('does not charge a flat fee or terrain exposure on top of walking', () => {
    const opts = { mode: 'trek' as const, dexterity: 5, checkBonus: 0, weather: 'clear' as const };
    const quiet = trekRisk('budget', { lat: 1.3, lng: 103.8 }, { lat: 1.301, lng: 103.8 },
      { band: 'day', hordeIntensity: 0, weatherEncounterMod: 0, traitEncounterMod: -1 }, []);
    expect(resolveCrossing(new Rng('quiet'), quiet, opts).energyCost).toBe(0);
    const flooded: TrekRisk = { ...quiet, hazards: [{ id: 'flood', kind: 'floodwater',
      severity: 2, lat: 1.3, lng: 103.8, radiusM: 60 }] };
    const outcome = resolveCrossing(new Rng('flood'), flooded, opts);
    expect(outcome.extraHours).toBeGreaterThan(0);
    expect(outcome.energyCost).toBe(0);
  });

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

describe('hazard checks', () => {
  const attrs = { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 };
  // A 100 m disc centred on (1.3, 103.8).
  const disc = (id: string, kind: HazardZone['kind'], severity: number): HazardZone => ({
    id, kind, severity, lat: 1.3, lng: 103.8, radiusM: 100,
    discs: [{ lat: 1.3, lng: 103.8, radiusM: 100 }],
  });
  const inside = { lat: 1.3, lng: 103.8 };
  const inside2 = { lat: 1.3003, lng: 103.8 };
  const outside = { lat: 1.31, lng: 103.8 };

  it('scales the DC with severity, eases exits and hardens the swarm', () => {
    expect(hazardCheckDc({ kind: 'collapse', severity: 1 }, 'cross')).toBe(11);
    expect(hazardCheckDc({ kind: 'collapse', severity: 3 }, 'cross')).toBe(17);
    expect(hazardCheckDc({ kind: 'collapse', severity: 3 }, 'exit')).toBe(15);
    expect(hazardCheckDc({ kind: 'night_swarm', severity: 2 }, 'cross')).toBe(17);
  });

  it('asks nothing while moving within a zone, an exit check to leave it, a crossing check otherwise', () => {
    const z = disc('z', 'horde_pocket', 2);
    expect(rollHazardChecks(new Rng('c'), [z], inside, inside2, attrs, 0)).toEqual([]);
    expect(rollHazardChecks(new Rng('c'), [z], inside, outside, attrs, 0)[0]?.mode).toBe('exit');
    expect(rollHazardChecks(new Rng('c'), [z], outside, inside, attrs, 0)[0]?.mode).toBe('cross');
  });

  it('tests the attribute that fits the zone and counts each zone once', () => {
    const checks = rollHazardChecks(new Rng('c'), [
      disc('a', 'collapse', 1), disc('a', 'collapse', 1), disc('b', 'floodwater', 1), disc('c', 'gang_patrol', 1),
    ], outside, { lat: 1.32, lng: 103.8 }, attrs, 0);
    expect(checks.map((c) => c.attr)).toEqual(['dexterity', 'endurance', 'wits']);
  });

  it('passes on a natural 20 and fails on a natural 1 whatever the modifiers', () => {
    for (let i = 0; i < 300; i++) {
      const [c] = rollHazardChecks(new Rng(`n-${i}`), [disc('z', 'night_swarm', 3)], outside, inside, attrs, 0);
      if (c.roll === 20) expect(c.success).toBe(true);
      const [d] = rollHazardChecks(new Rng(`n-${i}`), [disc('z', 'collapse', 1)], outside, inside,
        { ...attrs, dexterity: 30 }, 0);
      if (d.roll === 1) expect(d.success).toBe(false);
    }
  });

  it('is deterministic for the same seed', () => {
    const run = () => rollHazardChecks(new Rng('same'), [disc('z', 'collapse', 2)], outside, inside, attrs, 0);
    expect(run()).toEqual(run());
  });

  it('reprices the route without the zones slipped past', () => {
    const risk = trekRisk('reprice', { lat: 1.3, lng: 103.8 }, { lat: 1.305, lng: 103.8 }, {
      band: 'day', hordeIntensity: 0, weatherEncounterMod: 0, traitEncounterMod: 0,
    }, [disc('z', 'horde_pocket', 3)]);
    const clear = repriceTrekRisk(risk, [], false);
    expect(clear.hazards).toEqual([]);
    expect(clear.encounterChance).toBeLessThan(risk.encounterChance);
    expect(repriceTrekRisk(risk, risk.hazards, false).encounterChance).toBeCloseTo(risk.encounterChance);
  });

  it('gives the exact d20 pass chance with natural 20 and natural 1', () => {
    expect(hazardCheckPassChance(5, 17)).toBeCloseTo(9 / 20);
    expect(hazardCheckPassChance(30, 17)).toBeCloseTo(19 / 20);
    expect(hazardCheckPassChance(-30, 17)).toBeCloseTo(1 / 20);
  });

  describe('route label with slip-past checks', () => {
    const from = { lat: 1.3, lng: 103.79 };
    const to = { lat: 1.3, lng: 103.81 };
    const opts = { band: 'day' as const, hordeIntensity: 0, weatherEncounterMod: 0, traitEncounterMod: 0 };
    const zones = [disc('a', 'horde_pocket', 3), disc('b', 'collapse', 2)];
    const plain = trekRisk('slip', from, to, opts, zones);
    const quiet = repriceTrekRisk(plain, [], false).fightChance;
    const withStats = (attr: number) => trekRisk('slip', from, to,
      { ...opts, checker: { attributes: { ...attrs, perception: attr, dexterity: attr }, checkBonus: 0 } }, zones);

    it('drops the fight chance toward the quiet road as the checks get easier', () => {
      expect(withStats(5).fightChance).toBeLessThan(plain.fightChance);
      expect(withStats(5).fightChance).toBeGreaterThan(quiet);
      expect(withStats(30).fightChance).toBeLessThan(withStats(5).fightChance);
      expect(withStats(-30).fightChance).toBeGreaterThan(withStats(5).fightChance);
    });

    it('keeps everything except the fight chance', () => {
      const r = withStats(5);
      expect(r.encounterChance).toBe(plain.encounterChance);
      expect(r.hazards).toEqual(plain.hazards);
    });

    it('matches the single-zone weighted outcome', () => {
      const one = [disc('a', 'horde_pocket', 3)];
      const caught = trekRisk('slip', from, to, opts, one);
      const p = hazardCheckPassChance(5, hazardCheckDc(one[0], 'cross'));
      const r = trekRisk('slip', from, to, { ...opts, checker: { attributes: attrs, checkBonus: 0 } }, one);
      expect(r.fightChance).toBeCloseTo(p * repriceTrekRisk(caught, [], false).fightChance + (1 - p) * caught.fightChance);
    });

    it('counts no check for a zone the walk never leaves', () => {
      const a = { lat: 1.3, lng: 103.8 };
      const b = { lat: 1.3003, lng: 103.8 };
      const one = [disc('a', 'horde_pocket', 3)];
      const inZone = trekRisk('slip', a, b, opts, one);
      const r = trekRisk('slip', a, b, { ...opts, checker: { attributes: attrs, checkBonus: 0 } }, one);
      expect(r.fightChance).toBeCloseTo(repriceTrekRisk(inZone, [], false).fightChance);
    });
  });
});
