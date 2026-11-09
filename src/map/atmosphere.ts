import type { Map as MlMap } from 'maplibre-gl';
import type { TimeOfDay, WeatherKind } from '../game/types';
import { dimHex, mixHex } from './geo';
import { alive } from './layers';

/**
 * The 3D run map's weather, drawn into the world rather than over it.
 *
 * Three channels, none of which touch a layer's paint or filter:
 * - **Light.** MapLibre's one directional light colours and shades every
 *   extruded building. Rain cools it, haze turns it amber, heat drops the sun
 *   low and harsh, overcast flattens it overhead. A storm's lightning is a few
 *   frames of this light going white. The light can tint but never darken:
 *   see `liftLight`.
 * - **Sky.** Horizon and sky colours, seen when the camera tilts far enough
 *   to reach the horizon.
 * - **Depth haze.** At the run map's tilt the horizon is off screen, so
 *   distance is the top of the viewport. A DOM gradient there (see
 *   `WeatherFx`) thickens with the weather: haze swallows the far blocks,
 *   rain closes the view in, clear air barely shows it.
 *
 * Light and sky are shader uniforms, so changing them costs a repaint and no
 * re-tessellation. They only change when the weather or time of day does
 * (tweened over TWEEN_MS) and during a lightning flash.
 */

export interface Atmosphere {
  sky: string;
  horizon: string;
  fog: string;
  /** Building light colour (multiplies the extrusions). */
  light: string;
  /** Light intensity: how hard the lit faces contrast with the shaded ones. */
  intensity: number;
  /** Sun height in degrees from overhead (0) toward the horizon (90). */
  polar: number;
  /** Depth haze colour and peak opacity. */
  haze: string;
  hazeAlpha: number;
  /** How far down the screen the depth haze reaches, 0..1. */
  hazeReach: number;
}

/** The 3D look as it was before weather: dark, neutral, no depth haze. */
export const BASE_ATMOSPHERE: Atmosphere = {
  sky: '#0b0d0a',
  horizon: '#1c221c',
  fog: '#0b0d0a',
  light: '#ffffff',
  intensity: 0.4,
  polar: 35,
  haze: '#0b0d0a',
  hazeAlpha: 0,
  hazeReach: 0.4,
};

/** Each weather at full strength, in daylight. */
const WEATHER: Record<WeatherKind, Atmosphere> = {
  // Equatorial noon: warm, bright, the far blocks just softening.
  clear: {
    sky: '#141a1c',
    horizon: '#3a3a30',
    fog: '#141a1c',
    light: '#fff2da',
    intensity: 0.5,
    polar: 30,
    haze: '#3a382c',
    hazeAlpha: 0.22,
    hazeReach: 0.32,
  },
  // A lid of cloud: light from straight above, little contrast, grey distance.
  cloudy: {
    sky: '#16191c',
    horizon: '#2c3034',
    fog: '#16191c',
    light: '#c8d0d8',
    intensity: 0.22,
    polar: 8,
    haze: '#2a2e33',
    hazeAlpha: 0.42,
    hazeReach: 0.48,
  },
  // Wet concrete under a low sky; the view closes in.
  rain: {
    sky: '#10161c',
    horizon: '#26323c',
    fog: '#10161c',
    light: '#d2dce8',
    intensity: 0.38,
    polar: 18,
    haze: '#24303a',
    hazeAlpha: 0.58,
    hazeReach: 0.6,
  },
  // Near-dark at midday, lit in bursts by the lightning.
  thunderstorm: {
    sky: '#0a0e14',
    horizon: '#1a2230',
    fog: '#0a0e14',
    light: '#c6d2e2',
    intensity: 0.42,
    polar: 14,
    haze: '#18202c',
    hazeAlpha: 0.66,
    hazeReach: 0.66,
  },
  // Transboundary haze: an amber-brown soup that eats the distance whole.
  haze: {
    sky: '#2a2216',
    horizon: '#5a4a30',
    fog: '#2a2216',
    light: '#c8aa7c',
    intensity: 0.26,
    polar: 25,
    haze: '#6a5638',
    hazeAlpha: 0.68,
    hazeReach: 0.78,
  },
  // Furnace light from a low, hard sun; the air above the blocks gone orange.
  heat: {
    sky: '#22160e',
    horizon: '#6a3c1c',
    fog: '#22160e',
    light: '#ffd29a',
    intensity: 0.6,
    polar: 58,
    haze: '#6e3e1c',
    hazeAlpha: 0.3,
    hazeReach: 0.46,
  },
};

