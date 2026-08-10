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
  /** How the door stands before you touch it. */
  entry: HdbEntry;
  /** Set on shelter blocks — the service this unit runs. */
  service?: ShelterService;
  scoutedInfo?: HdbScoutInfo;
}

/** Why a floor can't be walked onto. Some of these you can do something about. */
export type SealKind = 'collapsed' | 'flooded' | 'welded' | 'burnt';

export interface HdbSeal {
  kind: SealKind;
  /** Welded gates and debris piles give; a pancaked slab does not. */
  breakable: boolean;
  /** Cost of forcing it — loud, because it is a wall. */
  heat: number;
  minutes: number;
}

export const SEAL_META: Record<SealKind, { label: string; blurb: string; breakable: boolean }> = {
  collapsed: {
    label: 'Slab collapsed',
    blurb: 'The floor above came down on this one. Nothing to stand on.',
    breakable: false,
  },
  flooded: {
    label: 'Flooded',
    blurb: 'Black water to the ceiling. The landing is below the waterline.',
    breakable: false,
  },
  welded: {
    label: 'Gate welded',
    blurb: 'Someone sealed the landing gate from the inside. It can be forced.',
    breakable: true,
  },
  burnt: {
    label: 'Burnt out',
    blurb: 'Debris packed the landing solid. It can be dug through.',
    breakable: true,
  },
};

export const SEAL_HEAT = 20;
export const SEAL_MINUTES = 35;

export interface HdbFloor {
  level: number;
  layoutType: 'slab' | 'point';
  heatLevel: number;
  units: HdbUnitNode[];
  isSkybridge: boolean;
  /** null once the floor can be entered — either born open, or forced open. */
  sealed: HdbSeal | null;
}

/**
 * A run of stairs serving a contiguous band of the block. Real blocks have
 * several, and in a dead one they rarely all still run top to bottom — so
 * getting from 9 to 3 can mean crossing to another riser on the way.
 */
export interface HdbRiser {
  id: string;
  /** Lowest and highest level this run of stairs reaches. */
  bottom: number;
  top: number;
}

/** A link between two risers at the same height — the one way to change stairs. */
export interface HdbSkybridge {
  level: number;
  risers: [string, string];
}

export interface HdbDungeon {
  locationId: string;
  name: string;
  archetype: HdbArchetype;
  baseDanger: number;
  /** Storeys the block actually has — most of them you can't stand on. */
  height: number;
  floors: HdbFloor[];
  risers: HdbRiser[];
  skybridges: HdbSkybridge[];
  currentLevel: number;
  /** Rises with every hour spent inside and every loud thing you do. */
  blockHeat: number;
  /** Levels the player has actually stood on. */
  visited: number[];
  /**
   * Counts every stairwell attempt. Folded into the rng key so a failed
   * descent isn't re-rolled identically forever — without it, winning the
   * fight your failed roll caused just replays the same roll.
   */
  moveSeq: number;
}

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

const SEAL_KINDS = Object.keys(SEAL_META) as SealKind[];

/**
 * Lay the stairwells as overlapping runs from the ground up. Each riser starts
 * somewhere inside the one below it, so there is always a chain from the lobby
 * to the roof — the player can be made to walk a long way round, but never
 * stranded with no route at all.
 */
function buildRisers(rng: Rng, height: number): HdbRiser[] {
  const risers: HdbRiser[] = [];
  let bottom = 1;
  let id = 0;
  while (bottom <= height) {
    const top = Math.min(height, bottom + rng.int(3, 6));
    risers.push({ id: String.fromCharCode(65 + id), bottom, top });
    id += 1;
    if (top >= height) break;
    // The next run starts inside this one, so the two always share a landing.
    bottom = rng.int(Math.max(bottom + 1, top - 2), top);
  }
  return risers;
}

/**
 * A skybridge links two runs of stairs that never meet — you walk out on one
 * side of the block and in on the other. Adjacent risers already share a
 * landing, so bridging those would buy nothing; these skip further up the
 * chain, and are the only real shortcut in the building.
 */
function buildSkybridges(rng: Rng, risers: HdbRiser[]): HdbSkybridge[] {
  const out: HdbSkybridge[] = [];
  for (let i = 0; i + 2 < risers.length; i++) {
    const a = risers[i];
    const b = risers[i + 2];
    if (rng.chance(0.5)) {
      // Stand on a landing `a` serves, cross to `b` without walking the middle.
      out.push({ level: rng.int(a.bottom, a.top), risers: [a.id, b.id] });
    }
  }
  return out;
}

