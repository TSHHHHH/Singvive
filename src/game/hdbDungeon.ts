import type { Attributes, LocationState, PoiCategory } from './types';
import type { Rng } from './rng';
import type { IconName } from '../icons/keys';

/**
 * A vertical, push-your-luck dungeon layered over an HDB block. Everything here
 * is pure: the store owns the live instance and applies the deltas.
 *
 * Layout is a stack of landing strips: each open landing is a row of doors with
 * its own heat. Sealed spans are scenery. You take the stairs straight to any
 * landing; going down rolls a descent check on every landing you cross.
 */

export type HdbArchetype = 'estate' | 'shelter';

/**
 * Door payoff type — labels match one plain effect. Entry state (open / locked /
 * …) is the separate risk/time dial and lives on the context card, not the door face.
 */
export type HdbUnitType =
  | 'flat'
  | 'stocked'
  | 'trapped'
  | 'storeroom'
  | 'pantry'
  | 'holdout'
  | 'burning'
  | 'nest'
  | 'den'
  | 'shelter'
  | 'notice';

export type HdbUnitVerb =
  | 'search'
  | 'hazard'
  | 'burn'
  | 'fight'
  | 'service'
  | 'rest'
  | 'intel';

export type HdbUnitState = 'unexplored' | 'scouted' | 'breached' | 'cleared';

/** How the door stands. Player-facing English for `ajar` is "half-open". */
export type HdbEntry = 'open' | 'ajar' | 'locked' | 'barricaded';

export interface HdbUnitMeta {
  label: string;
  /** One-sentence effect — shown on Room-tile hover. */
  blurb: string;
  icon: IconName;
  verb: HdbUnitVerb;
  /** Loot table for a search clear; null = service / rest / intel. */
  lootTable: PoiCategory | null;
  /** Added to entry + height loot mods. */
  lootMod: number;
  /** Breach may wound before the fight/loot roll. */
  trapped: boolean;
  /** Multiplier on heat-based door encounter odds. */
  encounterMod?: number;
  /** HP charged on each sequential search reveal. */
  searchHp?: number;
  /** Fight doors: guaranteed elite instead of a pack. */
  fightElite?: boolean;
}

export const UNIT_META: Record<HdbUnitType, HdbUnitMeta> = {
  flat: {
    label: 'Flat',
    blurb: 'Ordinary household scrap.',
    icon: 'hdb.unit',
    verb: 'search',
    lootTable: 'residential',
    lootMod: 0,
    trapped: false,
  },
  stocked: {
    label: 'Stocked',
    blurb: 'Still has something worth taking.',
    icon: 'hdb.stocked',
    verb: 'search',
    lootTable: 'residential',
    lootMod: 2,
    trapped: false,
  },
  trapped: {
    label: 'Trapped',
    blurb: 'Something nasty by the door — risk a wound to loot.',
    icon: 'hdb.hazard',
    verb: 'hazard',
    lootTable: 'residential',
    lootMod: 1,
    trapped: true,
  },
  storeroom: {
    label: 'Storeroom',
    blurb: 'Tools and parts.',
    icon: 'hdb.storeroom',
    verb: 'search',
    lootTable: 'hardware',
    lootMod: 0,
    trapped: false,
  },
  pantry: {
    label: 'Pantry',
    blurb: 'Food and water.',
    icon: 'hdb.pantry',
    verb: 'search',
    lootTable: 'convenience',
    lootMod: 0,
    trapped: false,
  },
  holdout: {
    label: 'Holdout',
    blurb: 'Survivors still use this unit — one service, then done.',
    icon: 'hdb.service',
    verb: 'service',
    lootTable: null,
    lootMod: 0,
    trapped: false,
  },
  burning: {
    label: 'Burning',
    blurb: 'Each find costs health — leave when you cannot take more.',
    icon: 'hdb.burning',
    verb: 'burn',
    lootTable: 'residential',
    lootMod: 1,
    trapped: false,
    encounterMod: 0.45,
    searchHp: 4,
  },
  nest: {
    label: 'Nest',
    blurb: 'A pack is in there. Fight, then a thin haul.',
    icon: 'hdb.nest',
    verb: 'fight',
    lootTable: 'residential',
    lootMod: 0,
    trapped: false,
  },
  den: {
    label: 'Den',
    blurb: 'Something bigger nested here. Fight it for a fat haul.',
    icon: 'hdb.den',
    verb: 'fight',
    lootTable: 'residential',
    lootMod: 3,
    trapped: false,
    fightElite: true,
  },
  shelter: {
    label: 'Shelter',
    blurb: 'Empty household shelter — hole up and the block cools a little.',
    icon: 'hdb.shelter',
    verb: 'rest',
    lootTable: null,
    lootMod: 0,
    trapped: false,
  },
  notice: {
    label: 'Notice',
    blurb: 'RC board — read it for a nearby site.',
    icon: 'hdb.notice',
    verb: 'intel',
    lootTable: null,
    lootMod: 0,
    trapped: false,
  },
};

export const LOCKPICK_ID = 'lockpick';
export const PICK_DC = 12;
export const PICK_MINUTES = 8;
export const FOB_MINUTES = 1;
export const SHELTER_HEAT_DROP = 20;
export const SHELTER_HOURS = 4;
export const BURNING_SEARCH_HP = 4;
export const CROWBAR_FORCE_MULT = 0.7;
export const CORRIDOR_WALK_MS = 250;
export const STAIR_WALK_MS = 450;

/** Old save strings → current unit types. */
const LEGACY_UNIT_TYPE: Record<string, HdbUnitType> = {
  residential: 'flat',
  corner_unit: 'stocked',
  hazard: 'trapped',
  shelter_service: 'holdout',
};

export function migrateHdbUnitType(type: string): HdbUnitType {
  if (type in UNIT_META) return type as HdbUnitType;
  return LEGACY_UNIT_TYPE[type] ?? 'flat';
}

/** Fields the maze model carried; stripped on conversion. */
interface LegacyMazeFields {
  stairs?: unknown;
  stripWidth?: unknown;
  unitColumns?: unknown;
  blocks?: Record<string, { kind?: string; open?: boolean }>;
}

