import type { LocationState } from './types';
import type { SavedRun } from './storage';
import { saveRun, type SaveResult } from './storage';
import { bakedOutlineByOsmId, bakedOsmIds } from './bakedPois';

/**
 * Persist is explicit at every action (`persist()` call sites stay) but the
 * write is debounced. Stringifying the whole run — even without outlines — on
 * every inventory cell move janks the main thread and races the ~5 MB quota.
 *
 * Flush on hide/unload (wired from App.tsx) so the last few seconds of play
 * are not lost. Cancel when the run is cleared (death / extract) so a delayed
 * write cannot resurrect a continue slot.
 */
export const PERSIST_DEBOUNCE_MS = 5000;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: (() => void) | null = null;

export function schedulePersist(write: () => void): void {
  pending = write;
  if (timer != null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const fn = pending;
    pending = null;
    fn?.();
  }, PERSIST_DEBOUNCE_MS);
}

export function flushPersist(): void {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  const fn = pending;
  pending = null;
  fn?.();
}

export function cancelPersist(): void {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  pending = null;
}

/**
 * Drop OSM footprints that already live in pois.json. Keep outlines for
 * fallback / waypoint / synthetic MRT sites that the bake does not know.
 * If the bake is not in memory yet, leave outlines in place so a save before
 * spawn-prefetch cannot strip unrehydratable geometry.
 */
export function locationsForSave(
  locations: Record<string, LocationState>,
): Record<string, LocationState> {
  const bakeIds = bakedOsmIds();
  if (!bakeIds) return locations;
  let next: Record<string, LocationState> | null = null;
  for (const [id, loc] of Object.entries(locations)) {
    if (!loc.outline || !bakeIds.has(id)) continue;
    if (!next) next = { ...locations };
    const { outline: _omit, ...rest } = loc;
    next[id] = rest;
  }
  return next ?? locations;
}

/** Reattach bake footprints onto a loaded run. No-op until the bake is loaded. */
export function rehydrateLocationOutlines(
  locations: Record<string, LocationState>,
): Record<string, LocationState> {
  const outlines = bakedOutlineByOsmId();
  if (!outlines) return locations;
  let next: Record<string, LocationState> | null = null;
  for (const [id, loc] of Object.entries(locations)) {
    if (loc.outline) continue;
    const outline = outlines.get(id);
    if (!outline) continue;
    if (!next) next = { ...locations };
    next[id] = { ...loc, outline };
  }
  return next ?? locations;
}

export function writeSavedRun(run: SavedRun): SaveResult {
  return saveRun({ ...run, locations: locationsForSave(run.locations) });
}
