import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '../../game/types';
import { BACKPACK, LOOSE } from '../../game/inventory';
import { itemDef } from '../../game/loot';
import {
  carriedKind,
  carriedRows,
  kindCounts,
  queryCarried,
  type CarriedQuery,
} from './carriedListModel';

const inst = (uid: string, defId: string, container: string, stack = 1): ItemInstance => ({
  uid,
  defId,
  container,
  x: 0,
  y: 0,
  rotated: false,
  stack,
});

const items: ItemInstance[] = [
  inst('a', 'crowbar', BACKPACK), // 1.5 kg weapon
  inst('b', 'scrap_metal', LOOSE, 2), // 3.0 kg misc
  inst('c', 'painkillers', LOOSE), // 0.1 kg medical
  inst('d', 'snacks', BACKPACK, 3), // 0.6 kg food
  inst('e', 'crowbar', 'stash:somewhere'), // not carried
];

const rows = carriedRows(items, 0.2, (id) => id);
const q = (over: Partial<CarriedQuery>): CarriedQuery => ({
  sort: 'weight',
  desc: true,
  kinds: new Set(),
  place: 'all',
  ...over,
});
const uids = (r: ReturnType<typeof queryCarried>) => r.map((x) => x.inst.uid);

describe('carried list', () => {
  it('lists only bag and loose items, with felt weight', () => {
    expect(rows.map((r) => r.inst.uid).sort()).toEqual(['a', 'b', 'c', 'd']);
    const crowbar = rows.find((r) => r.inst.uid === 'a')!;
    expect(crowbar.kg).toBeCloseTo(1.5 * 0.8); // packed: bag cut
    const scrap = rows.find((r) => r.inst.uid === 'b')!;
    expect(scrap.kg).toBeCloseTo(3 * 1.25); // loose penalty
    expect(scrap.perUnitKg).toBeCloseTo(1.5 * 1.25);
  });

  it('sorts heaviest first, or lightest when flipped', () => {
    expect(uids(queryCarried(rows, q({})))).toEqual(['b', 'a', 'd', 'c']);
    expect(uids(queryCarried(rows, q({ desc: false })))).toEqual(['c', 'd', 'a', 'b']);
  });

  it('sorts by kg per unit, so one heavy item beats a big light stack', () => {
    // snacks: 3 × 0.2 → 0.16 each packed; painkillers 0.125 loose.
    expect(uids(queryCarried(rows, q({ sort: 'perUnit' })))).toEqual(['b', 'a', 'd', 'c']);
  });

  it('sorts by name and by kind', () => {
    expect(uids(queryCarried(rows, q({ sort: 'name', desc: false })))).toEqual(['a', 'c', 'b', 'd']);
    expect(queryCarried(rows, q({ sort: 'kind', desc: false })).map((r) => r.kind)).toEqual([
      'weapon',
      'food',
      'medical',
      'misc',
    ]);
  });

  it('filters by kind and by packed / loose', () => {
    expect(uids(queryCarried(rows, q({ kinds: new Set(['medical', 'misc']) })))).toEqual(['b', 'c']);
    expect(uids(queryCarried(rows, q({ place: 'loose' })))).toEqual(['b', 'c']);
    expect(uids(queryCarried(rows, q({ place: 'packed' })))).toEqual(['a', 'd']);
  });

  it('counts the kinds present for the chips, in canonical order', () => {
    expect(kindCounts(rows).map((k) => k.kind)).toEqual(['weapon', 'food', 'medical', 'misc']);
  });

  it('maps catalog effects onto filter families', () => {
    expect(carriedKind(itemDef('crowbar'))).toBe('weapon');
    expect(carriedKind(itemDef('painkillers'))).toBe('medical');
    expect(carriedKind(itemDef('canned_food'))).toBe('food');
  });
});
