import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '../game/types';
import { ITEMS } from '../game/loot';
import { BASE_ATTRIBUTE, maxHpFor } from '../game/character';
import { totalMaxHp } from '../game/survival';
import {
  addExpeditionItem, applyExpeditionCommand, cancelExpeditionCraft,
  completeExpeditionCraft, consumeRescueMedical, createExpeditionSurvivor,
  damageExpedition, expeditionAttack, expeditionDefense, expeditionHp,
  expeditionTravelSpeed, generateExpeditionLoot, medicalCount,
  reviveExpedition, tickExpedition,
} from './expeditionSurvivor';

const item = (defId: string, uid = defId, stack = 1): ItemInstance => ({
  uid, defId, stack, container: 'backpack', x: 0, y: 0, rotated: false,
});
const survivor = (occupation = 'student') => createExpeditionSurvivor('Survivor', occupation, 'test', false);

describe('independent expedition survivors', () => {
  it('applies worn protection to seeded body hits', () => {
    let bareLoss = 0; let protectedLoss = 0;
    for (let seed = 0; seed < 40; seed++) {
      const bare = survivor();
      const protectedSurvivor = survivor();
      protectedSurvivor.equipment.head = item('riot_helmet');
      protectedSurvivor.equipment.body = item('leather_jacket');
      damageExpedition(bare,12,`armor:${seed}`);
      damageExpedition(protectedSurvivor,12,`armor:${seed}`);
      bareLoss += totalMaxHp(bare.bodyParts) - expeditionHp(bare);
      protectedLoss += totalMaxHp(protectedSurvivor.bodyParts) - expeditionHp(protectedSurvivor);
    }
    expect(protectedLoss).toBeLessThan(bareLoss);
  });
  it('applies medicine skill recovery bonuses to injured body parts', () => {
    const novice = survivor(); const trained = survivor();
    novice.bodyParts.head.hp *= 0.4;
    trained.bodyParts = structuredClone(novice.bodyParts);
    trained.skills.medicine.level = 5;
    tickExpedition(novice,2,true); tickExpedition(trained,2,true);
    expect(trained.bodyParts.head.hp).toBeGreaterThan(novice.bodyParts.head.hp);
  });
  it('creates deterministic occupations with coherent body maxima and separate state', () => {
    const a = createExpeditionSurvivor('One', 'trainer', 'one');
    expect(a).toEqual(createExpeditionSurvivor('One', 'trainer', 'one'));
    expect(totalMaxHp(a.bodyParts)).toBe(maxHpFor(a.character));
    const b = createExpeditionSurvivor('Two', 'nurse', 'two');
    a.meters.hunger = 0;
    a.skills.fighting.xp = 9;
    expect(b.meters.hunger).toBeGreaterThan(0);
    expect(b.skills.fighting.xp).toBe(0);
    expect(a.items.length + Object.values(a.equipment).filter(Boolean).length).toBeGreaterThan(0);
    expect(() => createExpeditionSurvivor('Bad', '__proto__', 'seed')).toThrow();
  });

  it('keeps pickup, equipped swaps, and drops conservative', () => {
    const s = survivor();
    expect(addExpeditionItem(s, item('hammer', 'a'))).toBeNull();
    expect(addExpeditionItem(s, item('crowbar', 'b'))).toBeNull();
    expect(applyExpeditionCommand(s, { type: 'equipItem', uid: 'a' }, 'equip')).toEqual({});
    expect(applyExpeditionCommand(s, { type: 'equipItem', uid: 'b' }, 'equip2')).toEqual({});
    expect(s.equipment.mainHand?.uid).toBe('b');
    expect(s.items.map(i => i.uid)).toContain('a');
    const dropped = applyExpeditionCommand(s, { type: 'dropItem', uid: 'b' }, 'drop');
    expect(dropped.dropped?.uid).toBe('b');
    expect(s.equipment.mainHand).toBeNull();
    expect(s.items.map(i => i.uid)).toEqual(['a']);
  });

  it('rejects offhand equipment while a two-handed weapon occupies the main hand', () => {
    const s = survivor();
    addExpeditionItem(s, item('fire_axe', 'axe'));
    addExpeditionItem(s, item('torch', 'light'));
    expect(applyExpeditionCommand(s, { type: 'equipItem', uid: 'axe' }, 'axe').error).toBeUndefined();
    expect(applyExpeditionCommand(s, { type: 'equipItem', uid: 'light' }, 'light').error).toBeTruthy();
    expect(s.equipment.offHand).toBeNull();
    expect(s.equipment.mainHand?.uid).toBe('axe');
    expect(s.items.some(i => i.uid === 'light')).toBe(true);
  });

  it('rejects duplicate identity, invalid items, and weight overflow without mutation', () => {
    const s = survivor();
    const source = item('water_bottle', 'water');
    expect(addExpeditionItem(s, source)).toBeNull();
    source.stack = 999;
    expect(s.items[0].stack).toBe(1);
    const before = structuredClone(s);
    expect(addExpeditionItem(s, item('water_bottle', 'water'))).toBeTruthy();
    expect(addExpeditionItem(s, item('__proto__', 'bad'))).toBeTruthy();
    expect(addExpeditionItem(s, item('water_bottle', 'negative', -1))).toBeTruthy();
    expect(addExpeditionItem(s, item('water_bottle', 'huge', 1_000))).toBeTruthy();
    expect(s).toEqual(before);
  });

  it('consumes one real food stack unit and applies solo food effects', () => {
    const s = survivor();
    s.meters.hunger = 0;
    addExpeditionItem(s, item('canned_food', 'food', 2));
    expect(applyExpeditionCommand(s, { type: 'useItem', uid: 'food' }, 'eat').error).toBeUndefined();
    expect(s.meters.hunger).toBeGreaterThan(0);
    expect(s.items[0].stack).toBe(1);
    applyExpeditionCommand(s, { type: 'useItem', uid: 'food' }, 'eat2');
    expect(s.items).toHaveLength(0);
    expect(applyExpeditionCommand(s, { type: 'useItem', uid: 'food' }, 'eat3').error).toBeTruthy();
  });

  it('uses medical charges for rescue and never counts empty kits or unrelated medicine', () => {
    const s = survivor();
    addExpeditionItem(s, item('painkillers'));
    expect(medicalCount(s)).toBe(0);
    expect(consumeRescueMedical(s)).toBe(false);
    addExpeditionItem(s, { ...item('medkit'), careUses: 2 });
    addExpeditionItem(s, item('bandage', 'bandages', 2));
    expect(medicalCount(s)).toBe(4);
    for (let n = 0; n < 4; n++) expect(consumeRescueMedical(s)).toBe(true);
    expect(consumeRescueMedical(s)).toBe(false);
    expect(medicalCount(s)).toBe(0);
    expect(s.items.map(i => i.defId)).toEqual(['painkillers']);
    s.items.push({ ...item('medkit', 'empty'), careUses: 0 });
    expect(consumeRescueMedical(s)).toBe(false);
  });

  it('stabilizes a bleeding wound without granting instant structural HP', () => {
    const s = survivor();
    s.bodyParts.leftArm = { ...s.bodyParts.leftArm, hp: 3, bleed: 'major', wound: 'deep', dirty: true };
    addExpeditionItem(s, item('bandage'));
    const before = expeditionHp(s);
    const result = applyExpeditionCommand(s, { type: 'useItem', uid: 'bandage', part: 'leftArm' }, 'care');
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThan(0);
    expect(s.bodyParts.leftArm.bleed).toBe('none');
    expect(expeditionHp(s)).toBe(before);
    expect(s.items).toHaveLength(0);
    expect(s.skillDayXp.gained.medicine).toBeGreaterThan(0);
  });

  it('does not consume a treatment when there is no valid injury', () => {
    const s = survivor();
    addExpeditionItem(s, item('bandage'));
    expect(applyExpeditionCommand(s, { type: 'useItem', uid: 'bandage' }, 'care').error).toBeTruthy();
    expect(s.items).toHaveLength(1);
  });

  it.each([false, true])('composes survival ticks while resting=%s', resting => {
    const a = survivor('nurse');
    a.meters = { hunger: 10, thirst: 12, energy: 20, infection: 7 };
    a.bodyParts.leftArm = { ...a.bodyParts.leftArm, hp: 2, bleed: 'minor', bleedHours: 1, wound: 'cut' };
    const b = structuredClone(a);
    tickExpedition(a, 2, resting);
    for (let n = 0; n < 120; n++) tickExpedition(b, 1 / 60, resting);
    for (const key of ['hunger', 'thirst', 'energy', 'infection'] as const) expect(a.meters[key]).toBeCloseTo(b.meters[key], 8);
    for (const id of Object.keys(a.bodyParts) as Array<keyof typeof a.bodyParts>) expect(a.bodyParts[id].hp).toBeCloseTo(b.bodyParts[id].hp, 8);
    expect(a.bodyParts.leftArm.bleed).toBe('none');
    expect(expeditionHp(a)).toBeLessThan(totalMaxHp(a.bodyParts));
  });

  it('applies systemic damage even when authoritative ticks are short', () => {
    const s = survivor();
    s.meters = { hunger: 0, thirst: 0, energy: 0, infection: 100 };
    const hp = expeditionHp(s);
    for (let n = 0; n < 60; n++) tickExpedition(s, 1 / 60, false);
    expect(expeditionHp(s)).toBeLessThan(hp - 5);
  });

  it('applies the shared heat weather to thirst and energy depletion', () => {
    const clear = survivor();
    const heat = structuredClone(clear);
    tickExpedition(clear, 1, false, 'clear');
    tickExpedition(heat, 1, false, 'heat');
    expect(heat.meters.thirst).toBeLessThan(clear.meters.thirst);
    expect(heat.meters.energy).toBeLessThan(clear.meters.energy);
  });

  it('damages deterministically, preserves max health, and revives with lasting injuries', () => {
    const a = survivor();
    const b = survivor();
    const max = totalMaxHp(a.bodyParts);
    damageExpedition(a, 15, 'hit');
    damageExpedition(b, 15, 'hit');
    expect(a).toEqual(b);
    expect(expeditionHp(a)).toBeLessThan(max);
    expect(totalMaxHp(a.bodyParts)).toBe(max);
    for (const p of Object.values(a.bodyParts)) p.hp = 0;
    a.bodyParts.torso.mortalWound = true;
    a.bodyParts.leftLeg.fractured = true;
    reviveExpedition(a);
    expect(expeditionHp(a)).toBeCloseTo(max * 0.3, 5);
    expect(a.bodyParts.torso.mortalWound).toBe(false);
    expect(a.bodyParts.leftLeg.fractured).toBe(true);
    expect(totalMaxHp(a.bodyParts)).toBe(max);
  });

  it('returns seeded real loot with unique instance IDs and legal stack sizes', () => {
    const a = generateExpeditionLoot('pharmacy', 'loot');
    expect(a).toEqual(generateExpeditionLoot('pharmacy', 'loot'));
    expect(a.length).toBeGreaterThan(0);
    expect(new Set(a.map(i => i.uid)).size).toBe(a.length);
    for (const i of a) {
      expect(ITEMS[i.defId]).toBeDefined();
      expect(i.stack).toBeGreaterThan(0);
      expect(i.stack).toBeLessThanOrEqual(ITEMS[i.defId].maxStack);
    }
    expect(generateExpeditionLoot('pharmacy', 'other')).not.toEqual(a);
  });

  it('reserves craft inputs until one timed completion and rejects repeated completion/refund', () => {
    const s = survivor();
    addExpeditionItem(s, item('cloth_rags', 'rags', 2));
    const result = applyExpeditionCommand(s, { type: 'craft', recipeId: 'bandages' }, 'craft');
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.craft).toBeDefined();
    expect(s.items).toHaveLength(0);
    expect(addExpeditionItem(s, item('cloth_rags', 'rags', 2))).toBeTruthy();
    expect(applyExpeditionCommand(s, { type: 'craft', recipeId: 'bandages' }, 'another').error).toBeTruthy();
    expect(completeExpeditionCraft(s, result.craft!)).toEqual([]);
    expect(s.items.reduce((n, i) => n + i.stack, 0)).toBe(2);
    expect(s.items[0].defId).toBe('improvised_bandage');
    completeExpeditionCraft(s, result.craft!);
    cancelExpeditionCraft(s, result.craft!);
    expect(s.items.reduce((n, i) => n + i.stack, 0)).toBe(2);
  });

  it('refunds exactly the reserved partial stack on cancellation', () => {
    const s = survivor();
    addExpeditionItem(s, item('cloth_rags', 'rags', 3));
    const result = applyExpeditionCommand(s, { type: 'craft', recipeId: 'bandages' }, 'cancel');
    expect(s.items[0].stack).toBe(1);
    expect(cancelExpeditionCraft(s, result.craft!)).toEqual([]);
    expect(s.items).toHaveLength(1);
    expect(s.items[0].stack).toBe(3);
    cancelExpeditionCraft(s, result.craft!);
    completeExpeditionCraft(s, result.craft!);
    expect(s.items[0].stack).toBe(3);
  });

  it('rejects invalid commands and recipes atomically', () => {
    const s = survivor();
    const before = structuredClone(s);
    for (const recipeId of ['missing', '__proto__', 'parts', 'bandages']) {
      expect(applyExpeditionCommand(s, { type: 'craft', recipeId }, 'bad').error).toBeTruthy();
    }
    expect(applyExpeditionCommand(s, { type: 'equipItem', uid: 'absent' }, 'bad').error).toBeTruthy();
    expect(applyExpeditionCommand(s, { type: 'dropItem', uid: 'absent' }, 'bad').error).toBeTruthy();
    expect(s).toEqual(before);
  });

  it('retains reserved crafting weight while receiving another player\'s items', () => {
    const s = survivor();
    addExpeditionItem(s, item('cloth_rags', 'rags', 2));
    let n = 0;
    while (!addExpeditionItem(s, item('water_bottle', `water:${n}`))) n++;
    const speedWithMaterials = expeditionTravelSpeed(s);
    const craft = applyExpeditionCommand(s, { type: 'craft', recipeId: 'bandages' }, 'weight');
    expect(craft.craft).toBeDefined();
    expect(expeditionTravelSpeed(s)).toBeCloseTo(speedWithMaterials, 8);
    expect(addExpeditionItem(s, item('water_bottle', 'extra'))).toBeTruthy();
  });

  it('uses occupation, gear, energy, injuries and carry load in derived stats', () => {
    const s = survivor('trainer');
    expect(expeditionAttack(s)).toBeGreaterThan(0);
    expect(expeditionDefense(s)).toBeGreaterThan(0);
    const speed = expeditionTravelSpeed(s);
    s.meters.energy = 0;
    s.bodyParts.leftLeg = { ...s.bodyParts.leftLeg, hp: 0, fractured: true, crippled: true };
    expect(expeditionTravelSpeed(s)).toBeLessThan(speed);
  });


  it('co-op survivors start with no traits', () => {
    const s = createExpeditionSurvivor('A', 'soldier', 's');
    expect(s.character.traitIds).toEqual([]);
    expect(Object.values(s.character.attributes).every((v) => v === BASE_ATTRIBUTE)).toBe(true);
  });

  it('co-op survivors get the role kit', () => {
    const soldier = createExpeditionSurvivor('A', 'soldier', 's');
    expect(soldier.equipment.body?.defId).toBe('army_uniform');
    expect(soldier.equipment.legs?.defId).toBe('camo_pants');
    expect(soldier.equipment.mainHand?.defId).toBe('parang');
    expect(createExpeditionSurvivor('B', 'drifter', 's').equipment.mainHand).toBeFalsy();
  });
});
