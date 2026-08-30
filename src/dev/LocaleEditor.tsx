import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  flattenMessages,
  getEnglishCatalog,
  getZhHansCatalog,
  setMessageLeaf,
  setZhHansOverlay,
  type MessageTree,
} from '../i18n';
import {
  CLOSE_DEV_TOOLS_EVENT,
  OPEN_LOCALE_EVENT,
  reportDevToolState,
  type CloseDevToolsDetail,
} from './devBridge';
import { saveLocaleCatalog } from './localeApi';

type Namespace = 'ui' | 'settings' | 'guide' | 'item' | 'enemy' | 'recipe' | 'trait' | 'all';

type ExportRow = {
  key: string;
  namespace: string;
  en: string;
  zh?: string;
  notes?: string;
};

const NS_NOTES =
  'Leave {placeholders} and #{vars} intact. Do not translate Singapore place names (POI/MRT/zones). English is source of truth.';

function namespaceOf(key: string): string {
  return key.split('.')[0] ?? 'ui';
}

function placeholders(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/#\{(\w+)\}|\{(\w+)\}/g)) {
    out.push(m[0]!);
  }
  return out.sort();
}

function filterRows(
  rows: { key: string; en: string; zh: string }[],
  ns: Namespace,
  q: string,
  missingOnly: boolean,
) {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (ns !== 'all' && !r.key.startsWith(`${ns}.`)) return false;
    if (missingOnly && r.zh.trim()) return false;
    if (!needle) return true;
    return (
      r.key.toLowerCase().includes(needle) ||
      r.en.toLowerCase().includes(needle) ||
      r.zh.toLowerCase().includes(needle)
    );
  });
}

/**
 * DEV Locale Editor — English source of truth + zh-Hans overlay.
 * Mass JSON export/import for free-tier AI translation drafts.
 */
