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
  DEFAULT_PACK_GRID,
  packCellKey,
  resolveItemPackGrid,
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
export const STASH_DIMS = { w: 4, h: 4 };
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

/** Recompute pack silhouette from the equipped bag + trait column bonus. */
export function syncBackpackBonuses(
  traitWidthBonus: number,
  equipment: Equipment,
): void {
  const bag = equipment.bag;
  const base = bag
    ? (resolveItemPackGrid(itemDef(bag.defId)) ?? { ...DEFAULT_PACK_GRID })
    : { ...DEFAULT_PACK_GRID };
  backpackMask = applyTraitColumns(base, traitWidthBonus);
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

const TIER_LABELS: Record<ConditionTier, string> = {
  torn: 'Old & Torn',
  used: 'Heavily Used',
  worn: 'Slightly Used',
  pristine: 'Brand New',
};

/** The wear band an instance falls in — what the player actually sees. */
export function tierOf(inst: ItemInstance): ConditionTier {
  const c = conditionOf(inst);
  if (c < 25) return 'torn';
  if (c < 50) return 'used';
  if (c < 75) return 'worn';
  return 'pristine';
}

export function tierLabel(tier: ConditionTier): string {
  return TIER_LABELS[tier];
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

function scaledMod(
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
    | 'searchSpeedBonus',
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

export const ENCUMBER_FRACTION = 0.8;

/** Encumbered once the backpack exceeds 80% of max carrying capacity. */
export function isEncumbered(
  items: ItemInstance[],
  attrs: Attributes,
  equipment: Equipment,
  carryCapacityMod = 0,
): boolean {
  return containerWeight(items, BACKPACK) > maxCarry(attrs, equipment, carryCapacityMod) * ENCUMBER_FRACTION;
}

// ---------- Equipment ----------

export function canEquip(def: ItemDef, slot: EquipSlot): boolean {
  return def.slot === slot;
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
