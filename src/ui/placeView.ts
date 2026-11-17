import { create } from 'zustand';
import { useGame } from '../game/store';
import type { HdbDungeon } from '../game/hdbDungeon';
import type { LocationState } from '../game/types';

// ---------------------------------------------------------------------------
// Place view vs map view.
//
// Some places take the screen over when you are in them: an HDB block (the
// landing strips) and a faction site (the faction window, camera on the
// site). From either you can flip to the plain run map to look around and plan
// the next move, then flip back. Which one shows is UI only: the run state does
// not change, and nothing here is persisted.
//
// The choice is remembered per place. Arriving somewhere new (or entering the
// same block again later) opens the place view; a stale "map" choice for the
// last place simply no longer matches.
// ---------------------------------------------------------------------------

/** The place that owns the screen right now, or null on the open map. */
export function placeKeyFor(s: {
  hdb: Pick<HdbDungeon, 'locationId'> | null;
  travelAnim: unknown;
  here: Pick<LocationState, 'id' | 'factionId' | 'discovered'> | null;
}): string | null {
  if (s.hdb) return `block:${s.hdb.locationId}`;
  if (s.travelAnim || !s.here) return null;
  if (s.here.factionId && s.here.discovered) return `site:${s.here.id}`;
  return null;
}

/** Place key from the live store. */
export function currentPlaceKey(): string | null {
  const s = useGame.getState();
  return placeKeyFor({
    hdb: s.hdb,
    travelAnim: s.travelAnim,
    here: s.currentPositionId ? s.locations[s.currentPositionId] ?? null : null,
  });
}

interface PlaceViewState {
  /** The place key the player flipped to the map from. */
  mapAt: string | null;
}

export const usePlaceView = create<PlaceViewState>(() => ({ mapAt: null }));

/** Show the run map instead of the place you are in (no-op on the open map). */
export function showMap(key: string | null = currentPlaceKey()): void {
  if (key && usePlaceView.getState().mapAt !== key) usePlaceView.setState({ mapAt: key });
}

/** Back to the place view. */
export function showPlace(): void {
  if (usePlaceView.getState().mapAt !== null) usePlaceView.setState({ mapAt: null });
}

/** Flip between the two for this place. */
export function togglePlaceView(key: string | null = currentPlaceKey()): void {
  if (!key) return;
  if (usePlaceView.getState().mapAt === key) showPlace();
  else showMap(key);
}

/** True while the player is looking at the map from inside `key`. */
export function useShowingMap(key: string | null): boolean {
  return usePlaceView((s) => key !== null && s.mapAt === key);
}
