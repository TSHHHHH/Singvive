import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { rollPreScavengeEvent } from './events';
import type { LocationState } from './types';

function loc(
  id: string,
  category: LocationState['category'],
  opts: Partial<LocationState> = {},
): LocationState {
  return {
    id,
    name: 'Test Site',
    category,
    lat: 1.35,
    lng: 103.82,
    size: 'medium',
    baseDanger: 2,
    currentDanger: 3,
    remainingSearches: 3,
    exhausted: false,
    cleared: false,
    looted: false,
    factionId: null,
    isFactionRevealed: false,
    isMrtStation: false,
    discovered: false,
    ...opts,
  } as LocationState;
}

describe('rollPreScavengeEvent', () => {
  it('is deterministic for the same seed and site', () => {
    const site = loc('pharm-1', 'pharmacy');
    const ctx = { day: 2, time: 'day' as const, weather: 'clear' as const, standing: {} };
    const a = rollPreScavengeEvent(new Rng('DOOR-SEED').fork('event:pharm-1:2:8'), site, ctx);
    const b = rollPreScavengeEvent(new Rng('DOOR-SEED').fork('event:pharm-1:2:8'), site, ctx);
    expect(a?.kind).toBe(b?.kind);
    expect(a?.title).toBe(b?.title);
  });

  it('can roll flooded_entry on wet weather at MRT', () => {
    const site = loc('mrt-1', 'mrt');
    const ctx = { day: 1, time: 'day' as const, weather: 'rain' as const, standing: {} };
    let hit: string | null = null;
    for (let i = 0; i < 500; i++) {
      const rng = new Rng(`flood-${i}`).fork('event:mrt-1:1:8');
      const ev = rollPreScavengeEvent(rng, site, ctx);
      if (ev?.kind === 'flooded_entry') {
        hit = ev.title;
        break;
      }
    }
    expect(hit).toBe('Knee-Deep at the Door');
  });

  it('does not roll flooded_entry in clear weather', () => {
    const site = loc('mrt-1', 'mrt');
    const ctx = { day: 1, time: 'day' as const, weather: 'clear' as const, standing: {} };
    for (let i = 0; i < 200; i++) {
      const rng = new Rng(`dry-${i}`).fork('event:mrt-1:1:8');
      const ev = rollPreScavengeEvent(rng, site, ctx);
      expect(ev?.kind).not.toBe('flooded_entry');
    }
  });

  it('can roll new doorway kinds on eligible categories', () => {
    const cases: Array<{ category: LocationState['category']; kind: string }> = [
      { category: 'supermarket', kind: 'looters_fleeing' },
      { category: 'foodcourt', kind: 'smoke_block' },
      { category: 'police', kind: 'distress_beacon' },
      { category: 'convenience', kind: 'nomad_trader' },
      { category: 'fuel', kind: 'car_blockade' },
    ];
    for (const { category, kind } of cases) {
      const site = loc(`${category}-1`, category);
      const ctx = { day: 3, time: 'day' as const, weather: 'clear' as const, standing: {} };
      let found = false;
      for (let i = 0; i < 800; i++) {
        const rng = new Rng(`${kind}-${category}-${i}`).fork(`event:${category}-1:3:8`);
        const ev = rollPreScavengeEvent(rng, site, ctx);
        if (ev?.kind === kind) {
          found = true;
          break;
        }
      }
      expect(found, `expected ${kind} at ${category}`).toBe(true);
    }
  });
});
