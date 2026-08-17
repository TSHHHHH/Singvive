import { useEffect, useMemo, useRef, useState } from 'react';
import { RECIPES } from '../game/crafting';
import { FACTION_CONFIG } from '../game/factions';
import { ITEMS } from '../game/loot';
import { POI_CATEGORIES, POI_CONFIG } from '../game/poi';
import type { PoiCategory } from '../game/types';
import { itemIcon } from '../components/Inventory/itemIcon';
import { Icon } from '../icons/Icon';
import {
  downloadLootTables,
  fetchLootTablesCatalog,
  parseImportedLootTables,
  saveLootTablesCatalog,
} from './lootApi';
import { diffLootTables, lootTableDiffEmpty, type LootTableDiff } from './lootTableDiff';
import { simulateTableRolls } from './lootTableSim';
import {
  lootTablesFingerprint,
  validateLootTablesCatalog,
  type LootTableEntry,
  type LootTablesCatalog,
} from './validateLootTables';
import { ValidationErrorBadge } from './ValidationErrorBadge';

type SortMode = 'order' | 'weight' | 'chance' | 'effective' | 'name';

type Props = {
  onStatus?: (message: string | null, error?: string | null) => void;
  /** Jump to the Items tab focused on this def. */
  onOpenItem?: (itemId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Live recipe draft — craft-only badges follow unsaved recipes. */
  recipesDraft?: readonly { outputDefId: string }[] | null;
  /** When false, skip status chatter (tab is mounted hidden). */
  active?: boolean;
};

function scarcityOf(id: string): number {
  return ITEMS[id]?.scarcity ?? 1;
}

function buildCraftOutputSet(recipes: readonly { outputDefId: string }[]): Set<string> {
  return new Set(recipes.map((r) => r.outputDefId));
}

function buildFactionItemSet(): Set<string> {
  const ids = new Set<string>();
  for (const cfg of Object.values(FACTION_CONFIG)) {
    for (const id of cfg.stock) ids.add(id);
    for (const id of cfg.exclusiveStock) ids.add(id);
    for (const id of cfg.wants) ids.add(id);
    for (const id of cfg.tribute) ids.add(id);
  }
  return ids;
}

/**
 * DEV editor for per-POI weighted loot tables (`src/game/data/lootTables.json`).
 */
export function LootTablesEditor({
  onStatus,
  onOpenItem,
  onDirtyChange,
  recipesDraft,
  active = true,
}: Props) {
  const [tables, setTables] = useState<LootTablesCatalog | null>(null);
  const [baselineTables, setBaselineTables] = useState<LootTablesCatalog | null>(null);
  const [baseline, setBaseline] = useState('');
  const [category, setCategory] = useState<PoiCategory>('supermarket');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [addId, setAddId] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('order');
  const [dupFrom, setDupFrom] = useState<PoiCategory>('pharmacy');
  const [diffOpen, setDiffOpen] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<LootTableDiff | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [simSeed, setSimSeed] = useState('dev-loot');
  const [simSearches, setSimSearches] = useState(200);
  const [simRichness, setSimRichness] = useState(POI_CONFIG.supermarket.richness);
  const [simResult, setSimResult] = useState<ReturnType<typeof simulateTableRolls> | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const knownIds = useMemo(() => new Set(Object.keys(ITEMS)), []);
  const craftOutputs = useMemo(
    () => buildCraftOutputSet(recipesDraft ?? RECIPES),
    [recipesDraft],
  );
  const factionItems = useMemo(() => buildFactionItemSet(), []);

  const load = async () => {
    setBusy(true);
    try {
      const data = await fetchLootTablesCatalog();
      setTables(data);
      setBaselineTables(structuredClone(data));
      setBaseline(lootTablesFingerprint(data));
      setSimResult(null);
      if (active) onStatus?.(`Loaded loot tables (${POI_CATEGORIES.length} categories)`);
    } catch (err) {
      onStatus?.(null, String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSimRichness(POI_CONFIG[category].richness);
    setSimResult(null);
  }, [category]);

  const dirty = tables ? lootTablesFingerprint(tables) !== baseline : false;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const errors = useMemo(
    () => (tables ? validateLootTablesCatalog(tables, knownIds) : []),
    [tables, knownIds],
  );
  const valid = errors.length === 0;

  const rows = tables?.[category] ?? [];
  const totalWeight = rows.reduce((sum, [, w]) => sum + w, 0);

  const maxCategoryWeight = useMemo(() => {
    if (!tables) return 1;
    return Math.max(
      1,
      ...POI_CATEGORIES.map((c) => (tables[c] ?? []).reduce((s, [, w]) => s + w, 0)),
    );
  }, [tables]);

  const hasCommonFallback = rows.some(([id]) => scarcityOf(id) >= 1);

  const onlyInThisTable = useMemo(() => {
    if (!tables) return new Set<string>();
    const counts = new Map<string, number>();
    for (const cat of POI_CATEGORIES) {
      for (const [id] of tables[cat] ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const exclusive = new Set<string>();
    for (const [id] of rows) {
      if ((counts.get(id) ?? 0) === 1) exclusive.add(id);
    }
    return exclusive;
  }, [tables, rows]);

  const displayRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.map((row, index) => ({ row, index }));
    if (q) {
      list = list.filter(({ row: [id] }) => {
        const def = ITEMS[id];
        return id.includes(q) || (def?.name.toLowerCase().includes(q) ?? false);
      });
    }
    if (sortMode === 'order') return list;
    const scored = list.map((entry) => {
      const [id, weight] = entry.row;
      const chance = totalWeight > 0 ? weight / totalWeight : 0;
      const effective = chance * scarcityOf(id);
      return { ...entry, chance, effective, name: ITEMS[id]?.name ?? id };
    });
    scored.sort((a, b) => {
      if (sortMode === 'weight') return b.row[1] - a.row[1] || a.row[0].localeCompare(b.row[0]);
      if (sortMode === 'chance') return b.chance - a.chance || a.row[0].localeCompare(b.row[0]);
      if (sortMode === 'effective') {
        return b.effective - a.effective || a.row[0].localeCompare(b.row[0]);
      }
      return a.name.localeCompare(b.name) || a.row[0].localeCompare(b.row[0]);
    });
    return scored;
  }, [rows, query, sortMode, totalWeight]);

  const setCategoryRows = (nextRows: LootTableEntry[]) => {
    if (!tables) return;
    const copy = structuredClone(tables);
    copy[category] = nextRows;
    setTables(copy);
  };

  const setRow = (index: number, next: LootTableEntry) => {
    const copy = [...rows];
    copy[index] = next;
    setCategoryRows(copy);
  };

  const bumpWeight = (index: number, delta: number) => {
    const [id, w] = rows[index]!;
    setRow(index, [id, Math.max(0.01, Math.round((w + delta) * 100) / 100)]);
  };

  const removeRow = (index: number) => {
    setCategoryRows(rows.filter((_, i) => i !== index));
  };

  const addRow = () => {
    if (!tables) return;
    const id = addId.trim();
    if (!id) return;
    if (!knownIds.has(id)) {
      onStatus?.(null, `Unknown item id "${id}"`);
      return;
    }
    if (rows.some(([existing]) => existing === id)) {
      onStatus?.(null, `"${id}" is already in ${category}`);
      return;
    }
    setCategoryRows([...rows, [id, 1]]);
    setAddId('');
    setSortMode('order');
    onStatus?.(null, null);
  };

  const normalizeWeights = () => {
    if (!rows.length) return;
    const sum = rows.reduce((s, [, w]) => s + w, 0);
    if (sum <= 0) return;
    const scaled = rows.map(([id, w]) => [id, Math.max(0.01, Math.round((w / sum) * 1000) / 10)] as LootTableEntry);
    // Fix rounding drift so Σ ≈ 100
    const scaledSum = scaled.reduce((s, [, w]) => s + w, 0);
    const drift = Math.round((100 - scaledSum) * 10) / 10;
    if (scaled.length && drift !== 0) {
      const last = scaled[scaled.length - 1]!;
      scaled[scaled.length - 1] = [last[0], Math.max(0.01, Math.round((last[1] + drift) * 10) / 10)];
    }
    setCategoryRows(scaled);
    onStatus?.('Normalized weights to sum ≈ 100');
  };

  const duplicateCategory = () => {
    if (!tables || dupFrom === category) return;
    if (
      !confirm(
        `Replace ${POI_CONFIG[category].label} table with a copy of ${POI_CONFIG[dupFrom].label}?`,
      )
    ) {
      return;
    }
    const copy = structuredClone(tables);
    copy[category] = structuredClone(tables[dupFrom] ?? []);
    setTables(copy);
    setSortMode('order');
    onStatus?.(`Copied ${dupFrom} → ${category}`);
  };

  const moveRow = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
    const next = [...rows];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setCategoryRows(next);
    setSortMode('order');
  };

  const requestSave = () => {
    if (!tables || !valid || !baselineTables) {
      onStatus?.(null, errors.slice(0, 5).join('\n') || 'Nothing to save');
      return;
    }
    setPendingDiff(diffLootTables(baselineTables, tables));
    setDiffOpen(true);
  };

  const confirmSave = async () => {
    if (!tables || !valid) return;
    setBusy(true);
    try {
      await saveLootTablesCatalog(tables, knownIds);
      setBaselineTables(structuredClone(tables));
      setBaseline(lootTablesFingerprint(tables));
      setDiffOpen(false);
      setPendingDiff(null);
      onStatus?.('Saved to src/game/data/lootTables.json');
      setSaveOk(true);
    } catch (err) {
      onStatus?.(null, String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRevert = () => {
    if (dirty && !confirm('Discard unsaved loot table changes?')) return;
    void load();
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const imported = parseImportedLootTables(text, knownIds);
      if (dirty && !confirm('Replace draft tables with import?')) return;
      setTables(imported);
      onStatus?.('Imported loot tables (not saved yet)');
    } catch (err) {
      onStatus?.(null, String(err));
    }
  };

  const runSim = () => {
    if (!rows.length) return;
    setSimResult(simulateTableRolls(rows, simRichness, simSearches, simSeed));
  };

  const itemOptions = useMemo(
    () => Object.keys(ITEMS).sort((a, b) => a.localeCompare(b)),
    [],
  );

  const simHistogram = useMemo(() => {
    if (!simResult) return [];
    const total = [...simResult.counts.values()].reduce((s, n) => s + n, 0) || 1;
    return [...simResult.counts.entries()]
      .map(([id, count]) => ({
        id,
        count,
        pct: (count / total) * 100,
        name: ITEMS[id]?.name ?? id,
      }))
      .sort((a, b) => b.count - a.count);
  }, [simResult]);

  if (!tables) {
    return <p className="p-6 text-sm text-white/40">{busy ? 'Loading…' : 'No tables loaded.'}</p>;
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-black/20">
        <div className="border-b border-white/10 p-3 text-2xs uppercase tracking-widest text-white/30">
          POI categories
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {POI_CATEGORIES.map((cat) => {
            const active = cat === category;
            const catRows = tables[cat] ?? [];
            const weight = catRows.reduce((s, [, w]) => s + w, 0);
            const bar = (weight / maxCategoryWeight) * 100;
            const commonOk = catRows.some(([id]) => scarcityOf(id) >= 1);
            return (
              <li key={cat}>
                <button
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`flex w-full flex-col items-start gap-1 px-3 py-2 text-left text-sm transition ${
                    active ? 'bg-signal/15 text-signal' : 'text-white/75 hover:bg-white/5'
                  }`}
                >
                  <span className="font-medium">{POI_CONFIG[cat].label}</span>
                  <span className="font-mono text-2xs text-white/35">
                    {cat} · {catRows.length} · Σ{weight}
                    {!commonOk ? ' · no common' : ''}
                  </span>
                  <span className="h-1 w-full overflow-hidden rounded bg-white/10">
                    <span
                      className="block h-full rounded bg-signal/60"
                      style={{ width: `${bar}%` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="mr-auto min-w-0">
            <h4 className="text-base font-bold text-signal">{POI_CONFIG[category].label}</h4>
            <p className="text-xs text-white/40">{POI_CONFIG[category].blurb}</p>
          </div>
          {dirty && (
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-2xs uppercase tracking-wider text-amber-300">
              unsaved
            </span>
          )}
          {!hasCommonFallback && (
            <span className="rounded bg-red-500/20 px-2 py-0.5 text-2xs uppercase tracking-wider text-red-300">
              no common fallback
            </span>
          )}
          {!valid && <ValidationErrorBadge errors={errors} />}
          <button
            type="button"
            disabled={busy || !dirty || !valid}
            onClick={requestSave}
            className="rounded border border-signal/40 px-2.5 py-1 text-xs text-signal disabled:opacity-40"
          >
            Save tables
          </button>
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={handleRevert}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70 disabled:opacity-40"
          >
            Revert
          </button>
          <button
            type="button"
            onClick={normalizeWeights}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70"
          >
            Normalize ≈100
          </button>
          <button
            type="button"
            onClick={() => downloadLootTables(tables)}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70"
          >
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleImport(file);
            }}
          />
        </div>

        <div className="flex flex-wrap items-end gap-2 border-b border-white/10 px-4 py-3">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-0.5 text-xs">
            <span className="uppercase tracking-wider text-white/35">Filter</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="id or name…"
              className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-signal/40"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="uppercase tracking-wider text-white/35">Sort</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white outline-none"
            >
              <option value="order">Table order</option>
              <option value="weight">Weight</option>
              <option value="chance">Table %</option>
              <option value="effective">Effective % (× scarcity)</option>
              <option value="name">Name</option>
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-[2] flex-col gap-0.5 text-xs">
            <span className="uppercase tracking-wider text-white/35">Add item</span>
            <input
              list="loot-table-item-ids"
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
              placeholder="item id…"
              className="rounded border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-sm outline-none focus:border-signal/40"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addRow();
              }}
            />
            <datalist id="loot-table-item-ids">
              {itemOptions.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          </label>
          <button
            type="button"
            onClick={addRow}
            className="rounded border border-signal/40 px-2.5 py-1.5 text-xs text-signal"
          >
            Add row
          </button>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="uppercase tracking-wider text-white/35">Copy from</span>
            <select
              value={dupFrom}
              onChange={(e) => setDupFrom(e.target.value as PoiCategory)}
              className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white outline-none"
            >
              {POI_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {POI_CONFIG[c].label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={duplicateCategory}
            className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-white/70"
          >
            Duplicate → here
          </button>
          <div className="pb-1 text-2xs text-white/35">
            {rows.length} rows · Σ{totalWeight}
            {onlyInThisTable.size > 0 ? ` · ${onlyInThisTable.size} exclusive` : ''}
            {sortMode === 'order' ? ' · drag to reorder' : ''}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-concrete-900 text-2xs uppercase tracking-wider text-white/35">
              <tr>
                <th className="w-8 px-2 py-2 font-normal" />
                <th className="px-2 py-2 font-normal">Item</th>
                <th className="w-36 px-2 py-2 font-normal">Weight</th>
                <th className="w-20 px-2 py-2 font-normal">Table %</th>
                <th className="w-24 px-2 py-2 font-normal">Effective</th>
                <th className="w-28 px-2 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map(({ row: [id, weight], index }) => {
                const def = ITEMS[id];
                const chance = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
                const scarcity = scarcityOf(id);
                const effective = chance * scarcity;
                const likelyCraftOnly = craftOutputs.has(id) && !factionItems.has(id);
                const isCraftOut = craftOutputs.has(id);
                return (
                  <tr
                    key={`${category}-${id}-${index}`}
                    draggable={sortMode === 'order'}
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) moveRow(dragIndex, index);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    className={`border-t border-white/5 ${
                      dragIndex === index ? 'opacity-50' : ''
                    }`}
                    style={{
                      backgroundImage: def
                        ? `linear-gradient(270deg, ${def.color}44 0%, ${def.color}14 40%, transparent 75%)`
                        : undefined,
                    }}
                  >
                    <td className="px-2 py-2 text-center text-white/25">
                      {sortMode === 'order' ? '⋮⋮' : ''}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/10 bg-black/40">
                          {def ? (
                            <Icon name={itemIcon(def)} size={18} />
                          ) : (
                            <span className="h-3 w-3 rounded-sm bg-white/20" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 truncate font-medium text-white/85">
                            <span>{def?.name ?? id}</span>
                            {!def && (
                              <span className="rounded bg-red-500/20 px-1 text-2xs text-red-300">
                                unknown
                              </span>
                            )}
                            {def?.exotic && (
                              <span className="rounded bg-violet-500/20 px-1 text-2xs text-violet-200">
                                exotic
                              </span>
                            )}
                            {def?.startingItem && (
                              <span className="rounded bg-amber-500/20 px-1 text-2xs text-amber-200">
                                starting
                              </span>
                            )}
                            {onlyInThisTable.has(id) && (
                              <span className="rounded bg-sky-500/20 px-1 text-2xs text-sky-200">
                                only here
                              </span>
                            )}
                            {likelyCraftOnly && (
                              <span className="rounded bg-red-500/20 px-1 text-2xs text-red-300">
                                craft-only?
                              </span>
                            )}
                            {isCraftOut && !likelyCraftOnly && (
                              <span className="rounded bg-white/10 px-1 text-2xs text-white/45">
                                craft output
                              </span>
                            )}
                            {scarcity < 1 && (
                              <span className="rounded bg-white/10 px-1 font-mono text-2xs text-white/45">
                                s={scarcity}
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-2xs text-white/35">{id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => bumpWeight(index, -1)}
                          className="rounded border border-white/15 px-1.5 py-0.5 text-xs text-white/60"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0.01}
                          step={1}
                          value={weight}
                          onChange={(e) =>
                            setRow(index, [id, Math.max(0.01, Number(e.target.value) || 1)])
                          }
                          className="w-16 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-sm outline-none focus:border-signal/40"
                        />
                        <button
                          type="button"
                          onClick={() => bumpWeight(index, 1)}
                          className="rounded border border-white/15 px-1.5 py-0.5 text-xs text-white/60"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-white/50">
                      {chance.toFixed(1)}%
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-white/50">
                      {effective.toFixed(1)}%
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        {onOpenItem && (
                          <button
                            type="button"
                            onClick={() => onOpenItem(id)}
                            className="text-xs text-signal/80 hover:text-signal"
                          >
                            Open
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="text-xs text-red-300/80 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {displayRows.length === 0 && (
            <p className="p-4 text-sm text-white/35">No rows match this filter.</p>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <h5 className="mr-auto text-2xs uppercase tracking-widest text-white/30">
              Roll simulator
            </h5>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-white/35">Seed</span>
              <input
                value={simSeed}
                onChange={(e) => setSimSeed(e.target.value)}
                className="w-28 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs outline-none"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-white/35">Searches</span>
              <input
                type="number"
                min={1}
                max={5000}
                value={simSearches}
                onChange={(e) => setSimSearches(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs outline-none"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-white/35">
                Richness ({simRichness}) · default {POI_CONFIG[category].richness}
              </span>
              <input
                type="range"
                min={1}
                max={8}
                value={simRichness}
                onChange={(e) => setSimRichness(Number(e.target.value))}
                className="w-40"
              />
            </label>
            <button
              type="button"
              onClick={runSim}
              className="rounded border border-signal/40 px-2.5 py-1 text-xs text-signal"
            >
              Run
            </button>
          </div>
          {simResult && (
            <div className="text-xs text-white/55">
              <p className="mb-2">
                {simSearches} searches · {simResult.pulls} pulls · {simResult.duds} duds ·{' '}
                {simResult.scarcityFails} scarcity fails
              </p>
              <div className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {simHistogram.slice(0, 24).map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-white/10">
                      <div
                        className="h-full rounded bg-signal/70"
                        style={{ width: `${Math.min(100, row.pct)}%` }}
                      />
                    </div>
                    <span className="w-28 truncate font-mono text-2xs text-white/45">
                      {row.id}
                    </span>
                    <span className="w-14 text-right font-mono text-2xs">
                      {row.count} · {row.pct.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {diffOpen && pendingDiff && (
        <div className="absolute inset-0 z-[2100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-concrete-900 p-5">
            <h4 className="mb-2 text-base font-bold text-signal">Review table changes</h4>
            <div className="mb-4 max-h-72 overflow-y-auto text-xs text-white/65">
              {lootTableDiffEmpty(pendingDiff) ? (
                <p>No changes detected.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {pendingDiff.details.map((d) => (
                    <li key={d.category}>
                      <div className="mb-1 font-semibold text-white/80">{d.category}</div>
                      <ul className="ml-2 flex flex-col gap-0.5 font-mono">
                        {d.added.map((id) => (
                          <li key={`a-${id}`}>
                            <span className="text-signal">+</span> {id}
                          </li>
                        ))}
                        {d.removed.map((id) => (
                          <li key={`r-${id}`}>
                            <span className="text-red-300">−</span> {id}
                          </li>
                        ))}
                        {d.weightChanges.map((c) => (
                          <li key={`w-${c.id}`}>
                            <span className="text-amber-200">~</span> {c.id}: {c.from} → {c.to}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDiffOpen(false);
                  setPendingDiff(null);
                }}
                className="rounded border border-white/15 px-3 py-1.5 text-xs text-white/70"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !valid}
                onClick={() => void confirmSave()}
                className="rounded border border-signal/40 px-3 py-1.5 text-xs text-signal disabled:opacity-40"
              >
                Confirm save
              </button>
            </div>
          </div>
        </div>
      )}

      {saveOk && (
        <div className="absolute inset-0 z-[2100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-concrete-900 p-5">
            <h4 className="mb-2 text-base font-bold text-signal">Saved successfully</h4>
            <p className="mb-4 text-sm text-white/60">
              Wrote <span className="font-mono text-white/80">src/game/data/lootTables.json</span>.
              Refresh the page for changes to take effect in the live game.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSaveOk(false)}
                className="rounded border border-signal/40 px-3 py-1.5 text-xs text-signal"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