/** Build the block: a tall stack, most of it shut. */
export function generateDungeon(
  rng: Rng,
  loc: LocationState,
  archetype: HdbArchetype,
): HdbDungeon {
  const layoutType: HdbFloor['layoutType'] = rng.chance(0.6) ? 'slab' : 'point';
  const height = rng.int(MIN_HEIGHT, MAX_HEIGHT);
  const risers = buildRisers(rng.fork('risers'), height);
  const skybridges = buildSkybridges(rng.fork('bridges'), risers);

  // Pick which storeys survived. Two of these are not free choices: the lobby,
  // and one landing in every place two runs of stairs overlap. Without those
  // transfer landings a block can generate that the player cannot walk at all
  // — stairs that reach nothing open are the same as no stairs.
  const oRng = rng.fork('open');
  const open = new Set<number>([1]);

  for (let i = 0; i + 1 < risers.length; i++) {
    const lo = Math.max(risers[i].bottom, risers[i + 1].bottom);
    const hi = Math.min(risers[i].top, risers[i + 1].top);
    if (hi >= lo) open.add(oRng.int(lo, hi));
  }
  // The far end of a skybridge is no use if you can't stand on the near end.
  for (const b of skybridges) open.add(b.level);

  const served = new Set<number>();
  for (const r of risers) for (let l = r.bottom; l <= r.top; l++) served.add(l);

  const openCount = Math.max(open.size, rng.int(MIN_OPEN_FLOORS, MAX_OPEN_FLOORS));
  const extras = oRng.shuffle([...served].filter((l) => !open.has(l)));
  for (const l of extras.slice(0, openCount - open.size)) open.add(l);

  const bridgeLevels = new Set(skybridges.map((b) => b.level));
  const floors: HdbFloor[] = [];

  for (let level = 1; level <= height; level++) {
    const fRng = rng.fork(`floor:${level}`);
    const isOpen = open.has(level);
    let sealed: HdbSeal | null = null;
    if (!isOpen) {
      const kind = fRng.pick(SEAL_KINDS);
      const meta = SEAL_META[kind];
      sealed = {
        kind,
        breakable: meta.breakable,
        heat: SEAL_HEAT,
        minutes: SEAL_MINUTES,
      };
    }
    floors.push({
      level,
      layoutType,
      heatLevel: 0,
      isSkybridge: bridgeLevels.has(level),
      sealed,
      // A sealed floor gets no rooms until something opens it.
      units: isOpen ? buildUnits(fRng, level, layoutType, archetype) : [],
    });
  }

  return {
    locationId: loc.id,
    name: loc.name,
    archetype,
    baseDanger: Math.max(1, Math.round(loc.currentDanger)),
    height,
    floors,
    risers,
    skybridges,
    currentLevel: 1,
    blockHeat: 0,
    visited: [1],
    moveSeq: 0,
  };
}

/**
 * Most doors in an abandoned block were kicked in long before you got here.
 * Only the units worth sealing — corners, hoarders' flats — still resist, and
 * those are the ones that make noise.
 */
function rollEntry(rng: Rng, type: HdbUnitType, archetype: HdbArchetype): HdbEntry {
  if (type === 'stairwell' || type === 'shelter_service') return 'open';
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

  // Real unit numbers are `#<storey>-<unit>`, and the unit half doesn't restart
  // at 01 on every floor — each landing gets its own run of numbers.
  const stack = rng.int(1, 6) * 100;
  const leftBase = stack + rng.int(1, 40);
  const rightBase = leftBase + perWing + rng.int(1, 6);
  const storey = String(level).padStart(2, '0');

  const push = (wing: HdbWing, idx: number, type: HdbUnitType, label: string) => {
    const unit: HdbUnitNode = {
      id: `L${level}-${wing}-${idx}`,
      type,
      state: 'unexplored',
      wing,
      label,
      entry: 'open',
    };
    if (archetype === 'shelter' && type !== 'stairwell' && rng.chance(0.45)) {
      unit.type = 'shelter_service';
      unit.service = rng.pick(SERVICES);
    }
    unit.entry = rollEntry(rng, unit.type, archetype);
    units.push(unit);
  };

  for (let i = 0; i < perWing; i++) {
    const corner = i === perWing - 1;
    push(
      'left',
      i,
      corner ? 'corner_unit' : rng.chance(0.15) ? 'hazard' : 'residential',
      `#${storey}-${leftBase + i}`,
    );
  }
  push('core', 0, 'stairwell', 'Stairwell Lobby');
  for (let i = 0; i < perWing; i++) {
    const corner = i === perWing - 1;
    push(
      'right',
      i,
      corner ? 'corner_unit' : rng.chance(0.15) ? 'hazard' : 'residential',
      `#${storey}-${rightBase + i}`,
    );
  }
  return units;
}

