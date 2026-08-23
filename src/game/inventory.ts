import type {
  Attributes,
  BodyPartId,
  ConditionTier,
  Container,
  Equipment,
  EquipSlot,
  ItemDef,
  ItemInstance,
  PackGrid,
} from './types';
import { itemDef } from './loot';
import {
  applyTraitColumns,
  blockedSet,
  canPlaceOnMask,
  DEFAULT_PACK_GRID,
  findSlotOnMask,
  packCellKey,
  resolveItemPackGrid,
  type MaskRect,
} from './packGrid';

/** Every wearable / weapon slot, in UI order. */
export const ALL_EQUIP_SLOTS: EquipSlot[] = [
  'head',
  'body',
  'hands',
  'legs',
  'feet',
  'bag',
  'mainHand',
  'offHand',
];

export const BACKPACK = 'backpack';
/** Base pack without an equipped bag — pockets only. Traits append columns; bags set the silhouette. */
export const BACKPACK_DIMS = { w: DEFAULT_PACK_GRID.w, h: DEFAULT_PACK_GRID.h };
/** On-site POI stash — tight so surplus hauls force triage. */
export const STASH_DIMS = { w: 3, h: 3 };
/** Compact grid for an in-progress sequential search (timeline stash). */
export const SEARCH_DIMS = { w: 8, h: 5 };
/** Transient overflow while crawling a tunnel — not a location stash. */
export const TEMP_STASH = 'temp:crawl';
export const TEMP_STASH_DIMS = { w: 4, h: 4 };

const EMPTY_BLOCKED: ReadonlySet<string> = new Set();

/**
 * Current backpack silhouette (bag mask + trait columns).
 *
 * Module state rather than a parameter because `dimsFor` is reached through
 * `canPlace` and `findSlot` from a dozen call sites that have no business
 * knowing about the character — and a run only ever has one. The store sets it
 * when a character is committed, a bag is equipped, or a save is resumed.
 */
let backpackMask: PackGrid = { ...DEFAULT_PACK_GRID };

/** Pack silhouette for an equipped bag (or pockets) plus trait columns. Does not touch `backpackMask`. */
export function packGridForBag(
  traitWidthBonus: number,
  bag: ItemInstance | null,
): PackGrid {
  const base = bag
    ? (resolveItemPackGrid(itemDef(bag.defId)) ?? { ...DEFAULT_PACK_GRID })
    : { ...DEFAULT_PACK_GRID };
  return applyTraitColumns(base, traitWidthBonus);
}

/** Recompute pack silhouette from the equipped bag + trait column bonus. */
export function syncBackpackBonuses(
  traitWidthBonus: number,
  equipment: Equipment,
): void {
  backpackMask = packGridForBag(traitWidthBonus, equipment.bag);
}

/** Grid dimensions for a container: backpack bounding box follows the bag mask. */
export function dimsFor(container: Container): { w: number; h: number } {
  if (container === BACKPACK) {
    return { w: backpackMask.w, h: backpackMask.h };
  }
  if (container.startsWith('search:')) return SEARCH_DIMS;
  if (container === TEMP_STASH) return TEMP_STASH_DIMS;
  return STASH_DIMS;
}

/** Cells the backpack will not accept. Other containers are solid rectangles. */
export function blockedCellsFor(container: Container): ReadonlySet<string> {
  if (container !== BACKPACK) return EMPTY_BLOCKED;
  return blockedSet(backpackMask);
}

let uidCounter = 0;
export function newUid(): string {
  uidCounter += 1;
  return `it_${Date.now().toString(36)}_${uidCounter}`;
}

/** Footprint of an item accounting for rotation. */
export function footprint(def: ItemDef, rotated: boolean): { w: number; h: number } {
  return rotated ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

/** The set of grid cells an instance occupies. */
export function cellsOf(inst: ItemInstance): { x: number; y: number }[] {
  const def = itemDef(inst.defId);
  const { w, h } = footprint(def, inst.rotated);
  const cells: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      cells.push({ x: inst.x + dx, y: inst.y + dy });
    }
  }
  return cells;
}

/**
 * Can `candidate` be placed in `container` without going out of bounds,
 * sitting on a hole, or overlapping any item other than `ignoreUid`?
 */
