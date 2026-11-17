import type { HazardZone } from '../game/wilds';
import { bakedPoiName } from '../game/bakedPois';
import type { TVars } from '../i18n/t';

type T = (key: string, vars?: TVars) => string;

/** Names that say nothing about the place ("Industrial Unit"). */
const GENERIC = /^(industrial unit|warehouse|factory|building)$/i;

/** "Quarantined school" for a zone on a real place, else the kind label. */
export function hazardLabel(z: HazardZone, t: T): string {
  if (!z.site) return t(`ui.hazards.${z.kind}.label`);
  return t(`ui.hazardThemes.${z.site.theme}.label`, { place: t(`ui.hazardPlaces.${z.site.category}`) });
}

export function hazardBlurb(z: HazardZone, t: T): string {
  return z.site ? t(`ui.hazardThemes.${z.site.theme}.blurb`) : t(`ui.hazards.${z.kind}.blurb`);
}

/** The real place a zone sits on ("Fuchun Primary School", "Blk 43"), if it has a useful name. */
export function hazardPlaceName(z: HazardZone): string | null {
  if (!z.site) return null;
  const raw = bakedPoiName(z.site.siteId)?.replace(/\s+void deck$/i, '').trim();
  if (!raw || GENERIC.test(raw)) return null;
  return raw;
}
