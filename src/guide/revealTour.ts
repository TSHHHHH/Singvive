import type { LocationState } from '../game/types';
import type { RevealTourCue } from '../game/exploration';
import { haversine } from '../game/overpass';
import { POI_CONFIG } from '../game/poi';
import { LOCATION_ACCENTS } from '../components/locationPresentation';
import type { GuidePoint, GuideSequence, GuideStep } from './types';

/** Street level over each place: the building and its marker read clearly. */
export const REVEAL_ZOOM = 16.2;
/** The opening overview never dives closer than this. */
const OVERVIEW_MAX_ZOOM = 15.5;
const OVERVIEW_MS = 1200;
const OVERVIEW_HOLD_MS = 1800;
const HOP_MS = 1000;
const HOLD_MS = 1600;

export interface RevealTourText {
  title: string;
  overviewTitle: (count: number) => string;
  overviewBody: string;
  newPlace: string;
  category: (loc: LocationState) => string;
  distance: (metres: number) => string;
}

/**
 * The tour after a noticeboard or locality map: frame everything it named,
 * then visit each place in order with an emphasised call-out, then hand the
 * camera back. Pure: a cue, the world and some strings in, a sequence out.
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
  const steps: GuideStep[] = [
    {
      id: 'overview',
      shot: { fit: [player, ...points], maxZoom: OVERVIEW_MAX_ZOOM, durationMs: OVERVIEW_MS },
      callout: { variant: 'note', icon: 'action.logbook', title: text.overviewTitle(sites.length), body: text.overviewBody },
      advance: { kind: 'timer', ms: OVERVIEW_HOLD_MS },
    },
  ];
  for (const loc of sites) {
    const at = { lat: loc.lat, lng: loc.lng };
    steps.push({
      id: `place:${loc.id}`,
      shot: { center: at, zoom: REVEAL_ZOOM, durationMs: HOP_MS },
      highlight: at,
      callout: {
        variant: 'reveal',
        anchor: at,
        icon: POI_CONFIG[loc.category].icon,
        accent: LOCATION_ACCENTS[loc.category],
        eyebrow: text.newPlace,
        title: loc.name,
        meta: `${text.category(loc)} · ${text.distance(roundDistance(haversine(player.lat, player.lng, loc.lat, loc.lng)))}`,
      },
      advance: { kind: 'timer', ms: HOLD_MS },
    });
  }
  return { id: `reveal:${cue.id}`, title: text.title, steps, lock: 'all', restoreCamera: true, skippable: true };
}

/** 10 m steps up close, 50 m beyond half a kilometre: a board is not a survey. */
export function roundDistance(m: number): number {
  return m < 500 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50;
}
