import type {
  AttributeKey,
  Attributes,
  BodyParts,
  Character,
  Equipment,
  ItemInstance,
  Meters,
  Trait,
  WeatherState,
} from './types';
import {
  ATTRIBUTE_KEYS,
  BASE_ATTRIBUTE,
  equipAwarenessMod,
  getTraits,
  hasTraitFlag,
  maxHpFor,
  sumTraitMod,
  traitAwarenessMod,
} from './character';
import {
  offHandCombatMods,
  playerCombatStats,
  playerDodgeChance,
  STANCES,
  TERRAIN,
} from './combat';
import { awareness } from './fog';
import {
  ALL_EQUIP_SLOTS,
  conditionScale,
  equipDefenseBonus,
  equipEncounterChanceMod,
  equipSearchSpeedBonus,
  equipTravelSpeedFactor,
  loadEffectsFor,
  maxCarry,
  scaledMod,
} from './inventory';
import { itemDef } from './loot';
import { searchSpeedFactor } from './searchSession';
import {
  armCombatPenalty,
  bleedEncounterMod,
  energyAttackBonus,
  energyDodgeBonus,
  legTravelFactor,
  travelSpeedMultiplier,
} from './survival';
import {
  environmentCombatMods,
  weatherEnergyMult,
  weatherEncounterMod,
  weatherThirstMult,
  weatherTravelMult,
} from './weather';

export type SheetFormat = 'flat' | 'pct' | 'mult' | 'kg';

export type SheetGroupId =
  | 'attributes'
  | 'combat'
  | 'mobility'
  | 'survival'
  | 'search'
  | 'other';

export type SheetSource =
  | { kind: 'trait'; id: string; amount: number }
  | { kind: 'item'; defId: string; amount: number }
  | { kind: 'attr'; attr: AttributeKey; amount: number }
  | { kind: 'key'; key: string; amount: number };

export interface SheetRow {
  id: string;
  group: SheetGroupId;
  format: SheetFormat;
  total: number;
  /** Effect direction vs baseline. null = sitting on the baseline. */
  good: boolean | null;
  sources: SheetSource[];
}

export interface StatSheet {
  groups: { id: SheetGroupId; rows: SheetRow[] }[];
}

export interface StatSheetInput {
  character: Character;
  equipment: Equipment;
  items: ItemInstance[];
  meters: Meters;
  bodyParts: BodyParts;
  weather: WeatherState;
}

const EPS = 1e-9;

/** Who you are out of a fight — stance and terrain stay combat-only. */
const SHEET_STANCE = {
  ...STANCES.guarded,
  attackMod: 0,
  damageMod: 0,
  defenseMod: 0,
  dodgeMod: 0,
  speedMod: 0,
  fleeDcMod: 0,
};

const SHEET_TERRAIN = { ...TERRAIN.open_ground };

function nz(n: number): boolean {
  return Math.abs(n) > EPS;
}

function numTrait(t: Trait, key: keyof Trait): number {
  const v = t[key];
  return typeof v === 'number' ? v : 0;
}

function traitSources(traits: Trait[], key: keyof Trait): SheetSource[] {
  const out: SheetSource[] = [];
  for (const t of traits) {
    const amount = numTrait(t, key);
    if (nz(amount)) out.push({ kind: 'trait', id: t.id, amount });
  }
  return out;
}

function itemSources(
  equipment: Equipment,
  amountOf: (inst: ItemInstance) => number,
): SheetSource[] {
  const out: SheetSource[] = [];
  for (const slot of ALL_EQUIP_SLOTS) {
    const inst = equipment[slot];
    if (!inst) continue;
    const amount = amountOf(inst);
    if (nz(amount)) out.push({ kind: 'item', defId: inst.defId, amount });
  }
  return out;
}

function keySrc(key: string, amount: number): SheetSource | null {
  return nz(amount) ? { kind: 'key', key, amount } : null;
}

