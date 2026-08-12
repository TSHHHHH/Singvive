import { memo, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { PULSE_MS, type NoisePulse } from '../game/noise';

/**
 * The sound you just made, leaving you.
 *
 * Every ring is driven imperatively off a single rAF loop and drawn on its own
 * canvas renderer, deliberately kept off the map's shared one: animating a
 * radius means a full repaint of whatever canvas the shape lives on, and the
 * POI outlines are not going to repaint sixty times a second for this.
 *
 * The old implementation leaned on a CSS `@keyframes` rule, which never fired
 * — the map runs `preferCanvas`, so there is no SVG path for CSS to animate.
 */

/** Wavefronts per pulse, each launched a little after the last. */
const FRONTS = 3;
/** Fraction of the pulse's life between one wavefront and the next. */
const FRONT_STAGGER = 0.16;

const NOISE_COLOUR = '#d92d2d';

/** Fast out of the gate, coasting as it thins out — how sound actually reads. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

interface Ring {
  circle: L.Circle;
  pulse: NoisePulse;
  /** 0-based wavefront index — its share of the stagger. */
  front: number;
}

function NoiseWavesInner({ pulses }: { pulses: NoisePulse[] }) {
  const map = useMap();
  const ringsRef = useRef<Ring[]>([]);
  const rafRef = useRef<number | undefined>(undefined);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);

  // The group and the private renderer live as long as the map does.
  useEffect(() => {
    const renderer = L.canvas({ padding: 0.5 });
    const group = L.layerGroup([], { pane: 'overlayPane' }).addTo(map);
    rendererRef.current = renderer;
    groupRef.current = group;
    return () => {
      group.remove();
      renderer.remove();
      rendererRef.current = null;
      groupRef.current = null;
      ringsRef.current = [];
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    const renderer = rendererRef.current;
    if (!group || !renderer) return;

    // Retire rings whose pulse the store has already pruned.
    const liveIds = new Set(pulses.map((p) => p.id));
    ringsRef.current = ringsRef.current.filter((r) => {
      if (liveIds.has(r.pulse.id)) return true;
      group.removeLayer(r.circle);
      return false;
    });

    // Launch wavefronts for pulses we haven't seen yet.
    const drawnIds = new Set(ringsRef.current.map((r) => r.pulse.id));
    for (const pulse of pulses) {
      if (drawnIds.has(pulse.id)) continue;
      for (let front = 0; front < FRONTS; front += 1) {
        const circle = L.circle([pulse.lat, pulse.lng], {
          radius: 0,
          interactive: false,
          renderer,
          color: NOISE_COLOUR,
          weight: 3,
          opacity: 0,
          fillColor: NOISE_COLOUR,
          fillOpacity: 0,
        });
        group.addLayer(circle);
        ringsRef.current.push({ circle, pulse, front });
      }
    }

    if (ringsRef.current.length === 0) {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
      return;
    }
    if (rafRef.current !== undefined) return; // loop already running

    const tick = () => {
      const now = Date.now();
      let anyLive = false;

      for (const { circle, pulse, front } of ringsRef.current) {
        // Each front is the same wave, launched a beat later.
        const t = (now - pulse.startedAt) / PULSE_MS - front * FRONT_STAGGER;
        if (t <= 0) {
          circle.setStyle({ opacity: 0, fillOpacity: 0 });
          anyLive = true;
          continue;
        }
        if (t >= 1) {
          circle.setStyle({ opacity: 0, fillOpacity: 0 });
          continue;
        }
        anyLive = true;

        // Later fronts are quieter, so the pulse reads as one wave with a wake
        // rather than three rings of equal weight.
        const strength = 1 - front / FRONTS;
        const fade = (1 - t) ** 1.6;
        circle.setRadius(pulse.radiusMeters * easeOut(t));
        circle.setStyle({
          weight: 1 + 2.5 * fade * strength,
          opacity: 0.65 * fade * strength,
          // Only the leading front carries a wash of fill.
          fillOpacity: front === 0 ? 0.06 * fade : 0,
        });
      }

      if (anyLive) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = undefined;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [pulses]);

  useEffect(
    () => () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return null;
}

export const NoiseWaves = memo(NoiseWavesInner);
