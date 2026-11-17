import type { LocationState } from '../game/types';
import type { RevealTourCue } from '../game/exploration';
import { POI_CONFIG } from '../game/poi';
import { LOCATION_ACCENTS } from '../components/locationPresentation';
import type { GuidePoint, GuideSequence, GuideStep } from './types';

/** The overview never dives closer than this, even for two close places. */
export const OVERVIEW_MAX_ZOOM = 16.5;
const OVERVIEW_MS = 1200;
/** Reading time: a base plus a little per name on the board. */
const HOLD_BASE_MS = 2500;
const HOLD_PER_PLACE_MS = 250;

export interface RevealTourText {
  title: string;
  overviewTitle: (count: number) => string;
  overviewBody: string;
}

/**
 * The tour after a noticeboard or locality map: frame everything it named
 * and pop a card over every place at once, then hand the camera back.
 * Pure: a cue, the world and some strings in, a sequence out.
 */
export function buildRevealTour(
  cue: RevealTourCue,
  locations: Record<string, LocationState>,
  player: GuidePoint,
  text: RevealTourText,
): GuideSequence | null {
  const sites = cue.ids.map((id) => locations[id]).filter((loc): loc is LocationState => !!loc);
  if (!sites.length) return null;
  const points = sites.map((s) => ({ lat: s.lat, lng: s.lng }));
  // One shot over everything; every place's card pops at the same moment.
  const steps: GuideStep[] = [
    {
      id: 'reveal',
      shot: { fit: [player, ...points], maxZoom: OVERVIEW_MAX_ZOOM, durationMs: OVERVIEW_MS },
      callout: { variant: 'note', icon: 'action.logbook', title: text.overviewTitle(sites.length), body: text.overviewBody },
      pins: sites.map((loc) => ({
        at: { lat: loc.lat, lng: loc.lng },
        ring: true,
        callout: {
          variant: 'reveal',
          compact: true,
          icon: POI_CONFIG[loc.category].icon,
          accent: LOCATION_ACCENTS[loc.category],
          title: loc.name,
        },
      })),
      advance: { kind: 'timer', ms: HOLD_BASE_MS + HOLD_PER_PLACE_MS * sites.length },
    },
  ];
  return { id: `reveal:${cue.id}`, title: text.title, steps, lock: 'all', restoreCamera: true, skippable: true };
}