function attrSrc(attr: AttributeKey, amount: number): SheetSource | null {
  return nz(amount) ? { kind: 'attr', attr, amount } : null;
}

function push(out: SheetSource[], src: SheetSource | null | SheetSource[]): void {
  if (!src) return;
  if (Array.isArray(src)) {
    for (const s of src) if (nz(s.amount)) out.push(s);
    return;
  }
  out.push(src);
}

function sumOf(sources: SheetSource[]): number {
  let t = 0;
  for (const s of sources) t += s.amount;
  return t;
}

function polarity(total: number, higherIsGood: boolean, baseline = 0): boolean | null {
  if (!nz(total - baseline)) return null;
  return higherIsGood ? total > baseline : total < baseline;
}

function row(
  id: string,
  group: SheetGroupId,
  format: SheetFormat,
  sources: SheetSource[],
  higherIsGood: boolean,
  opts?: { total?: number; baseline?: number },
): SheetRow {
  const total = opts?.total ?? sumOf(sources);
  return {
    id,
    group,
    format,
    total,
    good: polarity(total, higherIsGood, opts?.baseline ?? 0),
    sources,
  };
}

function timeAccuracy(weather: WeatherState, nightPenaltyRemoved: boolean): number {
  if (nightPenaltyRemoved) return 0;
  if (weather.time === 'night') return -2;
  if (weather.time === 'dusk') return -1;
  return 0;
}

function skyAccuracy(weather: WeatherState): number {
  const timePenalty = timeAccuracy(weather, false);
  return environmentCombatMods(weather).playerAccuracy - timePenalty;
}

function isNightBand(weather: WeatherState): boolean {
  return weather.time === 'night' || weather.time === 'dusk';
}

/**
 * Live derived stats with every non-zero contributor. Pure — no React, no RNG.
 */
export function buildStatSheet(input: StatSheetInput): StatSheet {
  const { character, equipment, items, meters, bodyParts, weather } = input;
  const { attributes, traitIds } = character;
  const traits = getTraits(traitIds);
  const carryMod = sumTraitMod(traitIds, 'carryCapacityMod');
  const fx = loadEffectsFor(items, attributes, equipment, carryMod);
  const armPen = armCombatPenalty(bodyParts);
  const pStats = playerCombatStats(
    attributes,
    traitIds,
    equipment,
    armPen,
    fx.attackMod,
  );
  const energyAtk = energyAttackBonus(meters.energy);
  const timeAim = timeAccuracy(weather, pStats.nightAccuracyPenaltyRemoved);
  const skyAim = skyAccuracy(weather);
  const nightExtra = isNightBand(weather) ? pStats.nightAccuracyExtra : 0;
  const liveAttack = pStats.attack + energyAtk + timeAim + skyAim + nightExtra;

  const dodge = playerDodgeChance(
    attributes,
    traitIds,
    equipment,
    meters.energy,
    bodyParts,
    SHEET_STANCE,
    SHEET_TERRAIN,
    fx.dodgeMod,
  );

  const weatherTravel = weatherTravelMult(weather.kind);
  const travel =
    (travelSpeedMultiplier(meters.energy) *
      legTravelFactor(bodyParts) *
      equipTravelSpeedFactor(equipment) *
      (1 + sumTraitMod(traitIds, 'travelSpeedMod'))) /
    fx.travelMult /
    weatherTravel;

  const groups: StatSheet['groups'] = [
    { id: 'attributes', rows: attributeRows(attributes, traits) },
    {
      id: 'combat',
      rows: combatRows({
        attributes,
        traits,
        equipment,
        bodyParts,
        pStats,
        liveAttack,
        dodge,
        energyAtk,
        timeAim,
        skyAim,
        nightExtra,
        armPen,
        fxAttack: fx.attackMod,
        fxDodge: fx.dodgeMod,
        fxCombatSpeed: fx.combatSpeedMult,
        energy: meters.energy,
      }),
    },
    {
      id: 'mobility',
      rows: mobilityRows({
        attributes,
        traits,
        traitIds,
        equipment,
        carryMod,
        fx,
        travel,
        weather,
        bodyParts,
        meters,
      }),
    },
    { id: 'survival', rows: survivalRows(traits, weather) },
    { id: 'search', rows: searchRows(attributes, traits, traitIds, equipment) },
    { id: 'other', rows: otherRows(traitIds, traits) },
  ];

  return {
    groups: groups
      .map((g) => ({
        ...g,
        rows: g.rows.filter((r) => r.sources.length > 0 || r.group === 'attributes'),
      }))
      .filter((g) => g.rows.length > 0),
  };
}

