import type { Attributes, LocationState } from './types';
import type { Rng } from './rng';
import type { IconName } from '../icons/keys';

/**
 * A vertical, push-your-luck dungeon layered over an HDB block. Everything here
 * is pure: the store owns the live instance and applies the deltas.
 *
 * Layout is a building cutaway: full-height stair columns partition a corridor
 * of door units. Sealed landings are permanently gone; corridor/stair blockades
 * gate the maze. Individual doors may also be boarded shut.
 */

export type HdbArchetype = 'estate' | 'shelter';

export type HdbUnitType =
  | 'residential'
  | 'corner_unit'
  | 'shelter_service'
  | 'hazard';

export type HdbUnitState = 'unexplored' | 'scouted' | 'breached' | 'cleared';

/** How the door stands. Most of a dead block is simply hanging open. */
export type HdbEntry = 'open' | 'ajar' | 'locked' | 'barricaded';

export interface HdbEntryMeta {
  label: string;
  verb: string;
  minutes: number;
  /** Block heat the entry adds — open doors cost nothing. */
  heat: number;
  /** Metres of noise the entry throws; 0 means the street never hears it. */
  noise: number;
  /**
   * Danger the noise adds to locations in earshot. Deliberately not `heat`:
   * block heat runs on a 0..HEAT_MAX charge, while the world's danger boost is
   * a small number of points that decays by the hour.
   */
  dangerBoost: number;
  /** Multiplier on the odds something is waiting inside. */
  encounterMod: number;
  /** Sealed rooms keep their contents; open ones were emptied months ago. */
  lootMod: number;
}

export const ENTRY_META: Record<HdbEntry, HdbEntryMeta> = {
  open: {
    label: 'wide open',
    verb: 'Step inside',
    minutes: 5,
    heat: 0,
    noise: 0,
    dangerBoost: 0,
    encounterMod: 0.8,
    lootMod: -1,
  },
  ajar: {
    label: 'ajar',
    verb: 'Push it open',
    minutes: 8,
    heat: 0,
    noise: 0,
    dangerBoost: 0,
    encounterMod: 0.9,
    lootMod: 0,
  },
  locked: {
    label: 'locked',
    verb: 'Force it',
    minutes: 15,
    heat: 14,
    noise: 220,
    dangerBoost: 1,
    encounterMod: 1,
    lootMod: 1,
  },
  barricaded: {
    label: 'barricaded',
    verb: 'Break through',
    minutes: 25,
    heat: 24,
    noise: 320,
    dangerBoost: 2,
    encounterMod: 0.6,
    lootMod: 2,
  },
};

export type HdbStairKind = 'side' | 'internal';

/** A full-height stair shaft in the building cutaway. */
export interface HdbStair {
  id: string;
  kind: HdbStairKind;
  /** Index in the shared floor strip (0 = leftmost column). */
  column: number;
}

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
  /** Door slot in the shared floor strip. */
  column: number;
  label: string;
  /** False = boarded / dead — shown with a cross, never enterable. */
  available: boolean;
  /** How the door stands before you touch it. */
  entry: HdbEntry;
  /** Set on shelter blocks — the service this unit runs. */
  service?: ShelterService;
  scoutedInfo?: HdbScoutInfo;
}

/** Why a floor can't be walked onto. Sealed storeys are scenery — never opened. */
export type SealKind = 'collapsed' | 'flooded' | 'welded' | 'burnt';

export interface HdbSeal {
  kind: SealKind;
}

export const SEAL_META: Record<SealKind, { label: string; blurb: string }> = {
  collapsed: {
    label: 'Slab collapsed',
    blurb: 'The floor above came down on this one. Nothing to stand on.',
  },
  flooded: {
    label: 'Flooded',
    blurb: 'Black water to the ceiling. The landing is below the waterline.',
  },
  welded: {
    label: 'Gate welded',
    blurb: 'Someone sealed the landing from the inside. No way through.',
  },
  burnt: {
    label: 'Burnt out',
    blurb: 'Debris packed the landing solid. Nothing left to walk on.',
  },
};

export interface HdbFloor {
  level: number;
  layoutType: 'slab' | 'point';
  heatLevel: number;
  units: HdbUnitNode[];
  /** null when the floor is walkable; otherwise permanently inaccessible. */
  sealed: HdbSeal | null;
  /**
   * Ground storey only. Open / partial void decks have pillar bays instead of
   * (or mixed with) flat doors — classic Singapore HDB.
   */
  groundKind?: HdbGroundKind;
}

/**
 * How the ground storey is built. Real blocks vary: many are pure void deck,
 * some split open deck with an enclosed lobby, a few put flats at grade.
 */
export type HdbGroundKind = 'void_open' | 'void_partial' | 'enclosed';

export const GROUND_LABEL: Record<HdbGroundKind, string> = {
  void_open: 'open void deck',
  void_partial: 'partial void deck',
  enclosed: 'enclosed ground',
};

