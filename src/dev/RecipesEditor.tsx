import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Recipe } from '../game/crafting';
import {
  canCraft,
  FIELD_REPAIRS,
  REPAIR_AMOUNT,
  REPAIR_HOURS,
  REPAIR_INPUTS,
  REPAIR_TOOL,
} from '../game/crafting';
import { adjustCraftInputs } from '../game/character';
import { ITEMS } from '../game/loot';
import type { ItemDef } from '../game/types';
import { itemIcon } from '../components/Inventory/itemIcon';
import { Icon } from '../icons/Icon';
import {
  blankRecipe,
  downloadRecipes,
  fetchItemsCatalog,
  fetchRecipesCatalog,
  parseImportedRecipes,
  saveRecipesCatalog,
  type ItemsCatalog,
} from './lootApi';
import {
  fmtNum,
  hasAnySource,
  itemSourceFlags,
  packToInstances,
  recipeEconomy,
  recipeWarnings,
  signed,
  uniqueRecipeId,
  type ItemSourceFlags,
  type RecipeEconomy,
} from './recipeBalance';
import { RecipeItemSearch } from './RecipeItemSearch';
import { diffRecipes, recipeDiffEmpty, type RecipeDiff } from './recipeDiff';
import {
  recipesFingerprint,
  validateRecipesCatalog,
  type RecipeRecord,
  type RecipesCatalog,
} from './validateRecipes';
import { ValidationErrorBadge } from './ValidationErrorBadge';

type PlaceFilter = 'all' | 'field' | 'shelter';
type Pane = 'edit' | 'overview';
type OverviewSort = 'name' | 'hours' | 'deltaValue' | 'deltaWeight' | 'inputs' | 'place';
type PendingNav =
  | { kind: 'select'; id: string }
  | { kind: 'new' }
  | { kind: 'duplicate' };

type Props = {
  active?: boolean;
  focusRecipeId?: string | null;
  onStatus?: (message: string | null, error?: string | null) => void;
  onOpenItem?: (itemId: string) => void;
  onDraftChange?: (recipes: RecipesCatalog) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

const inputClass =
  'rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-signal/50';

const HANDYMAN = 'handyman';

function itemName(items: ItemsCatalog, id: string): string {
  return items[id]?.name ?? ITEMS[id]?.name ?? id;
}

function defOf(items: ItemsCatalog, id: string): ItemDef | undefined {
  return items[id] ?? ITEMS[id];
}

function asRecipe(row: RecipeRecord): Recipe {
  return row as Recipe;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-xs">
      <span className="uppercase tracking-wider text-white/35">{label}</span>
      {children}
    </label>
  );
}

function Stepper({
  value,
  min,
  step,
  onChange,
}: {
  value: number;
  min: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))}
        className="rounded border border-white/15 px-1.5 py-0.5 text-xs text-white/60"
      >
        −
      </button>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
        className="w-16 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-sm outline-none focus:border-signal/40"
      />
      <button
        type="button"
        onClick={() => onChange(Math.round((value + step) * 100) / 100)}
        className="rounded border border-white/15 px-1.5 py-0.5 text-xs text-white/60"
      >
        +
      </button>
    </div>
  );
}

function ItemChip({
  id,
  items,
  count,
  suffix,
  onOpen,
}: {
  id: string;
  items: ItemsCatalog;
  count?: number;
  suffix?: string;
  onOpen?: (id: string) => void;
}) {
  const def = defOf(items, id);
  const inner = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/10 bg-black/40">
        {def ? <Icon name={itemIcon(def)} size={18} /> : <span className="h-3 w-3 rounded-sm bg-white/20" />}
      </span>
      <span className="min-w-0 truncate">
        {count !== undefined ? `${count}× ` : ''}
        {itemName(items, id)}
        {suffix ?? ''}
      </span>
    </>
  );
  const className =
    'inline-flex max-w-full items-center gap-1.5 rounded border border-white/10 bg-black/30 px-1.5 py-1 text-xs text-white/80';
  if (!onOpen) return <span className={className}>{inner}</span>;
  return (
    <button type="button" onClick={() => onOpen(id)} className={`${className} hover:border-signal/40 hover:text-signal`}>
      {inner}
    </button>
  );
}

function SourceBadges({ flags }: { flags: ItemSourceFlags }) {
  return (
    <span className="flex flex-wrap gap-1">
      {flags.loot && <span className="rounded bg-sky-500/20 px-1 text-2xs text-sky-200">loot</span>}
      {flags.craft && <span className="rounded bg-white/10 px-1 text-2xs text-white/45">craft</span>}
      {flags.faction && <span className="rounded bg-violet-500/20 px-1 text-2xs text-violet-200">faction</span>}
      {flags.starting && <span className="rounded bg-amber-500/20 px-1 text-2xs text-amber-200">starting</span>}
      {!hasAnySource(flags) && (
        <span className="rounded bg-red-500/20 px-1 text-2xs text-red-300">no source</span>
      )}
    </span>
  );
}

function EconomyStrip({ eco }: { eco: RecipeEconomy }) {
  const cell = (label: string, value: string, warn?: boolean) => (
    <div>
      <div className="text-2xs uppercase tracking-wider text-white/35">{label}</div>
      <div className={`font-mono text-sm ${warn ? 'text-amber-200' : 'text-white/80'}`}>{value}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cell('Value in → out', `${fmtNum(eco.inValue)} → ${fmtNum(eco.outValue)}`)}
      {cell('Δ value', signed(eco.deltaValue), eco.deltaValue > 0)}
      {cell('Weight kg', `${fmtNum(eco.inWeight)} → ${fmtNum(eco.outWeight)}`, eco.deltaWeight > 0.05)}
      {cell('Δ evac', signed(eco.deltaEvac), eco.deltaEvac < -1)}
      {cell('Hours', `${fmtNum(eco.hours)}h`)}
      {cell(
        'Δ value / h',
        eco.valuePerHour === null ? '—' : signed(eco.valuePerHour),
        (eco.valuePerHour ?? 0) > 0,
      )}
    </div>
  );
}

