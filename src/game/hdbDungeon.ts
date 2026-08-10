import type { Attributes, LocationState } from './types';
import type { Rng } from './rng';
import type { IconName } from '../icons/keys';

/**
 * A vertical, push-your-luck dungeon layered over an HDB block. Everything here
 * is pure: the store owns the live instance and applies the deltas.
 */

export type HdbArchetype = 'estate' | 'shelter';

export type HdbUnitType =
  | 'residential'
  | 'corner_unit'
  | 'stairwell'
  | 'shelter_service'
  | 'hazard';

export type HdbUnitState = 'unexplored' | 'scouted' | 'breached' | 'cleared';

export type HdbWing = 'left' | 'core' | 'right';

/** What a shelter's occupied units offer instead of loot. */
export type ShelterService = 'trader' | 'field_doctor' | 'safe_bunk';

export interface HdbScoutInfo {
  /** −1 when the survivor couldn't get a count. */
  threatCount: number;
  hazardType?: string;
  lootQuality: string;
  /** Category hint from a dexterous read of the doorway. */
  containerCategory?: string;
  /** True once Wits has read the room — "no hazard" is itself information. */
  readRoom?: boolean;
}

export interface HdbUnitNode {
  id: string;
  type: HdbUnitType;
  state: HdbUnitState;
  wing: HdbWing;
  label: string;
  /** Set on shelter blocks — the service this unit runs. */
  service?: ShelterService;
  scoutedInfo?: HdbScoutInfo;
}

export interface HdbFloor {
  level: number; // 1 to 12
  layoutType: 'slab' | 'point';
  heatLevel: number;
  units: HdbUnitNode[];
  isSkybridge: boolean;
}

export interface HdbDungeon {
  locationId: string;
  name: string;
  archetype: HdbArchetype;
  baseDanger: number;
  floors: HdbFloor[];
  currentLevel: number;
  /** Rises with every hour spent inside and every loud thing you do. */
  blockHeat: number;
  /** Levels the player has actually stood on. */
  visited: number[];
}

export const MAX_LEVEL = 12;
export const SKYBRIDGE_LEVELS = [4, 8];


/** Minutes each action inside the block costs. */
export const BREACH_MINUTES = 15;
export const STAIR_MINUTES = 6;

const HAZARDS = ['Gas Leak', 'Tripwire', 'Collapsed Slab', 'Live Wiring', 'Padlocked Gate'];
const LOOT_QUALITY = ['stripped', 'picked over', 'promising', 'untouched'];
const CONTAINER_CATEGORIES = ['Medical', 'Food', 'Tool', 'Valuables'];
const SERVICES: ShelterService[] = ['trader', 'field_doctor', 'safe_bunk'];

export const SERVICE_LABEL: Record<ShelterService, string> = {
  trader: 'Barter Corner',
  field_doctor: 'Field Doctor',
  safe_bunk: 'Safe Bunk',
};

export const SERVICE_ICON: Record<ShelterService, IconName> = {
  trader: 'hdb.trader',
  field_doctor: 'hdb.doctor',
  safe_bunk: 'hdb.bunk',
};

/** Build the block's twelve floors, seeded off the location. */
export function generateDungeon(
  rng: Rng,
  loc: LocationState,
  archetype: HdbArchetype,
): HdbDungeon {
  const layoutType: HdbFloor['layoutType'] = rng.chance(0.6) ? 'slab' : 'point';
  const floors: HdbFloor[] = [];

  for (let level = 1; level <= MAX_LEVEL; level++) {
    const fRng = rng.fork(`floor:${level}`);
    floors.push({
      level,
      layoutType,
      heatLevel: 0,
      isSkybridge: SKYBRIDGE_LEVELS.includes(level),
      units: buildUnits(fRng, level, layoutType, archetype),
    });
  }

  return {
    locationId: loc.id,
    name: loc.name,
    archetype,
    baseDanger: Math.max(1, Math.round(loc.currentDanger)),
    floors,
    currentLevel: 1,
    blockHeat: 0,
    visited: [1],
  };
}

