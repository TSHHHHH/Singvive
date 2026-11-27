import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './store';
import { cancelPersist } from './persistRun';
import type { ItemInstance } from './types';

const item = (defId: string, extra: Partial<ItemInstance> = {}): ItemInstance => ({
  uid: defId, defId, stack: 1, container: 'backpack', x: 0, y: 0, rotated: false, ...extra,
});

beforeEach(() => {
  vi.useFakeTimers();
  useGame.setState(useGame.getInitialState(), true);
  useGame.getState().commitCharacter({ name: 'Stomach tester', traitIds: [],
    attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 } });
  useGame.setState({ phase: 'game', seed: 'stomach-test', hour: 10,
    spawn: { lat: 1.3, lng: 103.85, name: 'Stomach test' },
    meters: { hunger: 30, thirst: 80, energy: 80, infection: 0 },
    items: [item('chicken_rice', { condition: 2 }), item('po_chai'), item('dirty_water', { stack: 2 })] });
});
afterEach(() => { cancelPersist(); vi.useRealTimers(); });

describe('spoiled food in the live store', () => {
  it('feeds less and upsets the stomach instead of adding infection on the spot', () => {
    useGame.getState().applyItem('chicken_rice');
    const m = useGame.getState().meters;
    expect(m.hunger).toBe(30 + 13);
    expect(m.infection).toBe(0);
    expect(m.stomach).toBe(19);
  });

  it('Po Chai settles it before it lands', () => {
    useGame.getState().applyItem('chicken_rice');
    useGame.getState().applyItem('po_chai');
    expect(useGame.getState().meters.stomach).toBe(0);
  });

  it('murky water upsets the stomach too', () => {
    useGame.getState().applyItem('dirty_water');
    const m = useGame.getState().meters;
    expect(m.stomach).toBe(8);
    expect(m.infection).toBe(0);
  });
});
