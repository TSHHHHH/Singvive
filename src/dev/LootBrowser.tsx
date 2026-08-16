import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ItemDef } from '../game/types';
import { Icon } from '../icons/Icon';
import { ICON_ASSETS } from '../icons/registry';
import { itemIcon } from '../components/Inventory/itemIcon';
import { LootItemForm } from './LootItemForm';
import { LootTablesEditor } from './LootTablesEditor';
import { diffCatalogs, diffIsEmpty, itemFingerprint, type CatalogDiff } from './catalogDiff';
import {
  blankItem,
  catalogFingerprint,
  downloadCatalog,
  fetchItemIcons,
  fetchItemsCatalog,
  parseImportedCatalog,
  saveItemsCatalog,
  type ItemsCatalog,
} from './lootApi';
import { EFFECT_KINDS, validateItemsCatalog } from './validateItems';
import {
  CLOSE_DEV_TOOLS_EVENT,
  OPEN_LOOT_EVENT,
  reportDevToolState,
  type CloseDevToolsDetail,
  type OpenLootDetail,
} from './devBridge';
import { ValidationErrorBadge } from './ValidationErrorBadge';

type KindFilter = 'all' | ItemDef['effect']['kind'];
type SlotFilter = 'all' | 'equipped' | 'none' | NonNullable<ItemDef['slot']>;
type SortMode = 'id' | 'name' | 'kind' | 'slot';
type LootTab = 'items' | 'tables';

type PendingNav =
  | { kind: 'select'; id: string }
  | { kind: 'new' }
  | { kind: 'close' }
  | { kind: 'duplicate' };

function DialogShell({
  title,
  children,
  onBackdrop,
}: {
  title: string;
  children: ReactNode;
  onBackdrop?: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-[2100] flex items-center justify-center bg-black/70 p-4"
      onClick={onBackdrop}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-concrete-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="mb-2 text-base font-bold text-signal">{title}</h4>
        {children}
      </div>
    </div>
  );
}

