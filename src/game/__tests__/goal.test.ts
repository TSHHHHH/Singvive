import { describe, it, expect } from 'vitest';
import type { ItemInstance, LocationState } from '../types';
import { Rng } from '../rng';
import {
  evacWeightMult,
  backpackEvacValue,
  meanEvacValue,
  requiredEvacValue,
  rollEvacDemand,
  hasEvacReadiness,
  evacReadiness,
  evacVibeFromRatio,
  evacWindowHours,
  pickDistantEvacPoi,
  pickEvacZone,
  pickNextEvacZone,
  rollEvacCooldown,
  hordeIntensity,
  hordeTier,
  hordeLabel,
  EVAC_BASE_VALUE,
  EVAC_VALUE_PER_DAY,
  MIN_FIRST_EVAC_DIST,
  EVAC_COOLDOWN_MIN_HOURS,
  EVAC_COOLDOWN_MAX_HOURS,
  FIRST_EVAC_WINDOW_HOURS,
  NEXT_EVAC_WINDOW_HOURS,
  HORDE_MAX,
} from '../goal';

function inst(defId: string, container: string, stack = 1, overrides: Partial<ItemInstance> = {}): ItemInstance {
  return { uid: `${defId}-${container}`, defId, container, x: 0, y: 0, rotated: false, stack, ...overrides };
}

function makeLocation(id: string, overrides: Partial<LocationState> = {}): LocationState {
  return {
    id,
    name: id,
    category: 'supermarket',
    lat: 1.35,
    lng: 103.8,
    size: 'medium',
    baseDanger: 2,
    currentDanger: 2,
    remainingSearches: 3,
    exhausted: false,
    cleared: false,
    looted: false,
    factionId: null,
    isFactionRevealed: false,
    isMrtStation: false,
    discovered: true,
    lastSeen: null,
    distanceFromSpawn: 0,
    ...overrides,
  };
}

/** Offset a lat/lng north by `metres` — matches the flat-earth approximation used in-game. */
function north(lat: number, metres: number): number {
  return lat + metres / 111000;
}

describe('evacWeightMult', () => {
  it('assigns the documented weight per effect kind', () => {
    expect(evacWeightMult({ kind: 'fuel' })).toBe(3);
    expect(evacWeightMult({ kind: 'heal', health: 1 })).toBe(2.5);
    expect(evacWeightMult({ kind: 'cure', infection: 1 })).toBe(2.5);
    expect(evacWeightMult({ kind: 'ammo', rounds: 1 })).toBe(2.5);
    expect(evacWeightMult({ kind: 'weapon', damage: 1, accuracy: 1, ranged: true })).toBe(0.7);
    expect(evacWeightMult({ kind: 'weapon', damage: 1, accuracy: 1, ranged: false })).toBe(0.45);
    expect(evacWeightMult({ kind: 'energy', energy: 1 })).toBe(0.5);
    expect(evacWeightMult({ kind: 'water', thirst: 1 })).toBe(0.75);
    expect(evacWeightMult({ kind: 'food', hunger: 1 })).toBe(0.4);
    expect(evacWeightMult({ kind: 'misc' })).toBe(0.35);
  });
});

describe('backpackEvacValue', () => {
  it('sums value × condition × stack × weight-mult for backpack items only', () => {
    const items = [
      inst('newater', 'backpack', 2), // value 10, water, no condition -> 10*1*2*0.75 = 15
      inst('canned_food', 'backpack', 1), // value 8, food -> 8*1*1*0.4 = 3.2
      inst('newater', 'search:somewhere:1', 5), // not in the backpack — excluded
    ];
    expect(backpackEvacValue(items)).toBe(Math.round(15 + 3.2));
  });

  it('applies the soft bias multiplier only to the matching category', () => {
    const items = [inst('fuel_can', 'backpack', 1)]; // value 20, fuel weight-mult 3
    expect(backpackEvacValue(items, 'balanced')).toBe(60);
    expect(backpackEvacValue(items, 'fuel')).toBe(Math.round(60 * 1.15));
    expect(backpackEvacValue(items, 'meds')).toBe(60); // bias doesn't match fuel
  });
});

describe('meanEvacValue / requiredEvacValue', () => {
  it('rises linearly per day after day 1', () => {
    expect(meanEvacValue(1)).toBe(EVAC_BASE_VALUE);
    expect(meanEvacValue(5)).toBe(EVAC_BASE_VALUE + 4 * EVAC_VALUE_PER_DAY);
  });

  it('does not go below the day-1 baseline for day 0 or negative days', () => {
    expect(meanEvacValue(0)).toBe(EVAC_BASE_VALUE);
    expect(meanEvacValue(-3)).toBe(EVAC_BASE_VALUE);
  });

  it('prefers a positive persisted demand over the day curve', () => {
    expect(requiredEvacValue(5, 999)).toBe(999);
    expect(requiredEvacValue(5, null)).toBe(meanEvacValue(5));
    expect(requiredEvacValue(5, 0)).toBe(meanEvacValue(5)); // zero demand falls back to the curve
  });
});

