import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  addHeat,
  COOL_PER_HOUR,
  coolLevels,
  generateDungeon,
  hdbScar,
  isOpen,
  isSafeLanding,
  isStripModel,
  landingCount,
  landingRange,
  levelHeat,
  MAX_HEIGHT,
  MIN_HEIGHT,
  migrateHdbDungeon,
  peakHeat,
  realStoreysOf,
  ROOF_FOB,
  sealedStoreys,
  SPILL,
  STAIR_MINUTES,
  storeyLabel,
  storeyOf,
  storeysFromRoof,
  travelPlan,
  type HdbDungeon,
} from './hdbDungeon';
import type { LocationState } from './types';

const site = {
  id: 'blk-612c',
  name: 'Blk 612C',
  category: 'residential',
  lat: 1.4,
  lng: 103.9,
  size: 'large',
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
} as LocationState;

function block(seed: string, storeys?: number | null): HdbDungeon {
  return generateDungeon(new Rng(seed), site, 'estate', { storeys });
}

const SEEDS = Array.from({ length: 40 }, (_, i) => `SEED-${i}`);

describe('real height sets the scale, not the content', () => {
  it.each([3, 8, 18, 40])('%i storeys keeps landings inside its band', (storeys) => {
    const [lo, hi] = landingRange(storeys);
    for (const seed of SEEDS) {
      const d = block(seed, storeys);
      const landings = landingCount(d);
      expect(landings).toBeGreaterThanOrEqual(lo);
      expect(landings).toBeLessThanOrEqual(hi);
      // A sealed span at most between each pair of landings.
      expect(d.height).toBeLessThanOrEqual(2 * landings - 1);
      expect(realStoreysOf(d)).toBe(storeys);
    }
  });

  it('labels rise strictly and the roof row is the real top storey', () => {
    for (const seed of SEEDS) {
      const d = block(seed, 24);
      for (let l = 2; l <= d.height; l++) expect(storeyOf(d, l)).toBeGreaterThan(storeyOf(d, l - 1));
      expect(storeyOf(d, 1)).toBe(1);
      expect(d.floors[d.height - 1].roof).toBe(true);
      expect(storeyOf(d, d.height)).toBe(24);
    }
  });

  it('sealed spans cover exactly the storeys between landings', () => {
    for (const seed of SEEDS) {
      const d = block(seed, 30);
      const open = d.floors.filter((f) => !f.sealed).length;
      expect(open + sealedStoreys(d)).toBe(30);
      for (const f of d.floors) {
        if (!f.span) continue;
        expect(f.sealed).toBeTruthy();
        expect(f.units).toHaveLength(0);
      }
    }
  });

  it('is deterministic for the same seed and height', () => {
    expect(block('SAME', 22)).toEqual(block('SAME', 22));
  });

  it('falls back to the old 10–16 storeys with no roof', () => {
    for (const seed of SEEDS) {
      const real = realStoreysOf(block(seed, null));
      expect(real).toBeGreaterThanOrEqual(MIN_HEIGHT);
      expect(real).toBeLessThanOrEqual(MAX_HEIGHT);
    }
  });

  it('reads storeys from a roof in metres, clamped', () => {
    expect(storeysFromRoof(undefined)).toBeNull();
    expect(storeysFromRoof(0)).toBeNull();
    expect(storeysFromRoof(28)).toBe(10);
    expect(storeysFromRoof(4)).toBe(3);
    expect(storeysFromRoof(400)).toBe(50);
  });
});

