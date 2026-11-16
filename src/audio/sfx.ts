import { audioContext, existingAudioContext } from './context';
import {
  cueDef,
  EMPTY_MANIFEST,
  type AudioManifest,
  type CueAsset,
  type CueDef,
  type CueId,
} from './cues';

// ---------------------------------------------------------------------------
// Cue engine: plays the audio file assigned to a cue.
//
// Cost model, because it runs inside a game that must idle at zero work:
// - `play()` on a cue with no file, or while muted, returns after two map
//   lookups. Nothing is created, nothing is scheduled.
// - Files are fetched and decoded lazily, once, after the first user gesture.
// - Each sound is one BufferSource → Gain → bus; sources free themselves when
//   they end. No timers, no animation frames, no polling.
// - Browsers only start audio after a gesture, so nothing plays before
//   `unlock()` runs from a pointer/key handler.
// ---------------------------------------------------------------------------

export interface PlayOptions {
  /** Start this many ms from now (lines a cue up with an animation). */
  delayMs?: number;
  /** Extra gain on top of the cue's own, 0..1. */
  volume?: number;
}

export interface CueFireEvent {
  id: string;
  /** performance.now() when the game fired it. */
  at: number;
  /** A file is assigned and it was audible (not muted, context running). */
  audible: boolean;
  /** For loops: true on start, false on stop. Undefined for one-shots. */
  loopOn?: boolean;
}

/** Hard cap on simultaneous one-shots across all cues. */
const MAX_VOICES = 24;
/** A play that arrives before its file is decoded still sounds if decoding lands within this. */
const LATE_START_MS = 250;
/** Ambience dip for cues marked `duck`. */
const DUCK_AMOUNT = 0.55;

interface Voice {
  id: string;
  priority: number;
  src: AudioBufferSourceNode;
  startedAt: number;
}

function semitoneRate(spread: number): number {
  if (spread <= 0) return 1;
  // Cosmetic randomness — outside src/game, Math.random is fine.
  const st = (Math.random() * 2 - 1) * spread;
  return Math.pow(2, st / 12);
}

class SfxEngine {
  private manifest: AudioManifest = EMPTY_MANIFEST;
  private manifestLoaded = false;
  private manifestPromise: Promise<void> | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private decoded = new Map<string, AudioBuffer>();
  private bus: GainNode | null = null;
  private master = 1;
  private effects = 1;
  private unlocked = false;
  private voices: Voice[] = [];
  private loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  /** Loops the game wants on, whether or not they can sound right now. */
  private wantedLoops = new Set<string>();
  private lastFire = new Map<string, number>();
  private listeners = new Set<(e: CueFireEvent) => void>();
  private ducker: ((amount: number, seconds: number) => void) | null = null;

  // ---- configuration ------------------------------------------------------

  /** Master (the Sound setting) and effects (Sound effects setting), 0..1 each. */
  setVolumes(master: number, effects: number): void {
    this.master = Math.max(0, Math.min(1, master));
    this.effects = Math.max(0, Math.min(1, effects));
    const ctx = existingAudioContext();
    if (ctx && this.bus) this.bus.gain.setTargetAtTime(this.gain(), ctx.currentTime, 0.05);
    if (this.gain() === 0) this.stopAllLoops();
    else this.syncLoops();
  }

  /** True while every effect would be silent anyway. */
  get muted(): boolean {
    return this.gain() === 0;
  }

  setDucker(fn: (amount: number, seconds: number) => void): void {
    this.ducker = fn;
  }

  /** Replace the manifest (DEV console after an upload or a settings edit). */
  setManifest(m: AudioManifest): void {
    const prev = this.manifest;
    this.manifest = m;
    this.manifestLoaded = true;
    // Drop decoded buffers whose file or revision changed.
    for (const id of [...this.buffers.keys()]) {
      const a = prev.cues[id];
      const b = m.cues[id];
      if (!b || !a || a.file !== b.file || a.rev !== b.rev) {
        this.buffers.delete(id);
        this.decoded.delete(id);
      }
    }
    // Restart running loops so a new file or setting takes effect.
    for (const id of [...this.loops.keys()]) this.stopLoopVoice(id);
    if (this.unlocked) this.preload();
    this.syncLoops();
  }

  getManifest(): AudioManifest {
    return this.manifest;
  }

  /** The asset assigned to a cue, if any. */
  asset(id: string): CueAsset | undefined {
    return this.manifest.cues[id];
  }

