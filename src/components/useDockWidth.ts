import { useCallback, useState } from 'react';
import { useSetting, useSettings } from '../game/settings';
import { dockWidth } from './dockWidth';

export function useDockWidth(viewport: number) {
  const saved = useSetting('survivorRailWidth');
  const setSetting = useSettings((s) => s.setSetting);
  const [draft, setDraft] = useState<number | null>(null);
  const commit = useCallback((width: number | null) => {
    setSetting('survivorRailWidth', width === null ? '' : String(width));
    setDraft(null);
  }, [setSetting]);
  const cancel = useCallback(() => setDraft(null), []);
  return { ...dockWidth(viewport, draft === null ? saved : String(draft)), resize: setDraft, commit, cancel };
}