/**
 * Bring any persisted cutaway up to the strip model: legacy unit types, and a
 * maze save (no `v: 2`) loses its stair / blockade geometry and starts back on
 * the ground landing. Doors, heat and fobs carry over.
 */
export function migrateHdbDungeon(dungeon: HdbDungeon): HdbDungeon {
  const typed = migrateHdbUnits(dungeon);
  if (typed.v === 2) return typed;
  const { stairs: _s, stripWidth: _w, unitColumns: _c, blocks, ...rest } =
    typed as HdbDungeon & LegacyMazeFields;
  // Old roof stairs were always gated: an opened gate means the hatch is open.
  const roofOpen = blocks
    ? Object.values(blocks).some((b) => b?.kind === 'gate' && b.open === true)
    : false;
  // Gate fobs all become the one roof fob.
  const floors = rest.floors.map((f) => ({
    ...f,
    heatLevel: Math.max(0, Math.min(HEAT_MAX, f.heatLevel ?? 0)),
    units: f.units.map((u) => (u.holdsKey ? { ...u, holdsKey: ROOF_FOB } : u)),
  }));
  const draft: HdbDungeon = {
    ...rest,
    floors,
    v: 2,
    pos: { level: 1 },
    currentLevel: 1,
    revealedLevels: rest.revealedLevels?.length ? rest.revealedLevels : [1],
    visited: rest.visited?.length ? rest.visited : [1],
    moveSeq: rest.moveSeq ?? 0,
    keys: rest.keys?.length ? [ROOF_FOB] : [],
    roofOpen,
    blockHeat: 0,
  };
  return { ...draft, blockHeat: peakHeat(draft) };
}

function migrateHdbUnits(dungeon: HdbDungeon): HdbDungeon {
  return {
    ...dungeon,
    floors: dungeon.floors.map((floor) => ({
      ...floor,
      units: floor.units.map((unit) => {
        const type = migrateHdbUnitType(String(unit.type));
        const raw = unit.scoutedInfo as
          | (HdbScoutInfo & { hazardType?: string; readRoom?: boolean })
          | undefined;
        const scoutedInfo = raw
          ? {
              threatCount: raw.threatCount,
              lootQuality: raw.lootQuality,
              ...(raw.containerCategory ? { containerCategory: raw.containerCategory } : {}),
            }
          : undefined;
        return { ...unit, type, scoutedInfo };
      }),
    })),
  };
}

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
    label: 'half-open',
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


/** What a shelter's occupied units offer instead of loot. */
export type ShelterService = 'trader' | 'field_doctor' | 'safe_bunk';

export interface HdbScoutInfo {
  /**
   * Corridor perception read. −1 = unread (HUD shows an estimate band).
   * ≥0 = known: HUD shows the exact encounter %. 0 also softens the roll
   * (quiet room) in {@link breachOutcome}.
   */
  threatCount: number;
  lootQuality: string;
  /** Category hint from a dexterous read of the doorway. */
  containerCategory?: string;
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
  /** Set on holdouts — the service this unit runs. */
  service?: ShelterService;
  /** Fob found when this unit is cleared (the roof hatch takes it). */
  holdsKey?: string;
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
  /** Row index in the compact stack (1 = ground). Paths, blocks and heat key off this. */
  level: number;
  /** Real storey number shown on the label. Absent on old saves = `level`. */
  storey?: number;
  /** Sealed rows only: the real storeys this row stands in for. */
  span?: [number, number];
  /** Mid landings only. */
  theme?: HdbFloorTheme;
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
  /** Top storey deck — water tanks, drying, illegal hut. */
  roof?: boolean;
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
  /** Rows in the compact stack (landings plus sealed span rows). */
  height: number;
  /** Real storeys of the block. Absent on old saves (one row per storey) = `height`. */
  realStoreys?: number;
  floors: HdbFloor[];
  /** Ground-storey massing — void deck, half-and-half, or flats at grade. */
  groundKind: HdbGroundKind;
  /** The landing the survivor is standing on. */
  pos: HdbPos;
  /** Mirror of pos.level — kept for existing call sites. */
  currentLevel: number;
  /** Floors whose doors/layout the player has seen. */
  revealedLevels: number[];
  /**
   * Peak of the per-landing heat (`HdbFloor.heatLevel`). Derived, but written
   * on every change so the site card, the exit leak and old readers stay cheap.
   */
  blockHeat: number;
  /** Levels the player has actually stood on. */
  visited: number[];
  /** Counts every stair trip. Folded into the rng key so a retry never repeats a roll. */
  moveSeq: number;
  /** Fobs collected this crawl (block keys, not pack items). Only the roof hatch takes one. */
  keys?: string[];
  /** The roof hatch on the landing below the roof has been opened. */
  roofOpen?: boolean;
  /** Strip model marker. Saves without it are converted by {@link migrateHdbDungeon}. */
  v?: 2;
}

/** Where the survivor stands: a landing (row index, 1 = ground). */
export interface HdbPos {
  level: number;
}

/** Fob id for the roof hatch. */
export const ROOF_FOB = 'fob:roof';
/** Forcing the roof hatch: loud, slow, and the landings either side hear it. */
export const ROOF_HATCH_HEAT = 12;
export const ROOF_HATCH_MINUTES = 20;
export const ROOF_HATCH_NOISE = 280;

/** How tall a block can run, and how much of it is ever walkable. */
export const MIN_HEIGHT = 10;
export const MAX_HEIGHT = 16;
export const MIN_OPEN_FLOORS = 5;
export const MAX_OPEN_FLOORS = 8;

// ------------------------------------------------------------- block heat --

/**
 * Heat is a charge per landing. Only the player's own noise raises it, and a
 * loud act spills a share into the landings directly above and below. Landings
 * you are not on cool slowly with the clock ({@link COOL_PER_HOUR}).
 */
export const HEAT_MAX = 100;

/** Odds a landing at Swarm puts something in your way (doors and stairs). */
export const HUNT_ELITE_CHANCE = 0.8;

