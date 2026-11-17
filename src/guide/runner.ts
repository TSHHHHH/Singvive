import type { GuideEndReason, GuideSequence, GuideStep } from './types';

/**
 * - `moving`: the camera adapter is flying to the step's shot.
 * - `showing`: arrived; call-out up, waiting on the step's advance rule.
 */
export type GuidePhase = 'moving' | 'showing';

export interface GuideState {
  sequence: GuideSequence;
  index: number;
  step: GuideStep;
  phase: GuidePhase;
  /** Bumps on every step entry, so adapters can ignore stale callbacks. */
  token: number;
}

export interface GuideClock {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const browserClock: GuideClock = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** If no camera reports in (map hidden, unmounted), a move counts as done after this. */
export const ARRIVE_GRACE_MS = 1500;

/**
 * Plays guide sequences one at a time. Framework-free: React reads it through
 * `useGuideState`, the map adapter calls `arrived`, game code may `signal`.
 * A sequence started while another runs waits in a queue.
 */
export class GuideRunner {
  private current: GuideState | null = null;
  private queue: GuideSequence[] = [];
  private timer: unknown = null;
  private seq = 0;
  private listeners = new Set<() => void>();
  private clock: GuideClock;

  constructor(clock: GuideClock = browserClock) {
    this.clock = clock;
  }

  get state(): GuideState | null {
    return this.current;
  }

  get active(): boolean {
    return this.current !== null;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): GuideState | null => this.current;

  play(sequence: GuideSequence): void {
    if (!sequence.steps.length) {
      sequence.onEnd?.('done');
      return;
    }
    if (this.current) {
      this.queue.push(sequence);
      return;
    }
    this.enter(sequence, 0);
  }

  /** The camera reached the shot for `token`'s step. */
  arrived(token: number): void {
    const s = this.current;
    if (!s || s.token !== token || s.phase !== 'moving') return;
    this.show(s);
  }

  /** Next: skip the hold or answer a tap step. Signal steps ignore it. */
  next(): void {
    const s = this.current;
    if (!s || s.step.advance.kind === 'signal') return;
    this.advance();
  }

  /** Game code reports something happened; a waiting signal step moves on. */
  signal(name: string): void {
    const s = this.current;
    if (s && s.step.advance.kind === 'signal' && s.step.advance.name === name) this.advance();
  }

  /** The player bails out. Unskippable sequences ignore it. */
  skip(): void {
    if (this.current?.sequence.skippable) this.end('skipped');
  }

  /** The game interrupts (run ended, fight started). Always works; drops the queue too when asked. */
  cancel(opts: { clearQueue?: boolean } = {}): void {
    if (opts.clearQueue) {
      const dropped = this.queue;
      this.queue = [];
      for (const q of dropped) q.onEnd?.('cancelled');
    }
    if (this.current) this.end('cancelled');
  }

  private enter(sequence: GuideSequence, index: number): void {
    this.clearTimer();
    const step = sequence.steps[index];
    const token = ++this.seq;
    const state: GuideState = { sequence, index, step, phase: step.shot ? 'moving' : 'showing', token };
    this.current = state;
    if (step.shot) {
      // Never hang on a camera that is not there.
      const grace = (step.shot.durationMs ?? 1000) + ARRIVE_GRACE_MS;
      this.timer = this.clock.set(() => this.arrived(token), grace);
      this.emit();
    } else {
      this.show(state);
    }
  }

  private show(s: GuideState): void {
    this.clearTimer();
    const shown: GuideState = { ...s, phase: 'showing' };
    this.current = shown;
    if (s.step.advance.kind === 'timer') {
      const token = s.token;
      this.timer = this.clock.set(() => {
        if (this.current?.token === token) this.advance();
      }, s.step.advance.ms);
    }
    this.emit();
  }

  private advance(): void {
    const s = this.current;
    if (!s) return;
    if (s.index + 1 < s.sequence.steps.length) this.enter(s.sequence, s.index + 1);
    else this.end('done');
  }

  private end(reason: GuideEndReason): void {
    const s = this.current;
    this.clearTimer();
    this.current = null;
    this.emit();
    s?.sequence.onEnd?.(reason);
    const next = this.queue.shift();
    if (next && !this.current) this.enter(next, 0);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = null;
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }
}