function CompareCard({
  recipe,
  items,
}: {
  recipe: RecipeRecord;
  items: ItemsCatalog;
}) {
  const eco = recipeEconomy(recipe, items);
  return (
    <div className="rounded border border-white/10 bg-black/25 p-3 text-sm">
      <div className="mb-2 font-semibold text-signal">{recipe.name}</div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {Object.entries(recipe.inputs).map(([id, n]) => (
          <ItemChip key={id} id={id} items={items} count={n} />
        ))}
        <span className="text-white/25">→</span>
        <ItemChip id={recipe.outputDefId} items={items} count={recipe.outputCount} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs text-white/65">
        <dt className="text-white/35">id</dt>
        <dd>{recipe.id}</dd>
        <dt className="text-white/35">hours</dt>
        <dd>{recipe.hours}</dd>
        <dt className="text-white/35">bench</dt>
        <dd>{recipe.needsShelter ? 'shelter' : 'field'}</dd>
        <dt className="text-white/35">Δ value</dt>
        <dd>{signed(eco.deltaValue)}</dd>
        <dt className="text-white/35">Δ kg</dt>
        <dd>{signed(eco.deltaWeight)}</dd>
      </dl>
    </div>
  );
}

/**
 * DEV editor for craft recipes (`src/game/data/recipes.json`).
 */
