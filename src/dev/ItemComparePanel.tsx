import { Fragment, useMemo, useRef, useState } from 'react';
import type { ItemDef } from '../game/types';
import { tileColor, type ItemTileColors } from '../game/itemTileColor';
import { Icon } from '../icons/Icon';
import { itemIcon } from '../components/Inventory/itemIcon';
import { tip } from '../components/tips';
import {
  compareItemsFromCatalog,
  mergeCompareIds,
  type QuickCompareCategory,
} from './itemCompareCategories';
import {
  ITEM_SORT_GROUPS,
  itemCompareNumericRows,
  itemCompareTextRows,
  type ItemCompareNumericRow,
} from './itemSortMetrics';
import type { ItemsCatalog } from './lootApi';

type Props = {
  catalog: ItemsCatalog;
  compareIds: string[];
  baselineId: string | null;
  tileColors: ItemTileColors;
  categories: QuickCompareCategory[];
  selectedId: string | null;
  isItemDirty: (id: string) => boolean;
  onCompareIdsChange: (ids: string[]) => void;
  onBaselineChange: (id: string | null) => void;
  onEdit: (id: string) => void;
};

function barWidth(
  value: number,
  min: number,
  max: number,
  ascending: boolean | undefined,
): number {
  if (ascending) {
    const span = max - min;
    if (span <= 0) return 100;
    return Math.max(0, Math.min(100, ((max - value) / span) * 100));
  }
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function NumericCell({
  row,
  item,
  min,
  max,
  baselineValue,
}: {
  row: ItemCompareNumericRow;
  item: ItemDef;
  min: number;
  max: number;
  baselineValue: number | null;
}) {
  const value = row.value(item);
  if (value === null) {
    return <span className="text-white/25">—</span>;
  }
  const text = row.format ? row.format(value) : String(value);
  const width = barWidth(value, min, max, row.ascending);
  const delta =
    baselineValue !== null && baselineValue !== value
      ? value > baselineValue
        ? 'text-emerald-300/90'
        : value < baselineValue
          ? 'text-amber-300/90'
          : undefined
      : undefined;

  return (
    <div className="flex min-w-[7.5rem] flex-col gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-signal/75 transition-[width]"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`font-mono text-2xs tabular-nums ${delta ?? 'text-white/75'}`}>{text}</span>
    </div>
  );
}

