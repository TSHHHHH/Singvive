import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './store';
import { cancelPersist } from './persistRun';
import type { ItemInstance, LocationState } from './types';
import { activityAt, addActivity, freshActivity, type ActivityEventKind } from './activity';
import { addToCarry } from './inventory';

const position = { lat: 1.3, lng: 103.85 };
const site = { id: 'shelter', name: 'Shelter', ...position, category: 'clinic', size: 'small',
  baseDanger: 1, currentDanger: 1, discovered: true, remainingSearches: 4,
  exhausted: false, factionId: null, distanceFromSpawn: 0 } as LocationState;

beforeEach(() => {
  vi.useFakeTimers();
  useGame.setState(useGame.getInitialState(), true);
  useGame.getState().commitCharacter({ name: 'Noise tester', traitIds: [],
    attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 } });
  useGame.setState({ phase: 'game', seed: 'noise-integration', spawn: { ...position, name: 'Test' },
    currentPos: position, currentPositionId: site.id, locations: { [site.id]: { ...site } },
    meters: { hunger: 100, thirst: 100, energy: 60, infection: 0 } });
});

afterEach(() => { cancelPersist(); vi.useRealTimers(); });

const item = (defId: string, patch: Partial<ItemInstance> = {}): ItemInstance => ({
  uid: `test-${defId}`, defId, stack: 1, container: 'backpack', x: 0, y: 0, rotated: false, ...patch,
});

function nearbyEvent(kind: ActivityEventKind = 'car_alarm'): void {
  const s = useGame.getState();
  const now = (s.day - 1) * 24 + s.hour;
  const activity = addActivity(freshActivity(), {
    ...position, radiusMeters: 500, intensity: 0.9, kind,
  }, now);
  useGame.setState({ activity: {
    ...activity,
    event: { id: activity.sources[0].id, kind, ...position,
      createdAt: now, expiresAt: now + 1.5, resolved: false },
    eventClock: { lastAt: now, distanceM: 0, day: s.day, count: 1, lastKind: kind,
      anchorLat: position.lat, anchorLng: position.lng },
  } });
}

