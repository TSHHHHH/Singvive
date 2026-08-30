import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  canCombatReload,
  companionLootForGun,
  loadGunFromMagazine,
  refillMagazineFromAmmo,
  resolveCombatReload,
} from './firearms';
import { emptyEquipment } from './inventory';
import type { Equipment, ItemInstance } from './types';

function mag(uid: string, rounds: number): ItemInstance {
  return {
    uid,
    defId: 'mag_pistol',
    container: 'backpack',
    x: 0,
    y: 0,
    rotated: false,
    stack: 1,
    loadedRounds: rounds,
  };
}

function gun(uid: string, rounds = 0): ItemInstance {
  return {
    uid,
    defId: 'pistol',
    container: 'equip:firearm',
    x: 0,
    y: 0,
    rotated: false,
    stack: 1,
    condition: 80,
    loadedRounds: rounds,
  };
}

describe('firearms', () => {
  it('refillMagazineFromAmmo transfers typed rounds', () => {
    const items: ItemInstance[] = [
      mag('m1', 0),
      {
        uid: 'a1',
        defId: 'ammo_9mm_box',
        container: 'backpack',
        x: 1,
        y: 0,
        rotated: false,
        stack: 1,
      },
    ];
    const res = refillMagazineFromAmmo(items, 'm1', 'a1');
    expect(res.ok).toBe(true);
    expect(res.roundsAdded).toBe(8);
    const magInst = res.items.find((i) => i.uid === 'm1');
    expect(magInst?.loadedRounds).toBe(8);
    expect(res.items.some((i) => i.uid === 'a1')).toBe(false);
  });

  it('canCombatReload requires loaded mag for pistol', () => {
    const equipment: Equipment = { ...emptyEquipment(), firearm: gun('g1', 0) };
    const emptyMag = [mag('m1', 0)];
    expect(canCombatReload(equipment, emptyMag)).toBe(false);
    expect(canCombatReload(equipment, [mag('m1', 3)])).toBe(true);
  });

  it('resolveCombatReload drains backpack magazine into holstered gun', () => {
    const equipment: Equipment = { ...emptyEquipment(), firearm: gun('g1', 0) };
    const items = [mag('m1', 5)];
    const res = resolveCombatReload(equipment, items);
    expect(res.roundsLoaded).toBe(5);
    expect(res.equipment.firearm?.loadedRounds).toBe(5);
    expect(res.items.find((i) => i.uid === 'm1')?.loadedRounds).toBe(0);
  });

  it('loadGunFromMagazine transfers from pack mag OOC', () => {
    const equipment: Equipment = { ...emptyEquipment(), firearm: gun('g1', 2) };
    const items = [mag('m1', 6)];
    const res = loadGunFromMagazine(equipment, items, 'm1');
    expect(res.ok).toBe(true);
    expect(res.equipment.firearm?.loadedRounds).toBe(8);
    expect(res.items.find((i) => i.uid === 'm1')?.loadedRounds).toBe(0);
  });

  it('companion loot rolls with seeded rng', () => {
    const rng = new Rng('GUN-COMPANION');
    const hits = Array.from({ length: 20 }, () => companionLootForGun(rng, 'pistol'));
    expect(hits.some((h) => h === 'mag_pistol')).toBe(true);
  });
});
