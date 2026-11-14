import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MlMap } from 'maplibre-gl';
import type { Poi } from '../game/types';
import { MapView } from '../map/MapView';
import { useMapGL } from '../map/hooks';
import { alive } from '../map/layers';
import { BuildingEngine } from '../map/buildings';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Beacons3d } from './Beacons3d';
import { SCENES, type Scene } from '../map/menuScenes';

/**
 * The home screen's backdrop: the real island in 3D, dimmed, with its fires
 * smoking and an evac light standing over the skyline.
 *
 * Cheap by construction. The map draws a scene once and then sits still: the
 * slow drift is a CSS transform on the map's box (compositor only, zero map
 * renders), and the smoke and beacon are DOM markers that ride along. The map
 * only renders again on a cut to the next scene, behind a fade to black,
 * every SCENE_MS. Reduced motion holds one scene with no drift and no cuts.
 * The whole map is torn down with the menu when a run starts.
 */

const ZOOM = 15.7;
const PITCH = 62;
/** Buildings inside this disc stand (and can burn); further out stay flat. */
const REVEAL_M = 1400;
/** How long one scene drifts before the cut. Matches `menu-drift` in index.css. */
const SCENE_MS = 24_000;
const FADE_MS = 1100;
/** Don't hold the screen black forever if tiles are slow. */
const IDLE_TIMEOUT_MS = 5000;

/** Wait for the map to finish drawing (or give up after a while). */
function whenIdle(map: MlMap): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (alive(map)) map.off('idle', finish);
      resolve();
    };
    const timer = setTimeout(finish, IDLE_TIMEOUT_MS);
    map.once('idle', finish);
  });
}

export function MenuBackdrop({ start }: { start?: Scene | null }) {
  const reduced = useReducedMotion();
  // A saved run opens on its own survivor's streets; otherwise a random spot.
  const scenes = useMemo(() => {
    const first = Math.floor(Math.random() * SCENES.length);
    const order = [...SCENES.slice(first), ...SCENES.slice(0, first)];
    return start ? [start, ...order] : order;
  }, [start]);
  const s0 = scenes[0];

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-black" aria-hidden="true">
      <MapView
        // maplibre makes its box position:relative, so size it, don't inset it.
        className="menu-map h-full w-full"
        center={{ lat: s0.lat, lng: s0.lng }}
        zoom={ZOOM}
        pitch={PITCH}
        maxPitch={PITCH}
        bearing={s0.bearing}
        rotate
        interactive={false}
      >
        <Scenes scenes={scenes} reduced={reduced} />
      </MapView>
      {/* Fog: two slow banks, gradients only (no blur filters to repaint). */}
      <div className={`menu-fog ${reduced ? '' : 'menu-fog--drift'}`} />
      {/* Dim, and darkest behind the menu column so the copy stays readable. */}
      <div className="menu-dim absolute inset-0" />
    </div>
  );
}

function Scenes({ scenes, reduced }: { scenes: readonly Scene[]; reduced: boolean }) {
  const map = useMapGL();
  const [engine, setEngine] = useState<BuildingEngine | null>(null);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const visible = shown && !leaving;
  const cur = scenes[index % scenes.length];
  const box = useRef(map.getContainer());

  useEffect(() => {
    const e = new BuildingEngine(map);
    // Buildings snap up: a rise animation would render the map every frame.
    e.setInstant(true);
    setEngine(e);
    return () => e.destroy();
  }, [map]);

  // Point the camera and the standing disc at the scene, then fade in on idle.
  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    map.jumpTo({ center: [cur.lng, cur.lat], bearing: cur.bearing, zoom: ZOOM, pitch: PITCH });
    engine.setReveal({ lat: cur.lat, lng: cur.lng, radius: REVEAL_M });
    void whenIdle(map).then(() => {
      if (!cancelled) setShown(true);
    });
    return () => {
      cancelled = true;
    };
  }, [map, engine, cur]);

  // The drift is CSS; restart it on each scene. Reduced motion: none at all.
  useEffect(() => {
    const el = box.current;
    el.classList.toggle('menu-map--shown', visible);
    // Keep drifting through the fade-out; restart only on the next scene.
    el.classList.toggle('menu-map--drift', !reduced && shown);
    return () => {
      el.classList.remove('menu-map--drift', 'menu-map--shown');
    };
  }, [reduced, shown, visible, index]);

  // Cut to the next scene: fade out (leaving), then step the index; the
  // effect above re-aims and fades back in once the map is idle.
  useEffect(() => {
    if (reduced || !shown || leaving || scenes.length < 2) return;
    const next = () => {
      // A hidden tab has paused the drift; don't cut while nobody can see it.
      if (document.hidden) {
        timer = setTimeout(next, 2000);
        return;
      }
      setLeaving(true);
    };
    let timer = setTimeout(next, SCENE_MS - FADE_MS);
    return () => clearTimeout(timer);
  }, [reduced, shown, leaving, scenes.length]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      setShown(false);
      setLeaving(false);
      setIndex((i) => i + 1);
    }, FADE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  const beacon = useMemo(
    () => [{ id: 'menu-evac', lat: cur.beacon.lat, lng: cur.beacon.lng } as Poi],
    [cur],
  );
  return <Beacons3d pois={beacon} evacZoneId="menu-evac" />;
}
