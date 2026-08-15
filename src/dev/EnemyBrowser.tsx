import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Enemy } from '../game/types';
import type {
  EliteArchetype,
  EliteId,
  EnemiesCatalog,
  FactionKey,
  HumanFactionEntry,
  HumanScaling,
  IntRange,
  LonerArchetype,
  LonerKind,
  ZombieArchetype,
} from '../game/enemies';
import {
  ELITE_IDS,
  FACTION_KEYS,
  HUMAN_SCALING_KEYS,
  LONER_KINDS,
  resolveHuman,
} from '../game/enemies';
import {
  estimateThreat,
  expectedElite,
  expectedFromScaling,
  expectedHuman,
  expectedLoner,
  expectedZombie,
  whereUsedNotes,
  type OverviewRow,
  type OverviewSortKey,
} from './enemyBalance';
import {
  downloadEnemiesCatalog,
  fetchEnemiesCatalog,
  parseImportedEnemies,
  saveEnemiesCatalog,
} from './enemyApi';
import { diffEnemiesCatalogs, enemiesFingerprint, enemyDiffIsEmpty, type EnemyDiff } from './enemyDiff';
import { previewEncounter, type PreviewKind } from './enemySim';
import { OPEN_ENEMY_EVENT, openLootItem, type OpenEnemyDetail } from './devBridge';
import { EnemyOverview } from './EnemyOverview';
import { fetchItemsCatalog } from './lootApi';
import { validateEnemiesCatalog } from './validateEnemies';

type EnemyTab = 'overview' | 'zombies' | 'humans' | 'spawn';
type HumanSel =
  | { t: 'defaults' }
  | { t: 'faction'; id: FactionKey }
  | { t: 'loner'; id: LonerKind };
type ZombieSel = { t: 'tier'; id: string } | { t: 'elite'; id: EliteId };
type CompareTarget =
  | { t: 'zombie'; id: string }
  | { t: 'elite'; id: EliteId }
  | { t: 'faction'; id: FactionKey }
  | { t: 'loner'; id: LonerKind }
  | null;

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

function NumField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-xs text-white/55">
      <span>{label}</span>
      <input
        type="number"
        className="rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-sm text-white"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: IntRange;
  onChange: (r: IntRange) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 text-xs text-white/55">
      <span>{label}</span>
      <div className="flex gap-2">
        <input
          type="number"
          className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-sm text-white"
          value={value[0]}
          onChange={(e) => onChange([Number(e.target.value), value[1]])}
        />
        <input
          type="number"
          className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-sm text-white"
          value={value[1]}
          onChange={(e) => onChange([value[0], Number(e.target.value)])}
        />
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-xs text-white/55">
      <span>{label}</span>
      <input
        type="text"
        className="rounded border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

