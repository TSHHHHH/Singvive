import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LngLatBounds, type Map as MlMap } from 'maplibre-gl';
import { useMapGL } from '../map/hooks';
import { useGame } from '../game/store';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { guide, useGuideState } from './guide';
import type { GuideState } from './runner';
import type { GuidePoint, GuideShot } from './types';
import { stepPins } from './pins';
import { GuideCalloutCard } from './GuideCalloutCard';
import { Icon } from '../icons/Icon';

/** Extra room around a framed set of points, on top of the HUD padding. */
const FIT_PAD = 70;
const RESTORE_MS = 900;

interface CameraSnapshot {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

/**
 * Marks our own camera moves. The travel chase and CameraChrome hand the
 * camera over on `cameraFocus` exactly as they do for a log-line focus, so
 * nothing pulls the view back mid-tour.
 */
const GUIDE_EVENT = { cameraFocus: true, guide: true };

/**
 * A framing shot eases a steep 3D tilt so the far points do not crowd into a
 * strip at the horizon. The flat view (pitch 0) is left flat.
 */
const FIT_MAX_PITCH = 30;

function shotCamera(map: MlMap, shot: GuideShot) {
  const keep = { pitch: shot.pitch ?? map.getPitch(), bearing: shot.bearing ?? map.getBearing() };
  if (shot.fit && shot.fit.length > 1) {
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    // A tall phone map is width-bound; a flatter tilt gives the names more rows.
    if (shot.pitch === undefined) keep.pitch = Math.min(keep.pitch, h > w ? FIT_MAX_PITCH / 2 : FIT_MAX_PITCH);
    const side = w < 640 ? 36 : FIT_PAD;
    const bounds = new LngLatBounds();
    for (const p of shot.fit) bounds.extend([p.lng, p.lat]);
    // Keep the framed points clear of the guide caption over the top of the map.
    const box = map.getContainer().getBoundingClientRect();
    const caption = document.querySelector('[data-guide-caption]')?.getBoundingClientRect();
    const pad = map.getPadding();
    const top = caption ? Math.max(0, caption.bottom - box.top - (pad.top ?? 0)) : 0;
    // HUD docked over the map's foot (the phone's here row) that padding does not cover.
    let foot = 0;
    for (const el of document.querySelectorAll('[data-guide-avoid="bottom"]')) {
      const r = el.getBoundingClientRect();
      if (r.height > 0) foot = Math.max(foot, box.bottom - r.top - (pad.bottom ?? 0));
    }
    const cam = map.cameraForBounds(bounds, {
      padding: { top: FIT_PAD + top, bottom: FIT_PAD + Math.max(0, foot), left: side, right: side },
      bearing: keep.bearing,
      maxZoom: shot.maxZoom ?? 16,
    });
    if (cam) return { ...keep, center: cam.center, zoom: cam.zoom };
  }
  let center: GuidePoint | null = null;
  if (shot.center === 'player') center = useGame.getState().currentPos;
  else if (shot.center) center = shot.center;
  else if (shot.fit?.length === 1) center = shot.fit[0];
  return {
    ...keep,
    ...(center ? { center: [center.lng, center.lat] as [number, number] } : {}),
    ...(shot.zoom !== undefined ? { zoom: shot.zoom } : {}),
  };
}

/**
 * The guide's hands on the map: flies each step's shot and reports arrival,
 * restores the view afterwards, and pins anchored call-outs over the map.
 * Mounted inside MapView. Every move is a one-shot camera command, so the
 * map idles (zero renders) while a step holds; the call-out and its ring
 * animate in CSS on DOM, which never asks the map to repaint.
 */
export function GuideMapAdapter() {
  const map = useMapGL();
  const state = useGuideState();
  const reduced = useReducedMotion();
  const home = useRef<{ snap: CameraSnapshot; restore: boolean; id: string } | null>(null);

  // Sequence start: remember where the camera was. End: go back there.
  const seqId = state?.sequence.id ?? null;
  useEffect(() => {
    if (seqId && state) {
      if (home.current?.id === seqId) return;
      if (home.current) {
        // A queued sequence follows straight on: keep the view from before the chain.
        home.current = { ...home.current, id: seqId, restore: home.current.restore || state.sequence.restoreCamera };
        return;
      }
      const c = map.getCenter();
      home.current = {
        snap: { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() },
        restore: state.sequence.restoreCamera,
        id: seqId,
      };
      return;
    }
    const was = home.current;
    home.current = null;
    if (!was?.restore) return;
    try {
      map.stop();
      if (reduced) map.jumpTo(was.snap, GUIDE_EVENT);
      else map.flyTo({ ...was.snap, duration: RESTORE_MS, essential: true }, GUIDE_EVENT);
    } catch {
      // The map went away with the run.
    }
    // Only the sequence identity matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, seqId]);

  // Each step's shot.
  const token = state?.token ?? 0;
  const moving = state?.phase === 'moving';
  useEffect(() => {
    const s = guide.state;
    if (!s || s.token !== token || s.phase !== 'moving' || !s.step.shot) return;
    const cam = shotCamera(map, s.step.shot);
    let done = false;
    const arrive = () => {
      if (done) return;
      done = true;
      map.off('moveend', arrive);
      guide.arrived(token);
    };
    map.stop();
    if (reduced || !s.step.shot.durationMs) {
      map.jumpTo(cam, GUIDE_EVENT);
      arrive();
      return;
    }
    map.flyTo({ ...cam, duration: s.step.shot.durationMs, essential: true }, GUIDE_EVENT);
    map.on('moveend', arrive);
    return () => {
      done = true;
      map.off('moveend', arrive);
    };
  }, [map, token, moving, reduced]);

  return state ? <AnchoredCallout map={map} state={state} reduced={reduced} /> : null;
}

/** Gap between a pin and its card, clearing the 34 px site badge. */
const CARD_GAP = 24;

interface Rect { l: number; t: number; r: number; b: number }
type Side = 'above' | 'below' | 'right' | 'left';
const SIDES: Side[] = ['above', 'below', 'right', 'left'];

function sideRect(p: { x: number; y: number }, s: { w: number; h: number }, side: Side): Rect {
  if (side === 'above') return { l: p.x - s.w / 2, r: p.x + s.w / 2, t: p.y - CARD_GAP - s.h, b: p.y - CARD_GAP };
  if (side === 'below') return { l: p.x - s.w / 2, r: p.x + s.w / 2, t: p.y + CARD_GAP, b: p.y + CARD_GAP + s.h };
  if (side === 'right') return { l: p.x + CARD_GAP, r: p.x + CARD_GAP + s.w, t: p.y - s.h / 2, b: p.y + s.h / 2 };
  return { l: p.x - CARD_GAP - s.w, r: p.x - CARD_GAP, t: p.y - s.h / 2, b: p.y + s.h / 2 };
}

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/** Half a site badge, plus a little air: cards must not sit on another pin. */
const PIN_HALF = 20;

/**
 * The first side that clears every card placed so far, every pin and the
 * screen edge, else the least crowded one (spilling off screen costs most).
 */
function pickSide(
  p: { x: number; y: number }, size: { w: number; h: number }, taken: Rect[], screen: Rect,
): { side: Side; rect: Rect } {
  let best = { side: SIDES[0], rect: sideRect(p, size, SIDES[0]), cost: Infinity };
  for (const side of SIDES) {
    const rect = sideRect(p, size, side);
    const area = (rect.r - rect.l) * (rect.b - rect.t);
    const cost = taken.reduce((sum, o) => sum + overlap(rect, o), 0) + 2 * (area - overlap(rect, screen));
    if (cost === 0) return { side, rect };
    if (cost < best.cost) best = { side, rect, cost };
  }
  return best;
}

/**
 * The emphasised call-outs over map points. They live in a fixed layer above
 * the HUD (not in MapLibre's marker pane, which sits under the weather and
 * vignettes) and follow their points on map `move` only — never on a timer.
 * Each card takes the first side of its pin (above, below, right, left) that
 * clears the cards already placed, else the least crowded one.
 */
function AnchoredCallout({ map, state, reduced }: { map: MlMap; state: GuideState; reduced: boolean }) {
  const { step, phase, token } = state;
  const pins = useMemo(() => stepPins(step), [step]);
  const boxes = useRef<(HTMLDivElement | null)[]>([]);
  const cards = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    if (!pins.length || phase !== 'showing') return;
    // Card sizes are fixed once laid out; read them once, not per move.
    const sizes = cards.current.map((el) => (el ? { w: el.offsetWidth, h: el.offsetHeight } : null));
    const place = () => {
      const rect = map.getContainer().getBoundingClientRect();
      const pts = pins.map((p, i) => ({ i, p: map.project([p.at.lng, p.at.lat]) }));
      // Every pin's badge is off limits to every card.
      const taken: Rect[] = pts.map(({ p }) => ({ l: p.x - PIN_HALF, r: p.x + PIN_HALF, t: p.y - PIN_HALF, b: p.y + PIN_HALF }));
      const caption = document.querySelector('[data-guide-caption]')?.getBoundingClientRect();
      let foot = rect.height;
      for (const el of document.querySelectorAll('[data-guide-avoid="bottom"]')) {
        const r = el.getBoundingClientRect();
        if (r.height > 0) foot = Math.min(foot, r.top - rect.top);
      }
      const screen: Rect = { l: 0, t: caption ? Math.max(0, caption.bottom - rect.top) : 0, r: rect.width, b: foot };
      // Top of the screen first, so the upper card keeps its usual spot.
      for (const { i, p } of [...pts].sort((a, b) => a.p.y - b.p.y)) {
        const box = boxes.current[i];
        if (!box) continue;
        box.style.transform = `translate3d(${Math.round(rect.left + p.x)}px, ${Math.round(rect.top + p.y)}px, 0)`;
        const size = sizes[i];
        if (!size) continue;
        const side = pickSide(p, size, taken, screen);
        box.dataset.side = side.side;
        taken.push(side.rect);
      }
    };
    place();
    map.on('move', place);
    map.on('resize', place);
    window.addEventListener('resize', place);
    return () => {
      map.off('move', place);
      map.off('resize', place);
      window.removeEventListener('resize', place);
    };
  }, [map, pins, phase]);

  if (!pins.length || phase !== 'showing') return null;
  return createPortal(
    <div key={token} className={reduced ? 'guide-still' : undefined} aria-live="polite">
      {pins.map((pin, i) => (
        <div
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          className="guide-anchor pointer-events-none fixed left-0 top-0 z-[1085]"
        >
          {pin.ring && (
            <div className="guide-ring" style={pin.callout?.accent ? { color: pin.callout.accent } : undefined} aria-hidden>
              {/* Its own badge: site markers hide when zoomed far out. */}
              {pin.callout?.icon && (
                <span className="guide-ring-icon">
                  <Icon name={pin.callout.icon} size={16} />
                </span>
              )}
            </div>
          )}
          {pin.callout && (
            <div
              className="guide-anchor-card"
              ref={(el) => {
                cards.current[i] = el;
              }}
            >
              <GuideCalloutCard callout={pin.callout} />
            </div>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