describe('hasEvacReadiness / evacReadiness', () => {
  it('is ready exactly at the threshold, not only above it', () => {
    const items = [inst('fuel_can', 'backpack', 1)]; // backpackEvacValue = 60
    expect(hasEvacReadiness(items, 1, 60)).toBe(true);
    expect(hasEvacReadiness(items, 1, 61)).toBe(false);
  });

  it('reports a clamped 0..1 ratio and the raw current/required', () => {
    const items = [inst('fuel_can', 'backpack', 1)]; // 60
    const r = evacReadiness(items, 1, 120);
    expect(r.current).toBe(60);
    expect(r.required).toBe(120);
    expect(r.ratio).toBe(0.5);
    expect(r.ready).toBe(false);

    const overfull = evacReadiness(items, 1, 30);
    expect(overfull.ratio).toBe(1); // clamped, even though current > required
    expect(overfull.ready).toBe(true);
  });
});

describe('evacVibeFromRatio', () => {
  it('moves thin -> maybe -> promising as the ratio crosses the seed-jittered cuts', () => {
    const jitterSeed = 'vibe-test-seed';
    const j = new Rng(jitterSeed).next() * 0.16 - 0.08;
    const thinCut = 0.45 + j;
    const maybeCut = 0.78 + j * 0.5;

    expect(evacVibeFromRatio(thinCut - 0.01, jitterSeed)).toBe('thin');
    expect(evacVibeFromRatio(thinCut + 0.01, jitterSeed)).toBe('maybe');
    expect(evacVibeFromRatio(maybeCut + 0.01, jitterSeed)).toBe('promising');
  });

  it('is deterministic for a given jitter seed', () => {
    expect(evacVibeFromRatio(0.6, 'same-seed')).toBe(evacVibeFromRatio(0.6, 'same-seed'));
  });
});

