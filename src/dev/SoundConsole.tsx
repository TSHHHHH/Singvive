import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  CUE_CATEGORIES,
  CUES,
  cueIdFromFile,
  isCueId,
  type AudioManifest,
  type CueCategory,
  type CueDef,
} from '../audio/cues';
import { sfx, type CueFireEvent } from '../audio/sfx';
import {
  CLOSE_DEV_TOOLS_EVENT,
  OPEN_SOUND_EVENT,
  reportDevToolState,
  type CloseDevToolsDetail,
  type OpenSoundDetail,
} from './devBridge';
import { clearSound, fetchSounds, saveSoundSettings, uploadSound, type SoundListing } from './soundApi';
import { tip } from '../components/tips';

type Filter = 'all' | 'missing' | 'assigned' | 'fired';

interface FireStat {
  count: number;
  last: number;
  audible: boolean;
}

/** How long the live dot stays lit after a fire. */
const FLASH_MS = 900;

const ACCEPT = '.ogg,.mp3,.wav,.m4a,.webm,.flac,.opus,audio/*';

function fmtBytes(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

/** The cue list as a Markdown table (for PRs and handing to a sound designer). */
function cueTable(manifest: AudioManifest): string {
  const rows = CUES.map((c) => {
    const def = c as CueDef;
    const flags = [def.loop ? 'loop' : '', def.synth ? 'synth fallback' : '', def.duck ? 'ducks' : ''].filter(Boolean).join(', ');
    return `| \`${c.id}\` | ${c.label} | ${c.trigger.replace(/\|/g, '\\|')} | ${c.length} | ${c.priority} | ${flags} | ${manifest.cues[c.id]?.file ?? ''} |`;
  });
  return ['| Cue | Name | Fires when | Length | Pri | Notes | File |', '|---|---|---|---|---|---|---|', ...rows].join('\n');
}

/**
 * DEV console for the cue engine: every cue with its trigger, the file
 * assigned to it, and live feedback when the game fires it. Drop an audio
 * file on a row (or several files named `<cue id>.<ext>` anywhere on the
 * console) to save it into public/audio/ and update the manifest.
 *
 * Opens as a drawer on the right so the game stays playable beside it.
 */
export function DevSoundConsole() {
  const [open, setOpen] = useState(false);
  const [listing, setListing] = useState<SoundListing | null>(null);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<CueCategory | 'all'>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCue, setBusyCue] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [recent, setRecent] = useState<CueFireEvent[]>([]);
  const [, setTick] = useState(0);
  const fires = useRef(new Map<string, FireStat>());
  const [dragOver, setDragOver] = useState(false);

  const manifest = listing?.manifest ?? sfx.getManifest();

  const load = useCallback(async () => {
    setError(null);
    try {
      const l = await fetchSounds();
      setListing(l);
      sfx.setManifest(l.manifest);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => reportDevToolState('sound', open), [open]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenSoundDetail>).detail ?? {};
      setOpen(true);
      if (detail.cue) {
        setFocus(detail.cue);
        setQuery(detail.cue);
      }
    };
    const onClose = (e: Event) => {
      if ((e as CustomEvent<CloseDevToolsDetail>).detail?.except !== 'sound') setOpen(false);
    };
    window.addEventListener(OPEN_SOUND_EVENT, onOpen);
    window.addEventListener(CLOSE_DEV_TOOLS_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_SOUND_EVENT, onOpen);
      window.removeEventListener(CLOSE_DEV_TOOLS_EVENT, onClose);
    };
  }, []);

  // Live feed from the engine, only while the console is open.
  useEffect(() => {
    if (!open) return;
    const timers: number[] = [];
    const off = sfx.onFire((e) => {
      const cur = fires.current.get(e.id);
      fires.current.set(e.id, { count: (cur?.count ?? 0) + 1, last: e.at, audible: e.audible });
      setRecent((r) => [e, ...r].slice(0, 14));
      setTick((t) => t + 1);
      timers.push(window.setTimeout(() => setTick((t) => t + 1), FLASH_MS));
    });
    return () => {
      off();
      for (const t of timers) window.clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest?.('input')) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const assign = useCallback(
    async (cue: string, file: File) => {
      setBusyCue(cue);
      setError(null);
      try {
        const r = await uploadSound(cue, file, listing?.maxBytes ?? 4 * 1048576);
        sfx.setManifest(r.manifest);
        setStatus(`Saved public/audio/${r.file} (${fmtBytes(r.bytes)})`);
        await load();
        // Give the dev server's file watcher a beat to notice the new file.
        window.setTimeout(() => sfx.audition(cue), 400);
      } catch (err) {
        setError(`${cue}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setBusyCue(null);
      }
    },
    [listing, load],
  );

  const clear = useCallback(
    async (cue: string) => {
      setBusyCue(cue);
      setError(null);
      try {
        const r = await clearSound(cue);
        sfx.setManifest(r.manifest);
        setStatus(r.removed ? `Removed ${r.removed}` : `${cue} had no file`);
        await load();
      } catch (err) {
        setError(String(err));
      } finally {
        setBusyCue(null);
      }
    },
    [load],
  );

  /** Files dropped on the console itself: each must be named after its cue. */
  const onConsoleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = [...e.dataTransfer.files];
    const unknown: string[] = [];
    for (const f of files) {
      const id = cueIdFromFile(f.name);
      if (id && isCueId(id)) await assign(id, f);
      else unknown.push(f.name);
    }
    if (unknown.length) setError(`Not named after a cue (drop it on a row instead): ${unknown.join(', ')}`);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CUES.filter((c) => {
      if (cat !== 'all' && c.category !== cat) return false;
      if (q && !`${c.id} ${c.label} ${c.trigger}`.toLowerCase().includes(q)) return false;
      const has = !!manifest.cues[c.id];
      if (filter === 'missing' && has) return false;
      if (filter === 'assigned' && !has) return false;
      if (filter === 'fired' && !fires.current.has(c.id)) return false;
      return true;
    });
    // fires is a ref; the tick re-render keeps 'fired' current.
  }, [query, cat, filter, manifest]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const assigned = CUES.filter((c) => manifest.cues[c.id]).length;
  const now = performance.now();
  const loops = sfx.activeLoops();

  return (
    <div
      className={`fixed inset-y-0 right-0 z-[2500] flex w-[min(760px,100vw)] flex-col border-l bg-concrete-900 shadow-2xl ${
        dragOver ? 'border-signal' : 'border-white/10'
      }`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => void onConsoleDrop(e)}
      data-sfx="none"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
        <h2 className="mr-1 text-read font-bold uppercase tracking-widest text-signal">Sound</h2>
        <span className="rounded border border-white/15 px-2 py-0.5 text-body text-white/60">
          {assigned} / {CUES.length} cues have a file
        </span>
        {sfx.muted && (
          <span className="rounded border border-hiss/50 px-2 py-0.5 text-body text-hiss" {...tip('Settings → Sound / Sound effects')}>
            muted in settings
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(cueTable(manifest)).then(
                () => setStatus('Copied the cue list as a Markdown table'),
                () => setError('Clipboard blocked'),
              );
            }}
            className="rounded border border-white/15 px-2.5 py-1 text-body text-white/70 hover:bg-white/5"
          >
            Copy list
          </button>
          <button type="button" onClick={() => void load()} className="rounded border border-white/15 px-2.5 py-1 text-body text-white/70 hover:bg-white/5" {...tip('Re-scan public/audio (adopts files you dropped in by hand)')}>
            Rescan
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded border border-white/15 px-2.5 py-1 text-body text-white/70 hover:bg-white/5" {...tip('Esc')}>
            Close
          </button>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cues…"
            className="min-w-[10rem] flex-1 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-body text-white placeholder:text-white/30"
          />
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value as CueCategory | 'all')}
            className="rounded border border-white/10 bg-black/30 px-2 py-1.5 text-body text-white"
          >
            <option value="all">All categories</option>
            {CUE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            {(['all', 'missing', 'assigned', 'fired'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded border px-2 py-1 text-label uppercase ${
                  filter === f ? 'border-signal/60 text-signal' : 'border-white/10 text-white/50 hover:bg-white/5'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <p className="w-full text-micro text-white/40">
          Drop a file on a row to assign it, or drop files named <code className="text-white/60">&lt;cue id&gt;.ogg</code> anywhere here. Files land in
          <code className="text-white/60"> public/audio/</code>; settings go to <code className="text-white/60">manifest.json</code>. Keep the console open while
          you play to see cues fire.
        </p>
        {(status || error) && (
          <p className={`w-full truncate text-body ${error ? 'text-hiss' : 'text-white/50'}`}>{error ?? status}</p>
        )}
      </header>

      <div className="flex min-h-[2.25rem] flex-wrap items-center gap-1 border-b border-white/10 px-4 py-1.5" aria-live="off">
        <span className="mr-1 text-label uppercase text-white/35">Live</span>
        {recent.length === 0 && <span className="text-micro text-white/30">nothing fired yet — play the game</span>}
        {recent.map((e, i) => (
          <button
            key={`${e.id}-${e.at}-${i}`}
            type="button"
            onClick={() => {
              setQuery(e.id);
              setFocus(e.id);
            }}
            className={`rounded px-1.5 py-0.5 text-micro ${
              e.audible ? 'bg-astral/20 text-astral' : 'bg-white/5 text-white/45'
            } ${now - e.at < FLASH_MS ? 'ring-1 ring-signal/70' : ''}`}
            {...tip(e.audible ? 'Played' : 'Fired — no file assigned (or muted)')}
          >
            {e.loopOn === false ? '■ ' : e.loopOn ? '▶ ' : ''}
            {e.id}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {CUE_CATEGORIES.filter((c) => filtered.some((x) => x.category === c.id)).map((c) => (
          <section key={c.id}>
            <h3 className="sticky top-0 z-10 border-b border-white/10 bg-concrete-900 px-4 py-1.5 text-label uppercase tracking-widest text-white/45">
              {c.label}
            </h3>
            <ul>
              {filtered
                .filter((x) => x.category === c.id)
                .map((def) => (
                  <CueRow
                    key={def.id}
                    def={def}
                    manifest={manifest}
                    size={listing?.sizes[manifest.cues[def.id]?.file ?? ''] ?? null}
                    stat={fires.current.get(def.id) ?? null}
                    looping={loops.has(def.id)}
                    now={now}
                    busy={busyCue === def.id}
                    focused={focus === def.id}
                    onAssign={(f) => void assign(def.id, f)}
                    onClear={() => void clear(def.id)}
                    onManifest={(m) => {
                      sfx.setManifest(m);
                      setListing((l) => (l ? { ...l, manifest: m } : l));
                    }}
                    onError={setError}
                  />
                ))}
            </ul>
          </section>
        ))}
        {listing && listing.orphans.length > 0 && (
          <p className="border-t border-white/10 px-4 py-2 text-micro text-white/40">
            Files in public/audio no cue uses: {listing.orphans.map((o) => o.file).join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}

function CueRow({
  def,
  manifest,
  size,
  stat,
  looping,
  now,
  busy,
  focused,
  onAssign,
  onClear,
  onManifest,
  onError,
}: {
  def: CueDef;
  manifest: AudioManifest;
  size: number | null;
  stat: FireStat | null;
  looping: boolean;
  now: number;
  busy: boolean;
  focused: boolean;
  onAssign: (f: File) => void;
  onClear: () => void;
  onManifest: (m: AudioManifest) => void;
  onError: (e: string) => void;
}) {
  const asset = manifest.cues[def.id];
  const [vol, setVol] = useState(asset?.volume ?? def.volume ?? 0.8);
  const [pitch, setPitch] = useState(asset?.pitchVar ?? def.pitchVar ?? 0);
  const [loop, setLoop] = useState(asset?.loop ?? !!def.loop);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | null>(null);
  const rowRef = useRef<HTMLLIElement>(null);

  // Re-seed the fields when the manifest entry changes underneath (upload, rescan).
  useEffect(() => {
    setVol(asset?.volume ?? def.volume ?? 0.8);
    setPitch(asset?.pitchVar ?? def.pitchVar ?? 0);
    setLoop(asset?.loop ?? !!def.loop);
  }, [asset?.file, asset?.rev, def]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ block: 'center' });
  }, [focused]);

  const save = (patch: { volume?: number; pitchVar?: number; loop?: boolean }) => {
    if (!asset) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveSoundSettings(def.id, patch).then((r) => onManifest(r.manifest), (err) => onError(String(err)));
    }, 300);
  };

  const lit = !!stat && now - stat.last < FLASH_MS;
  const firing = lit || looping;

  return (
    <li
      ref={rowRef}
      className={`grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 border-b border-white/5 px-4 py-2.5 ${
        over ? 'bg-signal/10' : focused ? 'bg-white/[0.04]' : ''
      }`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onAssign(f);
      }}
    >
      <span
        className={`mt-1.5 h-2.5 w-2.5 rounded-full transition-colors duration-200 ${
          firing ? (stat?.audible || (looping && asset) ? 'bg-astral shadow-[0_0_8px_rgba(120,200,255,0.9)]' : 'bg-white/70') : stat ? 'bg-white/20' : 'bg-white/[0.06]'
        }`}
        {...tip(firing ? 'Firing now' : stat ? `Fired ${stat.count}×, ${ago(now - stat.last)}` : 'Not fired this session')}
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-body text-white">{def.id}</span>
          <span className="text-body text-white/60">{def.label}</span>
          {def.loop && <Badge>loop</Badge>}
          {def.synth && <Badge title="The ambience synthesises this now; a file replaces it">synth</Badge>}
          {def.duck && <Badge title="Dips the ambience while it plays">ducks</Badge>}
          {def.priority === 3 && <Badge title="Never dropped when voices run out">key</Badge>}
          {stat && (
            <span className="text-micro text-white/35">
              {stat.count}× · {ago(now - stat.last)}
            </span>
          )}
        </div>
        <p className="text-micro text-white/45">{def.trigger}</p>
        <p className="text-micro text-white/30">Suggested length: {def.length}</p>
        {asset && (
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-white/55">
            <label className="flex items-center gap-1.5">
              vol
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={vol}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVol(v);
                  save({ volume: v });
                }}
                className="w-24 accent-[#e8e5dd]"
              />
              <span className="w-8 tabular-nums">{Math.round(vol * 100)}</span>
            </label>
            <label className="flex items-center gap-1.5" {...tip('Random pitch spread, ± semitones')}>
              pitch ±
              <input
                type="range"
                min={0}
                max={6}
                step={0.5}
                value={pitch}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPitch(v);
                  save({ pitchVar: v });
                }}
                className="w-20 accent-[#e8e5dd]"
              />
              <span className="w-6 tabular-nums">{pitch}</span>
            </label>
            {def.loop && (
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(e) => {
                    setLoop(e.target.checked);
                    save({ loop: e.target.checked });
                  }}
                />
                loop
              </label>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!asset || busy}
            onClick={() => sfx.audition(def.id, { volume: vol, pitchVar: pitch })}
            className="rounded border border-white/15 px-2 py-1 text-body text-white/80 hover:bg-white/5 disabled:opacity-30"
            {...tip('Play')}
          >
            ▶
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded border border-white/15 px-2 py-1 text-body text-white/70 hover:bg-white/5 disabled:opacity-30"
          >
            {asset ? 'Replace' : 'Choose…'}
          </button>
          {asset && (
            <button
              type="button"
              disabled={busy}
              onClick={onClear}
              className="rounded border border-white/15 px-2 py-1 text-body text-white/50 hover:border-hiss/50 hover:text-hiss disabled:opacity-30"
              {...tip('Delete the file and unassign')}
            >
              ✕
            </button>
          )}
        </div>
        <span className={`max-w-[14rem] truncate text-right text-micro ${asset ? 'text-white/60' : 'text-white/25'}`}>
          {busy ? 'saving…' : asset ? `${asset.file}${size ? ` · ${fmtBytes(size)}` : ''}` : 'no file — drop one here'}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onAssign(f);
          }}
        />
      </div>
    </li>
  );
}

function Badge({ children, title }: { children: string; title?: string }) {
  return (
    <span className="rounded border border-white/15 px-1 text-micro uppercase text-white/45" {...(title ? tip(title) : {})}>
      {children}
    </span>
  );
}
