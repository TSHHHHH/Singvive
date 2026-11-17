import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LngLatBounds, type Map as MlMap } from 'maplibre-gl';
import { useMapGL } from '../map/hooks';
import { useGame } from '../game/store';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { guide, useGuideState } from './guide';
import type { GuideState } from './runner';
import type { GuidePoint, GuideShot } from './types';
import { GuideCalloutCard } from './GuideCalloutCard';

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

function shotCamera(map: MlMap, shot: GuideShot) {
  const keep = { pitch: shot.pitch ?? map.getPitch(), bearing: shot.bearing ?? map.getBearing() };
  if (shot.fit && shot.fit.length > 1) {
    const bounds = new LngLatBounds();
    for (const p of shot.fit) bounds.extend([p.lng, p.lat]);
    const cam = map.cameraForBounds(bounds, { padding: FIT_PAD, bearing: keep.bearing, maxZoom: shot.maxZoom ?? 16 });
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

/**
 * The emphasised call-out over a map point. It lives in a fixed layer above
 * the HUD (not in MapLibre's marker pane, which sits under the weather and
 * vignettes) and follows the point on map `move` only — never on a timer.
 */
function AnchoredCallout({ map, state, reduced }: { map: MlMap; state: GuideState; reduced: boolean }) {
  const { step, phase, token } = state;
  const anchor = step.callout?.anchor ?? null;
  const ring = step.highlight ?? null;
  const at = anchor ?? ring;
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!at || phase !== 'showing') return;
    const place = () => {
      const el = box.current;
      if (!el) return;
      const rect = map.getContainer().getBoundingClientRect();
      const p = map.project([at.lng, at.lat]);
      el.style.transform = `translate3d(${Math.round(rect.left + p.x)}px, ${Math.round(rect.top + p.y)}px, 0)`;
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
  }, [map, at, phase]);

  if (!at || phase !== 'showing') return null;
  return createPortal(
    <div
      ref={box}
      key={token}
      className={`guide-anchor pointer-events-none fixed left-0 top-0 z-[1085]${reduced ? ' guide-still' : ''}`}
      aria-live="polite"
    >
      {ring && <div className="guide-ring" style={step.callout?.accent ? { color: step.callout.accent } : undefined} aria-hidden />}
      {anchor && step.callout && (
        <div className="guide-anchor-card">
          <GuideCalloutCard callout={step.callout} />
        </div>
      )}
    </div>,
    document.body,
  );
}