export function sheetRow(sheet: StatSheet, id: string): SheetRow | undefined {
  for (const g of sheet.groups) {
    const found = g.rows.find((r) => r.id === id);
    if (found) return found;
  }
  return undefined;
}

function attributeRows(attrs: Attributes, traits: Trait[]): SheetRow[] {
  const modKey: Record<AttributeKey, keyof Trait> = {
    strength: 'strengthMod',
    dexterity: 'dexterityMod',
    endurance: 'enduranceMod',
    perception: 'perceptionMod',
    wits: 'witsMod',
  };
  return ATTRIBUTE_KEYS.map((key) => {
    const sources: SheetSource[] = [{ kind: 'key', key: 'base', amount: BASE_ATTRIBUTE }];
    push(sources, traitSources(traits, modKey[key]));
    return row(key, 'attributes', 'flat', sources, true, {
      total: attrs[key],
      baseline: BASE_ATTRIBUTE,
    });
  });
}

function combatRows(args: {
  attributes: Attributes;
  traits: Trait[];
  equipment: Equipment;
  bodyParts: BodyParts;
  pStats: ReturnType<typeof playerCombatStats>;
  liveAttack: number;
  dodge: number;
  energyAtk: number;
  timeAim: number;
  skyAim: number;
  nightExtra: number;
  armPen: number;
  fxAttack: number;
  fxDodge: number;
  fxCombatSpeed: number;
  energy: number;
}): SheetRow[] {
  const {
    attributes,
    traits,
    equipment,
    bodyParts,
    pStats,
    liveAttack,
    dodge,
    energyAtk,
    timeAim,
    skyAim,
    nightExtra,
    armPen,
    fxAttack,
    fxDodge,
    fxCombatSpeed,
    energy,
  } = args;
  const rows: SheetRow[] = [];
  const oh = offHandCombatMods(equipment);

  const atk: SheetSource[] = [];
  push(atk, attrSrc('dexterity', attributes.dexterity));
  push(atk, keySrc('weapon', pStats.weaponAccuracy));
  push(atk, traitSources(traits, 'attackMod'));
  push(
    atk,
    itemSources(equipment, (inst) => itemDef(inst.defId).modifiers?.attackBonus ?? 0),
  );
  push(atk, itemSources(equipment, (inst) => scaledMod(inst, 'accuracyBonus')));
  push(atk, keySrc('arms', -armPen));
  push(atk, keySrc('load', fxAttack));
  push(atk, keySrc('energy', energyAtk));
  push(atk, keySrc('night', timeAim));
  push(atk, keySrc('weather', skyAim));
  if (nz(nightExtra)) push(atk, traitSources(traits, 'nightAccuracyExtra'));
  rows.push(row('attack', 'combat', 'flat', atk, true, { total: liveAttack }));

  const def: SheetSource[] = [];
  push(def, keySrc('base', 10));
  push(def, attrSrc('dexterity', Math.floor(attributes.dexterity / 2)));
  push(def, traitSources(traits, 'defenseMod'));
  const defItems = itemSources(equipment, (inst) => equipDefenseBonus(inst));
  push(def, defItems);
  // Gear defence is capped (see MAX_EQUIP_DEFENSE). List the shortfall rather
  // than trimming the per-item lines: the player should see which pieces are
  // pulling and that the kit has stopped paying for more.
  push(def, keySrc('capped', pStats.gearDefense - sumOf(defItems)));
  rows.push(row('defence', 'combat', 'flat', def, true, { total: pStats.defense }));

  const ddg: SheetSource[] = [];
  push(ddg, attrSrc('dexterity', (attributes.dexterity - BASE_ATTRIBUTE) * 0.02));
  push(ddg, traitSources(traits, 'dodgeMod'));
  push(
    ddg,
    itemSources(equipment, (inst) => scaledMod(inst, 'dodgeBonus')),
  );
  push(ddg, keySrc('offHand', oh.dodge));
  push(ddg, keySrc('energy', energyDodgeBonus(energy)));
  push(ddg, keySrc('legs', (legTravelFactor(bodyParts) - 1) * 0.1));
  push(ddg, keySrc('load', fxDodge));
  rows.push(row('dodge', 'combat', 'pct', ddg, true, { total: dodge }));

  const strDmg = Math.floor(attributes.strength / 2);
  const dmg: SheetSource[] = [];
  const unarmed = /fists/i.test(pStats.weaponName);
  push(dmg, keySrc(unarmed ? 'unarmed' : 'weapon', pStats.damage - strDmg));
  push(dmg, attrSrc('strength', strDmg));
  rows.push(row('damage', 'combat', 'flat', dmg, true, { total: pStats.damage }));

  const hp: SheetSource[] = [];
  push(hp, keySrc('base', 60));
  push(hp, attrSrc('endurance', attributes.endurance * 6));
  push(hp, traitSources(traits, 'maxHpBonus'));
  rows.push(
    row('maxHp', 'combat', 'flat', hp, true, {
      total: maxHpFor({
        name: '',
        attributes,
        traitIds: traits.map((t) => t.id),
      }),
    }),
  );

  const inf = traitSources(traits, 'infectionResist');
  if (inf.length) {
    rows.push(row('infectionResist', 'combat', 'pct', inf, true, { total: pStats.infectionResist }));
  }

  const zAtk = traitSources(traits, 'zombieAttackMod');
  if (zAtk.length) rows.push(row('zombieAttack', 'combat', 'flat', zAtk, true));

  const soak = itemSources(equipment, (inst) => scaledMod(inst, 'limbArmor'));
  if (soak.length) rows.push(row('soak', 'combat', 'flat', soak, true));

  const status = itemSources(equipment, (inst) => scaledMod(inst, 'statusResist'));
  if (status.length) rows.push(row('statusResist', 'combat', 'pct', status, true));

  const block = itemSources(equipment, (inst) => scaledMod(inst, 'blockChance'));
  if (block.length) rows.push(row('block', 'combat', 'pct', block, true));

  const spd: SheetSource[] = [];
  push(spd, keySrc('weapon', pStats.speedFactor - 1));
  push(spd, itemSources(equipment, (inst) => scaledMod(inst, 'speedBonus')));
  push(spd, keySrc('offHand', oh.speed));
  push(spd, keySrc('load', fxCombatSpeed - 1));
  if (spd.length) rows.push(row('combatSpeed', 'combat', 'pct', spd, true));

  return rows;
}

