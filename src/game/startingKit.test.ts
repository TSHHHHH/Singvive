import { describe, expect, it } from 'vitest';
import { TRAITS, attributesFromTraits, getTrait, sumTraitMod } from './character';
import { OCCUPATIONS } from './occupations';
import { ITEMS, itemDef } from './loot';
import { Rng } from './rng';
import {
  LOAD_COMFORT,
  carriedWeight,
  emptyEquipment,
  maxCarry,
} from './inventory';
import type { ItemInstance } from './types';
import {
  TRAIT_KITS,
  baseKit,
  kitEntriesValue,
  kitLines,
  resolveStartingKit,
  type ResolvedKit,
} from './startingKit';

const ids = (kit: ResolvedKit) => kitLines(kit).map((l) => l.id);

/** Carried weight of a resolved kit, everything in the pack (worst case: no bag reduction on loose). */
function kitLoad(traitIds: string[], kit: ResolvedKit): number {
  const equipment = emptyEquipment();
  for (const [slot, line] of Object.entries(kit.equip)) {
    if (!line) continue;
    equipment[slot as keyof typeof equipment] = {
      uid: `e_${line.id}`,
      defId: line.id,
      container: `equip:${slot}`,
      x: 0,
      y: 0,
      rotated: false,
      stack: 1,
      condition: 100,
    };
  }
  const items: ItemInstance[] = kit.pack.map((l, i) => ({
    uid: `p_${i}`,
    defId: l.id,
    container: 'backpack',
    x: 0,
    y: 0,
    rotated: false,
    stack: l.count,
    condition: 100,
  }));
  const cap = maxCarry(
    attributesFromTraits(traitIds),
    equipment,
    sumTraitMod(traitIds, 'carryCapacityMod'),
  );
  return carriedWeight(items, equipment) / cap;
}

describe('starting kit', () => {
  it('gives a hand-rolled build exactly the base kit', () => {
    const kit = resolveStartingKit([]);
    expect(ids(kit).sort()).toEqual(baseKit().map((e) => e.id).sort());
    expect(kit.equip.mainHand?.id).toBe('kitchen_knife');
  });

  it('only references real items and real traits', () => {
    const traitIds = new Set(TRAITS.map((t) => t.id));
    for (const [id, kit] of Object.entries(TRAIT_KITS)) {
      expect(traitIds.has(id), id).toBe(true);
      for (const e of [...(kit.items ?? []), ...(kit.pool?.from ?? [])]) {
        expect(ITEMS[e.id], `${id} → ${e.id}`).toBeDefined();
      }
      for (const d of kit.drop ?? []) expect(ITEMS[d], `${id} drops ${d}`).toBeDefined();
    }
  });

  it('dresses every occupation preset differently', () => {
    const kits = OCCUPATIONS.map((o) => JSON.stringify(ids(resolveStartingKit(o.traitIds)).sort()));
    expect(new Set(kits).size).toBe(OCCUPATIONS.length);
    for (const o of OCCUPATIONS) {
      const positive = o.traitIds.find((id) => getTrait(id).category === 'positive')!;
      expect(TRAIT_KITS[positive], `${o.id} signature trait has a kit`).toBeDefined();
    }
  });

  it('lets a job outfit replace base clothes', () => {
    const soldier = resolveStartingKit(['combat_veteran', 'hypervigilant']);
    expect(soldier.equip.body?.id).toBe('army_uniform');
    expect(soldier.equip.feet?.id).toBe('combat_boots');
    expect(ids(soldier)).not.toContain('leather_jacket');
  });

  it('packs a second claim on a slot instead of losing it', () => {
    // Soldier boots win (dearer trait); trail-leg boots go in the pack.
    const kit = resolveStartingKit(['tekong_legs', 'combat_veteran']);
    expect(kit.equip.feet?.id).toBe('combat_boots');
    expect(kit.pack.map((l) => l.id)).toContain('hiking_boots');
  });

  it('moves an off-hand item to the pack under a two-handed weapon', () => {
    const kit = resolveStartingKit(['operator', 'night_owl']);
    expect(itemDef(kit.equip.mainHand!.id).twoHanded).toBe(true);
    expect(kit.equip.offHand).toBeUndefined();
    expect(kit.pack.map((l) => l.id)).toContain('torch');
  });

  it('applies a flaw kit as a downgrade', () => {
    const kit = resolveStartingKit(['just_popped_out']);
    expect(kit.equip.feet?.id).toBe('flip_flops');
    expect(kit.equip.bag?.id).toBe('grocery_tote');
    expect(kit.equip.body).toBeUndefined();
    expect(ids(kit)).not.toContain('sneakers');
    expect(ids(kit)).not.toContain('daypack');
  });

  it('rolls pools from the seed: same seed, same kit', () => {
    const build = ['estate_memory', 'ruined_knees'];
    const a = resolveStartingKit(build, new Rng('seed-a'));
    const b = resolveStartingKit(build, new Rng('seed-a'));
    expect(a).toEqual(b);
    expect(a.pools).toEqual([]);
    const variety = new Set(
      Array.from({ length: 30 }, (_, i) =>
        JSON.stringify(resolveStartingKit(build, new Rng(`s${i}`)).pack),
      ),
    );
    expect(variety.size).toBeGreaterThan(3);
    // Unrolled preview reports the pool instead.
    expect(resolveStartingKit(build).pools).toHaveLength(1);
  });

  it('keeps every preset and every single-trait kit in the Light tier', () => {
    const builds = [
      ...OCCUPATIONS.map((o) => o.traitIds),
      ...Object.keys(TRAIT_KITS).map((id) => [id]),
    ];
    for (const build of builds) {
      for (let s = 0; s < 5; s++) {
        const kit = resolveStartingKit(build, new Rng(`load${s}`));
        expect(kitLoad(build, kit), build.join('+')).toBeLessThanOrEqual(LOAD_COMFORT);
      }
    }
  });

  it('caps what a trait kit is worth by what the trait costs', () => {
    for (const [id, kit] of Object.entries(TRAIT_KITS)) {
      const trait = getTrait(id);
      if (trait.category !== 'positive') continue;
      const poolBest = kit.pool
        ? [...kit.pool.from]
            .map((e) => kitEntriesValue([e]))
            .sort((a, b) => b - a)
            .slice(0, kit.pool.pick)
            .reduce((s, v) => s + v, 0)
        : 0;
      const worth = kitEntriesValue(kit.items ?? []) + poolBest;
      // Gear-only traits get the whole budget; stat traits only a small extra.
      const statOnly = trait.effects.some((e) => e !== 'Starting gear only');
      const cap = statOnly ? 20 + 20 * trait.cost : 35 * trait.cost;
      expect(worth, `${id} kit worth ${worth} > ${cap}`).toBeLessThanOrEqual(cap);
    }
  });
});
