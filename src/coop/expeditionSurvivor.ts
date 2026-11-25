import type {
  BodyPartId, BodyParts, Character, EquipSlot, Equipment, ItemInstance, Meters,
  PoiCategory, SkillDayXp, SkillId, SkillsState, WeatherKind,
} from '../game/types';
import {
  adjustCraftInputs, attributesFromTraits, hasTraitFlag, maxHpFor, sumTraitMod,
} from '../game/character';
import { getOccupation } from '../game/occupations';
import { resolveStartingKit, type KitLine } from '../game/startingKit';
import {
  ALL_EQUIP_SLOTS, arrangeOrLoose, armorConditionScale, BACKPACK, canEquip, effectiveDamage,
  emptyEquipment, equipDefenseBonus, equipTravelSpeedFactor, isBroken,
  limbArmorForZone, LOAD_HARD_CAP, loadEffectsFor, packGridForBag, preparedEffect, scaledRestore, spoil, statusResistForZone,
} from '../game/inventory';
import { conditionRoll, ITEMS, LOOT_TABLES, rollLoot } from '../game/loot';
import { canCraft, DEFAULT_CRAFT_CONTEXT, RECIPES, recipeInputs } from '../game/crafting';
import { Rng } from '../game/rng';
import {
  armCombatPenalty, applyPartDamage, BODY_PART_IDS, clampMeter, energyAttackBonus,
  headCombatPenalty, headCritReductionFromGear, headTargetReductionFromGear, initialBodyParts, initialMeters, legTravelFactor, rollHitZone,
  sleepRestore, tickInjuries, tickMeters, tickSystemicDamage, torsoCarryMult,
  torsoEnergyDrainMult, totalHp, totalMaxHp,
} from '../game/survival';
import { URBAN_DECAY_DETOUR, walkSpeed } from '../game/travel';
import { weatherEnergyMult, weatherThirstMult } from '../game/weather';
import {
  emptySkillDayXp, gainSkillXp, PRACTICE_XP, skillMods, skillsFromTraits, traitSkillXpMult,
} from '../game/skills';
import {
  applyCare, canCareWithItem, careForItem, CARE_MINUTES, chooseCareTarget,
  recoverySupportMultiplier,
} from '../game/woundCare';

/** Real hours per game hour; room deadlines use the same accelerated clock. */
export const EXPEDITION_HOUR_MS = 60_000;

export interface ExpeditionCraft {
  id: string;
  recipeId: string;
  inputs: ItemInstance[];
  outputs: ItemInstance[];
}

export interface ExpeditionSurvivor {
  character: Character;
  meters: Meters;
  bodyParts: BodyParts;
  items: ItemInstance[];
  equipment: Equipment;
  skills: SkillsState;
  skillDayXp: SkillDayXp;
  /** Local survival clock, persisted to make split ticks and daily XP agree. */
  elapsedHours?: number;
  tickRemainder?: number;
  tickResting?: boolean;
  tickWeather?: WeatherKind;
  craftSerial?: number;
  /** Reservation is authoritative; callers cannot complete/refund it twice. */
  pendingCraft?: ExpeditionCraft;
}

export type ExpeditionCommand =
  | { type: 'useItem' | 'dropItem' | 'equipItem'; uid: string; part?: BodyPartId }
  | { type: 'craft'; recipeId: string };

export interface ExpeditionCommandResult {
  error?: string;
  dropped?: ItemInstance;
  durationMs?: number;
  craft?: ExpeditionCraft;
}

const definition = (id: string) => Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;

function grid(s: ExpeditionSurvivor) {
  return packGridForBag(sumTraitMod(s.character.traitIds, 'gridWidthBonus'), s.equipment.bag);
}

function load(s: ExpeditionSurvivor, items = s.items, equipment = s.equipment) {
  return loadEffectsFor([...items, ...(s.pendingCraft?.inputs ?? [])], s.character.attributes, equipment,
    sumTraitMod(s.character.traitIds, 'carryCapacityMod') + skillMods(s.skills).carryCapacityMod,
    torsoCarryMult(s.bodyParts));
}