function mobilityRows(args: {
  attributes: Attributes;
  traits: Trait[];
  traitIds: string[];
  equipment: Equipment;
  carryMod: number;
  fx: ReturnType<typeof loadEffectsFor>;
  travel: number;
  weather: WeatherState;
  bodyParts: BodyParts;
  meters: Meters;
}): SheetRow[] {
  const { attributes, traits, traitIds, equipment, carryMod, fx, travel, weather, bodyParts, meters } =
    args;
  const rows: SheetRow[] = [];

  const tr: SheetSource[] = [];
  push(tr, keySrc('energy', travelSpeedMultiplier(meters.energy) - 1));
  push(tr, keySrc('legs', legTravelFactor(bodyParts) - 1));
  push(tr, itemSources(equipment, (inst) => scaledMod(inst, 'travelSpeedBonus')));
  push(tr, traitSources(traits, 'travelSpeedMod'));
  push(tr, keySrc('load', 1 / Math.max(0.05, fx.travelMult) - 1));
  push(tr, keySrc('weather', 1 / weatherTravelMult(weather.kind) - 1));
  rows.push(row('travel', 'mobility', 'mult', tr, true, { total: travel, baseline: 1 }));

  const carry: SheetSource[] = [];
  push(carry, attrSrc('strength', attributes.strength * 3));
  push(carry, attrSrc('endurance', attributes.endurance * 2));
  push(carry, traitSources(traits, 'carryCapacityMod'));
  push(
    carry,
    itemSources(equipment, (inst) => {
      const bonus = itemDef(inst.defId).modifiers?.weightCapacityBonus ?? 0;
      return bonus ? Math.round(bonus * conditionScale(inst)) : 0;
    }),
  );
  rows.push(
    row('carry', 'mobility', 'kg', carry, true, {
      total: maxCarry(attributes, equipment, carryMod),
    }),
  );

  const enc: SheetSource[] = [];
  push(enc, itemSources(equipment, (inst) => scaledMod(inst, 'encounterChanceMod')));
  push(enc, traitSources(traits, 'encounterChanceMod'));
  push(enc, keySrc('load', fx.encounterMod));
  push(enc, keySrc('bleed', bleedEncounterMod(bodyParts)));
  push(enc, keySrc('weather', weatherEncounterMod(weather.kind)));
  if (isNightBand(weather)) push(enc, traitSources(traits, 'nightEncounterChanceMod'));
  const encTotal =
    equipEncounterChanceMod(equipment) +
    sumTraitMod(traitIds, 'encounterChanceMod') +
    fx.encounterMod +
    bleedEncounterMod(bodyParts) +
    weatherEncounterMod(weather.kind) +
    (isNightBand(weather) ? sumTraitMod(traitIds, 'nightEncounterChanceMod') : 0);
  if (enc.length) rows.push(row('encounters', 'mobility', 'pct', enc, false, { total: encTotal }));

  return rows;
}