export interface HdbDungeon {
  locationId: string;
  name: string;
  archetype: HdbArchetype;
  baseDanger: number;
  /** Storeys the block actually has — most of them you can't stand on. */
  height: number;
  floors: HdbFloor[];
  /** Full-height stair columns that partition the corridor. */
  stairs: HdbStair[];
  /** Total columns in the strip (stairs + unit slots). */
  stripWidth: number;
  /** Door column indices shared by every open floor. */
  unitColumns: number[];
  /** Ground-storey massing — void deck, half-and-half, or flats at grade. */
  groundKind: HdbGroundKind;
  /** Where the survivor is standing in the cutaway. */
  pos: HdbPos;
  /** Mirror of pos.level — kept for existing call sites. */
  currentLevel: number;
  /** Floors whose doors/layout the player has seen. */
  revealedLevels: number[];
  /** Impassable edges keyed by horizKey / vertKey. */
  blocks: Record<string, HdbBlock>;
  /** Rises with every hour spent inside and every loud thing you do. */
  blockHeat: number;
  /** Levels the player has actually stood on. */
  visited: number[];
  /**
   * Counts every stairwell attempt. Folded into the rng key so a failed
   * descent doesn't share a roll with the next try. Stair fights resume the
   * interrupted cell move on combatContinue — moveSeq alone used to leave you
   * stranded on the origin floor when heat kept failing the check.
   */
  moveSeq: number;
}

/** Cell in the building cutaway. */
export interface HdbPos {
  level: number;
  column: number;
}

export type HdbBlockKind = 'debris' | 'barricade' | 'collapse' | 'stair_gate';

/** A blocked edge between two adjacent walkable cells. */
export interface HdbBlock {
  kind: HdbBlockKind;
  breakable: boolean;
  heat: number;
  minutes: number;
}

export const BLOCK_META: Record<
  HdbBlockKind,
  { label: string; blurb: string; breakable: boolean }
> = {
  debris: {
    label: 'Debris',
    blurb: 'Junk packed the corridor. It can be hauled aside.',
    breakable: true,
  },
  barricade: {
    label: 'Barricade',
    blurb: 'Someone nailed the landing shut. Loud to break.',
    breakable: true,
  },
  collapse: {
    label: 'Collapse',
    blurb: 'The slab gave way. No way through.',
    breakable: false,
  },
  stair_gate: {
    label: 'Stair gate',
    blurb: 'A welded grate across the shaft. It can be forced.',
    breakable: true,
  },
};

export const BLOCK_HEAT = 12;
export const BLOCK_MINUTES = 20;

/** Minutes to walk one corridor cell. */
export const CORRIDOR_MINUTES = 2;

/** How tall a block can run, and how much of it is ever walkable. */
export const MIN_HEIGHT = 10;
export const MAX_HEIGHT = 16;
export const MIN_OPEN_FLOORS = 5;
export const MAX_OPEN_FLOORS = 8;

// ------------------------------------------------------------- block heat --

/**
 * Heat is a charge, not a clock. Nothing but the player's own noise moves it:
 * time in the block is free, so a survivor who only opens doors that are
 * already hanging can work all twelve floors without waking anything.
 */
export const HEAT_MAX = 100;

/** Odds the block puts something in your way once the gauge is pinned. */
export const HUNT_ELITE_CHANCE = 0.8;

/** Heat the noisier things cost, for sources that aren't a door. */
export const FIGHT_HEAT = 18;
export const HAZARD_HEAT = 10;

export interface HeatBand {
  /** Lowest heat that reads as this band. */
  at: number;
  label: string;
  note: string;
  /** What the band adds to every floor's threat. */
  threatBonus: number;
  /** Steps above the base descent DC; 0 means no check at all. */
  dcStep: number;
}

/** The one table the model and the HUD both read. */
export const HEAT_BANDS: HeatBand[] = [
  {
    at: 0,
    label: 'Quiet',
    note: 'Nothing has noticed you yet.',
    threatBonus: 0,
    dcStep: 0,
  },
  {
    at: 20,
    label: 'Stirring',
    note: 'The stairwell is watched — going down is a check now.',
    threatBonus: 1,
    dcStep: 1,
  },
  {
    at: 45,
    label: 'Awake',
    note: 'The block is moving. Every floor is worse than it was.',
    threatBonus: 2,
    dcStep: 2,
  },
  {
    at: 70,
    label: 'Hunting',
    note: 'They are looking for you now.',
    threatBonus: 3,
    dcStep: 3,
  },
  {
    at: HEAT_MAX,
    label: 'Swarm',
    note: 'The block has your floor. Get out.',
    threatBonus: 3,
    dcStep: 4,
  },
];

export function heatBand(heat: number): HeatBand {
  let band = HEAT_BANDS[0];
  for (const b of HEAT_BANDS) if (heat >= b.at) band = b;
  return band;
}

/** Pinned: every door and every staircase is now likely to cost a fight. */
export function isHunting(dungeon: HdbDungeon): boolean {
  return dungeon.blockHeat >= HEAT_MAX;
}

/** Minutes each action inside the block costs. */
export const BREACH_MINUTES = 15;
/** Minutes per storey on the stairs (pack on, careful). Shaft hops charge by |Δlevel|. */
export const STAIR_MINUTES = 2;

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

