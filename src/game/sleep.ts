import type { PoiCategory } from './types';
import type { HdbGroundKind } from './hdbDungeon';
import { HAZARD_CONFIG, type HazardZone } from './wilds';

/** Walls & doors vs open air / void deck. */
export type EnclosedLevel = 'none' | 'partial' | 'full';
/** Sky cover. */
export type RoofLevel = 'none' | 'yes';
/** Sleeping instrument vs floor/dirt. */
export type BedLevel = 'ground' | 'bed';

export const SLEEPING_BAG_ID = 'sleeping_bag';

/** Per-factor recovery multipliers — product is `SleepConditions.recoveryMult`. */
export const ENCLOSED_MULT: Record<EnclosedLevel, number> = {
  none: 0.55,
  partial: 0.8,
  full: 1,
};

export const ROOF_MULT: Record<RoofLevel, number> = {
  none: 0.7,
  yes: 1,
};

export const BED_MULT: Record<BedLevel, number> = {
  ground: 0.75,
  bed: 1,
};

/** Categories that are roofed but not fully enclosed. */
const PARTIAL_ENCLOSED: ReadonlySet<PoiCategory> = new Set([
  'foodcourt',
  'waypoint',
  'fuel',
]);

export interface SleepContext {
  currentPositionId: string | null;
  category: PoiCategory | null;
  /** Active HDB cutaway, if inside a block. */
  hdb: { groundKind: HdbGroundKind; currentLevel: number } | null;
  /** Faction bunk / tunnel mat / HDB safe bunk. */
  serviceBed?: boolean;
  hasSleepingBag: boolean;
  /** Tunnel settlement rest path. */
  inTunnelCamp?: boolean;
}

export interface SleepAmbush {
  /** Floor chance before trek risk is considered. */
  floor: number;
  /** Multiplier on trek encounter chance. */
  riskScale: number;
}

export interface SleepConditions {
  enclosed: EnclosedLevel;
  roof: RoofLevel;
  bed: BedLevel;
  /** Applied to sleep energy gain (not final meter). */
  recoveryMult: number;
  /** Null ⇒ no night encounter roll. */
  ambush: SleepAmbush | null;
  /** Short line for the log / Rest preview. */
  summary: string;
  /** Why ambush/recovery moved — shown on the Rest tip. */
  occupancyNotes: string[];
  floodSleep: boolean;
  collapseSleep: boolean;
}

/** Ideal night (full walls, roof, bed) — used by service beds. */
export function idealSleepConditions(): SleepConditions {
  return finalize('full', 'yes', 'bed');
}

function finalize(
  enclosed: EnclosedLevel,
  roof: RoofLevel,
  bed: BedLevel,
): SleepConditions {
  const recoveryMult =
    ENCLOSED_MULT[enclosed] * ROOF_MULT[roof] * BED_MULT[bed];
  return {
    enclosed,
    roof,
    bed,
    recoveryMult,
    ambush: ambushFor(enclosed, roof, bed),
    summary: summarize(enclosed, roof, bed),
    occupancyNotes: [],
    floodSleep: false,
    collapseSleep: false,
  };
}

function ambushFor(
  enclosed: EnclosedLevel,
  roof: RoofLevel,
  bed: BedLevel,
): SleepAmbush | null {
  if (enclosed === 'full' && bed === 'bed') return null;
  if (enclosed === 'none' && roof === 'none') {
    return { floor: 0.5, riskScale: 1 };
  }
  if (enclosed === 'none' || enclosed === 'partial') {
    return { floor: 0.25, riskScale: 0.85 };
  }
  // Enclosed full, sleeping on the ground — still a crack in the door.
  return { floor: 0.08, riskScale: 0.4 };
}

function summarize(enclosed: EnclosedLevel, roof: RoofLevel, bed: BedLevel): string {
  if (enclosed === 'none' && roof === 'none') {
    return bed === 'bed'
      ? 'Slept in the open, at least in a bag.'
      : 'Slept rough in the open on bare ground.';
  }
  if (enclosed === 'none' || enclosed === 'partial') {
    return bed === 'bed'
      ? 'Slept under a roof with open sides, bag laid out.'
      : 'Slept under a roof on bare floor — sides still open.';
  }
  return bed === 'bed'
    ? 'Slept behind closed walls with a proper place to lie down.'
    : 'Slept behind closed walls on bare floor.';
}

/**
 * Resolve sleep quality from where you are and what you carry.
 * Service beds short-circuit to the ideal tier.
 */
