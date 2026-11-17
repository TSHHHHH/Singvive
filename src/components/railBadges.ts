import { useState } from 'react';

/**
 * Red-dot notices on the rail's menu buttons.
 *
 * Each button that can light describes what it currently holds as a list of
 * ids ("seen" ids): ready recipes, active leads, skill levels, recent danger
 * lines. A dot lights when an id appears that the player hasn't had the panel
 * open for. Opening the panel marks everything in it seen. Ids present when
 * the run screen mounts count as seen, so a reload doesn't light everything.
 */
export type SeenIds = Record<string, readonly string[]>;

/** Pure: true when `current` holds an id that isn't in `seen`. */
export function hasUnseen(current: readonly string[], seen: ReadonlySet<string> | undefined): boolean {
  if (!seen) return false;
  return current.some((id) => !seen.has(id));
}

/** Pure: the seen sets after this render — open panels absorb what they show. */
export function absorbSeen(
  seen: Record<string, ReadonlySet<string>>,
  current: SeenIds,
  open: Record<string, boolean>,
): Record<string, ReadonlySet<string>> {
  let next = seen;
  for (const key of Object.keys(current)) {
    const have = seen[key];
    if (have && !open[key]) continue;
    if (have && current[key].every((id) => have.has(id))) continue;
    const merged = new Set(have ?? []);
    for (const id of current[key]) merged.add(id);
    if (next === seen) next = { ...seen };
    next[key] = merged;
  }
  return next;
}

/** Which keys have something the player hasn't looked at yet. */
export function useUnseen(current: SeenIds, open: Record<string, boolean>): Record<string, boolean> {
  const [seen, setSeen] = useState<Record<string, ReadonlySet<string>>>(() => absorbSeen({}, current, {}));
  const next = absorbSeen(seen, current, open);
  // Render-time update (React's "adjust state while rendering" pattern): the
  // dot clears in the same frame the panel opens, with no effect round-trip.
  if (next !== seen) setSeen(next);
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(current)) out[key] = hasUnseen(current[key], next[key]);
  return out;
}