interface StripLayout {
  stairs: HdbStair[];
  stripWidth: number;
  unitColumns: number[];
}

/**
 * Lay a corridor strip the way a real HDB reads in section: optional end
 * stairs, up to two internal stairwells, and door bays between them.
 */
function buildStrip(rng: Rng, layoutType: HdbFloor['layoutType']): StripLayout {
  const unitSlotCount =
    layoutType === 'slab' ? rng.int(6, 8) : rng.int(4, 5);

  // Side stairs: weighted toward both ends, rare to have none.
  const sideRoll = rng.next();
  let hasLeft = false;
  let hasRight = false;
  if (sideRoll < 0.15) {
    // none
  } else if (sideRoll < 0.4) {
    if (rng.chance(0.5)) hasLeft = true;
    else hasRight = true;
  } else {
    hasLeft = true;
    hasRight = true;
  }

  const nInternal = rng.int(0, 2);
  const nBays = nInternal + 1;

  // Spread doors across bays — prefer at least 2 per bay when the strip allows.
  const baySizes: number[] = Array(nBays).fill(0);
  let remaining = unitSlotCount;
  const minPerBay = unitSlotCount >= nBays * 2 ? 2 : 1;
  for (let i = 0; i < nBays; i++) {
    baySizes[i] = minPerBay;
    remaining -= minPerBay;
  }
  while (remaining > 0) {
    baySizes[rng.int(0, nBays - 1)] += 1;
    remaining -= 1;
  }

  // Maze needs at least one shaft or the block is a single sealed landing.
  if (!hasLeft && !hasRight && nInternal === 0) {
    hasLeft = true;
  }

  const stairs: HdbStair[] = [];
  const unitColumns: number[] = [];
  let col = 0;

  if (hasLeft) {
    stairs.push({ id: 'L', kind: 'side', column: col });
    col += 1;
  }

  for (let b = 0; b < nBays; b++) {
    for (let u = 0; u < baySizes[b]; u++) {
      unitColumns.push(col);
      col += 1;
    }
    if (b < nInternal) {
      stairs.push({
        id: String.fromCharCode(65 + b),
        kind: 'internal',
        column: col,
      });
      col += 1;
    }
  }

  if (hasRight) {
    stairs.push({ id: 'R', kind: 'side', column: col });
    col += 1;
  }

  return { stairs, stripWidth: col, unitColumns };
}

function rollGroundKind(rng: Rng): HdbGroundKind {
  // Weighted toward the classic open void deck Singaporeans picture first.
  const r = rng.next();
  if (r < 0.5) return 'void_open';
  if (r < 0.8) return 'void_partial';
  return 'enclosed';
}

/**
 * Which door columns get flats on the ground storey. Open void = none; partial
 * keeps a contiguous run (lobby / shop side) and leaves the rest as pillars.
 */
function groundUnitColumns(
  rng: Rng,
  groundKind: HdbGroundKind,
  unitColumns: number[],
): number[] {
  if (groundKind === 'void_open') return [];
  if (groundKind === 'enclosed') return unitColumns;
  if (unitColumns.length <= 1) return rng.chance(0.5) ? unitColumns : [];

  // Keep a contiguous bay-side run so the cutaway reads as "half deck, half built".
  const keepCount = Math.max(1, Math.min(unitColumns.length - 1, Math.ceil(unitColumns.length * 0.45)));
  if (rng.chance(0.5)) return unitColumns.slice(0, keepCount);
  return unitColumns.slice(unitColumns.length - keepCount);
}

/** Build the block: a tall stack, most of it shut, with a walkable maze. */
export function generateDungeon(
  rng: Rng,
  loc: LocationState,
  archetype: HdbArchetype,
): HdbDungeon {
  const layoutType: HdbFloor['layoutType'] = rng.chance(0.6) ? 'slab' : 'point';
  const height = rng.int(MIN_HEIGHT, MAX_HEIGHT);
  const strip = buildStrip(rng.fork('strip'), layoutType);
  const groundKind = rollGroundKind(rng.fork('ground'));
  const groundCols = groundUnitColumns(rng.fork('groundCols'), groundKind, strip.unitColumns);

  // Lobby / void deck is always open; fill out to a handful of walkable landings.
  const oRng = rng.fork('open');
  const open = new Set<number>([1]);
  const openCount = oRng.int(MIN_OPEN_FLOORS, MAX_OPEN_FLOORS);
  const candidates = oRng.shuffle(
    Array.from({ length: height - 1 }, (_, i) => i + 2),
  );
  for (const l of candidates.slice(0, openCount - 1)) open.add(l);

  const floors: HdbFloor[] = [];

  for (let level = 1; level <= height; level++) {
    const fRng = rng.fork(`floor:${level}`);
    const isOpenFloor = open.has(level);
    let sealed: HdbSeal | null = null;
    if (!isOpenFloor) {
      // Flavour only — sealed storeys never open. Maze gates live in `blocks`.
      const kind = fRng.chance(0.58)
        ? fRng.pick(['collapsed', 'flooded'] as const)
        : fRng.pick(['welded', 'burnt'] as const);
      sealed = { kind };
    }

    let units: HdbUnitNode[] = [];
    if (isOpenFloor) {
      const cols = level === 1 ? groundCols : strip.unitColumns;
      units = cols.length ? buildUnits(fRng, level, archetype, cols) : [];
    }

    floors.push({
      level,
      layoutType,
      heatLevel: 0,
      sealed,
      units,
      ...(level === 1 ? { groundKind } : {}),
    });
  }

  const pos: HdbPos = { level: 1, column: 0 };
  const draft: HdbDungeon = {
    locationId: loc.id,
    name: loc.name,
    archetype,
    baseDanger: Math.max(1, Math.round(loc.currentDanger)),
    height,
    floors,
    stairs: strip.stairs,
    stripWidth: strip.stripWidth,
    unitColumns: strip.unitColumns,
    groundKind,
    pos,
    currentLevel: 1,
    revealedLevels: [1],
    blocks: {},
    blockHeat: 0,
    visited: [1],
    moveSeq: 0,
  };

  draft.blocks = buildMazeBlocks(rng.fork('blocks'), draft, open);
  return draft;
}