describe('landing themes', () => {
  it('deals mid landings without repeats (ordinary at most twice)', () => {
    for (const seed of SEEDS) {
      const d = block(seed, 40);
      const themes = d.floors.map((f) => f.theme).filter((t) => t !== undefined);
      const counts = new Map<string, number>();
      for (const t of themes) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [t, n] of counts) expect(n, t).toBeLessThanOrEqual(t === 'ordinary' ? 2 : 1);
      // Ground and roof never carry a theme.
      expect(d.floors[0].theme).toBeUndefined();
      expect(d.floors[d.height - 1].theme).toBeUndefined();
    }
  });

  it('only deals a refuge floor at 20 storeys or more', () => {
    let sawRefuge = false;
    for (const seed of SEEDS) {
      for (const storeys of [8, 14, 19]) {
        expect(block(seed, storeys).floors.some((f) => f.theme === 'refuge')).toBe(false);
      }
      const tall = block(seed, 36);
      const refuge = tall.floors.findIndex((f) => f.theme === 'refuge');
      if (refuge >= 0) {
        sawRefuge = true;
        expect(isSafeLanding(tall, refuge + 1)).toBe(true);
      }
    }
    expect(sawRefuge).toBe(true);
  });

  it('keeps its promised door on every themed landing', () => {
    const promised = { holdout: 'holdout', fire: 'burning', nest: 'stocked', picked_over: 'notice', refuge: 'shelter' };
    for (const seed of SEEDS) {
      for (const f of block(seed, 32).floors) {
        if (!f.theme || f.theme === 'ordinary') continue;
        const want = promised[f.theme];
        expect(f.units.some((u) => u.type === want && u.available), `${f.theme} → ${want}`).toBe(true);
      }
    }
  });
});

const openLevels = (d: HdbDungeon) => d.floors.filter((f) => isOpen(d, f.level)).map((f) => f.level);

describe('travelPlan', () => {
  it('going down crosses every open landing and skips sealed spans', () => {
    for (const seed of SEEDS) {
      const d = block(seed, 40);
      if (!d.floors.some((f) => !!f.span)) continue;
      const open = openLevels(d);
      const top = open[open.length - 1];
      const plan = travelPlan(d, top, 1);
      const want = open.filter((l) => l < top).reverse();
      expect(plan.crossings.map((c) => c.level)).toEqual(want);
      expect(plan.crossings.every((c) => c.descent)).toBe(true);
      expect(plan.crossings.every((c) => isOpen(d, c.level))).toBe(true);
      return;
    }
    throw new Error('no seed produced a sealed span at 40 storeys');
  });

  it('climbing rolls no descent checks', () => {
    const d = block('CLIMB', 30);
    const open = openLevels(d);
    const plan = travelPlan(d, 1, open[open.length - 1]);
    expect(plan.crossings.length).toBeGreaterThan(0);
    expect(plan.crossings.some((c) => c.descent)).toBe(false);
  });

  it('minutes scale with storeys moved and load', () => {
    const d = block('MINUTES', 30);
    const open = openLevels(d);
    const top = open[open.length - 1];
    const storeys = storeyOf(d, top) - storeyOf(d, 1);
    expect(travelPlan(d, 1, top).minutes).toBe(storeys * STAIR_MINUTES);
    expect(travelPlan(d, top, 1, 1.5).minutes).toBe(storeys * STAIR_MINUTES * 1.5);
    expect(travelPlan(d, top, top)).toEqual({ minutes: 0, crossings: [] });
  });

  it('flags a Swarm landing on the way as a hunt', () => {
    const d = block('HUNT', 30);
    const open = openLevels(d).filter((l) => !isSafeLanding(d, l));
    const mid = open[Math.floor(open.length / 2)];
    const hot = addHeat(d, 100, mid);
    const plan = travelPlan(hot, open[open.length - 1], 1);
    expect(plan.crossings.find((c) => c.level === mid)?.hunt).toBe(true);
    expect(plan.crossings.filter((c) => c.hunt)).toHaveLength(1);
  });
});

describe('per-landing heat', () => {
  it('spill reaches only the open landings either side, capped at 100', () => {
    const d = block('SPILL', 30);
    const open = openLevels(d);
    const i = Math.floor(open.length / 2);
    const [below, mid, above] = [open[i - 1], open[i], open[i + 1]];
    const hot = addHeat(d, 40, mid, 0.5);
    for (const f of hot.floors) {
      const want = f.level === mid ? 40 : f.level === below || f.level === above ? 20 : 0;
      expect(f.heatLevel, `level ${f.level}`).toBe(want);
    }
    const capped = addHeat(addHeat(hot, 90, mid, 0.5), 90, mid, 0.5);
    expect(levelHeat(capped, mid)).toBe(100);
    expect(levelHeat(capped, above)).toBe(100);
  });

  it('a door adds no spill by default', () => {
    const d = block('DOOR', 30);
    const mid = openLevels(d)[2];
    const hot = addHeat(d, 15, mid, SPILL.door);
    expect(hot.floors.filter((f) => f.heatLevel > 0).map((f) => f.level)).toEqual([mid]);
  });

  it('peakHeat is the hottest landing and blockHeat mirrors it', () => {
    const d = block('PEAK', 30);
    const [a, b] = openLevels(d).slice(1, 3);
    const hot = addHeat(addHeat(d, 30, a), 55, b);
    expect(peakHeat(hot)).toBe(55);
    expect(hot.blockHeat).toBe(55);
  });

  it('cooling skips the landing you are on and stops at 0', () => {
    const d = block('COOL', 30);
    const [a, b] = openLevels(d).slice(1, 3);
    const hot = addHeat(addHeat(d, 4, a), 50, b);
    const cooled = coolLevels(hot, 120, b);
    expect(levelHeat(cooled, b)).toBe(50);
    expect(levelHeat(cooled, a)).toBe(0);
    const away = coolLevels(hot, 60, 1);
    expect(levelHeat(away, b)).toBe(50 - COOL_PER_HOUR);
    expect(coolLevels(d, 60, 1)).toBe(d);
  });
});