export function canPlace(
  container: Container,
  items: ItemInstance[],
  candidate: { x: number; y: number; w: number; h: number },
  ignoreUid?: string,
): boolean {
  const dims = dimsFor(container);
  if (candidate.x < 0 || candidate.y < 0) return false;
  if (candidate.x + candidate.w > dims.w) return false;
  if (candidate.y + candidate.h > dims.h) return false;

  const blocked = blockedCellsFor(container);
  const occupied = new Set<string>();
  for (const inst of items) {
    if (inst.container !== container || inst.uid === ignoreUid) continue;
    for (const c of cellsOf(inst)) occupied.add(packCellKey(c.x, c.y));
  }
  for (let dy = 0; dy < candidate.h; dy++) {
    for (let dx = 0; dx < candidate.w; dx++) {
      const key = packCellKey(candidate.x + dx, candidate.y + dy);
      if (blocked.has(key) || occupied.has(key)) return false;
    }
  }
  return true;
}

/** First free slot for a def in a container, trying both orientations. Row-major. */
export function findSlot(
  container: Container,
  items: ItemInstance[],
  def: ItemDef,
): { x: number; y: number; rotated: boolean } | null {
  const dims = dimsFor(container);
  for (const rotated of def.w === def.h ? [false] : [false, true]) {
    const { w, h } = footprint(def, rotated);
    for (let y = 0; y <= dims.h - h; y++) {
      for (let x = 0; x <= dims.w - w; x++) {
        if (canPlace(container, items, { x, y, w, h })) return { x, y, rotated };
      }
    }
  }
  return null;
}

/**
 * Add `count` of a def into a container. Tops up existing stacks first, then
 * places new tiles. Returns the updated item list and how many couldn't fit.
 */
export function addToGrid(
  items: ItemInstance[],
  container: Container,
  defId: string,
  count: number,
  condition?: number,
): { items: ItemInstance[]; leftover: number } {
  const def = itemDef(defId);
  let remaining = count;
  let next = [...items];

  if (def.stackable) {
    next = next.map((inst) => {
      if (remaining <= 0 || inst.container !== container || inst.defId !== defId) return inst;
      const room = def.maxStack - inst.stack;
      if (room <= 0) return inst;
      const add = Math.min(room, remaining);
      remaining -= add;
      return { ...inst, stack: inst.stack + add };
    });
  }

  while (remaining > 0) {
    const slot = findSlot(container, next, def);
    if (!slot) break;
    const put = def.stackable ? Math.min(def.maxStack, remaining) : 1;
    next.push({
      uid: newUid(),
      defId,
      container,
      x: slot.x,
      y: slot.y,
      rotated: slot.rotated,
      stack: put,
      ...(def.maxCondition !== undefined
        ? { condition: Math.round(condition ?? def.maxCondition) }
        : {}),
    });
    remaining -= put;
  }

  return { items: next, leftover: remaining };
}

export type ArrangeResult =
  | { ok: true; items: ItemInstance[] }
  | { ok: false; overflow: ItemInstance[] };

function packArea(inst: ItemInstance): number {
  const def = itemDef(inst.defId);
  return def.w * def.h;
}

function packLongerSide(inst: ItemInstance): number {
  const def = itemDef(inst.defId);
  return Math.max(def.w, def.h);
}

function byGreedyPackOrder(a: ItemInstance, b: ItemInstance): number {
  const area = packArea(b) - packArea(a);
  if (area !== 0) return area;
  return packLongerSide(b) - packLongerSide(a);
}

function placeOnMask(
  grid: PackGrid,
  placed: MaskRect[],
  inst: ItemInstance,
): ItemInstance | null {
  const def = itemDef(inst.defId);
  const slot = findSlotOnMask(grid, placed, def);
  if (!slot) return null;
  placed.push(slot);
  return {
    ...inst,
    container: BACKPACK,
    x: slot.x,
    y: slot.y,
    rotated: slot.rotated,
  };
}

