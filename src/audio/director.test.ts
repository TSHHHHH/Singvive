import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from '../game/store';
import { cancelPersist } from '../game/persistRun';
import { installSoundDirector, uninstallSoundDirector } from './director';
import { sfx } from './sfx';

const position = { lat: 1.3, lng: 103.85 };

let played: string[] = [];
let loops: Record<string, boolean> = {};

beforeEach(() => {
  vi.useFakeTimers();
  useGame.setState(useGame.getInitialState(), true);
  useGame.getState().commitCharacter({ name: 'Sound tester', traitIds: [],
    attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 } });
  useGame.setState({ phase: 'game', seed: 'sound-director', spawn: { ...position, name: 'Test' },
    currentPos: position, meters: { hunger: 100, thirst: 100, energy: 100, infection: 0 } });
  played = [];
  loops = {};
  vi.spyOn(sfx, 'play').mockImplementation((id) => {
    played.push(id);
    return false;
  });
  vi.spyOn(sfx, 'loop').mockImplementation((id, on) => {
    loops[id] = on;
  });
  installSoundDirector();
});

afterEach(() => {
  uninstallSoundDirector();
  vi.restoreAllMocks();
  cancelPersist();
  vi.useRealTimers();
});

describe('sound director', () => {
  it('fires vitals warnings on the way down, once per threshold', () => {
    useGame.setState({ meters: { hunger: 100, thirst: 24, energy: 100, infection: 0 } });
    useGame.setState({ meters: { hunger: 100, thirst: 20, energy: 100, infection: 0 } });
    useGame.setState({ meters: { hunger: 100, thirst: 9, energy: 100, infection: 31 } });
    expect(played).toEqual(['vitals.thirst', 'vitals.thirst', 'vitals.infection']);
  });

  it('starts footsteps with a glide and stops them on arrival', () => {
    useGame.setState({ travelAnim: { fromLat: 1, fromLng: 1, toLat: 2, toLng: 2, path: [], toId: null, startedAt: 0, durationMs: 1 } as never });
    expect(played).toContain('travel.depart');
    expect(loops['travel.steps']).toBe(true);
    useGame.setState({ travelAnim: null });
    expect(played).toContain('travel.arrive');
    expect(loops['travel.steps']).toBe(false);
  });

  it('hears a new bleed and a fracture', () => {
    const parts = useGame.getState().bodyParts;
    useGame.setState({ bodyParts: { ...parts, leftArm: { ...parts.leftArm, bleed: 'minor', fractured: true } } });
    expect(played).toEqual(expect.arrayContaining(['body.bleed', 'body.fracture']));
  });

  it('wraps actions without changing what they return', () => {
    const ok = useGame.getState().moveItem('no-such-item', 'backpack', 0, 0, false);
    expect(ok).toBe(false);
    expect(played).toContain('inv.refuse');
  });

  it('restores the original actions on uninstall', () => {
    const wrapped = useGame.getState().moveItem;
    uninstallSoundDirector();
    expect(useGame.getState().moveItem).not.toBe(wrapped);
    played = [];
    useGame.getState().moveItem('no-such-item', 'backpack', 0, 0, false);
    expect(played).toEqual([]);
  });

  it('stays quiet outside a run', () => {
    useGame.setState({ phase: 'menu' });
    played = [];
    useGame.setState({ meters: { hunger: 5, thirst: 5, energy: 5, infection: 90 } });
    expect(played).toEqual([]);
  });
});
