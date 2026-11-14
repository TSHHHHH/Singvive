import { describe, expect, it } from 'vitest';
import { revealName, revealOrder, slotProgress } from './searchReveal';
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

const join = (segs: { text: string }[]) => segs.map((x) => x.text).join('');
const shownChars = (name: string, segs: { text: string; kind: string }[]) => {
  const out: string[] = [];
  let i = 0;
  for (const seg of segs) for (const ch of Array.from(seg.text)) {
    if (seg.kind === 'shown' && ch !== ' ') out.push(`${i}:${Array.from(name)[i]}`);
    i++;
  }
  return out;
};

describe('revealOrder', () => {
  it('is a permutation of the non-space positions', () => {
    const chars = Array.from('Canned beans');
    const order = revealOrder(chars, 'slot:1');
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11]);
  });

  it('is stable for a seed and differs between seeds', () => {
    const chars = Array.from('First-Aid Kit');
    expect(revealOrder(chars, 'a')).toEqual(revealOrder(chars, 'a'));
    expect(revealOrder(chars, 'a')).not.toEqual(revealOrder(chars, 'b'));
  });

  it('is not simply left to right', () => {
    const chars = Array.from('Kitchen Knife');
    const ordered = chars.flatMap((c, i) => (c === ' ' ? [] : [i]));
    expect(revealOrder(chars, 'n:3')).not.toEqual(ordered);
  });
});

describe('revealName', () => {
  it('masks every letter at 0, keeps length and spaces', () => {
    const text = join(revealName('Canned beans', 0, null, 's'));
    expect(Array.from(text)).toHaveLength(12);
    expect(text[6]).toBe(' ');
    expect(text).not.toMatch(/[a-z]/i);
  });

  it('reveals letters in proportion to progress, in place', () => {
    const name = 'Bandage';
    const half = revealName(name, 0.5, null, 's');
    expect(shownChars(name, half)).toHaveLength(3);
    expect(Array.from(join(half))).toHaveLength(7);
    expect(join(revealName(name, 1, null, 's'))).toBe(name);
  });

  it('only ever adds letters as progress grows', () => {
    const name = 'Bottled Water';
    let prev: string[] = [];
    for (let p = 0; p <= 1; p += 0.05) {
      const now = shownChars(name, revealName(name, p, null, 'seed'));
      for (const c of prev) expect(now).toContain(c);
      prev = now;
    }
  });

  it('counts CJK characters, not UTF-16 units', () => {
    const segs = revealName('绷带', 0.5, null, 's');
    expect(shownChars('绷带', segs)).toHaveLength(1);
    expect(Array.from(join(segs))).toHaveLength(2);
  });

  it('scrambles only the frontier letter', () => {
    const a = revealName('Bandage', 0.5, 0, 's');
    const b = revealName('Bandage', 0.5, 1, 's');
    const f = (segs: typeof a) => segs.find((x) => x.kind === 'frontier')?.text;
    expect(f(a)).not.toBe(f(b));
    expect(a.filter((x) => x.kind !== 'frontier')).toEqual(b.filter((x) => x.kind !== 'frontier'));
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
