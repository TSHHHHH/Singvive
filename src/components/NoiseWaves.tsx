import { memo, useEffect, useRef } from 'react';
import type { Feature } from 'geojson';
import { PULSE_MS, type NoisePulse } from '../game/noise';
import { useMapGL } from '../map/hooks';
import { installOverlay, setData } from '../map/layers';
import { circleFeature, fc, EMPTY_FC } from '../map/geo';

/**
 * The sound you just made, leaving you.
 *
 * One GeoJSON source holds every live wavefront. A single rAF loop rebuilds
 * it each frame (a handful of 48-step rings) and stops as soon as the last
 * front has faded, so a quiet map costs nothing.
 */

/** Wavefronts per pulse, each launched a little after the last. */
const FRONTS = 3;
/** Fraction of the pulse's life between one wavefront and the next. */
const FRONT_STAGGER = 0.16;

const NOISE_COLOUR = '#d92d2d';
const SRC = 'noise-src';

/** Fast out of the gate, coasting as it thins out — how sound actually reads. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function NoiseWavesInner({ pulses }: { pulses: NoisePulse[] }) {
  const map = useMapGL();
  const pulsesRef = useRef(pulses);
  pulsesRef.current = pulses;
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const off = installOverlay(map, 'noise', { [SRC]: 'geojson' }, [
      {
        id: 'noise-fill',
        type: 'fill',
        source: SRC,
        paint: { 'fill-color': NOISE_COLOUR, 'fill-opacity': ['get', 'fop'] },
      },
      {
        id: 'noise-line',
        type: 'line',
        source: SRC,
        paint: {
          'line-color': NOISE_COLOUR,
          'line-width': ['get', 'w'],
          'line-opacity': ['get', 'op'],
        },
      },
    ]);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
      off();
    };
  }, [map]);

  useEffect(() => {
    if (rafRef.current !== undefined) return; // loop already running

    const tick = () => {
      const now = Date.now();
      let anyLive = false;
      const features: Feature[] = [];

      for (const pulse of pulsesRef.current) {
        for (let front = 0; front < FRONTS; front += 1) {
          // Each front is the same wave, launched a beat later.
          const t = (now - pulse.startedAt) / PULSE_MS - front * FRONT_STAGGER;
          if (t >= 1) continue;
          anyLive = true;
          if (t <= 0) continue;
          // Later fronts are quieter: one wave with a wake, not three equal rings.
          const strength = 1 - front / FRONTS;
          const fade = (1 - t) ** 1.6;
          features.push(
            circleFeature(pulse.lat, pulse.lng, pulse.radiusMeters * easeOut(t), {
              w: 1 + 2.5 * fade * strength,
              op: 0.65 * fade * strength,
              // Only the leading front carries a wash of fill.
              fop: front === 0 ? 0.06 * fade : 0,
            }),
          );
        }
      }

      setData(map, SRC, features.length ? fc(features) : EMPTY_FC);
      rafRef.current = anyLive ? requestAnimationFrame(tick) : undefined;
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [map, pulses]);

  return null;
}

export const NoiseWaves = memo(NoiseWavesInner);
