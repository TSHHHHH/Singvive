/** Same ease as the player walk glide on the map. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

type Listener = (value: number) => void;

/**
 * A radius that eases to its target on its own animation frames, outside
 * React. The travel ring redraws from it every frame; slower consumers
 * (fog, buildings, markers) sample it at their own pace. Nothing re-renders
 * while it moves, and it schedules no frames once it has landed.
 */
export class RangeMotion {
  private from: number;
  private to: number;
  private start = 0;
  private raf = 0;
  private listeners = new Set<Listener>();
  private durationMs: number;
  private now: () => number;
  private frame: (cb: (t: number) => void) => number;
  private cancel: (id: number) => void;
  value: number;

  constructor(
    initial: number,
    durationMs: number,
    clock: {
      now?: () => number;
      frame?: (cb: (t: number) => void) => number;
      cancel?: (id: number) => void;
    } = {},
  ) {
    this.durationMs = durationMs;
    this.now = clock.now ?? (() => performance.now());
    this.frame = clock.frame ?? ((cb) => requestAnimationFrame(cb));
    this.cancel = clock.cancel ?? ((id) => cancelAnimationFrame(id));
    this.value = this.from = this.to = initial;
  }

  get target() {
    return this.to;
  }

  get moving() {
    return this.raf !== 0;
  }

  /** Ease from wherever it is now; `instant` lands at once. */
  set(target: number, instant = false) {
    if (instant || this.durationMs <= 0) {
      this.halt();
      this.from = this.to = target;
      this.emit(target);
      return;
    }
    if (target === this.to) return;
    this.from = this.value;
    this.to = target;
    this.start = this.now();
    if (!this.raf) this.raf = this.frame(this.step);
  }

  /** Called with every new value; returns the unsubscribe. */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  destroy() {
    this.halt();
    this.listeners.clear();
  }

  private halt() {
    if (this.raf) this.cancel(this.raf);
    this.raf = 0;
  }

  private step = () => {
    this.raf = 0;
    const t = Math.min(1, (this.now() - this.start) / this.durationMs);
    const v = t >= 1 ? this.to : this.from + (this.to - this.from) * easeInOut(t);
    if (t < 1) this.raf = this.frame(this.step);
    this.emit(v);
  };

  private emit(v: number) {
    if (v === this.value) return;
    this.value = v;
    for (const fn of this.listeners) fn(v);
  }
}

/**
 * Hand `fn` the motion's value at most once per `intervalMs` while it moves,
 * and always its landing value. For consumers too heavy for every frame.
 */
export function sampleMotion(motion: RangeMotion, intervalMs: number, fn: Listener, now: () => number = () => performance.now()): () => void {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    last = now();
    fn(motion.value);
  };
  const off = motion.subscribe((v) => {
    if (v === motion.target) {
      // Landed: deliver it now, cancelling any pending sample.
      if (timer) clearTimeout(timer);
      timer = null;
      last = now();
      fn(v);
      return;
    }
    const wait = intervalMs - (now() - last);
    if (wait <= 0) flush();
    else if (!timer) timer = setTimeout(flush, wait);
  });
  return () => {
    off();
    if (timer) clearTimeout(timer);
  };
}