export function DevLocaleEditor() {
  const [open, setOpen] = useState(false);
  const [enTree, setEnTree] = useState<MessageTree>(() => getEnglishCatalog());
  const [zhTree, setZhTree] = useState<MessageTree>({});
  const [ns, setNs] = useState<Namespace>('ui');
  const [query, setQuery] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setZhHansOverlay(null);
    reportDevToolState('locale', false);
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Prefer bundled catalogs — avoids SPA HTML when the Vite middleware
      // hasn't been registered yet (e.g. server started before locale routes).
      const en = structuredClone(getEnglishCatalog()) as MessageTree;
      const zh = await getZhHansCatalog();
      setEnTree(en);
      setZhTree(zh);
      setZhHansOverlay(zh);
      setStatus('Loaded locale catalogs.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      reportDevToolState('locale', true);
      void load();
    };
    const onClose = (e: Event) => {
      const except = (e as CustomEvent<CloseDevToolsDetail>).detail?.except;
      if (except === 'locale') return;
      close();
    };
    window.addEventListener(OPEN_LOCALE_EVENT, onOpen);
    window.addEventListener(CLOSE_DEV_TOOLS_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_LOCALE_EVENT, onOpen);
      window.removeEventListener(CLOSE_DEV_TOOLS_EVENT, onClose);
    };
  }, [close, load]);

  useEffect(() => {
    if (!open) return;
    setZhHansOverlay(zhTree);
  }, [open, zhTree]);

  const rows = useMemo(() => {
    const enFlat = flattenMessages(enTree);
    const zhMap = new Map(flattenMessages(zhTree).map((r) => [r.key, r.value]));
    return enFlat.map((r) => ({
      key: r.key,
      en: r.value,
      zh: zhMap.get(r.key) ?? '',
    }));
  }, [enTree, zhTree]);

  const visible = useMemo(
    () => filterRows(rows, ns, query, missingOnly),
    [rows, ns, query, missingOnly],
  );

  const setZh = (key: string, value: string) => {
    setZhTree((prev) => setMessageLeaf(prev, key, value));
  };

  const setEn = (key: string, value: string) => {
    setEnTree((prev) => setMessageLeaf(prev, key, value));
  };

  const exportPack = () => {
    const pack: ExportRow[] = visible.map((r) => ({
      key: r.key,
      namespace: namespaceOf(r.key),
      en: r.en,
      ...(r.zh ? { zh: r.zh } : {}),
      notes: NS_NOTES,
    }));
    const blob = new Blob([`${JSON.stringify(pack, null, 2)}\n`], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `singvive-locale-export-${ns}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(`Exported ${pack.length} rows (${ns}).`);
  };

  const importPack = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Import must be a JSON array of { key, en?, zh? }');
      const enKeys = new Set(flattenMessages(enTree).map((r) => r.key));
      let applied = 0;
      let skipped = 0;
      let nextZh = structuredClone(zhTree) as MessageTree;
      let nextEn = structuredClone(enTree) as MessageTree;
      const problems: string[] = [];

      for (const row of parsed) {
        if (!row || typeof row !== 'object') continue;
        const rec = row as Record<string, unknown>;
        const key = typeof rec.key === 'string' ? rec.key : '';
        if (!key || !enKeys.has(key)) {
          skipped++;
          if (key) problems.push(`unknown key: ${key}`);
          continue;
        }
        const enVal = typeof rec.en === 'string' ? rec.en : undefined;
        const zhVal = typeof rec.zh === 'string' ? rec.zh : undefined;
        if (enVal != null) {
          const phEn = placeholders(enFlatValue(enTree, key));
          const phNew = placeholders(enVal);
          if (phEn.join() !== phNew.join()) {
            problems.push(`placeholder mismatch on en ${key}`);
          }
          nextEn = setMessageLeaf(nextEn, key, enVal);
        }
        if (zhVal != null) {
          const phEn = placeholders(enVal ?? enFlatValue(enTree, key));
          const phZh = placeholders(zhVal);
          if (phEn.join() !== phZh.join()) {
            problems.push(`placeholder mismatch on zh ${key}`);
          }
          nextZh = setMessageLeaf(nextZh, key, zhVal);
        }
        applied++;
      }

      setEnTree(nextEn);
      setZhTree(nextZh);
      setStatus(
        `Imported ${applied} rows` +
          (skipped ? `, skipped ${skipped}` : '') +
          (problems.length ? ` · ${problems.slice(0, 3).join('; ')}` : ''),
      );
      if (problems.length > 3) setError(`${problems.length} validation notes — check placeholders.`);
    } catch (e) {
      setError(String(e));
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveLocaleCatalog('en', enTree);
      await saveLocaleCatalog('zh-Hans', zhTree);
      setZhHansOverlay(zhTree);
      setStatus('Saved en.json + zh-Hans.json. Reload to pick up module imports if needed.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-stretch justify-end bg-black/60 p-2 sm:p-4">
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-white/15 bg-concrete-900 shadow-signage">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
          <h2 className="mr-auto text-sm font-bold text-signal">Locale</h2>
          <select
            value={ns}
            onChange={(e) => setNs(e.target.value as Namespace)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1 text-xs"
          >
            {(['ui', 'settings', 'guide', 'item', 'enemy', 'recipe', 'trait', 'all'] as const).map(
              (n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ),
            )}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter keys…"
            className="min-w-[8rem] flex-1 rounded border border-white/15 bg-black/40 px-2 py-1 text-xs"
          />
          <label className="flex items-center gap-1 text-2xs text-white/50">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(e) => setMissingOnly(e.target.checked)}
            />
            Missing zh
          </label>
          <button
            type="button"
            onClick={exportPack}
            className="rounded border border-white/15 px-2 py-1 text-xs text-white/70 hover:border-white/30"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded border border-white/15 px-2 py-1 text-xs text-white/70 hover:border-white/30"
          >
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importPack(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded border border-signal/40 bg-signal/15 px-2 py-1 text-xs text-signal"
          >
            Save
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded border border-white/15 px-2 py-1 text-xs text-white/50"
          >
            Close
          </button>
        </header>

        {(status || error) && (
          <div className="shrink-0 border-b border-white/10 px-3 py-1.5 text-2xs">
            {status && <span className="text-white/45">{status}</span>}
            {error && <span className="ml-2 text-danger">{error}</span>}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-2xs">
            <thead className="sticky top-0 bg-concrete-900 text-white/40">
              <tr>
                <th className="w-[22%] border-b border-white/10 px-2 py-1.5 font-medium">Key</th>
                <th className="w-[39%] border-b border-white/10 px-2 py-1.5 font-medium">English</th>
                <th className="w-[39%] border-b border-white/10 px-2 py-1.5 font-medium">简体中文</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.key} className="align-top odd:bg-white/[0.02]">
                  <td className="border-b border-white/5 px-2 py-1 font-mono text-white/35 break-all">
                    {r.key}
                  </td>
                  <td className="border-b border-white/5 px-2 py-1">
                    <textarea
                      value={r.en}
                      rows={Math.min(4, Math.max(1, Math.ceil(r.en.length / 48)))}
                      onChange={(e) => setEn(r.key, e.target.value)}
                      className="w-full resize-y rounded border border-white/10 bg-black/30 px-1.5 py-1 text-white/80"
                    />
                  </td>
                  <td className="border-b border-white/5 px-2 py-1">
                    <textarea
                      value={r.zh}
                      rows={Math.min(4, Math.max(1, Math.ceil((r.zh || r.en).length / 48)))}
                      onChange={(e) => setZh(r.key, e.target.value)}
                      placeholder="(falls back to English)"
                      className="w-full resize-y rounded border border-white/10 bg-black/30 px-1.5 py-1 text-white/80 placeholder:text-white/20"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && (
            <p className="p-4 text-xs text-white/40">No rows match this filter.</p>
          )}
        </div>

        <footer className="shrink-0 border-t border-white/10 px-3 py-1.5 text-2xs text-white/30">
          {visible.length} / {rows.length} keys · English is source of truth · missing zh falls back
          at runtime
        </footer>
      </div>
    </div>
  );
}

function enFlatValue(tree: MessageTree, key: string): string {
  return flattenMessages(tree).find((r) => r.key === key)?.value ?? '';
}
