/** Pack silhouette — kept local so this module has no game imports (nodenext / loot API). */
export type PackGrid = {
  w: number;
  h: number;
  blocked?: [number, number][];
};

/** Base pack with no bag equipped. Keep in sync with `BACKPACK_DIMS`. */
export const DEFAULT_PACK_GRID: PackGrid = { w: 5, h: 4 };

/** Starting silhouette when the loot editor sets slot to bag. */
export const DEFAULT_BAG_PACK_GRID: PackGrid = { w: 6, h: 4 };

export function packCellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function blockedSet(grid: PackGrid): Set<string> {
  const set = new Set<string>();
  for (const cell of grid.blocked ?? []) {
    const x = cell[0];
    const y = cell[1];
    if (x >= 0 && y >= 0 && x < grid.w && y < grid.h) set.add(packCellKey(x, y));
  }
  return set;
}

export function packGridUsableCount(grid: PackGrid): number {
  return grid.w * grid.h - blockedSet(grid).size;
}

/** Extra columns append on the right as usable cells; negative drops the rightmost column. */
export function applyTraitColumns(grid: PackGrid, traitWidthBonus: number): PackGrid {
  const extra = Math.round(traitWidthBonus);
  const w = Math.max(3, grid.w + extra);
  const h = Math.max(3, grid.h);
  const blocked = (grid.blocked ?? []).filter(
    (cell): cell is [number, number] => cell[0] < w && cell[1] < h,
  );
  return blocked.length ? { w, h, blocked } : { w, h };
}

