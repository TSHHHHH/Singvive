import { describe, expect, it } from 'vitest';
import { TRAITS, attributesFromTraits, getTrait, sumTraitMod } from './character';
import { DEFAULT_OCCUPATION_ID, OCCUPATIONS } from './occupations';
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
    const kit = resolveStartingKit('survivor', []);
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

  it('lets a trait wearable replace a base item', () => {
    const kit = resolveStartingKit('survivor', ['tekong_legs']);
    expect(kit.equip.feet?.id).toBe('hiking_boots');
    expect(ids(kit)).not.toContain('sneakers');
  });

  it('packs a second claim on a slot instead of losing it', () => {
    // Torch and umbrella both want the off hand: one is worn, the other packed.
    const kit = resolveStartingKit('survivor', ['night_owl', 'umbrella_city']);
    const worn = kit.equip.offHand?.id;
    expect(['torch', 'golf_umbrella']).toContain(worn);
    const other = worn === 'torch' ? 'golf_umbrella' : 'torch';
    expect(kit.pack.map((l) => l.id)).toContain(other);
  });

  it('applies a flaw kit as a downgrade', () => {
    const kit = resolveStartingKit('survivor', ['just_popped_out']);
    expect(kit.equip.feet?.id).toBe('flip_flops');
    expect(kit.equip.body).toBeUndefined();
    expect(ids(kit)).not.toContain('sneakers');
  });

  it('rolls pools from the seed: same seed, same kit', () => {
    const build = ['karang_guni'];
    const a = resolveStartingKit('survivor', build, new Rng('seed-a'));
    const b = resolveStartingKit('survivor', build, new Rng('seed-a'));
    expect(a).toEqual(b);
    expect(a.pools).toEqual([]);
    const variety = new Set(
      Array.from({ length: 30 }, (_, i) =>
        JSON.stringify(resolveStartingKit('survivor', build, new Rng(`s${i}`)).pack),
      ),
    );
    expect(variety.size).toBeGreaterThan(3);
    // Unrolled preview reports the pool instead.
    expect(resolveStartingKit('survivor', build).pools).toHaveLength(1);
  });

  it('keeps every preset and every single-trait kit in the Light tier', () => {
    const builds = [
      ...OCCUPATIONS.map((o) => ({ role: o.id, traits: [] as string[] })),
      ...Object.keys(TRAIT_KITS).map((id) => ({ role: 'survivor', traits: [id] })),
    ];
    for (const build of builds) {
      for (let s = 0; s < 5; s++) {
        const kit = resolveStartingKit(build.role, build.traits, new Rng(`load${s}`));
        const label = [build.role, ...build.traits].join('+');
        expect(kitLoad(build.traits, kit), label).toBeLessThanOrEqual(LOAD_COMFORT);
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

describe('trimmed trait kits', () => {
  const JOB_SIGNATURES = [
    'combat_veteran',
    'trauma_medic',
    'hyrox_champion',
    'young_blood',
    'estate_kitchen',
    'estate_memory',
    'operator',
    'site_foreman',
    'made_man',
  ];

  it('job-signature traits give no items', () => {
    for (const id of JOB_SIGNATURES) expect(TRAIT_KITS[id], id).toBeUndefined();
  });

  it('trimmed traits keep one signature item', () => {
    const expected: Record<string, { id: string; count?: number }[]> = {
      medic: [{ id: 'bandage', count: 2 }],
      hawker_cook: [{ id: 'cooking_pot' }],
      handyman: [{ id: 'zip_ties', count: 4 }],
      field_dressing: [{ id: 'improvised_bandage', count: 3 }],
      train_memory: [{ id: 'headlamp' }],
      go_bag: [{ id: 'large_water_bottle' }],
      prepper: [{ id: 'canned_food', count: 3 }],
      medicine_cabinet: [{ id: 'painkillers' }],
      weekend_cyclist: [{ id: 'bike_helmet' }],
      supper_run: [{ id: 'bak_kwa' }],
      just_popped_out: [{ id: 'flip_flops' }],
    };
    for (const [id, items] of Object.entries(expected)) {
      expect(TRAIT_KITS[id]?.items, id).toEqual(items);
    }
    expect(TRAIT_KITS.karang_guni?.items).toBeUndefined();
    expect(TRAIT_KITS.karang_guni?.pool?.pick).toBe(1);
    expect(TRAIT_KITS.just_popped_out?.drop).toEqual(['leather_jacket']);
  });
});

describe('role kits', () => {
  const EXPECTED: Record<string, string[]> = {
    drifter: ['cloth_wraps', 'jeans', 'flip_flops', 'grocery_tote'],
    student: ['school_bag', 'jeans', 'sneakers', 'water_bottle', 'box_cutter'],
    trainer: ['cargo_shorts', 'grip_gloves', 'sneakers', 'sling_bag', 'water_bottle', 'energy_gel', 'hammer'],
    soldier: ['army_uniform', 'camo_pants', 'combat_boots', 'daypack', 'parang', 'army_ration'],
    nurse: ['rubber_gloves', 'n95_mask', 'work_trousers', 'sneakers', 'sling_bag', 'bandage', 'box_cutter'],
    hawker: ['meat_cleaver', 'cargo_shorts', 'rubber_boots', 'cooking_pot', 'lighter', 'daypack'],
    office: ['work_trousers', 'sneakers', 'sling_bag', 'golf_club', 'powerbank'],
    contractor: ['hard_hat', 'work_vest', 'work_trousers', 'safety_boots', 'daypack', 'hammer', 'duct_tape'],
    runner: ['leather_jacket', 'jeans', 'sneakers', 'sling_bag', 'baseball_bat', 'lockpick'],
  };

  it('lists Classic Survivor first and Drifter second', () => {
    expect(OCCUPATIONS.map((o) => o.id).slice(0, 2)).toEqual(['survivor', 'drifter']);
    expect(DEFAULT_OCCUPATION_ID).toBe('survivor');
    expect(OCCUPATIONS).toHaveLength(11);
  });

  it('each role resolves to its kit', () => {
    expect(ids(resolveStartingKit('survivor', [])).sort()).toEqual(baseKit().map((e) => e.id).sort());
    for (const [role, want] of Object.entries(EXPECTED)) {
      expect(ids(resolveStartingKit(role, [])).sort(), role).toEqual([...want].sort());
    }
    // Scavenger: fixed part plus one seeded find.
    const kg = resolveStartingKit('karung_guni', []);
    expect(ids(kg).sort()).toEqual(['cloth_rags', 'duffel_bag', 'pipe_wrench', 'work_gloves', 'work_trousers'].sort());
    expect(kg.pools).toEqual([{ source: 'role', pick: 1, from: expect.any(Array) }]);
  });

  it('the classic survivor kit wears jeans', () => {
    expect(resolveStartingKit('survivor', []).equip.legs?.id).toBe('jeans');
  });

  it('every role kit fills the legs slot', () => {
    for (const o of OCCUPATIONS) expect(resolveStartingKit(o.id, []).equip.legs, o.id).toBeDefined();
  });

  it('every role kit differs', () => {
    const kits = OCCUPATIONS.map((o) => JSON.stringify(ids(resolveStartingKit(o.id, [])).sort()));
    expect(new Set(kits).size).toBe(OCCUPATIONS.length);
  });

  it('role and trait kits reference real items', () => {
    for (const o of OCCUPATIONS) {
      for (const e of [...(o.kit.items ?? []), ...(o.kit.pool?.from ?? [])]) {
        expect(ITEMS[e.id], `${o.id} → ${e.id}`).toBeDefined();
      }
    }
  });

  it('drifter has no weapon and no water', () => {
    const kit = resolveStartingKit('drifter', []);
    expect(kit.equip.mainHand).toBeUndefined();
    expect(kitLines(kit).some((l) => itemDef(l.id).effect.kind === 'water')).toBe(false);
  });

  it('a trait wearable replaces the role item in its slot', () => {
    expect(resolveStartingKit('soldier', ['tekong_legs']).equip.feet?.id).toBe('hiking_boots');
  });

  it('a two-handed role weapon packs the off-hand item', () => {
    const kit = resolveStartingKit('office', ['night_owl']);
    expect(kit.equip.mainHand?.id).toBe('golf_club');
    expect(kit.equip.offHand).toBeUndefined();
    expect(kit.pack.map((l) => l.id)).toContain('torch');
  });

  it('just_popped_out drops the role body item', () => {
    const kit = resolveStartingKit('survivor', ['just_popped_out']);
    expect(kit.equip.body).toBeUndefined();
    expect(kit.equip.feet?.id).toBe('flip_flops');
  });

  it('the role pool is stable per seed', () => {
    const a = resolveStartingKit('karung_guni', [], new Rng('s'));
    const b = resolveStartingKit('karung_guni', [], new Rng('s'));
    expect(a.pack).toEqual(b.pack);
    expect(a.pools).toEqual([]);
    const variety = new Set(
      Array.from({ length: 20 }, (_, i) =>
        JSON.stringify(resolveStartingKit('karung_guni', [], new Rng(`r${i}`)).pack),
      ),
    );
    expect(variety.size).toBeGreaterThan(1);
  });

  it('unknown role falls back to survivor', () => {
    expect(resolveStartingKit('no_such_role', [])).toEqual(resolveStartingKit('survivor', []));
    expect(resolveStartingKit(undefined, [])).toEqual(resolveStartingKit('survivor', []));
  });
});
