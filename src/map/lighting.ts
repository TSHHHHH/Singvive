import type { TimeOfDay } from '../game/types';

/**
 * Day and night on the run map, as cheap as it can be made.
 *
 * Everything here is pure and keyed to the whole game hour, so the map only
 * repaints when the clock crosses an hour, never on a timer:
 *
 * - **Light phase.** A visual-only split of the clock into dawn, day, dusk
 *   and night. Gameplay keeps its own `TimeOfDay` (day / dusk / night); dawn
 *   is just the first two daylight hours drawn with a low, rosy sun.
 * - **Sun.** Where the sun is for an hour, roughly as it really runs over
 *   Singapore: up about 07:00 in the east-south-east, high (≈70°) a little
 *   after 13:00, down about 19:10 in the west-south-west.
 * - **Ground grade.** A per-phase colour grade for the basemap's own fills
 *   and lines (`c × gain + lift`): daylight lifts the dark map to lit
 *   concrete, night sinks it to blue-black. Applied by repainting the basemap
 *   layers once per phase change.
 * - **Shadows.** The ground shadow a standing building throws, as one convex
 *   polygon per building, and the short drop shadow the flat 2D map uses.
 */

export type LightPhase = 'dawn' | 'day' | 'dusk' | 'night';

/** The light phase for a 0..24 clock hour. Dusk and night match `timeOfDay`. */
export function lightPhase(hour: number): LightPhase {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 6 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

/** The gameplay band a light phase belongs to (dawn is daytime). */
export function phaseBand(p: LightPhase): TimeOfDay {
  return p === 'dawn' ? 'day' : p;
}

export interface Sun {
  /** Compass bearing the light comes from, degrees clockwise from north. */
  az: number;
  /** Height above the horizon, degrees. Below 0 the sun is down. */
  alt: number;
}

const SUNRISE = 7;
const SUNSET = 19.2;
const MAX_ALT = 70;
const RISE_AZ = 112;
const SET_AZ = 248;
/** Where the moon hangs at night: high, from the north-west, so night faces still read. */
const MOON: Sun = { az: 315, alt: 55 };

/**
 * The sun for a clock hour. Callers pass a whole hour; the sun is placed at
 * the middle of it, so 07:xx already has the sun up and casting long shadows.
 */
export function sunAt(hour: number): Sun {
  const h = Math.floor(((hour % 24) + 24) % 24) + 0.5;
  const t = (h - SUNRISE) / (SUNSET - SUNRISE);
  if (t <= 0 || t >= 1) {
    // Down: the sky is lit from where it went (or will come up).
    return { az: t <= 0 ? RISE_AZ : SET_AZ, alt: -6 };
  }
  return { az: RISE_AZ + (SET_AZ - RISE_AZ) * t, alt: MAX_ALT * Math.sin(Math.PI * t) };
}

/** The light the 3D buildings take: the sun by day, the moon at night. */
export function keyLight(hour: number): Sun {
  const s = sunAt(hour);
  if (s.alt > 0) return s;
  return lightPhase(hour) === 'night' ? MOON : { az: s.az, alt: 6 };
}

/** Shadow length per metre of height; capped so dawn shadows stay readable. */
export const MAX_SHADOW_RATIO = 2.4;

export function shadowRatio(alt: number): number {
  if (alt <= 0) return 0;
  return Math.min(MAX_SHADOW_RATIO, 1 / Math.tan((alt * Math.PI) / 180));
}

/**
 * How dark shadows are, 0..1: none with the sun down, fading in over the
 * first few degrees, and washed out by cloud (`diffuse`, 0 hard sun … 1 a lid
 * of cloud).
 */
export function shadowStrength(alt: number, diffuse = 0): number {
  if (alt <= 0) return 0;
  return Math.min(1, alt / 8) * (1 - Math.max(0, Math.min(1, diffuse)));
}

// --- Ground grade -------------------------------------------------------------

export interface Grade {
  /** Multiplies each channel. */
  gain: number;
  /** Then added, per channel, 0..255. */
  lift: [number, number, number];
}

/**
 * The basemap is CARTO Dark Matter: ground #0e0e0e, roads a few steps up.
 * Daylight roughly doubles it into dim concrete (still a dark, dead city);
 * night takes some away and pushes it blue.
 */
export const GRADES: Record<LightPhase, Grade> = {
  dawn: { gain: 1.45, lift: [14, 9, 14] },
  day: { gain: 1.9, lift: [15, 15, 12] },
  dusk: { gain: 1.3, lift: [20, 9, 0] },
  night: { gain: 0.8, lift: [0, 2, 8] },
};

/** Parse a CSS colour MapLibre accepts in a style: #rgb, #rrggbb(aa), rgb(a), hsl(a). */
export function parseColor(s: string): [number, number, number, number] | null {
  const str = s.trim().toLowerCase();
  if (str[0] === '#') {
    const h = str.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    if (h.length === 3 || h.length === 4) {
      const v = [...h].map((c) => parseInt(c + c, 16));
      return [v[0], v[1], v[2], h.length === 4 ? v[3] / 255 : 1];
    }
    if (h.length === 6 || h.length === 8) {
      const v = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
      return [v[0], v[1], v[2], h.length === 8 ? v[3] / 255 : 1];
    }
    return null;
  }
  const m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(str);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (p: string, scale: number) => (p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p));
  const a = parts[3] !== undefined ? num(parts[3], 1) : 1;
  if (m[1].startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map((p) => num(p, 255));
    return [r, g, b, a].some((x) => !Number.isFinite(x)) ? null : [r, g, b, a];
  }
  const hh = parseFloat(parts[0]);
  const ss = num(parts[1], 1);
  const ll = num(parts[2], 1);
  if (![hh, ss, ll, a].every(Number.isFinite)) return null;
  // hsl → rgb
  const k = (n: number) => (n + hh / 30) % 12;
  const q = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => 255 * (ll - q * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))));
  return [f(0), f(8), f(4), a];
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Grade one colour string; anything that isn't a colour comes back as is. */
export function gradeColor(s: string, g: Grade): string {
  const c = parseColor(s);
  if (!c) return s;
  const [r, gg, b] = [0, 1, 2].map((i) => clamp255(c[i] * g.gain + g.lift[i]));
  return c[3] >= 1 ? `rgb(${r},${gg},${b})` : `rgba(${r},${gg},${b},${+c[3].toFixed(3)})`;
}