export function packGridFromBonuses(widthBonus: number, heightBonus: number): PackGrid {
  return {
    w: DEFAULT_PACK_GRID.w + widthBonus,
    h: DEFAULT_PACK_GRID.h + heightBonus,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}

/**
 * Bag silhouette from a def. Prefers `packGrid`; otherwise synthesizes a solid
 * rectangle from leftover `bagWidthBonus` / `bagHeightBonus`.
 */
export function resolveItemPackGrid(def: {
  slot?: string;
  packGrid?: PackGrid;
  modifiers?: { bagWidthBonus?: number; bagHeightBonus?: number };
}): PackGrid | undefined {
  if (def.packGrid) return def.packGrid;
  if (def.slot !== 'bag') return undefined;
  const bw = def.modifiers?.bagWidthBonus ?? 0;
  const bh = def.modifiers?.bagHeightBonus ?? 0;
  if (bw || bh) return packGridFromBonuses(bw, bh);
  return { ...DEFAULT_PACK_GRID };
}

/** Catalog errors for `packGrid`; empty means valid. */
export function collectPackGridErrors(
  id: string,
  def: { slot?: unknown; packGrid?: unknown },
): string[] {
  const errors: string[] = [];
  const grid = def.packGrid;
  if (def.slot === 'bag') {
    if (grid === undefined) {
      errors.push(`${id}: bag slot requires packGrid`);
      return errors;
    }
  } else if (grid !== undefined) {
    errors.push(`${id}: packGrid is only valid on slot "bag"`);
    return errors;
  } else {
    return errors;
  }

  if (!isRecord(grid)) {
    errors.push(`${id}: packGrid must be an object`);
    return errors;
  }
  if (!isInt(grid.w) || grid.w < 1) {
    errors.push(`${id}: packGrid.w must be an integer >= 1`);
  }
  if (!isInt(grid.h) || grid.h < 1) {
    errors.push(`${id}: packGrid.h must be an integer >= 1`);
  }

  if (grid.blocked === undefined) {
    return errors;
  }
  if (!Array.isArray(grid.blocked)) {
    errors.push(`${id}: packGrid.blocked must be an array of [x, y]`);
    return errors;
  }

  const seen = new Set<string>();
  for (const cell of grid.blocked) {
    if (!Array.isArray(cell) || cell.length !== 2 || !isInt(cell[0]) || !isInt(cell[1])) {
      errors.push(`${id}: packGrid.blocked entries must be [x, y] integers`);
      continue;
    }
    const x = cell[0];
    const y = cell[1];
    if (
      x < 0 ||
      y < 0 ||
      (isInt(grid.w) && x >= grid.w) ||
      (isInt(grid.h) && y >= grid.h)
    ) {
      errors.push(`${id}: packGrid.blocked cell [${x}, ${y}] is out of bounds`);
    }
    const key = packCellKey(x, y);
    if (seen.has(key)) errors.push(`${id}: packGrid.blocked has duplicate [${x}, ${y}]`);
    seen.add(key);
  }

  if (isInt(grid.w) && isInt(grid.h) && grid.w > 0 && grid.h > 0 && seen.size >= grid.w * grid.h) {
    errors.push(`${id}: packGrid must have at least one usable cell`);
  }
  return errors;
}

/** Minimal def fields needed to simulate starting-kit pack placement. */
export type StartingKitItemDef = {
  id: string;
  w: number;
  h: number;
  stackable: boolean;
  maxStack: number;
  startingItem?: boolean;
  startingCount?: number;
  slot?: string;
  packGrid?: PackGrid;
  modifiers?: { bagWidthBonus?: number; bagHeightBonus?: number };
};

type FootprintRect = { x: number; y: number; w: number; h: number };

function footprintDims(w: number, h: number, rotated: boolean): { w: number; h: number } {
  return rotated ? { w: h, h: w } : { w, h };
}

function canPlaceOnMask(
  grid: PackGrid,
  placed: FootprintRect[],
  candidate: FootprintRect,
): boolean {
  if (candidate.x < 0 || candidate.y < 0) return false;
  if (candidate.x + candidate.w > grid.w) return false;
  if (candidate.y + candidate.h > grid.h) return false;

  const blocked = blockedSet(grid);
  const occupied = new Set<string>();
  for (const p of placed) {
    for (let dy = 0; dy < p.h; dy++) {
      for (let dx = 0; dx < p.w; dx++) {
        occupied.add(packCellKey(p.x + dx, p.y + dy));
      }
    }
  }
  for (let dy = 0; dy < candidate.h; dy++) {
    for (let dx = 0; dx < candidate.w; dx++) {
      const key = packCellKey(candidate.x + dx, candidate.y + dy);
      if (blocked.has(key) || occupied.has(key)) return false;
    }
  }
  return true;
}

function findSlotOnMask(
  grid: PackGrid,
  placed: FootprintRect[],
  def: { w: number; h: number },
): FootprintRect | null {
  for (const rotated of def.w === def.h ? [false] : [false, true]) {
    const { w, h } = footprintDims(def.w, def.h, rotated);
    for (let y = 0; y <= grid.h - h; y++) {
      for (let x = 0; x <= grid.w - w; x++) {
        const candidate = { x, y, w, h };
        if (canPlaceOnMask(grid, placed, candidate)) return candidate;
      }
    }
  }
  return null;
}

/**
 * Whether non-equip starting items fit the starting bag's packGrid (trait
 * columns = 0). Empty means the kit packs cleanly.
 */
export function collectStartingKitFitErrors(
  catalog: Record<string, StartingKitItemDef>,
): string[] {
  const starters = Object.values(catalog).filter((d) => d.startingItem);
  if (starters.length === 0) return [];

  const equippedSlots = new Set<string>();
  let startingBag: StartingKitItemDef | undefined;
  const packStarters: StartingKitItemDef[] = [];

  for (const def of starters) {
    if (def.slot && !equippedSlots.has(def.slot)) {
      equippedSlots.add(def.slot);
      if (def.slot === 'bag' && !startingBag) startingBag = def;
    } else {
      packStarters.push(def);
    }
  }

  if (packStarters.length === 0) return [];

  const base = startingBag
    ? (resolveItemPackGrid(startingBag) ?? { ...DEFAULT_PACK_GRID })
    : { ...DEFAULT_PACK_GRID };
  const grid = applyTraitColumns(base, 0);

  const placed: FootprintRect[] = [];
  // Stack state for merge-into-existing behaviour (mirrors addToGrid).
  const stacks = new Map<string, { remaining: number; maxStack: number }[]>();

  for (const def of packStarters) {
    let remaining = Math.max(1, def.startingCount ?? 1);
    if (def.stackable) {
      const list = stacks.get(def.id) ?? [];
      for (const s of list) {
        if (remaining <= 0) break;
        const room = s.maxStack - s.remaining;
        if (room <= 0) continue;
        const add = Math.min(room, remaining);
        s.remaining += add;
        remaining -= add;
      }
      stacks.set(def.id, list);
    }

    while (remaining > 0) {
      const slot = findSlotOnMask(grid, placed, def);
      if (!slot) {
        const bagId = startingBag?.id ?? 'backpack';
        return [
          `${bagId}: starting packGrid cannot fit starting kit (${def.id} ×${remaining})`,
        ];
      }
      const put = def.stackable ? Math.min(def.maxStack, remaining) : 1;
      placed.push(slot);
      if (def.stackable) {
        const list = stacks.get(def.id) ?? [];
        list.push({ remaining: put, maxStack: def.maxStack });
        stacks.set(def.id, list);
      }
      remaining -= put;
    }
  }

  return [];
}
