import { useEffect } from 'react';
import { useGame } from '../game/store';
import { poiCategoryLabel, useT } from '../i18n';
import { guide } from './guide';
import { buildRevealTour } from './revealTour';

/**
 * Plays the camera tour whenever a noticeboard or locality map names places.
 * `prepare` puts the screen in a state where the map is visible (the phone
 * switches to its Map tab). The cue is cleared however the tour ends.
 */
export function useRevealTour(prepare: () => void) {
  const cue = useGame((s) => s.revealTour);
  const { t, locale } = useT();

  useEffect(() => {
    if (!cue) return;
    const s = useGame.getState();
    const done = () => useGame.getState().dismissRevealTour(cue.id);
    if (s.combat || s.pendingEvent || s.travelAnim) {
      done();
      return;
    }
    const source = s.locations[cue.sourceId];
    const board = source && (source.category === 'residential' || source.category === 'community');
    const sequence = buildRevealTour(cue, s.locations, s.currentPos, {
      title: t(board ? 'ui.tour.noticeboard' : 'ui.tour.locality'),
      overviewTitle: (count) => t('ui.tour.overviewTitle', { count }),
      overviewBody: t('ui.tour.overviewBody'),
      newPlace: t('ui.tour.newPlace'),
      category: (loc) => poiCategoryLabel(loc.category, locale),
      distance: (distance) => t('ui.tour.distance', { distance }),
    });
    if (!sequence) {
      done();
      return;
    }
    prepare();
    guide.play({ ...sequence, onEnd: done });
    // One tour per cue; strings are read once when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.id]);
}

/**
 * The game can interrupt any guide: a fight, an event or a new glide takes the
 * camera back, and leaving the run screen stops it outright.
 */
export function useGuideInterrupts() {
  const busy = useGame((s) => !!(s.combat || s.pendingEvent || s.travelAnim) || s.phase !== 'game');
  useEffect(() => {
    if (busy && guide.active) guide.cancel({ clearQueue: true });
  }, [busy]);
  useEffect(() => () => guide.cancel({ clearQueue: true }), []);
}