function packKeepThenSlot(grid: PackGrid, instances: ItemInstance[]): ArrangeResult {
  const placed: MaskRect[] = [];
  const kept: ItemInstance[] = [];
  const displaced: ItemInstance[] = [];

  for (const inst of instances) {
    if (inst.container !== BACKPACK) {
      displaced.push(inst);
      continue;
    }
    const def = itemDef(inst.defId);
    const { w, h } = footprint(def, inst.rotated);
    const candidate = { x: inst.x, y: inst.y, w, h };
    if (canPlaceOnMask(grid, placed, candidate)) {
      placed.push(candidate);
      kept.push({ ...inst, container: BACKPACK });
    } else {
      displaced.push(inst);
    }
  }

  displaced.sort(byGreedyPackOrder);
  const packed = [...kept];
  for (const inst of displaced) {
    const next = placeOnMask(grid, placed, inst);
    if (!next) return { ok: false, overflow: [inst] };
    packed.push(next);
  }
  return { ok: true, items: packed };
}

function packGreedy(grid: PackGrid, instances: ItemInstance[]): ArrangeResult {
  const placed: MaskRect[] = [];
  const packed: ItemInstance[] = [];
  const overflow: ItemInstance[] = [];
  const ordered = [...instances].sort(byGreedyPackOrder);
  for (const inst of ordered) {
    const next = placeOnMask(grid, placed, inst);
    if (!next) overflow.push(inst);
    else packed.push(next);
  }
  if (overflow.length) return { ok: false, overflow };
  return { ok: true, items: packed };
}

/**
 * Pack `instances` onto `grid` without touching module `backpackMask`.
 * Pass 1 keeps cells that still fit; pass 2 is largest-first greedy.
 */
export function tryArrangeInGrid(
  grid: PackGrid,
  instances: ItemInstance[],
): ArrangeResult {
  if (instances.length === 0) return { ok: true, items: [] };
  const stable = packKeepThenSlot(grid, instances);
  if (stable.ok) return stable;
  return packGreedy(grid, instances);
}

/** English fragment for refuse logs — names of items the greedy pack could not place. */
export function arrangeOverflowClause(overflow: ItemInstance[]): string {
  const names = overflow.map((i) => itemDef(i.defId).name);
  if (names.length === 0) return '';
  if (names.length === 1) return ` No room for ${names[0]}.`;
  if (names.length === 2) return ` No room for ${names[0]} and ${names[1]}.`;
  return ` No room for ${names[0]}, ${names[1]}, and ${names.length - 2} more.`;
}

/** Dry-run: can this bag be equipped over the current haul (plus the worn bag, if any)? */
export function bagSwapFits(
  items: ItemInstance[],
  equipment: Equipment,
  candidate: ItemInstance,
  traitWidthBonus: number,
): boolean {
  if (equipment.bag?.uid === candidate.uid) {
    return bagUnequipFits(items, equipment, traitWidthBonus);
  }
  const grid = packGridForBag(traitWidthBonus, candidate);
  const backpack = items.filter((i) => i.container === BACKPACK && i.uid !== candidate.uid);
  const prev = equipment.bag;
  const candidates = prev ? [...backpack, prev] : backpack;
  return tryArrangeInGrid(grid, candidates).ok;
}

/** Dry-run: can the worn bag come off onto the default (trait-adjusted) pack? */
export function bagUnequipFits(
  items: ItemInstance[],
  equipment: Equipment,
  traitWidthBonus: number,
): boolean {
  const bag = equipment.bag;
  if (!bag) return true;
  const grid = packGridForBag(traitWidthBonus, null);
  const backpack = items.filter((i) => i.container === BACKPACK);
  return tryArrangeInGrid(grid, [...backpack, bag]).ok;
}

/** Items currently held in a given container. */
export function itemsIn(items: ItemInstance[], container: Container): ItemInstance[] {
  return items.filter((i) => i.container === container);
}

// ---------- Condition ----------
//
// Stacking invariant: only non-stackable items carry a condition. A stack of
// five cans has no single wear value that means anything, so `addToGrid` is
// free to merge stacks without reconciling conditions. Any def with
// `maxCondition` must therefore be `stackable: false` — asserted in loot.ts.

/** Wear of an instance, 0..100. Absent ⇒ brand new (and so are old saves). */
export function conditionOf(inst: ItemInstance): number {
  return inst.condition ?? 100;
}

/**
 * Wear reads differently depending on what the thing is. A parang gets blunt, a
 * packet of nasi lemak goes off, and a blister pack passes its expiry — the same
 * 40% needs three different sentences. The tier maths is shared; only the words
 * change.
 */
