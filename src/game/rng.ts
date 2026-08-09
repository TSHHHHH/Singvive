import seedrandom from 'seedrandom';

/**
 * Deterministic RNG for reproducible roguelike runs.
 * Create with a run seed; derive independent streams with `.fork(tag)`
 * so unrelated systems (loot vs. combat) don't disturb each other's sequence.
 */
export class Rng {
  private rng: seedrandom.PRNG;
  readonly seed: string;

  constructor(seed: string) {
    this.seed = seed;
    this.rng = seedrandom(seed);
  }

  /** A fresh independent stream keyed off this seed + tag. */
  fork(tag: string): Rng {
    return new Rng(`${this.seed}::${tag}`);
  }

  /** float in [0,1) */
  next(): number {
    return this.rng();
  }

  /** integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.rng() * (max - min + 1));
  }

  /** roll an N-sided die, 1..n */
  die(n: number): number {
    return this.int(1, n);
  }

  /** classic d20 */
  d20(): number {
    return this.die(20);
  }

  /** true with probability p (0..1) */
  chance(p: number): boolean {
    return this.rng() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rng() * arr.length)];
  }

  /** weighted pick: entries of [item, weight] */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.rng() * total;
    for (const [item, w] of entries) {
      r -= w;
      if (r < 0) return item;
    }
    return entries[entries.length - 1][0];
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/** Generate a short random human-ish seed (for "new run"). */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}
