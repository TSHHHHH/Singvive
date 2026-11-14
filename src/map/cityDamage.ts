/**
 * How badly each ordinary building on the run map has been hit.
 *
 * One stable hash of the building's id gives it a destruction severity, and
 * everything the map draws for it follows from that one number: soot, a
 * collapse, or (for the very worst) a fire. Fire is the top of the damage
 * scale, not a separate roll, so only heavily destroyed buildings burn and a
 * fire's size grows with how far gone the building is.
 *
 * Visited sites carry the game's own ruin tier instead (buildings.ts) and
 * never enter this model.
 */

/** Stable 0..1 hash of an id, so a building looks the same every visit. */
export function hash01(id: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Share of ordinary buildings with any damage at all. */
export const DAMAGE_SHARE = 0.1;
/** Severity from which a tall enough building has collapsed to a stump. */
export const COLLAPSE_FROM = 0.7;
/** Severity from which a building is still burning (the worst ~0.6%). */
export const BURN_FROM = 0.94;
/** Shorter than this a building has nothing to collapse / no roof worth a fire. */
export const COLLAPSE_MIN_H = 10;
export const FIRE_MIN_H = 6;

export type CityDamageLevel = 'intact' | 'scorched' | 'collapsed' | 'burning';

export interface CityDamage {
  level: CityDamageLevel;
  /** 0 intact … 1 worst. */
  severity: number;
  /** Fire strength, 0 smouldering … 1 fully ablaze; 0 unless burning. */
  burn: number;
  /** How much of the building still stands (height × this). */
  stands: number;
}

const INTACT: CityDamage = { level: 'intact', severity: 0, burn: 0, stands: 1 };

export function cityDamage(key: string, h: number): CityDamage {
  const roll = hash01(key, 1);
  if (roll >= DAMAGE_SHARE) return INTACT;
  const severity = 1 - roll / DAMAGE_SHARE;
  if (severity >= BURN_FROM && h >= FIRE_MIN_H) {
    const burn = (severity - BURN_FROM) / (1 - BURN_FROM);
    // Burnt out from the top: the fiercer the fire, the less of it is left.
    return { level: 'burning', severity, burn, stands: 0.85 - 0.35 * burn };
  }
  if (severity >= COLLAPSE_FROM && h >= COLLAPSE_MIN_H) {
    const t = Math.min(1, (severity - COLLAPSE_FROM) / (BURN_FROM - COLLAPSE_FROM));
    return { level: 'collapsed', severity, burn: 0, stands: 0.6 - 0.3 * t };
  }
  return { level: 'scorched', severity, burn: 0, stands: 1 };
}
