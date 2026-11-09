import type { TimeOfDay, WeatherKind } from '../game/types';

// ---------------------------------------------------------------------------
// Procedural ambience — every sound is synthesised with the Web Audio API, so
// there are no asset files to ship, cache or license.
//
// Layers (always-on, crossfaded from `update`):
//   bed      brown-noise city wind that gusts; lower and hollower after dark, a rumble below ground
//   rain     a soft low wash plus scheduled droplet ticks (raw white noise reads as static)
//   insects  tropical night chorus (AM'd high partials) — not underground, not in a storm
//   heart    heartbeat when HP is low, faster as it drops
// One-shots (rolled 4× a second, cosmetic Math.random is fine outside src/game):
//   groan    distant infected; rate and closeness rise with horde pressure and darkness
//   koel     the rising "ko-EL" of the Asian koel — daytime, falls silent as the horde closes
//   crow     house crows cawing over empty streets — daytime
//   gecko    "chik-chik-chik" — the house gecko every Singaporean knows
//   clank    metal knocked over somewhere you can't see
//   thunder  storm only
//   drip     tunnels only, with echo
//
// The beds stay quiet on purpose: they are the room, and the one-shots must
// read clearly over them.
// Stingers: nightfall (far-off PWS-style siren + drone), contact (dissonant hit).
//
// Browsers only start audio after a user gesture, so nothing plays until
// `unlock()` runs from a pointer/key handler.
// ---------------------------------------------------------------------------

export interface AmbienceParams {
  band: TimeOfDay;
  weather: WeatherKind;
  /** Local horde pressure, 0..1. */
  dread: number;
  /** Share of sight after dark (nightSight.sightFactor), 0..1. */
  sight: number;
  /** Current HP / max HP, 0..1. */
  hpFrac: number;
  inCombat: boolean;
  /** In a tunnel run. */
  underground: boolean;
}

export type StingerKind = 'nightfall' | 'contact';

const DEFAULT_PARAMS: AmbienceParams = {
  band: 'day',
  weather: 'clear',
  dread: 0,
  sight: 1,
  hpFrac: 1,
  inCombat: false,
  underground: false,
};

/** Seconds for a layer to glide to a new level. */
const GLIDE = 2.5;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

class AmbienceEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;

  private bedGain: GainNode | null = null;
  private bedFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private dropBus: GainNode | null = null;
  private insectGain: GainNode | null = null;

  private params: AmbienceParams = DEFAULT_PARAMS;
  private volume = 0;
  private tick: number | null = null;
  private nextBeatAt = 0;
  private started = false;
  /** Wind level and cutoff before gusting; set by `applyLayers`. */
  private bedBase = 0;
  private cutoffBase = 900;
  private nextGustAt = 0;
  private skyThunder = false;

  /** 0 = muted, 1 = full. Takes effect immediately. */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.volume * 0.9, this.ctx.currentTime, 0.3);
    }
    if (this.volume === 0) this.stopLoop();
    else if (this.started) this.startLoop();
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.volume === 0) return;
    if (!this.ctx) this.build();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    this.started = true;
    this.startLoop();
  }

  /** Pause output while the tab is hidden; resume when it returns. */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else if (this.volume > 0 && this.started) void this.ctx.resume();
  }

  update(p: AmbienceParams): void {
    this.params = p;
    this.applyLayers();
  }

  /**
   * While lightning is drawn on the map, the flashes own the storm's thunder:
   * the random roll stops and each strike calls `strike`.
   */
  setSkyThunder(on: boolean): void {
    this.skyThunder = on;
  }

  /** Thunder for a strike just seen, `delay` seconds behind the flash. */
  strike(delay: number): void {
    if (!this.ready() || this.params.underground || this.params.weather !== 'thunderstorm') return;
    this.thunder(delay);
  }

  stinger(kind: StingerKind): void {
    if (!this.ready()) return;
    if (kind === 'nightfall') this.siren();
    else this.contactHit();
  }

  /** Stop the loop and silence the beds (leaving the game screen). */
  quiet(): void {
    this.stopLoop();
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    this.started = false;
  }

  // ---- setup ---------------------------------------------------------------

  private ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && this.volume > 0;
  }

  private build(): void {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.volume * 0.9;
    // Gentle limiter so stacked one-shots never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    this.master = master;

    // Cheap generated-impulse reverb as a send bus: distance and concrete.
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(2.8, 2.2);
    const send = ctx.createGain();
    send.gain.value = 0.55;
    send.connect(conv).connect(master);
    this.reverb = send;

    this.noise = this.makeNoise(4, false);
    this.brown = this.makeNoise(6, true);

    // bed
    const bed = this.loop(this.brown);
    this.bedFilter = ctx.createBiquadFilter();
    this.bedFilter.type = 'lowpass';
    this.bedFilter.frequency.value = 800;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0;
    bed.connect(this.bedFilter).connect(this.bedGain).connect(master);

    // rain: a low wash that swells slowly (the droplets on top come from `step`)
    const rain = this.loop(this.noise);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const swellG = ctx.createGain();
    swellG.gain.value = 1;
    const rainSwell = ctx.createOscillator();
    rainSwell.frequency.value = 0.06;
    const rainSwellDepth = ctx.createGain();
    rainSwellDepth.gain.value = 0.35;
    rainSwell.connect(rainSwellDepth).connect(swellG.gain);
    rainSwell.start();
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(hp).connect(lp).connect(swellG).connect(this.rainGain).connect(master);
    this.dropBus = ctx.createGain();
    this.dropBus.gain.value = 1;
    this.dropBus.connect(master);

    // insects: two close high partials, amplitude-chopped by a fast LFO
    this.insectGain = ctx.createGain();
    this.insectGain.gain.value = 0;
    const chop = ctx.createGain();
    chop.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 23;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(chop.gain);
    // Slow swell on top so the chorus breathes instead of droning.
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.13;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.25;
    swell.connect(swellDepth).connect(chop.gain);
    for (const f of [4180, 4630, 5210]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.33;
      o.connect(g).connect(chop);
      o.start();
    }
    lfo.start();
    swell.start();
    const insectPan = ctx.createStereoPanner();
    insectPan.pan.value = -0.3;
    chop.connect(this.insectGain).connect(insectPan).connect(master);

    this.applyLayers();
  }

  private makeNoise(seconds: number, brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else {
          d[i] = w;
        }
      }
    }
    return buf;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(0, Math.random() * buf.duration);
    return src;
  }

  private applyLayers(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bedGain || !this.bedFilter || !this.rainGain || !this.insectGain) return;
    const t = ctx.currentTime;
    const p = this.params;
    const night = p.band === 'night' ? 1 : p.band === 'dusk' ? 0.5 : 0;

    let bed = 0.035 + night * 0.03 + p.dread * 0.02;
    let cutoff = 900 - night * 480 - p.dread * 150;
    if (p.underground) {
      bed = 0.11;
      cutoff = 170;
    }
    this.bedBase = bed;
    this.cutoffBase = Math.max(120, cutoff);
    this.bedGain.gain.setTargetAtTime(bed, t, GLIDE);
    this.bedFilter.frequency.setTargetAtTime(this.cutoffBase, t, GLIDE);

    this.rainGain.gain.setTargetAtTime(this.rainLevel() * 0.45, t, GLIDE);

    // Insects fall silent when the horde is thick — the quiet is the warning.
    const wet = p.weather === 'thunderstorm' || p.weather === 'rain';
    const insects = p.underground || wet ? 0 : night * 0.014 * (1 - p.dread * 0.8);
    this.insectGain.gain.setTargetAtTime(insects, t, GLIDE * 1.5);
  }

  /** 0 dry, ~0.06 rain, ~0.11 storm. */
  private rainLevel(): number {
    const p = this.params;
    if (p.underground) return 0;
    return p.weather === 'thunderstorm' ? 0.11 : p.weather === 'rain' ? 0.06 : 0;
  }

  /** Every few seconds the wind picks a new strength, so the bed breathes. */
  private gust(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (now < this.nextGustAt || !this.bedGain || !this.bedFilter) return;
    this.nextGustAt = now + rand(2.5, 7);
    // Below ground the air barely moves.
    const g = this.params.underground ? rand(0.85, 1.15) : rand(0.45, 1.7);
    this.bedGain.gain.setTargetAtTime(this.bedBase * g, now, rand(0.8, 2));
    this.bedFilter.frequency.setTargetAtTime(this.cutoffBase * (0.7 + 0.45 * g), now, 1.2);
  }

  // ---- event loop ----------------------------------------------------------

  private startLoop(): void {
    if (this.tick !== null) return;
    this.tick = window.setInterval(() => this.step(), 250);
  }

  private stopLoop(): void {
    if (this.tick === null) return;
    window.clearInterval(this.tick);
    this.tick = null;
  }

  /** Runs 4× a second; one-shot rates below are per second. */
  private step(): void {
    if (!this.ready()) return;
    const p = this.params;
    const dt = 0.25;
    const night = p.band === 'night' ? 1 : p.band === 'dusk' ? 0.5 : 0;
    const dark = 1 - p.sight;

    this.heartbeat();
    this.gust();

    const groanRate =
      0.025 + p.dread * 0.06 + night * 0.04 + dark * 0.03 + (p.inCombat ? 0.08 : 0);
    if (Math.random() < groanRate * dt) this.groan();

    if (p.underground) {
      if (Math.random() < 0.2 * dt) this.drip();
      return;
    }

    // Droplets for the next tick window, scheduled ahead so they never bunch.
    const rain = this.rainLevel();
    if (rain > 0) {
      const n = Math.round((rain > 0.08 ? 45 : 22) * dt * rand(0.7, 1.3));
      const t0 = this.ctx!.currentTime + 0.05;
      for (let i = 0; i < n; i++) this.drop(t0 + Math.random() * dt, rain);
    }

    // Birds own the daylight; the horde thins them out, rain mostly hushes them.
    const day = p.band === 'day' ? 1 : p.band === 'dusk' ? 0.4 : 0;
    const birds = day * (1 - p.dread * 0.8) * (p.weather === 'thunderstorm' ? 0 : rain > 0 ? 0.35 : 1);
    if (birds > 0 && Math.random() < 0.03 * birds * dt) this.koel();
    if (birds > 0 && Math.random() < 0.035 * birds * dt) this.crow();

    if (night > 0 && p.weather !== 'thunderstorm' && Math.random() < 0.02 * night * dt) {
      this.gecko();
    }
    if (Math.random() < (0.004 + night * 0.01 + p.dread * 0.006) * dt) this.clank();
    if (!this.skyThunder && p.weather === 'thunderstorm' && Math.random() < 0.025 * dt) this.thunder();
  }

  // ---- voices ----------------------------------------------------------------

  private out(pan: number, dry: number, wet: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(panner);
    const dryG = ctx.createGain();
    dryG.gain.value = dry;
    panner.connect(dryG).connect(this.master!);
    const wetG = ctx.createGain();
    wetG.gain.value = wet;
    panner.connect(wetG).connect(this.reverb!);
    return g;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }

  private heartbeat(): void {
    const p = this.params;
    const ctx = this.ctx!;
    // Starts below 40% HP; a pitch-dark trek with the horde close also gets one.
    const fear = Math.max(
      p.hpFrac < 0.4 ? (0.4 - p.hpFrac) / 0.4 : 0,
      p.band === 'night' && p.sight < 0.35 && p.dread > 0.55 ? 0.25 : 0,
    );
    if (fear <= 0) return;
    const now = ctx.currentTime;
    const period = 60 / (64 + fear * 70);
    const vol = 0.25 + fear * 0.35;
    if (this.nextBeatAt < now) this.nextBeatAt = now + 0.05;
    // Schedule ahead of the 250 ms tick so the rhythm stays sample-accurate.
    while (this.nextBeatAt < now + 0.35) {
      const t = this.nextBeatAt;
      this.nextBeatAt += period;
      for (const [off, v] of [[0, 1], [0.17, 0.6]] as const) {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(62, t + off);
        o.frequency.exponentialRampToValueAtTime(38, t + off + 0.12);
        const g = this.out(0, 1, 0);
        this.env(g, t + off, vol * v, 0.008, 0.02, 0.14);
        o.connect(g);
        o.start(t + off);
        o.stop(t + off + 0.25);
      }
    }
  }

  private groan(): void {
    const ctx = this.ctx!;
    const p = this.params;
    const t = ctx.currentTime + 0.05;
    // How close it sounds: horde pressure and darkness both bring it in.
    const close = Math.min(1, Math.random() * (0.35 + p.dread * 0.45 + (1 - p.sight) * 0.35));
    const dur = rand(1.4, 3.2);
    const f0 = rand(68, 125);

    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0 * 1.08, t);
    src.frequency.linearRampToValueAtTime(f0, t + dur * 0.3);
    src.frequency.exponentialRampToValueAtTime(f0 * 0.78, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = rand(4, 7);
    const vibD = ctx.createGain();
    vibD.gain.value = f0 * 0.03;
    vib.connect(vibD).connect(src.frequency);

    // Two vowel formants ("uhhh" → "aww") summed. Wide enough to keep the
    // throat in it; narrow ones whistle and get lost under the wind.
    const sum = ctx.createGain();
    for (const [f, q, g] of [[rand(480, 650), 3.5, 1], [rand(950, 1250), 5, 0.6]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f, t);
      bp.frequency.linearRampToValueAtTime(f * 1.15, t + dur);
      bp.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = g;
      src.connect(bp).connect(gg).connect(sum);
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800 + close * 2600;
    const g = this.out(rand(-0.9, 0.9), 0.45 + close * 0.55, 0.9 - close * 0.4);
    this.env(g, t, 0.12 + close * 0.3, rand(0.25, 0.6), dur * 0.4, dur * 0.6);
    sum.connect(lp).connect(g);
    src.start(t);
    vib.start(t);
    src.stop(t + dur * 1.2 + 0.1);
    vib.stop(t + dur * 1.2 + 0.1);
  }

  /** One raindrop on a hard surface: a tiny filtered click, panned anywhere. */
  private drop(t: number, level: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(1800, 6000);
    bp.Q.value = rand(2, 5);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-1, 1);
    const g = ctx.createGain();
    this.env(g, t, level * rand(0.6, 2.2), 0.001, 0.003, rand(0.02, 0.06));
    src.connect(bp).connect(g).connect(pan).connect(this.dropBus!);
    src.start(t, rand(0, 3.5));
    src.stop(t + 0.1);
  }

  /** Asian koel: "ko-EL, ko-EL, ko-EL", each call a little higher and more urgent. */
  private koel(): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.05;
    const n = Math.floor(rand(3, 7));
    const g = this.out(rand(-0.9, 0.9), 0.55, 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    lp.connect(g);
    let f = rand(620, 760);
    let t = t0;
    for (let i = 0; i < n; i++) {
      const vol = 0.05 + (i / n) * 0.035;
      // "ko": short and low
      const a = ctx.createOscillator();
      a.type = 'sine';
      a.frequency.setValueAtTime(f, t);
      const ae = ctx.createGain();
      this.env(ae, t, vol * 0.7, 0.015, 0.06, 0.06);
      a.connect(ae).connect(lp);
      a.start(t);
      a.stop(t + 0.16);
      // "EL": a rising slur
      const tb = t + 0.17;
      const b = ctx.createOscillator();
      b.type = 'triangle';
      b.frequency.setValueAtTime(f * 1.15, tb);
      b.frequency.exponentialRampToValueAtTime(f * 1.55, tb + 0.24);
      const be = ctx.createGain();
      this.env(be, tb, vol, 0.03, 0.15, 0.1);
      b.connect(be).connect(lp);
      b.start(tb);
      b.stop(tb + 0.32);
      t += rand(0.62, 0.78);
      f *= rand(1.04, 1.08);
    }
  }

  /** House crows: two to four harsh "kaaw"s, falling at the end. */
  private crow(): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.05;
    const n = Math.floor(rand(2, 5));
    const g = this.out(rand(-1, 1), 0.5, 0.8);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * rand(0.42, 0.6);
      const dur = rand(0.26, 0.38);
      const f = rand(380, 520);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.05, t + dur * 0.3);
      o.frequency.exponentialRampToValueAtTime(f * 0.72, t + dur);
      // Fast roughness so it rasps instead of buzzing.
      const rough = ctx.createOscillator();
      rough.frequency.value = rand(55, 80);
      const roughD = ctx.createGain();
      roughD.gain.value = f * 0.12;
      rough.connect(roughD).connect(o.frequency);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = rand(1100, 1500);
      bp.Q.value = 2.5;
      const e = ctx.createGain();
      this.env(e, t, 0.22, 0.02, dur * 0.5, dur * 0.5);
      o.connect(bp).connect(e).connect(g);
      o.start(t);
      rough.start(t);
      o.stop(t + dur + 0.05);
      rough.stop(t + dur + 0.05);
    }
  }

  private gecko(): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.05;
    const n = Math.floor(rand(5, 9));
    const pan = rand(-0.8, 0.8);
    const g = this.out(pan, 0.6, 0.4);
    g.gain.value = 1;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * rand(0.11, 0.14);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(2600, t);
      o.frequency.exponentialRampToValueAtTime(1700, t + 0.04);
      const e = ctx.createGain();
      this.env(e, t, 0.06 * (1 - i / (n * 1.6)), 0.004, 0.012, 0.04);
      o.connect(e).connect(g);
      o.start(t);
      o.stop(t + 0.08);
    }
  }

  private clank(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.05;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(1400, 3200);
    bp.Q.value = 25;
    const g = this.out(rand(-1, 1), 0.3, 1);
    this.env(g, t, 0.5, 0.002, 0.01, rand(0.6, 1.2));
    src.connect(bp).connect(g);
    src.start(t, rand(0, 3));
    src.stop(t + 1.5);
  }

  private thunder(delay = rand(0.05, 0.6)): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(rand(300, 600), t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 4);
    const g = this.out(rand(-0.6, 0.6), 1, 0.6);
    this.env(g, t, rand(0.5, 0.9), 0.04, 0.3, rand(3, 5));
    src.connect(lp).connect(g);
    src.start(t, rand(0, 2));
    src.stop(t + 6);
  }

  private drip(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.05;
    const o = ctx.createOscillator();
    const f = rand(1300, 2600);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.05);
    const g = this.out(rand(-1, 1), 0.4, 1);
    this.env(g, t, 0.06, 0.002, 0.005, 0.07);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.12);
  }

  /** A civil-defence wail a long way off, as the light goes. */
  private siren(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.1;
    const dur = 11;
    const g = this.out(rand(-0.7, 0.7), 0.35, 1);
    this.env(g, t, 0.06, 2.5, dur - 6, 3.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    lp.connect(g);
    for (const mult of [1, 1.5]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const sweep = ctx.createOscillator();
      sweep.frequency.value = 0.22;
      const depth = ctx.createGain();
      depth.gain.value = 110 * mult;
      sweep.connect(depth).connect(o.frequency);
      o.frequency.value = 520 * mult;
      const og = ctx.createGain();
      og.gain.value = mult === 1 ? 1 : 0.35;
      o.connect(og).connect(lp);
      o.start(t);
      sweep.start(t);
      o.stop(t + dur);
      sweep.stop(t + dur);
    }
    // Low drone underneath — the city settling into the dark.
    const d = ctx.createOscillator();
    d.frequency.value = 41;
    const dg = this.out(0, 1, 0.3);
    this.env(dg, t, 0.12, 4, 3, 5);
    d.connect(dg);
    d.start(t);
    d.stop(t + 12.5);
  }

  /** The moment something comes at you. */
  private contactHit(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.02;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 1.3);
    const g = this.out(0, 1, 0.5);
    this.env(g, t, 0.22, 0.01, 0.15, 1.4);
    lp.connect(g);
    for (const f of [98, 103.8, 146.8, 207.6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 1.03, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.3);
      o.connect(lp);
      o.start(t);
      o.stop(t + 1.8);
    }
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.value = 2500;
    const ng = this.out(0, 1, 0.4);
    this.env(ng, t, 0.12, 0.005, 0.02, 0.35);
    n.connect(nf).connect(ng);
    n.start(t, rand(0, 3));
    n.stop(t + 0.5);
  }
}

/** One engine per page — the AudioContext is expensive and browsers cap them. */
export const ambience = new AmbienceEngine();

/** Setting value → master volume. */
export function soundVolume(setting: string): number {
  if (setting === 'off') return 0;
  if (setting === 'quiet') return 0.45;
  return 1;
}
