import { useEffect } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { showMap, showPlace, togglePlaceView, useShowingMap } from '../ui/placeView';
import { isModalOpen } from './modalStack';
import { useT } from '../i18n';
import { tip } from './tips';

/**
 * Flip between a place's own view (the HDB landing strips, a faction window)
 * and the run map. One control for both places, so it reads the same in each:
 * inline in the place's header, floating over the map while you look around.
 * M toggles it on desktop.
 */
export function PlaceMapToggle({
  placeKey,
  placeLabel,
  placeName,
  placeIcon,
  floating = false,
  hotkey = true,
}: {
  placeKey: string;
  /** Short tab label: "Block", "Site". */
  placeLabel: string;
  /** The place's own name, for the way back. */
  placeName: string;
  placeIcon: IconName;
  /** Over the map: a pill that says where you are looking from. */
  floating?: boolean;
  hotkey?: boolean;
}) {
  const { t } = useT();
  const onMap = useShowingMap(placeKey);

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isModalOpen()) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      e.preventDefault();
      togglePlaceView(placeKey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey, placeKey]);

  const seg = (active: boolean) =>
    `inline-flex h-10 items-center gap-1.5 px-3 text-read transition-colors ${
      active ? 'bg-white/10 text-concrete-50' : 'text-concrete-400 hover:bg-white/5 hover:text-concrete-50'
    }`;

  return (
    <div
      role="group"
      aria-label={floating ? t('ui.place.lookingFrom', { name: placeName }) : undefined}
      data-place-toggle={onMap ? 'map' : 'place'}
      className={`inline-flex shrink-0 items-stretch overflow-hidden rounded border border-concrete-600 ${
        floating ? 'bg-concrete-950/95 shadow-[0_8px_32px_rgba(0,0,0,0.6)]' : ''
      }`}
    >
      <button
        type="button"
        aria-pressed={!onMap}
        onClick={showPlace}
        className={seg(!onMap)}
        {...tip(onMap ? t('ui.place.backHint', { name: placeName }) : null)}
      >
        <Icon name={placeIcon} />
        <span className={floating ? 'max-w-[12rem] truncate' : ''}>{floating ? placeName : placeLabel}</span>
      </button>
      <button
        type="button"
        aria-pressed={onMap}
        onClick={() => showMap(placeKey)}
        className={`${seg(onMap)} border-l border-concrete-600`}
        {...tip(onMap ? null : t('ui.place.mapHint'))}
      >
        <Icon name="action.map" />
        <span>{t('ui.place.map')}</span>
      </button>
    </div>
  );
}
