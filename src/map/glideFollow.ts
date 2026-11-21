import type { TravelAnim } from '../game/store';
import { pointAlongPath } from '../game/route';
import { travelEase } from '../ui/travelMotion';

type LatLng = { lat: number; lng: number };

/** The polyline the walking pin glides along. */
export function glidePath(anim: TravelAnim): LatLng[] {
  return anim.path.length >= 2
    ? anim.path
    : [
        { lat: anim.fromLat, lng: anim.fromLng },
        { lat: anim.toLat, lng: anim.toLng },
      ];
}

/** The pin's spot at `nowMs` (a Date.now() reading), on the same clock and ease as PlayerMarker. */
export function glidePointAt(anim: TravelAnim, nowMs: number, path: LatLng[] = glidePath(anim)): LatLng {
  const t = Math.min(1, Math.max(0, (nowMs - anim.startedAt) / anim.durationMs));
  return pointAlongPath(path, travelEase(t));
}

/**
 * Hand `fn` the walking pin's position on every animation frame of a glide,
 * or `home` once when there is none. Stops scheduling frames when the glide
 * lands, so nothing redraws while the player stands still.
 * Returns the cancel.
 */
export function followGlide(
  home: LatLng,
  anim: TravelAnim | null,
  fn: (at: LatLng) => void,
  clock: {
    now?: () => number;
    frame?: (cb: () => void) => number;
    cancel?: (id: number) => void;
  } = {},
): () => void {
  if (!anim) {
    fn(home);
    return () => {};
  }
  const now = clock.now ?? (() => Date.now());
  const frame = clock.frame ?? ((cb) => requestAnimationFrame(cb));
  const cancel = clock.cancel ?? ((id) => cancelAnimationFrame(id));
  const path = glidePath(anim);
  let id = 0;
  let last: LatLng | null = null;
  const tick = () => {
    id = 0;
    const ms = now();
    const at = glidePointAt(anim, ms, path);
    if (!last || last.lat !== at.lat || last.lng !== at.lng) {
      last = at;
      fn(at);
    }
    if (ms - anim.startedAt < anim.durationMs) id = frame(tick);
  };
  tick();
  return () => {
    if (id) cancel(id);
    id = 0;
  };
}
