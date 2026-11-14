import { describe, expect, it } from 'vitest';
import { revealName, slotProgress } from './searchReveal';
import type { SearchSession, SearchSlot } from './searchSession';

const slot = (over: Partial<SearchSlot> = {}): SearchSlot => ({
  id: 'n:0',
  defId: 'x',
  count: 1,
  x: 0,
  y: 0,
  rotated: false,
  state: 'fogged',
  searchMs: 1000,
  remainingMs: 1000,
  searchMinutes: 1,
  ...over,
});

const session = (s: SearchSlot, startedAt: number | null): SearchSession =>
  ({ slots: [s], queue: [s.id], searchingStartedAt: startedAt }) as unknown as SearchSession;

describe('revealName', () => {
  it('masks everything at 0 and keeps the length', () => {
    const r = revealName('Canned beans', 0, null);
    expect(r.shown).toBe('');
    expect(Array.from(r.frontier + r.masked)).toHaveLength(12);
    expect(r.frontier + r.masked).not.toMatch(/[a-z]/i);
  });

  it('keeps spaces as spaces so word shape reads through', () => {
    const r = revealName('Canned beans', 0, null);
    expect((r.frontier + r.masked)[6]).toBe(' ');
  });

  it('reveals characters in proportion to progress', () => {
    expect(revealName('Bandage', 0.5, null).shown).toBe('Ban');
    expect(revealName('Bandage', 0.99, null).shown).toBe('Bandag');
    expect(revealName('Bandage', 1, null)).toEqual({ shown: 'Bandage', frontier: '', masked: '' });
  });

  it('counts CJK characters, not UTF-16 units', () => {
    const r = revealName('绷带', 0.5, null);
    expect(r.shown).toBe('绷');
    expect(Array.from(r.frontier + r.masked)).toHaveLength(1);
  });

  it('scrambles only the frontier character', () => {
    const a = revealName('Bandage', 0.5, 0);
    const b = revealName('Bandage', 0.5, 1);
    expect(a.frontier).not.toBe(b.frontier);
    expect(a.masked).toBe(b.masked);
  });
});

describe('slotProgress', () => {
  it('is 0 for an untouched fogged slot and 1 once found', () => {
    expect(slotProgress(slot(), session(slot(), null), 0)).toBe(0);
    const found = slot({ state: 'found', remainingMs: 0 });
    expect(slotProgress(found, session(found, null), 0)).toBe(1);
  });

  it('adds elapsed time for the searching head', () => {
    const s = slot({ state: 'searching' });
    expect(slotProgress(s, session(s, 1000), 1250)).toBeCloseTo(0.25);
  });

  it('keeps partial progress on a paused slot', () => {
    const s = slot({ remainingMs: 400 });
    expect(slotProgress(s, session(s, null), 99999)).toBeCloseTo(0.6);
  });

  it('resumes from the paused point, not from zero', () => {
    const s = slot({ state: 'searching', remainingMs: 400 });
    expect(slotProgress(s, session(s, 0), 200)).toBeCloseTo(0.8);
  });
});