function instances(defId: string, count: number, seed: string): ItemInstance[] {
  const def = definition(defId);
  if (!def) return [];
  const out: ItemInstance[] = [];
  const rng = new Rng(seed);
  while (count > 0) {
    const stack = Math.min(count, def.stackable ? def.maxStack : 1);
    out.push({
      uid: `exp:${seed}:${out.length}`, defId, stack, container: BACKPACK,
      x: 0, y: 0, rotated: false,
      ...(def.maxCondition === undefined ? {} : { condition: conditionRoll(rng, defId, 0.5) }),
    });
    count -= stack;
  }
  return out;
}

export function createExpeditionSurvivor(
  name: string, occupationId: string, seed: string, starterKit = true,
): ExpeditionSurvivor {
  const occupation = getOccupation(occupationId);
  if (!occupation) throw new Error('Unknown occupation');
  const character: Character = {
    name: name.trim().slice(0, 32) || 'Survivor', occupationId,
    traitIds: [], attributes: attributesFromTraits([]),
  };
  const s: ExpeditionSurvivor = {
    character, meters: initialMeters(), bodyParts: initialBodyParts(maxHpFor(character)),
    items: [], equipment: emptyEquipment(), skills: skillsFromTraits(character.traitIds),
    skillDayXp: emptySkillDayXp(), elapsedHours: 0, tickRemainder: 0, craftSerial: 0,
  };
  // Solo rounds each limb independently; assign its rounding remainder to the
  // torso so the independent survivor has exactly the character's HP budget.
  const hpRemainder = maxHpFor(character) - totalMaxHp(s.bodyParts);
  s.bodyParts.torso = { ...s.bodyParts.torso,
    hp: s.bodyParts.torso.hp + hpRemainder, maxHp: s.bodyParts.torso.maxHp + hpRemainder };
  if (starterKit) {
    // The role's kit (no traits in co-op): worn gear first, bag included, then
    // the pack. Counts stay bounded against accidental catalog quantity explosions.
    const kit = resolveStartingKit(occupationId, [], new Rng(`${seed}:kit`));
    const fresh = (line: KitLine) => {
      const max = definition(line.id)?.maxCondition;
      return instances(line.id, Math.min(4, Math.max(1, line.count)), `${seed}:kit:${line.id}`)
        .map(inst => (max === undefined ? inst : { ...inst, condition: max }));
    };
    for (const [slot, line] of Object.entries(kit.equip) as [EquipSlot, KitLine][]) {
      const [inst] = fresh(line);
      if (inst) s.equipment[slot] = inst;
    }
    for (const line of kit.pack) for (const inst of fresh(line)) addExpeditionItem(s, inst);
    for (const defId of ['canned_food', 'bandage']) {
      for (const inst of instances(defId, 1, `${seed}:supplies:${defId}`)) addExpeditionItem(s, inst);
    }
  }
  return s;
}

/** Preserves item identity/metadata; never merges away an incoming UID. */
export function addExpeditionItem(s: ExpeditionSurvivor, item: ItemInstance): string | null {
  const def = definition(item.defId);
  if (!def || !item.uid || !Number.isInteger(item.stack) || item.stack < 1
    || item.stack > (def.stackable ? def.maxStack : 1)
    || (item.condition !== undefined && (!Number.isFinite(item.condition) || item.condition < 0 || item.condition > 100))
    || (item.careUses !== undefined && (!Number.isInteger(item.careUses) || item.careUses < 0 || item.careUses > 3))) return 'Invalid item';
  if (s.items.some(i => i.uid === item.uid) || Object.values(s.equipment).some(i => i?.uid === item.uid)
    || s.pendingCraft?.inputs.some(i => i.uid === item.uid)) return 'Item already carried';
  const items = arrangeOrLoose(grid(s), [...s.items, { ...item, container: BACKPACK, x: 0, y: 0, rotated: false }]);
  if (load(s, items).ratio > LOAD_HARD_CAP) return 'Too much to carry';
  s.items = items;
  return null;
}

export function expeditionHp(s: ExpeditionSurvivor): number { return totalHp(s.bodyParts); }

export function practiceExpedition(s: ExpeditionSurvivor, skill: SkillId, amount: number): void {
  const gain = gainSkillXp(s.skills, s.skillDayXp, 1 + Math.floor((s.elapsedHours ?? 0) / 24), skill, amount,
    { xpMult: traitSkillXpMult(s.character.traitIds, skill) });
  s.skills = gain.skills;
  s.skillDayXp = gain.dayXp;
}

