import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { doorwayThreat, isTerminal, rollPreScavengeEvent, threatWeight, type EventKind, type EventCtx } from './events';
import { exploreActivity, freshActivity } from './activity';
import { ensureLocale, flattenMessages } from '../i18n/t';
import en from '../i18n/messages/en.json';
import zh from '../i18n/messages/zh-Hans.json';
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

describe('doorway events read the situation', () => {
  const tally = (site: LocationState, ctx: Parameters<typeof rollPreScavengeEvent>[2], n = 3000) => {
    const counts: Record<string, number> = {};
    let fired = 0;
    for (let i = 0; i < n; i++) {
      const e = rollPreScavengeEvent(new Rng(`T${i}`).fork('event'), site, ctx);
      if (e) {
        fired++;
        counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      }
    }
    const share = (k: string) => (counts[k] ?? 0) / Math.max(1, fired);
    return { rate: fired / n, share };
  };
  const day = { day: 5, time: 'day' as const, weather: 'clear' as const, standing: {} };
  const night = { ...day, time: 'night' as const, pressure: 0.5 };

  it('fires more often at a hot doorway than a calm one', () => {
    const calm = tally(loc('s', 'supermarket', { currentDanger: 1 }), day);
    const hot = tally(loc('s', 'supermarket', { currentDanger: 4 }), night);
    expect(hot.rate).toBeGreaterThan(calm.rate + 0.2);
  });

  it('counts recent noise at the door', () => {
    const quiet = tally(loc('s', 'supermarket', { currentDanger: 2 }), day);
    const loud = tally(loc('s', 'supermarket', { currentDanger: 2, tempDangerBoost: 2 }), day);
    expect(loud.rate).toBeGreaterThan(quiet.rate + 0.1);
  });

  it('turns hostile when hot and friendly when calm', () => {
    const calm = tally(loc('s', 'supermarket', { currentDanger: 1 }), day);
    const hot = tally(loc('s', 'supermarket', { currentDanger: 4 }), night);
    expect(hot.share('armed_raider')).toBeGreaterThan(calm.share('armed_raider') * 1.5);
    expect(calm.share('quiet_tap')).toBeGreaterThan(hot.share('quiet_tap') * 2);
  });

  it('never repeats the last scene when another fits', () => {
    for (let i = 0; i < 500; i++) {
      const e = rollPreScavengeEvent(new Rng(`R${i}`).fork('event'), loc('s', 'supermarket'), {
        ...day,
        lastKind: 'rival_scavenger',
      });
      expect(e?.kind).not.toBe('rival_scavenger');
    }
  });

  it('threat stays in 0..1 and weights stay positive', () => {
    const t = doorwayThreat(loc('s', 'police', { currentDanger: 9, tempDangerBoost: 9 }), {
      ...night,
      pressure: 3,
    });
    expect(t).toBeLessThanOrEqual(1);
    expect(threatWeight('desperate_survivor', 1)).toBeGreaterThan(0);
    expect(threatWeight('armed_raider', 0)).toBeGreaterThan(0);
  });
});

const calmContext: EventCtx = { day: 5, time: 'day', weather: 'clear', standing: {}, locale: 'en' };

function scene(kind: EventKind, category: LocationState['category'], ctx = calmContext) {
  for (let i = 0; i < 12000; i++) {
    const event = rollPreScavengeEvent(new Rng(`scene-${kind}-${i}`),
      loc('scene', category, { currentDanger: 1 }), ctx);
    if (event?.kind === kind) return event;
  }
  throw new Error(`Unreachable ${kind} at ${category}`);
}