function survivalRows(traits: Trait[], weather: WeatherState): SheetRow[] {
  const rows: SheetRow[] = [];
  const hunger = traitSources(traits, 'hungerDrainMod');
  if (hunger.length) rows.push(row('hungerDrain', 'survival', 'pct', hunger, false));

  const thirst: SheetSource[] = [];
  push(thirst, traitSources(traits, 'thirstDrainMod'));
  push(thirst, keySrc('weather', weatherThirstMult(weather.kind) - 1));
  if (thirst.length) rows.push(row('thirstDrain', 'survival', 'pct', thirst, false));

  const energy: SheetSource[] = [];
  push(energy, traitSources(traits, 'energyDrainMod'));
  // Outdoor drain only applies in heat (or when actually outside — sheet has weather only).
  if (weather.kind === 'heat') {
    push(energy, traitSources(traits, 'outdoorEnergyDrainMod'));
  }
  push(energy, keySrc('weather', weatherEnergyMult(weather.kind) - 1));
  if (energy.length) rows.push(row('energyDrain', 'survival', 'pct', energy, false));

  const sleep = traitSources(traits, 'sleepRestoreMod');
  if (sleep.length) rows.push(row('sleepRestore', 'survival', 'pct', sleep, true));

  const heal = traitSources(traits, 'healBonus');
  if (heal.length) rows.push(row('healBonus', 'survival', 'flat', heal, true));

  const food = traitSources(traits, 'foodEffectMod');
  if (food.length) rows.push(row('foodEffect', 'survival', 'pct', food, true));

  return rows;
}