/** Small fixed steps prevent the room's catch-up size changing survival outcomes. */
export function tickExpedition(s: ExpeditionSurvivor, hours: number, resting: boolean, weather: WeatherKind = 'clear'): void {
  if (!Number.isFinite(hours) || hours <= 0) return;
  const step = 1 / 60;
  let remaining = (s.tickRemainder ?? 0) + hours;
  // Preserve a sub-minute previous activity before changing rest state.
  if (s.tickResting !== undefined && (s.tickResting !== resting || s.tickWeather !== weather) && (s.tickRemainder ?? 0) > 1e-9) {
    tickStep(s, s.tickRemainder!, s.tickResting, s.tickWeather ?? 'clear');
    remaining = hours;
  }
  s.tickResting = resting;
  s.tickWeather = weather;
  while (remaining >= step - 1e-9) {
    tickStep(s, step, resting, weather);
    remaining -= step;
  }
  s.tickRemainder = remaining < 1e-9 ? 0 : remaining;
}

function tickStep(s: ExpeditionSurvivor, hours: number, resting: boolean, weather: WeatherKind): void {
  const traits = s.character.traitIds;
  const mods = skillMods(s.skills);
  const trait = (key: Parameters<typeof sumTraitMod>[1]) => sumTraitMod(traits, key);
  s.meters = tickMeters(s.meters, hours, {
    sleeping: resting, outdoors: !resting, heat: weather === 'heat',
    thirstMult: weatherThirstMult(weather),
    hungerDrainMod: trait('hungerDrainMod'), thirstDrainMod: trait('thirstDrainMod'),
    energyDrainMod: trait('energyDrainMod') + mods.energyDrainMod,
    outdoorEnergyDrainMod: trait('outdoorEnergyDrainMod'),
    energyMult: weatherEnergyMult(weather) * torsoEnergyDrainMult(s.bodyParts) * (resting ? 1 : load(s).energyMult),
  });
  if (resting) s.meters.energy = sleepRestore(s.meters.energy, hours, s.meters, trait('sleepRestoreMod'));
  s.bodyParts = tickInjuries(s.bodyParts, hours, hasTraitFlag(traits, 'bleedingSelfStopDisabled'),
    s.meters.hunger, trait('legHealMod') + mods.legHealMod, trait('bleedStopBonus') + mods.bleedStopBonus,
    recoverySupportMultiplier(s.meters.thirst, resting ? 1 : 0) * (1 + (trait('healBonus') + mods.healBonus) / 100)).parts;
  // Solo systemic damage rounds integer HP. Scale the body and elapsed time
  // together so short room ticks retain 1/60 HP rather than rounding to zero.
  const scale = 60;
  const scaled = {} as BodyParts;
  for (const id of BODY_PART_IDS) scaled[id] = { ...s.bodyParts[id], hp: s.bodyParts[id].hp * scale, maxHp: s.bodyParts[id].maxHp * scale };
  const damaged = tickSystemicDamage(scaled, s.meters, hours * scale);
  for (const id of BODY_PART_IDS) s.bodyParts[id] = { ...damaged[id], hp: damaged[id].hp / scale, maxHp: damaged[id].maxHp / scale };
  s.items = spoil(s.items, hours);
  s.elapsedHours = (s.elapsedHours ?? 0) + hours;
}

export function damageExpedition(s: ExpeditionSurvivor, amount: number, seed: string): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const rng = new Rng(seed);
  const protection = Object.values(s.equipment).filter(i => i !== null).map(i => ({
    headTargetReduction: isBroken(i) ? 0 : (definition(i.defId)?.modifiers?.headTargetReduction ?? 0) * armorConditionScale(i),
    headCritReduction: isBroken(i) ? 0 : (definition(i.defId)?.modifiers?.headCritReduction ?? 0) * armorConditionScale(i),
  }));
  const zone = rollHitZone(rng,1 - headTargetReductionFromGear(protection));
  s.bodyParts = applyPartDamage(s.bodyParts, zone, Math.max(1,amount - limbArmorForZone(s.equipment,zone)), rng.fork('injury'), {
    headCritReduction: headCritReductionFromGear(protection), statusResist: statusResistForZone(s.equipment,zone),
  });
}

