import { beforeEach, describe, expect, it } from 'vitest';
import { loadRun } from './storage';
import { writeSavedRun } from './persistRun';
import { activityAt, exploreActivity, freshActivity, respondActivity, type ActivityState } from './activity';

const store = new Map<string, string>();
const key = 'singvive.run.v7';
const position = { lat: 1.3, lng: 103.85 };

beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, value: string) => void store.set(k, value),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(), key: () => null, length: 0,
  } as Storage;
});

function write(overrides: Record<string, unknown>): void {
  store.set(key, JSON.stringify({
    character: { name: 'Activity survivor', traitIds: [],
      attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 } },
    seed: 'activity-persistence', day: 12, hour: 9,
    spawn: { ...position, name: 'Home' }, currentPos: position, currentPositionId: null,
    exploredArea: [], items: [], locations: {}, equipment: {}, log: [],
    meters: { hunger: 90, thirst: 90, energy: 80, infection: 0 },
    ...overrides,
  }));
}

function explorationState(wantEvent: boolean): ActivityState {
  for (let n = 0; n < 100; n++) {
    const activity = exploreActivity(freshActivity(), {
      ...position, seed: `persisted-${n}`, distanceM: 300, now: 273,
      category: 'supermarket', weather: 'clear',
    });
    if (Boolean(activity.event) === wantEvent) return activity;
  }
  throw new Error('No matching deterministic exploration outcome');
}

describe('activity persistence through v7 loadRun', () => {
  it('keeps expired and completed incident cards when live activity has disappeared', () => {
    const activity = explorationState(true);
    const event = activity.event!;
    const history = [
      { id: 2, text: 'Resolved', tone: 'info', day: 12, hour: 9,
        activityEvent: { ...event, id: 'earlier', resolved: true, resolution: 'responded', outcome: 'The sound stops.' } },
      { id: 1, text: 'Observed', tone: 'info', day: 12, hour: 9, activityEvent: event },
    ];
    write({ activity, hour: 16, log: history });
    const loaded = loadRun()!;
    expect(loaded.activity?.event).toBeNull();
    expect(loaded.log).toEqual(history);
    expect(writeSavedRun(loaded)).toBe('ok');
    expect(loadRun()!.log).toEqual(history);
  });

  it('resumes an old max-horde save as quiet without losing the survivor or advancing the clock', () => {
    write({ hordeLevel: 100, groundZeroId: 'old-ground-zero' });
    const run = loadRun()!;
    expect(run).not.toBeNull();
    expect(run.hordeLevel).toBe(42);
    expect(run.groundZeroId).toBeNull();
    expect(run.activity).toEqual(freshActivity());
    expect(run.day).toBe(12);
    expect(run.hour).toBe(9);
    expect(run.character.name).toBe('Activity survivor');
  });

  it('round-trips live sources, a pending choice and exploration memory in the same schema slot', () => {
    const activity = explorationState(true);
    write({ activity, hordeLevel: 100 });
    const first = loadRun()!;
    expect(first.activity).toEqual(activity);
    expect(writeSavedRun(first)).toBe('ok');
    expect(store.has(key)).toBe(true);
    const again = loadRun()!;
    expect(again.activity).toEqual(activity);
    expect(again.activity?.event?.resolved).toBe(false);
    expect(again.activity?.eventClock).toEqual(activity.eventClock);
  });

  it('keeps a responded choice spent after reload while preserving residual attention', () => {
    const activity = explorationState(true);
    const responded = respondActivity(activity, 273);
    write({ activity: responded });
    const first = loadRun()!;
    expect(first.activity?.event?.resolved).toBe(true);
    expect(respondActivity(first.activity!, 273)).toEqual(first.activity);
    const event = activity.event!;
    expect(activityAt(first.activity!, event.lat, event.lng, 273)).toBeGreaterThan(0);
    expect(activityAt(first.activity!, event.lat, event.lng, 273))
      .toBeLessThan(activityAt(activity, event.lat, event.lng, 273));
    expect(writeSavedRun(first)).toBe('ok');
    expect(loadRun()!.activity).toEqual(first.activity);
  });

  it('remembers failed exploration attempts so loading cannot reroll an empty arrival', () => {
    const activity = explorationState(false);
    write({ activity });
    const loaded = loadRun()!;
    const attemptedAgain = exploreActivity(loaded.activity!, {
      ...position, seed: 'a-different-draw', distanceM: 0, now: 273,
      weather: 'clear', category: 'supermarket',
    });
    expect(attemptedAgain).toEqual(activity);
    expect(attemptedAgain.event).toBeNull();
    expect(attemptedAgain.eventClock.lastAt).toBe(273);
  });

  it('drops expired opportunities while retaining their still-audible noise', () => {
    const activity = explorationState(true);
    write({ activity, hour: 11 });
    const loaded = loadRun()!;
    expect(loaded.activity?.event).toBeNull();
    expect(loaded.activity?.sources).toHaveLength(1);
    const source = loaded.activity!.sources[0];
    expect(activityAt(loaded.activity!, source.lat, source.lng, 275)).toBeGreaterThan(0);
    expect(loaded.activity?.eventClock.lastAt).toBe(273);
    write({ activity, hour: 16 });
    expect(loadRun()!.activity?.sources).toEqual([]);
  });

  it('repairs malformed activity data without discarding the rest of the run', () => {
    write({ activity: {
      sequence: 1e30,
      sources: [{ id: 'bad', ...position, intensity: 12, radiusMeters: 1e10,
        kind: 'player', createdAt: 272, expiresAt: 1e10 }],
      eventClock: { lastAt: 1e30, distanceM: -1, day: -2, count: 100, lastKind: 'unknown' },
      event: { id: 'bad', ...position, kind: 'player', resolved: 'no', createdAt: 0, expiresAt: 1e30 },
    } });
    const loaded = loadRun()!;
    expect(loaded).not.toBeNull();
    expect(loaded.activity).toEqual(freshActivity());
    expect(loaded.character.name).toBe('Activity survivor');
    expect(loaded.day).toBe(12);
  });
});