export type ConditionFamily = 'perishable' | 'medicine' | 'gear';

const TIER_LABELS: Record<ConditionFamily, Record<ConditionTier, string>> = {
  gear: {
    torn: 'Old & Torn',
    used: 'Heavily Used',
    worn: 'Slightly Used',
    pristine: 'Brand New',
  },
  perishable: {
    torn: 'Spoiled',
    used: 'On the Turn',
    worn: 'Day-Old',
    pristine: 'Fresh',
  },
  medicine: {
    torn: 'Expired',
    used: 'Long Past Date',
    worn: 'Near Expiry',
    pristine: 'Sealed',
  },
};

/** Which vocabulary of wear a def speaks. */
export function conditionFamily(def: ItemDef): ConditionFamily {
  switch (def.effect.kind) {
    case 'food':
    case 'water':
      return 'perishable';
    case 'heal':
    case 'cure':
    case 'energy':
      return 'medicine';
    default:
      return 'gear';
  }
}

/** The wear band an instance falls in — what the player actually sees. */
export function tierOf(inst: ItemInstance): ConditionTier {
  const c = conditionOf(inst);
  if (c < 25) return 'torn';
  if (c < 50) return 'used';
  if (c < 75) return 'worn';
  return 'pristine';
}

export function tierLabel(tier: ConditionTier, family: ConditionFamily = 'gear'): string {
  return TIER_LABELS[family][tier];
}

/** Label for an instance, in the vocabulary its def calls for. */
export function instanceTierLabel(inst: ItemInstance): string {
  return tierLabel(tierOf(inst), conditionFamily(itemDef(inst.defId)));
}

/** Whether this item wears out at all. */
export function hasCondition(inst: ItemInstance): boolean {
  return itemDef(inst.defId).maxCondition !== undefined;
}

/**
 * How much of its printed performance a worn item still delivers. A wreck is
 * ~75% effective, never zero — a blunt parang is a bad weapon, not a stick.
 *
 * The floor used to be 45%, and that number drove a spiral rather than a
 * trade-off: a half-worn weapon needed noticeably more swings for the same kill,
 * and every extra swing wore it further. Wear accelerated exactly when the
 * player could least afford it. A shallower curve keeps the incentive to repair
 * without letting a tired weapon feed on itself.
 */
export function conditionScale(inst: ItemInstance): number {
  if (!hasCondition(inst)) return 1;
  return 0.75 + 0.25 * (conditionOf(inst) / 100);
}

/**
 * How much of its printed restore a consumable still delivers. Steeper than
 * gear wear (floor 0.5, not 0.75): a tin that has sat in a hot bag for two days
 * is genuinely less of a meal, and freshness should be worth crossing a carpark
 * for. Never zero — spoiled food still feeds you, it just charges infection for
 * the privilege (see `applyItem`).
 */
export function consumableScale(inst: ItemInstance): number {
  if (!hasCondition(inst)) return 1;
  return 0.5 + 0.5 * (conditionOf(inst) / 100);
}

/** A restore amount after freshness. A positive gain never rounds away to 0. */
export function scaledRestore(inst: ItemInstance, base: number): number {
  const v = Math.round(base * consumableScale(inst));
  return base > 0 ? Math.max(1, v) : v;
}

/** Damage of an equipped weapon after wear. */
export function effectiveDamage(inst: ItemInstance): number {
  const def = itemDef(inst.defId);
  if (def.effect.kind !== 'weapon') return 0;
  return Math.max(1, Math.round(def.effect.damage * conditionScale(inst)));
}

/**
 * Defence bonus an equipped piece still provides after wear. Named for the
 * *equipment* — `combat.effectiveDefense` is the player's whole defence for a
 * round, stance and terrain included, and the two are easy to confuse.
 */
export function equipDefenseBonus(inst: ItemInstance): number {
  const base = itemDef(inst.defId).modifiers?.defenseBonus ?? 0;
  return base === 0 ? 0 : Math.round(base * conditionScale(inst));
}

/** Map a combat hit zone to the wearable slot that covers it (feet never soak). */
export function slotForZone(zone: BodyPartId): EquipSlot | null {
  switch (zone) {
    case 'head':
      return 'head';
    case 'torso':
      return 'body';
    case 'leftArm':
    case 'rightArm':
      return 'hands';
    case 'leftLeg':
    case 'rightLeg':
      return 'legs';
  }
}