export function ItemComparePanel({
  catalog,
  compareIds,
  baselineId,
  tileColors,
  categories,
  selectedId,
  isItemDirty,
  onCompareIdsChange,
  onBaselineChange,
  onEdit,
}: Props) {
  const [quickOpen, setQuickOpen] = useState(false);
  const quickRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => compareItemsFromCatalog(catalog, compareIds),
    [catalog, compareIds],
  );

  const numericRows = useMemo(() => itemCompareNumericRows(), []);
  const textRows = useMemo(() => itemCompareTextRows(), []);

  const visibleNumericRows = useMemo(() => {
    return numericRows.filter((row) => items.some((item) => row.value(item) !== null));
  }, [numericRows, items]);

  const visibleTextRows = useMemo(() => {
    return textRows.filter((row) => items.some((item) => row.value(item) !== null));
  }, [textRows, items]);

  const rowMax = useMemo(() => {
    const max: Record<string, number> = {};
    const min: Record<string, number> = {};
    for (const row of visibleNumericRows) {
      let hi = 0;
      let lo = Infinity;
      for (const item of items) {
        const v = row.value(item);
        if (v !== null) {
          if (v > hi) hi = v;
          if (v < lo) lo = v;
        }
      }
      max[row.key] = hi;
      min[row.key] = lo === Infinity ? 0 : lo;
    }
    return { max, min };
  }, [visibleNumericRows, items]);

  const baseline = baselineId ? catalog[baselineId] : items[0] ?? null;

  const addCategory = (cat: QuickCompareCategory) => {
    onCompareIdsChange(mergeCompareIds(compareIds, cat.ids));
    setQuickOpen(false);
  };

  const removeId = (id: string) => {
    const next = compareIds.filter((x) => x !== id);
    onCompareIdsChange(next);
    if (baselineId === id) onBaselineChange(next[0] ?? null);
  };

  const addSelected = () => {
    if (!selectedId) return;
    onCompareIdsChange(mergeCompareIds(compareIds, [selectedId]));
  };

  const groupLabels = useMemo(() => {
    const set = new Set<string>();
    for (const row of [...visibleTextRows, ...visibleNumericRows]) set.add(row.group);
    return [...set].sort((a, b) => {
      const ai = ITEM_SORT_GROUPS.indexOf(a as (typeof ITEM_SORT_GROUPS)[number]);
      const bi = ITEM_SORT_GROUPS.indexOf(b as (typeof ITEM_SORT_GROUPS)[number]);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
  }, [visibleTextRows, visibleNumericRows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
        <h4 className="text-sm font-semibold text-signal">Compare</h4>
        <span className="text-2xs text-white/40">{items.length} items</span>
        <div className="relative" ref={quickRef}>
          <button
            type="button"
            onClick={() => setQuickOpen((o) => !o)}
            className="rounded border border-signal/40 px-2.5 py-1 text-xs text-signal"
            {...tip('Add every item in a category')}
          >
            Quick add…
          </button>
          {quickOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-[10] cursor-default"
                onClick={() => setQuickOpen(false)}
              />
              <div className="absolute left-0 top-full z-[11] mt-1 max-h-[min(24rem,50vh)] w-[min(18rem,70vw)] overflow-y-auto rounded-lg border border-white/10 bg-concrete-900 py-1 shadow-xl">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => addCategory(cat)}
                    className="flex w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          disabled={!selectedId || compareIds.includes(selectedId)}
          onClick={addSelected}
          className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70 disabled:opacity-40"
        >
          Add selection
        </button>
        <button
          type="button"
          disabled={compareIds.length === 0}
          onClick={() => {
            onCompareIdsChange([]);
            onBaselineChange(null);
          }}
          className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/50 disabled:opacity-40"
        >
          Clear all
        </button>
        <span className="ml-auto text-2xs text-white/30">★ baseline · bars = row max</span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-sm text-white/40">
          <p>No items in the compare set.</p>
          <p className="text-xs text-white/30">
            Use <span className="text-signal">Quick add…</span> to load a whole category, or add
            the current list selection.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-max min-w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-[2] bg-concrete-900/98 backdrop-blur-sm">
              <tr className="border-b border-white/10">
                <th className="sticky left-0 z-[3] min-w-[8rem] bg-concrete-900/98 px-3 py-2 text-2xs uppercase tracking-wider text-white/35">
                  Stat
                </th>
                {items.map((item) => {
                  const isBaseline = baseline?.id === item.id;
                  const dirty = isItemDirty(item.id);
                  return (
                    <th
                      key={item.id}
                      className="min-w-[8.5rem] max-w-[10rem] border-l border-white/5 px-2 py-2 align-top"
                      style={{
                        backgroundImage: `linear-gradient(180deg, ${tileColor(item, tileColors)}33 0%, transparent 100%)`,
                      }}
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-start gap-1.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/15 bg-black/50">
                            <Icon name={itemIcon(item)} size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-white/90">
                              {item.name}
                              {dirty ? ' •' : ''}
                            </div>
                            <div className="truncate font-mono text-2xs text-white/40">{item.id}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => onEdit(item.id)}
                            className="rounded border border-signal/40 px-1.5 py-0.5 text-2xs text-signal"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onBaselineChange(isBaseline ? null : item.id)
                            }
                            className={`rounded border px-1.5 py-0.5 text-2xs ${
                              isBaseline
                                ? 'border-amber-400/50 text-amber-200'
                                : 'border-white/15 text-white/50'
                            }`}
                            title="Baseline for delta highlighting"
                          >
                            ★
                          </button>
                          <button
                            type="button"
                            onClick={() => removeId(item.id)}
                            className="rounded border border-white/10 px-1.5 py-0.5 text-2xs text-white/40"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groupLabels.map((group) => {
                const textInGroup = visibleTextRows.filter((r) => r.group === group);
                const numInGroup = visibleNumericRows.filter((r) => r.group === group);
                if (textInGroup.length === 0 && numInGroup.length === 0) return null;
                return (
                  <Fragment key={`g-${group}`}>
                    <tr className="bg-white/[0.03]">
                      <td
                        colSpan={items.length + 1}
                        className="sticky left-0 px-3 py-1.5 text-2xs uppercase tracking-widest text-white/30"
                      >
                        {group}
                      </td>
                    </tr>
                    {textInGroup.map((row) => (
                      <tr key={row.key} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="sticky left-0 z-[1] bg-concrete-900/95 px-3 py-2 text-white/45">
                          {row.label}
                        </td>
                        {items.map((item) => (
                          <td key={item.id} className="border-l border-white/5 px-2 py-2 font-mono text-2xs">
                            {row.value(item) ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {numInGroup.map((row) => {
                      const baseVal = baseline ? row.value(baseline) : null;
                      return (
                        <tr key={row.key} className="border-b border-white/5 hover:bg-white/[0.02]">
                          <td className="sticky left-0 z-[1] bg-concrete-900/95 px-3 py-2 text-white/45">
                            {row.label}
                          </td>
                          {items.map((item) => (
                            <td key={item.id} className="border-l border-white/5 px-2 py-2">
                              <NumericCell
                                row={row}
                                item={item}
                                min={rowMax.min[row.key] ?? 0}
                                max={rowMax.max[row.key] ?? 0}
                                baselineValue={baseVal}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