function buildUnits(
  rng: Rng,
  level: number,
  layoutType: HdbFloor['layoutType'],
  archetype: HdbArchetype,
): HdbUnitNode[] {
  // A slab block runs a long corridor with wings either side of the lobby; a
  // point block wraps a handful of units tightly around the core.
  const perWing = layoutType === 'slab' ? 3 : 2;
  const units: HdbUnitNode[] = [];

  const push = (wing: HdbWing, idx: number, type: HdbUnitType, label: string) => {
    const unit: HdbUnitNode = {
      id: `L${level}-${wing}-${idx}`,
      type,
      state: 'unexplored',
      wing,
      label,
    };
    if (archetype === 'shelter' && type !== 'stairwell' && rng.chance(0.45)) {
      unit.type = 'shelter_service';
      unit.service = rng.pick(SERVICES);
    }
    units.push(unit);
  };

  for (let i = 0; i < perWing; i++) {
    const corner = i === perWing - 1;
    push(
      'left',
      i,
      corner ? 'corner_unit' : rng.chance(0.15) ? 'hazard' : 'residential',
      `#${level}-${101 + i}`,
    );
  }
  push('core', 0, 'stairwell', 'Stairwell Lobby');
  for (let i = 0; i < perWing; i++) {
    const corner = i === perWing - 1;
    push(
      'right',
      i,
      corner ? 'corner_unit' : rng.chance(0.15) ? 'hazard' : 'residential',
      `#${level}-${110 + i}`,
    );
  }
  return units;
}

/**
 * How dangerous the given floor is right now. Heat makes the whole block worse;
 * height buys a little quiet, since the dead pool at ground level.
 */
export function floorThreat(dungeon: HdbDungeon, level: number): number {
  return Math.max(
    0,
    dungeon.baseDanger + Math.floor(dungeon.blockHeat) - Math.floor(level / 3),
  );
}

/**
 * Odds a given sense reads a room from the corridor on the way in. Sharper
 * survivors read more of the block before touching a single door.
 */
export function senseChance(attrValue: number): number {
  return Math.max(0.05, Math.min(0.95, 0.15 + (attrValue - 3) * 0.11));
}

export interface FloorScout {
  dungeon: HdbDungeon;
  /** Units this sweep managed to read something about. */
  read: number;
  /** Units on the floor worth reading at all. */
  total: number;
}

/**
 * The sweep you make stepping onto a floor: every unit's type is noted, and
 * each sense rolls separately per room for the detail it would catch. Sharper
 * survivors simply see more of the corridor — there's nothing to click.
 */
export function scoutFloor(
  rng: Rng,
  attrs: Attributes,
  dungeon: HdbDungeon,
  level: number,
): FloorScout {
  let read = 0;
  let total = 0;

  const floors = dungeon.floors.map((floor) => {
    if (floor.level !== level) return floor;
    return {
      ...floor,
      units: floor.units.map((unit) => {
        if (unit.type === 'stairwell') return unit;
        total += 1;
        // Already swept this floor — a second visit doesn't re-roll it.
        if (unit.state !== 'unexplored') {
          if (unit.scoutedInfo) read += 1;
          return unit;
        }
        const uRng = rng.fork(unit.id);
        const info: HdbScoutInfo = { threatCount: -1, lootQuality: 'unreadable' };

        if (uRng.chance(senseChance(attrs.perception))) {
          const threat = floorThreat(dungeon, floor.level);
          info.threatCount = Math.max(0, Math.round(threat / 2) + uRng.int(-1, 1));
        }
        if (uRng.chance(senseChance(attrs.wits))) {
          info.hazardType =
            unit.type === 'hazard' || uRng.chance(0.25) ? uRng.pick(HAZARDS) : undefined;
          info.readRoom = true;
        }
        if (uRng.chance(senseChance(attrs.dexterity))) {
          info.containerCategory = uRng.pick(CONTAINER_CATEGORIES);
          info.lootQuality =
            unit.type === 'corner_unit'
              ? LOOT_QUALITY[Math.min(3, 2 + uRng.int(0, 1))]
              : uRng.pick(LOOT_QUALITY);
        }

        const readAnything = info.threatCount >= 0 || info.readRoom || !!info.containerCategory;
        if (readAnything) read += 1;
        return {
          ...unit,
          state: 'scouted' as HdbUnitState,
          scoutedInfo: readAnything ? info : undefined,
        };
      }),
    };
  });

  return { dungeon: { ...dungeon, floors }, read, total };
}

