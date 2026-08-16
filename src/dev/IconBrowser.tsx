import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_FALLBACK, type IconName } from '../icons/keys';
import { Icon } from '../icons/Icon';
import { ICON_ASSETS } from '../icons/registry';
import {
  clearChromeIcon,
  fetchChromeIcons,
  MAX_ICON_BYTES,
  MAX_ICON_EDGE,
  uploadChromeIcon,
  type IconAssetInfo,
} from './iconApi';
import {
  CLOSE_DEV_TOOLS_EVENT,
  OPEN_ICON_EVENT,
  reportDevToolState,
  type CloseDevToolsDetail,
  type OpenIconDetail,
} from './devBridge';

type ArtFilter = 'all' | 'missing' | 'has';

function namespaceOf(key: string): string {
  return key.split('.')[0] ?? key;
}

function hasBundledArt(key: IconName, diskKeys: Set<string>): boolean {
  return diskKeys.has(key) || !!ICON_ASSETS[key];
}

function listNonItemKeys(): IconName[] {
  // Read EMOJI_FALLBACK during call so keys.ts HMR picks up new chrome keys
  // (module-level Object.keys() would stay stale).
  return (Object.keys(EMOJI_FALLBACK) as IconName[]).filter((k) => !k.startsWith('item.'));
}

/**
 * DEV browser for non-item chrome icons — browse by namespace, upload/replace/clear art.
 * Opened from the Dev tools menu or `openIconBrowser({ key })`.
 */