describe('months after the outbreak', () => {
  it('lets failed aid, refused contact and departure end without creating enemies', () => {
    const event = scene('desperate_survivor', 'school');
    for (const choice of event.choices) {
      for (const branch of [choice.onSuccess, choice.onFailure].filter((v) => v != null)) {
        expect(branch.some((effect) => ['fight', 'zombies', 'trespass'].includes(effect.t)), choice.id).toBe(false);
        expect(branch.at(-1)?.t, choice.id).toBe('access');
      }
    }
    expect(event.choices.some((choice) => choice.id === 'leave' && choice.kind === 'leave')).toBe(true);
    expect(event.choices.find((choice) => choice.id === 'give')?.onSuccess).toContainEqual({ t: 'intel' });
  });

  it('leaves the rest of a site available when its locked room is skipped or cannot be opened quietly', () => {
    const event = scene('locked_door', 'clinic');
    expect(event.choices.find((choice) => choice.id === 'leave')?.onSuccess.at(-1)?.t).toBe('access');
    for (const id of ['pick', 'find']) {
      expect(event.choices.find((choice) => choice.id === id)?.onFailure?.at(-1)?.t).toBe('access');
    }
    expect(event.choices.find((choice) => choice.id === 'pry')?.onFailure?.at(-1)?.t).toBe('zombies');
  });

  it('does not turn a rainwater cache into unrelated gang standing or combat', () => {
    const event = scene('quiet_tap', 'school');
    expect(event.factionId).toBeNull();
    const outcomes = event.choices.flatMap((choice) => [...choice.onSuccess, ...(choice.onFailure ?? [])]);
    expect(outcomes.some((effect) => ['standing', 'fight', 'zombies', 'trespass'].includes(effect.t))).toBe(false);
    expect(outcomes).toContainEqual({ t: 'gain', defId: 'water_bottle', count: 1 });
  });

  it('grants ordinary site access after a concealed trader declines an empty-handed exchange', () => {
    const event = scene('nomad_trader', 'convenience');
    const failed = event.choices.find((choice) => choice.id === 'trade')!.onFailure!;
    expect(failed.some((effect) => effect.t === 'deny')).toBe(false);
    expect(failed.at(-1)?.t).toBe('access');
    expect(event.choices.find((choice) => choice.id === 'leave')!.onSuccess.at(-1)?.t).toBe('access');
  });

  it('retains foreshadowed danger from armed predation, tripwires and a noisy beacon approach', () => {
    const raider = scene('armed_raider', 'police');
    expect(raider.choices.find((choice) => choice.id === 'sneak')!.onFailure).toContainEqual({ t: 'fight', foe: 'raider' });
    const rigged = scene('rigged_door', 'police');
    const triggered = rigged.choices.find((choice) => choice.id === 'disarm')!.onFailure!;
    expect(triggered.some((effect) => effect.t === 'wound')).toBe(true);
    expect(triggered.some((effect) => effect.t === 'noise')).toBe(true);
    expect(triggered.at(-1)?.t).toBe('zombies');
    expect(scene('distress_beacon', 'police').choices.find((choice) => choice.id === 'rush')!.onSuccess.at(-1)?.t).toBe('zombies');
  });

  it('excludes friendly human contact from very dangerous, noisy or overrun sites', () => {
    for (const [site, ctx] of [
      [loc('hot', 'convenience', { currentDanger: 5 }), calmContext],
      [loc('loud', 'school', { currentDanger: 2, tempDangerBoost: 3 }), calmContext],
      [loc('overrun', 'landmark', { currentDanger: 1 }), { ...calmContext, pressure: 1 }],
    ] as const) {
      for (let n = 0; n < 1800; n++) {
        const event = rollPreScavengeEvent(new Rng(`hot-${n}`), site, ctx);
        expect(['desperate_survivor', 'rival_scavenger', 'nomad_trader']).not.toContain(event?.kind);
      }
    }
  });

  it('makes direct human contact a minority of calm doorway events', () => {
    let humans = 0;
    let total = 0;
    for (let n = 0; n < 4000; n++) {
      const event = rollPreScavengeEvent(new Rng(`scarce-${n}`), loc('s', 'supermarket', { currentDanger: 1 }), calmContext);
      if (!event) continue;
      total++;
      if (['desperate_survivor', 'rival_scavenger', 'nomad_trader', 'armed_raider'].includes(event.kind)) humans++;
    }
    expect(total).toBeGreaterThan(500);
    expect(humans / total).toBeLessThan(0.2);
  });

  it('offers abandoned traces rather than only people at homes and community sites', () => {
    for (const category of ['housing', 'eatery', 'community', 'landmark'] as const) {
      const kinds = new Set<string>();
      for (let n = 0; n < 1000; n++) {
        const event = rollPreScavengeEvent(new Rng(`trace-${n}`), loc('s', category, { currentDanger: 1 }), calmContext);
        if (event) kinds.add(event.kind);
      }
      expect(kinds.has('block_tout'), category).toBe(true);
    }
  });

  it('keeps hidden-room scenes out of open parks and connective waypoints', () => {
    for (const category of ['park', 'waypoint'] as const) for (let n = 0; n < 500; n++) {
      expect(rollPreScavengeEvent(new Rng(`open-${n}`), loc('open', category), calmContext)).toBeNull();
    }
  });

  it('uses a single final terminal outcome in every doorway choice branch', () => {
    const kinds: [EventKind, LocationState['category']][] = [
      ['locked_door', 'police'], ['desperate_survivor', 'school'], ['rival_scavenger', 'supermarket'],
      ['armed_raider', 'police'], ['block_tout', 'school'], ['rigged_door', 'police'],
      ['quiet_tap', 'school'], ['body_in_the_doorway', 'clinic'], ['looters_fleeing', 'supermarket'],
      ['smoke_block', 'industrial'], ['distress_beacon', 'police'], ['nomad_trader', 'convenience'],
      ['car_blockade', 'fuel'], ['flooded_entry', 'mrt'],
    ];
    for (const [kind, category] of kinds) for (const choice of scene(kind, category, { ...calmContext, weather: 'rain' }).choices) {
      for (const branch of [choice.onSuccess, choice.onFailure].filter((v) => v != null)) {
        expect(branch.filter(isTerminal), `${kind}.${choice.id}`).toHaveLength(1);
        expect(isTerminal(branch.at(-1)!), `${kind}.${choice.id}`).toBe(true);
      }
    }
  });

  it('makes a lone street contact rarer than environmental disturbances and absent in heavy rain', () => {
    let contacts = 0;
    let fired = 0;
    for (let n = 0; n < 2400; n++) {
      const input = { seed: `street-${n}`, lat: 1.3, lng: 103.8, distanceM: 300, now: 3,
        weather: 'clear' as const, category: 'supermarket' as const };
      const event = exploreActivity(freshActivity(), input).event;
      if (event) fired++;
      if (event?.kind === 'scavengers') contacts++;
      expect(exploreActivity(freshActivity(), { ...input, weather: 'thunderstorm' }).event?.kind).not.toBe('scavengers');
    }
    expect(contacts).toBeGreaterThan(0);
    expect(contacts / fired).toBeLessThan(0.12);
  });

  it('resolves doorway outcome copy and every pool entry in both locales with matching variables', async () => {
    await ensureLocale('zh-Hans');
    const english = flattenMessages(en.event);
    const chinese = new Map(flattenMessages(zh.event).map(({ key, value }) => [key, value]));
    expect([...chinese.keys()].sort()).toEqual(english.map(({ key }) => key).sort());
    const variables = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const { key, value } of english) {
      expect(chinese.get(key)?.trim(), key).toBeTruthy();
      expect(variables(chinese.get(key)!), key).toEqual(variables(value));
    }
    for (const locale of ['en', 'zh-Hans'] as const) for (const kind of ['desperate_survivor', 'nomad_trader', 'quiet_tap'] as const) {
      const event = scene(kind, kind === 'nomad_trader' ? 'convenience' : 'school', { ...calmContext, locale });
      const copy = [event.title, event.tell, event.text, ...event.choices.flatMap((choice) =>
        [choice.label, ...[...choice.onSuccess, ...(choice.onFailure ?? [])].flatMap((effect) => 'line' in effect ? [effect.line] : [])])];
      expect(copy.every((value) => value.length > 0 && !value.startsWith('event.') && !/[{}]/.test(value))).toBe(true);
    }
  });
});