/** How dusk and night recolour whatever the weather made. */
const TIME: Record<Exclude<TimeOfDay, 'day'>, { light: string; k: number; dim: number; air: string; ak: number }> = {
  dusk: { light: '#ff8a4a', k: 0.45, dim: 0.88, air: '#3a1c0c', ak: 0.45 },
  night: { light: '#6a7ca4', k: 0.6, dim: 0.72, air: '#03060c', ak: 0.65 },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Lowest a light channel may go, 0..1. MapLibre lights an extrusion as
 * `max(colour * shade * light, 0.3 * (1 - light))`. Our blocks are near-black
 * (#2a2e2a), so once the light drops much below white the second term wins on
 * every face: the city goes one flat brown with no lit or shaded sides. That
 * is what rain, storms and night used to look like. Keeping each channel at
 * or above this keeps the shading; gloom comes from sky, haze and the
 * time-of-day wash instead.
 */
export const LIGHT_FLOOR = 0.8;

/** Mix a light colour toward white just enough that no channel is below LIGHT_FLOOR. */
export function liftLight(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lo = Math.min((n >> 16) & 255, (n >> 8) & 255, n & 255) / 255;
  if (lo >= LIGHT_FLOOR) return hex;
  return mixHex(hex, '#ffffff', (LIGHT_FLOOR - lo) / (1 - lo));
}

export function mixAtmosphere(a: Atmosphere, b: Atmosphere, t: number): Atmosphere {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    sky: mixHex(a.sky, b.sky, t),
    horizon: mixHex(a.horizon, b.horizon, t),
    fog: mixHex(a.fog, b.fog, t),
    light: mixHex(a.light, b.light, t),
    intensity: lerp(a.intensity, b.intensity, t),
    polar: lerp(a.polar, b.polar, t),
    haze: mixHex(a.haze, b.haze, t),
    hazeAlpha: lerp(a.hazeAlpha, b.hazeAlpha, t),
    hazeReach: lerp(a.hazeReach, b.hazeReach, t),
  };
}

/**
 * The atmosphere for this weather and hour. `strength` is the weatherFx
 * setting (0 off, partial for subtle, 1 full); time of day applies at any
 * strength, because dusk and night are gameplay reads.
 */
export function atmosphereFor(kind: WeatherKind, time: TimeOfDay, strength: number): Atmosphere {
  const w = mixAtmosphere(BASE_ATMOSPHERE, WEATHER[kind], strength);
  if (time === 'day') return { ...w, light: liftLight(w.light) };
  const t = TIME[time];
  return {
    ...w,
    sky: mixHex(w.sky, t.air, t.ak),
    horizon: mixHex(w.horizon, t.air, t.ak * 0.8),
    fog: mixHex(w.fog, t.air, t.ak),
    light: liftLight(dimHex(mixHex(w.light, t.light, t.k), t.dim)),
    haze: mixHex(w.haze, t.air, t.ak),
  };
}

/** How long a change of weather or hour takes to settle. */
const TWEEN_MS = 1800;
/** Gap between strikes in a storm, seconds. */
const STRIKE_GAP_S: [number, number] = [5, 14];
/** What the light goes to at the peak of a flash. */
const FLASH_LIGHT = '#e4ecff';

/**
 * A strike's brightness over time (ms → 0..1): a bright leader, a dip, a
 * return stroke, then a fade. Double strikes add a second, weaker pulse.
 */
function flashCurve(ms: number, double: boolean): number {
  const pulse = (t: number, peak: number) => {
    if (t < 0) return 0;
    if (t < 50) return peak * (t / 50);
    if (t < 110) return peak * lerp(1, 0.25, (t - 50) / 60);
    if (t < 160) return peak * lerp(0.25, 0.8, (t - 110) / 50);
    return peak * 0.8 * Math.exp(-(t - 160) / 120);
  };
  return Math.min(1, pulse(ms, 1) + (double ? pulse(ms - 380, 0.6) : 0));
}

const FLASH_MS = 1100;

/** Depth haze share for a camera pitch: none flat, full from 40°. */
export function tiltShare(pitch: number): number {
  return Math.max(0, Math.min(1, (pitch - 10) / 30));
}

/**
 * Drives the map's light and sky toward a target atmosphere, and the
 * lightning. Imperative, like the building engine: it repaints per frame only
 * while a tween or a flash is running.
 */
export class AtmosphereDriver {
  private readonly map: MlMap;
  private cur: Atmosphere = BASE_ATMOSPHERE;
  private from: Atmosphere = BASE_ATMOSPHERE;
  private to: Atmosphere = BASE_ATMOSPHERE;
  private tweenStart = 0;
  private flash = 0;
  private flashStart = 0;
  private flashDouble = false;
  private raf = 0;
  private strikeTimer: ReturnType<typeof setTimeout> | null = null;
  private storm = false;
  private destroyed = false;

  /** The DOM bloom that lights up with each flash (optional). */
  bolt: (() => HTMLElement | null) | null = null;
  /** Called at each strike, so thunder can follow the flash. */
  onStrike: ((delayS: number) => void) | null = null;
  /**
   * The depth haze's wrapper. Screen-top only means "far away" when the
   * camera is tilted, so its opacity follows the pitch.
   */
  private depthEl: (() => HTMLElement | null) | null = null;

  constructor(map: MlMap) {
    this.map = map;
    map.on('pitch', this.onPitch);
    this.apply();
  }

  set depth(get: (() => HTMLElement | null) | null) {
    this.depthEl = get;
    this.onPitch();
  }

  private onPitch = () => {
    const el = this.depthEl?.();
    if (!el || !alive(this.map)) return;
    el.style.opacity = tiltShare(this.map.getPitch()).toFixed(3);
  };

  /** Move to a new atmosphere; `instant` skips the tween (reduced motion). */
  set(target: Atmosphere, instant: boolean) {
    if (instant) {
      this.to = this.from = this.cur = target;
      this.tweenStart = 0;
      this.apply();
      return;
    }
    this.from = this.cur;
    this.to = target;
    this.tweenStart = performance.now();
    this.kick();
  }

  /** Whether lightning strikes. */
  setStorm(on: boolean) {
    if (on === this.storm) return;
    this.storm = on;
    if (on) this.scheduleStrike();
    else if (this.strikeTimer) {
      clearTimeout(this.strikeTimer);
      this.strikeTimer = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.setStorm(false);
    if (alive(this.map)) this.map.off('pitch', this.onPitch);
    const depth = this.depthEl?.();
    if (depth) depth.style.opacity = '0';
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const el = this.bolt?.();
    if (el) el.style.opacity = '0';
  }

  private scheduleStrike() {
    const [lo, hi] = STRIKE_GAP_S;
    this.strikeTimer = setTimeout(
      () => {
        this.strikeTimer = null;
        if (!this.storm || this.destroyed) return;
        this.strike();
        this.scheduleStrike();
      },
      (lo + Math.random() * (hi - lo)) * 1000,
    );
  }

  /** Fire one strike now (also the DEV handle: `window.__atmosphere.strike()`). */
  strike() {
    this.flashStart = performance.now();
    this.flashDouble = Math.random() < 0.35;
    // Thunder lags the flash by the strike's distance: close ones crack at once.
    this.onStrike?.(0.15 + Math.random() * 1.6);
    this.kick();
  }

  private kick() {
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.step);
  }

  private step = (now: number) => {
    this.raf = 0;
    if (this.destroyed || !alive(this.map)) return;
    let busy = false;

    if (this.tweenStart) {
      const t = Math.min(1, (now - this.tweenStart) / TWEEN_MS);
      const e = t * t * (3 - 2 * t);
      this.cur = mixAtmosphere(this.from, this.to, e);
      if (t >= 1) this.tweenStart = 0;
      else busy = true;
    }

    if (this.flashStart) {
      const ms = now - this.flashStart;
      this.flash = flashCurve(ms, this.flashDouble);
      if (ms >= FLASH_MS) {
        this.flashStart = 0;
        this.flash = 0;
      } else busy = true;
    }

    this.apply();
    if (busy) this.raf = requestAnimationFrame(this.step);
  };

  private apply() {
    if (!alive(this.map)) return;
    const a = this.cur;
    const f = this.flash;
    this.map.setSky({
      'sky-color': f ? mixHex(a.sky, '#3a4458', f * 0.6) : a.sky,
      'horizon-color': f ? mixHex(a.horizon, '#8a96b0', f * 0.6) : a.horizon,
      'fog-color': a.fog,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.7,
      'fog-ground-blend': 0.85,
      'atmosphere-blend': 0,
    });
    this.map.setLight({
      anchor: 'viewport',
      color: f ? mixHex(a.light, FLASH_LIGHT, f) : a.light,
      intensity: a.intensity + 0.3 * f,
      position: [1.5, 210, f ? lerp(a.polar, 20, f) : a.polar],
    });
    const el = this.bolt?.();
    if (el) el.style.opacity = f ? f.toFixed(3) : '0';
    // The haze element may have been remounted (weatherFx setting changed).
    this.onPitch();
  }
}