function CompareCard({ def }: { def: ItemDef }) {
  return (
    <div className="rounded border border-white/10 bg-black/25 p-3 text-sm">
      <div className="mb-2 font-semibold text-signal">{def.name}</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs text-white/65">
        <dt className="text-white/35">id</dt>
        <dd>{def.id}</dd>
        <dt className="text-white/35">kind</dt>
        <dd>{def.effect.kind}</dd>
        <dt className="text-white/35">value</dt>
        <dd>{def.value}</dd>
        <dt className="text-white/35">weight</dt>
        <dd>{def.weight}</dd>
        <dt className="text-white/35">size</dt>
        <dd>
          {def.w}×{def.h}
        </dd>
        <dt className="text-white/35">slot</dt>
        <dd>{def.slot ?? '—'}</dd>
        <dt className="text-white/35">scarcity</dt>
        <dd>{def.scarcity ?? '—'}</dd>
        <dt className="text-white/35">starting</dt>
        <dd>{def.startingItem ? `yes${def.startingCount ? ` ×${def.startingCount}` : ''}` : '—'}</dd>
        {'damage' in def.effect && (
          <>
            <dt className="text-white/35">damage</dt>
            <dd>{def.effect.damage}</dd>
            <dt className="text-white/35">accuracy</dt>
            <dd>{def.effect.accuracy}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/**
 * DEV-only floating loot catalog browser / editor.
 * Persists to `src/game/data/items.json` via `/__dev/items`.
 */
export function DevLootBrowser() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<LootTab>('items');
  const [catalog, setCatalog] = useState<ItemsCatalog>({});
  const [baseline, setBaseline] = useState('');
  const [baselineCatalog, setBaselineCatalog] = useState<ItemsCatalog>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
  const [exoticOnly, setExoticOnly] = useState(false);
  const [startingOnly, setStartingOnly] = useState(false);
  const [missingArtOnly, setMissingArtOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('id');
  const [groupByKind, setGroupByKind] = useState(false);
  const [assetKeys, setAssetKeys] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);
  const [saveSuccessOpen, setSaveSuccessOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<CatalogDiff | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [pickCompare, setPickCompare] = useState(false);
  const [closeAfterSuccess, setCloseAfterSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const catalogDirty = catalogFingerprint(catalog) !== baseline;

  const isItemDirty = (id: string | null): boolean => {
    if (!id) return false;
    return itemFingerprint(catalog[id]) !== itemFingerprint(baselineCatalog[id]);
  };

  const selectedDirty = isItemDirty(selectedId);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchItemsCatalog();
      setCatalog(data);
      setBaselineCatalog(structuredClone(data));
      setBaseline(catalogFingerprint(data));
      const ids = Object.keys(data).sort();
      setSelectedId((prev) => (prev && data[prev] ? prev : (ids[0] ?? null)));
      setCreating(false);
      setStatus(`Loaded ${ids.length} items`);
      const icons = await fetchItemIcons().catch(() => null);
      if (icons) setAssetKeys(new Set(icons.icons.map((i) => i.key)));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open]);

  useEffect(() => {
    reportDevToolState('loot', open);
  }, [open]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenLootDetail>).detail;
      setOpen(true);
      setTab('items');
      if (detail?.itemId) {
        setSelectedId(detail.itemId);
        setCreating(false);
        setQuery(detail.itemId);
        setStatus(`Opened from Enemies · ${detail.itemId}`);
      }
    };
    const onClose = (e: Event) => {
      const except = (e as CustomEvent<CloseDevToolsDetail>).detail?.except;
      if (except === 'loot') return;
      setOpen(false);
    };
    window.addEventListener(OPEN_LOOT_EVENT, onOpen);
    window.addEventListener(CLOSE_DEV_TOOLS_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_LOOT_EVENT, onOpen);
      window.removeEventListener(CLOSE_DEV_TOOLS_EVENT, onClose);
    };
  }, []);

  const hasArt = (id: string): boolean => {
    const key = `item.${id}`;
    return assetKeys.has(key) || !!ICON_ASSETS[key as keyof typeof ICON_ASSETS];
  };

  const ids = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = Object.values(catalog).filter((item) => {
      if (kindFilter !== 'all' && item.effect.kind !== kindFilter) return false;
      if (exoticOnly && !item.exotic) return false;
      if (startingOnly && !item.startingItem) return false;
      if (missingArtOnly && hasArt(item.id)) return false;
      if (slotFilter === 'equipped' && !item.slot) return false;
      if (slotFilter === 'none' && item.slot) return false;
      if (
        slotFilter !== 'all' &&
        slotFilter !== 'equipped' &&
        slotFilter !== 'none' &&
        item.slot !== slotFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.effect.kind.includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      if (sortMode === 'kind') {
        return a.effect.kind.localeCompare(b.effect.kind) || a.id.localeCompare(b.id);
      }
      if (sortMode === 'slot') {
        return (a.slot ?? '').localeCompare(b.slot ?? '') || a.id.localeCompare(b.id);
      }
      return a.id.localeCompare(b.id);
    });

    return list.map((i) => i.id);
  }, [
    catalog,
    query,
    kindFilter,
    slotFilter,
    exoticOnly,
    startingOnly,
    missingArtOnly,
    sortMode,
    assetKeys,
  ]);

  const groupedIds = useMemo(() => {
    if (!groupByKind) return [{ kind: null as string | null, ids }];
    const map = new Map<string, string[]>();
    for (const id of ids) {
      const kind = catalog[id]?.effect.kind ?? 'misc';
      const arr = map.get(kind) ?? [];
      arr.push(id);
      map.set(kind, arr);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, groupIds]) => ({ kind, ids: groupIds }));
  }, [groupByKind, ids, catalog]);

  const selected = selectedId ? catalog[selectedId] : null;
  const compareDef = compareId ? catalog[compareId] : null;
  const validationErrors = useMemo(() => validateItemsCatalog(catalog), [catalog]);
  const valid = validationErrors.length === 0;

  const updateSelected = (next: ItemDef) => {
    if (!selectedId) return;
    if (creating && next.id !== selectedId) {
      if (!next.id || catalog[next.id]) {
        setError(next.id ? `Id "${next.id}" already exists` : 'Id is required');
        return;
      }
      setError(null);
      setCatalog((prev) => {
        const copy = { ...prev };
        delete copy[selectedId];
        copy[next.id] = next;
        return copy;
      });
      setSelectedId(next.id);
      return;
    }
    setCatalog((prev) => ({ ...prev, [selectedId]: { ...next, id: selectedId } }));
  };

  const applySelect = (id: string) => {
    setSelectedId(id);
    setCreating(false);
    setError(null);
    setPickCompare(false);
  };

  const applyNew = () => {
    let n = 1;
    let id = `new_item_${n}`;
    while (catalog[id] || baselineCatalog[id]) {
      n += 1;
      id = `new_item_${n}`;
    }
    const item = blankItem(id);
    setCatalog((prev) => ({ ...prev, [id]: item }));
    setSelectedId(id);
    setCreating(true);
    setStatus(`Draft ${id} — set id then Save`);
  };

  const applyDuplicate = () => {
    if (!selectedId || !catalog[selectedId]) return;
    const src = catalog[selectedId];
    let n = 1;
    let id = `${src.id}_copy`;
    while (catalog[id]) {
      n += 1;
      id = `${src.id}_copy_${n}`;
    }
    const clone: ItemDef = { ...structuredClone(src), id, name: `${src.name} (copy)` };
    delete clone.startingItem;
    delete clone.startingCount;
    setCatalog((prev) => ({ ...prev, [id]: clone }));
    setSelectedId(id);
    setCreating(true);
    setStatus(`Duplicated as ${id}`);
  };

  const discardSelectedItem = () => {
    if (!selectedId) return;
    if (baselineCatalog[selectedId]) {
      setCatalog((prev) => ({
        ...prev,
        [selectedId]: structuredClone(baselineCatalog[selectedId]),
      }));
    } else {
      setCatalog((prev) => {
        const copy = { ...prev };
        delete copy[selectedId];
        return copy;
      });
    }
    setCreating(false);
    setError(null);
  };

  const discardAllToBaseline = () => {
    const restored = structuredClone(baselineCatalog);
    setCatalog(restored);
    setBaseline(catalogFingerprint(restored));
    setCreating(false);
    setError(null);
    return restored;
  };

  const persistCatalog = async (): Promise<boolean> => {
    if (!valid) {
      setError(validationErrors.slice(0, 5).join('\n'));
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      await saveItemsCatalog(catalog);
      const snap = structuredClone(catalog);
      setBaselineCatalog(snap);
      setBaseline(catalogFingerprint(snap));
      setCreating(false);
      setStatus('Saved to src/game/data/items.json');
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const requestSave = () => {
    if (!catalogDirty || !valid) return;
    const diff = diffCatalogs(baselineCatalog, catalog);
    setPendingDiff(diff);
    setDiffOpen(true);
  };

  const confirmSave = async () => {
    const ok = await persistCatalog();
    if (!ok) return;
    setDiffOpen(false);
    setPendingDiff(null);
    setSaveSuccessOpen(true);
  };

  const requestSelect = (id: string) => {
    if (pickCompare) {
      setCompareId(id);
      setPickCompare(false);
      setStatus(`Comparing with ${id}`);
      return;
    }
    if (id === selectedId) return;
    if (selectedDirty) {
      setPendingNav({ kind: 'select', id });
      return;
    }
    applySelect(id);
  };

  const requestNew = () => {
    if (selectedDirty) {
      setPendingNav({ kind: 'new' });
      return;
    }
    applyNew();
  };

  const requestDuplicate = () => {
    if (!selectedId) return;
    if (selectedDirty) {
      setPendingNav({ kind: 'duplicate' });
      return;
    }
    applyDuplicate();
  };

  const requestClose = () => {
    if (catalogDirty) {
      setPendingNav({ kind: 'close' });
      return;
    }
    setOpen(false);
  };

  const resolvePending = async (action: 'save' | 'discard' | 'cancel') => {
    if (!pendingNav) return;
    if (action === 'cancel') {
      setPendingNav(null);
      return;
    }

    const nav = pendingNav;

    if (action === 'save') {
      // For item-nav, save whole catalog (same as toolbar). Show diff if any.
      if (catalogDirty) {
        const diff = diffCatalogs(baselineCatalog, catalog);
        if (!diffIsEmpty(diff)) {
          setPendingDiff(diff);
          setDiffOpen(true);
          // Keep pendingNav — after confirmed save we'll apply it
          return;
        }
      }
      const ok = await persistCatalog();
      if (!ok) return;
      setPendingNav(null);
      if (nav.kind === 'select') applySelect(nav.id);
      else if (nav.kind === 'new') applyNew();
      else if (nav.kind === 'duplicate') applyDuplicate();
      else setOpen(false);
      return;
    }

    // discard current item edits only (for select/new/duplicate), or all on close
    if (nav.kind === 'close') {
      discardAllToBaseline();
      setPendingNav(null);
      setOpen(false);
      return;
    }

    discardSelectedItem();
    setPendingNav(null);
    if (nav.kind === 'select') {
      const restoredId = baselineCatalog[selectedId!]? selectedId : null;
      void restoredId;
      applySelect(nav.id);
      setStatus('Discarded edits on previous item');
    } else if (nav.kind === 'new') {
      applyNew();
    } else {
      applyDuplicate();
    }
  };

  // After diff confirm while a nav was pending
  const confirmSaveAndNav = async () => {
    const nav = pendingNav;
    const ok = await persistCatalog();
    if (!ok) return;
    setDiffOpen(false);
    setPendingDiff(null);
    setPendingNav(null);
    setSaveSuccessOpen(true);
    if (!nav) return;
    if (nav.kind === 'select') applySelect(nav.id);
    else if (nav.kind === 'new') applyNew();
    else if (nav.kind === 'duplicate') applyDuplicate();
    else if (nav.kind === 'close') setCloseAfterSuccess(true);
  };

  const handleRevert = () => {
    if (!catalogDirty) return;
    discardAllToBaseline();
    setSelectedId((prev) => {
      if (prev && baselineCatalog[prev]) return prev;
      return Object.keys(baselineCatalog).sort()[0] ?? null;
    });
    setStatus('Reverted to last saved catalog');
  };

  const handleDelete = () => {
    if (!selectedId) return;
    if (!confirm(`Delete "${selectedId}" from the catalog draft?`)) return;
    const removed = selectedId;
    setCatalog((prev) => {
      const copy = { ...prev };
      delete copy[removed];
      return copy;
    });
    setCreating(false);
    setSelectedId(null);
    if (compareId === removed) setCompareId(null);
    setStatus(`Removed ${removed} from draft`);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const imported = parseImportedCatalog(text);
      if (catalogDirty && !confirm('Replace the current draft with the imported catalog?')) return;
      setCatalog(imported);
      setCreating(false);
      const first = Object.keys(imported).sort()[0] ?? null;
      setSelectedId(first);
      setStatus(`Imported ${Object.keys(imported).length} items (not saved yet)`);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (tab !== 'items') return;
        if (catalogDirty && valid && !busy) requestSave();
        return;
      }
      if (e.key === 'Escape') {
        if (saveSuccessOpen) {
          setSaveSuccessOpen(false);
          if (closeAfterSuccess) {
            setCloseAfterSuccess(false);
            setOpen(false);
          }
          return;
        }
        if (diffOpen) {
          setDiffOpen(false);
          setPendingDiff(null);
          return;
        }
        if (pendingNav) {
          setPendingNav(null);
          return;
        }
        requestClose();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!ids.length) return;
      e.preventDefault();
      const idx = selectedId ? ids.indexOf(selectedId) : -1;
      const next =
        e.key === 'ArrowDown'
          ? ids[Math.min(ids.length - 1, Math.max(0, idx + 1))]!
          : ids[Math.max(0, idx <= 0 ? 0 : idx - 1)]!;
      requestSelect(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    open,
    tab,
    catalogDirty,
    valid,
    busy,
    saveSuccessOpen,
    closeAfterSuccess,
    diffOpen,
    pendingNav,
    ids,
    selectedId,
  ]);

  if (!open) return null;

  const saveFromDiff = pendingNav ? confirmSaveAndNav : confirmSave;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col overflow-hidden bg-concrete-900">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
        <h3 className="mr-auto text-lg font-bold text-signal">Loot</h3>
        <div className="mr-2 flex rounded border border-white/10 p-0.5">
          <button
            type="button"
            onClick={() => setTab('items')}
            className={`rounded px-2.5 py-1 text-xs ${
              tab === 'items' ? 'bg-signal/20 text-signal' : 'text-white/50 hover:text-white/70'
            }`}
          >
            Items
          </button>
          <button
            type="button"
            onClick={() => setTab('tables')}
            className={`rounded px-2.5 py-1 text-xs ${
              tab === 'tables' ? 'bg-signal/20 text-signal' : 'text-white/50 hover:text-white/70'
            }`}
          >
            Tables
          </button>
        </div>
        {tab === 'items' && catalogDirty && (
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-2xs uppercase tracking-wider text-amber-300">
            unsaved
          </span>
        )}
        {tab === 'items' && selectedDirty && (
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-2xs uppercase tracking-wider text-amber-200/80">
            item dirty
          </span>
        )}
        {tab === 'items' && !valid && <ValidationErrorBadge errors={validationErrors} />}
        {tab === 'items' && (
          <>
        <button
          type="button"
          disabled={busy || !catalogDirty || !valid}
          onClick={requestSave}
          className="rounded border border-signal/40 px-2.5 py-1 text-xs text-signal disabled:opacity-40"
          title="Ctrl/Cmd+S"
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy || !catalogDirty}
          onClick={handleRevert}
          className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70 disabled:opacity-40"
        >
          Revert
        </button>
        <button
          type="button"
          onClick={requestNew}
          className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70"
        >
          New
        </button>
        <button
          type="button"
          disabled={!selectedId}
          onClick={requestDuplicate}
          className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70 disabled:opacity-40"
        >
          Duplicate
        </button>
        <button
          type="button"
          disabled={!selectedId}
          onClick={handleDelete}
          className="rounded border border-red-500/30 px-2.5 py-1 text-xs text-red-300 disabled:opacity-40"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => {
            setPickCompare(true);
            setStatus('Click an item in the list to compare against the current selection');
          }}
          className={`rounded border px-2.5 py-1 text-xs ${
            pickCompare
              ? 'border-signal/50 text-signal'
              : 'border-white/15 text-white/70'
          }`}
        >
          Compare…
        </button>
        {compareId && (
          <button
            type="button"
            onClick={() => setCompareId(null)}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/50"
          >
            Clear compare
          </button>
        )}
        <button
          type="button"
          onClick={() => downloadCatalog(catalog)}
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
          </>
        )}
        <button
          type="button"
          onClick={requestClose}
          className="text-xs text-white/40 hover:text-white/70"
          title="Esc"
        >
          ✕ close
        </button>
      </header>

      {(status || error) && (
        <div
          className={`border-b border-white/5 px-4 py-2 text-xs whitespace-pre-wrap ${
            error ? 'bg-red-950/40 text-red-300' : 'text-white/45'
          }`}
        >
          {error ?? status}
        </div>
      )}

      {tab === 'tables' ? (
        <LootTablesEditor
          onStatus={(message, err) => {
            if (err) {
              setError(err);
              setStatus(null);
            } else {
              setError(null);
              setStatus(message);
            }
          }}
          onOpenItem={(id) => {
            setTab('items');
            applySelect(id);
            setCompareId(null);
            setStatus(`Opened ${id} from tables`);
          }}
        />
      ) : (
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[min(22rem,30vw)] shrink-0 flex-col border-r border-white/10 bg-black/20">
          <div className="flex flex-col gap-2 border-b border-white/10 p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search id / name…"
              className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-signal/40"
            />
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as KindFilter)}
              className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white outline-none"
            >
              <option value="all">All kinds</option>
              {[...EFFECT_KINDS].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select
              value={slotFilter}
              onChange={(e) => setSlotFilter(e.target.value as SlotFilter)}
              className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white outline-none"
            >
              <option value="all">Any slot</option>
              <option value="equipped">Has slot</option>
              <option value="none">No slot</option>
              <option value="head">head</option>
              <option value="body">body</option>
              <option value="hands">hands</option>
              <option value="legs">legs</option>
              <option value="feet">feet</option>
              <option value="bag">bag</option>
              <option value="mainHand">mainHand</option>
              <option value="offHand">offHand</option>
            </select>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white outline-none"
            >
              <option value="id">Sort by id</option>
              <option value="name">Sort by name</option>
              <option value="kind">Sort by kind</option>
              <option value="slot">Sort by slot</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-white/50">
              <input
                type="checkbox"
                checked={groupByKind}
                onChange={(e) => setGroupByKind(e.target.checked)}
              />
              Group by kind
            </label>
            <label className="flex items-center gap-2 text-xs text-white/50">
              <input
                type="checkbox"
                checked={exoticOnly}
                onChange={(e) => setExoticOnly(e.target.checked)}
              />
              Exotic only
            </label>
            <label className="flex items-center gap-2 text-xs text-white/50">
              <input
                type="checkbox"
                checked={startingOnly}
                onChange={(e) => setStartingOnly(e.target.checked)}
              />
              Starting only
            </label>
            <label className="flex items-center gap-2 text-xs text-white/50">
              <input
                type="checkbox"
                checked={missingArtOnly}
                onChange={(e) => setMissingArtOnly(e.target.checked)}
              />
              Missing art
            </label>
            <div className="text-2xs text-white/30">
              {ids.length} / {Object.keys(catalog).length} shown · ↑↓ to move
            </div>
          </div>
          <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {groupedIds.map((group) => (
              <li key={group.kind ?? 'all'}>
                {group.kind && (
                  <div className="sticky top-0 bg-concrete-900/95 px-3 py-1 text-2xs uppercase tracking-widest text-white/30">
                    {group.kind}
                  </div>
                )}
                <ul>
                  {group.ids.map((id) => {
                    const item = catalog[id];
                    const active = id === selectedId;
                    const dirty = isItemDirty(id);
                    const comparing = id === compareId;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => requestSelect(id)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                            active
                              ? 'text-signal ring-1 ring-inset ring-signal/40'
                              : comparing
                                ? 'text-amber-200'
                                : 'text-white/85 hover:brightness-110'
                          }`}
                          style={{
                            backgroundImage: `linear-gradient(270deg, ${item.color}66 0%, ${item.color}22 42%, transparent 78%)`,
                          }}
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/15 bg-black/50"
                          >
                            <Icon name={itemIcon(item)} size={18} />
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            <span className="block truncate font-medium">
                              {item.name}
                              {dirty ? ' •' : ''}
                              {item.startingItem ? ' ★' : ''}
                            </span>
                            <span className="block truncate font-mono text-2xs text-white/45">
                              {id} · {item.effect.kind}
                              {!hasArt(id) ? ' · no art' : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto p-6 lg:px-10 lg:py-8">
          {selected ? (
            <div className={compareDef ? 'grid gap-6 lg:grid-cols-2' : undefined}>
              <LootItemForm
                item={selected}
                idLocked={!creating}
                onChange={updateSelected}
                onStatus={(message, err) => {
                  if (err) {
                    setError(err);
                    setStatus(null);
                  } else {
                    setError(null);
                    setStatus(message);
                  }
                }}
              />
              {compareDef && (
                <div>
                  <h4 className="mb-3 text-2xs uppercase tracking-widest text-white/30">
                    Compare · {compareDef.id}
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-2xs text-white/35">Current</div>
                      <CompareCard def={selected} />
                    </div>
                    <div>
                      <div className="mb-1 text-2xs text-white/35">Other</div>
                      <CompareCard def={compareDef} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/40">Select an item or create a new one.</p>
          )}
        </main>
      </div>
      )}

      {pendingNav && !diffOpen && (
        <DialogShell title="Unsaved item changes" onBackdrop={() => void resolvePending('cancel')}>
          <p className="mb-4 text-sm text-white/60">
            The current item has unsaved edits. Save the catalog, discard this item&apos;s changes,
            or cancel.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void resolvePending('cancel')}
              className="rounded border border-white/15 px-3 py-1.5 text-xs text-white/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void resolvePending('discard')}
              className="rounded border border-red-500/30 px-3 py-1.5 text-xs text-red-300"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={busy || !valid}
              onClick={() => void resolvePending('save')}
              className="rounded border border-signal/40 px-3 py-1.5 text-xs text-signal disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </DialogShell>
      )}

      {diffOpen && pendingDiff && (
        <DialogShell
          title="Review changes before save"
          onBackdrop={() => {
            setDiffOpen(false);
            setPendingDiff(null);
          }}
        >
          <div className="mb-4 max-h-64 overflow-y-auto text-xs text-white/65">
            {diffIsEmpty(pendingDiff) ? (
              <p>No field changes detected.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pendingDiff.added.map((id) => (
                  <li key={`a-${id}`}>
                    <span className="text-signal">+ added</span> <span className="font-mono">{id}</span>
                  </li>
                ))}
                {pendingDiff.removed.map((id) => (
                  <li key={`r-${id}`}>
                    <span className="text-red-300">− removed</span>{' '}
                    <span className="font-mono">{id}</span>
                  </li>
                ))}
                {pendingDiff.changed.map((c) => (
                  <li key={`c-${c.id}`}>
                    <span className="text-amber-200">~ changed</span>{' '}
                    <span className="font-mono">{c.id}</span>
                    <span className="text-white/35"> · {c.fields.join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
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
              onClick={() => void saveFromDiff()}
              className="rounded border border-signal/40 px-3 py-1.5 text-xs text-signal disabled:opacity-40"
            >
              Confirm save
            </button>
          </div>
        </DialogShell>
      )}

      {saveSuccessOpen && (
        <DialogShell
          title="Saved successfully"
          onBackdrop={() => {
            setSaveSuccessOpen(false);
            if (closeAfterSuccess) {
              setCloseAfterSuccess(false);
              setOpen(false);
            }
          }}
        >
          <p className="mb-4 text-sm text-white/60">
            Catalog written to{' '}
            <span className="font-mono text-white/80">src/game/data/items.json</span>. The editor
            stays open so you can keep working. Refresh the page for changes to take effect in the
            live game.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setSaveSuccessOpen(false);
                if (closeAfterSuccess) {
                  setCloseAfterSuccess(false);
                  setOpen(false);
                }
              }}
              className="rounded border border-signal/40 px-3 py-1.5 text-xs text-signal"
            >
              OK
            </button>
          </div>
        </DialogShell>
      )}
    </div>
  );
}