/**
 * Lay corridor debris and stair gates, then peel blocks until the start can
 * still reach a fair share of open landings.
 */
function buildMazeBlocks(
  rng: Rng,
  dungeon: HdbDungeon,
  open: Set<number>,
): Record<string, HdbBlock> {
  const blocks: Record<string, HdbBlock> = {};
  const openLevels = [...open].sort((a, b) => a - b);
  const stairCols = dungeon.stairs.map((s) => s.column);

  // Stair gates between consecutive open landings on each shaft.
  for (const col of stairCols) {
    for (let i = 0; i + 1 < openLevels.length; i++) {
      const a = openLevels[i];
      const b = openLevels[i + 1];
      // Only gate if every level between is sealed or the pair is adjacent.
      let clear = true;
      for (let l = a + 1; l < b; l++) {
        if (open.has(l)) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      if (rng.chance(0.42)) {
        blocks[vertKey(col, a, b)] = {
          kind: 'stair_gate',
          breakable: true,
          heat: BLOCK_HEAT,
          minutes: BLOCK_MINUTES,
        };
      }
    }
  }

  // Corridor obstacles on open floors — the main maze pressure.
  for (const level of openLevels) {
    let placed = 0;
    const max = level === 1 ? 2 : 3;
    for (let c = 0; c + 1 < dungeon.stripWidth && placed < max; c++) {
      const chance = level === 1 ? 0.14 : 0.26;
      if (!rng.chance(chance)) continue;
      const kind: HdbBlockKind = rng.chance(0.18) ? 'collapse' : rng.chance(0.5) ? 'barricade' : 'debris';
      const meta = BLOCK_META[kind];
      blocks[horizKey(level, c, c + 1)] = {
        kind,
        breakable: meta.breakable,
        heat: BLOCK_HEAT,
        minutes: BLOCK_MINUTES,
      };
      placed += 1;
    }
  }

  // Peel until start reaches enough open floors (or we run out of breakable gates).
  const need = Math.min(openLevels.length, Math.max(3, Math.ceil(openLevels.length * 0.55)));
  let guard = 0;
  while (guard++ < 40) {
    const probe = { ...dungeon, blocks };
    const reached = reachableOpenLevels(probe, dungeon.pos);
    if (reached.size >= need) break;
    // Prefer removing a stair gate that unlocks the most, else any breakable block.
    const keys = Object.keys(blocks).filter((k) => blocks[k].breakable);
    if (keys.length === 0) break;
    const stairKeys = keys.filter((k) => k.startsWith('v:'));
    const pick = (stairKeys.length ? stairKeys : keys)[rng.int(0, (stairKeys.length ? stairKeys : keys).length - 1)];
    delete blocks[pick];
  }

  return blocks;
}

export function posKey(p: HdbPos): string {
  return `${p.level}:${p.column}`;
}

export function samePos(a: HdbPos, b: HdbPos): boolean {
  return a.level === b.level && a.column === b.column;
}

export function horizKey(level: number, a: number, b: number): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `h:${level}:${lo}-${hi}`;
}

export function vertKey(col: number, a: number, b: number): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `v:${col}:${lo}-${hi}`;
}

export function isStairColumn(dungeon: HdbDungeon, column: number): boolean {
  return dungeon.stairs.some((s) => s.column === column);
}

export function isLevelRevealed(dungeon: HdbDungeon, level: number): boolean {
  return dungeon.revealedLevels.includes(level);
}

export function edgeBlock(
  dungeon: HdbDungeon,
  from: HdbPos,
  to: HdbPos,
): HdbBlock | null {
  if (from.level === to.level) {
    return dungeon.blocks[horizKey(from.level, from.column, to.column)] ?? null;
  }
  if (from.column === to.column) {
    return dungeon.blocks[vertKey(from.column, from.level, to.level)] ?? null;
  }
  return null;
}

/**
 * Most doors in an abandoned block were kicked in long before you got here.
 * Only the units worth sealing — corners, hoarders' flats — still resist, and
 * those are the ones that make noise.
 */