export function evaluateSleepConditions(ctx: SleepContext): SleepConditions {
  if (ctx.serviceBed || ctx.inTunnelCamp) {
    return idealSleepConditions();
  }

  const bed: BedLevel = ctx.hasSleepingBag ? 'bed' : 'ground';

  if (ctx.hdb) {
    const { groundKind, currentLevel } = ctx.hdb;
    if (currentLevel === 1) {
      if (groundKind === 'void_open') return finalize('none', 'yes', bed);
      if (groundKind === 'void_partial') return finalize('partial', 'yes', bed);
      return finalize('full', 'yes', bed);
    }
    return finalize('full', 'yes', bed);
  }

  if (ctx.currentPositionId === null || !ctx.category) {
    return finalize('none', 'none', bed);
  }

  if (PARTIAL_ENCLOSED.has(ctx.category)) {
    return finalize('partial', 'yes', bed);
  }

  // Shops, flats pin, MRT, schools, etc. — four walls and a roof.
  return finalize('full', 'yes', bed);
}

/** Scale a full `sleepRestore` result by condition quality. */
export function applySleepRecovery(
  currentEnergy: number,
  fullRestored: number,
  recoveryMult: number,
): number {
  const gain = fullRestored - currentEnergy;
  return Math.max(0, Math.min(100, Math.round(currentEnergy + gain * recoveryMult)));
}

/** Final ambush chance for a generic Rest night. */
export function sleepAmbushChance(
  ambush: SleepAmbush | null,
  trekEncounterChance: number,
): number {
  if (!ambush) return 0;
  return Math.max(ambush.floor, trekEncounterChance * ambush.riskScale);
}

/**
 * Day pockets and open-street night swarm reshape rest. A roofed site is
 * Neville's house — night swarm does not punch through walls.
 */
export function applySleepOccupancy(
  conditions: SleepConditions,
  pockets: HazardZone[],
): SleepConditions {
  if (conditions.enclosed === 'full' && conditions.bed === 'bed' && pockets.length === 0) {
    return conditions;
  }

  const roofedShelter = conditions.roof === 'yes' && conditions.enclosed !== 'none';
  let recoveryMult = conditions.recoveryMult;
  let ambush = conditions.ambush;
  const notes = [...conditions.occupancyNotes];
  let floodSleep = conditions.floodSleep;
  let collapseSleep = conditions.collapseSleep;

  const bumpAmbush = (floor: number, riskScale: number, note: string) => {
    notes.push(note);
    if (!ambush) {
      ambush = { floor, riskScale };
      return;
    }
    ambush = {
      floor: Math.max(ambush.floor, floor),
      riskScale: Math.max(ambush.riskScale, riskScale),
    };
  };

  for (const z of pockets) {
    if (z.kind === 'night_swarm') {
      if (roofedShelter) {
        notes.push('Night swarm in the street — walls hold.');
      } else {
        bumpAmbush(0.75, 1.15, HAZARD_CONFIG.night_swarm.blurb);
      }
      continue;
    }
    if (z.kind === 'horde_pocket' || z.kind === 'gang_patrol' || z.kind.startsWith('wildlife')) {
      const floor = conditions.enclosed === 'full' ? 0.12 + z.severity * 0.04 : 0.28 + z.severity * 0.08;
      const note =
        z.kind === 'horde_pocket'
          ? 'You lie down in a horde pocket. They are close enough to smell.'
          : z.kind === 'gang_patrol'
            ? 'Claimed ground. Someone is still walking it tonight.'
            : 'Whatever claimed this stretch does not sleep.';
      bumpAmbush(floor, conditions.enclosed === 'full' ? 0.55 : 1, note);
      continue;
    }
    if (z.kind === 'floodwater') {
      recoveryMult *= 0.82;
      floodSleep = true;
      notes.push('Damp ground — sleep comes harder.');
      continue;
    }
    if (z.kind === 'collapse') {
      collapseSleep = true;
      notes.push('Unstable slabs under the bedroll.');
    }
  }

  return { ...conditions, recoveryMult, ambush, occupancyNotes: notes, floodSleep, collapseSleep };
}

export interface RestPreview {
  conditions: SleepConditions;
  ambushChance: number;
  infectionDelta: number;
  collapseWound: boolean;
}

/** Combine occupancy-adjusted conditions with the night trek roll. */
export function restAmbushPreview(
  conditions: SleepConditions,
  nightTrekEncounterChance: number,
): RestPreview {
  const infectionDelta = conditions.floodSleep ? 4 : 0;
  const collapseWound = conditions.collapseSleep;
  return {
    conditions,
    ambushChance: sleepAmbushChance(conditions.ambush, nightTrekEncounterChance),
    infectionDelta,
    collapseWound,
  };
}

export const ENCLOSED_LABEL: Record<EnclosedLevel, string> = {
  none: 'Open',
  partial: 'Partial',
  full: 'Enclosed',
};

export const ROOF_LABEL: Record<RoofLevel, string> = {
  none: 'No roof',
  yes: 'Roofed',
};

export const BED_LABEL: Record<BedLevel, string> = {
  ground: 'Ground',
  bed: 'Bed',
};
