import type { ItemDef, ItemInstance } from '../../game/types';
import { itemDef } from '../../game/loot';
import { BACKPACK, LOOSE, LOOSE_WEIGHT_MULT } from '../../game/inventory';
import { tileColorCategory } from '../../game/itemTileColor';

/**
 * Filter families for the carried list. Coarser than the tile-tint categories
 * (heal + cure read as one "medical" family to a player), and named after the
 * existing `ui.itemKind.*` labels so no new copy is needed for them.
 */
export const CARRIED_KINDS = [
  'weapon',
  'gear',
  'food',
  'drink',
  'medical',
  'stimulant',
  'ammo',
  'fuel',
  'misc',
] as const;
export type CarriedKind = (typeof CARRIED_KINDS)[number];

export function carriedKind(def: Pick<ItemDef, 'effect' | 'slot'>): CarriedKind {
  if (def.effect.kind === 'magazine') return 'ammo';
  switch (tileColorCategory(def)) {
    case 'weapon':
      return 'weapon';
    case 'gear':
      return 'gear';
    case 'food':
      return 'food';
    case 'water':
      return 'drink';
    case 'heal':
    case 'cure':
      return 'medical';
    case 'energy':
      return 'stimulant';
    case 'ammo':
      return 'ammo';
    case 'fuel':
      return 'fuel';
    default:
      return 'misc';
  }
}

export type CarriedSort = 'weight' | 'perUnit' | 'name' | 'kind';
export const CARRIED_SORTS: readonly CarriedSort[] = ['weight', 'perUnit', 'name', 'kind'];

/** Direction a sort starts in: heavy first for weights, A→Z for names. */
export function defaultDesc(sort: CarriedSort): boolean {
  return sort === 'weight' || sort === 'perUnit';
}

export type CarriedPlace = 'all' | 'packed' | 'loose';

export interface CarriedRow {
  inst: ItemInstance;
  def: ItemDef;
  name: string;
  kind: CarriedKind;
  packed: boolean;
  /** Raw kg for the whole stack. */
  rawKg: number;
  /** What the stack actually costs you right now: bag cut or loose penalty applied. */
  kg: number;
  /** Felt kg per single unit. */
  perUnitKg: number;
}

/** Everything on the survivor that isn't worn, with its felt weight. */
export function carriedRows(
  items: ItemInstance[],
  bagCut: number,
  nameOf: (defId: string, inst: ItemInstance) => string,
): CarriedRow[] {
  const out: CarriedRow[] = [];
  for (const inst of items) {
    if (inst.container !== BACKPACK && inst.container !== LOOSE) continue;
    const def = itemDef(inst.defId);
    const packed = inst.container === BACKPACK;
    const factor = packed ? 1 - bagCut : LOOSE_WEIGHT_MULT;
    const rawKg = def.weight * inst.stack;
    out.push({
      inst,
      def,
      name: nameOf(inst.defId, inst),
      kind: carriedKind(def),
      packed,
      rawKg,
      kg: rawKg * factor,
      perUnitKg: def.weight * factor,
    });
  }
  return out;
}

export interface CarriedQuery {
  sort: CarriedSort;
  desc: boolean;
  /** Empty set = every kind. */
  kinds: ReadonlySet<CarriedKind>;
  place: CarriedPlace;
}

const kindRank = (k: CarriedKind) => CARRIED_KINDS.indexOf(k);

function compare(a: CarriedRow, b: CarriedRow, sort: CarriedSort, locale?: string): number {
  switch (sort) {
    case 'weight':
      return a.kg - b.kg;
    case 'perUnit':
      return a.perUnitKg - b.perUnitKg;
    case 'name':
      return a.name.localeCompare(b.name, locale);
    case 'kind':
      return kindRank(a.kind) - kindRank(b.kind);
  }
}

/**
 * Filter then sort. Ties fall back to heaviest first, then name, then uid,
 * so the order never shuffles between renders.
 */
export function queryCarried(
  rows: CarriedRow[],
  q: CarriedQuery,
  locale?: string,
): CarriedRow[] {
  const dir = q.desc ? -1 : 1;
  return rows
    .filter(
      (r) =>
        (q.kinds.size === 0 || q.kinds.has(r.kind)) &&
        (q.place === 'all' || (q.place === 'packed') === r.packed),
    )
    .sort(
      (a, b) =>
        dir * compare(a, b, q.sort, locale) ||
        b.kg - a.kg ||
        a.name.localeCompare(b.name, locale) ||
        (a.inst.uid < b.inst.uid ? -1 : a.inst.uid > b.inst.uid ? 1 : 0),
    );
}

/** Kinds present in the rows, in canonical order, with counts — the filter chips. */
export function kindCounts(rows: CarriedRow[]): { kind: CarriedKind; count: number; kg: number }[] {
  const m = new Map<CarriedKind, { count: number; kg: number }>();
  for (const r of rows) {
    const cur = m.get(r.kind) ?? { count: 0, kg: 0 };
    cur.count += 1;
    cur.kg += r.kg;
    m.set(r.kind, cur);
  }
  return CARRIED_KINDS.filter((k) => m.has(k)).map((k) => ({ kind: k, ...m.get(k)! }));
}
