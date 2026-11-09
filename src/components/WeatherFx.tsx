import { memo } from 'react';
import { useSetting } from '../game/settings';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { TimeOfDay, WeatherKind } from '../game/types';
import { useAtmosphere, type WeatherDom } from './useAtmosphere';

// ---------------------------------------------------------------------------
// Diegetic weather over the map.
//
// Performance is the whole design here. There are no particles, no canvas, no
// per-frame JS: each effect is a few <div>s painted with gradients and animated
// with `transform`/`opacity` only. Those two properties are handled on the
// compositor, so the layer is rasterised once and the map canvas underneath
// is never invalidated — the same rule the vignettes in index.css follow.
// Full weather caps at one oversized animated sheet; static tints stay
// viewport-sized. Total cost: <=3 DOM nodes, 0 JS per frame.
//
// The layers live in index.css (.wx-*).
//
// In the 3D view the weather moves into the world (src/map/atmosphere.ts): the
// map's light and sky carry the tint, so the static washes drop out. What
// stays here is what only the DOM can draw — the moving sheets, a depth haze
// across the top of the tilted view, and the lightning bloom the driver
// flashes in step with the buildings.
// ---------------------------------------------------------------------------

// Reduced motion does not mean "freeze": a frozen rain sheet is a static hatch
// across the map, worse to look at than the thing it is sparing you. When
// motion is off we swap in still tints instead — see `stillLayersFor`.

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

/** Layers that move. In 3D these are all the overlay keeps; the light does the rest. */
const MOVING = new Set(['wx-rain-back', 'wx-haze-drift', 'wx-heat-shimmer']);

/**
 * Full-bleed weather overlay. Renders nothing when the effect list is empty or
 * the player has turned it off, so `clear` night costs literally zero.
 */
function WeatherFxInner({
  kind,
  time,
  view3d = false,
  dom,
}: {
  kind: WeatherKind;
  time: TimeOfDay;
  /** The 3D view is on: tints come from the map's light, see Atmosphere3d. */
  view3d?: boolean;
  dom?: WeatherDom;
}) {
  const mode = useSetting('weatherFx');
  const still = useReducedMotion();
  const { atmos, lightning } = useAtmosphere(kind, time);
  if (mode === 'off') return null;

  if (view3d && dom) {
    const layers = still ? [] : layersFor(kind, time, mode === 'subtle').filter((c) => MOVING.has(c));
    return (
      <div className="wx-root pointer-events-none absolute inset-0 z-[460] overflow-hidden">
        {/* Opacity follows camera pitch (AtmosphereDriver); hidden until it does. */}
        <div ref={dom.depth} className="wx-depth-tilt">
          <div
            className="wx-depth"
            style={{
              backgroundColor: atmos.haze,
              opacity: atmos.hazeAlpha,
              height: `${Math.round(atmos.hazeReach * 100)}%`,
            }}
          />
        </div>
        {layers.map((cls) => (
          <div key={cls} className={cls} />
        ))}
        {lightning && <div ref={dom.bolt} className="wx-bolt" />}
      </div>
    );
  }

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
