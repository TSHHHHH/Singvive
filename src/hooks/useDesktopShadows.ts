import { useSyncExternalStore } from 'react';
import { useSetting } from '../game/settings';

const query = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';
const matches = () => window.matchMedia(query).matches;
function subscribe(notify: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}

export function useShadowCapableLayout() {
  return useSyncExternalStore(subscribe, matches, () => false);
}

export function useDesktopShadows() {
  const desktop = useShadowCapableLayout();
  return useSetting('buildingShadows') === 'on' && desktop;
}
