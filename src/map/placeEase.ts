import type { EaseToOptions, Map as MlMap } from 'maplibre-gl';

/** Slow in, slow out: the place view's swing onto a site and back to the map. */
export function placeEasing(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * `easeTo` that also eases the centre elevation. MapLibre's easeTo ignores
 * `elevation`, and `setCenterElevation` is a jumpTo, so setting it before the
 * ease lifts or drops the whole view in one frame. Ride the ease's own easing
 * callback instead: it runs once per frame before the transform is applied.
 * Without terrain `map.transform` is the transform the ease writes to.
 */
export function easeWithElevation(map: MlMap, options: EaseToOptions, elevation: number): void {
  const from = map.getCenterElevation();
  const easing = options.easing ?? placeEasing;
  if (!options.duration || from === elevation) {
    if (from !== elevation) map.setCenterElevation(elevation);
    map.easeTo({ ...options, easing });
    return;
  }
  map.easeTo({
    ...options,
    easing: (t) => {
      const k = easing(t);
      map.transform.setElevation(from + (elevation - from) * k);
      return k;
    },
  });
}
