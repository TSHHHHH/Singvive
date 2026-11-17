/** Gap between two lines of one chain landing in the ticker. */
export const TICKER_STEP_MS = 180;
/** A whole chain lands within this, however many lines it holds. */
export const TICKER_CHAIN_MAX_MS = 900;

/**
 * When each of `count` new ticker lines should appear, oldest first, so a
 * chain of events (dawn → the cold → slept rough) reads as cause then effect.
 *
 * Lines are spaced `step` apart, squeezed so the last one starts no later
 * than `maxTotal` after the first. `cursor` is when the previous chain's last
 * line appears: a chain that lands while another is still playing queues one
 * step behind it instead of overlapping. Returns the start times and the new
 * cursor. With `reduced`, everything starts now.
 */
export function scheduleChain(
  count: number,
  now: number,
  cursor: number,
  opts: { step?: number; maxTotal?: number; reduced?: boolean } = {},
): { starts: number[]; cursor: number } {
  if (count <= 0) return { starts: [], cursor };
  if (opts.reduced) return { starts: Array<number>(count).fill(now), cursor: now };
  const base = opts.step ?? TICKER_STEP_MS;
  const maxTotal = opts.maxTotal ?? TICKER_CHAIN_MAX_MS;
  const step = count > 1 ? Math.min(base, maxTotal / (count - 1)) : base;
  const first = Math.max(now, cursor + step);
  const starts = Array.from({ length: count }, (_, i) => Math.round(first + i * step));
  return { starts, cursor: starts[count - 1] };
}
