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
export const DAMAGE_SHARE = 0.72;
/** Severity from which a tall enough building has collapsed to a stump. */
export const COLLAPSE_FROM = 0.35;
export const COLLAPSE_MIN_H = 10;

export type CityDamageLevel = 'intact' | 'scorched' | 'collapsed';

export interface CityDamage {
  level: CityDamageLevel;
  /** 0 intact … 1 worst. */
  severity: number;
  /** How much of the building still stands (height × this). */
  stands: number;
}

const INTACT: CityDamage = { level: 'intact', severity: 0, stands: 1 };

export function cityDamage(key: string, h: number): CityDamage {
  const roll = hash01(key, 1);
  if (roll >= DAMAGE_SHARE) return INTACT;
  const severity = 1 - roll / DAMAGE_SHARE;
  if (severity >= COLLAPSE_FROM && h >= COLLAPSE_MIN_H) {
    const t = Math.min(1, (severity - COLLAPSE_FROM) / (1 - COLLAPSE_FROM));
    return { level: 'collapsed', severity, stands: 0.6 - 0.3 * t };
  }
  return { level: 'scorched', severity, stands: 1 };
}
