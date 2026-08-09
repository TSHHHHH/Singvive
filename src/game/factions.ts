import type { FactionId, PoiCategory } from './types';
import type { Rng } from './rng';

export interface FactionConfig {
  name: string;
  glyph: string;
  color: string;
  /** Hostile factions fight when negotiations fail; others just block access. */
  hostile: boolean;
  blurb: string;
  /** What they demand at a shakedown/toll (item def id), if any. */
  tribute: string;
}

export const FACTION_CONFIG: Record<Exclude<FactionId, null>, FactionConfig> = {
  saf: {
    name: 'SAF Remnants',
    glyph: '🎖️',
    color: '#4b5d3a',
    hostile: false,
    blurb: 'Military holdouts guarding armouries and clinics. Orderly, but they tax entry.',
    tribute: 'ammo_box',
  },
  hawker: {
    name: 'Hawker Guild',
    glyph: '🍜',
    color: '#c9711f',
    hostile: false,
    blurb: 'They run the food. Pay in supplies and they let you dig in.',
    tribute: 'canned_food',
  },
  raiders: {
    name: 'Void Deck Raiders',
    glyph: '🗡️',
    color: '#8b1e1e',
    hostile: true,
    blurb: 'Territorial gangs holed up in the HDB estates. They take what they want.',
    tribute: 'jewellery',
  },
  transit: {
    name: 'Transit Coalition',
    glyph: '🚉',
    color: '#00b0d8',
    hostile: false,
    blurb: 'They keep the tunnels running — for a toll.',
    tribute: 'canned_food',
  },
};

/**
 * Seeded faction assignment by OSM category.
 * MRT → Transit; Hawker centres → Hawker Guild; Police/Hospital → SAF;
 * HDB → Void Deck Raiders (~40%); everything else is unclaimed.
 */
export function assignFaction(rng: Rng, category: PoiCategory): FactionId {
  const r = rng.next();
  switch (category) {
    case 'mrt':
      return 'transit';
    case 'foodcourt':
      return r < 0.7 ? 'hawker' : null;
    case 'police':
    case 'hospital':
      return r < 0.8 ? 'saf' : null;
    case 'residential':
      return r < 0.4 ? 'raiders' : null;
    default:
      return null;
  }
}