export function scaledMod(
  inst: ItemInstance,
  key:
    | 'limbArmor'
    | 'statusResist'
    | 'accuracyBonus'
    | 'speedBonus'
    | 'travelSpeedBonus'
    | 'dodgeBonus'
    | 'attackBonus'
    | 'encounterChanceMod'
    | 'searchSpeedBonus'
    | 'blockChance',
): number {
  if (isBroken(inst)) return 0;
  const base = itemDef(inst.defId).modifiers?.[key] ?? 0;
  if (base === 0) return 0;
  return base * conditionScale(inst);
}

/** Flat soak from the piece covering `zone` (0 if bare / feet / broken). */
export function limbArmorForZone(equipment: Equipment, zone: BodyPartId): number {
  const slot = slotForZone(zone);
  if (!slot) return 0;
  const inst = equipment[slot];
  if (!inst) return 0;
  return Math.round(scaledMod(inst, 'limbArmor'));
}

/** Status resist from the piece covering `zone`, clamped 0..1. */
export function statusResistForZone(equipment: Equipment, zone: BodyPartId): number {
  const slot = slotForZone(zone);
  if (!slot) return 0;
  const inst = equipment[slot];
  if (!inst) return 0;
  return Math.max(0, Math.min(1, scaledMod(inst, 'statusResist')));
}

/** Sum condition-scaled accuracy from all worn gear (gloves). */
export function equipAccuracyBonus(equipment: Equipment): number {
  let sum = 0;
  for (const slot of ALL_EQUIP_SLOTS) {
    const inst = equipment[slot];
    if (inst) sum += scaledMod(inst, 'accuracyBonus');
  }
  return Math.round(sum);
}

/** Sum condition-scaled combat speed from gear. */
export function equipSpeedBonus(equipment: Equipment): number {
  let sum = 0;
  for (const slot of ALL_EQUIP_SLOTS) {
    const inst = equipment[slot];
    if (inst) sum += scaledMod(inst, 'speedBonus');
  }
  return sum;
}

/**
 * Multiplier on walk pace from footwear / light gear.
 * `travelSpeedBonus` of 0.1 ⇒ ×1.1. Floored so bad slippers still move.
 */
export function equipTravelSpeedFactor(equipment: Equipment): number {
  let bonus = 0;
  for (const slot of ALL_EQUIP_SLOTS) {
    const inst = equipment[slot];
    if (inst) bonus += scaledMod(inst, 'travelSpeedBonus');
  }
  return Math.max(0.55, 1 + bonus);
}

/** Additive encounter risk from camo / noisy boots (already condition-scaled). */
export function equipEncounterChanceMod(equipment: Equipment): number {
  let sum = 0;
  for (const slot of ALL_EQUIP_SLOTS) {
    const inst = equipment[slot];
    if (inst) sum += scaledMod(inst, 'encounterChanceMod');
  }
  return sum;
}

/**
 * Additive search-speed bonus from gloves / lights / similar kit.
 * `0.15` ⇒ 15% faster sequential reveals (see `searchSpeedFactor`).
 */
export function equipSearchSpeedBonus(equipment: Equipment): number {
  let sum = 0;
  for (const slot of ALL_EQUIP_SLOTS) {
    const inst = equipment[slot];
    if (inst) sum += scaledMod(inst, 'searchSpeedBonus');
  }
  return sum;
}

/** Fill missing slot keys on older saves (pre–body-zone equipment). */
export function coerceEquipment(raw: Partial<Equipment> | null | undefined): Equipment {
  const base = emptyEquipment();
  if (!raw) return base;
  for (const slot of ALL_EQUIP_SLOTS) {
    if (slot in raw) base[slot] = raw[slot] ?? null;
  }
  return base;
}

/**
 * Pure: wear an instance down by `amount`, clamped to 0.
 *
 * Wear arrives in fractions — 0.8 for a missed swing, 1.6 per hour of spoilage
 * — and is deliberately *kept* fractional. Rounding here would either lose
 * small increments entirely (a weapon that never breaks) or round each one up
 * to a whole point (food that spoils several times too fast, since the clock
 * advances in fractions of an hour). Round at the display boundary instead:
 * see `conditionPct`.
 */