describe('rollEvacDemand', () => {
  it('rolls demand within ±20% of the day mean and a bias from the pool', () => {
    const mean = meanEvacValue(3);
    for (let i = 0; i < 50; i++) {
      const { demand, bias } = rollEvacDemand(new Rng(`demand-${i}`), 3);
      expect(demand).toBeGreaterThanOrEqual(Math.round(mean * 0.8));
      expect(demand).toBeLessThanOrEqual(Math.round(mean * 1.2));
      expect(['balanced', 'fuel', 'meds', 'ammo']).toContain(bias);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = rollEvacDemand(new Rng('fixed-seed'), 3);
    const b = rollEvacDemand(new Rng('fixed-seed'), 3);
    expect(a).toEqual(b);
  });
});

describe('rollEvacCooldown', () => {
  it('stays within the configured min/max bounds', () => {
    for (let i = 0; i < 50; i++) {
      const h = rollEvacCooldown(new Rng(`cooldown-${i}`));
      expect(h).toBeGreaterThanOrEqual(EVAC_COOLDOWN_MIN_HOURS);
      expect(h).toBeLessThanOrEqual(EVAC_COOLDOWN_MAX_HOURS);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

describe('evacWindowHours', () => {
  it('starts at the full base window with no shrink before day 3', () => {
    expect(evacWindowHours(true, 1)).toBe(FIRST_EVAC_WINDOW_HOURS);
    expect(evacWindowHours(false, 1)).toBe(NEXT_EVAC_WINDOW_HOURS);
  });

  it('shrinks 4h/day after day 3, floored at the mode-specific minimum', () => {
    expect(evacWindowHours(true, 10)).toBe(96 - (10 - 3) * 4);
    expect(evacWindowHours(true, 30)).toBe(36); // floor for first evac
    expect(evacWindowHours(false, 30)).toBe(18); // floor for later evacs
  });
});

describe('hordeIntensity / hordeTier / hordeLabel', () => {
  it('scales intensity linearly and clamps at 1', () => {
    expect(hordeIntensity(0)).toBe(0);
    expect(hordeIntensity(50)).toBe(0.5);
    expect(hordeIntensity(HORDE_MAX)).toBe(1);
    expect(hordeIntensity(HORDE_MAX + 50)).toBe(1);
  });

  it('buckets into tiers at the documented thresholds', () => {
    expect(hordeTier(0)).toBe('stirring');
    expect(hordeTier(24)).toBe('stirring');
    expect(hordeTier(25)).toBe('restless');
    expect(hordeTier(49)).toBe('restless');
    expect(hordeTier(50)).toBe('massing');
    expect(hordeTier(74)).toBe('massing');
    expect(hordeTier(75)).toBe('swarming');
    expect(hordeTier(99)).toBe('swarming');
    expect(hordeTier(100)).toBe('overrun');
  });

  it('labels every tier', () => {
    expect(hordeLabel(0)).toBe('Stirring');
    expect(hordeLabel(100)).toBe('Overrun');
  });
});

describe('pickDistantEvacPoi', () => {
  // isWalkable() falls back to a real Singapore-outline check even with no zone
  // bake loaded, so fixtures use real curated neighbourhood coordinates rather
  // than arbitrary offsets — an offset that drifts off the island gets dropped
  // by the walkability filter before distance is even considered.
  const spawn = { lat: 1.4382, lng: 103.789 }; // Woodlands
  const yishun = { lat: 1.4304, lng: 103.835 }; // ~5.2km from Woodlands
  const bedok = { lat: 1.3236, lng: 103.9273 }; // ~20.0km from Woodlands
  const tampines = { lat: 1.3496, lng: 103.9568 }; // ~21.1km from Woodlands
  const clementi = { lat: 1.3151, lng: 103.7654 }; // ~13.9km from Woodlands
  const jurongEast = { lat: 1.3329, lng: 103.7436 }; // ~12.8km from Woodlands

  it('filters out anything closer than MIN_FIRST_EVAC_DIST', () => {
    const near = { name: 'Near Mart', ...yishun, category: 'supermarket' };
    const result = pickDistantEvacPoi([near], spawn, new Rng('poi-1'));
    expect(result).toBeNull();
  });

  it('prefers an mrt station even when farther candidates exist in other categories', () => {
    const farMrt = { name: 'Far MRT', ...bedok, category: 'mrt' };
    const fartherSupermarket = { name: 'Farther Mart', ...tampines, category: 'supermarket' };
    const result = pickDistantEvacPoi([farMrt, fartherSupermarket], spawn, new Rng('poi-2'));
    expect(result?.name).toBe('Far MRT');
  });

  it('falls back to the farthest half of all eligible candidates when no tiered category qualifies', () => {
    const pois = [
      { name: 'Jurong East', ...jurongEast, category: 'industrial' },
      { name: 'Clementi', ...clementi, category: 'industrial' },
      { name: 'Bedok', ...bedok, category: 'industrial' },
      { name: 'Tampines', ...tampines, category: 'industrial' },
    ];
    const result = pickDistantEvacPoi(pois, spawn, new Rng('poi-3'));
    // Far half of the 4 sorted-desc candidates is the top 2 (Tampines, Bedok — both ~20km+).
    expect(result).not.toBeNull();
    expect(['Tampines', 'Bedok']).toContain(result!.name);
  });

  it('drops candidates with a too-short or blank name', () => {
    const pois = [
      { name: 'ab', ...bedok, category: 'mrt' },
      { name: '', ...bedok, category: 'mrt' },
    ];
    expect(pickDistantEvacPoi(pois, spawn, new Rng('poi-4'))).toBeNull();
  });
});

describe('pickEvacZone', () => {
  it('prefers the farthest location beyond MIN_FIRST_EVAC_DIST over a closer one', () => {
    const close = makeLocation('close', { distanceFromSpawn: 2000 });
    const far = makeLocation('far', { distanceFromSpawn: MIN_FIRST_EVAC_DIST + 5000 });
    expect(pickEvacZone([close, far])).toBe('far');
  });

  it('ignores waypoints', () => {
    const waypoint = makeLocation('wp', { category: 'waypoint', distanceFromSpawn: 999999 });
    const real = makeLocation('real', { distanceFromSpawn: 100 });
    expect(pickEvacZone([waypoint, real])).toBe('real');
  });

  it('falls back to the farthest overall when nothing clears MIN_FIRST_EVAC_DIST', () => {
    const a = makeLocation('a', { distanceFromSpawn: 100 });
    const b = makeLocation('b', { distanceFromSpawn: 500 });
    expect(pickEvacZone([a, b])).toBe('b');
  });
});

describe('pickNextEvacZone', () => {
  it('picks the farthest non-excluded, non-waypoint location from the given point', () => {
    const from = { lat: 1.3, lng: 103.8 };
    const a = makeLocation('a', { lat: north(from.lat, 1000), lng: from.lng, distanceFromSpawn: 0 });
    const b = makeLocation('b', { lat: north(from.lat, 5000), lng: from.lng, distanceFromSpawn: 0 });
    expect(pickNextEvacZone([a, b], from.lat, from.lng, null)).toBe('b');
  });

  it('excludes the given id even if it is the farthest', () => {
    const from = { lat: 1.3, lng: 103.8 };
    const a = makeLocation('a', { lat: north(from.lat, 1000), lng: from.lng });
    const b = makeLocation('b', { lat: north(from.lat, 5000), lng: from.lng });
    expect(pickNextEvacZone([a, b], from.lat, from.lng, 'b')).toBe('a');
  });
});