export function reviveExpedition(s: ExpeditionSurvivor): void {
  const parts = {} as BodyParts;
  for (const id of BODY_PART_IDS) parts[id] = {
    ...s.bodyParts[id], hp: s.bodyParts[id].maxHp * 0.3, bleed: 'none', bleedHours: 0,
    mortalWound: false, crippled: true,
  };
  s.bodyParts = parts;
  s.meters = { ...s.meters, infection: Math.min(70, s.meters.infection),
    hunger: Math.max(20, s.meters.hunger), thirst: Math.max(20, s.meters.thirst), energy: Math.max(20, s.meters.energy) };
}

function rescueCharges(item: ItemInstance): number {
  if (!definition(item.defId) || item.stack <= 0) return 0;
  const care = careForItem(item.defId);
  if (care !== 'bandage' && care !== 'firstAid') return 0;
  return item.defId === 'medkit' ? Math.max(0, Math.min(3, item.careUses ?? 3)) * item.stack : item.stack;
}

export function medicalCount(s: ExpeditionSurvivor): number { return s.items.reduce((n, i) => n + rescueCharges(i), 0); }

function consume(s: ExpeditionSurvivor, inst: ItemInstance): void {
  const uses = inst.careUses ?? 3;
  if (inst.defId === 'medkit' && uses > 1) s.items = s.items.map(i => i.uid === inst.uid ? { ...i, careUses: uses - 1 } : i);
  else s.items = s.items.flatMap(i => i.uid !== inst.uid ? [i] : i.stack > 1 ? [{ ...i, stack: i.stack - 1 }] : []);
}

export function consumeRescueMedical(s: ExpeditionSurvivor): boolean {
  const inst = s.items.find(i => rescueCharges(i) > 0);
  if (!inst) return false;
  consume(s, inst);
  practiceExpedition(s, 'medicine', PRACTICE_XP.healUse);
  return true;
}

export function generateExpeditionLoot(category: PoiCategory, seed: string, lootMod = 0): ItemInstance[] {
  if (!Object.hasOwn(LOOT_TABLES, category)) return [];
  const rng = new Rng(seed);
  return rollLoot(rng, category, 4, lootMod, { guaranteeFind: true })
    .flatMap((stack, n) => instances(stack.defId, stack.count, `${seed}:loot:${n}`));
}

export function expeditionAttack(s: ExpeditionSurvivor): number {
  const weapon = s.equipment.mainHand;
  const damage = weapon && !isBroken(weapon) && definition(weapon.defId)?.effect.kind === 'weapon'
    ? effectiveDamage(weapon) : 3;
  return Math.max(1, damage + Math.floor(s.character.attributes.strength / 2)
    + sumTraitMod(s.character.traitIds, 'attackMod') + skillMods(s.skills).attackMod
    + energyAttackBonus(s.meters.energy) - armCombatPenalty(s.bodyParts) - headCombatPenalty(s.bodyParts) + load(s).attackMod);
}

export function expeditionDefense(s: ExpeditionSurvivor): number {
  return Math.max(0, Math.floor(s.character.attributes.dexterity / 2)
    + sumTraitMod(s.character.traitIds, 'defenseMod') + skillMods(s.skills).defenseMod
    + Object.values(s.equipment).reduce((n, i) => n + (i ? equipDefenseBonus(i) : 0), 0));
}

/** Effective overland metres per game hour, including the solo detour tax. */
export function expeditionTravelSpeed(s: ExpeditionSurvivor): number {
  const burden = load(s);
  if (!burden.canTravel) return 0;
  const bonus = sumTraitMod(s.character.traitIds, 'travelSpeedMod') + skillMods(s.skills).travelSpeedMod;
  return walkSpeed(s.character.attributes, s.meters.energy, legTravelFactor(s.bodyParts)) * 60
    * Math.max(0.1, 1 + bonus) * equipTravelSpeedFactor(s.equipment) / burden.travelMult / URBAN_DECAY_DETOUR;
}