export function RecipesEditor({
  active = true,
  focusRecipeId,
  onStatus,
  onOpenItem,
  onDraftChange,
  onDirtyChange,
}: Props) {
  const [recipes, setRecipes] = useState<RecipesCatalog | null>(null);
  const [baselineRecipes, setBaselineRecipes] = useState<RecipesCatalog | null>(null);
  const [baseline, setBaseline] = useState('');
  const [items, setItems] = useState<ItemsCatalog>(ITEMS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<PlaceFilter>('all');
  const [pane, setPane] = useState<Pane>('edit');
  const [overviewSort, setOverviewSort] = useState<OverviewSort>('name');
  const [busy, setBusy] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<RecipeDiff | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);
  const [pickCompare, setPickCompare] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [familyFrom, setFamilyFrom] = useState('');
  const [familyTo, setFamilyTo] = useState('');
  const [familyChangeOut, setFamilyChangeOut] = useState(false);
  const [familyOut, setFamilyOut] = useState('');
  const [sandboxShelter, setSandboxShelter] = useState(true);
  const [sandboxHandyman, setSandboxHandyman] = useState(false);
  const [sandboxPack, setSandboxPack] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const knownIds = useMemo(() => new Set(Object.keys(items)), [items]);
  const report = (message: string | null, error?: string | null) => {
    if (!active) return;
    onStatus?.(message, error);
  };

  const load = async () => {
    setBusy(true);
    try {
      const [data, catalog] = await Promise.all([
        fetchRecipesCatalog(),
        fetchItemsCatalog().catch(() => ITEMS as ItemsCatalog),
      ]);
      setItems(catalog);
      setRecipes(data);
      setBaselineRecipes(structuredClone(data));
      setBaseline(recipesFingerprint(data));
      setCreating(false);
      const first = data[0]?.id ?? null;
      setSelectedId((prev) => {
        if (focusRecipeId && data.some((r) => r.id === focusRecipeId)) return focusRecipeId;
        if (prev && data.some((r) => r.id === prev)) return prev;
        return first;
      });
      report(`Loaded ${data.length} recipes`);
    } catch (err) {
      report(null, String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!recipes || !focusRecipeId) return;
    if (recipes.some((r) => r.id === focusRecipeId)) {
      setSelectedId(focusRecipeId);
      setCreating(false);
      setPane('edit');
    }
  }, [focusRecipeId, recipes]);

  const dirty = recipes ? recipesFingerprint(recipes) !== baseline : false;
  const errors = useMemo(
    () => (recipes ? validateRecipesCatalog(recipes, knownIds) : []),
    [recipes, knownIds],
  );
  const valid = errors.length === 0;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (recipes) onDraftChange?.(recipes);
  }, [recipes, onDraftChange]);

  const selected = recipes?.find((r) => r.id === selectedId) ?? null;
  const selectedIndex = recipes?.findIndex((r) => r.id === selectedId) ?? -1;
  const compareDef = recipes?.find((r) => r.id === compareId) ?? null;

  const selectedDirty = useMemo(() => {
    if (!selected || !baselineRecipes) return false;
    const prev = baselineRecipes.find((r) => r.id === selected.id);
    if (!prev) return true;
    return JSON.stringify(prev) !== JSON.stringify(selected);
  }, [selected, baselineRecipes]);

  const filtered = useMemo(() => {
    if (!recipes) return [];
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (place === 'field' && r.needsShelter) return false;
      if (place === 'shelter' && !r.needsShelter) return false;
      if (!q) return true;
      const hay = [r.id, r.name, r.blurb, r.outputDefId, r.tool ?? '', ...Object.keys(r.inputs)]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [recipes, query, place]);

  const applySelect = (id: string) => {
    setSelectedId(id);
    setCreating(false);
    setPane('edit');
    setPickCompare(false);
  };

  const requestSelect = (id: string) => {
    if (pickCompare) {
      setCompareId(id);
      setPickCompare(false);
      report(`Comparing with ${id}`);
      return;
    }
    if (id === selectedId) {
      setPane('edit');
      return;
    }
    if (selectedDirty) {
      setPendingNav({ kind: 'select', id });
      return;
    }
    applySelect(id);
  };

  const patch = (partial: Partial<RecipeRecord>) => {
    if (!recipes || !selected) return;
    const next = { ...selected, ...partial };
    if (creating && partial.id !== undefined && partial.id !== selected.id) {
      const id = partial.id;
      if (!id || recipes.some((r) => r.id === id)) {
        report(null, id ? `Id "${id}" already exists` : 'Id is required');
        return;
      }
      setRecipes(recipes.map((r) => (r.id === selected.id ? next : r)));
      setSelectedId(id);
      report(null, null);
      return;
    }
    setRecipes(recipes.map((r) => (r.id === selected.id ? { ...next, id: selected.id } : r)));
  };

  const setInputCount = (defId: string, count: number) => {
    if (!selected) return;
    const inputs = { ...selected.inputs };
    if (count <= 0) delete inputs[defId];
    else inputs[defId] = count;
    patch({ inputs });
  };

  const addInput = (defId: string) => {
    if (!selected) return;
    if (defId === selected.outputDefId) {
      report(null, 'Output cannot also be an input');
      return;
    }
    if (selected.tool === defId) {
      report(null, 'Tool cannot also be an input');
      return;
    }
    const have = selected.inputs[defId];
    setInputCount(defId, (have ?? 0) + 1);
    report(have ? `Bumped ${defId} to ${(have ?? 0) + 1}` : `Added ${defId}`);
  };

  const requestSave = () => {
    if (!recipes || !valid || !baselineRecipes) {
      report(null, errors.slice(0, 5).join('\n') || 'Nothing to save');
      return;
    }
    setPendingDiff(diffRecipes(baselineRecipes, recipes));
    setDiffOpen(true);
  };

  const confirmSave = async () => {
    if (!recipes || !valid) return;
    setBusy(true);
    try {
      await saveRecipesCatalog(recipes, knownIds);
      setBaselineRecipes(structuredClone(recipes));
      setBaseline(recipesFingerprint(recipes));
      setCreating(false);
      setDiffOpen(false);
      setPendingDiff(null);
      report('Saved to src/game/data/recipes.json');
      setSaveOk(true);
      if (pendingNav) {
        const nav = pendingNav;
        setPendingNav(null);
        if (nav.kind === 'select') applySelect(nav.id);
        else if (nav.kind === 'new') applyNew();
        else applyDuplicate();
      }
    } catch (err) {
      report(null, String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRevert = () => {
    if (dirty && !confirm('Discard unsaved recipe changes?')) return;
    void load();
  };

  const applyNew = () => {
    if (!recipes) return;
    const id = uniqueRecipeId(recipes, 'new_recipe');
    const outputDefId = items.scrap_metal ? 'scrap_metal' : (Object.keys(items)[0] ?? 'scrap_metal');
    const draft = blankRecipe(id, outputDefId);
    setRecipes([...recipes, draft]);
    setSelectedId(id);
    setCreating(true);
    setPane('edit');
    report(`Draft ${id} — pick a combo, then Save`);
  };

  const applyDuplicate = () => {
    if (!recipes || !selected) return;
    const id = uniqueRecipeId(recipes, `${selected.id}_copy`);
    const clone: RecipeRecord = {
      ...structuredClone(selected),
      id,
      name: `${selected.name} (copy)`,
    };
    const at = selectedIndex >= 0 ? selectedIndex + 1 : recipes.length;
    const next = [...recipes];
    next.splice(at, 0, clone);
    setRecipes(next);
    setSelectedId(id);
    setCreating(true);
    setPane('edit');
    report(`Duplicated as ${id}`);
  };

  const requestNew = () => {
    if (selectedDirty) {
      setPendingNav({ kind: 'new' });
      return;
    }
    applyNew();
  };

  const requestDuplicate = () => {
    if (!selected) return;
    if (selectedDirty) {
      setPendingNav({ kind: 'duplicate' });
      return;
    }
    applyDuplicate();
  };

  const discardSelected = () => {
    if (!recipes || !selected || !baselineRecipes) return;
    const prev = baselineRecipes.find((r) => r.id === selected.id);
    if (!prev) {
      const next = recipes.filter((r) => r.id !== selected.id);
      setRecipes(next);
    } else {
      setRecipes(recipes.map((r) => (r.id === selected.id ? structuredClone(prev) : r)));
    }
    setCreating(false);
  };

  const resolvePending = async (action: 'save' | 'discard' | 'cancel') => {
    if (!pendingNav) return;
    if (action === 'cancel') {
      setPendingNav(null);
      return;
    }
    const nav = pendingNav;
    if (action === 'save') {
      if (!valid) {
        report(null, errors.slice(0, 5).join('\n'));
        return;
      }
      requestSave();
      return;
    }
    discardSelected();
    setPendingNav(null);
    if (nav.kind === 'select') applySelect(nav.id);
    else if (nav.kind === 'new') applyNew();
    else applyDuplicate();
  };

  const handleDelete = () => {
    if (!recipes || !selected) return;
    if (!confirm(`Delete recipe "${selected.name}"?`)) return;
    const next = recipes.filter((r) => r.id !== selected.id);
    setRecipes(next);
    setCreating(false);
    if (compareId === selected.id) setCompareId(null);
    setSelectedId(next[Math.max(0, selectedIndex - 1)]?.id ?? next[0]?.id ?? null);
    report(`Removed ${selected.id} from draft`);
  };

  const moveSelected = (dir: -1 | 1) => {
    if (!recipes || selectedIndex < 0) return;
    const to = selectedIndex + dir;
    if (to < 0 || to >= recipes.length) return;
    const next = [...recipes];
    const [row] = next.splice(selectedIndex, 1);
    next.splice(to, 0, row!);
    setRecipes(next);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const imported = parseImportedRecipes(text, knownIds);
      if (dirty && !confirm('Replace draft recipes with import?')) return;
      setRecipes(imported);
      setCreating(false);
      setSelectedId(imported[0]?.id ?? null);
      report(`Imported ${imported.length} recipes (not saved yet)`);
    } catch (err) {
      report(null, String(err));
    }
  };

  const openFamily = () => {
    if (!selected) return;
    const first = Object.keys(selected.inputs)[0] ?? '';
    setFamilyFrom(first);
    setFamilyTo('');
    setFamilyOut(selected.outputDefId);
    setFamilyChangeOut(false);
    setFamilyOpen(true);
  };

  const applyFamily = () => {
    if (!recipes || !selected || !familyFrom || !familyTo) return;
    const count = selected.inputs[familyFrom];
    if (count === undefined) return;
    const inputs = { ...selected.inputs };
    delete inputs[familyFrom];
    inputs[familyTo] = (inputs[familyTo] ?? 0) + count;
    const outputDefId = familyChangeOut && familyOut ? familyOut : selected.outputDefId;
    const id = uniqueRecipeId(
      recipes,
      familyChangeOut ? outputDefId : `${selected.id}_${familyTo}`,
    );
    const clone: RecipeRecord = {
      ...structuredClone(selected),
      id,
      name: `${selected.name} (${itemName(items, familyTo)})`,
      inputs,
      outputDefId,
    };
    const at = selectedIndex >= 0 ? selectedIndex + 1 : recipes.length;
    const next = [...recipes];
    next.splice(at, 0, clone);
    setRecipes(next);
    setSelectedId(id);
    setCreating(true);
    setFamilyOpen(false);
    setPane('edit');
    report(`Family copy ${id}`);
  };

  useEffect(() => {
    if (!selected) return;
    setSandboxPack((prev) => {
      const next = { ...prev };
      for (const [id, n] of Object.entries(selected.inputs)) {
        if (next[id] === undefined) next[id] = n;
      }
      if (selected.tool && next[selected.tool] === undefined) next[selected.tool] = 1;
      return next;
    });
    setSandboxShelter(selected.needsShelter ? true : sandboxShelter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.inputs, selected?.tool, selected?.needsShelter]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && valid && !busy) requestSave();
        return;
      }
      if (e.key === 'Escape') {
        if (familyOpen) {
          setFamilyOpen(false);
          return;
        }
        if (pendingNav) {
          setPendingNav(null);
          return;
        }
        if (diffOpen) {
          setDiffOpen(false);
          setPendingDiff(null);
          return;
        }
        if (saveOk) {
          setSaveOk(false);
          return;
        }
        if (pickCompare) {
          setPickCompare(false);
          return;
        }
        return;
      }
      if (pane !== 'edit') return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!filtered.length) return;
      e.preventDefault();
      const idx = selectedId ? filtered.findIndex((r) => r.id === selectedId) : -1;
      const next =
        e.key === 'ArrowDown'
          ? filtered[Math.min(filtered.length - 1, Math.max(0, idx + 1))]!
          : filtered[Math.max(0, idx <= 0 ? 0 : idx - 1)]!;
      requestSelect(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    dirty,
    valid,
    busy,
    pane,
    filtered,
    selectedId,
    selectedDirty,
    familyOpen,
    pendingNav,
    diffOpen,
    saveOk,
    pickCompare,
    recipes,
  ]);

  const eco = selected ? recipeEconomy(selected, items) : null;
  const warnings = selected && recipes ? recipeWarnings(selected, recipes, items) : [];
  const excludeInputs = useMemo(() => {
    const set = new Set<string>();
    if (!selected) return set;
    for (const id of Object.keys(selected.inputs)) set.add(id);
    set.add(selected.outputDefId);
    if (selected.tool) set.add(selected.tool);
    return set;
  }, [selected]);

  const chains = useMemo(() => {
    if (!recipes || !selected) {
      return { madeBy: [] as RecipeRecord[], usedIn: [] as RecipeRecord[], cousins: [] as RecipeRecord[] };
    }
    const inputIds = new Set(Object.keys(selected.inputs));
    const madeBy = recipes.filter((r) => r.id !== selected.id && inputIds.has(r.outputDefId));
    const usedIn = recipes.filter(
      (r) => r.id !== selected.id && r.inputs[selected.outputDefId] !== undefined,
    );
    const cousins = recipes.filter((r) => {
      if (r.id === selected.id) return false;
      if (r.outputDefId === selected.outputDefId) return true;
      return Object.keys(r.inputs).some((id) => inputIds.has(id));
    });
    return { madeBy, usedIn, cousins };
  }, [recipes, selected]);

  const sandboxResult = useMemo(() => {
    if (!selected) return null;
    const traitIds = sandboxHandyman ? [HANDYMAN] : [];
    const adjusted = adjustCraftInputs(selected.inputs, traitIds);
    const pack = { ...sandboxPack };
    if (selected.tool) pack[selected.tool] = Math.max(pack[selected.tool] ?? 0, 1);
    const check = canCraft(asRecipe(selected), packToInstances(pack), sandboxShelter, adjusted);
    return { check, adjusted };
  }, [selected, sandboxPack, sandboxShelter, sandboxHandyman]);

  const overviewRows = useMemo(() => {
    if (!recipes) return [];
    const rows = recipes.map((r) => {
      const e = recipeEconomy(r, items);
      const warns = recipeWarnings(r, recipes, items).filter((w) => w.level === 'warn').length;
      return { r, e, warns, inputCount: Object.keys(r.inputs).length };
    });
    rows.sort((a, b) => {
      switch (overviewSort) {
        case 'hours':
          return a.r.hours - b.r.hours;
        case 'deltaValue':
          return b.e.deltaValue - a.e.deltaValue;
        case 'deltaWeight':
          return b.e.deltaWeight - a.e.deltaWeight;
        case 'inputs':
          return b.inputCount - a.inputCount;
        case 'place':
          return Number(a.r.needsShelter) - Number(b.r.needsShelter);
        default:
          return a.r.name.localeCompare(b.r.name);
      }
    });
    return rows;
  }, [recipes, items, overviewSort]);

  if (!recipes) {
    return <p className="p-6 text-sm text-white/40">{busy ? 'Loading…' : 'No recipes loaded.'}</p>;
  }

  const sortBtn = (key: OverviewSort, label: string) => (
    <button
      type="button"
      onClick={() => setOverviewSort(key)}
      className={`font-normal ${overviewSort === key ? 'text-signal' : ''}`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative flex min-h-0 flex-1">
      {pane === 'edit' && (
        <aside className="flex w-[min(22rem,30vw)] shrink-0 flex-col border-r border-white/10 bg-black/20">
          <div className="flex flex-col gap-2 border-b border-white/10 p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="id, name, item…"
              className={inputClass}
            />
            <div className="flex rounded border border-white/10 p-0.5">
              {(['all', 'field', 'shelter'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlace(p)}
                  className={`flex-1 rounded px-2 py-1 text-2xs capitalize ${
                    place === p ? 'bg-signal/20 text-signal' : 'text-white/50 hover:text-white/70'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="text-2xs text-white/30">
              {filtered.length} / {recipes.length} · ↑↓ to move
            </div>
          </div>
          <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {filtered.map((recipe) => {
              const isActive = recipe.id === selectedId;
              const out = defOf(items, recipe.outputDefId);
              const comparing = recipe.id === compareId;
              return (
                <li key={recipe.id}>
                  <button
                    type="button"
                    onClick={() => requestSelect(recipe.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                      isActive
                        ? 'bg-signal/15 text-signal'
                        : comparing
                          ? 'text-amber-200'
                          : 'text-white/75 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/10 bg-black/40">
                      {out ? (
                        <Icon name={itemIcon(out)} size={18} />
                      ) : (
                        <span className="h-3 w-3 rounded-sm bg-white/20" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {recipe.name}
                        {baselineRecipes &&
                        JSON.stringify(baselineRecipes.find((b) => b.id === recipe.id)) !==
                          JSON.stringify(recipe)
                          ? ' •'
                          : ''}
                      </span>
                      <span className="block truncate font-mono text-2xs text-white/35">
                        {recipe.id} · {Object.keys(recipe.inputs).length} in → {recipe.outputCount}×{' '}
                        {recipe.outputDefId}
                        {recipe.needsShelter ? ' · bench' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="mr-auto min-w-0">
            <h4 className="text-base font-bold text-signal">
              {pane === 'overview' ? 'Recipe overview' : (selected?.name ?? 'Recipes')}
            </h4>
            <p className="text-xs text-white/40">Hard-refresh the game after Save.</p>
          </div>
          <div className="flex rounded border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setPane('edit')}
              className={`rounded px-2 py-1 text-2xs ${
                pane === 'edit' ? 'bg-signal/20 text-signal' : 'text-white/50'
              }`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setPane('overview')}
              className={`rounded px-2 py-1 text-2xs ${
                pane === 'overview' ? 'bg-signal/20 text-signal' : 'text-white/50'
              }`}
            >
              Overview
            </button>
          </div>
          {dirty && (
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-2xs uppercase tracking-wider text-amber-300">
              unsaved
            </span>
          )}
          {pane === 'edit' && selectedDirty && (
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-2xs uppercase tracking-wider text-amber-200/80">
              recipe dirty
            </span>
          )}
          {!valid && <ValidationErrorBadge errors={errors} />}
          <button
            type="button"
            disabled={busy || !dirty || !valid}
            onClick={requestSave}
            className="rounded border border-signal/40 px-2.5 py-1 text-xs text-signal disabled:opacity-40"
            title="Ctrl/Cmd+S"
          >
            Save recipes
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
            onClick={requestNew}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70"
          >
            New
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={requestDuplicate}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70 disabled:opacity-40"
          >
            Duplicate
          </button>
          <button
            type="button"
            disabled={!selected || Object.keys(selected.inputs).length === 0}
            onClick={openFamily}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70 disabled:opacity-40"
            title="Copy and swap one ingredient"
          >
            Family…
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={handleDelete}
            className="rounded border border-red-500/30 px-2.5 py-1 text-xs text-red-300 disabled:opacity-40"
          >
            Delete
          </button>
          {pane === 'edit' && (
            <>
              <button
                type="button"
                disabled={selectedIndex <= 0}
                onClick={() => moveSelected(-1)}
                className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70 disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={selectedIndex < 0 || selectedIndex >= recipes.length - 1}
                onClick={() => moveSelected(1)}
                className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70 disabled:opacity-40"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickCompare(true);
                  report('Click a recipe in the list to compare');
                }}
                className={`rounded border px-2.5 py-1 text-xs ${
                  pickCompare ? 'border-signal/50 text-signal' : 'border-white/15 text-white/70'
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
            </>
          )}
          <button
            type="button"
            onClick={() => downloadRecipes(recipes)}
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

        {pane === 'overview' ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-concrete-900 text-2xs uppercase tracking-wider text-white/35">
                <tr>
                  <th className="px-3 py-2">{sortBtn('name', 'Recipe')}</th>
                  <th className="px-3 py-2">{sortBtn('place', 'Place')}</th>
                  <th className="px-3 py-2">{sortBtn('hours', 'Hours')}</th>
                  <th className="px-3 py-2">{sortBtn('inputs', 'In')}</th>
                  <th className="px-3 py-2">{sortBtn('deltaValue', 'Δ value')}</th>
                  <th className="px-3 py-2">{sortBtn('deltaWeight', 'Δ kg')}</th>
                  <th className="px-3 py-2">Warn</th>
                </tr>
              </thead>
              <tbody>
                {overviewRows.map(({ r, e, warns, inputCount }) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-white/5 hover:bg-white/5"
                    onClick={() => requestSelect(r.id)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-white/85">{r.name}</div>
                      <div className="font-mono text-2xs text-white/35">{r.id}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-white/55">
                      {r.needsShelter ? 'shelter' : 'field'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.hours}</td>
                    <td className="px-3 py-2 font-mono text-xs">{inputCount}</td>
                    <td
                      className={`px-3 py-2 font-mono text-xs ${
                        e.deltaValue > 0 ? 'text-amber-200' : 'text-white/70'
                      }`}
                    >
                      {signed(e.deltaValue)}
                    </td>
                    <td
                      className={`px-3 py-2 font-mono text-xs ${
                        e.deltaWeight > 0.05 ? 'text-amber-200' : 'text-white/70'
                      }`}
                    >
                      {signed(e.deltaWeight)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-red-300">
                      {warns || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : selected ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-5 lg:px-8">
            <div className={compareDef ? 'grid gap-6 lg:grid-cols-2' : undefined}>
              <div>
            <section className="mb-5 rounded-lg border border-white/10 bg-black/20 p-3">
              <h5 className="mb-2 text-2xs uppercase tracking-widest text-white/30">Combination</h5>
              <div className="flex flex-wrap items-center gap-2">
                {Object.entries(selected.inputs).map(([id, n]) => (
                  <ItemChip key={id} id={id} items={items} count={n} onOpen={onOpenItem} />
                ))}
                {Object.keys(selected.inputs).length === 0 && (
                  <span className="text-xs text-white/35">Add ingredients below</span>
                )}
                {selected.tool && (
                  <>
                    <span className="text-white/25">+</span>
                    <ItemChip id={selected.tool} items={items} suffix=" (tool)" onOpen={onOpenItem} />
                  </>
                )}
                <span className="text-white/25">→</span>
                <ItemChip
                  id={selected.outputDefId}
                  items={items}
                  count={selected.outputCount}
                  onOpen={onOpenItem}
                />
              </div>
            </section>

            {eco && (
              <section className="mb-5 rounded-lg border border-white/10 bg-black/20 p-3">
                <h5 className="mb-2 text-2xs uppercase tracking-widest text-white/30">Economy</h5>
                <EconomyStrip eco={eco} />
              </section>
            )}

            {warnings.length > 0 && (
              <ul className="mb-5 flex flex-col gap-1">
                {warnings.map((w) => (
                  <li
                    key={w.text}
                    className={`rounded border px-2 py-1 text-xs ${
                      w.level === 'warn'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                        : 'border-white/10 bg-white/5 text-white/55'
                    }`}
                  >
                    {w.text}
                  </li>
                ))}
              </ul>
            )}

            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Id">
                <input
                  className={inputClass + ' font-mono'}
                  value={selected.id}
                  disabled={!creating}
                  onChange={(e) => patch({ id: e.target.value })}
                />
              </Field>
              <Field label="Name">
                <input
                  className={inputClass}
                  value={selected.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </Field>
              <Field label="Hours">
                <Stepper
                  value={selected.hours}
                  min={0.25}
                  step={0.25}
                  onChange={(hours) => patch({ hours })}
                />
              </Field>
              <Field label="Bench">
                <button
                  type="button"
                  onClick={() => patch({ needsShelter: !selected.needsShelter })}
                  className={`rounded border px-2.5 py-1.5 text-sm ${
                    selected.needsShelter
                      ? 'border-signal/40 bg-signal/10 text-signal'
                      : 'border-white/10 text-white/70'
                  }`}
                >
                  {selected.needsShelter ? 'Shelter workbench' : 'Field craft'}
                </button>
              </Field>
            </div>

            <Field label="Blurb">
              <textarea
                rows={2}
                className={inputClass + ' mb-5 w-full resize-y'}
                value={selected.blurb}
                onChange={(e) => patch({ blurb: e.target.value })}
              />
            </Field>

            <div className="mb-5 grid gap-4 lg:grid-cols-2">
              <section>
                <h5 className="mb-2 text-2xs uppercase tracking-widest text-white/30">Output</h5>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <ItemChip
                    id={selected.outputDefId}
                    items={items}
                    count={selected.outputCount}
                    onOpen={onOpenItem}
                  />
                  <SourceBadges
                    flags={itemSourceFlags(selected.outputDefId, recipes, items)}
                  />
                  <Stepper
                    value={selected.outputCount}
                    min={1}
                    step={1}
                    onChange={(outputCount) => patch({ outputCount })}
                  />
                </div>
                <RecipeItemSearch
                  items={items}
                  exclude={new Set(Object.keys(selected.inputs))}
                  placeholder="change output item…"
                  onPick={(id) => {
                    if (selected.inputs[id] !== undefined) {
                      report(null, 'Output cannot also be an input');
                      return;
                    }
                    patch({ outputDefId: id });
                  }}
                />
              </section>
              <section>
                <h5 className="mb-2 text-2xs uppercase tracking-widest text-white/30">Tool (kept)</h5>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {selected.tool ? (
                    <>
                      <ItemChip
                        id={selected.tool}
                        items={items}
                        suffix=" (not consumed)"
                        onOpen={onOpenItem}
                      />
                      <SourceBadges flags={itemSourceFlags(selected.tool, recipes, items)} />
                    </>
                  ) : (
                    <span className="text-xs text-white/35">No tool required</span>
                  )}
                  {selected.tool && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...selected };
                        delete next.tool;
                        setRecipes(recipes.map((r) => (r.id === selected.id ? next : r)));
                      }}
                      className="rounded border border-white/15 px-2 py-1 text-2xs text-white/50"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <RecipeItemSearch
                  items={items}
                  exclude={new Set(Object.keys(selected.inputs))}
                  placeholder="require a tool…"
                  onPick={(id) => patch({ tool: id })}
                />
              </section>
            </div>

            <section className="mb-5">
              <h5 className="mb-2 text-2xs uppercase tracking-widest text-white/30">
                Ingredients (consumed)
              </h5>
              <ul className="mb-3 flex flex-col gap-1.5">
                {Object.entries(selected.inputs).map(([id, count]) => {
                  const def = defOf(items, id);
                  return (
                    <li
                      key={id}
                      className="flex flex-wrap items-center gap-2 rounded border border-white/5 bg-black/20 px-2 py-1.5"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/10 bg-black/40">
                        {def ? (
                          <Icon name={itemIcon(def)} size={18} />
                        ) : (
                          <span className="h-3 w-3 rounded-sm bg-white/20" />
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenItem?.(id)}
                        className="min-w-0 flex-1 truncate text-left text-sm text-white/80 hover:text-signal"
                      >
                        {itemName(items, id)}
                        <span className="ml-2 font-mono text-2xs text-white/35">{id}</span>
                      </button>
                      <SourceBadges flags={itemSourceFlags(id, recipes, items)} />
                      <Stepper value={count} min={1} step={1} onChange={(n) => setInputCount(id, n)} />
                      <button
                        type="button"
                        onClick={() => setInputCount(id, 0)}
                        className="rounded border border-red-500/30 px-2 py-0.5 text-2xs text-red-300"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
              <RecipeItemSearch
                items={items}
                exclude={excludeInputs}
                placeholder="add an ingredient…"
                onPick={addInput}
              />
            </section>

            <section className="mb-5 rounded-lg border border-white/15 bg-concrete-900/80 p-3">
              <h5 className="mb-2 text-2xs uppercase tracking-widest text-white/30">
                Can I make this?
              </h5>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSandboxShelter((v) => !v)}
                  className={`rounded border px-2 py-1 text-xs ${
                    sandboxShelter
                      ? 'border-signal/40 bg-signal/10 text-signal'
                      : 'border-white/10 text-white/50'
                  }`}
                >
                  {sandboxShelter ? 'Shelter' : 'No shelter'}
                </button>
                <button
                  type="button"
                  onClick={() => setSandboxHandyman((v) => !v)}
                  className={`rounded border px-2 py-1 text-xs ${
                    sandboxHandyman
                      ? 'border-signal/40 bg-signal/10 text-signal'
                      : 'border-white/10 text-white/50'
                  }`}
                >
                  {sandboxHandyman ? 'Handyman −1 mat' : 'No Handyman'}
                </button>
              </div>
              <ul className="mb-3 flex flex-col gap-1">
                {Object.keys(selected.inputs).map((id) => (
                  <li key={id} className="flex items-center gap-2 text-xs">
                    <span className="w-36 truncate text-white/60">{itemName(items, id)}</span>
                    <Stepper
                      value={sandboxPack[id] ?? 0}
                      min={0}
                      step={1}
                      onChange={(n) => setSandboxPack((p) => ({ ...p, [id]: n }))}
                    />
                    {sandboxResult && sandboxResult.adjusted[id] !== undefined && (
                      <span className="font-mono text-2xs text-white/35">
                        needs {sandboxResult.adjusted[id]}
                      </span>
                    )}
                  </li>
                ))}
                {selected.tool && (
                  <li className="flex items-center gap-2 text-xs">
                    <span className="w-36 truncate text-white/60">
                      {itemName(items, selected.tool)} (tool)
                    </span>
                    <Stepper
                      value={sandboxPack[selected.tool] ?? 0}
                      min={0}
                      step={1}
                      onChange={(n) =>
                        setSandboxPack((p) => ({ ...p, [selected.tool!]: n }))
                      }
                    />
                  </li>
                )}
              </ul>
              {sandboxResult && (
                <p
                  className={`text-xs ${
                    sandboxResult.check.ok ? 'text-signal' : 'text-red-300'
                  }`}
                >
                  {sandboxResult.check.ok
                    ? sandboxHandyman
                      ? `Ready. Handyman inputs: ${
                          Object.entries(sandboxResult.adjusted)
                            .map(([id, n]) => `${n}× ${itemName(items, id)}`)
                            .join(' · ') || 'free (all mats cut)'
                        }.`
                      : 'Ready to craft.'
                    : sandboxResult.check.reason}
                </p>
              )}
            </section>

            <section className="mb-5 rounded-lg border border-white/15 bg-concrete-900/80 p-3">
              <h5 className="mb-2 text-2xs uppercase tracking-widest text-white/30">
                Workbench preview
              </h5>
              <div className="flex items-start gap-2.5 rounded bg-white/5 px-2.5 py-2.5 text-xs">
                {defOf(items, selected.outputDefId) ? (
                  <Icon
                    name={itemIcon(defOf(items, selected.outputDefId)!)}
                    size={24}
                    className="mt-0.5 shrink-0"
                  />
                ) : (
                  <span className="mt-0.5 h-6 w-6 shrink-0 rounded bg-white/10" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug text-white">
                    {selected.name}
                    {selected.outputCount > 1 ? ` ×${selected.outputCount}` : ''}
                  </span>
                  <span className="mt-0.5 block truncate leading-snug text-white/35">
                    {Object.entries(selected.inputs)
                      .map(([id, n]) => `${n}× ${itemName(items, id)}`)
                      .join(' · ')}
                    {selected.tool ? ` · ${itemName(items, selected.tool)}` : ''}
                  </span>
                  <span className="mt-0.5 block truncate leading-snug text-white/35">
                    {selected.blurb}
                  </span>
                </span>
                <span className="shrink-0 pt-0.5 text-right tabular-nums text-white/50">
                  {selected.hours}h
                </span>
              </div>
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="mb-1 text-2xs uppercase tracking-widest text-white/30">
                  Repair (not a recipe)
                </p>
                <p className="text-xs leading-snug text-white/45">
                  Workbench: {REPAIR_INPUTS.duct_tape}× {itemName(items, 'duct_tape')} +{' '}
                  {REPAIR_INPUTS.scrap_metal}× {itemName(items, 'scrap_metal')} +{' '}
                  {itemName(items, REPAIR_TOOL)} → +{REPAIR_AMOUNT} condition, {REPAIR_HOURS}h.
                  Field:{' '}
                  {FIELD_REPAIRS.map((f) => `${itemName(items, f.defId)} +${f.amount}`).join(
                    ' · ',
                  )}
                  . Targets one worn item — do not recreate this as a craft.
                </p>
              </div>
            </section>

            <section>
              <h5 className="mb-2 text-2xs uppercase tracking-widest text-white/30">
                Chains & cousins
              </h5>
              {chains.madeBy.length === 0 &&
              chains.usedIn.length === 0 &&
              chains.cousins.length === 0 ? (
                <p className="text-xs text-white/35">
                  No other recipes share these items yet — a fresh combo.
                </p>
              ) : (
                <ul className="flex flex-col gap-1 text-xs text-white/60">
                  {chains.madeBy.map((r) => (
                    <li key={`m-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => requestSelect(r.id)}
                        className="rounded border border-white/5 bg-black/20 px-2 py-1 hover:border-signal/30"
                      >
                        Ingredient from · {r.name}
                      </button>
                    </li>
                  ))}
                  {chains.usedIn.map((r) => (
                    <li key={`u-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => requestSelect(r.id)}
                        className="rounded border border-white/5 bg-black/20 px-2 py-1 hover:border-signal/30"
                      >
                        Output feeds · {r.name}
                      </button>
                    </li>
                  ))}
                  {chains.cousins
                    .filter((r) => !chains.madeBy.includes(r) && !chains.usedIn.includes(r))
                    .map((r) => (
                      <li key={`c-${r.id}`}>
                        <button
                          type="button"
                          onClick={() => requestSelect(r.id)}
                          className="rounded border border-white/5 bg-black/20 px-2 py-1 hover:border-signal/30"
                        >
                          Shares kit · {r.name}
                          {r.outputDefId === selected.outputDefId ? ' (same output)' : ''}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </section>
              </div>
              {compareDef && (
                <div>
                  <h5 className="mb-3 text-2xs uppercase tracking-widest text-white/30">
                    Compare · {compareDef.id}
                  </h5>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-2xs text-white/35">Current</div>
                      <CompareCard recipe={selected} items={items} />
                    </div>
                    <div>
                      <div className="mb-1 text-2xs text-white/35">Other</div>
                      <CompareCard recipe={compareDef} items={items} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="p-6 text-sm text-white/40">No recipe selected. New starts a combo.</p>
        )}
      </div>

      {pendingNav && !diffOpen && (
        <div className="absolute inset-0 z-[2100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-concrete-900 p-5">
            <h4 className="mb-2 text-base font-bold text-signal">Unsaved recipe edits</h4>
            <p className="mb-4 text-sm text-white/60">
              Save the catalog, discard this recipe&apos;s changes, or cancel.
            </p>
            <div className="flex justify-end gap-2">
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
                onClick={() => void resolvePending('save')}
                className="rounded border border-signal/40 px-3 py-1.5 text-xs text-signal"
              >
                Save…
              </button>
            </div>
          </div>
        </div>
      )}

      {familyOpen && selected && (
        <div className="absolute inset-0 z-[2100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-concrete-900 p-5">
            <h4 className="mb-2 text-base font-bold text-signal">Family copy</h4>
            <p className="mb-3 text-xs text-white/50">
              Duplicate this recipe and swap one ingredient — how the spear variants work.
            </p>
            <Field label="Swap this input">
              <select
                className={inputClass + ' mb-3'}
                value={familyFrom}
                onChange={(e) => setFamilyFrom(e.target.value)}
              >
                {Object.keys(selected.inputs).map((id) => (
                  <option key={id} value={id}>
                    {itemName(items, id)} ({id})
                  </option>
                ))}
              </select>
            </Field>
            <div className="mb-3">
              <span className="mb-1 block text-xs uppercase tracking-wider text-white/35">
                For this item
              </span>
              {familyTo && (
                <div className="mb-2">
                  <ItemChip id={familyTo} items={items} />
                </div>
              )}
              <RecipeItemSearch
                items={items}
                exclude={new Set([familyFrom, selected.outputDefId])}
                placeholder="replacement item…"
                onPick={setFamilyTo}
              />
            </div>
            <label className="mb-3 flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={familyChangeOut}
                onChange={(e) => setFamilyChangeOut(e.target.checked)}
              />
              Also change output
            </label>
            {familyChangeOut && (
              <div className="mb-3">
                <RecipeItemSearch
                  items={items}
                  placeholder="new output…"
                  onPick={setFamilyOut}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFamilyOpen(false)}
                className="rounded border border-white/15 px-3 py-1.5 text-xs text-white/70"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!familyFrom || !familyTo}
                onClick={applyFamily}
                className="rounded border border-signal/40 px-3 py-1.5 text-xs text-signal disabled:opacity-40"
              >
                Create copy
              </button>
            </div>
          </div>
        </div>
      )}

      {diffOpen && pendingDiff && (
        <div className="absolute inset-0 z-[2100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-concrete-900 p-5">
            <h4 className="mb-2 text-base font-bold text-signal">Review recipe changes</h4>
            <div className="mb-4 max-h-72 overflow-y-auto text-xs text-white/65">
              {recipeDiffEmpty(pendingDiff) ? (
                <p>No changes detected.</p>
              ) : (
                <ul className="flex flex-col gap-1 font-mono">
                  {pendingDiff.added.map((id) => (
                    <li key={`a-${id}`}>
                      <span className="text-signal">+</span> {id}
                    </li>
                  ))}
                  {pendingDiff.removed.map((id) => (
                    <li key={`r-${id}`}>
                      <span className="text-red-300">−</span> {id}
                    </li>
                  ))}
                  {pendingDiff.changed.map((c) => (
                    <li key={`c-${c.id}`}>
                      <span className="text-amber-200">~</span> {c.id}: {c.fields.join(', ')}
                    </li>
                  ))}
                  {pendingDiff.orderChanged && (
                    <li>
                      <span className="text-amber-200">~</span> list order
                    </li>
                  )}
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
              Wrote <span className="font-mono text-white/80">src/game/data/recipes.json</span>.
              Refresh the page for changes to take effect in the live workbench.
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
