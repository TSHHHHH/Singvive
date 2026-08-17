import { useEffect, useMemo, useRef, useState } from 'react';
import type { ItemDef } from '../game/types';
import { itemIcon } from '../components/Inventory/itemIcon';
import { Icon } from '../icons/Icon';
import { EFFECT_KINDS } from './validateItems';
import type { ItemsCatalog } from './lootApi';

const inputClass =
  'rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-signal/50';

const KINDS = ['all', ...[...EFFECT_KINDS].sort()] as const;

type KindFilter = (typeof KINDS)[number];

type Props = {
  items: ItemsCatalog;
  exclude?: ReadonlySet<string>;
  placeholder: string;
  onPick: (id: string) => void;
};

/**
 * Searchable item picker with kind filter, value/scarcity readout, and
 * ↑↓ / Enter / Esc.
 */
export function RecipeItemSearch({ items, exclude, placeholder, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Object.values(items).filter((def) => {
      if (exclude?.has(def.id)) return false;
      if (kind !== 'all' && def.effect.kind !== kind) return false;
      if (!q) return true;
      return (
        def.id.includes(q) ||
        def.name.toLowerCase().includes(q) ||
        def.effect.kind.includes(q)
      );
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list.slice(0, 16);
  }, [items, exclude, query, kind]);

  useEffect(() => {
    setHi(0);
  }, [query, kind, open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector('[data-hi="1"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  const pick = (def: ItemDef) => {
    onPick(def.id);
    setQuery('');
    setOpen(false);
    setKind('all');
  };

  return (
    <div ref={rootRef} className="relative flex min-w-[12rem] flex-1 gap-1">
      <select
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as KindFilter);
          setOpen(true);
        }}
        className="rounded border border-white/10 bg-black/40 px-1.5 py-1.5 text-2xs text-white/70 outline-none"
        aria-label="Filter by kind"
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <div className="relative min-w-0 flex-1">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={inputClass + ' w-full font-mono'}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              return;
            }
            if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
              setOpen(true);
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHi((i) => Math.min(matches.length - 1, i + 1));
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHi((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              const def = matches[hi];
              if (def) pick(def);
            }
          }}
        />
        {open && (
          <ul
            ref={listRef}
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border border-white/10 bg-concrete-900 shadow-xl"
          >
            {matches.length === 0 ? (
              <li className="px-2 py-2 text-xs text-white/35">No items match</li>
            ) : (
              matches.map((def, i) => (
                <li key={def.id}>
                  <button
                    type="button"
                    data-hi={i === hi ? '1' : '0'}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => pick(def)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
                      i === hi ? 'bg-signal/15' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/10 bg-black/40">
                      <Icon name={itemIcon(def)} size={16} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-white/80">{def.name}</span>
                    <span className="shrink-0 font-mono text-2xs text-white/35">
                      {def.effect.kind} · v{def.value}
                      {def.scarcity !== undefined && def.scarcity < 1 ? ` · s${def.scarcity}` : ''}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