function rollEntry(rng: Rng, type: HdbUnitType, archetype: HdbArchetype): HdbEntry {
  if (type === 'shelter_service') return 'open';
  const r = rng.next();
  if (type === 'corner_unit') {
    if (r < 0.25) return 'ajar';
    if (r < 0.7) return 'locked';
    return 'barricaded';
  }
  if (type === 'hazard') {
    if (r < 0.45) return 'ajar';
    if (r < 0.85) return 'locked';
    return 'barricaded';
  }
  // Residential: a lived-in shelter keeps more doors usable than a dead estate.
  const openCut = archetype === 'shelter' ? 0.6 : 0.5;
  if (r < openCut) return 'open';
  if (r < openCut + 0.28) return 'ajar';
  if (r < openCut + 0.45) return 'locked';
  return 'barricaded';
}

function rollAvailable(rng: Rng, type: HdbUnitType): boolean {
  // Corners and hazards are slightly more often worth finding.
  if (type === 'corner_unit' || type === 'hazard') return rng.chance(0.75);
  return rng.chance(0.65);
}

function buildUnits(
  rng: Rng,
  level: number,
  archetype: HdbArchetype,
  unitColumns: number[],
): HdbUnitNode[] {
  const units: HdbUnitNode[] = [];
  const n = unitColumns.length;
  // Real unit numbers are `#<storey>-<unit>`, and the unit half doesn't restart
  // at 01 on every floor — each landing gets its own run of numbers.
  const stack = rng.int(1, 6) * 100;
  const base = stack + rng.int(1, 40);
  const storey = String(level).padStart(2, '0');

  for (let i = 0; i < n; i++) {
    const column = unitColumns[i];
    const corner = i === 0 || i === n - 1;
    let type: HdbUnitType = corner
      ? 'corner_unit'
      : rng.chance(0.15)
        ? 'hazard'
        : 'residential';

    if (archetype === 'shelter' && rng.chance(0.45)) {
      type = 'shelter_service';
    }

    const available = type === 'shelter_service' ? true : rollAvailable(rng, type);
    const unit: HdbUnitNode = {
      id: `L${level}-c${column}`,
      type,
      state: 'unexplored',
      column,
      label: `#${storey}-${base + i}`,
      available,
      entry: 'open',
      ...(type === 'shelter_service' ? { service: rng.pick(SERVICES) } : {}),
    };
    unit.entry = available ? rollEntry(rng, unit.type, archetype) : 'open';
    units.push(unit);
  }
  return units;
}

/**
 * How dangerous fights on this floor hit. Heat wakes the block; storey height
 * no longer softens it — going up is for loot, coming down is the risk.
 *
 * Capped at 5 because that's the top of the ordinary zombie roster — an
 * uncapped value used to climb forever and buy nothing above Brute.
 */
export function floorThreat(dungeon: HdbDungeon, _level?: number): number {
  const raw = dungeon.baseDanger + heatBand(dungeon.blockHeat).threatBonus;
  return Math.max(0, Math.min(5, raw));
}

/**
 * Heat-forward base for door encounter odds (before entry-type multiplier).
 * Continuous heat plus band steps so every point on the gauge matters.
 */
export function heatEncounterBase(dungeon: HdbDungeon): number {
  const frac = Math.min(1, dungeon.blockHeat / HEAT_MAX);
  const band = heatBand(dungeon.blockHeat).threatBonus;
  return Math.max(0.05, Math.min(0.85, 0.1 + frac * 0.5 + band * 0.04));
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
 * The sweep you make stepping onto a floor: every available unit's type is
 * noted, and each sense rolls separately per room for the detail it would
 * catch. Sharper survivors simply see more of the corridor — there's nothing
 * to click.
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
        if (!unit.available) return unit;
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
  /** Metres of noise thrown onto the street; 0 for a door already open. */
  noise: number;
  /** Danger the street picks up — a small, decaying number, not block heat. */
  dangerBoost: number;
  /** Minutes the entry costs. */
  minutes: number;
  hazard?: string;
}

/** What getting through this door is likely to cost and yield. */
export function breachOutcome(
  dungeon: HdbDungeon,
  unit: HdbUnitNode,
  level: number,
): BreachOutcome {
  const meta = ENTRY_META[unit.entry];
  const known = unit.scoutedInfo;
  // Encounter odds track heat + door type. Height only sweetens loot.
  const base = heatEncounterBase(dungeon) * meta.encounterMod;
  const encounterChance = Math.max(
    0.02,
    Math.min(0.9, known && known.threatCount === 0 ? base * 0.35 : base),
  );
  const lootMod =
    (unit.type === 'corner_unit' ? 2 : 0) +
    (unit.type === 'hazard' ? 1 : 0) +
    meta.lootMod +
    Math.floor((level - 1) / 2);
  return {
    encounterChance,
    lootMod,
    heat: meta.heat,
    noise: meta.noise,
    dangerBoost: meta.dangerBoost,
    minutes: meta.minutes,
    hazard: known?.hazardType,
  };
}

/** The DC for walking back down. Exported so the HUD can show it before you commit. */
export function retreatDc(dungeon: HdbDungeon): number {
  return 10 + heatBand(dungeon.blockHeat).dcStep * 2;
}