/** Heat the noisier things cost, for sources that aren't a door. */
export const FIGHT_HEAT = 18;
export const HAZARD_HEAT = 10;

/** Share of a loud act's heat each neighbouring landing picks up. */
export const SPILL = {
  door: 0,
  barricade: 0.35,
  trap: 0.25,
  fight: 0.5,
  hatch: 0.5,
} as const;

/** Heat a landing you're not standing on loses per game hour. */
export const COOL_PER_HOUR = 5;

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

/** If adding `heat` would cross into a higher band, that band; else null. */
export function heatBandAfter(heat: number, add: number): HeatBand | null {
  const before = heatBand(heat);
  const after = heatBand(heat + add);
  return after.at > before.at ? after : null;
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
    note: 'The stairwell is watched.',
    threatBonus: 1,
    dcStep: 1,
  },
  {
    at: 45,
    label: 'Awake',
    note: 'This landing is up. Its doors and stairs are worse.',
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
    note: 'They have this landing. Climb or get out.',
    threatBonus: 3,
    dcStep: 4,
  },
];

export function heatBand(heat: number): HeatBand {
  let band = HEAT_BANDS[0];
  for (const b of HEAT_BANDS) if (heat >= b.at) band = b;
  return band;
}

/** Some landing is pinned at Swarm — the site card and the exit leak read this. */
export function isHunting(dungeon: HdbDungeon): boolean {
  return peakHeat(dungeon) >= HEAT_MAX;
}

/** Heat on one landing (0..HEAT_MAX). */
export function levelHeat(dungeon: HdbDungeon, level: number): number {
  return Math.min(HEAT_MAX, dungeon.floors[level - 1]?.heatLevel ?? 0);
}

export function levelBand(dungeon: HdbDungeon, level: number): HeatBand {
  return heatBand(levelHeat(dungeon, level));
}

/** This landing is pinned: every door and the stairs onto it likely cost a fight. */
export function levelHunting(dungeon: HdbDungeon, level: number): boolean {
  return levelHeat(dungeon, level) >= HEAT_MAX;
}

/** Hottest landing in the block. */
export function peakHeat(dungeon: HdbDungeon): number {
  let peak = 0;
  for (const f of dungeon.floors) if (!f.sealed) peak = Math.max(peak, f.heatLevel);
  return Math.min(HEAT_MAX, peak);
}

/** Minutes each action inside the block costs. */
export const BREACH_MINUTES = 15;
/** Minutes per real storey on the stairs (pack on, dark, careful). ~45 s. */
export const STAIR_MINUTES = 0.75;

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

type FloorKind = 'ground' | 'normal' | 'roof';

/**
 * A mid landing's identity. Variety comes from landings that differ, not from
 * more doors of the same kind — a tall block never adds landings past the cap.
 */
export type HdbFloorTheme = 'ordinary' | 'holdout' | 'fire' | 'nest' | 'picked_over' | 'refuge';

export interface HdbThemeMeta {
  label: string;
  /** One-line effect for the chip tooltip. */
  blurb: string;
  /** Log line on first arrival. */
  reveal: string;
  icon: IconName;
  /** Multiplier on door encounter odds for every door on the landing. */
  encounterMod: number;
  /** Added to the loot mod of every door on the landing. */
  lootMod: number;
  /** One door of this type is guaranteed on the landing. */
  promises?: HdbUnitType;
  /** Stair hunts never ambush on the way onto this landing. */
  safeStairs?: boolean;
}

export const THEME_META: Record<HdbFloorTheme, HdbThemeMeta> = {
  ordinary: {
    label: 'Landing',
    blurb: 'Nothing special about this one.',
    reveal: 'An ordinary landing.',
    icon: 'hdb.unit',
    encounterMod: 1,
    lootMod: 0,
  },
  holdout: {
    label: 'Holdout',
    blurb: 'Survivors keep this landing. Doors are calmer here.',
    reveal: 'Someone has strung wire across this corridor. People live here.',
    icon: 'hdb.service',
    encounterMod: 0.7,
    lootMod: 0,
    promises: 'holdout',
  },
  fire: {
    label: 'Fire floor',
    blurb: 'Burning units, better finds, health on every search.',
    reveal: 'Smoke rolls along the ceiling. Something on this landing is still burning.',
    icon: 'hdb.burning',
    encounterMod: 1,
    lootMod: 1,
    promises: 'burning',
  },
  nest: {
    label: 'Nest',
    blurb: 'Packs den here. One unit is still stocked.',
    reveal: 'The smell hits first. This landing belongs to them.',
    icon: 'hdb.nest',
    encounterMod: 1.3,
    lootMod: 0,
    promises: 'stocked',
  },
  picked_over: {
    label: 'Picked over',
    blurb: 'Most doors already kicked in. One notice left.',
    reveal: 'Doors hang off their hinges. Someone got here first.',
    icon: 'hdb.notice',
    encounterMod: 0.8,
    lootMod: -1,
    promises: 'notice',
  },
  refuge: {
    label: 'Refuge floor',
    blurb: 'Open deck, safe stairs, somewhere to rest.',
    reveal: 'The refuge floor: open to the wind, sightlines both ways.',
    icon: 'hdb.shelter',
    encounterMod: 0.5,
    lootMod: 0,
    promises: 'shelter',
    safeStairs: true,
  },
};

/** Door mix per theme; `ordinary` falls back to the archetype weights. */
const THEME_WEIGHTS: Partial<Record<HdbFloorTheme, readonly (readonly [HdbUnitType, number])[]>> = {
  holdout: [
    ['holdout', 30],
    ['flat', 20],
    ['shelter', 14],
    ['pantry', 12],
    ['notice', 8],
    ['storeroom', 8],
    ['trapped', 4],
    ['nest', 2],
    ['den', 2],
  ],
  fire: [
    ['burning', 40],
    ['flat', 15],
    ['trapped', 15],
    ['stocked', 12],
    ['storeroom', 10],
    ['nest', 4],
    ['den', 4],
  ],
  nest: [
    ['nest', 30],
    ['den', 20],
    ['flat', 18],
    ['trapped', 10],
    ['storeroom', 8],
    ['pantry', 8],
    ['stocked', 6],
  ],
  picked_over: [
    ['flat', 50],
    ['pantry', 10],
    ['trapped', 8],
    ['storeroom', 6],
    ['nest', 4],
  ],
  refuge: [
    ['shelter', 40],
    ['holdout', 20],
    ['pantry', 20],
    ['storeroom', 20],
  ],
};