describe('local activity integration', () => {
  it('keeps the response outcome on its original timeline card', () => {
    nearbyEvent();
    const event = useGame.getState().activity.event!;
    useGame.setState({ log: [{ id: 100, text: 'Alarm', tone: 'info', day: 1, hour: 8, activityEvent: event }] });
    useGame.getState().respondToActivity(event.id);
    const card = useGame.getState().log.find((e) => e.id === 100)!;
    expect(card.activityEvent?.resolution).toBe('responded');
    expect(card.activityEvent?.outcome).toContain('sound stops');
    expect(useGame.getState().log.filter((entry) => entry.text === card.activityEvent?.outcome)).toHaveLength(0);
  });

  it('cannot use an old timeline card to respond to or dismiss a newer event', () => {
    nearbyEvent();
    const before = useGame.getState();
    before.respondToActivity('old-event');
    before.dismissActivity('old-event');
    expect(useGame.getState().activity).toBe(before.activity);
    expect(useGame.getState().meters).toBe(before.meters);
    expect(useGame.getState().hour).toBe(before.hour);
  });

  it('keeps dismissed cards and their noise in history', () => {
    nearbyEvent();
    const event = useGame.getState().activity.event!;
    const sources = useGame.getState().activity.sources;
    useGame.setState({ log: [{ id: 100, text: 'Alarm', tone: 'info', day: 1, hour: 8, activityEvent: event }] });
    useGame.getState().dismissActivity(event.id);
    expect(useGame.getState().log[0].activityEvent?.resolution).toBe('dismissed');
    expect(useGame.getState().activity.sources).toBe(sources);
  });

  it('survives midnight even with a legacy maxed horde value', () => {
    useGame.setState({ day: 30, hour: 23.5, hordeLevel: 100 });
    useGame.getState().rest(1);
    expect(useGame.getState().day).toBe(31);
    expect(useGame.getState().phase).toBe('game');
    expect(useGame.getState().deathCause).not.toBe('overrun');
  });

  it('does not increase global danger when a day passes', () => {
    useGame.setState({ hour: 23.5, hordeLevel: 42 });
    useGame.getState().rest(1);
    expect(useGame.getState().hordeLevel).toBe(42);
  });

  it('noise changes search risk without also rewriting POI danger', () => {
    const before = useGame.getState().peekSearchRisk(site.id)!;
    const locations = useGame.getState().locations;
    useGame.getState().emitNoise(position.lat, position.lng, 350, 2);
    expect(useGame.getState().peekSearchRisk(site.id)).toBeGreaterThan(before);
    expect(useGame.getState().locations).toBe(locations);
    expect(useGame.getState().locations[site.id].tempDangerBoost ?? 0).toBe(0);
  });

  it('raises risk only near the disturbance and lets that risk settle with game time', () => {
    const far = { ...site, id: 'far', lat: position.lat + 0.02 };
    useGame.setState({ hour: 8, locations: { [site.id]: { ...site }, far } });
    const nearbyQuiet = useGame.getState().peekSearchRisk(site.id)!;
    const farQuiet = useGame.getState().peekSearchRisk('far')!;
    useGame.getState().emitNoise(position.lat, position.lng, 350, 3);
    const loud = useGame.getState().peekSearchRisk(site.id)!;
    expect(loud).toBeGreaterThan(nearbyQuiet);
    expect(useGame.getState().peekSearchRisk('far')).toBe(farQuiet);
    useGame.setState({ hour: 11 });
    expect(useGame.getState().peekSearchRisk(site.id)).toBeGreaterThan(nearbyQuiet);
    expect(useGame.getState().peekSearchRisk(site.id)).toBeLessThan(loud);
    useGame.setState({ hour: 14 });
    expect(useGame.getState().peekSearchRisk(site.id)).toBe(nearbyQuiet);
  });

  it('raises open-ground rest risk locally and returns to the quiet preview after decay', () => {
    // This fixed seed has no pre-existing night swarm at the test point.
    useGame.setState({ seed: 'rest-fixture-1', hour: 8, currentPositionId: null,
      spawn: { ...position, lat: 1.31, name: 'Away' } });
    const quiet = useGame.getState().peekRestPreview().ambushChance;
    useGame.getState().emitNoise(position.lat, position.lng, 350, 3);
    expect(useGame.getState().peekRestPreview().ambushChance).toBeGreaterThan(quiet);
    useGame.setState({ currentPos: { ...position, lat: position.lat + 0.02 } });
    const farNoisy = useGame.getState().peekRestPreview().ambushChance;
    const activity = useGame.getState().activity;
    useGame.setState({ activity: freshActivity() });
    expect(useGame.getState().peekRestPreview().ambushChance).toBe(farNoisy);
    useGame.setState({ activity, currentPos: position, hour: 14 });
    expect(useGame.getState().peekRestPreview().ambushChance).toBe(quiet);
  });

  it.each(['car_alarm', 'shutter'] as const)('charges time and energy to quiet %s only once', (kind) => {
    nearbyEvent(kind);
    const before = useGame.getState();
    const now = (before.day - 1) * 24 + before.hour;
    const loud = activityAt(before.activity, position.lat, position.lng, now);
    before.respondToActivity();
    const after = useGame.getState();
    expect(after.hour - before.hour).toBeCloseTo(0.25);
    expect(before.meters.energy - after.meters.energy).toBeGreaterThanOrEqual(4);
    expect(before.meters.energy - after.meters.energy).toBeLessThan(6);
    expect(after.activity.event?.resolved).toBe(true);
    const residual = activityAt(after.activity, position.lat, position.lng, now + 0.25);
    expect(residual).toBeGreaterThan(0);
    expect(residual).toBeLessThan(loud);
    after.respondToActivity();
    expect(useGame.getState().hour).toBe(after.hour);
    expect(useGame.getState().meters).toBe(after.meters);
    expect(useGame.getState().items).toBe(after.items);
    expect(useGame.getState().activity).toBe(after.activity);
  });

  it.each(['car_alarm', 'shutter', 'gunfire'] as const)('refuses %s without enough energy', (kind) => {
    nearbyEvent(kind);
    useGame.setState({ meters: { ...useGame.getState().meters, energy: kind === 'gunfire' ? 4.9 : 3.9 } });
    const before = useGame.getState();
    before.respondToActivity();
    expect(useGame.getState().hour).toBe(before.hour);
    expect(useGame.getState().meters).toBe(before.meters);
    expect(useGame.getState().activity.event?.resolved).toBe(false);
  });

  it('requires reaching the observed scene and refuses expired opportunities', () => {
    nearbyEvent();
    useGame.setState({ currentPos: { ...position, lat: position.lat + 0.002 } });
    const before = useGame.getState();
    before.respondToActivity();
    expect(useGame.getState().hour).toBe(before.hour);
    expect(useGame.getState().activity).toBe(before.activity);
    useGame.setState({ currentPos: position, hour: before.hour + 1.5 });
    const expired = useGame.getState();
    expired.respondToActivity();
    expect(useGame.getState().hour).toBe(expired.hour);
    expect(useGame.getState().activity.event?.resolved).toBe(false);
  });

  it('allows a response after reaching the scene vicinity without requiring its exact coordinate', () => {
    nearbyEvent();
    useGame.setState({ currentPos: { ...position, lat: position.lat + 0.0009 } });
    const hour = useGame.getState().hour;
    useGame.getState().respondToActivity();
    expect(useGame.getState().activity.event?.resolved).toBe(true);
    expect(useGame.getState().hour - hour).toBeCloseTo(0.25);
  });

  it.each(['menu', 'no-character'] as const)('cannot resolve an opportunity from %s', (mode) => {
    nearbyEvent();
    useGame.setState(mode === 'menu' ? { phase: 'menu' } : { character: null });
    const before = useGame.getState();
    before.respondToActivity();
    expect(useGame.getState().hour).toBe(before.hour);
    expect(useGame.getState().activity).toBe(before.activity);
    expect(useGame.getState().meters).toBe(before.meters);
  });

  it.each(['combat', 'pendingEvent', 'pendingSearch', 'travelAnim', 'hdb', 'tunnel'] as const)(
    'keeps a response untouched while %s is in progress', (busy) => {
      nearbyEvent();
      // Only the presence of the in-flight operation is relevant: it must be rejected before inspection.
      useGame.setState({ [busy]: {} } as Partial<ReturnType<typeof useGame.getState>>);
      const before = useGame.getState();
      before.respondToActivity();
      expect(useGame.getState().hour).toBe(before.hour);
      expect(useGame.getState().meters).toBe(before.meters);
      expect(useGame.getState().items).toBe(before.items);
      expect(useGame.getState().activity).toBe(before.activity);
    },
  );

  it('leaves the noise behind when an opportunity is dismissed', () => {
    nearbyEvent();
    const before = useGame.getState();
    before.dismissActivity();
    const after = useGame.getState();
    expect(after.activity.event?.resolved).toBe(true);
    expect(after.activity.sources).toEqual(before.activity.sources);
    expect(after.hour).toBe(before.hour);
    expect(after.meters).toBe(before.meters);
    after.respondToActivity();
    expect(useGame.getState().hour).toBe(before.hour);
    expect(useGame.getState().activity.sources).toEqual(before.activity.sources);
  });

  it.each([
    { label: 'no bottle', items: [] },
    { label: 'a cached bottle', items: [item('water_bottle', { container: site.id })] },
    { label: 'unsafe water', items: [item('water_bottle', { contaminationRisk: 8 })] },
    { label: 'an empty stack', items: [item('newater', { stack: 0 })] },
    { label: 'a different drink', items: [item('dirty_water')] },
  ])('refuses a scavenger trade with $label', ({ items }) => {
    nearbyEvent('scavengers');
    useGame.setState({ items });
    const before = useGame.getState();
    before.respondToActivity();
    expect(useGame.getState().hour).toBe(before.hour);
    expect(useGame.getState().items).toBe(before.items);
    expect(useGame.getState().activity.event?.resolved).toBe(false);
  });

  it('trades exactly one carried clean bottle for nearby intel only once', () => {
    nearbyEvent('scavengers');
    const near = { ...site, id: 'near-intel', name: 'Nearby supplies', lat: position.lat + 0.002, discovered: false };
    const far = { ...site, id: 'far-intel', name: 'Distant supplies', lat: position.lat + 0.02, discovered: false };
    useGame.setState({ items: [item('newater', { stack: 2, container: 'loose' })],
      locations: { [site.id]: { ...site }, [near.id]: near, [far.id]: far } });
    const before = useGame.getState();
    before.respondToActivity();
    const after = useGame.getState();
    expect(after.items.find((i) => i.defId === 'newater')?.stack).toBe(1);
    expect(after.locations[near.id].discovered).toBe(true);
    expect(after.locations[far.id].discovered).toBe(false);
    expect(after.hour - before.hour).toBeCloseTo(1 / 6);
    expect(before.meters.energy - after.meters.energy).toBeLessThan(1);
    expect(after.activity.event?.resolved).toBe(true);
    after.respondToActivity();
    expect(useGame.getState().items).toBe(after.items);
    expect(useGame.getState().hour).toBe(after.hour);
  });

  it('carries gunfire salvage loose when the pack is full and cannot claim it twice', () => {
    nearbyEvent('gunfire');
    const packed = addToCarry([], 'lockpick', 200).items;
    expect(packed.some((i) => i.container === 'loose')).toBe(true);
    useGame.setState({ items: packed });
    const before = useGame.getState();
    before.respondToActivity();
    const after = useGame.getState();
    const salvage = after.items.filter((i) => i.defId === 'scrap_metal');
    expect(salvage.reduce((n, i) => n + i.stack, 0)).toBe(2);
    expect(salvage.every((i) => i.container === 'loose')).toBe(true);
    expect(after.hour - before.hour).toBeCloseTo(1 / 3);
    expect(before.meters.energy - after.meters.energy).toBeGreaterThanOrEqual(5);
    after.respondToActivity();
    expect(useGame.getState().items).toBe(after.items);
    expect(useGame.getState().hour).toBe(after.hour);
  });
});