function DropPoolEditor({
  drops,
  itemIds,
  onChange,
}: {
  drops: string[];
  itemIds: string[];
  onChange: (next: string[]) => void;
}) {
  const available = itemIds.filter((id) => !drops.includes(id));
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-white/45">
        Drop pool <span className="font-normal normal-case text-white/30">(click → Loot)</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {drops.length === 0 && <span className="text-xs text-white/35">No drops</span>}
        {drops.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded border border-white/15 bg-black/30 px-2 py-0.5 font-mono text-xs text-signal"
          >
            <button
              type="button"
              className="hover:underline"
              onClick={() => openLootItem(id)}
              title="Open in Loot editor"
            >
              {id}
            </button>
            <button
              type="button"
              className="text-white/40 hover:text-red-300"
              onClick={() => onChange(drops.filter((d) => d !== id))}
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <select
        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white"
        value=""
        onChange={(e) => {
          const id = e.target.value;
          if (id) onChange([...drops, id]);
        }}
      >
        <option value="">Add item…</option>
        {available.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </div>
  );
}

function DerivedCard({
  label,
  enemy,
  danger,
}: {
  label: string;
  enemy: Enemy;
  danger?: number;
}) {
  const t = estimateThreat(enemy);
  return (
    <div className="rounded border border-white/10 bg-black/25 p-3 text-xs">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-semibold text-signal">{label}</span>
        {danger !== undefined && (
          <span className="font-mono text-white/35">danger {danger}</span>
        )}
      </div>
      <div className="mb-1 font-semibold text-white">{enemy.name}</div>
      <dl className="grid grid-cols-4 gap-x-2 gap-y-1 font-mono text-white/65">
        <dt className="text-white/35">HP</dt>
        <dd>{enemy.hp}</dd>
        <dt className="text-white/35">Atk</dt>
        <dd>{enemy.attack}</dd>
        <dt className="text-white/35">Def</dt>
        <dd>{enemy.defense}</dd>
        <dt className="text-white/35">Dmg</dt>
        <dd>{enemy.damage}</dd>
        <dt className="text-white/35">Arm</dt>
        <dd>{enemy.armor}</dd>
        <dt className="text-white/35">Spd</dt>
        <dd>{enemy.speed}</dd>
        <dt className="text-white/35">Inf</dt>
        <dd>{enemy.infectious}</dd>
        <dt className="text-white/35">Threat</dt>
        <dd className="text-signal">{t.threat}</dd>
        <dt className="text-white/35">→Kill</dt>
        <dd className="text-emerald-300/90">{t.toKill}</dd>
        <dt className="text-white/35">→Die</dt>
        <dd className="text-amber-300/90">{t.toDie}</dd>
      </dl>
    </div>
  );
}

function WhereUsed({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/35">
        Where used
      </div>
      <ul className="list-inside list-disc space-y-0.5">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

function HumanScalingFields({
  value,
  onChange,
}: {
  value: HumanScaling;
  onChange: (patch: Partial<HumanScaling>) => void;
}) {
  return (
    <StatGrid>
      <NumField label="Base HP" value={value.baseHp} onChange={(baseHp) => onChange({ baseHp })} />
      <NumField
        label="HP / danger"
        value={value.hpPerDanger}
        onChange={(hpPerDanger) => onChange({ hpPerDanger })}
      />
      <RangeField
        label="HP jitter"
        value={value.hpJitter}
        onChange={(hpJitter) => onChange({ hpJitter })}
      />
      <NumField
        label="Base attack"
        value={value.baseAttack}
        onChange={(baseAttack) => onChange({ baseAttack })}
      />
      <NumField
        label="Atk ÷ danger"
        value={value.attackPerDangerDiv}
        min={1}
        onChange={(attackPerDangerDiv) => onChange({ attackPerDangerDiv })}
      />
      <RangeField
        label="Attack jitter"
        value={value.attackJitter}
        onChange={(attackJitter) => onChange({ attackJitter })}
      />
      <NumField
        label="Base defense"
        value={value.baseDefense}
        onChange={(baseDefense) => onChange({ baseDefense })}
      />
      <NumField
        label="Def ÷ danger"
        value={value.defensePerDangerDiv}
        min={1}
        onChange={(defensePerDangerDiv) => onChange({ defensePerDangerDiv })}
      />
      <NumField
        label="Base damage"
        value={value.baseDamage}
        onChange={(baseDamage) => onChange({ baseDamage })}
      />
      <NumField
        label="Dmg × danger"
        value={value.damagePerDanger}
        onChange={(damagePerDanger) => onChange({ damagePerDanger })}
      />
      <RangeField
        label="Damage jitter"
        value={value.damageJitter}
        onChange={(damageJitter) => onChange({ damageJitter })}
      />
      <NumField
        label="Base speed"
        value={value.baseSpeed}
        onChange={(baseSpeed) => onChange({ baseSpeed })}
      />
    </StatGrid>
  );
}

function blankZombie(id: string): ZombieArchetype {
  return {
    id,
    name: 'New Zombie',
    hp: 30,
    attack: 1,
    defense: 1,
    damage: 8,
    infectious: 0.3,
    armor: 0,
    speed: 7,
    hpJitter: [-4, 6],
  };
}

function entryFingerprint(catalog: EnemiesCatalog | null, sel: ZombieSel | HumanSel | null): string {
  if (!catalog || !sel) return '';
  if (sel.t === 'tier') {
    return JSON.stringify(catalog.zombies.find((z) => z.id === sel.id) ?? null);
  }
  if (sel.t === 'elite') return JSON.stringify(catalog.elites[sel.id] ?? null);
  if (sel.t === 'defaults') return JSON.stringify(catalog.humanDefaults);
  if (sel.t === 'faction') return JSON.stringify(catalog.humans[sel.id] ?? null);
  return JSON.stringify(catalog.loners[sel.id] ?? null);
}

function enemyForCompare(
  catalog: EnemiesCatalog,
  target: NonNullable<CompareTarget>,
  danger: number,
): Enemy {
  if (target.t === 'zombie') {
    const z = catalog.zombies.find((x) => x.id === target.id);
    return z ? expectedZombie(z) : expectedZombie(catalog.zombies[0]!);
  }
  if (target.t === 'elite') return expectedElite(catalog.elites[target.id], danger);
  if (target.t === 'faction') return expectedHuman(resolveHuman(catalog, target.id), danger);
  return expectedLoner(catalog.loners[target.id], danger);
}

/**
 * DEV-only floating enemy / encounter-kit browser.
 * Persists to `src/game/data/enemies.json` via `/__dev/enemies`.
 */
export function DevEnemyBrowser() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<EnemyTab>('overview');
  const [catalog, setCatalog] = useState<EnemiesCatalog | null>(null);
  const [baseline, setBaseline] = useState('');
  const [baselineCatalog, setBaselineCatalog] = useState<EnemiesCatalog | null>(null);
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [zombieSel, setZombieSel] = useState<ZombieSel | null>(null);
  const [humanSel, setHumanSel] = useState<HumanSel | null>(null);
  const [compare, setCompare] = useState<CompareTarget>(null);
  const [pickCompare, setPickCompare] = useState(false);
  const [formDanger, setFormDanger] = useState(3);
  const [overviewDanger, setOverviewDanger] = useState(3);
  const [sortKey, setSortKey] = useState<OverviewSortKey>('threat');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [kindFilter, setKindFilter] = useState<'all' | OverviewRow['kind']>('all');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<EnemyDiff | null>(null);
  const [saveSuccessOpen, setSaveSuccessOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [previewKind, setPreviewKind] = useState<PreviewKind>({ t: 'zombie' });
  const [previewSeed, setPreviewSeed] = useState('preview');
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = catalog && baseline ? enemiesFingerprint(catalog) !== baseline : false;
  const validationErrors = useMemo(
    () => (catalog ? validateEnemiesCatalog(catalog, new Set(itemIds)) : []),
    [catalog, itemIds],
  );
  const valid = validationErrors.length === 0;

  const activeSel: ZombieSel | HumanSel | null =
    tab === 'zombies' ? zombieSel : tab === 'humans' ? humanSel : null;
  const entryDirty =
    !!catalog &&
    !!baselineCatalog &&
    !!activeSel &&
    entryFingerprint(catalog, activeSel) !== entryFingerprint(baselineCatalog, activeSel);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const [data, items] = await Promise.all([fetchEnemiesCatalog(), fetchItemsCatalog()]);
      setCatalog(data);
      setBaselineCatalog(structuredClone(data));
      setBaseline(enemiesFingerprint(data));
      setItemIds(Object.keys(items).sort());
      setZombieSel(
        data.zombies[0] ? { t: 'tier', id: data.zombies[0].id } : { t: 'elite', id: 'block_hunter' },
      );
      setHumanSel({ t: 'defaults' });
      setStatus('Loaded encounter kit');
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
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenEnemyDetail>).detail ?? {};
      setOpen(true);
      if (detail.tab) setTab(detail.tab);
      if (detail.zombieId) {
        setTab('zombies');
        setZombieSel({ t: 'tier', id: detail.zombieId });
      }
      if (detail.eliteId) {
        setTab('zombies');
        setZombieSel({ t: 'elite', id: detail.eliteId as EliteId });
      }
      if (detail.factionId) {
        setTab('humans');
        setHumanSel({ t: 'faction', id: detail.factionId as FactionKey });
      }
      if (detail.lonerId) {
        setTab('humans');
        setHumanSel({ t: 'loner', id: detail.lonerId as LonerKind });
      }
    };
    window.addEventListener(OPEN_ENEMY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ENEMY_EVENT, onOpen);
  }, []);

  const listIds = useMemo(() => {
    if (!catalog) return [] as string[];
    if (tab === 'zombies') {
      return [
        ...catalog.zombies.map((z) => `tier:${z.id}`),
        ...ELITE_IDS.map((id) => `elite:${id}`),
      ];
    }
    if (tab === 'humans') {
      return [
        'defaults',
        ...FACTION_KEYS.map((id) => `faction:${id}`),
        ...LONER_KINDS.map((id) => `loner:${id}`),
      ];
    }
    return [];
  }, [catalog, tab]);

  const selectedListKey = useMemo(() => {
    if (tab === 'zombies' && zombieSel) {
      return zombieSel.t === 'tier' ? `tier:${zombieSel.id}` : `elite:${zombieSel.id}`;
    }
    if (tab === 'humans' && humanSel) {
      if (humanSel.t === 'defaults') return 'defaults';
      return humanSel.t === 'faction' ? `faction:${humanSel.id}` : `loner:${humanSel.id}`;
    }
    return null;
  }, [tab, zombieSel, humanSel]);

  const applyListKey = (key: string) => {
    if (key === 'defaults') {
      setHumanSel({ t: 'defaults' });
      return;
    }
    if (key.startsWith('tier:')) setZombieSel({ t: 'tier', id: key.slice(5) });
    else if (key.startsWith('elite:')) setZombieSel({ t: 'elite', id: key.slice(6) as EliteId });
    else if (key.startsWith('faction:')) {
      setHumanSel({ t: 'faction', id: key.slice(8) as FactionKey });
    } else if (key.startsWith('loner:')) {
      setHumanSel({ t: 'loner', id: key.slice(6) as LonerKind });
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void requestSave();
        return;
      }
      if (e.key === 'Escape') {
        if (diffOpen) {
          setDiffOpen(false);
          setPendingDiff(null);
        } else if (saveSuccessOpen) setSaveSuccessOpen(false);
        else if (confirmClose) setConfirmClose(false);
        else if (pickCompare) setPickCompare(false);
        else if (dirty) setConfirmClose(true);
        else setOpen(false);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (tab !== 'zombies' && tab !== 'humans') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!listIds.length) return;
      e.preventDefault();
      const idx = selectedListKey ? listIds.indexOf(selectedListKey) : -1;
      const next =
        e.key === 'ArrowDown'
          ? listIds[Math.min(listIds.length - 1, Math.max(0, idx + 1))]!
          : listIds[Math.max(0, idx <= 0 ? 0 : idx - 1)]!;
      applyListKey(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    dirty,
    diffOpen,
    saveSuccessOpen,
    confirmClose,
    pickCompare,
    catalog,
    tab,
    listIds,
    selectedListKey,
  ]);

  const requestSave = async () => {
    if (!catalog || !baselineCatalog || !valid || busy) return;
    const diff = diffEnemiesCatalogs(baselineCatalog, catalog);
    if (enemyDiffIsEmpty(diff)) {
      setStatus('No changes to save');
      return;
    }
    setPendingDiff(diff);
    setDiffOpen(true);
  };

  const confirmSave = async () => {
    if (!catalog) return;
    setBusy(true);
    setError(null);
    try {
      await saveEnemiesCatalog(catalog, new Set(itemIds));
      setBaselineCatalog(structuredClone(catalog));
      setBaseline(enemiesFingerprint(catalog));
      setDiffOpen(false);
      setPendingDiff(null);
      setSaveSuccessOpen(true);
      setStatus('Saved enemies.json — reload to apply in live combat');
    } catch (err) {
      setError(String(err));
      setDiffOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const revertAll = () => {
    if (!baselineCatalog) return;
    setCatalog(structuredClone(baselineCatalog));
    setError(null);
    setStatus('Reverted to last saved');
  };

  const revertEntry = () => {
    if (!catalog || !baselineCatalog || !activeSel) return;
    if (activeSel.t === 'tier') {
      const base = baselineCatalog.zombies.find((z) => z.id === activeSel.id);
      if (!base) return;
      setCatalog({
        ...catalog,
        zombies: catalog.zombies.map((z) =>
          z.id === activeSel.id ? structuredClone(base) : z,
        ),
      });
    } else if (activeSel.t === 'elite') {
      setCatalog({
        ...catalog,
        elites: {
          ...catalog.elites,
          [activeSel.id]: structuredClone(baselineCatalog.elites[activeSel.id]),
        },
      });
    } else if (activeSel.t === 'defaults') {
      setCatalog({
        ...catalog,
        humanDefaults: structuredClone(baselineCatalog.humanDefaults),
      });
    } else if (activeSel.t === 'faction') {
      setCatalog({
        ...catalog,
        humans: {
          ...catalog.humans,
          [activeSel.id]: structuredClone(baselineCatalog.humans[activeSel.id]),
        },
      });
    } else {
      setCatalog({
        ...catalog,
        loners: {
          ...catalog.loners,
          [activeSel.id]: structuredClone(baselineCatalog.loners[activeSel.id]),
        },
      });
    }
    setStatus('Reverted entry');
  };

  const updateZombie = (id: string, patch: Partial<ZombieArchetype>) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        zombies: prev.zombies.map((z) => (z.id === id ? { ...z, ...patch, id: z.id } : z)),
      };
    });
  };

  const updateElite = (id: EliteId, patch: Partial<EliteArchetype>) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        elites: { ...prev.elites, [id]: { ...prev.elites[id], ...patch, id } },
      };
    });
  };

  const updateHumanDefaults = (patch: Partial<HumanScaling>) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      return { ...prev, humanDefaults: { ...prev.humanDefaults, ...patch } };
    });
  };

  const updateHuman = (id: FactionKey, patch: Partial<HumanFactionEntry>) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        humans: { ...prev.humans, [id]: { ...prev.humans[id], ...patch } },
      };
    });
  };

  const clearHumanOverrides = (id: FactionKey) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      const { name, armor, drops } = prev.humans[id];
      return { ...prev, humans: { ...prev.humans, [id]: { name, armor, drops } } };
    });
  };

  const updateLoner = (id: LonerKind, patch: Partial<LonerArchetype>) => {
    setCatalog((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        loners: { ...prev.loners, [id]: { ...prev.loners[id], ...patch } },
      };
    });
  };

  const addZombie = () => {
    if (!catalog) return;
    let n = 1;
    let id = `zombie_${n}`;
    while (catalog.zombies.some((z) => z.id === id)) {
      n += 1;
      id = `zombie_${n}`;
    }
    const z = blankZombie(id);
    setCatalog({ ...catalog, zombies: [...catalog.zombies, z] });
    setZombieSel({ t: 'tier', id });
  };

  const removeZombie = (id: string) => {
    if (!catalog || catalog.zombies.length <= 1) return;
    const next = catalog.zombies.filter((z) => z.id !== id);
    setCatalog({ ...catalog, zombies: next });
    if (zombieSel?.t === 'tier' && zombieSel.id === id) {
      setZombieSel(next[0] ? { t: 'tier', id: next[0].id } : { t: 'elite', id: 'block_hunter' });
    }
  };

  const moveZombie = (from: number, to: number) => {
    if (!catalog || from === to || to < 0 || to >= catalog.zombies.length) return;
    const zombies = [...catalog.zombies];
    const [row] = zombies.splice(from, 1);
    if (!row) return;
    zombies.splice(to, 0, row);
    setCatalog({ ...catalog, zombies });
  };

  const onSort = (key: OverviewSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'kind' ? 'asc' : 'desc');
    }
  };

  const openOverviewRow = (row: OverviewRow) => {
    setTab(row.nav.tab);
    if (row.nav.tab === 'zombies') setZombieSel(row.nav.sel);
    else setHumanSel(row.nav.sel);
  };

  const trySelectZombie = (sel: ZombieSel) => {
    if (pickCompare) {
      setCompare(sel.t === 'tier' ? { t: 'zombie', id: sel.id } : { t: 'elite', id: sel.id });
      setPickCompare(false);
      setStatus('Compare target set');
      return;
    }
    setZombieSel(sel);
  };

  const trySelectHuman = (sel: HumanSel) => {
    if (pickCompare && sel.t !== 'defaults') {
      setCompare(
        sel.t === 'faction' ? { t: 'faction', id: sel.id } : { t: 'loner', id: sel.id },
      );
      setPickCompare(false);
      setStatus('Compare target set');
      return;
    }
    setHumanSel(sel);
  };

  const previews = useMemo(() => {
    if (!catalog) return [];
    return [1, 2, 3, 4, 5].map((danger) => ({
      danger,
      enemy: previewEncounter(catalog, previewKind, danger, `${previewSeed}:${danger}`),
    }));
  }, [catalog, previewKind, previewSeed]);

  const primaryDerived = useMemo(() => {
    if (!catalog) return null;
    if (tab === 'zombies' && zombieSel?.t === 'tier') {
      const z = catalog.zombies.find((x) => x.id === zombieSel.id);
      return z ? { label: 'Expected (mid jitter)', enemy: expectedZombie(z) } : null;
    }
    if (tab === 'zombies' && zombieSel?.t === 'elite') {
      return {
        label: `Expected @ danger ${formDanger}`,
        enemy: expectedElite(catalog.elites[zombieSel.id], formDanger),
        danger: formDanger,
      };
    }
    if (tab === 'humans' && humanSel?.t === 'defaults') {
      return {
        label: `Defaults @ danger ${formDanger} (armor 0)`,
        enemy: expectedFromScaling(catalog.humanDefaults, formDanger),
        danger: formDanger,
      };
    }
    if (tab === 'humans' && humanSel?.t === 'faction') {
      return {
        label: `Expected @ danger ${formDanger}`,
        enemy: expectedHuman(resolveHuman(catalog, humanSel.id), formDanger),
        danger: formDanger,
      };
    }
    if (tab === 'humans' && humanSel?.t === 'loner') {
      return {
        label: `Expected @ danger ${formDanger}`,
        enemy: expectedLoner(catalog.loners[humanSel.id], formDanger),
        danger: formDanger,
      };
    }
    return null;
  }, [catalog, tab, zombieSel, humanSel, formDanger]);

  const compareEnemy =
    catalog && compare ? enemyForCompare(catalog, compare, formDanger) : null;

  const whereNotes = useMemo(() => {
    if (!catalog || !activeSel) return [];
    return whereUsedNotes(catalog, activeSel);
  }, [catalog, activeSel]);

  if (!open) {
    return (
      <button
        type="button"
        className="fixed bottom-14 left-3 z-[2000] rounded border border-signal/40 bg-concrete-900/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-signal shadow-lg hover:bg-concrete-800"
        onClick={() => setOpen(true)}
      >
        Enemies
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col overflow-hidden bg-concrete-900">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
        <h2 className="mr-2 text-sm font-bold uppercase tracking-widest text-signal">
          Encounter kit
        </h2>
        <div className="flex rounded border border-white/10 text-xs">
          {(['overview', 'zombies', 'humans', 'spawn'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`px-3 py-1.5 capitalize ${
                tab === t ? 'bg-signal/20 text-signal' : 'text-white/55 hover:text-white'
              }`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {dirty && (
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
            Dirty
          </span>
        )}
        {entryDirty && (
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase text-amber-200/80">
            Entry dirty
          </span>
        )}
        {!valid && (
          <span className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-300">
            {validationErrors.length} errors
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {(tab === 'zombies' || tab === 'humans') && (
            <>
              <button
                type="button"
                className={`rounded border px-2 py-1 text-xs ${
                  pickCompare
                    ? 'border-signal text-signal'
                    : 'border-white/15 text-white/70 hover:bg-white/5'
                }`}
                onClick={() => {
                  setPickCompare((p) => !p);
                  setStatus(
                    pickCompare
                      ? null
                      : 'Click another entry to compare',
                  );
                }}
              >
                {pickCompare ? 'Picking…' : 'Compare'}
              </button>
              {compare && (
                <button
                  type="button"
                  className="rounded border border-white/15 px-2 py-1 text-xs text-white/50 hover:bg-white/5"
                  onClick={() => setCompare(null)}
                >
                  Clear compare
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="rounded border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
            disabled={!entryDirty}
            onClick={revertEntry}
          >
            Revert entry
          </button>
          <button
            type="button"
            className="rounded border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
            disabled={!dirty || busy}
            onClick={revertAll}
          >
            Revert all
          </button>
          <button
            type="button"
            className="rounded border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
            onClick={() => catalog && downloadEnemiesCatalog(catalog)}
          >
            Export
          </button>
          <button
            type="button"
            className="rounded border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
            onClick={() => fileRef.current?.click()}
          >
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const text = await file.text();
                const next = parseImportedEnemies(text, new Set(itemIds));
                setCatalog(next);
                setStatus(`Imported ${file.name} into draft`);
              } catch (err) {
                setError(String(err));
              }
            }}
          />
          <button
            type="button"
            className="rounded bg-signal px-3 py-1 text-xs font-bold uppercase tracking-wider text-concrete-950 disabled:opacity-40"
            disabled={!dirty || !valid || busy}
            onClick={() => void requestSave()}
          >
            Save
          </button>
          <button
            type="button"
            className="rounded border border-white/20 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
            onClick={() => (dirty ? setConfirmClose(true) : setOpen(false))}
          >
            Close
          </button>
        </div>
      </header>

      {(status || error) && (
        <div
          className={`border-b px-4 py-1.5 text-xs ${
            error ? 'border-red-500/30 bg-red-950/40 text-red-200' : 'border-white/5 text-white/50'
          }`}
        >
          {error ?? status}
        </div>
      )}

      {!valid && validationErrors.length > 0 && (
        <div className="max-h-24 overflow-y-auto border-b border-red-500/20 bg-red-950/20 px-4 py-2 font-mono text-[11px] text-red-200/90">
          {validationErrors.slice(0, 12).map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {!catalog ? (
          <div className="flex flex-1 items-center justify-center text-sm text-white/40">
            {busy ? 'Loading…' : 'No catalog'}
          </div>
        ) : tab === 'overview' ? (
          <EnemyOverview
            catalog={catalog}
            danger={overviewDanger}
            onDangerChange={setOverviewDanger}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            kindFilter={kindFilter}
            onKindFilter={setKindFilter}
            onOpenRow={openOverviewRow}
          />
        ) : tab === 'zombies' ? (
          <>
            <aside className="flex w-56 shrink-0 flex-col border-r border-white/10">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Tiers
                </span>
                <button type="button" className="text-xs text-signal hover:underline" onClick={addZombie}>
                  + Add
                </button>
              </div>
              <ul className="flex-1 overflow-y-auto p-1">
                {catalog.zombies.map((z, i) => (
                  <li key={z.id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex !== null) moveZombie(dragIndex, i);
                        setDragIndex(null);
                      }}
                      onDragEnd={() => setDragIndex(null)}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                        zombieSel?.t === 'tier' && zombieSel.id === z.id
                          ? 'bg-signal/15 text-signal'
                          : 'text-white/70 hover:bg-white/5'
                      }`}
                      onClick={() => trySelectZombie({ t: 'tier', id: z.id })}
                    >
                      <span className="w-4 font-mono text-[10px] text-white/30">{i + 1}</span>
                      <span className="truncate">{z.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
                Elites
              </div>
              <ul className="p-1 pb-3">
                {ELITE_IDS.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                        zombieSel?.t === 'elite' && zombieSel.id === id
                          ? 'bg-signal/15 text-signal'
                          : 'text-white/70 hover:bg-white/5'
                      }`}
                      onClick={() => trySelectZombie({ t: 'elite', id })}
                    >
                      {catalog.elites[id].name}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
            <main className="flex-1 overflow-y-auto p-4">
              <div className={`mx-auto max-w-5xl space-y-4 ${compareEnemy ? 'lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0' : ''}`}>
                <div className="space-y-4">
                  {zombieSel?.t === 'tier' &&
                    (() => {
                      const z = catalog.zombies.find((x) => x.id === zombieSel.id);
                      if (!z) return null;
                      return (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-mono text-xs text-white/35">{z.id}</div>
                              <h3 className="text-lg font-semibold text-white">{z.name}</h3>
                            </div>
                            <button
                              type="button"
                              className="text-xs text-red-300/80 hover:underline disabled:opacity-30"
                              disabled={catalog.zombies.length <= 1}
                              onClick={() => removeZombie(z.id)}
                            >
                              Remove tier
                            </button>
                          </div>
                          <WhereUsed notes={whereNotes} />
                          <TextField label="Name" value={z.name} onChange={(name) => updateZombie(z.id, { name })} />
                          <StatGrid>
                            <NumField label="HP" value={z.hp} onChange={(hp) => updateZombie(z.id, { hp })} />
                            <NumField label="Attack" value={z.attack} onChange={(attack) => updateZombie(z.id, { attack })} />
                            <NumField label="Defense" value={z.defense} onChange={(defense) => updateZombie(z.id, { defense })} />
                            <NumField label="Damage" value={z.damage} onChange={(damage) => updateZombie(z.id, { damage })} />
                            <NumField label="Infectious" value={z.infectious} step={0.05} min={0} max={1} onChange={(infectious) => updateZombie(z.id, { infectious })} />
                            <NumField label="Armor" value={z.armor} onChange={(armor) => updateZombie(z.id, { armor })} />
                            <NumField label="Speed" value={z.speed} onChange={(speed) => updateZombie(z.id, { speed })} />
                            <RangeField label="HP jitter" value={z.hpJitter} onChange={(hpJitter) => updateZombie(z.id, { hpJitter })} />
                          </StatGrid>
                        </>
                      );
                    })()}
                  {zombieSel?.t === 'elite' &&
                    (() => {
                      const e = catalog.elites[zombieSel.id];
                      return (
                        <>
                          <div className="font-mono text-xs text-white/35">{e.id}</div>
                          <h3 className="text-lg font-semibold text-white">{e.name}</h3>
                          <WhereUsed notes={whereNotes} />
                          <label className="flex flex-col gap-0.5 text-xs text-white/55">
                            <span>Preview danger</span>
                            <input
                              type="range"
                              min={1}
                              max={5}
                              value={formDanger}
                              onChange={(ev) => setFormDanger(Number(ev.target.value))}
                            />
                          </label>
                          <TextField label="Name" value={e.name} onChange={(name) => updateElite(e.id, { name })} />
                          <StatGrid>
                            <NumField label="HP" value={e.hp} onChange={(hp) => updateElite(e.id, { hp })} />
                            <NumField label="HP / danger" value={e.hpPerDanger} onChange={(hpPerDanger) => updateElite(e.id, { hpPerDanger })} />
                            <NumField label="Attack" value={e.attack} onChange={(attack) => updateElite(e.id, { attack })} />
                            <NumField label="Defense" value={e.defense} onChange={(defense) => updateElite(e.id, { defense })} />
                            <NumField label="Damage" value={e.damage} onChange={(damage) => updateElite(e.id, { damage })} />
                            <NumField label="Infectious" value={e.infectious} step={0.05} min={0} max={1} onChange={(infectious) => updateElite(e.id, { infectious })} />
                            <NumField label="Armor" value={e.armor} onChange={(armor) => updateElite(e.id, { armor })} />
                            <NumField label="Speed" value={e.speed} onChange={(speed) => updateElite(e.id, { speed })} />
                            <RangeField label="HP jitter" value={e.hpJitter} onChange={(hpJitter) => updateElite(e.id, { hpJitter })} />
                          </StatGrid>
                        </>
                      );
                    })()}
                  {primaryDerived && (
                    <DerivedCard
                      label={primaryDerived.label}
                      enemy={primaryDerived.enemy}
                      danger={primaryDerived.danger}
                    />
                  )}
                </div>
                {compareEnemy && (
                  <DerivedCard
                    label={`Compare · ${compareEnemy.name}`}
                    enemy={compareEnemy}
                    danger={compare?.t === 'zombie' ? undefined : formDanger}
                  />
                )}
              </div>
            </main>
          </>
        ) : tab === 'humans' ? (
          <>
            <aside className="flex w-56 shrink-0 flex-col border-r border-white/10">
              <div className="border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
                Shared
              </div>
              <ul className="p-1">
                <li>
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                      humanSel?.t === 'defaults'
                        ? 'bg-signal/15 text-signal'
                        : 'text-white/70 hover:bg-white/5'
                    }`}
                    onClick={() => trySelectHuman({ t: 'defaults' })}
                  >
                    Human defaults
                  </button>
                </li>
              </ul>
              <div className="border-t border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
                Factions
              </div>
              <ul className="p-1">
                {FACTION_KEYS.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                        humanSel?.t === 'faction' && humanSel.id === id
                          ? 'bg-signal/15 text-signal'
                          : 'text-white/70 hover:bg-white/5'
                      }`}
                      onClick={() => trySelectHuman({ t: 'faction', id })}
                    >
                      {catalog.humans[id].name}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
                Loners
              </div>
              <ul className="p-1">
                {LONER_KINDS.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                        humanSel?.t === 'loner' && humanSel.id === id
                          ? 'bg-signal/15 text-signal'
                          : 'text-white/70 hover:bg-white/5'
                      }`}
                      onClick={() => trySelectHuman({ t: 'loner', id })}
                    >
                      {catalog.loners[id].name}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
            <main className="flex-1 overflow-y-auto p-4">
              <div className={`mx-auto max-w-5xl space-y-4 ${compareEnemy ? 'lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0' : ''}`}>
                <div className="space-y-4">
                  {humanSel?.t === 'defaults' && (
                    <>
                      <h3 className="text-lg font-semibold text-white">Shared human defaults</h3>
                      <WhereUsed notes={whereNotes} />
                      <label className="flex flex-col gap-0.5 text-xs text-white/55">
                        <span>Preview danger</span>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          value={formDanger}
                          onChange={(ev) => setFormDanger(Number(ev.target.value))}
                        />
                      </label>
                      <HumanScalingFields
                        value={catalog.humanDefaults}
                        onChange={updateHumanDefaults}
                      />
                    </>
                  )}
                  {humanSel?.t === 'faction' &&
                    (() => {
                      const h = catalog.humans[humanSel.id];
                      const resolved = resolveHuman(catalog, humanSel.id);
                      const overrideKeys = HUMAN_SCALING_KEYS.filter((k) => h[k] !== undefined);
                      return (
                        <>
                          <div className="font-mono text-xs text-white/35">{humanSel.id}</div>
                          <h3 className="text-lg font-semibold text-white">{h.name}</h3>
                          <WhereUsed notes={whereNotes} />
                          <label className="flex flex-col gap-0.5 text-xs text-white/55">
                            <span>Preview danger</span>
                            <input
                              type="range"
                              min={1}
                              max={5}
                              value={formDanger}
                              onChange={(ev) => setFormDanger(Number(ev.target.value))}
                            />
                          </label>
                          <TextField
                            label="Name"
                            value={h.name}
                            onChange={(name) => updateHuman(humanSel.id, { name })}
                          />
                          <NumField
                            label="Armor"
                            value={h.armor}
                            onChange={(armor) => updateHuman(humanSel.id, { armor })}
                          />
                          <p className="text-xs text-white/35">
                            Runtime speed = baseSpeed − armor ({resolved.baseSpeed - h.armor})
                          </p>
                          <DropPoolEditor
                            drops={h.drops}
                            itemIds={itemIds}
                            onChange={(drops) => updateHuman(humanSel.id, { drops })}
                          />
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-semibold uppercase tracking-wider text-white/45">
                              Scaling overrides
                            </div>
                            {overrideKeys.length > 0 ? (
                              <button
                                type="button"
                                className="text-xs text-white/50 hover:underline"
                                onClick={() => clearHumanOverrides(humanSel.id)}
                              >
                                Clear overrides
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="text-xs text-signal hover:underline"
                                onClick={() =>
                                  updateHuman(humanSel.id, { ...catalog.humanDefaults })
                                }
                              >
                                Copy defaults as overrides
                              </button>
                            )}
                          </div>
                          {overrideKeys.length > 0 ? (
                            <HumanScalingFields
                              value={{
                                baseHp: resolved.baseHp,
                                hpPerDanger: resolved.hpPerDanger,
                                hpJitter: resolved.hpJitter,
                                baseAttack: resolved.baseAttack,
                                attackPerDangerDiv: resolved.attackPerDangerDiv,
                                attackJitter: resolved.attackJitter,
                                baseDefense: resolved.baseDefense,
                                defensePerDangerDiv: resolved.defensePerDangerDiv,
                                baseDamage: resolved.baseDamage,
                                damagePerDanger: resolved.damagePerDanger,
                                damageJitter: resolved.damageJitter,
                                baseSpeed: resolved.baseSpeed,
                              }}
                              onChange={(patch) => updateHuman(humanSel.id, patch)}
                            />
                          ) : (
                            <p className="text-xs text-white/40">
                              Inherits all scaling from Human defaults.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  {humanSel?.t === 'loner' &&
                    (() => {
                      const l = catalog.loners[humanSel.id];
                      return (
                        <>
                          <div className="font-mono text-xs text-white/35">{humanSel.id}</div>
                          <h3 className="text-lg font-semibold text-white">{l.name}</h3>
                          <WhereUsed notes={whereNotes} />
                          <label className="flex flex-col gap-0.5 text-xs text-white/55">
                            <span>Preview danger</span>
                            <input
                              type="range"
                              min={1}
                              max={5}
                              value={formDanger}
                              onChange={(ev) => setFormDanger(Number(ev.target.value))}
                            />
                          </label>
                          <TextField
                            label="Name"
                            value={l.name}
                            onChange={(name) => updateLoner(humanSel.id, { name })}
                          />
                          <StatGrid>
                            <NumField label="Armor" value={l.armor} onChange={(armor) => updateLoner(humanSel.id, { armor })} />
                            <NumField label="Speed" value={l.speed} onChange={(speed) => updateLoner(humanSel.id, { speed })} />
                            <NumField label="Base HP" value={l.baseHp} onChange={(baseHp) => updateLoner(humanSel.id, { baseHp })} />
                            <NumField label="HP / danger" value={l.hpPerDanger} onChange={(hpPerDanger) => updateLoner(humanSel.id, { hpPerDanger })} />
                            <RangeField label="HP jitter" value={l.hpJitter} onChange={(hpJitter) => updateLoner(humanSel.id, { hpJitter })} />
                            <NumField label="Base attack" value={l.baseAttack} onChange={(baseAttack) => updateLoner(humanSel.id, { baseAttack })} />
                            <NumField label="Atk ÷ danger" value={l.attackPerDangerDiv} min={1} onChange={(attackPerDangerDiv) => updateLoner(humanSel.id, { attackPerDangerDiv })} />
                            <NumField label="Attack bonus" value={l.attackBonus} onChange={(attackBonus) => updateLoner(humanSel.id, { attackBonus })} />
                            <NumField label="Base defense" value={l.baseDefense} onChange={(baseDefense) => updateLoner(humanSel.id, { baseDefense })} />
                            <NumField label="Def ÷ danger" value={l.defensePerDangerDiv} min={1} onChange={(defensePerDangerDiv) => updateLoner(humanSel.id, { defensePerDangerDiv })} />
                            <NumField label="Base damage" value={l.baseDamage} onChange={(baseDamage) => updateLoner(humanSel.id, { baseDamage })} />
                            <NumField label="Dmg × danger" value={l.damagePerDanger} onChange={(damagePerDanger) => updateLoner(humanSel.id, { damagePerDanger })} />
                            <RangeField label="Damage jitter" value={l.damageJitter} onChange={(damageJitter) => updateLoner(humanSel.id, { damageJitter })} />
                            <NumField label="Drop chance" value={l.dropChance} step={0.05} min={0} max={1} onChange={(dropChance) => updateLoner(humanSel.id, { dropChance })} />
                          </StatGrid>
                          <DropPoolEditor
                            drops={l.drops}
                            itemIds={itemIds}
                            onChange={(drops) => updateLoner(humanSel.id, { drops })}
                          />
                        </>
                      );
                    })()}
                  {primaryDerived && (
                    <DerivedCard
                      label={primaryDerived.label}
                      enemy={primaryDerived.enemy}
                      danger={primaryDerived.danger}
                    />
                  )}
                </div>
                {compareEnemy && (
                  <DerivedCard
                    label={`Compare · ${compareEnemy.name}`}
                    enemy={compareEnemy}
                    danger={formDanger}
                  />
                )}
              </div>
            </main>
          </>
        ) : (
          <main className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
              <section className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-signal">Spawn rules</h3>
                <RangeField
                  label="Zombie tier jitter [lo, hi]"
                  value={catalog.spawn.zombieTierJitter}
                  onChange={(zombieTierJitter) =>
                    setCatalog({ ...catalog, spawn: { ...catalog.spawn, zombieTierJitter } })
                  }
                />
                <NumField
                  label="Human drop chance"
                  value={catalog.spawn.humanDropChance}
                  step={0.05}
                  min={0}
                  max={1}
                  onChange={(humanDropChance) =>
                    setCatalog({ ...catalog, spawn: { ...catalog.spawn, humanDropChance } })
                  }
                />
                <label className="flex flex-col gap-0.5 text-xs text-white/55">
                  <span>Wilds gang faction</span>
                  <select
                    className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white"
                    value={catalog.spawn.wildsGangFaction}
                    onChange={(e) =>
                      setCatalog({
                        ...catalog,
                        spawn: {
                          ...catalog.spawn,
                          wildsGangFaction: e.target.value as FactionKey,
                        },
                      })
                    }
                  >
                    {FACTION_KEYS.map((id) => (
                      <option key={id} value={id}>
                        {catalog.humans[id].name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5 text-xs text-white/55">
                  <span>HDB elite binding</span>
                  <select
                    className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white"
                    value={catalog.spawn.eliteBindings.hdb}
                    onChange={(e) =>
                      setCatalog({
                        ...catalog,
                        spawn: {
                          ...catalog.spawn,
                          eliteBindings: {
                            ...catalog.spawn.eliteBindings,
                            hdb: e.target.value as EliteId,
                          },
                        },
                      })
                    }
                  >
                    {ELITE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {catalog.elites[id].name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5 text-xs text-white/55">
                  <span>Tunnel elite binding</span>
                  <select
                    className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white"
                    value={catalog.spawn.eliteBindings.tunnel}
                    onChange={(e) =>
                      setCatalog({
                        ...catalog,
                        spawn: {
                          ...catalog.spawn,
                          eliteBindings: {
                            ...catalog.spawn.eliteBindings,
                            tunnel: e.target.value as EliteId,
                          },
                        },
                      })
                    }
                  >
                    {ELITE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {catalog.elites[id].name}
                      </option>
                    ))}
                  </select>
                </label>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-signal">
                  Seeded roll preview
                </h3>
                <label className="flex flex-col gap-0.5 text-xs text-white/55">
                  <span>Kind</span>
                  <select
                    className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white"
                    value={
                      previewKind.t === 'zombie'
                        ? 'zombie'
                        : previewKind.t === 'elite'
                          ? `elite:${previewKind.id}`
                          : previewKind.t === 'human'
                            ? `human:${previewKind.faction}`
                            : `loner:${previewKind.kind}`
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'zombie') setPreviewKind({ t: 'zombie' });
                      else if (v.startsWith('elite:')) {
                        setPreviewKind({ t: 'elite', id: v.slice(6) as EliteId });
                      } else if (v.startsWith('human:')) {
                        setPreviewKind({ t: 'human', faction: v.slice(6) as FactionKey });
                      } else if (v.startsWith('loner:')) {
                        setPreviewKind({ t: 'loner', kind: v.slice(6) as LonerKind });
                      }
                    }}
                  >
                    <option value="zombie">Zombie (tier roll)</option>
                    {ELITE_IDS.map((id) => (
                      <option key={id} value={`elite:${id}`}>
                        Elite: {catalog.elites[id].name}
                      </option>
                    ))}
                    {FACTION_KEYS.map((id) => (
                      <option key={id} value={`human:${id}`}>
                        Human: {catalog.humans[id].name}
                      </option>
                    ))}
                    {LONER_KINDS.map((id) => (
                      <option key={id} value={`loner:${id}`}>
                        Loner: {catalog.loners[id].name}
                      </option>
                    ))}
                  </select>
                </label>
                <TextField label="Seed" value={previewSeed} onChange={setPreviewSeed} />
                <div className="overflow-x-auto rounded border border-white/10">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-black/30 text-white/40">
                      <tr>
                        <th className="px-2 py-1.5">D</th>
                        <th className="px-2 py-1.5">Name</th>
                        <th className="px-2 py-1.5">HP</th>
                        <th className="px-2 py-1.5">Atk</th>
                        <th className="px-2 py-1.5">Def</th>
                        <th className="px-2 py-1.5">Dmg</th>
                        <th className="px-2 py-1.5">Arm</th>
                        <th className="px-2 py-1.5">Spd</th>
                        <th className="px-2 py-1.5">Threat</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-white/75">
                      {previews.map(({ danger, enemy }) => {
                        const t = estimateThreat(enemy);
                        return (
                          <tr key={danger} className="border-t border-white/5">
                            <td className="px-2 py-1.5 text-signal">{danger}</td>
                            <td className="px-2 py-1.5 font-sans">{enemy.name}</td>
                            <td className="px-2 py-1.5">{enemy.hp}</td>
                            <td className="px-2 py-1.5">{enemy.attack}</td>
                            <td className="px-2 py-1.5">{enemy.defense}</td>
                            <td className="px-2 py-1.5">{enemy.damage}</td>
                            <td className="px-2 py-1.5">{enemy.armor}</td>
                            <td className="px-2 py-1.5">{enemy.speed}</td>
                            <td className="px-2 py-1.5 text-signal">{t.threat}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </main>
        )}
      </div>

      {diffOpen && pendingDiff && (
        <DialogShell title="Review changes" onBackdrop={() => setDiffOpen(false)}>
          <div className="mb-4 max-h-60 space-y-2 overflow-y-auto text-xs text-white/70">
            {pendingDiff.added.length > 0 && (
              <div>
                <div className="font-semibold text-emerald-300">Added</div>
                {pendingDiff.added.map((a) => (
                  <div key={a} className="font-mono">
                    + {a}
                  </div>
                ))}
              </div>
            )}
            {pendingDiff.removed.length > 0 && (
              <div>
                <div className="font-semibold text-red-300">Removed</div>
                {pendingDiff.removed.map((a) => (
                  <div key={a} className="font-mono">
                    − {a}
                  </div>
                ))}
              </div>
            )}
            {pendingDiff.changed.length > 0 && (
              <div>
                <div className="font-semibold text-amber-300">Changed</div>
                {pendingDiff.changed.map((c) => (
                  <div key={c.path} className="font-mono">
                    {c.path}: {c.fields.join(', ')}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded border border-white/15 px-3 py-1.5 text-xs"
              onClick={() => setDiffOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-signal px-3 py-1.5 text-xs font-bold text-concrete-950"
              onClick={() => void confirmSave()}
            >
              Write enemies.json
            </button>
          </div>
        </DialogShell>
      )}

      {saveSuccessOpen && (
        <DialogShell title="Saved" onBackdrop={() => setSaveSuccessOpen(false)}>
          <p className="mb-4 text-sm text-white/65">
            Catalog written. Hard-refresh the game to load new numbers into live combat modules.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded border border-white/15 px-3 py-1.5 text-xs"
              onClick={() => setSaveSuccessOpen(false)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="rounded bg-signal px-3 py-1.5 text-xs font-bold text-concrete-950"
              onClick={() => {
                setSaveSuccessOpen(false);
                setOpen(false);
              }}
            >
              Close
            </button>
          </div>
        </DialogShell>
      )}

      {confirmClose && (
        <DialogShell title="Discard unsaved changes?" onBackdrop={() => setConfirmClose(false)}>
          <p className="mb-4 text-sm text-white/65">You have unsaved encounter kit edits.</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded border border-white/15 px-3 py-1.5 text-xs"
              onClick={() => setConfirmClose(false)}
            >
              Stay
            </button>
            <button
              type="button"
              className="rounded bg-red-500/80 px-3 py-1.5 text-xs font-bold text-white"
              onClick={() => {
                setConfirmClose(false);
                setOpen(false);
              }}
            >
              Discard & close
            </button>
          </div>
        </DialogShell>
      )}
    </div>
  );
}