/** Below Stirring the stairs are simply stairs — no roll. */
export function descentIsChecked(dungeon: HdbDungeon): boolean {
  return heatBand(dungeon.blockHeat).dcStep > 0;
}

/** The parts that add up to floorThreat, for a HUD that has to explain itself. */
export function threatBreakdown(dungeon: HdbDungeon, level?: number) {
  return {
    base: dungeon.baseDanger,
    heat: heatBand(dungeon.blockHeat).threatBonus,
    total: floorThreat(dungeon, level),
  };
}

/**
 * Exact fail rate for the descent check (d20 + Dex + End vs DC; nat 20 always
 * succeeds). Exported so stair tooltips can preview the odds before you commit.
 */
export function retreatFailChance(attrs: Attributes, dungeon: HdbDungeon): number {
  if (!descentIsChecked(dungeon)) return 0;
  const dc = retreatDc(dungeon);
  const mod = attrs.dexterity + attrs.endurance;
  let fails = 0;
  for (let roll = 1; roll <= 20; roll++) {
    if (roll === 20) continue;
    if (roll + mod < dc) fails += 1;
  }
  return fails / 20;
}

/**
 * Hover line for a path that changes storey: hunt % when Swarm, descent DC +
 * fail % when going down with heat. Null when stairs are free.
 */
export function stairTravelHint(
  dungeon: HdbDungeon,
  path: HdbPos[],
  attrs: Attributes,
): string | null {
  if (!pathUsesStairs(path)) return null;
  const bits: string[] = [];
  if (isHunting(dungeon)) {
    bits.push(`${Math.round(HUNT_ELITE_CHANCE * 100)}% hunt on the stairs`);
  }
  if (pathDescends(path) && descentIsChecked(dungeon)) {
    const failPct = Math.round(retreatFailChance(attrs, dungeon) * 100);
    bits.push(`descent DC ${retreatDc(dungeon)} · ~${failPct}% fail`);
  } else if (!isHunting(dungeon) && !pathDescends(path)) {
    bits.push('climb free');
  }
  return bits.length ? bits.join(' · ') : null;
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
  const dc = retreatDc(dungeon);
  return { roll, total, dc, success: roll === 20 || total >= dc };
}

/** A floor you can actually stand on. */
export function isOpen(dungeon: HdbDungeon, level: number): boolean {
  return dungeon.floors[level - 1]?.sealed === null;
}

export function neighbors(dungeon: HdbDungeon, pos: HdbPos): HdbPos[] {
  if (!isOpen(dungeon, pos.level)) return [];
  const out: HdbPos[] = [];

  for (const dc of [-1, 1] as const) {
    const column = pos.column + dc;
    if (column < 0 || column >= dungeon.stripWidth) continue;
    if (edgeBlock(dungeon, pos, { level: pos.level, column })) continue;
    out.push({ level: pos.level, column });
  }

  // Stairs skip sealed landings — you ride the shaft to the next open floor.
  if (isStairColumn(dungeon, pos.column)) {
    for (const dir of [-1, 1] as const) {
      const level = nextOpenLevel(dungeon, pos.level, dir);
      if (level === null) continue;
      if (edgeBlock(dungeon, pos, { level, column: pos.column })) continue;
      out.push({ level, column: pos.column });
    }
  }

  return out;
}

/** Next open storey above/below, or null at the end of the shaft. */
export function nextOpenLevel(
  dungeon: HdbDungeon,
  fromLevel: number,
  dir: 1 | -1,
): number | null {
  let l = fromLevel + dir;
  while (l >= 1 && l <= dungeon.height) {
    if (isOpen(dungeon, l)) return l;
    l += dir;
  }
  return null;
}

/** BFS shortest path. Null if the target is cut off. */
export function findPath(
  dungeon: HdbDungeon,
  from: HdbPos,
  to: HdbPos,
): HdbPos[] | null {
  if (samePos(from, to)) return [from];
  if (!isOpen(dungeon, to.level)) return null;

  const q: HdbPos[] = [from];
  const prev = new Map<string, string | null>();
  prev.set(posKey(from), null);

  while (q.length) {
    const cur = q.shift()!;
    for (const n of neighbors(dungeon, cur)) {
      const k = posKey(n);
      if (prev.has(k)) continue;
      prev.set(k, posKey(cur));
      if (samePos(n, to)) {
        const path: HdbPos[] = [n];
        let walk: string | null = posKey(cur);
        while (walk) {
          const [lv, col] = walk.split(':').map(Number);
          path.push({ level: lv, column: col });
          walk = prev.get(walk) ?? null;
        }
        path.reverse();
        return path;
      }
      q.push(n);
    }
  }
  return null;
}

/** Same as neighbors, but corridor / stair blocks do not stop you. */
function neighborsIgnoringBlocks(dungeon: HdbDungeon, pos: HdbPos): HdbPos[] {
  if (!isOpen(dungeon, pos.level)) return [];
  const out: HdbPos[] = [];

  for (const dc of [-1, 1] as const) {
    const column = pos.column + dc;
    if (column < 0 || column >= dungeon.stripWidth) continue;
    out.push({ level: pos.level, column });
  }

  if (isStairColumn(dungeon, pos.column)) {
    for (const dir of [-1, 1] as const) {
      const level = nextOpenLevel(dungeon, pos.level, dir);
      if (level === null) continue;
      out.push({ level, column: pos.column });
    }
  }

  return out;
}