export function DevIconBrowser() {
  const [open, setOpen] = useState(false);
  const [diskIcons, setDiskIcons] = useState<IconAssetInfo[]>([]);
  const [query, setQuery] = useState('');
  const [artFilter, setArtFilter] = useState<ArtFilter>('all');
  const [nsFilter, setNsFilter] = useState<string>('all');
  const [selected, setSelected] = useState<IconName | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showOrphans, setShowOrphans] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropKeyRef = useRef<IconName | null>(null);

  const nonItemKeys = listNonItemKeys();

  const diskByKey = useMemo(() => {
    const m = new Map<string, IconAssetInfo>();
    for (const i of diskIcons) m.set(i.key, i);
    return m;
  }, [diskIcons]);

  const diskKeySet = useMemo(() => new Set(diskByKey.keys()), [diskByKey]);

  const namespaces = useMemo(() => {
    const set = new Set<string>();
    for (const k of nonItemKeys) set.add(namespaceOf(k));
    return [...set].sort();
  }, [nonItemKeys]);

  const withArt = useMemo(
    () => nonItemKeys.filter((k) => hasBundledArt(k, diskKeySet)).length,
    [diskKeySet, nonItemKeys],
  );

  const orphans = useMemo(() => {
    const known = new Set(nonItemKeys as string[]);
    return diskIcons.filter((i) => !known.has(i.key));
  }, [diskIcons, nonItemKeys]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nonItemKeys.filter((k) => {
      if (nsFilter !== 'all' && namespaceOf(k) !== nsFilter) return false;
      if (q && !k.toLowerCase().includes(q)) return false;
      const art = hasBundledArt(k, diskKeySet);
      if (artFilter === 'missing' && art) return false;
      if (artFilter === 'has' && !art) return false;
      return true;
    });
  }, [query, nsFilter, artFilter, diskKeySet, nonItemKeys]);

  const grouped = useMemo(() => {
    const map = new Map<string, IconName[]>();
    for (const k of filtered) {
      const ns = namespaceOf(k);
      const list = map.get(ns) ?? [];
      list.push(k);
      map.set(ns, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchChromeIcons();
      setDiskIcons(data.icons);
      setStatus(`Loaded ${data.icons.length} on-disk chrome icons`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    reportDevToolState('icons', open);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenIconDetail>).detail ?? {};
      setOpen(true);
      if (detail.key && (listNonItemKeys() as string[]).includes(detail.key)) {
        setSelected(detail.key as IconName);
        setQuery(detail.key);
        setNsFilter(namespaceOf(detail.key));
      }
    };
    const onClose = (e: Event) => {
      const except = (e as CustomEvent<CloseDevToolsDetail>).detail?.except;
      if (except === 'icons') return;
      setOpen(false);
    };
    window.addEventListener(OPEN_ICON_EVENT, onOpen);
    window.addEventListener(CLOSE_DEV_TOOLS_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_ICON_EVENT, onOpen);
      window.removeEventListener(CLOSE_DEV_TOOLS_EVENT, onClose);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const applyUpload = async (key: IconName, file: File) => {
    setUploading(true);
    setError(null);
    try {
      const result = await uploadChromeIcon(key, file);
      setStatus(`Uploaded ${result.file} (${result.bytes} B) · hard-refresh to see in-game`);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
    }
  };

  const onClear = async (key: IconName) => {
    setUploading(true);
    setError(null);
    try {
      const result = await clearChromeIcon(key);
      setStatus(
        result.removed
          ? `Removed ${result.removed}`
          : `No on-disk asset for ${key}`,
      );
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
    }
  };

  const onCopy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setStatus(`Copied ${key}`);
    } catch {
      setStatus(`Copy failed — ${key}`);
    }
  };

  const handleDrop = (key: IconName, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void applyUpload(key, file);
  };

  if (!open) return null;

  const selInfo = selected ? diskByKey.get(selected) : undefined;
  const selHasArt = selected ? hasBundledArt(selected, diskKeySet) : false;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col overflow-hidden bg-concrete-900">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
        <h2 className="mr-2 text-sm font-bold uppercase tracking-widest text-signal">
          Icons
        </h2>
        <span className="rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/60">
          {withArt} / {nonItemKeys.length} with art
        </span>
        {orphans.length > 0 && (
          <button
            type="button"
            onClick={() => setShowOrphans((v) => !v)}
            className="rounded border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-300/90 hover:bg-amber-500/10"
          >
            {orphans.length} orphan{orphans.length === 1 ? '' : 's'}
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {status && <span className="max-w-md truncate text-[11px] text-white/45">{status}</span>}
          {error && <span className="max-w-md truncate text-[11px] text-red-400">{error}</span>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/70 hover:bg-white/5"
            title="Esc"
          >
            Close
          </button>
        </div>
      </header>

      {showOrphans && orphans.length > 0 && (
        <div className="border-b border-amber-500/20 bg-amber-950/30 px-4 py-2 text-xs text-amber-100/80">
          <p className="mb-1 font-semibold uppercase tracking-wide text-amber-200/90">
            On-disk files with no matching key
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
            {orphans.map((o) => (
              <li key={o.file}>
                {o.file}{' '}
                <span className="text-white/35">({o.bytes} B · key {o.key})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-44 shrink-0 flex-col border-r border-white/10">
          <div className="border-b border-white/10 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search keys…"
              className="w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white placeholder:text-white/30"
            />
            <div className="mt-2 flex gap-1">
              {(['all', 'missing', 'has'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setArtFilter(f)}
                  className={`flex-1 rounded px-1 py-1 text-[10px] uppercase tracking-wide ${
                    artFilter === f
                      ? 'bg-signal/20 text-signal'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'missing' ? 'Missing' : 'Has art'}
                </button>
              ))}
            </div>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => setNsFilter('all')}
              className={`mb-0.5 w-full rounded px-2 py-1.5 text-left text-xs ${
                nsFilter === 'all'
                  ? 'bg-signal/15 text-signal'
                  : 'text-white/55 hover:bg-white/5'
              }`}
            >
              All namespaces
            </button>
            {namespaces.map((ns) => {
              const count = nonItemKeys.filter((k) => namespaceOf(k) === ns).length;
              const missing = nonItemKeys.filter(
                (k) => namespaceOf(k) === ns && !hasBundledArt(k, diskKeySet),
              ).length;
              return (
                <button
                  key={ns}
                  type="button"
                  onClick={() => setNsFilter(ns)}
                  className={`mb-0.5 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                    nsFilter === ns
                      ? 'bg-signal/15 text-signal'
                      : 'text-white/55 hover:bg-white/5'
                  }`}
                >
                  <span className="font-mono">{ns}</span>
                  <span className="text-[10px] text-white/35">
                    {missing > 0 ? `${count - missing}/${count}` : count}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto p-3">
          {grouped.length === 0 ? (
            <p className="text-sm text-white/40">No icons match.</p>
          ) : (
            grouped.map(([ns, keys]) => (
              <section key={ns} className="mb-5">
                <h3 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-white/35">
                  {ns}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
                  {keys.map((key) => {
                    const art = hasBundledArt(key, diskKeySet);
                    const info = diskByKey.get(key);
                    const isSel = selected === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelected(key)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          dropKeyRef.current = key;
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDrop(key, e.dataTransfer.files);
                        }}
                        className={`flex flex-col items-center gap-1.5 rounded border p-2 text-center transition ${
                          isSel
                            ? 'border-signal/60 bg-signal/10'
                            : 'border-white/10 bg-black/20 hover:border-white/25'
                        }`}
                      >
                        <span className="flex h-10 w-10 items-center justify-center text-white">
                          <Icon name={key} size={28} />
                        </span>
                        <span className="w-full truncate font-mono text-[10px] text-white/70">
                          {key}
                        </span>
                        <span
                          className={`text-[9px] uppercase tracking-wide ${
                            art ? 'text-emerald-400/80' : 'text-white/30'
                          }`}
                        >
                          {art ? (info ? `${info.bytes} B` : 'asset') : 'emoji'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </main>

        <aside className="flex w-72 shrink-0 flex-col border-l border-white/10 bg-black/20">
          {selected ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
              <div>
                <p className="font-mono text-sm text-signal">{selected}</p>
                <p className="mt-0.5 text-[11px] text-white/40">
                  emoji fallback · {EMOJI_FALLBACK[selected]}
                </p>
              </div>

              <div className="flex gap-2">
                {(
                  [
                    { label: 'Dark', className: 'bg-concrete-900 text-white' },
                    { label: 'Light', className: 'bg-white text-concrete-900' },
                    { label: 'Accent', className: 'bg-signal/25 text-signal' },
                  ] as const
                ).map((sw) => (
                  <div
                    key={sw.label}
                    className={`flex flex-1 flex-col items-center gap-1 rounded border border-white/10 py-3 ${sw.className}`}
                  >
                    <Icon name={selected} size={32} />
                    <span className="text-[9px] uppercase tracking-wide opacity-60">
                      {sw.label}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-white/45">
                {selHasArt
                  ? selInfo
                    ? `On disk: ${selInfo.file}`
                    : 'Bundled asset (reload after upload to refresh preview URL)'
                  : 'Emoji only — drop a PNG/WebP to add art'}
              </p>

              <div
                className="rounded border border-dashed border-white/20 px-3 py-6 text-center text-xs text-white/40"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(selected, e.dataTransfer.files);
                }}
              >
                Drop PNG / WebP here
                <div className="mt-1 text-[10px] text-white/25">
                  max {MAX_ICON_EDGE}px · {MAX_ICON_BYTES / 1024} KB
                </div>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void applyUpload(selected, file);
                }}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="rounded border border-signal/40 bg-signal/15 px-2.5 py-1.5 text-xs font-semibold text-signal hover:bg-signal/25 disabled:opacity-40"
                >
                  {uploading ? 'Working…' : selHasArt ? 'Replace…' : 'Upload…'}
                </button>
                {selHasArt && (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => void onClear(selected)}
                    className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-white/60 hover:bg-white/5 disabled:opacity-40"
                  >
                    Clear asset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void onCopy(selected)}
                  className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-white/60 hover:bg-white/5"
                >
                  Copy key
                </button>
              </div>

              <p className="text-[10px] leading-relaxed text-white/30">
                Writes{' '}
                <span className="font-mono text-white/45">
                  src/assets/icons/{selected.replace(/\./g, '-')}.png
                </span>
                . Item art stays in the Loot browser. Hard-refresh the game after
                uploads to pick up new URLs.
              </p>
            </div>
          ) : (
            <p className="p-4 text-sm text-white/35">Select an icon tile.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