export function degrade(inst: ItemInstance, amount: number): ItemInstance {
  if (!hasCondition(inst) || amount <= 0) return inst;
  const next = Math.max(0, conditionOf(inst) - amount);
  return next === conditionOf(inst) ? inst : { ...inst, condition: next };
}

// ---------- Cutting cloth ----------
// The bottom of the bleeding economy. A bad loot streak must never leave a
// player with no way at all to stop a bleed, so cloth is always obtainable:
// from a garment you are carrying, and failing that from what you have on.

export const TEAR_HOURS = 0.25;
export const TEAR_CONDITION_COST = 30;
export const TEAR_RAGS_YIELD = 2;

/** How many times the clothes on your back can be cut down over one run. */
export const OWN_CLOTHES_TEARS = 4;

/**
 * Whether a garment yields cloth. Body armour is all fabric or leather; of the
 * headgear only the mask is, because a hard hat cut into strips is just a
 * broken hard hat.
 */
export function canTearForRags(def: ItemDef): boolean {
  return def.slot === 'body' || def.id === 'n95_mask';
}

/** Condition as a whole number, for anything the player reads. */
export function conditionPct(inst: ItemInstance): number {
  return Math.round(conditionOf(inst));
}

/** Pure: restore condition, clamped to the def's maximum. */
export function repair(inst: ItemInstance, amount: number): ItemInstance {
  const max = itemDef(inst.defId).maxCondition;
  if (max === undefined || amount <= 0) return inst;
  return { ...inst, condition: Math.min(max, conditionOf(inst) + amount) };
}

/**
 * Wear every perishable in the list by the hours that just passed. A cooked
 * meal is worthless in about two and a half days; a run lasts twelve. Rate is
 * per-item so a vacuum-packed thing can keep for the whole run.
 */
export const SPOIL_PER_HOUR = 2.4;

export function spoil(items: ItemInstance[], hours: number): ItemInstance[] {
  if (hours <= 0) return items;
  let changed = false;
  const next = items.map((inst) => {
    if (!itemDef(inst.defId).perishable) return inst;
    const worn = degrade(inst, SPOIL_PER_HOUR * hours);
    if (worn !== inst) changed = true;
    return worn;
  });
  return changed ? next : items;
}

/** Broken gear still occupies space and weight — it just doesn't work. */
export function isBroken(inst: ItemInstance): boolean {
  return hasCondition(inst) && conditionOf(inst) <= 0;
}

/** Total score/trade value of a set of item instances, discounted for wear. */
export function totalLootValue(items: ItemInstance[]): number {
  return items.reduce(
    (s, inst) => s + Math.round(itemDef(inst.defId).value * conditionScale(inst)) * inst.stack,
    0,
  );
}

/** Value of a single instance after wear — used for trades and the detail pane. */
export function instanceValue(inst: ItemInstance): number {
  return Math.round(itemDef(inst.defId).value * conditionScale(inst));
}

// ---------- Weight & encumbrance ----------

export function itemWeight(inst: ItemInstance): number {
  return itemDef(inst.defId).weight * inst.stack;
}

/** Total weight carried in a container (default: the backpack). */
export function containerWeight(items: ItemInstance[], container: Container = BACKPACK): number {
  return items
    .filter((i) => i.container === container)
    .reduce((s, i) => s + itemWeight(i), 0);
}

/** Max carrying capacity from build + any equipped weightCapacityBonus. */
export function maxCarry(attrs: Attributes, equipment: Equipment, carryCapacityMod = 0): number {
  let base = attrs.strength * 3 + attrs.endurance * 2 + carryCapacityMod;
  for (const slot of Object.keys(equipment) as EquipSlot[]) {
    const inst = equipment[slot];
    if (!inst) continue;
    const bonus = itemDef(inst.defId).modifiers?.weightCapacityBonus ?? 0;
    if (bonus) base += Math.round(bonus * conditionScale(inst));
  }
  return base;
}

/** Pack ratio at and below which load does nothing. ~14 kg on a 25 kg character. */
export const LOAD_COMFORT = 0.55;

/**
 * Weight on the survivor: backpack contents plus worn gear (bag empty-weight,
 * armour, weapons). Equipped items leave the grid, so they would otherwise be free.
 */