/** Leaving a hunting block leaks noise onto the street. */
export const HDB_LEAK_RADIUS_M = 350;
export const HDB_LEAK_INTENSITY = 1;

/** Metres per HDB storey when reading a basemap building height. */
export const STOREY_M = 2.8;
export const MIN_REAL_STOREYS = 3;
export const MAX_REAL_STOREYS = 50;
/** Only towers this tall get a refuge floor (as real HDB blocks do). */
export const REFUGE_MIN_STOREYS = 20;

/** A refuge floor is an open deck: one or two units, not a corridor of doors. */
function refugeSlots(rng: Rng, slots: number[]): number[] {
  if (slots.length <= 2) return slots;
  const keep = rng.int(1, 2);
  const start = rng.int(0, slots.length - keep);
  return slots.slice(start, start + keep);
}

const WALK_IN: ReadonlySet<HdbUnitType> = new Set(['holdout', 'notice', 'nest']);
const MUST_BREACH: ReadonlySet<HdbUnitType> = new Set([
  'stocked',
  'storeroom',
  'trapped',
  'burning',
  'shelter',
  'den',
]);

function unitTypeWeights(
  archetype: HdbArchetype,
  kind: FloorKind,
): readonly (readonly [HdbUnitType, number])[] {
  if (kind === 'roof') {
    return [
      ['storeroom', 40],
      ['nest', 22],
      ['stocked', 14],
      ['burning', 10],
      ['trapped', 8],
      ['den', 6],
    ] as const;
  }
  if (archetype === 'shelter') {
    if (kind === 'ground') {
      return [
        ['holdout', 24],
        ['flat', 18],
        ['notice', 14],
        ['storeroom', 10],
        ['pantry', 8],
        ['shelter', 8],
        ['trapped', 6],
        ['burning', 4],
        ['nest', 4],
        ['stocked', 3],
        ['den', 1],
      ] as const;
    }
    return [
      ['holdout', 24],
      ['flat', 22],
      ['storeroom', 10],
      ['shelter', 8],
      ['pantry', 8],
      ['trapped', 8],
      ['burning', 6],
      ['nest', 5],
      ['stocked', 3],
      ['den', 2],
      ['notice', 2],
    ] as const;
  }
  if (kind === 'ground') {
    return [
      ['flat', 24],
      ['notice', 14],
      ['trapped', 12],
      ['storeroom', 10],
      ['burning', 8],
      ['shelter', 8],
      ['pantry', 6],
      ['nest', 6],
      ['holdout', 4],
      ['stocked', 4],
      ['den', 4],
    ] as const;
  }
  return [
    ['flat', 30],
    ['trapped', 12],
    ['storeroom', 10],
    ['burning', 10],
    ['shelter', 8],
    ['nest', 7],
    ['pantry', 6],
    ['holdout', 4],
    ['notice', 2],
    ['stocked', 4],
    ['den', 4],
  ] as const;
}

function roofSlots(rng: Rng, slots: number[]): number[] {
  if (slots.length <= 2) return slots;
  const keep = rng.int(2, Math.min(4, slots.length));
  const start = rng.int(0, slots.length - keep);
  return slots.slice(start, start + keep);
}

/** Rooms on a full landing: a slab corridor runs longer than a point block's lift lobby. */
function roomSlots(rng: Rng, layoutType: HdbFloor['layoutType']): number[] {
  const n = layoutType === 'slab' ? rng.int(4, 6) : rng.int(3, 4);
  return Array.from({ length: n }, (_, i) => i);
}

function rollGroundKind(rng: Rng): HdbGroundKind {
  // Weighted toward the classic open void deck Singaporeans picture first.
  const r = rng.next();
  if (r < 0.5) return 'void_open';
  if (r < 0.8) return 'void_partial';
  return 'enclosed';
}

/**
 * Which room slots get flats on the ground storey. Open void = none; partial
 * keeps a contiguous run (lobby / shop side) and leaves the rest as pillars.
 */