export function applyExpeditionCommand(s: ExpeditionSurvivor, command: ExpeditionCommand, seed: string): ExpeditionCommandResult {
  if (s.pendingCraft) return { error: 'Finish or cancel crafting first' };
  if (command.type === 'craft') return reserveCraft(s, command.recipeId, seed);
  const inst = s.items.find(i => i.uid === command.uid);
  const slot = ALL_EQUIP_SLOTS.find(key => s.equipment[key]?.uid === command.uid);
  const found = inst ?? (slot ? s.equipment[slot] : null);
  if (!found || !definition(found.defId)) return { error: 'Item not carried' };
  if (command.type === 'dropItem') {
    if (hasTraitFlag(s.character.traitIds, 'cannotDropItems')) return { error: 'This survivor cannot discard belongings' };
    if (slot) s.equipment[slot] = null;
    else s.items = s.items.filter(i => i.uid !== command.uid);
    s.items = arrangeOrLoose(grid(s), s.items);
    return { dropped: { ...found, container: 'ground', x: 0, y: 0 } };
  }
  if (command.type === 'equipItem') {
    const equipment = { ...s.equipment };
    let items = s.items.filter(i => i.uid !== command.uid);
    if (slot) {
      equipment[slot] = null;
      items.push({ ...found, container: BACKPACK });
    } else {
      const def = definition(found.defId)!;
      const target = def.effect.kind === 'weapon' && def.effect.ranged ? 'firearm' : def.slot;
      if (!target || !canEquip(def, target)) return { error: 'Item cannot be equipped' };
      if (target === 'offHand' && equipment.mainHand && definition(equipment.mainHand.defId)?.twoHanded) {
        return { error: 'Your main-hand weapon needs both hands' };
      }
      if (equipment[target]) items.push({ ...equipment[target]!, container: BACKPACK });
      if (def.twoHanded && target === 'mainHand' && equipment.offHand) {
        items.push({ ...equipment.offHand, container: BACKPACK });
        equipment.offHand = null;
      }
      equipment[target] = { ...found };
    }
    const mask = packGridForBag(sumTraitMod(s.character.traitIds, 'gridWidthBonus'), equipment.bag);
    items = arrangeOrLoose(mask, items);
    if (load(s, items, equipment).ratio > LOAD_HARD_CAP) return { error: 'Too much to carry after changing equipment' };
    s.equipment = equipment;
    s.items = items;
    return {};
  }
  if (!inst || slot || inst.stack < 1) return { error: 'Item must be in your pack' };
  return consumeItem(s, inst, command.part);
}

function consumeItem(s: ExpeditionSurvivor, inst: ItemInstance, part?: BodyPartId): ExpeditionCommandResult {
  const def = definition(inst.defId)!;
  const care = careForItem(inst.defId);
  if (care) {
    if (inst.defId === 'medkit' && (inst.careUses ?? 3) <= 0) return { error: 'First aid kit is empty' };
    const target = part ?? chooseCareTarget(s.bodyParts, care);
    if (!target || !s.bodyParts[target] || !canCareWithItem(s.bodyParts[target], inst.defId)) return { error: 'No injury this item can treat' };
    s.bodyParts = applyCare(s.bodyParts, target, care);
    if (inst.defId === 'improvised_bandage') s.bodyParts = { ...s.bodyParts, [target]: { ...s.bodyParts[target], dirty: true, dressing: 'soiled' } };
    consume(s, inst);
    practiceExpedition(s, 'medicine', PRACTICE_XP.healUse);
    return { durationMs: CARE_MINUTES[care] / 60 * EXPEDITION_HOUR_MS };
  }
  const effect = preparedEffect(def.effect, inst);
  const meters = { ...s.meters };
  const foodMult = Math.max(0, 1 + sumTraitMod(s.character.traitIds, 'foodEffectMod'));
  if (effect.kind === 'food' || effect.kind === 'water' || effect.kind === 'energy') {
    if (effect.hunger !== undefined) meters.hunger = clampMeter(meters.hunger + Math.round(scaledRestore(inst, effect.hunger) * foodMult));
    if (effect.thirst !== undefined) meters.thirst = clampMeter(meters.thirst + scaledRestore(inst, effect.thirst));
    if (effect.energy !== undefined) meters.energy = clampMeter(meters.energy + scaledRestore(inst, effect.energy));
    if (effect.kind === 'water') {
      const resist = sumTraitMod(s.character.traitIds, 'infectionResist') + skillMods(s.skills).infectionResist;
      meters.infection = clampMeter(meters.infection + ((effect.infectionRisk ?? 0) + (inst.contaminationRisk ?? 0)) * Math.max(0, 1 - resist));
    }
    if (effect.kind === 'food' && def.perishable && isBroken(inst)) meters.infection = clampMeter(meters.infection + 12);
  } else if (effect.kind === 'cure') meters.infection = clampMeter(meters.infection - scaledRestore(inst, effect.infection));
  else return { error: 'This item cannot be used directly' };
  s.meters = meters;
  consume(s, inst);
  return {};
}

