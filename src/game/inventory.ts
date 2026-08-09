import type {
  Attributes,
  Container,
  Equipment,
  EquipSlot,
  ItemDef,
  ItemInstance,
} from './types';
import { itemDef } from './loot';

export const BACKPACK = 'backpack';
export const BACKPACK_DIMS = { w: 8, h: 5 };
export const STASH_DIMS = { w: 10, h: 8 };

/** Grid dimensions for a container: the backpack is 8×5, every stash is 10×8. */
export function dimsFor(container: Container): { w: number; h: number } {
  return container === BACKPACK ? BACKPACK_DIMS : STASH_DIMS;
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
 * Can `candidate` be placed in `container` without going out of bounds or
 * overlapping any item other than `ignoreUid`?
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

  const occupied = new Set<string>();
  for (const inst of items) {
    if (inst.container !== container || inst.uid === ignoreUid) continue;
    for (const c of cellsOf(inst)) occupied.add(`${c.x},${c.y}`);
  }
  for (let dy = 0; dy < candidate.h; dy++) {
    for (let dx = 0; dx < candidate.w; dx++) {
      if (occupied.has(`${candidate.x + dx},${candidate.y + dy}`)) return false;
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
    });
    remaining -= put;
  }

  return { items: next, leftover: remaining };
}

/** Items currently held in a given container. */
export function itemsIn(items: ItemInstance[], container: Container): ItemInstance[] {
  return items.filter((i) => i.container === container);
}

/** Total score/trade value of a set of item instances. */
export function totalLootValue(items: ItemInstance[]): number {
  return items.reduce((s, inst) => s + itemDef(inst.defId).value * inst.stack, 0);
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
export function maxCarry(attrs: Attributes, equipment: Equipment): number {
  let base = attrs.strength * 3 + attrs.endurance * 2;
  for (const slot of Object.keys(equipment) as EquipSlot[]) {
    const inst = equipment[slot];
    if (inst) base += itemDef(inst.defId).modifiers?.weightCapacityBonus ?? 0;
  }
  return base;
}

export const ENCUMBER_FRACTION = 0.8;

/** Encumbered once the backpack exceeds 80% of max carrying capacity. */
export function isEncumbered(
  items: ItemInstance[],
  attrs: Attributes,
  equipment: Equipment,
): boolean {
  return containerWeight(items, BACKPACK) > maxCarry(attrs, equipment) * ENCUMBER_FRACTION;
}

// ---------- Equipment ----------

export function canEquip(def: ItemDef, slot: EquipSlot): boolean {
  return def.slot === slot;
}

export function emptyEquipment(): Equipment {
  return { head: null, body: null, mainHand: null, offHand: null };
}

/** Pick the best melee/ranged weapon in a set, for auto-equip fallbacks. */
export function bestWeapon(items: ItemInstance[]): ItemDef | null {
  let best: ItemDef | null = null;
  for (const inst of items) {
    const def = itemDef(inst.defId);
    if (def.effect.kind !== 'weapon') continue;
    if (!best || def.effect.damage > (best.effect as { damage: number }).damage) {
      best = def;
    }
  }
  return best;
}