function searchRows(
  attributes: Attributes,
  traits: Trait[],
  traitIds: string[],
  equipment: Equipment,
): SheetRow[] {
  const rows: SheetRow[] = [];
  const equipSearch = equipSearchSpeedBonus(equipment);
  const traitSearch = sumTraitMod(traitIds, 'searchSpeedMod');
  const factor = searchSpeedFactor(equipSearch, attributes.perception, traitSearch);
  const speedBonus = 1 / factor - 1;
  const srch: SheetSource[] = [];
  push(srch, attrSrc('perception', Math.max(0, attributes.perception - BASE_ATTRIBUTE) * 0.04));
  push(srch, traitSources(traits, 'searchSpeedMod'));
  push(srch, itemSources(equipment, (inst) => scaledMod(inst, 'searchSpeedBonus')));
  if (srch.length) {
    rows.push(row('searchSpeed', 'search', 'pct', srch, true, { total: speedBonus }));
  }

  const extra = traitSources(traits, 'searchBonusMod');
  if (extra.length) rows.push(row('searchBonus', 'search', 'flat', extra, true));

  const lootSrc: SheetSource[] = traitSources(traits, 'lootMod');
  push(lootSrc, attrSrc('perception', Math.floor((attributes.perception - BASE_ATTRIBUTE) / 2)));
  if (lootSrc.length) rows.push(row('loot', 'search', 'flat', lootSrc, true));

  const aw: SheetSource[] = [];
  push(aw, attrSrc('perception', attributes.perception));
  push(aw, itemSources(equipment, (inst) => itemDef(inst.defId).modifiers?.awarenessMod ?? 0));
  push(aw, traitSources(traits, 'awarenessMod'));
  const awTotal = awareness(
    attributes.perception,
    equipAwarenessMod(equipment),
    traitAwarenessMod(traitIds),
  );
  rows.push(
    row('awareness', 'search', 'flat', aw, true, {
      total: awTotal,
      baseline: BASE_ATTRIBUTE,
    }),
  );

  return rows;
}

function otherRows(traitIds: string[], traits: Trait[]): SheetRow[] {
  const rows: SheetRow[] = [];
  const check = traitSources(traits, 'checkBonusMod');
  if (check.length) rows.push(row('checkBonus', 'other', 'flat', check, true));

  const craft = traitSources(traits, 'craftCostMod');
  if (craft.length) rows.push(row('craftCost', 'other', 'flat', craft, false));

  const grid = traitSources(traits, 'gridWidthBonus');
  if (grid.length) rows.push(row('gridWidth', 'other', 'flat', grid, true));

  const ambush = traitSources(traits, 'ambushChanceMod');
  if (ambush.length) rows.push(row('ambush', 'other', 'pct', ambush, false));

  const firstHit = traitSources(traits, 'firstHitDamageMult');
  if (firstHit.length) {
    rows.push(
      row(
        'firstHit',
        'other',
        'pct',
        firstHit.map((s) => ({ ...s, amount: s.amount - 1 })),
        false,
      ),
    );
  }

  const flags: { flag: keyof Trait; id: string; good: boolean }[] = [
    { flag: 'nightAccuracyPenaltyRemoved', id: 'nightVision', good: true },
    { flag: 'cannotDropItems', id: 'cannotDrop', good: false },
    { flag: 'bleedingSelfStopDisabled', id: 'bleedNoClot', good: false },
    { flag: 'showSearchesRemaining', id: 'showSearches', good: true },
  ];
  for (const f of flags) {
    if (!hasTraitFlag(traitIds, f.flag)) continue;
    const who = traits.filter((t) => t[f.flag] === true);
    rows.push(
      row(
        f.id,
        'other',
        'flat',
        who.map((t) => ({ kind: 'trait', id: t.id, amount: 1 })),
        f.good,
        { total: 1 },
      ),
    );
  }

  return rows;
}
