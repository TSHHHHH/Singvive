import {
  buildOverviewRows,
  sortOverviewRows,
  THREAT_BASELINE,
  type OverviewRow,
  type OverviewSortKey,
} from './enemyBalance';
import type { EnemiesCatalog } from '../game/enemies';
import { tip } from '../components/tips';

const SORT_COLS: { key: OverviewSortKey; label: string; title?: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'kind', label: 'Kind' },
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'Atk' },
  { key: 'defense', label: 'Def' },
  { key: 'damage', label: 'Dmg' },
  { key: 'armor', label: 'Arm' },
  { key: 'speed', label: 'Spd' },
  { key: 'infectious', label: 'Inf' },
  { key: 'toKill', label: '→Kill', title: 'Player actions to kill (baseline scavenger)' },
  { key: 'toDie', label: '→Die', title: 'Player-action time until you die' },
  { key: 'threat', label: 'Threat', title: 'toKill / toDie — higher is scarier' },
];

export function EnemyOverview({
  catalog,
  danger,
  onDangerChange,
  sortKey,
  sortDir,
  onSort,
  kindFilter,
  onKindFilter,
  onOpenRow,
}: {
  catalog: EnemiesCatalog;
  danger: number;
  onDangerChange: (d: number) => void;
  sortKey: OverviewSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: OverviewSortKey) => void;
  kindFilter: 'all' | OverviewRow['kind'];
  onKindFilter: (k: 'all' | OverviewRow['kind']) => void;
  onOpenRow: (row: OverviewRow) => void;
}) {
  const rows = sortOverviewRows(
    buildOverviewRows(catalog, danger).filter(
      (r) => kindFilter === 'all' || r.kind === kindFilter,
    ),
    sortKey,
    sortDir,
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5 text-xs text-white/55">
          <span>Danger (scaled rows)</span>
          <input
            type="range"
            min={1}
            max={5}
            value={danger}
            onChange={(e) => onDangerChange(Number(e.target.value))}
            className="w-40"
          />
          <span className="font-mono text-signal">{danger}</span>
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-white/55">
          <span>Kind</span>
          <select
            className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white"
            value={kindFilter}
            onChange={(e) => onKindFilter(e.target.value as typeof kindFilter)}
          >
            <option value="all">All</option>
            <option value="zombie">Zombie tiers</option>
            <option value="elite">Elites</option>
            <option value="human">Faction humans</option>
            <option value="loner">Loners</option>
            <option value="animal">Animals</option>
          </select>
        </label>
        <p className="max-w-xl text-[11px] leading-snug text-white/40">
          Midpoint jitter (no RNG). Threat vs baseline scavenger: dmg {THREAT_BASELINE.playerDamage},
          spd {THREAT_BASELINE.playerSpeed}, hp {THREAT_BASELINE.playerHp}. Click a row to edit.
          Click column headers to sort.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border border-white/10">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="sticky top-0 bg-concrete-900 text-white/45">
            <tr>
              {SORT_COLS.map((col) => (
                <th key={col.key} className="px-2 py-2 font-semibold" {...tip(col.title)}>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 hover:text-signal ${
                      sortKey === col.key ? 'text-signal' : ''
                    }`}
                    onClick={() => onSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
              <th className="px-2 py-2 font-semibold">Context</th>
            </tr>
          </thead>
          <tbody className="font-mono text-white/75">
            {rows.map((row) => (
              <tr
                key={row.key}
                className="cursor-pointer border-t border-white/5 hover:bg-signal/10"
                onClick={() => onOpenRow(row)}
              >
                <td className="px-2 py-1.5 font-sans text-white">{row.name}</td>
                <td className="px-2 py-1.5 capitalize text-white/50">{row.kind}</td>
                <td className="px-2 py-1.5">{row.hp}</td>
                <td className="px-2 py-1.5">{row.attack}</td>
                <td className="px-2 py-1.5">{row.defense}</td>
                <td className="px-2 py-1.5">{row.damage}</td>
                <td className="px-2 py-1.5">{row.armor}</td>
                <td className="px-2 py-1.5">{row.speed}</td>
                <td className="px-2 py-1.5">{row.infectious}</td>
                <td className="px-2 py-1.5 text-emerald-300/90">{row.toKill}</td>
                <td className="px-2 py-1.5 text-amber-300/90">{row.toDie}</td>
                <td className="px-2 py-1.5 text-signal">{row.threat}</td>
                <td className="px-2 py-1.5 font-sans text-white/40">{row.context}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
