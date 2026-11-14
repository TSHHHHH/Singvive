import { useMemo, useState } from 'react';
import type { ItemInstance } from '../../game/types';
import { LOOSE_WEIGHT_MULT } from '../../game/inventory';
import { conditionBarColor, tileColor, ITEM_TILE_COLORS } from '../../game/itemTileColor';
import { Icon } from '../../icons/Icon';
import { itemName, useLocale, useT } from '../../i18n';
import { itemIcon } from './itemIcon';
import { tip } from '../tips';
import {
  CARRIED_SORTS,
  carriedRows,
  defaultDesc,
  kindCounts,
  queryCarried,
  type CarriedKind,
  type CarriedSort,
} from './carriedListModel';

const ROW_H = 30;
const ICON_BOX = 22;
const MAX_VISIBLE_ROWS = 12;
const PREFS_KEY = 'singvive.carriedList.v1';

/** Swatch per filter family, borrowed from the tile tints so chips match rows. */
const KIND_SWATCH: Record<CarriedKind, string> = {
  weapon: ITEM_TILE_COLORS.weapon,
  gear: ITEM_TILE_COLORS.gear,
  food: ITEM_TILE_COLORS.food,
  drink: ITEM_TILE_COLORS.water,
  medical: ITEM_TILE_COLORS.heal,
  stimulant: ITEM_TILE_COLORS.energy,
  ammo: ITEM_TILE_COLORS.ammo,
  fuel: ITEM_TILE_COLORS.fuel,
  misc: ITEM_TILE_COLORS.misc,
};

interface Prefs {
  sort: CarriedSort;
  desc: boolean;
  kinds: CarriedKind[];
}

const DEFAULT_PREFS: Prefs = { sort: 'weight', desc: true, kinds: [] };

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      sort: CARRIED_SORTS.includes(p.sort as CarriedSort) ? (p.sort as CarriedSort) : 'weight',
      desc: typeof p.desc === 'boolean' ? p.desc : true,
      kinds: Array.isArray(p.kinds) ? p.kinds : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode: sorting just won't stick */
  }
}

function fmtKg(kg: number): string {
  return kg < 10 ? kg.toFixed(kg < 1 ? 2 : 1) : kg.toFixed(0);
}

interface Props {
  items: ItemInstance[];
  selectedUid: string | null;
  draggingUid: string | null;
  multiSelected?: ReadonlySet<string>;
  draggingUids?: readonly string[];
  /** True while something from the grid is being dragged over the list. */
  dropActive: boolean;
  dropValid: boolean;
  listRef: (el: HTMLDivElement | null) => void;
  onItemPointerDown: (e: React.PointerEvent, inst: ItemInstance) => void;
  onItemDoubleClick?: (inst: ItemInstance) => void;
  onItemContextMenu?: (e: React.MouseEvent, inst: ItemInstance) => void;
  onItemPointerEnter?: (e: React.PointerEvent, inst: ItemInstance) => void;
  onItemPointerLeave?: (inst: ItemInstance) => void;
  onItemPointerMove?: (e: React.PointerEvent, inst: ItemInstance) => void;
}

/**
 * What's carried outside the bag grid, as one sortable, filterable list —
 * for deciding what to drop or pack. No slots and no limit, so it's a list,
 * not a grid; the bag grid above stays the packing minigame.
 *
 * The whole list is the "carry loose" drop target: drag a tile here to pull it
 * out of the grid, or drag a loose row into the grid to pack it.
 */