describe('old saves', () => {
  it('keeps a pre-height cutaway playable: rows read as storeys', () => {
    const fresh = block('LEGACY', null);
    const legacy: HdbDungeon = {
      ...fresh,
      realStoreys: undefined,
      floors: fresh.floors.map(({ storey: _s, span: _p, theme: _t, ...f }) => f),
    };
    const d = migrateHdbDungeon(legacy);
    expect(realStoreysOf(d)).toBe(d.height);
    expect(storeyLabel(d, 3)).toBe('03');
    expect(landingCount(d)).toBeGreaterThan(0);
  });
});

describe('maze saves', () => {
  it('become strips: back on 01, doors and heat kept, open gate opens the hatch', () => {
    const fresh = block('MAZE', 24);
    const lvl = openLevels(fresh)[2];
    const unit = fresh.floors[lvl - 1].units.find((u) => u.available)!;
    const worked = addHeat(fresh, 42, lvl);
    const legacy = {
      ...worked,
      v: undefined,
      floors: worked.floors.map((f) =>
        f.level !== lvl
          ? f
          : { ...f, units: f.units.map((u) => (u.id === unit.id ? { ...u, state: 'cleared' as const, holdsKey: 'gate-3' } : u)) },
      ),
      pos: { level: lvl, column: 2 },
      currentLevel: lvl,
      keys: ['gate-3'],
      stairs: [{ level: 1, column: 0 }],
      stripWidth: 5,
      unitColumns: { [unit.id]: 1 },
      blocks: { 'v:1:0': { kind: 'gate', open: true } },
    } as unknown as HdbDungeon;

    const d = migrateHdbDungeon(legacy);
    expect(isStripModel(d)).toBe(true);
    expect(d.pos).toEqual({ level: 1 });
    expect(d.currentLevel).toBe(1);
    expect(d.roofOpen).toBe(true);
    expect(levelHeat(d, lvl)).toBe(42);
    expect(d.blockHeat).toBe(42);
    expect(d.keys).toEqual([ROOF_FOB]);
    const u = d.floors[lvl - 1].units.find((x) => x.id === unit.id)!;
    expect(u.state).toBe('cleared');
    expect(u.holdsKey).toBe(ROOF_FOB);
    for (const k of ['stairs', 'stripWidth', 'unitColumns', 'blocks']) expect(k in d).toBe(false);
    expect(migrateHdbDungeon(d)).toEqual(d);
  });
});

describe('hdbScar', () => {
  it('counts cleared doors over the doors that exist', () => {
    const d = block('SCAR', 18);
    const before = hdbScar(d);
    expect(before.cleared).toBe(0);
    expect(before.clearedFrac).toBe(0);
    expect(before.realStoreys).toBe(18);

    let cleared = 0;
    const worked: HdbDungeon = {
      ...d,
      floors: d.floors.map((f) => ({
        ...f,
        units: f.units.map((u) => {
          if (!u.available || cleared >= 2) return u;
          cleared += 1;
          return { ...u, state: 'cleared' as const };
        }),
      })),
    };
    const after = hdbScar(worked);
    expect(after.cleared).toBe(2);
    expect(after.doors).toBe(before.doors);
    expect(after.clearedFrac).toBeCloseTo(2 / before.doors);
    expect(after.sealedStoreys).toBe(sealedStoreys(d));
  });
});
