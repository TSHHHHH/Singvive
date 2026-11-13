import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { Map as MlMap } from 'maplibre-gl';
import { useGame } from '../game/store';
import type { BeaconKind } from '../map/beacons';
import { alive } from '../map/layers';
import { CALLOUT_GAP, placeCallouts, type CalloutBox, type CalloutPoint } from '../map/callouts';

/** Where a floating card points on the map. */
export interface CalloutAnchor {
  lat: number;
  lng: number;
  /** Site whose roof the badge rides (3D); the card clears it. */
  siteId?: string | null;
  /** Landmark beacon the badge rides instead of the roof (3D). */
  beacon?: BeaconKind | null;
  /** Px from the anchored point up to the top of whatever marks it. */
  gap: number;
}

export interface CalloutSlot {
  anchor: CalloutAnchor;
  body: ReactNode;
}

interface Props {
  map: MlMap;
  here: CalloutSlot | null;
  target: CalloutSlot | null;
  /**
   * The player pin's live position. While `followPin` is set the here card
   * rides it (mid-glide) instead of its own anchor.
   */
  pinRef: RefObject<{ lat: number; lng: number } | null>;
  followPin: boolean;
  /** Called by the owner whenever the pin moves; set by this component. */
  kickRef: RefObject<(() => void) | null>;
  /** Px of each map edge covered by other chrome; cards stay clear of it. */
  inset: { top: number; right: number; bottom: number; left: number };
  /**
   * Px of top camera padding that leaves the here card room above the pin
   * (0 when it already fits around the middle of the map, or there is none).
   */
  onHereHeadroom?: (px: number) => void;
}

type Key = 'here' | 'target';

/** Roof lift the camera padding allows for above the pin, px. */
const ROOF_ALLOWANCE_PX = 64;

/**
 * Desktop: the here and target cards as callouts floating over their own
 * markers. Each follows its site as the map pans, zooms and tilts, clears the
 * roof or beacon its badge rides, stays inside the open part of the map, and
 * the two lean away from each other so neither covers the other.
 *
 * The layer sits beside the map (not inside it) so clicks and drags on a card
 * never reach the map, and so the cards draw over the weather. Placement is
 * imperative on the map's own events; React only renders the card bodies.
 */
export function MapCallouts({ map, here, target, pinRef, followPin, kickRef, inset, onHereHeadroom }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const els = useRef<Record<Key, HTMLDivElement | null>>({ here: null, target: null });
  const sizes = useRef<Record<Key, { w: number; h: number }>>({ here: { w: 0, h: 0 }, target: { w: 0, h: 0 } });
  const last = useRef<Record<Key, CalloutBox | null>>({ here: null, target: null });

  const roofs = useGame((s) => s.siteRoofs);
  const live = useRef({ here, target, followPin, inset, roofs });
  live.current = { here, target, followPin, inset, roofs };

  const place = useCallback(() => {
    const layer = layerRef.current;
    if (!layer || !alive(map)) return;
    const s = live.current;
    const box = map.getContainer();
    const roofLift = parseFloat(box.style.getPropertyValue('--roof-lift')) || 0;
    const beaconH = parseFloat(box.style.getPropertyValue('--beacon-h')) || 0;

    const point = (key: Key, a: CalloutAnchor, pin: { lat: number; lng: number } | null): CalloutPoint => {
      const p = map.project(pin ? [pin.lng, pin.lat] : [a.lng, a.lat]);
      // Mid-glide the pin is on the ground between sites: nothing to clear.
      const lift = pin
        ? 0
        : a.beacon
          ? beaconH * (a.beacon === 'evac' ? 1.35 : 1)
          : (a.siteId ? s.roofs[a.siteId] ?? 0 : 0) * roofLift;
      return { x: p.x, y: p.y, lift, gap: a.gap, ...sizes.current[key] };
    };

    const boxes = placeCallouts(
      s.here ? point('here', s.here.anchor, s.followPin ? pinRef.current : null) : null,
      s.target ? point('target', s.target.anchor, null) : null,
      { w: layer.clientWidth, h: layer.clientHeight, ...s.inset },
    );

    for (const key of ['here', 'target'] as const) {
      const el = els.current[key];
      const b = boxes[key];
      if (!el || !b) {
        last.current[key] = null;
        continue;
      }
      const prev = last.current[key];
      if (prev && prev.left === b.left && prev.top === b.top && prev.tail === b.tail && prev.below === b.below) {
        continue;
      }
      // A change of side is a jump; ease that one. Following the map is not.
      const jumped = !!prev && (prev.side !== b.side || prev.below !== b.below);
      if (jumped) {
        el.classList.add('is-jumping');
        window.setTimeout(() => el.classList.remove('is-jumping'), 220);
      }
      el.style.transform = `translate(${b.left}px, ${b.top}px)`;
      el.style.setProperty('--tail-x', `${b.tail}px`);
      el.classList.toggle('is-below', b.below);
      el.classList.toggle('is-adrift', b.adrift);
      el.style.visibility = 'visible';
      last.current[key] = b;
    }
  }, [map, pinRef]);

  // Follow the camera. `render` also covers what moves without it: the
  // buildings rising, and the route line redrawn under a gliding pin.
  useEffect(() => {
    map.on('move', place);
    map.on('render', place);
    kickRef.current = place;
    return () => {
      kickRef.current = null;
      if (alive(map)) {
        map.off('move', place);
        map.off('render', place);
      }
    };
  }, [map, place, kickRef]);

  // Any render can move an anchor or change what a card clears.
  useLayoutEffect(place);

  const headroomCb = useRef(onHereHeadroom);
  headroomCb.current = onHereHeadroom;
  const reportHeadroom = useCallback(() => {
    const layer = layerRef.current;
    const s = live.current;
    const h = sizes.current.here.h;
    if (!layer || !s.here || !h) {
      headroomCb.current?.(0);
      return;
    }
    // The pin rests at the middle of the padded map; pad just enough that the
    // card and a typical roof clear the top edge from there.
    const reach = h + s.here.anchor.gap + CALLOUT_GAP + ROOF_ALLOWANCE_PX + s.inset.top;
    const need = 2 * reach - layer.clientHeight + s.inset.bottom;
    headroomCb.current?.(Math.max(0, Math.ceil(need / 8) * 8));
  }, []);
  const hasHere = !!here;
  const hasTarget = !!target;
  useLayoutEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const key = (e.target as HTMLElement).dataset.callout as Key | undefined;
        const el = e.target as HTMLElement;
        if (key) sizes.current[key] = { w: el.offsetWidth, h: el.offsetHeight };
      }
      reportHeadroom();
      place();
    });
    for (const key of ['here', 'target'] as const) {
      const el = els.current[key];
      if (!el) continue;
      sizes.current[key] = { w: el.offsetWidth, h: el.offsetHeight };
      ro.observe(el);
    }
    if (layerRef.current) ro.observe(layerRef.current);
    reportHeadroom();
    place();
    return () => ro.disconnect();
  }, [hasHere, hasTarget, place, reportHeadroom]);
  useEffect(() => () => headroomCb.current?.(0), []);

  const slot = (key: Key, s: CalloutSlot | null) =>
    s && (
      <div
        key={key}
        ref={(el) => {
          els.current[key] = el;
          if (!el) last.current[key] = null;
        }}
        data-callout={key}
        className={`map-callout map-callout--${key}`}
        style={{ visibility: 'hidden' }}
      >
        {s.body}
        <span className="map-callout__tail" aria-hidden />
      </div>
    );

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-[600] overflow-hidden">
      {slot('here', here)}
      {slot('target', target)}
    </div>
  );
}
