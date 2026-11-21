import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './store';
import { cancelPersist } from './persistRun';
import type { ItemInstance, LocationState } from './types';
import { Rng } from './rng';
import { buildStreetScene } from './streetScenes';
import type { GameEvent } from './events';

const position = { lat: 1.3, lng: 103.85 };
const site = { id: 'shelter', name: 'Shelter', ...position, category: 'convenience', size: 'small',
  baseDanger: 1, currentDanger: 1, discovered: true, remainingSearches: 4,
  exhausted: false, factionId: null, distanceFromSpawn: 0 } as LocationState;
const far = { ...site, id: 'far', name: 'Far', lat: position.lat + 0.02 } as LocationState;

beforeEach(() => {
  vi.useFakeTimers();
  useGame.setState(useGame.getInitialState(), true);
  useGame.getState().commitCharacter({ name: 'Noise tester', traitIds: [],
    attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 } });
  useGame.setState({ phase: 'game', seed: 'noise-integration', spawn: { ...position, name: 'Test' },
    currentPos: position, currentPositionId: site.id, hour: 9,
    locations: { [site.id]: { ...site }, far: { ...far } },
    meters: { hunger: 100, thirst: 100, energy: 60, infection: 0 } });
});

afterEach(() => { cancelPersist(); vi.useRealTimers(); });

const risk = (id = site.id) => useGame.getState().peekSearchRisk(id)!;
const zones = () => useGame.getState().activity.zones;

function pend(event: GameEvent) {
  useGame.setState({ pendingEvent: { locationId: site.id, event }, _eventRng: new Rng('pend') });
}

describe('disturbances in play', () => {
  it('a car alarm makes a quiet daytime shop much riskier, only nearby, until it ends', () => {
    const quiet = risk();
    const farQuiet = risk('far');
    useGame.getState().disturb('car_alarm');
    expect(risk()).toBeGreaterThan(quiet + 0.25);
    expect(risk('far')).toBe(farQuiet);
    useGame.setState({ hour: 11.9 });
    expect(risk()).toBeGreaterThan(quiet + 0.25);
    useGame.setState({ hour: 12 });
    expect(risk()).toBe(quiet);
    // POI danger itself is never rewritten.
    expect(useGame.getState().locations[site.id].currentDanger).toBe(1);
  });

  it('does not stack: a second gunshot changes nothing, and the alarm wins over a shot', () => {
    useGame.getState().disturb('gunshot');
    const one = risk();
    useGame.getState().disturb('gunshot');
    expect(zones()).toHaveLength(1);
    expect(risk()).toBe(one);
    useGame.getState().disturb('car_alarm');
    const alarm = risk();
    useGame.getState().disturb('shutter');
    expect(risk()).toBe(alarm);
  });

  it('logs a new zone once, with its reach and duration', () => {
    const before = useGame.getState().log.length;
    useGame.getState().disturb('gunshot');
    useGame.getState().disturb('gunshot');
    expect(useGame.getState().log.length).toBe(before + 1);
    expect(useGame.getState().log[0].text).toMatch(/300 m/);
  });

  it('lasts longer at night', () => {
    useGame.setState({ hour: 22 });
    useGame.getState().disturb('gunshot');
    const z = zones()[0];
    expect(z.expiresAt - z.createdAt).toBe(3);
  });

  it('a loud doorway choice leaves a zone and still gets you in', () => {
    pend({ kind: 'locked_door', factionId: null, title: 't', tell: '', text: '', choices: [
      { id: 'smash', label: 'Smash', kind: 'leave', onSuccess: [
        { t: 'disturb', kind: 'loud' }, { t: 'mark', mark: { door: true } }, { t: 'deny', line: 'in' }] },
    ] });
    useGame.getState().resolveEvent('smash');
    expect(zones().map((z) => z.kind)).toEqual(['loud']);
    expect(useGame.getState().locations[site.id].doorForced).toBe(true);
    expect(useGame.getState().pendingEvent).toBeNull();
  });

  it('a warning shot spends a round and leaves a gunshot zone', () => {
    const gun = { uid: 'g', defId: 'pistol', stack: 1, container: 'equipment', x: 0, y: 0, rotated: false,
      loadedRounds: 3, condition: 100 } as unknown as ItemInstance;
    useGame.setState({ equipment: { ...useGame.getState().equipment, firearm: gun } });
    pend({ kind: 'armed_raider', factionId: null, title: 't', tell: '', text: '', choices: [
      { id: 'warn', label: 'Warn', kind: 'leave', needs: 'loadedGun',
        onSuccess: [{ t: 'fireShot' }, { t: 'deny', line: 'they run' }] },
    ] });
    useGame.getState().resolveEvent('warn');
    expect(useGame.getState().equipment.firearm?.loadedRounds).toBe(2);
    expect(zones().map((z) => z.kind)).toEqual(['gunshot']);
  });

  it('using the car alarm as cover buys one search that ignores the zone', () => {
    const quiet = risk();
    useGame.getState().disturb('car_alarm');
    const loud = risk();
    const s = useGame.getState();
    const event = buildStreetScene('car_alarm', new Rng('scene'), s.locations[site.id], {
      day: s.day, time: 'day', weather: 'clear', standing: s.factionStanding,
    }, zones()[0].id);
    expect(event.kind).toBe('street_car_alarm');
    pend(event);
    useGame.getState().resolveEvent('cover');
    expect(risk()).toBe(quiet);
    // Leaving it ringing past the hour of cover brings the danger back.
    useGame.setState({ hour: 10.5 });
    expect(risk()).toBe(loud);
  });

  it('street scenes end on the pavement, never in a search', () => {
    const s = useGame.getState();
    for (const kind of ['car_alarm', 'gunfire', 'shutter', 'scavengers'] as const) {
      const event = buildStreetScene(kind, new Rng(kind), s.locations[site.id], {
        day: 1, time: 'day', weather: 'clear', standing: s.factionStanding,
      }, kind === 'scavengers' ? null : 'zone');
      for (const choice of event.choices) {
        for (const effects of [choice.onSuccess, choice.onFailure ?? []]) {
          expect(effects.some((e) => e.t === 'access')).toBe(false);
        }
      }
      expect(event.title).not.toMatch(/^event\./);
    }
  });
});
