import type {
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
import type { EventClock } from './store';
import type { FactionStanding } from './events';
import { migrateFactionId } from './factions';
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
  usedFallback: boolean;
  exploredArea: ExploredCircle[];
  hordeLevel: number;
  evacZoneId: string | null;
  evacDeadline: number | null;
  /** Explored HDB blocks, so a cleared unit stays cleared between visits. */
  hdbBlocks?: Record<string, HdbDungeon>;
  /** Doorway-event rate limiter, so reloading can't farm encounters. */
  eventClock?: EventClock;
  /** How each faction feels about you. Absent on saves from before standing. */
  factionStanding?: FactionStanding;
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
    // Migration: factions were renamed to their Singaporean institutional ids
    for (const loc of Object.values(parsed.locations ?? {})) {
      loc.factionId = migrateFactionId(loc.factionId);
    }
    // Migration: run counters and the persisted timeline are newer than v6 saves.
    // A resumed old run starts its stats from zero rather than back-filling
    // guesses — `kills` is the only number that survived, so seed with it.
    parsed.stats = normalizeRunStats(
      parsed.stats ?? { zombieKills: parsed.kills ?? 0 },
    );
    if (!parsed.log) parsed.log = [];
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