export function CarriedList({
  items,
  selectedUid,
  draggingUid,
  multiSelected,
  draggingUids,
  dropActive,
  dropValid,
  listRef,
  onItemPointerDown,
  onItemDoubleClick,
  onItemContextMenu,
  onItemPointerEnter,
  onItemPointerLeave,
  onItemPointerMove,
}: Props) {
  const { t } = useT();
  const locale = useLocale();
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const setPrefs = (next: Partial<Prefs>) => {
    setPrefsState((cur) => {
      const p = { ...cur, ...next };
      savePrefs(p);
      return p;
    });
  };

  const rows = useMemo(
    () => carriedRows(items, 0, (id) => itemName(id, locale)).filter((r) => !r.packed),
    [items, locale],
  );
  const chips = useMemo(() => kindCounts(rows), [rows]);
  // A filter for a kind you no longer carry would hide everything silently.
  const activeKinds = useMemo(
    () => new Set(prefs.kinds.filter((k) => chips.some((c) => c.kind === k))),
    [prefs.kinds, chips],
  );
  const shown = useMemo(
    () =>
      queryCarried(rows, { sort: prefs.sort, desc: prefs.desc, kinds: activeKinds, place: 'all' }, locale),
    [rows, prefs.sort, prefs.desc, activeKinds, locale],
  );
  const totalKg = rows.reduce((s, r) => s + r.kg, 0);
  const shownKg = shown.reduce((s, r) => s + r.kg, 0);
  const filtered = activeKinds.size > 0;

  const toggleKind = (k: CarriedKind) => {
    const next = new Set(activeKinds);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setPrefs({ kinds: [...next] });
  };

  const pickSort = (s: CarriedSort) => {
    if (s === prefs.sort) setPrefs({ desc: !prefs.desc });
    else setPrefs({ sort: s, desc: defaultDesc(s) });
  };

  return (
    <div
      ref={listRef}
      className={`rounded-lg border p-2 transition-colors ${
        dropActive
          ? dropValid
            ? 'border-signal bg-signal/10'
            : 'border-white/15 bg-black/30'
          : 'border-white/10 bg-black/20'
      }`}
    >
      {/* Header: title + total felt weight */}
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span
          className="text-label uppercase tracking-widest text-white/50"
          {...tip(t('ui.inventory.carriedHint', { mult: LOOSE_WEIGHT_MULT }))}
        >
          {t('ui.inventory.loose')}
          <span className="ml-1.5 tabular-nums text-white/30">{rows.length}</span>
        </span>
        <span className="text-micro tabular-nums text-white/60">
          {filtered && <span className="text-white/35">{fmtKg(shownKg)} / </span>}
          {fmtKg(totalKg)} kg
        </span>
      </div>

      {rows.length > 0 && (
        <>
          {/* Sort */}
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro">
            <div className="flex items-center gap-0.5" role="group" aria-label={t('ui.inventory.sortBy')}>
              <span className="mr-0.5 uppercase tracking-widest text-white/30">{t('ui.inventory.sortBy')}</span>
              {CARRIED_SORTS.map((s) => {
                const on = prefs.sort === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickSort(s)}
                    {...tip(on ? t('ui.inventory.sortFlip') : undefined)}
                    className={`rounded px-1.5 py-0.5 transition-colors ${
                      on ? 'bg-signal/15 text-signal' : 'text-white/50 hover:bg-white/10 hover:text-white/80'
                    }`}
                  >
                    {t(`ui.inventory.sort.${s}`)}
                    {on && <span className="ml-0.5">{prefs.desc ? '↓' : '↑'}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kind filter chips */}
          {chips.length > 1 && (
            <div className="mb-1.5 flex flex-wrap gap-1 text-micro">
              <button
                type="button"
                aria-pressed={activeKinds.size === 0}
                onClick={() => setPrefs({ kinds: [] })}
                className={`rounded-full border px-2 py-0.5 transition-colors ${
                  activeKinds.size === 0
                    ? 'border-white/40 bg-white/10 text-white'
                    : 'border-white/10 text-white/45 hover:border-white/25'
                }`}
              >
                {t('ui.inventory.filterAll')}
              </button>
              {chips.map(({ kind, count, kg }) => {
                const on = activeKinds.has(kind);
                const hex = KIND_SWATCH[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleKind(kind)}
                    {...tip(`${fmtKg(kg)} kg`)}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors ${
                      on ? 'text-white' : 'border-white/10 text-white/55 hover:border-white/25'
                    }`}
                    style={on ? { borderColor: hex, background: `${hex}33` } : undefined}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: hex }} aria-hidden />
                    {t(`ui.itemKind.${kind}`)}
                    <span className="tabular-nums text-white/35">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {rows.length === 0 ? (
        <p className="text-micro text-white/30">{t('ui.inventory.looseEmpty')}</p>
      ) : shown.length === 0 ? (
        <p className="py-2 text-center text-micro text-white/30">
          {t('ui.inventory.carriedNoMatch')}{' '}
          <button
            type="button"
            className="text-signal/80 underline hover:text-signal"
            onClick={() => setPrefs({ kinds: [] })}
          >
            {t('ui.inventory.filterClear')}
          </button>
        </p>
      ) : (
        <ul
          className="flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden pr-0.5"
          style={{ maxHeight: MAX_VISIBLE_ROWS * (ROW_H + 2) }}
        >
          {shown.map((r) => {
            const { inst, def } = r;
            const hex = tileColor(def);
            const selected = inst.uid === selectedUid || !!multiSelected?.has(inst.uid);
            const dragging = inst.uid === draggingUid || !!draggingUids?.includes(inst.uid);
            const cond =
              inst.condition !== undefined && def.maxCondition
                ? Math.max(0, Math.min(100, Math.round(inst.condition)))
                : null;
            return (
              <li key={inst.uid}>
                <div
                  data-uid={inst.uid}
                  onPointerDown={(e) => onItemPointerDown(e, inst)}
                  onDoubleClick={() => onItemDoubleClick?.(inst)}
                  onContextMenu={(e) => onItemContextMenu?.(e, inst)}
                  onPointerEnter={(e) => onItemPointerEnter?.(e, inst)}
                  onPointerLeave={() => onItemPointerLeave?.(inst)}
                  onPointerMove={(e) => onItemPointerMove?.(e, inst)}
                  className={`relative flex cursor-grab touch-none select-none items-center gap-2 overflow-hidden rounded border px-1 ${
                    selected ? 'border-signal' : 'border-white/[0.06] hover:border-white/20'
                  } ${dragging ? 'opacity-40' : ''}`}
                  style={{
                    height: ROW_H,
                    background: selected
                      ? `linear-gradient(90deg, ${hex}55, rgba(143,191,75,0.15))`
                      : `linear-gradient(90deg, ${hex}33, ${hex}0d 60%, transparent)`,
                  }}
                >
                  <span
                    className="flex shrink-0 items-center justify-center rounded"
                    style={{ width: ICON_BOX, height: ICON_BOX, background: `${hex}33` }}
                  >
                    <Icon name={itemIcon(def)} size={ICON_BOX - 6} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body text-concrete-50">{r.name}</span>
                  {inst.stack > 1 && (
                    <span className="shrink-0 tabular-nums text-micro text-white/50">×{inst.stack}</span>
                  )}
                  {prefs.sort === 'perUnit' ? (
                    <span
                      className="w-14 shrink-0 text-right tabular-nums text-micro text-signal/90"
                      {...tip(`${fmtKg(r.kg)} kg`)}
                    >
                      {t('ui.inventory.perUnit', { kg: fmtKg(r.perUnitKg) })}
                    </span>
                  ) : (
                    <span
                      className="w-14 shrink-0 text-right tabular-nums text-micro text-white/70"
                      {...tip(
                        inst.stack > 1 ? t('ui.inventory.perUnit', { kg: fmtKg(r.perUnitKg) }) : undefined,
                      )}
                    >
                      {fmtKg(r.kg)}
                    </span>
                  )}
                  {cond != null && (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-black/50">
                      <span
                        className="block h-full"
                        style={{ width: `${cond}%`, background: conditionBarColor(cond) }}
                      />
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
