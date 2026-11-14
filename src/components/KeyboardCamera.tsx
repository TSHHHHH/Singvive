import { useEffect, useRef } from 'react';
import { useMapGL } from '../map/hooks';
import { useSetting } from '../game/settings';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { isModalOpen } from './modalStack';
import {
  ARROW_CODES,
  PAN_KEYS,
  PAN_RAMP_S,
  PAN_SHIFT_MULT,
  PAN_SPEED_PX,
  RECENTER_KEY,
  ROTATE_DEG_PER_S,
  ROTATE_KEYS,
  ZOOM_KEYS,
} from '../map/cameraKeys';

/** Held zoom keys step at most this often, so a held + is a zoom, not a dive. */
const ZOOM_REPEAT_MS = 180;
const ZOOM_EASE_MS = 220;
/** Below this speed (px/s) a coasting pan stops. */
const STOP_PX_S = 6;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Arrow keys belong to whatever has focus when that thing uses them (a tab
 * rail, a list, a scrolling panel). They pan only from the page itself, the
 * map, or a plain button — a button you just clicked should not eat them.
 */
function arrowsAreFree(map: { getContainer: () => HTMLElement }): boolean {
  const a = document.activeElement;
  if (!a || a === document.body || map.getContainer().contains(a)) return true;
  if (a.closest('[role="tablist"],[role="listbox"],[role="menu"],[role="radiogroup"],[role="slider"]')) return false;
  return a.tagName === 'BUTTON';
}

/**
 * Keyboard camera for the run map: WASD / arrows pan relative to the screen,
 * Shift goes faster, Q/E twist the 3D view, +/− zoom, C recentres on the pin.
 *
 * The pan is a held-key velocity loop rather than MapLibre's keyboard handler
 * (which steps once per OS key-repeat and stutters). Every move carries the key
 * event as `originalEvent`, so the travel chase treats it exactly like a drag:
 * the player has the camera until the next glide.
 */
export function KeyboardCamera({ home, onRecenter }: { home: { lat: number; lng: number }; onRecenter?: () => void }) {
  const map = useMapGL();
  const on = useSetting('mapKeys') === 'on';
  const speedId = useSetting('mapKeyPanSpeed');
  const reduced = useReducedMotion();
  const live = useRef({ home, speed: PAN_SPEED_PX.normal, reduced, onRecenter });
  live.current = { home, speed: PAN_SPEED_PX[speedId] ?? PAN_SPEED_PX.normal, reduced, onRecenter };

  useEffect(() => {
    if (!on) return;
    const held = new Set<string>();
    let shift = false;
    let vx = 0;
    let vy = 0;
    let raf = 0;
    let last = 0;
    let lastEvent: KeyboardEvent | null = null;
    let lastZoomAt = 0;

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;

      let ix = 0;
      let iy = 0;
      let rot = 0;
      for (const code of held) {
        const dir = PAN_KEYS[code];
        if (dir === 'up') iy -= 1;
        else if (dir === 'down') iy += 1;
        else if (dir === 'left') ix -= 1;
        else if (dir === 'right') ix += 1;
        rot += ROTATE_KEYS[code] ?? 0;
      }
      const len = Math.hypot(ix, iy);
      const full = live.current.speed * (shift ? PAN_SHIFT_MULT : 1);
      const tx = len ? (ix / len) * full : 0;
      const ty = len ? (iy / len) * full : 0;
      // Reduced motion: no ramp and no coast — the map moves only while held.
      const k = live.current.reduced ? 1 : 1 - Math.exp(-dt / PAN_RAMP_S);
      vx += (tx - vx) * k;
      vy += (ty - vy) * k;
      if (!len && Math.hypot(vx, vy) < STOP_PX_S) {
        vx = 0;
        vy = 0;
      }

      // Rotation is a 3D-view affordance; Camera3d disables it when flat.
      const dBearing = rot && map.dragRotate.isEnabled() ? rot * ROTATE_DEG_PER_S * (shift ? 2 : 1) * dt : 0;

      if (vx || vy || dBearing) {
        const c = map.project(map.getCenter());
        map.jumpTo(
          {
            center: map.unproject([c.x + vx * dt, c.y + vy * dt]),
            bearing: map.getBearing() + dBearing,
          },
          { originalEvent: lastEvent },
        );
      }

      if (held.size > 0 || vx || vy) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const onDown = (e: KeyboardEvent) => {
      shift = e.shiftKey;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.defaultPrevented || isModalOpen() || isEditable(e.target)) return;
      const code = e.code;

      if (PAN_KEYS[code] || ROTATE_KEYS[code]) {
        if (ARROW_CODES.has(code) && !arrowsAreFree(map)) return;
        e.preventDefault();
        lastEvent = e;
        held.add(code);
        kick();
        return;
      }

      const z = ZOOM_KEYS[code];
      if (z) {
        e.preventDefault();
        const now = performance.now();
        if (e.repeat && now - lastZoomAt < ZOOM_REPEAT_MS) return;
        lastZoomAt = now;
        map.easeTo(
          { zoom: map.getZoom() + z, duration: live.current.reduced ? 0 : ZOOM_EASE_MS },
          { originalEvent: e },
        );
        return;
      }

      if (code === RECENTER_KEY && !e.repeat) {
        e.preventDefault();
        if (live.current.onRecenter) {
          live.current.onRecenter();
          return;
        }
        const { home: h, reduced: still } = live.current;
        map.easeTo({ center: [h.lng, h.lat], duration: still ? 0 : 500 });
      }
    };

    const onUp = (e: KeyboardEvent) => {
      shift = e.shiftKey;
      held.delete(e.code);
    };
    // A key released while the tab is away never sends keyup.
    const release = () => {
      held.clear();
      shift = false;
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [map, on]);

  return null;
}
