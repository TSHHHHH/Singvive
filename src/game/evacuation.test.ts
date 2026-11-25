import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './store';
import { cancelPersist, flushPersist } from './persistRun';
import { loadRun } from './storage';
import { restoreEvacuation } from './goal';
import type { LocationState } from './types';

const site = { id: 'evac', name: 'Assembly point', lat: 1.3, lng: 103.85,
  category: 'school', size: 'small', baseDanger: 1, currentDanger: 1,
  discovered: true, remainingSearches: 1, factionId: null, distanceFromSpawn: 9000 } as LocationState;

beforeEach(() => {
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  });
  vi.useFakeTimers();
  useGame.setState(useGame.getInitialState(), true);
  useGame.getState().commitCharacter({ name: 'Survivor', traitIds: [],
    attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 } });
  useGame.setState({ phase: 'game', seed: 'evacuation', day: 1, hour: 8,
    spawn: { lat: site.lat, lng: site.lng, name: 'Start' },
    locations: { evac: { ...site } }, currentPos: { lat: site.lat, lng: site.lng },
    currentPositionId: 'evac', evacZoneId: 'evac', evacDeadline: 20, items: [],
    meters: { hunger: 100, thirst: 100, energy: 100, infection: 0 } });
});
afterEach(() => { cancelPersist(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('evacuation admission', () => {
  it('confirms contact then boards with an empty backpack, without spending time', () => {
    useGame.getState().callEvac();
    expect(useGame.getState().escaped).toBe(false);
    useGame.getState().callEvac();
    expect(useGame.getState().escaped).toBe(true);
    expect(useGame.getState().hour).toBe(8);
    expect(useGame.getState().items).toEqual([]);
  });

  it('does not permit an expired operation even if the clock tick has not processed it', () => {
    useGame.setState({ hour: 20 });
    useGame.getState().callEvac();
    expect(useGame.getState().evacZoneId).toBeNull();
    expect(useGame.getState().evacCooldownUntil).toBeGreaterThan(20);
    expect(useGame.getState().escaped).toBe(false);
  });

  it('cannot call from another place', () => {
    useGame.setState({ currentPositionId: null });
    useGame.getState().callEvac();
    useGame.getState().callEvac();
    expect(useGame.getState().escaped).toBe(false);
  });

  it('does not board or grant contact while the run is not active', () => {
    useGame.setState({ phase: 'menu' });
    useGame.getState().callEvac();
    expect(useGame.getState().log).toHaveLength(0);
  });

  it('cannot bypass an unresolved event to report', () => {
    useGame.setState({ pendingEvent: { locationId: 'evac', event: {
      kind: 'locked_door', title: 'Room', tell: 'A door', text: 'A room inside',
      factionId: null, choices: [],
    } } });
    useGame.getState().callEvac();
    expect(useGame.getState().evacContacted).toBe(false);
    expect(useGame.getState().log).toHaveLength(0);
  });

  it('persists contact in the existing v7 slot and restores it without cargo', () => {
    useGame.getState().callEvac();
    flushPersist();
    expect(localStorage.getItem('singvive.run.v7')).not.toBeNull();
    const saved = loadRun()!;
    expect(saved.evacContacted).toBe(true);
    useGame.setState(restoreEvacuation(saved));
    useGame.getState().callEvac();
    expect(useGame.getState().escaped).toBe(true);
    expect(localStorage.getItem('singvive.run.v7')).toBeNull();
  });

  it('cannot board at the deadline even after contact, and saves the next update', () => {
    useGame.getState().callEvac();
    useGame.setState({ hour: 20 });
    useGame.getState().callEvac();
    flushPersist();
    const saved = loadRun()!;
    expect(restoreEvacuation(saved)).toMatchObject({ evacZoneId: null, evacContacted: false,
      evacCooldownUntil: useGame.getState().evacCooldownUntil });
    expect(useGame.getState().escaped).toBe(false);
  });

  it('announces the next reachable operation after the published wait without an item or clue', () => {
    useGame.setState({ evacZoneId: null, evacDeadline: null, evacCooldownUntil: 8.1 });
    useGame.getState().rest(1);
    const s = useGame.getState();
    expect(s.evacZoneId).toBe('evac');
    expect(s.evacDeadline).toBeGreaterThan(s.hour);
    expect(s.evacCooldownUntil).toBeNull();
    expect(s.evacContacted).toBe(false);
    expect(s.log.some(entry => entry.focus?.label === site.name)).toBe(true);
  });
});
