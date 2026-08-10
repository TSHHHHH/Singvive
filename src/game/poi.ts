import type { PoiCategory } from './types';
import type { IconName } from '../icons/keys';

export interface PoiCategoryConfig {
  label: string;
  /** base loot richness (number of loot rolls) */
  richness: number;
  /** base danger 1..5 before per-POI variance */
  baseDanger: number;
  /** marker colour */
  color: string;

  /** semantic icon key — see src/icons/keys.ts */
  icon: IconName;
  blurb: string;
}

export const POI_CONFIG: Record<PoiCategory, PoiCategoryConfig> = {
  supermarket: { label: 'Supermarket', richness: 5, baseDanger: 2, color: '#e8e5dd', icon: 'poi.supermarket', blurb: 'Food & water in bulk.' },
  convenience: { label: 'Convenience Store', richness: 3, baseDanger: 1, color: '#cfccc4', icon: 'poi.convenience', blurb: 'Snacks & drinks.' },
  pharmacy: { label: 'Pharmacy', richness: 3, baseDanger: 2, color: '#b7b3a9', icon: 'poi.pharmacy', blurb: 'Medicine & bandages.' },
  hospital: { label: 'Hospital / Clinic', richness: 4, baseDanger: 4, color: '#9c9890', icon: 'poi.hospital', blurb: 'Serious medical supplies. Crawling with the dead.' },
  hardware: { label: 'Hardware Store', richness: 4, baseDanger: 2, color: '#cfccc4', icon: 'poi.hardware', blurb: 'Tools, melee weapons, crafting parts.' },
  fuel: { label: 'Petrol Station', richness: 3, baseDanger: 3, color: '#b7b3a9', icon: 'poi.fuel', blurb: 'Fuel & roadside snacks.' },
  police: { label: 'Police Station', richness: 3, baseDanger: 5, color: '#9c9890', icon: 'poi.police', blurb: 'Firearms & ammo. Extremely dangerous.' },
  residential: { label: 'HDB Void Deck', richness: 2, baseDanger: 2, color: '#8a867e', icon: 'poi.residential', blurb: 'Void deck & flats — common household loot. The 88 Syndicate works these estates.' },
  foodcourt: { label: 'Hawker Centre', richness: 3, baseDanger: 2, color: '#cfccc4', icon: 'poi.foodcourt', blurb: 'Food stalls.' },
  mrt: { label: 'MRT Station', richness: 2, baseDanger: 3, color: '#2bc4d9', icon: 'poi.mrt', blurb: 'Transit hub. Fast-travel node held by the Subterranean Transit Authority.' },
  waypoint: { label: 'Waypoint', richness: 1, baseDanger: 2, color: '#6b7075', icon: 'poi.waypoint', blurb: 'Not a destination — a place to stop between them. Whatever the road left behind.' },
};

/**
 * Classify a raw OSM element (its tags) into one of our POI categories,
 * or null if it isn't a location we care about.
 */
export function classifyOsm(tags: Record<string, string>): PoiCategory | null {
  const shop = tags.shop;
  const amenity = tags.amenity;
  const building = tags.building;

  if (shop === 'supermarket') return 'supermarket';
  if (shop === 'convenience' || shop === 'kiosk') return 'convenience';
  if (shop === 'chemist' || amenity === 'pharmacy') return 'pharmacy';
  if (amenity === 'hospital' || amenity === 'clinic' || amenity === 'doctors') return 'hospital';
  if (shop === 'hardware' || shop === 'doityourself' || shop === 'trade') return 'hardware';
  if (amenity === 'fuel') return 'fuel';
  if (amenity === 'police') return 'police';
  if (amenity === 'food_court' || amenity === 'marketplace' || amenity === 'hawker_centre')
    return 'foodcourt';
  if (tags.station === 'subway' || tags.station === 'light_rail' || tags.railway === 'station')
    return 'mrt';
  if (
    building === 'residential' ||
    building === 'apartments' ||
    building === 'house' ||
    amenity === 'community_centre'
  )
    return 'residential';
  return null;
}

export const POI_CATEGORIES = Object.keys(POI_CONFIG) as PoiCategory[];
