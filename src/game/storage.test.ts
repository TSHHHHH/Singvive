import { beforeEach, describe, expect, it } from 'vitest';
import { loadRun } from './storage';
import type { SavedRun } from './storage';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

const inst = (id: string, defId: string) => ({
  id,
  defId,
  container: 'backpack',
  x: 0,
  y: 0,
  rotated: false,
});

const write = (over: Record<string, unknown>) => {
  store.set(
    'singvive.run.v6',
    JSON.stringify({
      character: {
        name: 'T',
        attributes: { strength: 5, dexterity: 5, endurance: 5, perception: 5, wits: 5 },
        traitIds: [],
      },
      seed: 'seed',
      day: 1,
      hour: 8,
      exploredArea: [],
      items: [],
      locations: {},
      meters: { hunger: 50, thirst: 50, energy: 50, infection: 0 },
      equipment: {},
      log: [],
      ...over,
    }),
  );
};

/**
 * Items can leave the catalog between sessions (the DEV loot browser deletes by
 * id). A save still referencing one previously threw inside a migration, and
 * `loadRun`'s outer catch turned that into `null` — the player lost the entire
 * run rather than one item.
 */
describe('loadRun with items missing from the catalog', () => {
  it('keeps a run whose backpack holds a deleted item, dropping just that item', () => {
    write({ items: [inst('a', 'parang'), inst('b', 'no_such_item_xyz')] });
    const run = loadRun() as SavedRun;
    expect(run).not.toBeNull();
    expect(run.items.map((i) => i.defId)).toEqual(['parang']);
  });

  it('keeps a run whose equipped weapon was deleted, clearing the slot', () => {
    write({
      equipment: { mainHand: { ...inst('c', 'no_such_item_xyz'), container: 'equipment' } },
    });
    const run = loadRun() as SavedRun;
    expect(run).not.toBeNull();
    expect(run.equipment.mainHand).toBeNull();
  });

  it('leaves a healthy save untouched', () => {
    write({ items: [inst('a', 'parang')] });
    const run = loadRun() as SavedRun;
    expect(run.items.map((i) => i.defId)).toEqual(['parang']);
  });
});
