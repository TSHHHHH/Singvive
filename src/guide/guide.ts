import { useSyncExternalStore } from 'react';
import { GuideRunner, type GuideState } from './runner';

/** The one guide for the page. Game UI plays sequences on it; the map adapter drives its camera. */
export const guide = new GuideRunner();

/** The running step, or null. Re-renders only on step / phase changes. */
export function useGuideState(): GuideState | null {
  return useSyncExternalStore(guide.subscribe, guide.getSnapshot, guide.getSnapshot);
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __guide?: GuideRunner }).__guide = guide;
}
