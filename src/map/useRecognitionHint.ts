import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { useMapEvent } from './hooks';

const NONE: ReadonlySet<string> = new Set();

/**
 * Unknown sites that walking to the point under the mouse would identify on
 * arrival (store `peekRecognition`, the same rule arrival uses). Their blips
 * grow into "?" badges as a hint. Pointer-only: touch never hovers.
 *
 * At most one check per animation frame, and React only hears about it when
 * the set itself changes, so moving across empty ground costs no re-render.
 */
export function useRecognitionHint(): ReadonlySet<string> {
  const [hint, setHint] = useState<ReadonlySet<string>>(NONE);
  const key = useRef('');
  const pending = useRef<{ lat: number; lng: number } | null>(null);
  const frame = useRef<number | null>(null);

  const publish = (ids: string[]) => {
    const next = ids.sort().join('|');
    if (next === key.current) return;
    key.current = next;
    setHint(ids.length ? new Set(ids) : NONE);
  };

  useMapEvent('mousemove', (e) => {
    pending.current = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const pos = pending.current;
      if (!pos) return;
      const g = useGame.getState();
      publish(g.travelAnim ? [] : g.peekRecognition(pos));
    });
  });
  useMapEvent('mouseout', () => {
    pending.current = null;
    publish([]);
  });
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return hint;
}