/**
 * Grade every colour inside a paint value: a plain colour, or the colours
 * nested in a zoom `interpolate` / `step` / `match` expression. Expression
 * operator names are never colours, so walking every string is safe.
 */
export function gradePaint<T>(value: T, g: Grade): T {
  if (typeof value === 'string') return gradeColor(value, g) as T;
  if (Array.isArray(value)) return value.map((v) => gradePaint(v, g)) as T;
  if (value && typeof value === 'object') {
    // Legacy function syntax: { stops: [[z, colour], …] }.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = gradePaint(v, g);
    return out as T;
  }
  return value;
}

// --- Shadow geometry ------------------------------------------------------------

const M_PER_DEG_LAT = 110_540;

/** The unit ground vector a shadow runs along (away from the sun), as [east, north]. */
export function shadowDir(az: number): [number, number] {
  const r = (az * Math.PI) / 180;
  return [-Math.sin(r), -Math.cos(r)];
}

/** Monotone-chain convex hull of 2D points; returns a closed ring. */
export function convexHull(pts: [number, number][]): [number, number][] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  hull.push(hull[0]);
  return hull;
}

/**
 * The ground shadow of a prism `h` metres tall standing on `ring` ([lng, lat]
 * pairs): the hull of the footprint and the footprint slid `h × ratio` metres
 * along `dir`. Convex, so one building never overlaps its own shadow twice;
 * an L-shaped block fills its inside corner, which reads fine at map scale.
 */
export function shadowRing(
  ring: ReadonlyArray<ReadonlyArray<number>>,
  h: number,
  ratio: number,
  dir: [number, number],
): [number, number][] | null {
  if (ring.length < 3 || h <= 0 || ratio <= 0) return null;
  const lat0 = ring[0][1];
  const kx = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const len = h * ratio;
  const dLng = (dir[0] * len) / kx;
  const dLat = (dir[1] * len) / M_PER_DEG_LAT;
  const pts: [number, number][] = [];
  for (const [x, y] of ring) {
    pts.push([x, y]);
    pts.push([x + dLng, y + dLat]);
  }
  const hull = convexHull(pts);
  return hull.length >= 4 ? hull : null;
}