/**
 * How dangerous the given floor is right now. Heat makes the whole block worse;
 * height buys a little quiet, since the dead pool at ground level.
 *
 * Capped at 5 because that's the top of the ordinary zombie roster — an
 * uncapped value used to climb forever and buy nothing above Brute.
 */
export function floorThreat(dungeon: HdbDungeon, level: number): number {
  const raw =
    dungeon.baseDanger + heatBand(dungeon.blockHeat).threatBonus - Math.floor(level / 3);
  return Math.max(0, Math.min(5, raw));
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
  const threat = floorThreat(dungeon, level);
  const known = unit.scoutedInfo;
  // Heat feeds in twice over: coarsely through `threat`, and directly here so
  // that every point on the gauge shifts the odds, not just a band boundary.
  const frac = Math.min(1, dungeon.blockHeat / HEAT_MAX);
  const base = (0.08 + threat * 0.06 + frac * 0.3) * meta.encounterMod;
  const encounterChance = Math.max(
    0.02,
    Math.min(0.9, known && known.threatCount === 0 ? base * 0.35 : base),
  );
  const lootMod =
    (unit.type === 'corner_unit' ? 2 : 0) +
    (unit.type === 'hazard' ? 1 : 0) +
    meta.lootMod +
    Math.floor(level / 4);
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
export function threatBreakdown(dungeon: HdbDungeon, level: number) {
  return {
    base: dungeon.baseDanger,
    heat: heatBand(dungeon.blockHeat).threatBonus,
    height: -Math.floor(level / 3),
    total: floorThreat(dungeon, level),
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
  const dc = retreatDc(dungeon);
  return { roll, total, dc, success: roll === 20 || total >= dc };
}

/** A floor you can actually stand on. */
export function isOpen(dungeon: HdbDungeon, level: number): boolean {
  return dungeon.floors[level - 1]?.sealed === null;
}

/** The stairwells serving a given level. */
export function risersAt(dungeon: HdbDungeon, level: number): HdbRiser[] {
  return dungeon.risers.filter((r) => level >= r.bottom && level <= r.top);
}

/**
 * Everywhere one stretch of walking can take you: any open floor on a riser
 * you can already reach, plus a hop to the far riser if you're standing on a
 * skybridge. Stairs run past sealed floors — you simply can't get off there.
 */
export function reachableLevels(dungeon: HdbDungeon): number[] {
  const cur = dungeon.currentLevel;
  const ids = new Set(risersAt(dungeon, cur).map((r) => r.id));

  // A skybridge lets you step across to whatever the neighbouring run serves.
  for (const b of dungeon.skybridges) {
    if (b.level !== cur) continue;
    for (const id of b.risers) ids.add(id);
  }

  const out = new Set<number>();
  for (const r of dungeon.risers) {
    if (!ids.has(r.id)) continue;
    for (let l = r.bottom; l <= r.top; l++) {
      if (l !== cur && isOpen(dungeon, l)) out.add(l);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Sealed floors you could attack from where you stand: the stairs get you to
 * the landing, the landing just doesn't open. Only some seals give at all.
 */
export function forceableLevels(dungeon: HdbDungeon): number[] {
  const cur = dungeon.currentLevel;
  const ids = new Set(risersAt(dungeon, cur).map((r) => r.id));
  for (const b of dungeon.skybridges) {
    if (b.level === cur) for (const id of b.risers) ids.add(id);
  }

  const out: number[] = [];
  for (const r of dungeon.risers) {
    if (!ids.has(r.id)) continue;
    for (let l = r.bottom; l <= r.top; l++) {
      const seal = dungeon.floors[l - 1]?.sealed;
      if (seal?.breakable && !out.includes(l)) out.push(l);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Open a forced landing and give the floor its rooms. */
export function openSealedFloor(
  rng: Rng,
  dungeon: HdbDungeon,
  level: number,
  archetype: HdbArchetype,
): HdbDungeon {
  return {
    ...dungeon,
    floors: dungeon.floors.map((f) =>
      f.level !== level
        ? f
        : {
            ...f,
            sealed: null,
            units: buildUnits(rng, f.level, f.layoutType, archetype),
          },
    ),
  };
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
