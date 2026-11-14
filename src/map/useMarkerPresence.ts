import { useEffect, useState } from 'react';
import { reconcileMarkers } from './markerPresence';

/** Keep only previously drawn badges during their exit, within the same cap. */
export function useMarkerPresence<T extends { id: string }>(items: readonly T[], duration: number, limit: number) {
  const [state, setState] = useState(() => ({
    items, duration, limit,
    entries: reconcileMarkers([], items, performance.now(), duration, limit),
  }));
  // Reconcile before committing children, so an exiting badge keeps its DOM
  // identity and a quick range reversal cancels removal without a duplicate.
  if (state.items !== items || state.duration !== duration || state.limit !== limit) {
    setState({ items, duration, limit, entries: reconcileMarkers(state.entries, items, performance.now(), duration, limit) });
  }

  useEffect(() => {
    const nextExit = Math.min(...state.entries.map((entry) => entry.removeAt ?? Infinity));
    if (!Number.isFinite(nextExit)) return;
    const timer = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        entries: reconcileMarkers(current.entries, current.items, performance.now(), current.duration, current.limit),
      }));
    }, Math.max(0, nextExit - performance.now()));
    return () => window.clearTimeout(timer);
  }, [state]);

  return state.entries;
}