function groundSlots(
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

/** Walkable landings for a block of this many real storeys (ground and roof included). */
export function landingRange(storeys: number): [number, number] {
  let range: [number, number];
  if (storeys <= 5) range = [3, 4];
  else if (storeys <= 12) range = [4, 6];
  else if (storeys <= 20) range = [5, 7];
  else range = [MIN_OPEN_FLOORS + 1, MAX_OPEN_FLOORS];
  return [Math.min(range[0], storeys), Math.min(range[1], storeys)];
}

/** Real storeys from a basemap roof height (metres). Null when the roof isn't known. */
export function storeysFromRoof(roofM: number | null | undefined): number | null {
  if (!roofM || !Number.isFinite(roofM) || roofM <= 0) return null;
  return Math.max(MIN_REAL_STOREYS, Math.min(MAX_REAL_STOREYS, Math.round(roofM / STOREY_M)));
}

/**
 * Deal one theme per mid landing from a deck without repeats. Only `ordinary`
 * appears twice; a refuge floor exists only in towers tall enough to need one.
 */
function dealThemes(rng: Rng, count: number, storeys: number): HdbFloorTheme[] {
  const specials: HdbFloorTheme[] = ['holdout', 'fire', 'nest', 'picked_over'];
  if (storeys >= REFUGE_MIN_STOREYS) specials.push('refuge');
  const deck = rng.shuffle([...specials, 'ordinary', 'ordinary'] as HdbFloorTheme[]);
  return Array.from({ length: count }, (_, i) => deck[i] ?? 'ordinary');
}

function rollSeal(rng: Rng): HdbSeal {
  const kind = rng.chance(0.58)
    ? rng.pick(['collapsed', 'flooded'] as const)
    : rng.pick(['welded', 'burnt'] as const);
  return { kind };
}

export interface GenerateDungeonOpts {
  /** Real storeys of the block on the map; absent = seeded fallback. */
  storeys?: number | null;
}

/**
 * Build the block. Real height sets the scale, not the amount of content:
 * `floors[]` is a compact stack of rows — capped walkable landings, with one
 * sealed row standing in for each run of dead storeys between two landings.
 */
export function generateDungeon(
  rng: Rng,
  loc: LocationState,
  archetype: HdbArchetype,
  opts: GenerateDungeonOpts = {},
): HdbDungeon {
  const layoutType: HdbFloor['layoutType'] = rng.chance(0.6) ? 'slab' : 'point';
  const realStoreys =
    opts.storeys && opts.storeys >= 1
      ? Math.max(MIN_REAL_STOREYS, Math.min(MAX_REAL_STOREYS, Math.round(opts.storeys)))
      : rng.int(MIN_HEIGHT, MAX_HEIGHT);
  const slots = roomSlots(rng.fork('strip'), layoutType);
  const groundKind = rollGroundKind(rng.fork('ground'));
  const groundCols = groundSlots(rng.fork('groundCols'), groundKind, slots);

  // Ground and roof are always landings; mid landings are a seeded pick of real storeys.
  const oRng = rng.fork('open');
  const [minL, maxL] = landingRange(realStoreys);
  const landingCount = oRng.int(minL, maxL);
  const midPool = oRng.shuffle(
    Array.from({ length: Math.max(0, realStoreys - 2) }, (_, i) => i + 2),
  );
  const landingStoreys = [
    1,
    ...midPool.slice(0, Math.max(0, landingCount - 2)).sort((a, b) => a - b),
    realStoreys,
  ];
  const themes = dealThemes(rng.fork('themes'), Math.max(0, landingStoreys.length - 2), realStoreys);

  // Rows: each landing, plus one sealed span row for every gap between two landings.
  type RowPlan = { storey: number; span?: [number, number]; theme?: HdbFloorTheme };
  const rows: RowPlan[] = [];
  landingStoreys.forEach((storey, i) => {
    if (i > 0) {
      const prev = landingStoreys[i - 1];
      if (storey - prev > 1) rows.push({ storey: prev + 1, span: [prev + 1, storey - 1] });
    }
    const isMid = i > 0 && i < landingStoreys.length - 1;
    rows.push({ storey, ...(isMid ? { theme: themes[i - 1] } : {}) });
  });

  const height = rows.length;
  const floors: HdbFloor[] = [];
  const roofCols = roofSlots(rng.fork('roofCols'), slots);

  rows.forEach((row, idx) => {
    const level = idx + 1;
    const fRng = rng.fork(`floor:${level}`);
    const isRoof = level === height;
    if (row.span) {
      // Flavour only — sealed storeys never open.
      floors.push({
        level,
        storey: row.storey,
        span: row.span,
        layoutType,
        heatLevel: 0,
        sealed: rollSeal(fRng),
        units: [],
      });
      return;
    }

    const kind: FloorKind = level === 1 ? 'ground' : isRoof ? 'roof' : 'normal';
    let cols = level === 1 ? groundCols : isRoof ? roofCols : slots;
    if (row.theme === 'refuge') cols = refugeSlots(fRng.fork('refugeCols'), cols);
    const units = cols.length
      ? buildUnits(fRng, level, row.storey, archetype, cols, kind, row.theme)
      : [];

    floors.push({
      level,
      storey: row.storey,
      layoutType,
      heatLevel: 0,
      sealed: null,
      units,
      ...(row.theme ? { theme: row.theme } : {}),
      ...(level === 1 ? { groundKind } : {}),
      ...(isRoof ? { roof: true } : {}),
    });
  });

  hideRoofFob(rng.fork('blocks'), floors);
  return {
    v: 2,
    locationId: loc.id,
    name: loc.name,
    archetype,
    baseDanger: Math.max(1, Math.round(loc.currentDanger)),
    height,
    realStoreys,
    floors,
    groundKind,
    pos: { level: 1 },
    currentLevel: 1,
    revealedLevels: [1],
    blockHeat: 0,
    visited: [1],
    moveSeq: 0,
    keys: [],
  };
}

/**
 * Most blocks leave the roof hatch's fob behind one door on a landing below
 * the roof. Mutates the freshly built floors (generation only).
 */
function hideRoofFob(rng: Rng, floors: HdbFloor[]): void {
  if (!rng.chance(0.6)) return;
  const candidates = floors
    .filter((f) => !f.sealed && !f.roof)
    .flatMap((f) => f.units.filter((u) => u.available && !u.service));
  if (candidates.length === 0) return;
  candidates[rng.int(0, candidates.length - 1)].holdsKey = ROOF_FOB;
}

export function isLevelRevealed(dungeon: HdbDungeon, level: number): boolean {
  return dungeon.revealedLevels.includes(level);
}

/**
 * Walk-in types hang open; must-breach types never do; estate flats/pantries
 * are mixed but usually locked.
 */
function rollEntry(rng: Rng, type: HdbUnitType, archetype: HdbArchetype): HdbEntry {
  if (WALK_IN.has(type)) {
    return rng.chance(0.65) ? 'open' : 'ajar';
  }
  const r = rng.next();
  if (MUST_BREACH.has(type)) {
    return r < 0.6 ? 'locked' : 'barricaded';
  }
  // Flat / pantry: lived-in shelter blocks keep a few more doors hanging.
  if (archetype === 'shelter') {
    if (r < 0.4) return 'open';
    if (r < 0.6) return 'ajar';
    if (r < 0.85) return 'locked';
    return 'barricaded';
  }
  if (r < 0.2) return 'open';
  if (r < 0.35) return 'ajar';
  if (r < 0.75) return 'locked';
  return 'barricaded';
}

function rollAvailable(rng: Rng, type: HdbUnitType): boolean {
  if (type === 'holdout' || type === 'notice') return true;
  if (MUST_BREACH.has(type)) return rng.chance(0.85);
  return rng.chance(0.8);
}

function buildUnits(
  rng: Rng,
  level: number,
  realStorey: number,
  archetype: HdbArchetype,
  unitColumns: number[],
  kind: FloorKind,
  theme?: HdbFloorTheme,
): HdbUnitNode[] {
  const units: HdbUnitNode[] = [];
  const n = unitColumns.length;
  const stack = rng.int(1, 6) * 100;
  const base = stack + rng.int(1, 40);
  const storey = String(realStorey).padStart(2, '0');
  const weights = (theme && THEME_WEIGHTS[theme]) || unitTypeWeights(archetype, kind);
  // Themed landings promise one door of their kind; it lands on a seeded slot.
  const promised = theme ? THEME_META[theme].promises : undefined;
  const promisedAt = promised ? rng.int(0, n - 1) : -1;

  for (let i = 0; i < n; i++) {
    const column = unitColumns[i];
    const type = i === promisedAt && promised ? promised : rng.weighted(weights);
    let available = rollAvailable(rng, type);
    // Picked-over landings: most doors are already kicked in and stripped.
    if (theme === 'picked_over' && i !== promisedAt && rng.chance(0.5)) available = false;
    if (i === promisedAt) available = true;
    const unit: HdbUnitNode = {
      id: `L${level}-c${column}`,
      type,
      state: 'unexplored',
      column,
      label: `#${storey}-${base + i}`,
      available,
      entry: 'open',
      ...(type === 'holdout' ? { service: rng.pick(SERVICES) } : {}),
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
export function floorThreat(dungeon: HdbDungeon, level: number): number {
  const band = levelBand(dungeon, level);
  const high = storeyOf(dungeon, level) > (realStoreysOf(dungeon) * 2) / 3;
  const raw = dungeon.baseDanger + band.threatBonus + (high && band.threatBonus >= 1 ? 1 : 0);
  return Math.max(0, Math.min(5, raw));
}

/**
 * Heat-forward base for door encounter odds (before entry-type multiplier).
 * Continuous heat plus band steps so every point on the gauge matters.
 */
export function heatEncounterBase(dungeon: HdbDungeon, level: number): number {
  const heat = levelHeat(dungeon, level);
  const frac = Math.min(1, heat / HEAT_MAX);
  const band = heatBand(heat).threatBonus;
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
 * The sweep you make stepping onto a floor: Perception pins encounter odds,
 * Dexterity peeks at containers. Room type is always visible on the door face.
 */
export function scoutFloor(
  rng: Rng,
  attrs: Attributes,
  dungeon: HdbDungeon,
  level: number,
  senseBonus = 0,
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

        if (uRng.chance(Math.min(0.95, senseChance(attrs.perception) + senseBonus))) {
          const threat = floorThreat(dungeon, floor.level);
          info.threatCount = Math.max(0, Math.round(threat / 2) + uRng.int(-1, 1));
        }
        if (uRng.chance(Math.min(0.95, senseChance(attrs.dexterity) + senseBonus))) {
          if (unit.holdsKey) {
            info.containerCategory = 'Fob';
          } else {
            info.containerCategory = uRng.pick(CONTAINER_CATEGORIES);
          }
          info.lootQuality =
            unit.type === 'stocked'
              ? LOOT_QUALITY[Math.min(3, 2 + uRng.int(0, 1))]
              : uRng.pick(LOOT_QUALITY);
        }

        const readAnything = info.threatCount >= 0 || !!info.containerCategory;
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
  /** True when the unit type risks a wound on entry. */
  trapped: boolean;
  /** Sequential-search HP tax (burning rooms). */
  searchHp: number;
}

/** What getting through this door is likely to cost and yield. */
export function breachOutcome(
  dungeon: HdbDungeon,
  unit: HdbUnitNode,
  level: number,
): BreachOutcome {
  const meta = ENTRY_META[unit.entry];
  const unitMeta = UNIT_META[unit.type];
  const known = unit.scoutedInfo;
  const typeEnc = unitMeta.encounterMod ?? 1;
  const theme = dungeon.floors[level - 1]?.theme;
  const themeMeta = theme ? THEME_META[theme] : null;
  const base =
    heatEncounterBase(dungeon, level) * meta.encounterMod * typeEnc * (themeMeta?.encounterMod ?? 1);
  const encounterChance = Math.max(
    0.02,
    Math.min(0.9, known && known.threatCount === 0 ? base * 0.35 : base),
  );
  const roofBonus = dungeon.floors[level - 1]?.roof ? 2 : 0;
  const lootMod =
    unitMeta.lootMod +
    meta.lootMod +
    Math.floor((level - 1) / 2) +
    roofBonus +
    (themeMeta?.lootMod ?? 0);
  return {
    encounterChance,
    lootMod,
    heat: meta.heat,
    noise: meta.noise,
    dangerBoost: meta.dangerBoost,
    minutes: meta.minutes,
    trapped: unitMeta.trapped,
    searchHp: unitMeta.searchHp ?? 0,
  };
}

/** Trait + crowbar adjustments for a loud door or corridor smash. */
export function scaleDoorCost(
  minutes: number,
  heat: number,
  opts: { heatMult: number; minutesMult: number; crowbar: boolean },
): { minutes: number; heat: number } {
  let m = minutes * (1 + opts.minutesMult);
  let h = heat * (1 + opts.heatMult);
  if (opts.crowbar) {
    m *= CROWBAR_FORCE_MULT;
    if (heat > 0) h *= CROWBAR_FORCE_MULT;
  }
  return { minutes: Math.max(1, m), heat: Math.max(0, Math.round(h)) };
}

export function pickCheck(
  rng: Rng,
  dexterity: number,
  pickMod: number,
): { roll: number; total: number; dc: number; success: boolean } {
  const roll = rng.d20();
  const total = roll + dexterity + pickMod;
  const dc = PICK_DC;
  return { roll, total, dc, success: roll === 20 || total >= dc };
}

/** True once Perception read the doorway well enough to pin encounter odds. */
export function encounterChanceKnown(unit: HdbUnitNode | null | undefined): boolean {
  return !!unit?.scoutedInfo && unit.scoutedInfo.threatCount >= 0;
}

export interface EncounterChanceReadout {
  /** Exact % (when known) or the midpoint the range is built around. */
  pct: number;
  /** Player-facing string: `6%` or `4–10%`. */
  label: string;
  exact: boolean;
  lo?: number;
  hi?: number;
}

/**
 * HUD copy for door encounter odds. A successful perception check shows the
 * true percentage; otherwise a deterministic band around the real chance so
 * the player still has a usable estimate without a free exact read.
 */
export function encounterChanceReadout(
  chance: number,
  known: boolean,
): EncounterChanceReadout {
  const pct = Math.round(Math.max(0.02, Math.min(0.9, chance)) * 100);
  if (known) return { pct, label: `${pct}%`, exact: true };
  // Wider at mid odds; clamped so the band always reads as a range.
  const half = Math.max(3, Math.min(12, Math.round(4 + pct * 0.08)));
  const lo = Math.max(1, pct - half);
  const hi = Math.min(90, Math.max(lo + 1, pct + half));
  return { pct, label: `${lo}–${hi}%`, exact: false, lo, hi };
}

/** The DC for walking back down. Exported so the HUD can show it before you commit. */
export function retreatDc(dungeon: HdbDungeon, level: number): number {
  return 8 + levelBand(dungeon, level).dcStep * 2;
}

/** The parts that add up to floorThreat, for a HUD that has to explain itself. */
export function threatBreakdown(dungeon: HdbDungeon, level: number) {
  return {
    base: dungeon.baseDanger,
    heat: levelBand(dungeon, level).threatBonus,
    total: floorThreat(dungeon, level),
  };
}

/**
 * Exact fail rate for the descent check (d20 + Dex + End vs DC; nat 20 always
 * succeeds). Exported so stair tooltips can preview the odds before you commit.
 */
export function retreatFailChance(
  attrs: Attributes,
  dungeon: HdbDungeon,
  level: number,
  dcMod = 0,
): number {
  const dc = retreatDc(dungeon, level) + dcMod;
  const mod = attrs.dexterity + attrs.endurance;
  let fails = 0;
  for (let roll = 1; roll <= 20; roll++) {
    if (roll === 20) continue;
    if (roll + mod < dc) fails += 1;
  }
  return fails / 20;
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
export function retreatCheck(
  rng: Rng,
  attrs: Attributes,
  dungeon: HdbDungeon,
  level: number,
  dcMod = 0,
): RetreatCheck {
  const roll = rng.d20();
  const total = roll + attrs.dexterity + attrs.endurance;
  const dc = retreatDc(dungeon, level) + dcMod;
  return { roll, total, dc, success: roll === 20 || total >= dc };
}

/** A floor you can actually stand on. */
export function isOpen(dungeon: HdbDungeon, level: number): boolean {
  return dungeon.floors[level - 1]?.sealed === null;
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

/** Real storey number of a row (old saves: the row itself). */
export function storeyOf(dungeon: HdbDungeon, level: number): number {
  return dungeon.floors[level - 1]?.storey ?? level;
}

export function realStoreysOf(dungeon: HdbDungeon): number {
  return dungeon.realStoreys ?? storeyOf(dungeon, dungeon.height);
}

/** Two-digit storey label for a row: "07", or "08–11" for a sealed span. */
export function storeyLabel(dungeon: HdbDungeon, level: number): string {
  const f = dungeon.floors[level - 1];
  const pad = (n: number) => String(n).padStart(2, '0');
  if (f?.span && f.span[0] !== f.span[1]) return `${pad(f.span[0])}–${pad(f.span[1])}`;
  return pad(storeyOf(dungeon, level));
}

/** Real storeys sealed off in the whole block. */
export function sealedStoreys(dungeon: HdbDungeon): number {
  let n = 0;
  for (const f of dungeon.floors) {
    if (!f.sealed) continue;
    n += f.span ? f.span[1] - f.span[0] + 1 : 1;
  }
  return n;
}

/** Real storeys one row stands for (1 unless it is a sealed span). */
export function rowStoreys(floor: HdbFloor): number {
  return floor.span ? floor.span[1] - floor.span[0] + 1 : 1;
}

/** Walkable landings in the block (rows that are not sealed). */
export function landingCount(dungeon: HdbDungeon): number {
  return dungeon.floors.filter((f) => !f.sealed).length;
}

/** Landings you have swept or stood on. */
export function revealedLandings(dungeon: HdbDungeon): number {
  return dungeon.revealedLevels.filter((l) => !dungeon.floors[l - 1]?.sealed).length;
}

/** Stair hunts skip the way onto this landing (refuge floors). */
export function isSafeLanding(dungeon: HdbDungeon, level: number): boolean {
  const theme = dungeon.floors[level - 1]?.theme;
  return !!theme && !!THEME_META[theme].safeStairs;
}

export interface HdbScar {
  /** Doors you can still open, ever. */
  doors: number;
  cleared: number;
  /** 0..1 of `doors` that are done. */
  clearedFrac: number;
  sealedStoreys: number;
  realStoreys: number;
  hunting: boolean;
}

/** What a worked block shows on the map and its site card. Pure, from the saved cutaway. */
export function hdbScar(dungeon: HdbDungeon): HdbScar {
  let doors = 0;
  let cleared = 0;
  for (const f of dungeon.floors) {
    if (f.sealed) continue;
    for (const u of f.units) {
      if (!u.available) continue;
      doors += 1;
      if (u.state === 'cleared') cleared += 1;
    }
  }
  return {
    doors,
    cleared,
    clearedFrac: doors ? cleared / doors : 0,
    sealedStoreys: sealedStoreys(dungeon),
    realStoreys: realStoreysOf(dungeon),
    hunting: isHunting(dungeon),
  };
}

/** Stand on a landing: position, mirror, visited and revealed all follow. */
export function moveTo(dungeon: HdbDungeon, level: number): HdbDungeon {
  return {
    ...dungeon,
    pos: { level },
    currentLevel: level,
    visited: dungeon.visited.includes(level) ? dungeon.visited : [...dungeon.visited, level],
    revealedLevels: dungeon.revealedLevels.includes(level)
      ? dungeon.revealedLevels
      : [...dungeon.revealedLevels, level],
  };
}

export interface StairCrossing {
  level: number;
  band: HeatBand;
  /** Going down: the descent check is rolled on this landing. */
  descent: boolean;
  /** Pinned at Swarm and not a refuge: the elite ambush can trigger here. */
  hunt: boolean;
}

export interface TravelPlan {
  minutes: number;
  /** Open landings passed (excluding `from`), ending with the destination. */
  crossings: StairCrossing[];
}

/**
 * The stair trip between two landings. Down is the risk: every landing crossed
 * (and the one you stop on) rolls the descent check against its own heat. Any
 * Swarm landing on the way can ambush, in either direction.
 */
export function travelPlan(
  dungeon: HdbDungeon,
  from: number,
  to: number,
  stairMult = 1,
): TravelPlan {
  const storeys = Math.abs(storeyOf(dungeon, to) - storeyOf(dungeon, from));
  const minutes = storeys * STAIR_MINUTES * stairMult;
  const crossings: StairCrossing[] = [];
  if (from === to) return { minutes: 0, crossings };
  const dir: 1 | -1 = to > from ? 1 : -1;
  for (let l = from + dir; dir > 0 ? l <= to : l >= to; l += dir) {
    if (!isOpen(dungeon, l)) continue;
    crossings.push({
      level: l,
      band: levelBand(dungeon, l),
      descent: dir < 0,
      hunt: levelHunting(dungeon, l) && !isSafeLanding(dungeon, l),
    });
  }
  return { minutes, crossings };
}

/** Odds the whole trip goes through without a fight (descent fails + hunts). */
export function travelClearChance(
  attrs: Attributes,
  dungeon: HdbDungeon,
  plan: TravelPlan,
  dcMod = 0,
): number {
  let ok = 1;
  for (const c of plan.crossings) {
    if (c.hunt) ok *= 1 - HUNT_ELITE_CHANCE;
    if (c.descent) ok *= 1 - retreatFailChance(attrs, dungeon, c.level, dcMod);
  }
  return ok;
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

function withHeat(dungeon: HdbDungeon, floors: HdbFloor[]): HdbDungeon {
  const next = { ...dungeon, floors };
  return { ...next, blockHeat: peakHeat(next) };
}

/**
 * Heat a landing. `spill` (0..1) is the share each neighbouring open landing
 * picks up — loud acts carry up and down the stairwell. Capped at HEAT_MAX.
 */
export function addHeat(
  dungeon: HdbDungeon,
  amount: number,
  level: number,
  spill = 0,
): HdbDungeon {
  if (amount <= 0) return dungeon;
  const above = spill > 0 ? nextOpenLevel(dungeon, level, 1) : null;
  const below = spill > 0 ? nextOpenLevel(dungeon, level, -1) : null;
  const side = Math.round(amount * spill);
  const floors = dungeon.floors.map((f) => {
    const add = f.level === level ? amount : f.level === above || f.level === below ? side : 0;
    return add > 0 ? { ...f, heatLevel: Math.min(HEAT_MAX, f.heatLevel + add) } : f;
  });
  return withHeat(dungeon, floors);
}

/** Lower one landing's heat (shelter rest). Floor 0. */
export function dropHeat(dungeon: HdbDungeon, amount: number, level: number): HdbDungeon {
  if (amount <= 0) return dungeon;
  const floors = dungeon.floors.map((f) =>
    f.level === level ? { ...f, heatLevel: Math.max(0, f.heatLevel - amount) } : f,
  );
  return withHeat(dungeon, floors);
}

/** Halve every landing (re-entry after time away). */
export function halveHeat(dungeon: HdbDungeon): HdbDungeon {
  const floors = dungeon.floors.map((f) =>
    f.heatLevel > 0 ? { ...f, heatLevel: Math.floor(f.heatLevel / 2) } : f,
  );
  return withHeat(dungeon, floors);
}

/**
 * Landings you're not on settle by {@link COOL_PER_HOUR}. Fractions are kept
 * so short actions add up. Returns the same object when nothing changes.
 */
export function coolLevels(dungeon: HdbDungeon, minutes: number, here: number): HdbDungeon {
  const drop = (COOL_PER_HOUR * minutes) / 60;
  if (drop <= 0) return dungeon;
  let changed = false;
  const floors = dungeon.floors.map((f) => {
    if (f.level === here || f.heatLevel <= 0) return f;
    changed = true;
    return { ...f, heatLevel: Math.max(0, f.heatLevel - drop) };
  });
  return changed ? withHeat(dungeon, floors) : dungeon;
}

export function hasFob(dungeon: HdbDungeon, keyId: string | undefined): boolean {
  return !!keyId && (dungeon.keys ?? []).includes(keyId);
}

export function grantFob(dungeon: HdbDungeon, keyId: string): HdbDungeon {
  if ((dungeon.keys ?? []).includes(keyId)) return dungeon;
  return { ...dungeon, keys: [...(dungeon.keys ?? []), keyId] };
}

/** Saved in the strip model (no maze geometry). */
export function isStripModel(dungeon: HdbDungeon | null | undefined): boolean {
  return dungeon?.v === 2;
}

/** The open landing directly below the roof — where the hatch is. */
export function roofHatchLevel(dungeon: HdbDungeon): number | null {
  if (!isOpen(dungeon, dungeon.height)) return null;
  return nextOpenLevel(dungeon, dungeon.height, -1);
}

/** Can the stairs take you onto this landing from where you stand? */
export function canTravelTo(dungeon: HdbDungeon, level: number): boolean {
  if (level === dungeon.pos.level || !isOpen(dungeon, level)) return false;
  if (level === dungeon.height && dungeon.floors[level - 1]?.roof) return !!dungeon.roofOpen;
  return true;
}

/** Ground storey with open pillar bays (full or partial void deck). */
export function isVoidDeckFloor(floor: HdbFloor): boolean {
  return floor.level === 1 && (floor.groundKind === 'void_open' || floor.groundKind === 'void_partial');
}

export function isRoofFloor(floor: HdbFloor): boolean {
  return !!floor.roof;
}

