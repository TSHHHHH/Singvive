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
  supermarket: { label: 'Supermarket', richness: 3, baseDanger: 2, color: '#e8e5dd', icon: 'poi.supermarket', blurb: 'Food & water in bulk.' },
  convenience: { label: 'Convenience Store', richness: 2, baseDanger: 1, color: '#cfccc4', icon: 'poi.convenience', blurb: 'Snacks & drinks.' },
  pharmacy: { label: 'Pharmacy', richness: 2, baseDanger: 2, color: '#b7b3a9', icon: 'poi.pharmacy', blurb: 'Medicine & bandages.' },
  hospital: { label: 'Hospital', richness: 3, baseDanger: 4, color: '#9c9890', icon: 'poi.hospital', blurb: 'Serious medical supplies. Crawling with the dead.' },
  clinic: { label: 'Clinic', richness: 2, baseDanger: 2, color: '#a8a49a', icon: 'poi.hospital', blurb: 'GP / polyclinic shelves. Useful, not a war zone.' },
  hardware: { label: 'Hardware Store', richness: 3, baseDanger: 2, color: '#cfccc4', icon: 'poi.hardware', blurb: 'Tools, melee weapons, crafting parts.' },
  fuel: { label: 'Petrol Station', richness: 2, baseDanger: 3, color: '#b7b3a9', icon: 'poi.fuel', blurb: 'Fuel & roadside snacks.' },
  police: { label: 'Police Station', richness: 2, baseDanger: 5, color: '#9c9890', icon: 'poi.police', blurb: 'Firearms & ammo. Extremely dangerous.' },
  residential: { label: 'HDB Void Deck', richness: 2, baseDanger: 2, color: '#8a867e', icon: 'poi.residential', blurb: 'Void deck & flats — common household loot. The 88 Syndicate works these estates.' },
  foodcourt: { label: 'Hawker Centre', richness: 1, baseDanger: 2, color: '#cfccc4', icon: 'poi.foodcourt', blurb: 'Food stalls.' },
  mrt: { label: 'MRT Station', richness: 1, baseDanger: 3, color: '#2bc4d9', icon: 'poi.mrt', blurb: 'Nothing runs. The platform is a way into the tunnels, and the STA works the turnstiles.' },
  industrial: { label: 'Industrial Unit', richness: 3, baseDanger: 3, color: '#a8863f', icon: 'poi.industrial', blurb: 'Warehouse floor & loading bay. Tools, fuel and materials — and a lot of dark corners.' },
  school: { label: 'School', richness: 2, baseDanger: 3, color: '#7fa8b2', icon: 'poi.school', blurb: 'Canteen, sick bay, workshop. They were used as shelters, which is exactly the problem.' },
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
  // Real hospitals are rare and deadly; GP / polyclinic tags must not inherit that.
  if (amenity === 'hospital') return 'hospital';
  if (amenity === 'clinic' || amenity === 'doctors') return 'clinic';
  if (shop === 'hardware' || shop === 'doityourself' || shop === 'trade') return 'hardware';
  if (amenity === 'fuel') return 'fuel';
  if (amenity === 'police') return 'police';
  if (amenity === 'food_court' || amenity === 'marketplace' || amenity === 'hawker_centre')
    return 'foodcourt';
  if (tags.station === 'subway' || tags.station === 'light_rail' || tags.railway === 'station')
    return 'mrt';
  if (amenity === 'school' || amenity === 'college' || amenity === 'university') return 'school';
  // Checked before the residential fallback: an industrial estate is tagged by
  // building *and* landuse, and the building tag is the more specific truth.
  if (building === 'industrial' || building === 'warehouse' || building === 'factory')
    return 'industrial';
  if (tags.landuse === 'industrial' || tags.man_made === 'works') return 'industrial';
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
