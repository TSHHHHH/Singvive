import type { Enemy } from './types';
import type { Rng } from './rng';

/**
 * When a run ends, the corpse stays on the island. A later survivor who walks
 * onto those coordinates meets whatever became of them.
 */

const LEGACY_KEY = 'singvive.legacy_run';

/** How close you have to get for the ghost to matter (metres). */
export const GHOST_RADIUS = 120;

export interface LegacyRun {
  name: string;
  seed: string;
  day: number;
  lat: number;
  lng: number;
  kills: number;
  score: number;
  cause: string;
  maxHp: number;
  /** What they were holding when they went down. */
  weaponDefId: string | null;
  armorDefId: string | null;
  date: number;
}

export function saveLegacyRun(run: LegacyRun): void {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(run));
  } catch {
    /* storage unavailable — the dead simply stay dead */
  }
}

export function loadLegacyRun(): LegacyRun | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? (JSON.parse(raw) as LegacyRun) : null;
  } catch {
    return null;
  }
}

export function clearLegacyRun(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export type GhostEncounterKind = 'mini_boss' | 'corpse' | 'trader';

/** 0.00–0.70 turned; 0.71–0.90 just a body; 0.91–1.00 they made it. */
export function rollGhostEncounter(rng: Rng): GhostEncounterKind {
  const r = rng.next();
  if (r <= 0.7) return 'mini_boss';
  if (r <= 0.9) return 'corpse';
  return 'trader';
}

/**
 * The previous survivor, turned — scaled by how far they got and still carrying
 * the gear that failed them.
 */
export function ghostBoss(rng: Rng, legacy: LegacyRun): Enemy {
  const grit = Math.min(12, legacy.day);
  const hp = Math.round(legacy.maxHp * 1.3 + grit * 6 + rng.int(0, 10));
  return {
    name: `${legacy.name}, turned`,
    kind: 'zombie',
    hp,
    maxHp: hp,
    attack: 2 + Math.floor(grit / 3) + (legacy.weaponDefId ? 1 : 0),
    defense: 2 + Math.floor(grit / 4),
    damage: 10 + Math.floor(grit * 1.5) + rng.int(0, 4),
    infectious: 0.45,
    armor: legacy.armorDefId ? 4 : 1,
    // Still moving the way they did in life, and they got as far as they got.
    speed: 8 + Math.floor(grit / 4),
  };
}

/** Gear left on the body — whatever they died holding. */
export function ghostDrops(legacy: LegacyRun): string[] {
  return [legacy.weaponDefId, legacy.armorDefId].filter((v): v is string => !!v);
}

/** The one good trade a surviving predecessor will offer. */
export interface GhostTrade {
  wantDefId: string;
  giveDefId: string;
}

const TRADE_TABLE: GhostTrade[] = [
  { wantDefId: 'canned_food', giveDefId: 'medkit' },
  { wantDefId: 'water_bottle', giveDefId: 'painkillers' },
  { wantDefId: 'jewellery', giveDefId: 'kevlar_vest' },
  { wantDefId: 'batteries', giveDefId: 'ammo_box' },
];

export function rollGhostTrade(rng: Rng): GhostTrade {
  return rng.pick(TRADE_TABLE);
}
