import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('reproduces the same sequence for the same seed', () => {
    const a = new Rng('GOLDEN-SEED');
    const b = new Rng('GOLDEN-SEED');
    const draws = Array.from({ length: 10 }, () => [a.next(), a.int(1, 6), a.d20()]);
    const again = Array.from({ length: 10 }, () => [b.next(), b.int(1, 6), b.d20()]);
    expect(draws).toEqual(again);
  });

  it('fork creates an independent stream', () => {
    const root = new Rng('GOLDEN-SEED');
    const loot = root.fork('loot');
    const combat = root.fork('combat');
    expect(loot.next()).not.toBe(combat.next());
    // Re-forking with the same tag is stable
    expect(root.fork('loot').next()).toBe(new Rng('GOLDEN-SEED::loot').next());
  });

  it('pick and weighted are deterministic', () => {
    const rng = new Rng('WEIGHT-TEST');
    expect(rng.pick(['a', 'b', 'c', 'd'])).toBe('b');
    expect(rng.weighted([
      ['low', 1],
      ['high', 9],
    ])).toBe('high');
  });

  it('shuffle is deterministic for a seed', () => {
    const rng = new Rng('SHUFFLE-TEST');
    expect(rng.shuffle([1, 2, 3, 4, 5])).toEqual([4, 1, 2, 5, 3]);
  });
});
