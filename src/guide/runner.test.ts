import { describe, expect, it, vi } from 'vitest';
import { ARRIVE_GRACE_MS, GuideRunner, type GuideClock } from './runner';
import type { GuideEndReason, GuideSequence, GuideStep } from './types';

/** A hand-cranked clock: `tick(ms)` fires whatever is due. */
function fakeClock() {
  let now = 0;
  let id = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  const clock: GuideClock = {
    set: (fn, ms) => {
      due.set(++id, { at: now + ms, fn });
      return id;
    },
    clear: (h) => {
      due.delete(h as number);
    },
  };
  const tick = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const next = [...due.entries()].filter(([, d]) => d.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      due.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = until;
  };
  return { clock, tick };
}

const at = { lat: 1.3, lng: 103.8 };
const timed = (id: string, ms = 1000, shot = true): GuideStep => ({
  id, advance: { kind: 'timer', ms }, ...(shot ? { shot: { center: at, durationMs: 500 } } : {}),
});
function seq(steps: GuideStep[], extra: Partial<GuideSequence> = {}): GuideSequence & { ended: GuideEndReason[] } {
  const ended: GuideEndReason[] = [];
  return { id: 'test', steps, lock: 'all', restoreCamera: true, skippable: true, onEnd: (r) => ended.push(r), ended, ...extra };
}

describe('GuideRunner', () => {
  it('moves, shows on arrival, holds, then advances and ends', () => {
    const { clock, tick } = fakeClock();
    const g = new GuideRunner(clock);
    const s = seq([timed('a'), timed('b')]);
    g.play(s);
    expect(g.state?.step.id).toBe('a');
    expect(g.state?.phase).toBe('moving');
    g.arrived(g.state!.token);
    expect(g.state?.phase).toBe('showing');
    tick(999);
    expect(g.state?.step.id).toBe('a');
    tick(1);
    expect(g.state?.step.id).toBe('b');
    g.arrived(g.state!.token);
    tick(1000);
    expect(g.state).toBeNull();
    expect(s.ended).toEqual(['done']);
  });

  it('never hangs when no camera reports arrival', () => {
    const { clock, tick } = fakeClock();
    const g = new GuideRunner(clock);
    g.play(seq([timed('a')]));
    tick(500 + ARRIVE_GRACE_MS);
    expect(g.state?.phase).toBe('showing');
  });

  it('ignores a stale arrival from an earlier step', () => {
    const { clock } = fakeClock();
    const g = new GuideRunner(clock);
    g.play(seq([timed('a'), timed('b')]));
    const first = g.state!.token;
    g.next();
    g.arrived(first);
    expect(g.state?.step.id).toBe('b');
    expect(g.state?.phase).toBe('moving');
  });

  it('shows shot-less steps at once and waits on tap steps for Next', () => {
    const { clock, tick } = fakeClock();
    const g = new GuideRunner(clock);
    const s = seq([{ id: 'tap', advance: { kind: 'tap' } }]);
    g.play(s);
    expect(g.state?.phase).toBe('showing');
    tick(60_000);
    expect(g.state?.step.id).toBe('tap');
    g.next();
    expect(s.ended).toEqual(['done']);
  });

  it('signal steps wait for their own signal and ignore Next', () => {
    const { clock } = fakeClock();
    const g = new GuideRunner(clock);
    const s = seq([{ id: 'bag', advance: { kind: 'signal', name: 'open-bag' } }]);
    g.play(s);
    g.next();
    g.signal('other');
    expect(g.state?.step.id).toBe('bag');
    g.signal('open-bag');
    expect(s.ended).toEqual(['done']);
  });

  it('skip respects skippable; cancel always ends', () => {
    const { clock } = fakeClock();
    const g = new GuideRunner(clock);
    const locked = seq([timed('a')], { skippable: false });
    g.play(locked);
    g.skip();
    expect(g.active).toBe(true);
    g.cancel();
    expect(locked.ended).toEqual(['cancelled']);
    const open = seq([timed('a')]);
    g.play(open);
    g.skip();
    expect(open.ended).toEqual(['skipped']);
  });

  it('queues a second sequence behind the first, and cancel can drop the queue', () => {
    const { clock } = fakeClock();
    const g = new GuideRunner(clock);
    const a = seq([timed('a', 100, false)]);
    const b = seq([timed('b', 100, false)]);
    const c = seq([timed('c', 100, false)]);
    g.play(a);
    g.play(b);
    g.skip();
    expect(a.ended).toEqual(['skipped']);
    expect(g.state?.step.id).toBe('b');
    g.play(c);
    g.cancel({ clearQueue: true });
    expect(b.ended).toEqual(['cancelled']);
    expect(c.ended).toEqual(['cancelled']);
    expect(g.active).toBe(false);
  });

  it('ends an empty sequence immediately and notifies subscribers on each change', () => {
    const { clock, tick } = fakeClock();
    const g = new GuideRunner(clock);
    const empty = seq([]);
    g.play(empty);
    expect(empty.ended).toEqual(['done']);
    const fn = vi.fn();
    const off = g.subscribe(fn);
    g.play(seq([timed('a', 100)]));
    g.arrived(g.state!.token);
    tick(100);
    expect(fn).toHaveBeenCalledTimes(3);
    off();
  });
});
