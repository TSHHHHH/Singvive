import type { PoiCategory } from './types';

export interface PoiCategoryConfig {
  label: string;
  /** base loot richness (number of loot rolls) */
  richness: number;
  /** base danger 1..5 before per-POI variance */
  baseDanger: number;
  /** marker colour */
  color: string;
  /** short emoji-ish glyph for the map pin */
  glyph: string;
  blurb: string;
}

export const POI_CONFIG: Record<PoiCategory, PoiCategoryConfig> = {
  supermarket: { label: 'Supermarket', richness: 5, baseDanger: 2, color: '#4caf50', glyph: '🛒', blurb: 'Food & water in bulk.' },
  convenience: { label: 'Convenience Store', richness: 3, baseDanger: 1, color: '#8bc34a', glyph: '🏪', blurb: 'Snacks & drinks.' },
  pharmacy: { label: 'Pharmacy', richness: 3, baseDanger: 2, color: '#e91e63', glyph: '💊', blurb: 'Medicine & bandages.' },
  hospital: { label: 'Hospital / Clinic', richness: 4, baseDanger: 4, color: '#f44336', glyph: '🏥', blurb: 'Serious medical supplies. Crawling with the dead.' },
  hardware: { label: 'Hardware Store', richness: 4, baseDanger: 2, color: '#ff9800', glyph: '🔧', blurb: 'Tools, melee weapons, crafting parts.' },
  fuel: { label: 'Petrol Station', richness: 3, baseDanger: 3, color: '#ffc107', glyph: '⛽', blurb: 'Fuel & roadside snacks.' },
  police: { label: 'Police Station', richness: 3, baseDanger: 5, color: '#2196f3', glyph: '🚓', blurb: 'Firearms & ammo. Extremely dangerous.' },
  residential: { label: 'HDB Void Deck', richness: 2, baseDanger: 2, color: '#9e9e9e', glyph: '🏢', blurb: 'Void deck & flats — common household loot. Void Deck Raiders lurk here.' },
  foodcourt: { label: 'Hawker Centre', richness: 3, baseDanger: 2, color: '#ff7043', glyph: '🍜', blurb: 'Food stalls.' },
  mrt: { label: 'MRT Station', richness: 2, baseDanger: 3, color: '#00b0d8', glyph: '🚉', blurb: 'Transit hub. Fast-travel node held by the Transit Coalition.' },
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