/** Ideal route if every corridor block and stair gate were gone. */
export function findPathIgnoringBlocks(
  dungeon: HdbDungeon,
  from: HdbPos,
  to: HdbPos,
): HdbPos[] | null {
  if (samePos(from, to)) return [from];
  if (!isOpen(dungeon, to.level)) return null;

  const q: HdbPos[] = [from];
  const prev = new Map<string, string | null>();
  prev.set(posKey(from), null);

  while (q.length) {
    const cur = q.shift()!;
    for (const n of neighborsIgnoringBlocks(dungeon, cur)) {
      const k = posKey(n);
      if (prev.has(k)) continue;
      prev.set(k, posKey(cur));
      if (samePos(n, to)) {
        const path: HdbPos[] = [n];
        let walk: string | null = posKey(cur);
        while (walk) {
          const [lv, col] = walk.split(':').map(Number);
          path.push({ level: lv, column: col });
          walk = prev.get(walk) ?? null;
        }
        path.reverse();
        return path;
      }
      q.push(n);
    }
  }
  return null;
}

export function blockKeyBetween(from: HdbPos, to: HdbPos): string | null {
  if (from.level === to.level) return horizKey(from.level, from.column, to.column);
  if (from.column === to.column) return vertKey(from.column, from.level, to.level);
  return null;
}

export interface PathAttempt {
  /** Cells to walk, including the start. Length 1 means you are already stopped at a block. */
  path: HdbPos[];
  /** True when the full route to the click target is clear. */
  reached: boolean;
  blockedBy: HdbBlock | null;
  blockedKey: string | null;
}

/**
 * Prefer a clear path. If a blockade sits on the ideal route, walk up to the
 * cell before it and surface the block so the player can clear (or give up).
 */
export function findPathToward(
  dungeon: HdbDungeon,
  from: HdbPos,
  to: HdbPos,
): PathAttempt | null {
  if (!isOpen(dungeon, to.level)) return null;
  if (samePos(from, to)) {
    return { path: [from], reached: true, blockedBy: null, blockedKey: null };
  }

  const clear = findPath(dungeon, from, to);
  if (clear) {
    return { path: clear, reached: true, blockedBy: null, blockedKey: null };
  }

  const ideal = findPathIgnoringBlocks(dungeon, from, to);
  if (!ideal || ideal.length < 2) return null;

  const path: HdbPos[] = [ideal[0]];
  for (let i = 1; i < ideal.length; i++) {
    const prev = ideal[i - 1];
    const next = ideal[i];
    const block = edgeBlock(dungeon, prev, next);
    if (block) {
      return {
        path,
        reached: false,
        blockedBy: block,
        blockedKey: blockKeyBetween(prev, next),
      };
    }
    path.push(next);
  }

  return { path, reached: true, blockedBy: null, blockedKey: null };
}

export function pathMinutes(path: HdbPos[]): number {
  if (path.length <= 1) return 0;
  let m = 0;
  for (let i = 1; i < path.length; i++) {
    const dLevel = Math.abs(path[i].level - path[i - 1].level);
    m += dLevel === 0 ? CORRIDOR_MINUTES : STAIR_MINUTES * dLevel;
  }
  return m;
}

/** True when the path includes at least one downward stair step. */
export function pathDescends(path: HdbPos[]): boolean {
  for (let i = 1; i < path.length; i++) {
    if (path[i].level < path[i - 1].level) return true;
  }
  return false;
}

/** True when the path includes any stair step. */
export function pathUsesStairs(path: HdbPos[]): boolean {
  for (let i = 1; i < path.length; i++) {
    if (path[i].level !== path[i - 1].level) return true;
  }
  return false;
}

function reachableOpenLevels(dungeon: HdbDungeon, from: HdbPos): Set<number> {
  const seen = new Set<string>();
  const levels = new Set<number>();
  const q: HdbPos[] = [from];
  seen.add(posKey(from));
  levels.add(from.level);
  while (q.length) {
    const cur = q.shift()!;
    for (const n of neighbors(dungeon, cur)) {
      const k = posKey(n);
      if (seen.has(k)) continue;
      seen.add(k);
      levels.add(n.level);
      q.push(n);
    }
  }
  return levels;
}

/**
 * Cells you can auto-path to from the current position.
 * Fog: unrevealed floors only expose stair cells (so you can climb into them).
 */
export function reachableCells(dungeon: HdbDungeon): HdbPos[] {
  const from = dungeon.pos;
  const seen = new Set<string>();
  const out: HdbPos[] = [];
  const q: HdbPos[] = [from];
  seen.add(posKey(from));

  while (q.length) {
    const cur = q.shift()!;
    for (const n of neighbors(dungeon, cur)) {
      const k = posKey(n);
      if (seen.has(k)) continue;
      seen.add(k);
      const revealed = isLevelRevealed(dungeon, n.level);
      const stair = isStairColumn(dungeon, n.column);
      // Unknown storeys: only stair mouths are clickable / traversable targets.
      if (!revealed && !stair) continue;
      out.push(n);
      q.push(n);
    }
  }
  return out;
}