function reserveCraft(s: ExpeditionSurvivor, recipeId: string, seed: string): ExpeditionCommandResult {
  const recipe = RECIPES.find(r => r.id === recipeId);
  if (!recipe) return { error: 'Unknown recipe' };
  const discount = sumTraitMod(s.character.traitIds, 'craftCostMod') + skillMods(s.skills).craftCostMod;
  let inputs = recipe.fixedInputs ? { ...recipe.inputs } : adjustCraftInputs(recipe.inputs, discount);
  // A high trades build still has to spend at least one real material.
  if (!Object.keys(inputs).length && !recipe.waterInput) {
    const first = Object.keys(recipe.inputs)[0];
    if (first) inputs = { [first]: 1 };
  }
  inputs = recipeInputs(recipe, s.items, inputs, DEFAULT_CRAFT_CONTEXT);
  const availability = canCraft(recipe, s.items, false, inputs);
  if (!availability.ok) return { error: availability.reason };
  const reserved: ItemInstance[] = [];
  let items = [...s.items];
  for (const [defId, need] of Object.entries(inputs)) {
    let left = need;
    items = items.flatMap(i => {
      if (i.defId !== defId || left <= 0) return [i];
      const take = Math.min(i.stack, left);
      left -= take;
      reserved.push({ ...i, stack: take });
      return take === i.stack ? [] : [{ ...i, stack: i.stack - take }];
    });
  }
  const serial = (s.craftSerial ?? 0) + 1;
  const id = `${seed}:craft:${serial}`;
  const outputs = instances(recipe.outputDefId, recipe.outputCount, id);
  for (const output of outputs) {
    if (definition(output.defId)?.maxCondition !== undefined) output.condition = definition(output.defId)!.maxCondition;
    if (recipe.preparation === 'drink') {
      output.coldPrepared = true;
      if (reserved.some(i => i.defId === 'dirty_water')) output.contaminationRisk = 8;
    }
  }
  const craft: ExpeditionCraft = { id, recipeId, inputs: reserved, outputs };
  s.items = items;
  s.craftSerial = serial;
  s.pendingCraft = structuredClone(craft);
  return { craft, durationMs: recipe.hours * EXPEDITION_HOUR_MS };
}

/** Returns output that the parent must put on the ground if carrying is full. */
export function completeExpeditionCraft(s: ExpeditionSurvivor, craft: ExpeditionCraft): ItemInstance[] {
  const pending = s.pendingCraft;
  if (!pending || !craft || pending.id !== craft.id) return [];
  delete s.pendingCraft;
  const overflow: ItemInstance[] = [];
  for (const item of pending.outputs) if (addExpeditionItem(s, item)) overflow.push({ ...item, container: 'ground' });
  practiceExpedition(s, 'trades', PRACTICE_XP.craft);
  return overflow;
}

/** Refunds reserved inputs once; partial original stacks retain their UID. */
export function cancelExpeditionCraft(s: ExpeditionSurvivor, craft: ExpeditionCraft): ItemInstance[] {
  const pending = s.pendingCraft;
  if (!pending || !craft || pending.id !== craft.id) return [];
  delete s.pendingCraft;
  const overflow: ItemInstance[] = [];
  for (const item of pending.inputs) {
    const existing = s.items.find(i => i.uid === item.uid && i.defId === item.defId);
    if (existing) s.items = s.items.map(i => i === existing ? { ...i, stack: i.stack + item.stack } : i);
    else if (addExpeditionItem(s, item)) overflow.push({ ...item, container: 'ground' });
  }
  return overflow;
}
