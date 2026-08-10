import type {
  BodyParts,
  Character,
  Equipment,
  HighScore,
  ItemInstance,
  LocationState,
  Meters,
} from './types';
import type { ExploredCircle } from './fog';
import { migrateFactionId } from './factions';

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
  usedFallback: boolean;
  exploredArea: ExploredCircle[];
  hordeLevel: number;
  evacZoneId: string | null;
  evacDeadline: number | null;
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
