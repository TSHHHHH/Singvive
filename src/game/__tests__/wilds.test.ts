import { describe, it, expect } from 'vitest';
import { Rng } from '../rng';
import { haversine } from '../overpass';
import {
  HAZARD_CONFIG,
  pointInZone,
  zoneTouches,
  hazardZonesNear,
  trekRisk,
  resolveCrossing,
  riskLabel,
  restAmbushLabel,
  TREK_BASE_ENERGY,
  type HazardKind,
  type HazardZone,
  type TrekRisk,
} from '../wilds';

function north(lat: number, metres: number): number {
  return lat + metres / 111000;
}

function zone(kind: HazardKind, severity: 1 | 2 | 3, id = `${kind}-${severity}`): HazardZone {
  return {
    id,
    kind,
    severity,
    lat: 1.35,
    lng: 103.8,
    radiusM: 100,
    discs: [{ lat: 1.35, lng: 103.8, radiusM: 100 }],
  };
}

describe('HAZARD_CONFIG', () => {
  const ALL_KINDS: HazardKind[] = [
    'horde_pocket',
    'gang_patrol',
    'collapse',
    'floodwater',
    'wildlife_water',
    'wildlife_forest',
    'wildlife_urban',
    'night_swarm',
  ];

  it('defines a sane pricing entry for every hazard kind', () => {
    for (const kind of ALL_KINDS) {
      const cfg = HAZARD_CONFIG[kind];
      expect(cfg, kind).toBeTruthy();
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.encounterMult).toBeGreaterThan(0);
      expect(cfg.energyCost).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('pointInZone / zoneTouches', () => {
  const origin = { lat: 1.35, lng: 103.8 };
  const z = zone('horde_pocket', 2); // discs default to a single 100m disc at (1.35, 103.8)

  it('is true at the disc centre and false well outside its radius', () => {
    expect(pointInZone(origin.lat, origin.lng, z)).toBe(true);
    expect(pointInZone(north(origin.lat, 5000), origin.lng, z)).toBe(false);
  });

  it('touches only when the query radius plus the disc radius reaches the point', () => {
    const queryLat = north(origin.lat, 300); // 300m from the disc centre, disc radius 100m
    expect(zoneTouches(queryLat, origin.lng, 100, z)).toBe(false); // 300 > 100+100
    expect(zoneTouches(queryLat, origin.lng, 250, z)).toBe(true); // 300 <= 250+100
  });
});

describe('hazardZonesNear', () => {
  const seed = 'wilds-seed-1';
  const center = { lat: 1.34, lng: 103.79 };

  it('is a pure function of its inputs — same seed and params give the same field', () => {
    const a = hazardZonesNear(seed, center.lat, center.lng, 1500, undefined, 0.2, { band: 'day' });
    const b = hazardZonesNear(seed, center.lat, center.lng, 1500, undefined, 0.2, { band: 'day' });
    expect(b).toEqual(a);
  });

  it('never produces a night_swarm zone in the day band', () => {
    const zones = hazardZonesNear(seed, center.lat, center.lng, 3000, undefined, 0.3, { band: 'day' });
    expect(zones.some((z) => z.kind === 'night_swarm')).toBe(false);
  });

  it('produces night_swarm zones once night falls', () => {
    const zones = hazardZonesNear('night-check-seed', center.lat, center.lng, 3000, undefined, 0, { band: 'night' });
    expect(zones.some((z) => z.kind === 'night_swarm')).toBe(true);
  });

  it('suppresses a daytime hazard whose disc covers a declared safe anchor', () => {
    const unsuppressed = hazardZonesNear(seed, center.lat, center.lng, 3000, undefined, 0.3, { band: 'day' });
    expect(unsuppressed.length).toBeGreaterThan(0);
    const target = unsuppressed[0];
    const disc = target.discs[0];

    const suppressed = hazardZonesNear(
      seed,
      center.lat,
      center.lng,
      3000,
      { lat: disc.lat, lng: disc.lng, radiusM: disc.radiusM + 50 },
      0.3,
      { band: 'day' },
    );
    expect(suppressed.some((z) => z.id === target.id)).toBe(false);
  });
});

describe('trekRisk', () => {
  const from = { lat: 1.3, lng: 103.8 };
  const to = { lat: north(1.3, 2000), lng: 103.8 };
  const dist = haversine(from.lat, from.lng, to.lat, to.lng);
  const baseOpts = { band: 'day' as const, hordeIntensity: 0, weatherEncounterMod: 0, traitEncounterMod: 0 };

  it('prices a clear crossing from distance alone when there are no hazards on the route', () => {
    const risk = trekRisk('seed', from, to, baseOpts, []);
    expect(risk.energyCost).toBe(Math.round(TREK_BASE_ENERGY + dist / 250));
    expect(risk.combatDanger).toBe(2); // 2 + worst(0), floor
    expect(risk.hazards).toEqual([]);
  });

  it('raises the encounter chance at night relative to the same crossing by day', () => {
    const day = trekRisk('seed', from, to, { ...baseOpts, band: 'day' }, []);
    const night = trekRisk('seed', from, to, { ...baseOpts, band: 'night' }, []);
    expect(night.encounterChance).toBeCloseTo(day.encounterChance + 0.14, 10);
  });

  it('clamps encounter chance to 0.95 under heavy horde pressure', () => {
    const risk = trekRisk('seed', from, to, { ...baseOpts, hordeIntensity: 10 }, []);
    expect(risk.encounterChance).toBe(0.95);
  });

  it('folds hazard severity into energy cost and combat danger', () => {
    const hazards: HazardZone[] = [zone('collapse', 3, 'c1')];
    const risk: TrekRisk = trekRisk('seed', from, to, baseOpts, hazards);
    const baseline = trekRisk('seed', from, to, baseOpts, []);
    // collapse config: energyCost 7, so + 7 * severity(3) * 0.6 = +12.6
    expect(risk.energyCost).toBe(Math.round(baseline.energyCost + 12.6));
    expect(risk.combatDanger).toBe(5); // 2 + worst severity(3)
  });
});

describe('resolveCrossing — collapse hazards', () => {
  const opts = { mode: 'trek' as const, siteDanger: 0, dexterity: 0, checkBonus: 0 };

  it('always wounds on a severity-3 collapse (auto-fail), regardless of the roll', () => {
    const risk: TrekRisk = { encounterChance: 0, energyCost: 0, combatDanger: 1, hazards: [zone('collapse', 3, 'c1')] };
    for (const seed of ['seed-a', 'seed-b', 'seed-c']) {
      const outcome = resolveCrossing(new Rng(seed), risk, opts);
      expect(outcome.woundHp).toBe(6 + 3 * 3);
      expect(outcome.woundPreferLeg).toBe(true);
      expect(outcome.ambush).toBeNull();
    }
  });

  it('clamps combined wound damage to WOUND_CAP (18) across multiple hazards', () => {
    const risk: TrekRisk = {
      encounterChance: 0,
      energyCost: 0,
      combatDanger: 1,
      hazards: [zone('collapse', 3, 'c1'), zone('collapse', 3, 'c2')],
    };
    const outcome = resolveCrossing(new Rng('any-seed'), risk, opts);
    expect(outcome.woundHp).toBe(18);
  });

  it('succeeds on a natural 20 even against a high DC', () => {
    // d20() with seed "collapse-41" rolls a 20 as its first draw.
    const risk: TrekRisk = { encounterChance: 0, energyCost: 0, combatDanger: 1, hazards: [zone('collapse', 1, 'c1')] };
    const outcome = resolveCrossing(new Rng('collapse-41'), risk, opts);
    expect(outcome.woundHp).toBe(0);
    expect(outcome.woundPreferLeg).toBe(false);
  });

  it('fails a low roll against DC with no dexterity or check bonus to help', () => {
    // d20() with seed "collapse-1" rolls a 1 as its first draw; DC for severity 1 is 12.
    const risk: TrekRisk = { encounterChance: 0, energyCost: 0, combatDanger: 1, hazards: [zone('collapse', 1, 'c1')] };
    const outcome = resolveCrossing(new Rng('collapse-1'), risk, opts);
    expect(outcome.woundHp).toBe(6 + 1 * 3);
    expect(outcome.woundPreferLeg).toBe(true);
  });
});

describe('resolveCrossing — floodwater', () => {
  const opts = { mode: 'trek' as const, siteDanger: 0, dexterity: 0, checkBonus: 0 };

  it('always adds extraHours proportional to severity', () => {
    const risk: TrekRisk = { encounterChance: 0, energyCost: 0, combatDanger: 1, hazards: [zone('floodwater', 2, 'f1')] };
    const outcome = resolveCrossing(new Rng('whatever'), risk, opts);
    expect(outcome.extraHours).toBeCloseTo(0.12 * 2, 10);
  });

  it('rolls a seeded infection chance of 0.1 * severity', () => {
    const risk: TrekRisk = { encounterChance: 0, energyCost: 0, combatDanger: 1, hazards: [zone('floodwater', 2, 'f1')] };
    // First rng draw for seed "fw-1" is < 0.2 -> infection; for "fw-0" it is >= 0.2 -> none.
    expect(resolveCrossing(new Rng('fw-1'), risk, opts).infectionDelta).toBe(4 * 2);
    expect(resolveCrossing(new Rng('fw-0'), risk, opts).infectionDelta).toBe(0);
  });
});

describe('resolveCrossing — combat hazards (ambush roll)', () => {
  const opts = { mode: 'trek' as const, siteDanger: 0, dexterity: 0, checkBonus: 0 };

  it('rolls the ambush chance for a night_swarm hazard deterministically per seed', () => {
    const risk: TrekRisk = { encounterChance: 0, energyCost: 0, combatDanger: 1, hazards: [zone('night_swarm', 3, 'n1')] };
    // ambushChanceFor('night_swarm', 3) = 0.97; "ns-0" draws below it, "ns-99" draws above it.
    const hit = resolveCrossing(new Rng('ns-0'), risk, opts);
    expect(hit.ambush).toEqual({ hazard: 'night_swarm', danger: 5 });

    const miss = resolveCrossing(new Rng('ns-99'), risk, opts);
    expect(miss.ambush).toBeNull();
  });
});

describe('resolveCrossing — open-ground road encounter (no hazards on the path)', () => {
  const opts = { mode: 'road' as const, dexterity: 0, checkBonus: 0 };

  it('can resolve to a quiet road find', () => {
    const risk: TrekRisk = { encounterChance: 1, energyCost: 9, combatDanger: 2, hazards: [] };
    const outcome = resolveCrossing(new Rng('road-scan-3'), risk, opts);
    expect(outcome).toEqual({
      energyCost: 9,
      extraHours: 0,
      woundHp: 0,
      woundPreferLeg: false,
      infectionDelta: 0,
      ambush: null,
      logs: [],
      roadFind: true,
    });
  });

  it('can resolve to a horde_pocket ambush, falling back to risk.combatDanger without a site danger', () => {
    const risk: TrekRisk = { encounterChance: 1, energyCost: 9, combatDanger: 3, hazards: [] };
    const outcome = resolveCrossing(new Rng('road-scan-0'), risk, opts);
    expect(outcome.ambush).toEqual({ hazard: 'horde_pocket', danger: 3 });
    expect(outcome.roadFind).toBe(false);
  });

  it('can resolve to nothing at all', () => {
    const risk: TrekRisk = { encounterChance: 1, energyCost: 9, combatDanger: 3, hazards: [] };
    const outcome = resolveCrossing(new Rng('road-scan-1'), risk, opts);
    expect(outcome.ambush).toBeNull();
    expect(outcome.roadFind).toBe(false);
  });
});

describe('resolveCrossing — open-ground trek encounter', () => {
  it('always ambushes when encounterChance is 1 and never when it is 0', () => {
    const trekOpts = { mode: 'trek' as const, dexterity: 0, checkBonus: 0 };
    const always: TrekRisk = { encounterChance: 1, energyCost: 0, combatDanger: 4, hazards: [] };
    expect(resolveCrossing(new Rng('irrelevant-seed'), always, trekOpts).ambush).toEqual({
      hazard: 'horde_pocket',
      danger: 4,
    });

    const never: TrekRisk = { encounterChance: 0, energyCost: 0, combatDanger: 4, hazards: [] };
    expect(resolveCrossing(new Rng('irrelevant-seed'), never, trekOpts).ambush).toBeNull();
  });
});

describe('riskLabel', () => {
  it('buckets at the documented chance thresholds', () => {
    expect(riskLabel(0).text).toBe('Quiet, far as you can tell');
    expect(riskLabel(0.11).text).toBe('Quiet, far as you can tell');
    expect(riskLabel(0.12).text).toBe('Uneasy');
    expect(riskLabel(0.27).text).toBe('Uneasy');
    expect(riskLabel(0.28).text).toBe('Bad ground');
    expect(riskLabel(0.44).text).toBe('Bad ground');
    expect(riskLabel(0.45).text).toBe('Suicide run');
  });
});

describe('restAmbushLabel', () => {
  it('buckets at the documented chance thresholds', () => {
    expect(restAmbushLabel(0).text).toBe('Safe');
    expect(restAmbushLabel(0.14).text).toBe('Uneasy');
    expect(restAmbushLabel(0.15).text).toBe('Exposed');
    expect(restAmbushLabel(0.39).text).toBe('Exposed');
    expect(restAmbushLabel(0.4).text).toBe('Suicide');
  });
});
