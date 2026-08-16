import type {
  BodyPart,
  BodyParts,
  Character,
  Equipment,
  GameLogEntry,
  HighScore,
  ItemInstance,
  LocationState,
  Meters,
  RunStats,
} from './types';
import type { ExploredCircle } from './fog';
import type { HdbDungeon } from './hdbDungeon';
import { migrateHdbDungeon } from './hdbDungeon';
import type { TunnelRun } from './tunnelRun';
import type { EventClock } from './store';
import type { FactionStanding } from './events';
import {
  applyFactionServices,
  migrateFactionId,
  migrateOutposts,
  pickOutposts,
  type OutpostIds,
} from './factions';
import { coerceEquipment } from './inventory';
import { migrateBodyParts, migrateMeters } from './survival';
import { normalizeRunStats } from './stats';

const RUN_KEY = 'singvive.run.v6'; // v6: extraction goal + horde clock
const SCORES_KEY = 'singvive.scores.v1';

export interface SavedRun {
  character: Character;
  seed: string;
  spawn: { lat: number; lng: number; name: string };
  locations: Record<string, LocationState>;
  currentPositionId: string | null;
  currentPos: { lat: number; lng: number };
  equipment: Equipment;
  bodyParts: BodyParts;
  meters: Meters;
  maxHp: number;
  day: number;
  hour: number;
  items: ItemInstance[];
  kills: number;
  /** Loaded rounds. Absent on saves from before firearms needed feeding. */
  rounds?: number;
  /** Tears left in your own clothes. Absent on saves from before cloth mattered. */
  clothingTears?: number;
  usedFallback: boolean;
  exploredArea: ExploredCircle[];
  /**
   * Grid cells already materialised from the island bake via on-demand expand.
   * Absent on older saves — resume treats them as empty and re-expands safely
   * (merge skips existing location ids).
   */
  expandedCells?: string[];
  hordeLevel: number;
  evacZoneId: string | null;
  evacDeadline: number | null;
  /** Set only while the channel is dark between windows. Absent on old saves. */
  evacCooldownUntil?: number | null;
  /**
   * Seeded weighted readiness this bird wants. Absent on older saves — resume
   * rolls once from the current day so the quota stays opaque.
   */
  evacDemand?: number | null;
  /** Soft cargo bias for the current window. Absent on older saves. */
  evacDemandBias?: 'fuel' | 'meds' | 'ammo' | 'balanced' | null;
  /** Explored HDB blocks, so a cleared unit stays cleared between visits. */
  hdbBlocks?: Record<string, HdbDungeon>;
  /**
   * The tunnel segment being walked right now, node graph and all. Saved live
   * rather than cached per segment: the player's position doesn't move until
   * they surface, so dropping this on reload would refund the rest of the walk.
   */
  tunnel?: TunnelRun | null;
  /** Run counter behind every tunnel rng key. @see TunnelRun.seq */
  tunnelSeq?: number;
  /**
   * Undirected edge keys destroyed this run. Absent on older saves — resume
   * re-rolls from seed with the same fork so the corridor stays stable.
   */
  destroyedTunnelEdges?: string[];
  /** Doorway-event rate limiter, so reloading can't farm encounters. */
  eventClock?: EventClock;
  /** How each faction feels about you. Absent on saves from before standing. */
  factionStanding?: FactionStanding;
  /** Which sites are each faction's outposts (array; legacy saves may store one id). */
  outposts?: OutpostIds | Partial<Record<string, string | string[]>>;
  /** Swaps already taken today, keyed `factionId:day`. */
  traderTaken?: Record<string, string[]>;
  /** Display-only run counters. Absent on saves written before they existed. */
  stats?: RunStats;
  /**
   * The whole timeline, every day of it. The Timeline column only renders the
   * current day; Day Logs reads the rest out of here, so it has to survive a
   * reload or the archive is empty for anyone who resumes a run.
   */
  log?: GameLogEntry[];
}

export function saveRun(run: SavedRun): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

export function loadRun(): SavedRun | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedRun;
    // Migration: old saves may not have exploredArea
    if (!parsed.exploredArea) parsed.exploredArea = [];
    // Migration: old saves used single traitId instead of traitIds array
    const char = parsed.character as Character & { traitId?: string };
    if (!char.traitIds && char.traitId) {
      char.traitIds = [char.traitId];
      delete char.traitId;
    } else if (!char.traitIds) {
      char.traitIds = [];
    }
    // Migration: bleeding went from a boolean to a severity. An old save's
    // `true` was a bleed that never clotted and blocked all healing, so it maps
    // to `major` — resuming a run should not silently downgrade a wound.
    for (const part of Object.values(parsed.bodyParts ?? {})) {
      const legacy = part as BodyPart & { bleeding?: boolean };
      if (legacy.bleed === undefined) {
        legacy.bleed = legacy.bleeding ? 'major' : 'none';
        legacy.bleedHours = 0;
        delete legacy.bleeding;
      }
    }
    // Migration: factions were renamed to their Singaporean institutional ids
    for (const loc of Object.values(parsed.locations ?? {})) {
      loc.factionId = migrateFactionId(loc.factionId);
    }
    // Migration: outposts went from one id per faction to an array (up to 4).
    parsed.outposts = migrateOutposts(parsed.outposts);
    if (!Object.keys(parsed.outposts).length && parsed.locations) {
      parsed.outposts = pickOutposts(Object.values(parsed.locations));
    }
    // Stamp services / outpost flags on claimed sites that predate the hub model.
    if (parsed.locations && parsed.seed) {
      parsed.locations = applyFactionServices(
        parsed.locations,
        parsed.outposts ?? {},
        parsed.seed,
      );
    }
    // Migration: run counters and the persisted timeline are newer than v6 saves.
    // A resumed old run starts its stats from zero rather than back-filling
    // guesses — `kills` is the only number that survived, so seed with it.
    parsed.stats = normalizeRunStats(
      parsed.stats ?? { zombieKills: parsed.kills ?? 0 },
    );
    if (!parsed.log) parsed.log = [];
    parsed.meters = migrateMeters(parsed.meters as Meters & { health?: number });
    parsed.bodyParts = migrateBodyParts(parsed.bodyParts, parsed.maxHp ?? 84);
    // Migration: body-zone slots (hands/legs/feet) added after v6; old saves omit them.
    parsed.equipment = coerceEquipment(parsed.equipment);
    // Migration: HDB unit types renamed (residential→flat, …).
    if (parsed.hdbBlocks) {
      const next: Record<string, HdbDungeon> = {};
      for (const [id, block] of Object.entries(parsed.hdbBlocks)) {
        next[id] = migrateHdbDungeon(block);
      }
      parsed.hdbBlocks = next;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function loadHighScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    const list = raw ? (JSON.parse(raw) as HighScore[]) : [];
    return list.sort((a, b) => b.score - a.score).slice(0, 10);
  } catch {
    return [];
  }
}

export function addHighScore(score: HighScore): HighScore[] {
  const list = loadHighScores();
  list.push(score);
  const sorted = list.sort((a, b) => b.score - a.score).slice(0, 10);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(sorted));
  } catch {
    /* ignore */
  }
  return sorted;
}
