import { memo, useEffect, useState } from 'react';
import { useSetting, useSettingIsExplicit } from '../game/settings';
import type { TimeOfDay, WeatherKind } from '../game/types';

// ---------------------------------------------------------------------------
// Diegetic weather over the map.
//
// Performance is the whole design here. There are no particles, no canvas, no
// per-frame JS: each effect is a few <div>s painted with gradients and animated
// with `transform`/`opacity` only. Those two properties are handled on the
// compositor, so the layer is rasterised once and the Leaflet canvas underneath
// is never invalidated — the same rule the vignettes in index.css follow.
// Full weather caps at one oversized animated sheet; static tints stay
// viewport-sized. Total cost: <=3 DOM nodes, 0 JS per frame.
//
// The layers live in index.css (.wx-*).
// ---------------------------------------------------------------------------

/**
 * The OS "reduce motion" hint, live.
 *
 * It only decides the *default* here. A frozen rain sheet is a static hatch
 * across the map — worse to look at than the thing it's sparing you — so when
 * motion is off we swap in still tints instead (see `stillLayersFor`), and an
 * explicit choice in Settings overrides the hint entirely.
 */
function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduce;
}

/** Which layers each weather kind puts up. `day`-only effects gate on time.
 *
 * Full caps at one oversized animated sheet per kind (rain/haze/heat shimmer);
 * clear is a single static wash. Static tints (wet, overcast, glare) are free. */
function layersFor(kind: WeatherKind, time: TimeOfDay, subtle: boolean): string[] {
  switch (kind) {
    case 'rain':
      return subtle ? ['wx-rain-back'] : ['wx-wet-still', 'wx-rain-back'];
    case 'thunderstorm':
      return subtle
        ? ['wx-rain-back', 'wx-flash']
        : ['wx-overcast', 'wx-rain-back', 'wx-flash'];
    case 'haze':
      return subtle ? ['wx-haze'] : ['wx-haze', 'wx-haze-drift'];
    case 'cloudy':
      return ['wx-overcast'];
    case 'heat':
      // The heat is the same at 3am — only the glare is gone.
      if (time === 'night') return ['wx-heat-haze'];
      return subtle
        ? ['wx-heat-haze', 'wx-heat-glare']
        : ['wx-heat-haze', 'wx-heat-glare', 'wx-heat-shimmer'];
    case 'clear':
      // Equatorial glare only reads in daylight; at dusk/night nothing shows.
      if (time === 'night') return [];
      return ['wx-sun-wash'];
  }
}

/** Motion-free equivalents: colour and mood only, nothing patterned. */
function stillLayersFor(kind: WeatherKind, time: TimeOfDay): string[] {
  switch (kind) {
    case 'rain':
      return ['wx-wet-still'];
    case 'thunderstorm':
      return ['wx-wet-still', 'wx-overcast'];
    case 'haze':
      return ['wx-haze'];
    case 'cloudy':
      return ['wx-overcast'];
    case 'heat':
      return time === 'night' ? ['wx-heat-haze'] : ['wx-heat-haze', 'wx-heat-glare'];
    case 'clear':
      return time === 'night' ? [] : ['wx-sun-wash'];
  }
}

/**
 * Full-bleed weather overlay. Renders nothing when the effect list is empty or
 * the player has turned it off, so `clear` night costs literally zero.
 */
function WeatherFxInner({ kind, time }: { kind: WeatherKind; time: TimeOfDay }) {
  const mode = useSetting('weatherFx');
  const chosen = useSettingIsExplicit('weatherFx');
  const reduce = usePrefersReducedMotion();
  if (mode === 'off') return null;

  // The OS hint is the default, not a veto: picking a mode in Settings is a
  // deliberate statement about this overlay, and it wins.
  const still = reduce && !chosen;
  const layers = still ? stillLayersFor(kind, time) : layersFor(kind, time, mode === 'subtle');
  if (layers.length === 0) return null;

  return (
    <div className="wx-root pointer-events-none absolute inset-0 z-[460] overflow-hidden">
      {layers.map((cls) => (
        <div key={cls} className={cls} />
      ))}
    </div>
  );
}

export const WeatherFx = memo(WeatherFxInner);