/**
 * Cells you can *attempt* — clear path or route that stops at a blockade.
 * Same fog rule as reachableCells.
 */
export function attemptableCells(dungeon: HdbDungeon): HdbPos[] {
  const from = dungeon.pos;
  const seen = new Set<string>();
  const out: HdbPos[] = [];
  const q: HdbPos[] = [from];
  seen.add(posKey(from));

  while (q.length) {
    const cur = q.shift()!;
    for (const n of neighborsIgnoringBlocks(dungeon, cur)) {
      const k = posKey(n);
      if (seen.has(k)) continue;
      seen.add(k);
      const revealed = isLevelRevealed(dungeon, n.level);
      const stair = isStairColumn(dungeon, n.column);
      if (!revealed && !stair) continue;
      out.push(n);
      q.push(n);
    }
  }
  return out;
}

/** @deprecated Prefer reachableCells — kept for any leftover level-only UI. */
export function reachableLevels(dungeon: HdbDungeon): number[] {
  const levels = new Set<number>();
  for (const c of reachableCells(dungeon)) {
    if (c.level !== dungeon.pos.level) levels.add(c.level);
  }
  return [...levels].sort((a, b) => a - b);
}

/** Move the survivor and reveal the floor they land on. */
export function moveTo(dungeon: HdbDungeon, pos: HdbPos): HdbDungeon {
  const visited = dungeon.visited.includes(pos.level)
    ? dungeon.visited
    : [...dungeon.visited, pos.level];
  const revealedLevels = dungeon.revealedLevels.includes(pos.level)
    ? dungeon.revealedLevels
    : [...dungeon.revealedLevels, pos.level];
  return {
    ...dungeon,
    pos,
    currentLevel: pos.level,
    visited,
    revealedLevels,
  };
}

/** Clear a breakable edge block. */
export function clearBlock(
  dungeon: HdbDungeon,
  key: string,
): HdbDungeon {
  if (!dungeon.blocks[key]) return dungeon;
  const blocks = { ...dungeon.blocks };
  delete blocks[key];
  return { ...dungeon, blocks };
}

/** Edge blocks touching the current cell (clearable and permanent). */
export function adjacentEdgeBlocks(
  dungeon: HdbDungeon,
): { key: string; block: HdbBlock; toward: HdbPos }[] {
  const out: { key: string; block: HdbBlock; toward: HdbPos }[] = [];
  const pos = dungeon.pos;
  for (const n of [
    { level: pos.level, column: pos.column - 1 },
    { level: pos.level, column: pos.column + 1 },
  ]) {
    if (n.column < 0 || n.column >= dungeon.stripWidth) continue;
    const key = horizKey(pos.level, pos.column, n.column);
    const block = dungeon.blocks[key];
    if (block) out.push({ key, block, toward: n });
  }
  if (isStairColumn(dungeon, pos.column)) {
    for (const dir of [-1, 1] as const) {
      const level = nextOpenLevel(dungeon, pos.level, dir);
      if (level === null) continue;
      const toward = { level, column: pos.column };
      const key = vertKey(pos.column, pos.level, level);
      const block = dungeon.blocks[key];
      if (block) out.push({ key, block, toward });
    }
  }
  return out;
}

/** Breakable blocks on an edge touching the current cell. */
export function adjacentBreakableBlocks(
  dungeon: HdbDungeon,
): { key: string; block: HdbBlock; toward: HdbPos }[] {
  return adjacentEdgeBlocks(dungeon).filter((e) => e.block.breakable);
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
    blockHeat: Math.min(HEAT_MAX, dungeon.blockHeat + amount),
    floors: dungeon.floors.map((f) =>
      f.level === level ? { ...f, heatLevel: f.heatLevel + amount } : f,
    ),
  };
}

/** True when a persisted block has the maze cutaway topology. */
export function hasStripTopology(dungeon: HdbDungeon | null | undefined): boolean {
  return (
    !!dungeon &&
    dungeon.stripWidth > 0 &&
    Array.isArray(dungeon.stairs) &&
    Array.isArray(dungeon.unitColumns) &&
    dungeon.unitColumns.length > 0 &&
    !!dungeon.groundKind &&
    !!dungeon.pos &&
    Array.isArray(dungeon.revealedLevels) &&
    !!dungeon.blocks
  );
}

/** Ground storey with open pillar bays (full or partial void deck). */
export function isVoidDeckFloor(floor: HdbFloor): boolean {
  return floor.level === 1 && (floor.groundKind === 'void_open' || floor.groundKind === 'void_partial');
}

/** Clickable fog rule: door cells only when the floor is revealed. */
export function canTargetCell(dungeon: HdbDungeon, target: HdbPos): boolean {
  if (!isOpen(dungeon, target.level)) return false;
  if (isLevelRevealed(dungeon, target.level)) return true;
  return isStairColumn(dungeon, target.column);
}