export function carriedWeight(items: ItemInstance[], equipment: Equipment): number {
  let kg = containerWeight(items, BACKPACK);
  for (const slot of ALL_EQUIP_SLOTS) {
    const inst = equipment[slot];
    if (inst) kg += itemWeight(inst);
  }
  return kg;
}

export function loadRatio(
  items: ItemInstance[],
  attrs: Attributes,
  equipment: Equipment,
  carryCapacityMod = 0,
): number {
  const cap = maxCarry(attrs, equipment, carryCapacityMod);
  if (cap <= 0) return carriedWeight(items, equipment) > 0 ? 99 : 0;
  return carriedWeight(items, equipment) / cap;
}

/**
 * 0 below comfort, linear up to capacity (quiet), then quadratic.
 * At 80% travel is ~×1.24; at 150% ~×2 / energy ~×2.2 / combat speed ~half.
 */
export function loadStrain(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= LOAD_COMFORT) return 0;
  if (ratio <= 1) return (0.35 * (ratio - LOAD_COMFORT)) / (1 - LOAD_COMFORT);
  return 0.35 + (ratio - 1) ** 2 * 1.8;
}

export interface LoadEffects {
  ratio: number;
  strain: number;
  /** Walk time and inverse of travelable range. */
  travelMult: number;
  /** Extra meter drain while moving. The silent killer. */
  energyMult: number;
  /** Initiative gauge fill rate. */
  combatSpeedMult: number;
  attackMod: number;
  dodgeMod: number;
  fleeDcMod: number;
  /** Additive encounter chance. */
  encounterMod: number;
  /** Search duration multiplier (higher = slower rummage). */
  searchMult: number;
  /** HDB stair-step time. */
  stairMult: number;
  /** Tunnel walk time — 40% of overland extra so the MRT is not a dump exploit. */
  tunnelTravelMult: number;
}

export function loadEffects(ratio: number): LoadEffects {
  const strain = loadStrain(ratio);
  const travelMult = 1 + 1.25 * strain;
  return {
    ratio,
    strain,
    travelMult,
    energyMult: 1 + 1.5 * strain,
    combatSpeedMult: 1 / (1 + 1.25 * strain),
    attackMod: -Math.round(2 * strain),
    dodgeMod: Math.max(-0.4, -0.2 * strain),
    fleeDcMod: Math.round(5 * strain),
    encounterMod: 0.15 * strain,
    searchMult: 1 + 0.5 * strain,
    stairMult: 1 + strain,
    tunnelTravelMult: 1 + 0.4 * (travelMult - 1),
  };
}

export function loadEffectsFor(
  items: ItemInstance[],
  attrs: Attributes,
  equipment: Equipment,
  carryCapacityMod = 0,
): LoadEffects {
  return loadEffects(loadRatio(items, attrs, equipment, carryCapacityMod));
}

// ---------- Equipment ----------

export function canEquip(def: ItemDef, slot: EquipSlot): boolean {
  if (def.slot === slot) return true;
  // One-handed main-hand weapons can dual-wield in the off hand.
  return slot === 'offHand' && def.slot === 'mainHand' && !def.twoHanded;
}

/** True when a two-handed weapon is occupying the main hand. */
export function isTwoHandedEquipped(equipment: Equipment): boolean {
  const main = equipment.mainHand;
  if (!main) return false;
  return !!itemDef(main.defId).twoHanded;
}

export function emptyEquipment(): Equipment {
  return {
    head: null,
    body: null,
    hands: null,
    legs: null,
    feet: null,
    bag: null,
    mainHand: null,
    offHand: null,
  };
}

/**
 * Pick the best melee/ranged weapon in a set, for auto-equip fallbacks. Ranked
 * by what the weapon actually hits for now, not what it hit for new — a pristine
 * hammer beats a broken shotgun.
 */
export function bestWeapon(items: ItemInstance[]): ItemDef | null {
  let best: ItemDef | null = null;
  let bestDmg = -1;
  for (const inst of items) {
    const def = itemDef(inst.defId);
    if (def.effect.kind !== 'weapon' || isBroken(inst)) continue;
    const dmg = effectiveDamage(inst);
    if (dmg > bestDmg) {
      best = def;
      bestDmg = dmg;
    }
  }
  return best;
}