export interface BreachOutcome {
  /** Chance a fight starts the moment the door gives. */
  encounterChance: number;
  /** Loot roll bonus for this unit. */
  lootMod: number;
  /** Heat the noise adds to the block. */
  heat: number;
  hazard?: string;
}

/** What forcing this door is likely to cost and yield. */
export function breachOutcome(
  dungeon: HdbDungeon,
  unit: HdbUnitNode,
  level: number,
): BreachOutcome {
  const threat = floorThreat(dungeon, level);
  const known = unit.scoutedInfo;
  const base = 0.1 + threat * 0.07;
  const encounterChance = Math.max(
    0.02,
    Math.min(0.9, known && known.threatCount === 0 ? base * 0.35 : base),
  );
  const lootMod =
    (unit.type === 'corner_unit' ? 2 : 0) + (unit.type === 'hazard' ? 1 : 0) + Math.floor(level / 4);
  return {
    encounterChance,
    lootMod,
    heat: 1,
    hazard: known?.hazardType,
  };
}

export interface RetreatCheck {
  roll: number;
  total: number;
  dc: number;
  success: boolean;
}

/**
 * Heading back down with the block awake. Failure means something cuts you off
 * on the stairs — the store turns that into a fight.
 */
export function retreatCheck(rng: Rng, attrs: Attributes, dungeon: HdbDungeon): RetreatCheck {
  const roll = rng.d20();
  const total = roll + attrs.dexterity + attrs.endurance;
  const dc = 10 + Math.floor(dungeon.blockHeat) * 2;
  return { roll, total, dc, success: roll === 20 || total >= dc };
}

/** Levels reachable in one move: neighbours, plus skybridge-to-skybridge. */
export function reachableLevels(dungeon: HdbDungeon): number[] {
  const cur = dungeon.currentLevel;
  const out = new Set<number>();
  if (cur > 1) out.add(cur - 1);
  if (cur < MAX_LEVEL) out.add(cur + 1);
  if (SKYBRIDGE_LEVELS.includes(cur)) {
    for (const l of SKYBRIDGE_LEVELS) if (l !== cur) out.add(l);
  }
  return [...out].sort((a, b) => a - b);
}

/** Convenience for the UI — the floor the player is standing on. */
export function currentFloor(dungeon: HdbDungeon): HdbFloor {
  return dungeon.floors[dungeon.currentLevel - 1];
}

export function updateUnit(
  dungeon: HdbDungeon,
  level: number,
  unitId: string,
  patch: Partial<HdbUnitNode>,
): HdbDungeon {
  const floors = dungeon.floors.map((f) =>
    f.level !== level
      ? f
      : { ...f, units: f.units.map((u) => (u.id === unitId ? { ...u, ...patch } : u)) },
  );
  return { ...dungeon, floors };
}

/** Raise the block's heat and mirror it onto the floor the noise came from. */
export function addHeat(dungeon: HdbDungeon, amount: number, level: number): HdbDungeon {
  if (amount <= 0) return dungeon;
  return {
    ...dungeon,
    blockHeat: dungeon.blockHeat + amount,
    floors: dungeon.floors.map((f) =>
      f.level === level ? { ...f, heatLevel: f.heatLevel + amount } : f,
    ),
  };
}