  /** A file is assigned to this cue. */
  has(id: CueId): boolean {
    return !!this.manifest.cues[id];
  }

  // ---- lifecycle ------------------------------------------------------------

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.unlocked) {
      const ctx = existingAudioContext();
      if (ctx?.state === 'suspended' && !document.hidden) void ctx.resume();
      return;
    }
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const bus = ctx.createGain();
    bus.gain.value = this.gain();
    // Light limiter so stacked hits don't clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    bus.connect(comp).connect(ctx.destination);
    this.bus = bus;
    this.unlocked = true;
    void this.loadManifest().then(() => {
      this.preload();
      this.syncLoops();
    });
  }

  /** Fetch the manifest once. In DEV it comes from the dev server, which also adopts dropped-in files. */
  loadManifest(force = false): Promise<void> {
    if (this.manifestPromise && !force) return this.manifestPromise;
    const url = import.meta.env.DEV
      ? '/__dev/audio'
      : `${import.meta.env.BASE_URL}audio/manifest.json`;
    this.manifestPromise = fetch(url, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        const m = (body as { manifest?: AudioManifest } | AudioManifest | null) ?? null;
        const manifest = m && 'manifest' in m ? m.manifest : (m as AudioManifest | null);
        if (manifest && typeof manifest === 'object' && manifest.cues) this.setManifest(manifest);
      })
      .catch(() => {
        /* no manifest: every cue stays silent */
      });
    return this.manifestPromise;
  }

  // ---- playback -------------------------------------------------------------

  /**
   * Fire a one-shot cue. Returns true when it will be heard (a file is
   * assigned and sound is on), so callers with a synth fallback can skip it.
   */
  play(id: CueId, opts: PlayOptions = {}): boolean {
    const asset = this.manifest.cues[id];
    const audible = !!asset && this.unlocked && this.gain() > 0;
    if (this.listeners.size) this.emit({ id, at: performance.now(), audible });
    if (!audible || !asset) return false;
    const def = cueDef(id);
    if (!def) return false;

    const now = performance.now();
    const gap = def.minGapMs ?? 0;
    const last = this.lastFire.get(id);
    if (gap > 0 && last !== undefined && now - last < gap) return true;
    this.lastFire.set(id, now);

    const buf = this.decoded.get(id);
    if (buf) {
      this.start(id, def, asset, buf, opts);
    } else {
      const requested = now;
      void this.load(id).then((b) => {
        if (b && performance.now() - requested < LATE_START_MS + (opts.delayMs ?? 0)) {
          this.start(id, def, asset, b, opts);
        }
      });
    }
    if (def.duck && this.ducker) {
      this.ducker(DUCK_AMOUNT, Math.min(4, (buf?.duration ?? 1.5) + (opts.delayMs ?? 0) / 1000));
    }
    return true;
  }

  /** Audition a cue from the DEV console, ignoring cooldowns and voice caps. */
  audition(id: string, override?: Partial<CueAsset>): void {
    this.unlock();
    const asset = { ...this.manifest.cues[id], ...override } as CueAsset;
    const def = cueDef(id);
    if (!def || !asset.file) return;
    void this.load(id).then((b) => {
      if (b) this.start(id, def, asset, b, {}, true);
    });
  }

  /** Start or stop a looping cue. Idempotent; remembered while muted. */
  loop(id: CueId, on: boolean): void {
    const was = this.wantedLoops.has(id);
    if (on === was) return;
    if (on) this.wantedLoops.add(id);
    else this.wantedLoops.delete(id);
    if (this.listeners.size) {
      this.emit({ id, at: performance.now(), audible: on && !!this.manifest.cues[id] && !this.muted, loopOn: on });
    }
    if (on) this.syncLoops();
    else this.stopLoopVoice(id);
  }

  /** Loops currently requested by the game (DEV console). */
  activeLoops(): ReadonlySet<string> {
    return this.wantedLoops;
  }

  /** Stop every loop and forget them (leaving the game screen). */
  stopLoops(): void {
    this.wantedLoops.clear();
    this.stopAllLoops();
  }

  // ---- DEV hooks -----------------------------------------------------------

  /** Subscribe to every fire, audible or not. Only the DEV console listens. */
  onFire(fn: (e: CueFireEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---- internals ------------------------------------------------------------

  private gain(): number {
    return this.master * this.effects;
  }

  private emit(e: CueFireEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  private preload(): void {
    for (const id of Object.keys(this.manifest.cues)) void this.load(id);
  }

  private load(id: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(id);
    if (cached) return cached;
    const asset = this.manifest.cues[id];
    const ctx = existingAudioContext();
    if (!asset || !ctx) return Promise.resolve(null);
    const url = `${import.meta.env.BASE_URL}audio/${encodeURIComponent(asset.file)}${asset.rev ? `?v=${encodeURIComponent(asset.rev)}` : ''}`;
    const p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => {
        // Ignore a decode that finished after the asset was replaced.
        const now = this.manifest.cues[id];
        if (now && now.file === asset.file && now.rev === asset.rev) this.decoded.set(id, buf);
        return buf;
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.warn(`[sfx] could not load ${asset.file}:`, err);
        // Forget the failure so a later play retries (the dev server can lag a
        // moment behind a fresh upload and serve the page instead of the file).
        if (this.buffers.get(id) === p) this.buffers.delete(id);
        return null;
      });
    this.buffers.set(id, p);
    return p;
  }

  private start(
    id: string,
    def: CueDef,
    asset: CueAsset,
    buf: AudioBuffer,
    opts: PlayOptions,
    force = false,
  ): void {
    const ctx = existingAudioContext();
    if (!ctx || !this.bus) return;
    if (!force && !this.claimVoice(id, def)) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = semitoneRate(asset.pitchVar ?? def.pitchVar ?? 0);
    const g = ctx.createGain();
    g.gain.value = (asset.volume ?? def.volume ?? 0.8) * (opts.volume ?? 1);
    src.connect(g).connect(this.bus);
    const when = ctx.currentTime + Math.max(0, (opts.delayMs ?? 0) / 1000);
    const voice: Voice = { id, priority: def.priority, src, startedAt: when };
    this.voices.push(voice);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
    };
    src.start(when);
  }

  /** Make room for one more voice of this cue; false when it should be dropped. */
  private claimVoice(id: string, def: CueDef): boolean {
    const mine = this.voices.filter((v) => v.id === id);
    const cap = def.maxVoices ?? 3;
    if (mine.length >= cap) this.kill(mine[0]!);
    if (this.voices.length < MAX_VOICES) return true;
    // Steal the oldest voice of the lowest priority, if it is not above ours.
    let victim: Voice | null = null;
    for (const v of this.voices) {
      if (!victim || v.priority < victim.priority || (v.priority === victim.priority && v.startedAt < victim.startedAt)) {
        victim = v;
      }
    }
    if (!victim || victim.priority > def.priority) return false;
    this.kill(victim);
    return true;
  }

  private kill(v: Voice): void {
    try {
      v.src.stop();
    } catch {
      /* already stopped */
    }
  }

  /** Bring running loops in line with what the game wants and what can sound. */
  private syncLoops(): void {
    if (!this.unlocked || this.gain() === 0) return;
    for (const id of this.wantedLoops) {
      if (this.loops.has(id)) continue;
      const asset = this.manifest.cues[id];
      const def = cueDef(id);
      if (!asset || !def) continue;
      void this.load(id).then((buf) => {
        const ctx = existingAudioContext();
        if (!buf || !ctx || !this.bus || !this.wantedLoops.has(id) || this.loops.has(id) || this.gain() === 0) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = asset.loop ?? true;
        const g = ctx.createGain();
        const target = asset.volume ?? def.volume ?? 0.5;
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.25);
        src.connect(g).connect(this.bus);
        src.start(0, Math.random() * buf.duration);
        src.onended = () => {
          src.disconnect();
          g.disconnect();
          if (this.loops.get(id)?.src === src) this.loops.delete(id);
        };
        this.loops.set(id, { src, gain: g });
      });
    }
  }

  private stopLoopVoice(id: string): void {
    const l = this.loops.get(id);
    const ctx = existingAudioContext();
    if (!l || !ctx) return;
    this.loops.delete(id);
    const t = ctx.currentTime;
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setValueAtTime(l.gain.gain.value, t);
    l.gain.gain.linearRampToValueAtTime(0, t + 0.3);
    try {
      l.src.stop(t + 0.32);
    } catch {
      /* already stopped */
    }
  }

  private stopAllLoops(): void {
    for (const id of [...this.loops.keys()]) this.stopLoopVoice(id);
  }

  /** For tests and the DEV console. */
  get loaded(): boolean {
    return this.manifestLoaded;
  }
}

/** One engine per page. */
export const sfx = new SfxEngine();

/** Setting value → effects volume. */
export function effectsVolume(setting: string): number {
  if (setting === 'off') return 0;
  if (setting === 'quiet') return 0.5;
  return 1;
}
