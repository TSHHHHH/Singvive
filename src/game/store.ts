import { create } from 'zustand';
import type {
  BodyParts,
  Character,
  CombatState,
  Equipment,
  EquipSlot,
  FactionId,
  GameLogEntry,
  GamePhase,
  HighScore,
  ItemInstance,
  LocationState,
  Meters,
  RunStats,
  StanceId,
  TerrainId,
  Enemy,
} from './types';
import { emptyRunStats, normalizeRunStats } from './stats';
import { Rng, randomSeed } from './rng';
import { adjustCraftInputs, attrEmoji, ATTRIBUTE_LABELS, hasTraitFlag, maxHpFor, startingStanding, sumTraitMod } from './character';
import { fetchOsmPois, haversine, type RawPoi } from './overpass';
import { bakedPoisNear } from './bakedPois';
import {
  ensureZonesLoaded,
  filterWalkablePois,
  unplayableMessage,
  walkabilityOf,
} from './playable';
import { NO_DRY_ROUTE_MSG, routeLandPath } from './route';
import { adjacentEdge, displayLine, getMrtNetwork, loadMrtNetwork, tunnelSegmentBetween } from './mrt';
import {
  addPressure,
  currentNode,
  FIGHT_PRESSURE,
  generateTunnelRun,
  HAZARD_META,
  HAZARD_PRESSURE,
  hazardDc,
  isArrival,
  markDone,
  nodeThreat,
  PRESSURE_MAX,
  REST_PRESSURE_RELIEF,
  reachable,
  SCAVENGE_PRESSURE,
  stepTo,
  TUNNEL_NODE_META,
  tunnelKey,
  type TunnelNode,
  type TunnelRun,
} from './tunnelRun';
import { buildLocations, generateFallbackWorld, makeStationLocation } from './world';
import { conditionRoll, itemDef, ITEMS, rollFactionRaidLoot, rollLoot, type LootStack } from './loot';
import {
  addToGrid,
  canPlace,
  canEquip,
  canTearForRags,
  coerceEquipment,
  conditionOf,
  degrade,
  emptyEquipment,
  equipEncounterChanceMod,
  equipSearchSpeedBonus,
  equipSpeedBonus,
  equipTravelSpeedFactor,
  findSlot,
  footprint,
  isBroken,
  isEncumbered,
  limbArmorForZone,
  newUid,
  OWN_CLOTHES_TEARS,
  TEAR_CONDITION_COST,
  TEAR_HOURS,
  TEAR_RAGS_YIELD,
  repair as repairInstance,
  setBackpackWidthBonus,
  slotForZone,
  spoil,
  statusResistForZone,
  tierLabel,
  tierOf,
  totalLootValue,
} from './inventory';
import {
  abortChargeSpent,
  buildSearchSession,
  ensureSearching,
  hasFoggedOrSearching,
  prioritizeSlot,
  tryReveal,
  searchSpeedFactor,
  type SearchSession,
} from './searchSession';
import {
  canCraft,
  countOf,
  FIELD_REPAIRS,
  RECIPES,
  REPAIR_AMOUNT,
  REPAIR_HOURS,
  REPAIR_INPUTS,
  REPAIR_TOOL,
} from './crafting';
import {
  applyPartDamage,
  applyWound,
  armCombatPenalty,
  checkDeath,
  clampMeter,
  computeScore,
  computeEvacBonus,
  DEATH_TEXT,
  HOURS_PER_DAY,
  initialBodyParts,
  initialMeters,
  legTravelFactor,
  sleepRestore,
  STARVING_THRESHOLD,
  START_HOUR,
  bleedEncounterMod,
  tickInjuries,
  tickMeters,
  migrateBodyParts,
  rollHitZone,
  migrateMeters,
  tickSystemicDamage,
  totalHp,
  treatInjuries,
  type DeathCause,
} from './survival';
import {
  rollWeather,
  timeOfDay,
  weatherEncounterMod,
  weatherEnergyMult,
  weatherThirstMult,
} from './weather';
import { snapshot, travelableRange, VISITED_LIGHT_RADIUS, type ExploredCircle } from './fog';
import { estimateExpedition, estimateTunnelWalk, searchMinutes } from './travel';
import {
  makeBlockHunter,
  makeHuman,
  makeLoner,
  makeTunnelStalker,
  type LonerKind,
  makeZombie,
  playerCombatStats,
  resolvePlayerAction,
  resolveEnemyAction,
  openingNotes,
  playerSpeed,
  GAUGE_FULL,
  COMBAT_SPEEDS,
  attemptFlee,
  terrainForCategory,
  TERRAIN,
  STANCES,
} from './combat';
import {
  ENEMIES,
  rollHumanDrop,
  rollLonerDrop,
} from './enemies';
import {
  EVENT_COOLDOWN_HOURS,
  EVENT_MAX_PER_DAY,
  clampStanding,
  emptyStanding,
  isTerminal,
  mrtTollEvent,
  rollCheck,
  dcFor,
  STANDING_TRUSTED,
  rollFactionGateEvent,
  rollPreScavengeEvent,
  type DoorwayMark,
  type EventEffect,
  type FactionStanding,
  type GameEvent,
} from './events';
import {
  addHighScore,
  clearRun,
  loadHighScores,
  loadRun,
  saveRun,
  type SavedRun,
} from './storage';
import { POI_CONFIG } from './poi';
import {
  FACTION_CONFIG,
  applyFactionServices,
  factionOffersAid,
  factionSharesIntel,
  factionShelters,
  factionTrades,
  hasFactionClearance,
  isOutpostSite,
  locationServices,
  migrateOutposts,
  pickOutposts,
  standingLabel,
  STANDING_KNOWN,
  type OutpostIds,
} from './factions';
import { traderBoard, traderGreeting, type TraderState } from './trade';
import { flavor } from './flavor';
import {
  trekRisk,
  HAZARD_CONFIG,
  EXPOSED_SLEEP_MIN_RISK,
  EXPOSED_SLEEP_RECOVERY,
  TREK_LIGHT_RADIUS,
  TREK_MIN_DISTANCE_M,
  type HazardKind,
  type HazardZone,
} from './wilds';
import {
  addHeat,
  scoutFloor,
  breachOutcome,
  currentFloor,
  descentIsChecked,
  forceableLevels,
  generateDungeon,
  openSealedFloor,
  floorThreat,
  isHunting,
  retreatCheck,
  findPath,
  pathMinutes,
  pathDescends,
  pathUsesStairs,
  moveTo,
  canTargetCell,
  samePos,
  posKey,
  clearBlock,
  adjacentBreakableBlocks,
  BLOCK_META,
  FIGHT_HEAT,
  HAZARD_HEAT,
  HUNT_ELITE_CHANCE,
  STAIR_MINUTES,
  updateUnit,
  hasStripTopology,
  type HdbArchetype,
  type HdbDungeon,
  type HdbPos,
} from './hdbDungeon';
import {
  applyPulse,
  decayBoosts,
  effectiveDanger,
  emitNoisePulse,
  prunePulses,
  type NoisePulse,
} from './noise';
import {
  GHOST_RADIUS,
  ghostBoss,
  ghostDrops,
  loadLegacyRun,
  rollGhostEncounter,
  rollGhostTrade,
  saveLegacyRun,
} from './ghostSurvivor';
import {
  EVAC_SCORE_BONUS,
  HORDE_MAX,
  HORDE_PER_DAY,
  hasEvacReadiness,
  hordeIntensity,
  EVAC_ISLAND_RADIUS,
  pickDistantEvacPoi,
  pickEvacZone,
  rollEvacCooldown,
  pickNextEvacZone,
  evacWindowHours,
} from './goal';

const SCAVENGE_RADIUS = 1500;
const DANGER_DEPLETE = 0.7;
const REGEN_PER_DAY = { small: 0.6, medium: 1.2, large: 2.4 };

/**
 * ~1 km cells for on-demand world expansion. Smaller than SCAVENGE_RADIUS so
 * neighbouring expands overlap; walking ~1 km into fresh ground pulls a new
 * 1.5 km neighbourhood from the bake without redoing the same centre twice.
 */
const EXPAND_CELL_DEG = 0.009;

/** Stable grid key for `expandedCells` / RNG fork tags. */
function expandCellKey(lat: number, lng: number): string {
  return `${Math.round(lat / EXPAND_CELL_DEG)},${Math.round(lng / EXPAND_CELL_DEG)}`;
}


/** Re-exported so existing call sites keep importing it from the store. */
export type { GameLogEntry } from './types';

/**
 * How many timeline entries a run keeps. The timeline itself only ever renders
 * the current day; everything older lives in the Day Logs archive, so this is a
 * runaway-growth guard rather than a display limit — it's deliberately far
 * beyond what a full run produces.
 */
const LOG_CAP = 4000;

interface PendingEvent {
  locationId: string;
  event: GameEvent;
  /** Set when the event is the turnstile standing between you and a tunnel. */
  tunnelTo?: string;
}

/** @see GameStore._eventClock */
export interface EventClock {
  /** Absolute in-game hour of the last doorway event, or null if none yet. */
  lastAt: number | null;
  /** The day `count` refers to. */
  day: number;
  count: number;
}

const freshEventClock = (): EventClock => ({ lastAt: null, day: 1, count: 0 });

/**
 * A saved tunnel run is only worth resuming if it still has a graph. Anything
 * written by an older shape is dropped instead of migrated — the player is
 * still standing on the departure platform either way, so backing out of the
 * tunnel costs them the time they already spent and nothing else.
 */
function resumableTunnel(saved: TunnelRun | null | undefined): TunnelRun | null {
  if (!saved?.nodes || !saved.columns?.length || typeof saved.seq !== 'number') return null;
  return saved;
}

/** In-flight walking animation along a land route. Purely visual — the clock has
 *  already advanced; arrival logic fires when the glide finishes. */
export interface TravelAnim {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  /** Waypoints including endpoints (length ≥ 2). Glide follows this polyline. */
  path: { lat: number; lng: number }[];
  /** null when striking out into open ground rather than to a known site. */
  toId: string | null;
  startedAt: number; // Date.now() when the glide began
  durationMs: number;
}

interface State {
  phase: GamePhase;

  character: Character | null;
  seed: string;
  spawn: { lat: number; lng: number; name: string } | null;

  locations: Record<string, LocationState>;
  currentPositionId: string | null; // location id you're standing at (null = raw spawn)
  currentPos: { lat: number; lng: number };
  worldLoading: boolean;
  worldError: string | null;
  usedFallback: boolean;
  travelAnim: TravelAnim | null;
  /**
   * Which ~1 km bake cells have already been materialised into `locations`.
   * Stops trek/travel from re-running buildLocations on ground you've already
   * pulled in; persisted so a reload doesn't redo the same work.
   */
  expandedCells: string[];

  // extraction goal + doom clock
  hordeLevel: number; // 0..HORDE_MAX; rises each day
  evacZoneId: string | null; // the location you must reach to escape
  evacDeadline: number | null; // absolute game-hour the current evac departs
  /**
   * Absolute game-hour the next window gets staged, while the channel is dark.
   * Non-null only between a missed evac and its replacement.
   */
  evacCooldownUntil: number | null;
  escaped: boolean; // true on a victory ending

  maxHp: number; // base max HP; effective max is reduced by injuries
  meters: Meters;
  bodyParts: BodyParts;
  day: number;
  hour: number;

  items: ItemInstance[];
  equipment: Equipment;
  /** Tears left in the clothes on your back — see `tearOwnClothes`. */
  clothingTears: number;
  /**
   * Rounds in the magazine. One pool rather than per-weapon, because the run
   * only ever carries one firearm and a second number would be bookkeeping
   * without a decision attached.
   */
  rounds: number;
  kills: number;
  /** Display-only run counters — see stats.ts. */
  stats: RunStats;
  exploredArea: ExploredCircle[];

  combat: CombatState | null;
  _combatRng: Rng | null;

  /** The HDB block you're currently inside, if any. */
  hdb: HdbDungeon | null;
  /** Every block you've been inside, keyed by location — cleared stays cleared. */
  hdbBlocks: Record<string, HdbDungeon>;

  /**
   * The tunnel segment you're currently walking, if any. Deliberately NOT
   * cached per segment the way blocks are: a bore you've memorised isn't a
   * crawl any more, so every trip generates fresh.
   */
  tunnel: TunnelRun | null;
  /** Bumped per run, folded into the run id — the same trip twice isn't a replay. */
  tunnelSeq: number;
  /** The one swap the camp you're standing in will offer. @see ghostOffer */
  tunnelOffer: { kind: 'trader'; wantDefId: string; giveDefId: string } | null;
  /** Live noise rings for the map to draw. */
  noisePulses: NoisePulse[];
  /** A predecessor's ghost waiting to be resolved at this spot. */
  ghostOffer: { kind: 'trader'; wantDefId: string; giveDefId: string } | null;

  pendingEvent: PendingEvent | null;
  _eventRng: Rng | null;
  /**
   * Live sequential search in the timeline. Runtime-only — not written to the
   * save; a reload mid-search abandons unrevealed slots (found items stay in
   * their `search:` container and are cleaned up on resume).
   */
  pendingSearch: SearchSession | null;
  /**
   * Rate limiter for doorway events: when the last one fired (absolute hours
   * since the run began) and how many have fired today. Keeps encounters rare
   * enough to land as events instead of turnstiles.
   */
  _eventClock: EventClock;
  /**
   * How each faction feels about you, −5…+5. Paying at the gate and behaving
   * at their water points buys goodwill; sneaking, forcing, and refusing tribute
   * spends it. At +2 they wave you through; at −4 even the orderly ones open fire.
   */
  factionStanding: FactionStanding;
  /**
   * Visit-scoped illicit entry: loot by size, no services. Cleared when you
   * leave the site. Null when not raiding.
   */
  raidMode: { locationId: string; mode: 'sneak' | 'force' } | null;
  /**
   * Which site is each faction's outpost — the one place of theirs that is a
   * destination rather than a door. Fixed at world-build and saved with the
   * run, because "walk two kilometres to the Co-op market" is only a plan if
   * the market is still there after a reload.
   */
  outposts: OutpostIds;
  /** The counter you're currently standing at, with today's board. */
  trader: TraderState | null;
  /**
   * Swaps already taken, keyed `factionId:day`. Lives outside `trader` so that
   * walking out of the market and back in doesn't restock the board — the
   * chalked lines are the day's stock, not a shop's shelves.
   */
  traderTaken: Record<string, string[]>;

  log: GameLogEntry[];

  deathCause: DeathCause;
  finalScore: number;
  highScores: HighScore[];
  hasSavedRun: boolean;

  // actions
  goToCharacter: () => void;
  commitCharacter: (c: Character) => void;
  setSpawn: (spawn: { lat: number; lng: number; name: string }) => Promise<'ok' | 'remote' | 'unplayable'>;
  travel: (locationId: string) => void;
  /** Step inside the site you're standing at — the doorway, then the search. */
  enter: () => void;
  /** Dexterity check to slip past the gate into raid mode. */
  sneakEnter: () => void;
  /** Draw steel at the gate — fight into raid mode. */
  forceEnter: () => void;
  /** Search while illicitly inside a faction site (sneak check or guaranteed fight). */
  raidSearch: () => void;
  /** Strike out to bare coordinates — no site, no loot, no shelter. */
  trek: (lat: number, lng: number) => void;
  /**
   * Descend and walk the tunnel to the next station down the line, named by its
   * network station id. The destination need not be part of the built world —
   * the tunnels reach past the edge of it, and the far end is built on arrival.
   */
  tunnelEnter: (toStationId: string) => void;
  /** Move onto one of the nodes ahead and deal with whatever is on it. */
  tunnelStep: (nodeId: string) => void;
  /** Sleep at the tunnel camp you're standing in. */
  tunnelRest: () => void;
  /** Have the camp look at your injuries, for a tin of food. */
  tunnelTreat: () => void;
  tunnelAcceptOffer: () => void;
  tunnelDeclineOffer: () => void;
  /** Step up to a faction counter. No-op unless the site offers trade. */
  openTrader: (locationId: string) => void;
  closeTrader: () => void;
  /** Take one of the swaps chalked up on the board. */
  acceptTrade: (offerId: string) => void;
  /** Sleep behind faction wire — safe, and it costs nothing but time. */
  outpostRest: () => void;
  /** Field aid at a site that offers it (Trusted+). Once per day. */
  factionAid: () => void;
  /** Intel / rumor at a site that offers it (Known+). Once per day. */
  factionIntel: () => void;
  resolveEvent: (choiceId: string) => void;
  /** Advance the active sequential search (RAF from the timeline UI). */
  tickSearch: () => void;
  /** Click a fogged cell to search it next. */
  prioritizeSearchSlot: (slotId: string) => void;
  /** Move one found item from the search grid into the pack (stash overflow). */
  takeSearchItem: (uid: string) => void;
  /** Take every found item still in the search grid. */
  takeAllFound: () => void;
  /** Abandon unsearched slots; keep finds; spend a partial search charge. */
  abortSearch: () => void;
  /** Finish after all slots are searched (or treat as abort if fogged remain). */
  completeSearch: () => void;
  callEvac: () => void;
  /** Append a short line to the run log (UI soft-rejects, etc.). */
  notify: (text: string, tone?: GameLogEntry['tone']) => void;
  rest: () => void;
  useItem: (uid: string) => void;
  moveItem: (uid: string, container: string, x: number, y: number, rotated: boolean) => boolean;
  rotateItem: (uid: string) => void;
  transferItem: (uid: string, toContainer: string) => void;
  equipItem: (uid: string, slot: keyof Equipment) => void;
  unequipItem: (slot: keyof Equipment) => void;
  /** Put an item down for good. The only way to shed weight without a stash. */
  dropItem: (uid: string) => void;
  /** Run a recipe from `crafting.ts`, consuming its inputs. */
  craftItem: (recipeId: string) => void;
  /**
   * Patch up one worn instance, carried or equipped. `materialDefId` picks the
   * route: a full workbench repair, or a whetstone/gun oil in the field.
   */
  repairItem: (uid: string, materialDefId?: string) => void;
  /**
   * Cut up a piece of clothing — worn or carried — for rags. The bottom of the
   * bleeding economy: you are always wearing something, so there is always a
   * way to stop a bleed, and it is never free. It costs the garment.
   */
  tearForRags: (uid: string) => void;
  /**
   * Cut down the clothes you are actually wearing. The guarantee at the very
   * bottom: no loot, no garment in the pack, still not out of options. Finite
   * (`clothingTears`) so it is a lifeline and not a rag farm.
   */
  tearOwnClothes: () => void;

  /** Advance the initiative track by `dtSeconds` of fight time. */
  combatTick: (dtSeconds: number) => void;
  /** Freeze / unfreeze the track mid-fight. */
  combatTogglePause: () => void;
  /** Pick a playback rate from COMBAT_SPEEDS. */
  combatSetSpeedIndex: (i: number) => void;
  combatFlee: () => void;
  combatContinue: () => void;
  /** Commit a stance once — the fight then resolves itself. */
  combatSetStance: (stance: StanceId) => void;
  combatBreakOff: () => void;

  // --- HDB vertical dungeon ---
  hdbEnter: () => void;
  hdbBreach: (unitId: string) => void;
  /** Auto-path to a cutaway cell (maze + fog rules). */
  hdbGoTo: (pos: HdbPos) => void;
  /** Clear a breakable corridor / stair block underfoot. */
  hdbForceBlock: (key: string) => void;
  /** Dig out a breakable sealed landing so the floor can be entered. */
  hdbForceSeal: (level: number) => void;
  hdbUseService: (unitId: string) => void;
  hdbLeave: () => void;

  // --- noise & legacy ---
  emitNoise: (lat: number, lng: number, radiusMeters: number, intensity: number) => void;
  acceptGhostTrade: () => void;
  declineGhostTrade: () => void;

  resetToMenu: () => void;
  continueRun: () => void;
}

let logCounter = 0;

function weatherKindFor(seed: string, day: number) {
  return rollWeather(new Rng(seed), day);
}

/** Absolute hours elapsed since the run began (day 1, START_HOUR = hour 0). */
function totalGameHour(day: number, hour: number): number {
  return (day - 1) * HOURS_PER_DAY + hour;
}

export const useGame = create<State>((set, get) => {
  const pushLog = (
    text: string,
    tone: GameLogEntry['tone'],
    haul?: { loot: LootStack[]; leftover: LootStack[] },
  ) => {
    logCounter += 1;
    const { day, hour } = get();
    set((s) => ({
      log: [
        { id: logCounter, text, tone, day, hour, loot: haul?.loot, leftover: haul?.leftover },
        ...s.log,
      ].slice(0, LOG_CAP),
    }));
  };

  /** Add to the run counters. Every value is a delta, never an absolute. */
  const bumpStats = (delta: Partial<RunStats>) => {
    set((s) => {
      const stats = { ...s.stats };
      for (const k of Object.keys(delta) as (keyof RunStats)[]) {
        stats[k] += delta[k] ?? 0;
      }
      return { stats };
    });
  };

  /**
   * Credit a haul to the run counters. Only what actually fit in the pack
   * counts — what was left on the floor was never looted.
   */
  /** Knowing what a thing is worth is itself a skill — see the Kiasu trait. */
  const lootValueMod = (): number => {
    const c = get().character;
    return c ? sumTraitMod(c.traitIds, 'lootValueMod') : 0;
  };

  const bumpHaul = (loot: LootStack[], leftover: LootStack[]) => {
    const missed = new Map<string, number>();
    for (const st of leftover) missed.set(st.defId, (missed.get(st.defId) ?? 0) + st.count);
    let itemsLooted = 0;
    let lootValue = 0;
    for (const st of loot) {
      const dropped = Math.min(st.count, missed.get(st.defId) ?? 0);
      missed.set(st.defId, (missed.get(st.defId) ?? 0) - dropped);
      const kept = st.count - dropped;
      itemsLooted += kept;
      lootValue += kept * itemDef(st.defId).value;
    }
    lootValue = Math.round(lootValue * (1 + lootValueMod()));
    if (itemsLooted > 0) bumpStats({ itemsLooted, lootValue });
  };

  /**
   * Wear the fight put on your kit. Equipped instances live only in
   * `equipment` — `equipItem` pulls them out of `items` — so this is the only
   * place they need touching.
   *
   * Returns the log lines worth surfacing: a weapon quietly sliding from
   * "Brand New" to "Old & Torn" over thirty rounds is the sort of thing a
   * player should be told about before it fails on them.
   */
  /**
   * Wear gear down after a swing or a connecting hit.
   *
   * Weapon wear always hits mainHand. Armor wear prefers the piece covering
   * the hit zone; other wearables take a light scrape so the rest of the kit
   * still ages in a long fight.
   */
  const applyWear = (
    equipment: Equipment,
    weaponWear: number,
    armorWear: number,
    wearSlot: EquipSlot | null = null,
  ): { equipment: Equipment; notes: string[] } => {
    if (weaponWear <= 0 && armorWear <= 0) return { equipment, notes: [] };
    const next: Equipment = { ...equipment };
    const notes: string[] = [];
    const wearOne = (slot: EquipSlot, amount: number) => {
      const inst = next[slot];
      if (!inst || amount <= 0) return;
      const worn = degrade(inst, amount);
      if (worn === inst) return;
      next[slot] = worn;
      const name = itemDef(inst.defId).name;
      if (isBroken(worn) && !isBroken(inst)) {
        notes.push(`Your ${name} gives out — it needs repairing before it's any use.`);
      } else if (tierOf(worn) !== tierOf(inst)) {
        notes.push(`Your ${name} is ${tierLabel(tierOf(worn)).toLowerCase()}.`);
      }
    };

    if (weaponWear > 0) wearOne('mainHand', weaponWear);

    if (armorWear > 0) {
      if (wearSlot && wearSlot !== 'mainHand') {
        wearOne(wearSlot, armorWear);
        // Light secondary wear on other armour pieces (not weapons / feet focus).
        for (const slot of ['head', 'body', 'hands', 'legs', 'offHand'] as EquipSlot[]) {
          if (slot === wearSlot) continue;
          wearOne(slot, armorWear * 0.15);
        }
      } else {
        for (const slot of ['head', 'body', 'hands', 'legs', 'offHand'] as EquipSlot[]) {
          wearOne(slot, armorWear);
        }
      }
    }
    return { equipment: next, notes };
  };

  /** Combined mobility factor: injuries × footwear × traits. */
  const moveFactor = (s: {
    bodyParts: BodyParts;
    equipment: Equipment;
    character: Character | null;
  }) =>
    legTravelFactor(s.bodyParts) *
    equipTravelSpeedFactor(s.equipment) *
    (1 + sumTraitMod(s.character?.traitIds ?? [], 'travelSpeedMod'));

  // Set by an en-route roll in travel(); consumed on arrival to spring a road
  // ambush before the site can be searched.
  let roadAmbushAt: string | null = null;

  const persist = () => {
    const s = get();
    if (!s.character || !s.spawn || s.phase === 'menu') return;
    const run: SavedRun = {
      character: s.character,
      seed: s.seed,
      spawn: s.spawn,
      locations: s.locations,
      currentPositionId: s.currentPositionId,
      currentPos: s.currentPos,
      equipment: s.equipment,
      bodyParts: s.bodyParts,
      meters: s.meters,
      maxHp: s.maxHp,
      day: s.day,
      hour: s.hour,
      items: s.items,
      rounds: s.rounds,
      clothingTears: s.clothingTears,
      kills: s.kills,
      stats: s.stats,
      log: s.log,
      usedFallback: s.usedFallback,
      exploredArea: s.exploredArea,
      expandedCells: s.expandedCells,
      hordeLevel: s.hordeLevel,
      evacZoneId: s.evacZoneId,
      evacDeadline: s.evacDeadline,
      evacCooldownUntil: s.evacCooldownUntil,
      // Snapshot the block you're standing in too, so a reload keeps it cleared.
      hdbBlocks: s.hdb ? { ...s.hdbBlocks, [s.hdb.locationId]: s.hdb } : s.hdbBlocks,
      // The tunnel is saved live, not as a cache: you are mid-walk, and a
      // reload has to put you back on the same node.
      tunnel: s.tunnel,
      tunnelSeq: s.tunnelSeq,
      // Otherwise a reload would be a free way to reset the doorway cooldown.
      eventClock: s._eventClock,
      factionStanding: s.factionStanding,
      outposts: s.outposts,
      // Not the open counter — the counter is a screen, not a place you can be
      // mid-action. Only which of today's swaps are already spent.
      traderTaken: s.traderTaken,
    };
    saveRun(run);
  };

  const endRun = (cause: Exclude<DeathCause, null>) => {
    const s = get();
    const score = computeScore(
      s.day,
      s.kills,
      Math.round(totalLootValue(s.items) * (1 + lootValueMod())),
    );
    // The body stays where it fell — a later run can come looking.
    saveLegacyRun({
      name: s.character?.name ?? 'Survivor',
      seed: s.seed,
      day: s.day,
      lat: s.currentPos.lat,
      lng: s.currentPos.lng,
      kills: s.kills,
      score,
      cause: DEATH_TEXT[cause],
      maxHp: s.maxHp,
      weaponDefId: s.equipment.mainHand?.defId ?? null,
      armorDefId: s.equipment.body?.defId ?? null,
      date: Date.now(),
    });
    const highScores = addHighScore({
      name: s.character?.name ?? 'Survivor',
      days: s.day,
      score,
      cause: DEATH_TEXT[cause],
      seed: s.seed,
      date: Date.now(),
    });
    clearRun();
    set({
      phase: 'death',
      deathCause: cause,
      finalScore: score,
      escaped: false,
      highScores,
      combat: null,
      _combatRng: null,
      pendingEvent: null,
      pendingSearch: null,
      raidMode: null,
      // Dying underground still ends on the death screen, not behind a map of
      // the tunnel you didn't finish.
      tunnel: null,
      tunnelOffer: null,
      hasSavedRun: false,
    });
  };

  // Successful extraction — the one and only victory ending.
  const winRun = () => {
    const s = get();
    const loot = Math.round(totalLootValue(s.items) * (1 + lootValueMod()));
    const score = computeScore(s.day, s.kills, loot) + computeEvacBonus(s.day, EVAC_SCORE_BONUS);
    const highScores = addHighScore({
      name: s.character?.name ?? 'Survivor',
      days: s.day,
      score,
      cause: 'Escaped Singapore by evac.',
      seed: s.seed,
      date: Date.now(),
    });
    clearRun();
    set({
      phase: 'death',
      deathCause: null,
      finalScore: score,
      escaped: true,
      highScores,
      combat: null,
      _combatRng: null,
      pendingEvent: null,
      pendingSearch: null,
      hasSavedRun: false,
    });
  };

  /**
   * The window closed without you. Command doesn't turn another bird around on
   * the spot — the objective goes dark for a randomised stretch, and the horde
   * climbs through all of it. That dead air is the actual cost of missing one.
   */
  const beginEvacCooldown = () => {
    const s = get();
    const wait = rollEvacCooldown(
      new Rng(s.seed).fork(`evaccool:${totalGameHour(s.day, s.hour)}`),
    );
    set({
      evacZoneId: null,
      evacDeadline: null,
      evacCooldownUntil: totalGameHour(s.day, s.hour) + wait,
    });
    pushLog(
      'The bird lifted off without you. The channel goes quiet — nothing staged, nowhere to be.',
      'bad',
    );
  };

  /** Cooldown elapsed: stage a fresh window, far from wherever you now are. */
  const stageNextEvac = () => {
    const s = get();
    const nextId = pickNextEvacZone(
      Object.values(s.locations),
      s.currentPos.lat,
      s.currentPos.lng,
      s.evacZoneId,
    );
    const windowH = evacWindowHours(false, s.day);
    const deadline = totalGameHour(s.day, s.hour) + windowH;
    set({ evacZoneId: nextId, evacDeadline: deadline, evacCooldownUntil: null });
    const loc = nextId ? s.locations[nextId] : null;
    pushLog(
      loc
        ? `The channel wakes up: "New evac staging at ${loc.name}. ${windowH} hours. Bring weighted gear — fuel, meds, ammo count most. Move."`
        : 'The channel wakes up, but there is nowhere left to stage a lift.',
      loc ? 'good' : 'bad',
    );
  };

  // Advance clock by `hours`: passive meter drain + location danger regen.
  const advanceTime = (hours: number, restedEnergy?: number, sleeping = false): boolean => {
    const s = get();
    const total = s.hour + hours;
    const day = s.day + Math.floor(total / HOURS_PER_DAY);
    const hour = ((total % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;

    // Injuries slowly recover. Minor bleeds clot on their own and let the body
    // keep knitting; only a major stops recovery dead.
    const traitIds = s.character?.traitIds ?? [];
    const { parts: bodyParts } = tickInjuries(
      s.bodyParts,
      hours,
      hasTraitFlag(traitIds, 'bleedingSelfStopDisabled'),
      s.meters.hunger,
      sumTraitMod(traitIds, 'legHealMod'),
    );
    const partsAfterSystemic = tickSystemicDamage(bodyParts, s.meters, hours);
    const skyNow = weatherKindFor(s.seed, s.day);
    const outdoors = s.hdb === null;
    let meters = tickMeters(s.meters, hours, {
      sleeping,
      thirstMult: weatherThirstMult(skyNow),
      energyMult: weatherEnergyMult(skyNow),
      hungerDrainMod: sumTraitMod(traitIds, 'hungerDrainMod'),
      thirstDrainMod: sumTraitMod(traitIds, 'thirstDrainMod'),
      energyDrainMod: sumTraitMod(traitIds, 'energyDrainMod'),
      outdoorEnergyDrainMod: sumTraitMod(traitIds, 'outdoorEnergyDrainMod'),
      outdoors,
      heat: skyNow === 'heat',
    });
    if (restedEnergy != null) meters = { ...meters, energy: restedEnergy };

    // danger creeps back toward baseDanger, faster for larger locations
    const decayed = decayBoosts(s.locations, hours);
    const locations: Record<string, LocationState> = {};
    for (const [id, loc] of Object.entries(decayed)) {
      if (loc.exhausted || loc.currentDanger >= loc.baseDanger) {
        locations[id] = loc;
        continue;
      }
      const creep = (REGEN_PER_DAY[loc.size] / HOURS_PER_DAY) * hours;
      locations[id] = {
        ...loc,
        currentDanger: Math.min(loc.baseDanger, loc.currentDanger + creep),
      };
    }

    // The horde swells each day the clock rolls past midnight.
    const daysElapsed = day - s.day;
    const hordeLevel =
      daysElapsed > 0
        ? Math.min(HORDE_MAX, s.hordeLevel + daysElapsed * HORDE_PER_DAY)
        : s.hordeLevel;

    // Perishables rot on the clock, not on use — which is what makes a bag
    // full of hoarded hawker food a liability rather than a stockpile. A stash
    // is no cooler than a backpack; nowhere in this city has power.
    const items = spoil(s.items, hours);

    // Time in a block is free — only the noise you make raises its heat.
    set({ hour, day, meters, bodyParts: partsAfterSystemic, locations, hordeLevel, items });

    // warn once, on the way down, so the HP bleed isn't a silent surprise
    if (s.meters.thirst >= STARVING_THRESHOLD && meters.thirst < STARVING_THRESHOLD) {
      pushLog('Your throat is raw. Find water — this is costing you blood now.', 'bad');
    }
    if (s.meters.hunger >= STARVING_THRESHOLD && meters.hunger < STARVING_THRESHOLD) {
      pushLog('Hunger cramps set in. Your body is eating itself.', 'bad');
    }

    const cause = checkDeath(meters, partsAfterSystemic);
    if (cause) {
      endRun(cause);
      return true;
    }
    if (hordeLevel >= HORDE_MAX) {
      endRun('overrun');
      return true;
    }
    // Missed the current window? Go dark for a while, then stage another.
    const now = totalGameHour(day, hour);
    const g = get();
    if (!g.escaped) {
      if (g.evacZoneId && g.evacDeadline != null && now >= g.evacDeadline) {
        beginEvacCooldown();
      } else if (g.evacCooldownUntil != null && now >= g.evacCooldownUntil) {
        stageNextEvac();
      }
    }
    return false;
  };

  // Blind exploration: the ONLY way a location is revealed is by standing at
  // it. Marks it discovered, snapshots memory, and lights a spot on the fog.
  const discoverLocation = (locationId: string) => {
    const s = get();
    const loc = s.locations[locationId];
    if (!loc) return;
    const wasNew = !loc.discovered;
    const updated: LocationState = { ...loc, discovered: true };
    updated.lastSeen = snapshot(updated);
    set((st) => ({
      locations: { ...st.locations, [locationId]: updated },
      exploredArea: wasNew
        ? [...st.exploredArea, { lat: loc.lat, lng: loc.lng, radius: VISITED_LIGHT_RADIUS }]
        : st.exploredArea,
    }));
    if (wasNew) pushLog(flavor('charted', { name: loc.name }), 'info');
  };

  /**
   * Put loot in the pack; put whatever won't fit into the site's stash rather
   * than deleting it. A full backpack should be a decision about what to come
   * back for, not a silent tax on searching well.
   *
   * `rng` sets the wear each new instance rolls up with — see `conditionRoll`.
   */
  const spillover = (
    items: ItemInstance[],
    locationId: string,
    defId: string,
    count: number,
    rng: Rng,
    bias = 0,
  ): { items: ItemInstance[]; stashed: number; lost: number } => {
    const condition = conditionRoll(rng, defId, bias);
    const packed = addToGrid(items, 'backpack', defId, count, condition);
    if (packed.leftover === 0) return { items: packed.items, stashed: 0, lost: 0 };
    const spilled = addToGrid(packed.items, locationId, defId, packed.leftover, condition);
    return {
      items: spilled.items,
      stashed: packed.leftover - spilled.leftover,
      lost: spilled.leftover,
    };
  };

  const hasBackpackItem = (defId: string): boolean =>
    get().items.some((i) => i.container === 'backpack' && i.defId === defId);

  const consumeBackpackItem = (defId: string) => {
    set({ items: consumeOneOf(get().items, defId) });
  };

  /**
   * Pure: take one of `defId` out of the backpack, decrementing a stack rather
   * than removing the tile where it can. Crafting burns several of these in a
   * row, so it needs a version that doesn't round-trip through the store.
   */
  const consumeOneOf = (items: ItemInstance[], defId: string): ItemInstance[] => {
    const inst = items.find((i) => i.container === 'backpack' && i.defId === defId);
    if (!inst) return items;
    return inst.stack > 1
      ? items.map((i) => (i.uid === inst.uid ? { ...i, stack: i.stack - 1 } : i))
      : items.filter((i) => i.uid !== inst.uid);
  };

  /**
   * Restore condition on one instance — carried or equipped — and burn the
   * materials it took. Split out because both repair routes end here.
   */
  const applyRepair = (uid: string, amount: number, spend: string[]) => {
    const s = get();
    let items = s.items;
    for (const defId of spend) items = consumeOneOf(items, defId);

    let name = '';
    let after = 0;
    const carried = items.find((i) => i.uid === uid);
    let equipment = s.equipment;
    if (carried) {
      const fixed = repairInstance(carried, amount);
      name = itemDef(fixed.defId).name;
      after = fixed.condition ?? 100;
      items = items.map((i) => (i.uid === uid ? fixed : i));
    } else {
      for (const slot of Object.keys(equipment) as (keyof Equipment)[]) {
        const inst = equipment[slot];
        if (!inst || inst.uid !== uid) continue;
        const fixed = repairInstance(inst, amount);
        name = itemDef(fixed.defId).name;
        after = fixed.condition ?? 100;
        equipment = { ...equipment, [slot]: fixed };
      }
    }
    set({ items, equipment });
    pushLog(`Worked on the ${name} — back to ${after}%.`, 'good');
    persist();
  };

  // Grant a search's loot into a sequential timeline session (not an instant dump).
  const beginSearchSession = (locationId: string, fled: boolean) => {
    const s = get();
    if (s.pendingSearch) return;
    const loc = s.locations[locationId];
    if (!loc) return;
    if (loc.remainingSearches <= 0) {
      pushLog(flavor('searchEmpty', { name: loc.name }), 'info');
      return;
    }

    const lootRng = new Rng(s.seed).fork(
      `loot:${loc.id}:${loc.remainingSearches}:${s.day}:${Math.round(s.hour * 60)}`,
    );
    const lootMod = sumTraitMod(s.character!.traitIds, 'lootMod');
    const perceptionBonus = Math.floor((s.character!.attributes.perception - 5) / 2);
    const raiding =
      !!loc.factionId &&
      s.raidMode?.locationId === locationId &&
      !!s.raidMode.mode;
    const loot = raiding
      ? rollFactionRaidLoot(
          lootRng,
          loc.category,
          POI_CONFIG[loc.category].richness,
          lootMod + perceptionBonus,
          loc.factionId!,
        )
      : rollLoot(
          lootRng,
          loc.category,
          POI_CONFIG[loc.category].richness,
          lootMod + perceptionBonus,
        );

    const searchesUsed = 1 - loc.remainingSearches / Math.max(1, POI_CONFIG[loc.category].richness);
    const bias = raiding
      ? Math.max(0.65, Math.min(1, 0.75 + loc.currentDanger / 12))
      : Math.max(
          0,
          Math.min(1, loc.currentDanger / 6 - Math.max(0, searchesUsed) * 0.35),
        );

    // Empty haul: spend a full charge immediately, no session UI.
    if (loot.length === 0) {
      if (advanceTime(searchMinutes(loc.category) / 60)) return;
      const s2 = get();
      const loc2 = s2.locations[locationId];
      const remaining = loc2.remainingSearches - 1;
      const exhausted = remaining <= 0;
      const updated: LocationState = {
        ...loc2,
        currentDanger: Math.max(0, loc2.currentDanger - DANGER_DEPLETE),
        remainingSearches: Math.max(0, remaining),
        exhausted,
        cleared: true,
        looted: exhausted,
        discovered: true,
      };
      updated.lastSeen = snapshot(updated);
      set({ locations: { ...s2.locations, [locationId]: updated } });
      bumpStats({ poisSearched: 1 });
      pushLog(flavor('searchEmpty', { name: loc2.name }), 'info');
      persist();
      return;
    }

    const pieces = loot.map((stack) => ({
      defId: stack.defId,
      count: stack.count,
      condition: conditionRoll(lootRng, stack.defId, bias),
    }));

    const speed = searchSpeedFactor(
      equipSearchSpeedBonus(s.equipment),
      s.character!.attributes.perception,
      sumTraitMod(s.character!.traitIds, 'searchSpeedMod'),
    );
    const nonce = lootRng.int(1, 1_000_000_000).toString(36);
    const session = ensureSearching(
      buildSearchSession({
        locationId,
        stashLocationId: locationId,
        raiding,
        fled,
        nonce,
        pieces,
        totalMinutes: searchMinutes(loc.category),
        speedFactor: speed,
        spendCharges: true,
        chargeBudget: 1,
      }),
      Date.now(),
    );

    set({ pendingSearch: session });
    pushLog(
      fled
        ? `Grabbing what you can from ${loc.name}…`
        : raiding
          ? `Ransacking their stores at ${loc.name}…`
          : `Searching ${loc.name}…`,
      'info',
    );
    persist();
  };

  /** Apply search-charge spend + danger deplete once per session. */
  const settleSearchSite = (session: SearchSession, chargeSpent: number) => {
    if (session.settled || !session.spendCharges) {
      set({ pendingSearch: { ...session, settled: true } });
      return;
    }
    const s = get();
    const loc = s.locations[session.locationId];
    if (!loc) {
      set({ pendingSearch: { ...session, settled: true } });
      return;
    }
    const remaining = loc.remainingSearches - chargeSpent;
    const exhausted = remaining <= 0;
    const updated: LocationState = {
      ...loc,
      currentDanger: Math.max(0, loc.currentDanger - DANGER_DEPLETE),
      remainingSearches: Math.max(0, remaining),
      exhausted,
      cleared: true,
      looted: exhausted,
      discovered: true,
    };
    updated.lastSeen = snapshot(updated);
    set({
      locations: { ...s.locations, [session.locationId]: updated },
      pendingSearch: { ...session, settled: true },
    });
    bumpStats({ poisSearched: 1 });
  };

  /** Move a found session instance into pack, then site stash. */
  const relocateFoundItem = (
    items: ItemInstance[],
    uid: string,
    stashLocationId: string,
  ): { items: ItemInstance[]; stashed: boolean; lost: boolean; defId: string; count: number } | null => {
    const inst = items.find((i) => i.uid === uid);
    if (!inst) return null;
    const without = items.filter((i) => i.uid !== uid);
    const packed = addToGrid(without, 'backpack', inst.defId, inst.stack, inst.condition);
    if (packed.leftover === 0) {
      return {
        items: packed.items,
        stashed: false,
        lost: false,
        defId: inst.defId,
        count: inst.stack,
      };
    }
    const spilled = addToGrid(
      packed.items,
      stashLocationId,
      inst.defId,
      packed.leftover,
      inst.condition,
    );
    return {
      items: spilled.items,
      stashed: spilled.leftover < packed.leftover,
      lost: spilled.leftover > 0,
      defId: inst.defId,
      count: inst.stack,
    };
  };

  const closeSearchSession = (
    session: SearchSession,
    mode: 'abort' | 'complete',
  ) => {
    let working: SearchSession = { ...session, slots: session.slots.map((sl) => ({ ...sl })) };
    let items = get().items;

    // Abandon fogged / searching — remove any partial materialization (none yet).
    working = {
      ...working,
      slots: working.slots.map((sl) =>
        sl.state === 'fogged' || sl.state === 'searching'
          ? { ...sl, state: 'abandoned' as const, remainingMs: 0 }
          : sl,
      ),
      queue: [],
      searchingStartedAt: null,
    };

    // Spill remaining found items into pack / stash.
    const stashedNote: LootStack[] = [];
    const lostNote: LootStack[] = [];
    const takenNow: LootStack[] = [];
    for (const slot of working.slots) {
      if (slot.state !== 'found' || !slot.uid) continue;
      const moved = relocateFoundItem(items, slot.uid, working.stashLocationId);
      if (!moved) continue;
      items = moved.items;
      if (moved.lost) lostNote.push({ defId: moved.defId, count: moved.count });
      else if (moved.stashed) stashedNote.push({ defId: moved.defId, count: moved.count });
      else takenNow.push({ defId: moved.defId, count: moved.count });
      working = {
        ...working,
        slots: working.slots.map((sl) =>
          sl.id === slot.id ? { ...sl, state: 'taken' as const } : sl,
        ),
      };
    }

    // Drop any stray items still in the session container.
    items = items.filter((i) => i.container !== working.containerId);

    const charge =
      mode === 'complete' && !hasFoggedOrSearching(session)
        ? working.chargeBudget
        : abortChargeSpent(working);

    set({ items, pendingSearch: working });
    settleSearchSite(working, charge);

    const haulLoot: LootStack[] = [];
    for (const slot of working.slots) {
      if (slot.state === 'taken') haulLoot.push({ defId: slot.defId, count: slot.count });
    }
    const leftover = [...stashedNote, ...lostNote];
    bumpHaul(haulLoot, leftover);

    const locName = get().locations[working.locationId]?.name ?? 'the site';
    if (haulLoot.length === 0 && mode === 'abort') {
      pushLog(`You stop searching ${locName} empty-handed.`, 'info');
    } else if (mode === 'abort') {
      pushLog(`You cut the search short at ${locName}.`, 'info', {
        loot: haulLoot,
        leftover,
      });
    } else if (working.fled) {
      pushLog(`Grabbed what you could from ${locName}.`, 'good', { loot: haulLoot, leftover });
    } else if (working.raiding) {
      pushLog(`Raided their stores at ${locName} — this is why they keep a gate.`, 'good', {
        loot: haulLoot,
        leftover,
      });
    } else {
      pushLog(flavor('searchFound', { name: locName }), 'good', { loot: haulLoot, leftover });
    }
    if (stashedNote.length > 0) {
      pushLog(`No room in the pack — the rest is stacked in the stash here.`, 'info');
    }

    set({ pendingSearch: null });
    if (working.raiding) {
      const after = get().locations[working.locationId];
      if (after?.exhausted) set({ raidMode: null });
    }
    persist();
  };

  // Back-compat name used by combat / enter paths.
  const resolveSearch = (locationId: string, fled: boolean) => {
    beginSearchSession(locationId, fled);
  };

  interface ZombieCombatOpts {
    /** Fight indoors on a specific kind of ground. */
    terrainOverride?: TerrainId;
    /** Danger to scale the enemy to, when it isn't the site's own. */
    danger?: number;
    intro?: string;
    /** A pre-built enemy (ghost survivors bring their own stat block). */
    enemy?: Enemy;
    drops?: string[];
    /** Distinguishes the rng stream when several fights share a location/day. */
    key?: string;
    /** The HDB unit this fight came out of — resolved instead of a site search. */
    hdbUnit?: { level: number; unitId: string; lootMod: number };
    /** Cut off on the stairs — no unit, and nothing at the site to search. */
    hdbStairs?: boolean;
    /** Met in the bore between two stations. @see CombatContext.tunnel */
    tunnel?: { nodeId: string; lootMod: number };
  }

  const startZombieCombat = (
    locationId: string,
    grantOnFlee: boolean,
    opts: ZombieCombatOpts = {},
  ) => {
    const s = get();
    const loc = s.locations[locationId];
    const encRng = new Rng(s.seed).fork(
      `enc:${loc.id}:${s.day}:${loc.remainingSearches}:${opts.key ?? ''}`,
    );
    const danger = Math.round(opts.danger ?? effectiveDanger(loc));
    const zombie = opts.enemy ?? makeZombie(encRng, danger, loc.category);
    const combat: CombatState = {
      locationId,
      zombie,
      round: 0,
      log: [
        {
          round: 0,
          tone: 'info',
          text:
            opts.intro ??
            `A ${zombie.name} lurches out of the ${POI_CONFIG[loc.category].label.toLowerCase()}!`,
        },
      ],
      over: false,
      outcome: null,
      playerHpSnapshot: totalHp(s.bodyParts),
      context: {
        locationId,
        grantOnFlee,
        drops: opts.drops,
        hdbUnit: opts.hdbUnit,
        hdbStairs: opts.hdbStairs,
        tunnel: opts.tunnel,
      },
      selectedStance: 'guarded',
      terrain: opts.terrainOverride ? TERRAIN[opts.terrainOverride] : terrainForCategory(loc.category),
      awaitingStance: true,
      playerGauge: 0,
      enemyGauge: 0,
      acting: null,
      paused: false,
      speedIndex: 1,
    };
    set({ combat, _combatRng: encRng.fork('fight') });
  };

  const startHumanCombat = (
    locationId: string,
    faction: Exclude<FactionId, null>,
    grantOnFlee: boolean,
    opts: { pendingRaid?: 'sneak' | 'force'; raidLoot?: boolean } = {},
  ) => {
    const s = get();
    const loc = s.locations[locationId];
    const humanRng = new Rng(s.seed).fork(
      `human:${loc.id}:${s.day}:${loc.remainingSearches}:${opts.pendingRaid ?? ''}:${opts.raidLoot ? 'loot' : ''}`,
    );
    const enemy = makeHuman(humanRng, faction, Math.round(loc.currentDanger));
    const drop = rollHumanDrop(ENEMIES, humanRng, faction);
    const drops = drop ? [drop] : [];
    const combat: CombatState = {
      locationId,
      zombie: enemy,
      round: 0,
      log: [{ round: 0, tone: 'bad', text: `The ${enemy.name} draws on you!` }],
      over: false,
      outcome: null,
      playerHpSnapshot: totalHp(s.bodyParts),
      context: {
        locationId,
        grantOnFlee,
        drops,
        pendingRaid: opts.pendingRaid,
        raidLoot: opts.raidLoot,
      },
      selectedStance: 'guarded',
      terrain: terrainForCategory(loc.category),
      awaitingStance: true,
      playerGauge: 0,
      enemyGauge: 0,
      acting: null,
      paused: false,
      speedIndex: 1,
    };
    set({ combat, _combatRng: humanRng.fork('fight') });
  };

  /** Standing hit for illicit combat at a faction site (every fight, −1). */
  const illicitStandingHit = (locationId: string) => {
    const loc = get().locations[locationId];
    if (!loc?.factionId) return;
    shiftStanding(loc.factionId, -1);
  };

  const enterRaid = (locationId: string, mode: 'sneak' | 'force') => {
    const loc = get().locations[locationId];
    if (!loc?.factionId) return;
    set({ raidMode: { locationId, mode } });
    pushLog(
      mode === 'sneak'
        ? `You're inside ${loc.name} unseen. Search carefully — or slip out.`
        : `You've forced your way into ${loc.name}. Every shelf will cost blood.`,
      mode === 'sneak' ? 'good' : 'info',
    );
  };

  const clearRaid = () => {
    if (get().raidMode) set({ raidMode: null });
  };

  /**
   * A fight with somebody who answers to nobody. The scavenger is carrying the
   * haul they came for, so beating them means taking it; the starving stranger
   * has almost nothing, which is the whole reason they picked a fight over a
   * bottle of water.
   */
  const startLonerCombat = (locationId: string, kind: LonerKind) => {
    const s = get();
    const loc = s.locations[locationId];
    const rng = new Rng(s.seed).fork(`loner:${loc.id}:${s.day}:${Math.round(s.hour)}`);
    const enemy = makeLoner(rng, kind, Math.round(loc.currentDanger));
    const drop = rollLonerDrop(ENEMIES, rng, kind);
    const drops = drop ? [drop] : [];
    const combat: CombatState = {
      locationId,
      zombie: enemy,
      round: 0,
      log: [{ round: 0, tone: 'bad', text: `The ${enemy.name} comes at you!` }],
      over: false,
      outcome: null,
      playerHpSnapshot: totalHp(s.bodyParts),
      context: { locationId, grantOnFlee: false, drops },
      selectedStance: 'guarded',
      terrain: terrainForCategory(loc.category),
      awaitingStance: true,
      playerGauge: 0,
      enemyGauge: 0,
      acting: null,
      paused: false,
      speedIndex: 1,
    };
    set({ combat, _combatRng: rng.fork('fight') });
  };

  /**
   * The doorway. On occupied ground this is the faction gate (or a silent
   * wave-through into services). On unclaimed ground it is scavenger theatre
   * and then a search / HDB crawl.
   */
  const enterLocation = (locationId: string) => {
    const s = get();
    const loc = s.locations[locationId];
    if (!loc) return;

    // ---- faction hub: no scavenging ------------------------------------
    if (loc.factionId) {
      const ctx = {
        day: s.day,
        time: timeOfDay(s.hour),
        weather: weatherKindFor(s.seed, s.day),
        standing: s.factionStanding,
      };
      if (hasFactionClearance(loc, s.factionStanding, s.day)) {
        pushLog(
          `${FACTION_CONFIG[loc.factionId].shortName} let you on the grounds. No scavenging here — talk to them.`,
          'info',
        );
        return;
      }
      // Gates are not optional: cooldown must not skip into free access.
      const eventRng = new Rng(s.seed).fork(`fgate:${loc.id}:${s.day}:${Math.round(s.hour)}`);
      const event = rollFactionGateEvent(eventRng, loc, ctx);
      if (event) {
        pushLog(event.tell, 'info');
        const now = totalGameHour(s.day, s.hour);
        const clock =
          s._eventClock.day === s.day ? s._eventClock : { ...s._eventClock, day: s.day, count: 0 };
        set({
          pendingEvent: { locationId, event },
          _eventRng: eventRng,
          _eventClock: { ...clock, lastAt: now, count: clock.count + 1 },
        });
        return;
      }
      pushLog(
        `${FACTION_CONFIG[loc.factionId].shortName} let you on the grounds. No scavenging here — talk to them.`,
        'info',
      );
      return;
    }

    // Nothing to guard and nothing to take — don't stage a confrontation over
    // an empty room. (HDB blocks are never "exhausted"; they run unit by unit.)
    if (loc.exhausted && loc.category !== 'residential') {
      attemptSearch(locationId);
      return;
    }

    const now = totalGameHour(s.day, s.hour);
    const clock = s._eventClock.day === s.day ? s._eventClock : { ...s._eventClock, day: s.day, count: 0 };
    const onCooldown = clock.lastAt !== null && now - clock.lastAt < EVENT_COOLDOWN_HOURS;
    if (onCooldown || clock.count >= EVENT_MAX_PER_DAY) {
      if (clock !== s._eventClock) set({ _eventClock: clock });
      attemptSearch(locationId);
      return;
    }

    const eventRng = new Rng(s.seed).fork(`event:${loc.id}:${s.day}:${Math.round(s.hour)}`);
    const event = rollPreScavengeEvent(eventRng, loc, {
      day: s.day,
      time: timeOfDay(s.hour),
      weather: weatherKindFor(s.seed, s.day),
      standing: s.factionStanding,
    });

    if (event) {
      // A beat of foreshadowing before the prompt — you notice, then you decide.
      pushLog(event.tell, 'info');
      set({
        pendingEvent: { locationId, event },
        _eventRng: eventRng,
        _eventClock: { ...clock, lastAt: now, count: clock.count + 1 },
      });
      return;
    }

    if (clock !== s._eventClock) set({ _eventClock: clock });
    attemptSearch(locationId);
  };

  // Roll the encounter chance for searching a location right now.
  const attemptSearch = (locationId: string) => {
    const s = get();
    if (s.pendingSearch) return;
    const loc = s.locations[locationId];
    // Occupied ground is an NPC hub — never scavenger rolls or HDB crawls,
    // unless you're illicitly raiding after sneak / force.
    if (loc.factionId) {
      const raid = s.raidMode;
      if (raid && raid.locationId === locationId) {
        resolveSearch(locationId, false);
        return;
      }
      pushLog(
        `${FACTION_CONFIG[loc.factionId].shortName} hold this place. You deal with them, you don't ransack the shelves.`,
        'info',
      );
      return;
    }
    // An HDB block isn't something you "search" — you go in, floor by floor.
    if (loc.category === 'residential') {
      get().hdbEnter();
      return;
    }
    if (loc.exhausted) {
      pushLog(flavor('pickedClean', { name: loc.name }), 'info');
      return;
    }
    const encRng = new Rng(s.seed).fork(`encroll:${loc.id}:${s.day}:${loc.remainingSearches}`);
    const band = timeOfDay(s.hour);
    let encChance = 0.08 + loc.currentDanger * 0.12;
    if (band === 'night') encChance += 0.2;
    else if (band === 'dusk') encChance += 0.08;
    encChance += weatherEncounterMod(weatherKindFor(s.seed, s.day));
    // A swelling horde makes every search deadlier as the days drag on.
    encChance += hordeIntensity(s.hordeLevel) * 0.3;
    encChance += sumTraitMod(s.character!.traitIds, 'encounterChanceMod');
    if (band === 'night' || band === 'dusk') {
      encChance += sumTraitMod(s.character!.traitIds, 'nightEncounterChanceMod');
    }
    // Ambush-prone builds get jumped more often when a search turns into a fight.
    const ambushMult = Math.max(0.15, 1 + sumTraitMod(s.character!.traitIds, 'ambushChanceMod'));
    encChance = Math.max(0.02, Math.min(0.95, encChance * (0.7 + 0.3 * ambushMult)));

    if (encRng.chance(encChance)) {
      startZombieCombat(locationId, true);
      pushLog(flavor('ambush', { name: loc.name }), 'bad');
    } else {
      resolveSearch(locationId, false);
    }
  };

  /**
   * Reading the corridor is what stepping onto a floor *is* — never an action
   * the player has to spend a click on. Sharper senses simply see more doors.
   */
  const sweepFloor = (level: number) => {
    const s = get();
    if (!s.hdb) return;
    const rng = new Rng(s.seed).fork(`sweep:${s.hdb.locationId}:${level}:${s.day}`);
    const res = scoutFloor(rng, s.character!.attributes, s.hdb, level);
    set({ hdb: res.dungeon });
    pushLog(
      res.read === 0
        ? `Level ${level}: the corridor tells you nothing.`
        : `Level ${level}: you read ${res.read} of ${res.total} units from the corridor.`,
      'info',
    );
  };

  /**
   * Empty a unit and mark it done for good. Called both on a clean entry and
   * after the fight that came out of the doorway — either way the room is spent.
   */
  const clearHdbUnit = (level: number, unitId: string, lootMod: number, rng: Rng) => {
    const s = get();
    if (!s.hdb) return;
    const unit = s.hdb.floors[level - 1]?.units.find((u) => u.id === unitId);
    // `lootMod` already carries the whole risk ladder — barricaded door, corner
    // unit, height. Adding it to the base a second time double-counted it.
    const loot = rollLoot(rng, 'residential', 2 + lootMod, lootMod);
    // A door nobody else could get through is the one thing behind which gear
    // is still in working order. This is the payoff for the noise and the time.
    const bias = Math.max(0, Math.min(1, lootMod / 5));
    let items = s.items;
    const leftover: LootStack[] = [];
    const stashed: LootStack[] = [];
    for (const stack of loot) {
      const r = spillover(items, s.hdb.locationId, stack.defId, stack.count, rng, bias);
      items = r.items;
      if (r.stashed > 0) stashed.push({ defId: stack.defId, count: r.stashed });
      if (r.lost > 0) leftover.push({ defId: stack.defId, count: r.lost });
    }
    const missed = [...stashed, ...leftover];
    const hdb = updateUnit(s.hdb, level, unitId, { state: 'cleared' });
    set({ items, hdb, hdbBlocks: { ...s.hdbBlocks, [hdb.locationId]: hdb } });
    bumpStats({ hdbUnitsCleared: 1 });
    bumpHaul(loot, missed);
    const label = unit?.label ?? 'the unit';
    pushLog(
      loot.length ? `You clear ${label}.` : `${label} is bare.`,
      loot.length ? 'good' : 'info',
      loot.length ? { loot, leftover: missed } : undefined,
    );
    if (stashed.length > 0) {
      pushLog('Your pack is full — the rest goes in the block stash.', 'info');
    }
  };

  /**
   * Move a faction's opinion of you. Lifted out of the event interpreter so
   * anything can spend or earn goodwill — the tunnel camps are STA people, and
   * how you treat them counts the same as how you treat their turnstiles.
   */
  const shiftStanding = (id: Exclude<FactionId, null>, delta: number) => {
    const cur = get().factionStanding;
    const next = clampStanding((cur[id] ?? 0) + delta);
    if (next === cur[id]) return;
    set({ factionStanding: { ...cur, [id]: next } });
    const cfg = FACTION_CONFIG[id];
    // Call out the rung by name, not just the number — the ladder only works
    // as a goal if the player can see which one they just climbed onto.
    const rung = `${standingLabel(next)}, ${next > 0 ? '+' : ''}${next}`;
    pushLog(
      delta > 0
        ? `${cfg.shortName} think better of you. (${rung})`
        : `${cfg.shortName} won't forget that. (${rung})`,
      delta > 0 ? 'good' : 'bad',
    );

    // The two rungs that change what you can *do* announce themselves. Every
    // other step is just a number moving.
    const outpostIds = get().outposts[id] ?? [];
    const firstOutpost = outpostIds.map((oid) => get().locations[oid]).find(Boolean);
    if (next === STANDING_KNOWN && (cur[id] ?? 0) < STANDING_KNOWN) {
      pushLog(
        firstOutpost
          ? `${cfg.shortName} will deal with you now. Look for their ${cfg.outpostName.toLowerCase()} marks — one is at ${firstOutpost.name}.`
          : `${cfg.shortName} will deal with you now.`,
        'good',
      );
    } else if (next === STANDING_TRUSTED && (cur[id] ?? 0) < STANDING_TRUSTED) {
      pushLog(
        `${cfg.shortName} wave you through their ground now — and there's a bed for you at their ${cfg.outpostName.toLowerCase()}.`,
        'good',
      );
    }
  };

  // ------------------------------------------------------------- tunnels --

  /** A night on a mat behind someone else's barricade. */
  const CAMP_REST_HOURS = 5;

  /**
   * Spend time and hand back the live run, or null if the survivor didn't
   * survive it. Every tunnel action starts with this: `advanceTime` can end the
   * run outright, and the run object must be re-read afterwards either way.
   */
  const tunnelTick = (hours: number): TunnelRun | null =>
    advanceTime(hours) ? null : get().tunnel;

  /**
   * Pull the neighbourhood around a point into the world.
   *
   * The opening bubble is built once around spawn (~1.5 km). Everything past
   * that edge — walking out, trekking open ground, or surfacing from a tunnel —
   * brings its own neighbourhood with it from the island bake. New sites arrive
   * undiscovered, so fog still makes you walk them.
   *
   * Bridging is seeded at the expansion centre (not spawn), so a far chunk
   * doesn't grow a Prim spine of waypoints all the way back to day one.
   */
  const expandWorldAround = async (lat: number, lng: number, tag: string) => {
    const s = get();
    if (!s.spawn) return;
    let raw: RawPoi[] | null = null;
    try {
      raw = await bakedPoisNear(lat, lng, SCAVENGE_RADIUS);
    } catch {
      return; // no bake, no expansion — the caller falls back to a bare station
    }
    if (!raw?.length) return;
    raw = filterWalkablePois(raw);
    if (!raw.length) return;

    const built = buildLocations(new Rng(s.seed).fork(tag), s.spawn, raw, getMrtNetwork(), {
      localOrigin: { lat, lng },
    });
    const merged = { ...get().locations };
    let added = 0;
    for (const loc of built) {
      // Synthetic bridge waypoints are numbered per build, so they'd collide
      // across expansions and silently lose their connective tissue.
      const id = loc.category === 'waypoint' ? `${loc.id}@${tag}` : loc.id;
      // Anything already in the world keeps whatever state it has earned.
      if (merged[id]) continue;
      merged[id] = { ...loc, id };
      added += 1;
    }
    if (added > 0) {
      const outposts = get().outposts;
      set({
        locations: applyFactionServices(merged, outposts, get().seed),
      });
      persist();
    }
  };

  /** In-flight expand keys — prevents double-fetch when trek + arrive overlap. */
  const expandingCells = new Set<string>();

  /**
   * Materialise the bake cell under a point if we haven't yet. Fire-and-forget
   * from travel/trek/arrive; deterministic tag so the same seed + cell always
   * yields the same danger/faction for newly added sites.
   */
  const ensureWorldAround = async (lat: number, lng: number) => {
    if (!get().spawn) return;
    const key = expandCellKey(lat, lng);
    if (get().expandedCells.includes(key) || expandingCells.has(key)) return;
    expandingCells.add(key);
    try {
      await expandWorldAround(lat, lng, `expand:${key}`);
      const cells = get().expandedCells;
      if (!cells.includes(key)) {
        set({ expandedCells: [...cells, key] });
        persist();
      }
    } finally {
      expandingCells.delete(key);
    }
  };

  /**
   * The location a station id refers to, brought into existence if the world
   * doesn't reach that far yet.
   */
  const ensureStationLocation = async (stationId: string): Promise<LocationState | null> => {
    const known = Object.values(get().locations).find((l) => l.mrtStationId === stationId);
    if (known) return known;

    const station = getMrtNetwork()?.byId.get(stationId);
    if (!station) return null;

    await ensureWorldAround(station.lat, station.lng);
    const found = Object.values(get().locations).find((l) => l.mrtStationId === stationId);
    if (found) return found;

    // The bake has no POI for this platform. Stand one up rather than refuse
    // the trip — the tunnel demonstrably goes somewhere.
    const s = get();
    const loc = makeStationLocation(new Rng(s.seed).fork('stations'), s.spawn!, station);
    set({ locations: { ...s.locations, [loc.id]: loc } });
    return loc;
  };

  /** Generate the segment and drop the player onto the departure platform. */
  const beginTunnel = (toLocationId: string) => {
    const s = get();
    const from = s.currentPositionId ? s.locations[s.currentPositionId] : null;
    const to = s.locations[toLocationId];
    const net = getMrtNetwork();
    const seg = from && to ? tunnelSegmentBetween(from, to) : null;
    if (!from || !to || !seg || !net) return;

    const line = displayLine(net, seg.line);
    const seq = s.tunnelSeq + 1;
    const walk = estimateTunnelWalk(
      seg.meters,
      s.character!.attributes,
      s.meters.energy,
      s.hour,
      moveFactor(s),
    );
    const run = generateTunnelRun(new Rng(s.seed).fork(`tunnel:${from.id}:${to.id}:${seq}`), {
      from,
      to,
      lineCode: seg.line.code,
      lineName: line.name,
      lineColor: line.color,
      mode: seg.line.mode,
      meters: seg.meters,
      travelMin: walk.travelMin,
      day: s.day,
      hour: s.hour,
      hordeLevel: s.hordeLevel,
      seq,
    });

    set({ tunnel: run, tunnelSeq: seq, tunnelOffer: null });
    pushLog(
      `You drop off the platform edge at ${from.name} and walk into the ${line.name} bore.`,
      'info',
    );
    persist();
  };

  /** Climb the stairs at the far end. The run ends here, one way or another. */
  const arriveTunnel = () => {
    const s = get();
    const run = s.tunnel;
    const to = run ? s.locations[run.toLocationId] : null;
    if (!run || !to) return;

    set({
      tunnel: null,
      tunnelOffer: null,
      currentPos: { lat: to.lat, lng: to.lng },
      currentPositionId: to.id,
    });
    discoverLocation(to.id);
    bumpStats({ distanceM: run.meters });
    pushLog(`Stairs, then daylight. You come up at ${to.name}.`, 'good');

    // Loud crossings arrive loud — but only here, at the one place you're
    // actually standing. Noise per node would raise danger where you aren't.
    if (run.pressure > 60) {
      pushLog('Whatever followed you up the tunnel is close behind.', 'bad');
      get().emitNoise(to.lat, to.lng, 220, 1);
    }
    persist();
  };

  /**
   * Empty a stretch of tunnel. Shared by the quiet case and the one where
   * something came out of the dark first — either way the salvage is the same,
   * and it spills into the station you're walking *towards*, because the one
   * behind you is behind you.
   */
  const grantTunnelSalvage = (run: TunnelRun, node: TunnelNode, rng: Rng) => {
    const s = get();
    const lootMod = node.lootMod ?? 0;
    const loot = rollLoot(rng, 'mrt', POI_CONFIG.mrt.richness, lootMod);
    const bias = Math.max(0, Math.min(1, lootMod / 3));

    let items = s.items;
    const stashed: LootStack[] = [];
    const lost: LootStack[] = [];
    for (const stack of loot) {
      const r = spillover(items, run.toLocationId, stack.defId, stack.count, rng, bias);
      items = r.items;
      if (r.stashed > 0) stashed.push({ defId: stack.defId, count: r.stashed });
      if (r.lost > 0) lost.push({ defId: stack.defId, count: r.lost });
    }
    const missed = [...stashed, ...lost];
    set({ items });
    bumpHaul(loot, missed);
    pushLog(
      loot.length ? `You strip ${node.name}.` : `${node.name} was picked over long ago.`,
      loot.length ? 'good' : 'info',
      loot.length ? { loot, leftover: missed } : undefined,
    );
    if (stashed.length > 0) {
      pushLog(`Your pack is full — the rest goes ahead to the ${run.toName} stash.`, 'info');
    }
  };

  /**
   * A fight in the bore. One way wide, so fleeing means shoving past and
   * carrying on — there is no back to run to.
   */
  const startTunnelFight = (run: TunnelRun, node: TunnelNode, lootMod: number) => {
    const s = get();
    const threat = nodeThreat(run, node);
    const pinned = run.pressure >= PRESSURE_MAX;
    startZombieCombat(run.fromLocationId, false, {
      terrainOverride: 'tunnel_bore',
      danger: threat,
      key: tunnelKey(run, `fight:${node.id}`),
      // A pinned gauge has been drawing something the whole walk. It arrives.
      enemy: pinned
        ? makeTunnelStalker(new Rng(s.seed).fork(tunnelKey(run, `stalker:${node.id}`)), threat)
        : undefined,
      intro: pinned
        ? 'Whatever has been pacing you down the tunnel stops pacing.'
        : `${node.name}: they come at you down the bore, and the bore is one way wide.`,
      tunnel: { nodeId: node.id, lootMod },
    });
  };

  /** Deal with whatever is on the node just stepped onto. */
  const resolveTunnelNode = (nodeId: string) => {
    const s = get();
    const run = s.tunnel;
    if (!run) return;
    const node = run.nodes[nodeId];
    if (!node) return;

    if (isArrival(run, node)) {
      arriveTunnel();
      return;
    }

    const meta = TUNNEL_NODE_META[node.kind];
    const rng = new Rng(s.seed).fork(tunnelKey(run, `node:${nodeId}`));

    // ---- something is already in here with you --------------------------
    if (node.kind === 'pack') {
      startTunnelFight(run, node, 0);
      return;
    }

    // ---- the tunnel itself is the problem -------------------------------
    if (node.kind === 'hazard') {
      const after = tunnelTick(meta.minutes / 60);
      if (!after) return;
      const hazard = HAZARD_META[node.hazard ?? 'collapse'];
      const cfg = HAZARD_CONFIG[node.hazard ?? 'collapse'];
      const check = rollCheck(
        rng,
        s.character!.attributes[hazard.attr],
        hazardDc(node),
        sumTraitMod(s.character!.traitIds, 'checkBonusMod'),
      );

      const cur = get();
      if (check.success) {
        set({
          tunnel: markDone(after, nodeId),
          meters: { ...cur.meters, energy: clampMeter(cur.meters.energy - cfg.energyCost) },
        });
        pushLog(`${node.name}: you find the line through and take it.`, 'info');
      } else {
        const bodyParts = applyWound(cur.bodyParts, rng.int(6, 16), rng);
        set({
          tunnel: addPressure(markDone(after, nodeId), HAZARD_PRESSURE),
          bodyParts,
          meters: { ...cur.meters, energy: clampMeter(cur.meters.energy - cfg.energyCost * 2) },
        });
        pushLog(`${node.name} takes its toll — you come out the other side hurt.`, 'bad');
        const cause = checkDeath(get().meters, get().bodyParts);
        if (cause) {
          endRun(cause);
          return;
        }
      }
      persist();
      return;
    }

    // ---- salvage, unless the salvage was bait ---------------------------
    if (node.kind === 'scavenge') {
      const after = tunnelTick(meta.minutes / 60);
      if (!after) return;
      // Picking over a wreck is noisy, and something down here is listening.
      if (rng.chance(0.25)) {
        pushLog(`Something was already working ${node.name}.`, 'bad');
        startTunnelFight(after, node, node.lootMod ?? 0);
        return;
      }
      set({ tunnel: addPressure(markDone(after, nodeId), SCAVENGE_PRESSURE) });
      grantTunnelSalvage(after, node, rng);
      persist();
      return;
    }

    // ---- people ---------------------------------------------------------
    if (node.kind === 'settlement') {
      const after = tunnelTick(meta.minutes / 60);
      if (!after) return;
      set({
        tunnel: markDone(after, nodeId),
        tunnelOffer: node.offer ? { kind: 'trader', ...node.offer } : null,
      });
      pushLog(
        `${node.name}: lamplight, cooking smoke, and a dozen people deciding what you are.`,
        'info',
      );
      persist();
      return;
    }

    set({ tunnel: markDone(run, nodeId) });
    persist();
  };

  /** Locations whose ghost has already been dealt with this run. */
  const ghostsResolved = new Set<string>();

  /**
   * Walk onto the coordinates where a past run ended and meet what became of
   * that survivor. Returns true when it took over the arrival.
   */
  const resolveGhost = (loc: LocationState): boolean => {
    const s = get();
    const legacy = loadLegacyRun();
    if (!legacy || legacy.seed === s.seed || ghostsResolved.has(loc.id)) return false;
    if (haversine(legacy.lat, legacy.lng, loc.lat, loc.lng) > GHOST_RADIUS) return false;
    ghostsResolved.add(loc.id);

    const rng = new Rng(s.seed).fork(`ghost:${loc.id}:${legacy.date}`);
    const kind = rollGhostEncounter(rng);
    pushLog(`Someone died here. ${legacy.name}, day ${legacy.day}: ${legacy.cause}`, 'bad');

    if (kind === 'mini_boss') {
      startZombieCombat(loc.id, false, {
        enemy: ghostBoss(rng.fork('boss'), legacy),
        drops: ghostDrops(legacy),
        intro: `${legacy.name} is still walking — and still wearing their kit.`,
        key: 'ghost',
      });
      return true;
    }

    if (kind === 'corpse') {
      const drops = ghostDrops(legacy);
      let items = get().items;
      for (const defId of drops) items = addToGrid(items, 'backpack', defId, 1).items;
      set({ items });
      pushLog(
        drops.length
          ? `The body is untouched. You take back what they carried.`
          : 'The body is untouched, and picked clean already.',
        drops.length ? 'good' : 'info',
      );
      return false;
    }

    const trade = rollGhostTrade(rng.fork('trade'));
    set({ ghostOffer: { kind: 'trader', ...trade } });
    pushLog(`${legacy.name} made it. They have one trade in them.`, 'good');
    return true;
  };

  // Fires when a walking glide finishes: commit the new position and run the
  // usual arrival logic (faction reveal, pre-scavenge event, search).
  const arriveAt = (locId: string) => {
    const anim = get().travelAnim;
    if (!anim || anim.toId !== locId) return; // superseded or cancelled
    const loc = get().locations[locId];
    if (!loc) {
      set({ travelAnim: null });
      return;
    }
    set((st) => ({
      travelAnim: null,
      currentPos: { lat: loc.lat, lng: loc.lng },
      currentPositionId: loc.id,
      raidMode: null,
      locations: {
        ...st.locations,
        [loc.id]: { ...st.locations[loc.id], isFactionRevealed: true },
      },
    }));
    const arr = get();
    pushLog(
      flavor('arrive', {
        name: loc.name,
        time: timeOfDay(arr.hour),
        weather: weatherKindFor(arr.seed, arr.day),
      }),
      'info',
    );
    discoverLocation(loc.id);

    // Pull in the bake cell under this site so the frontier past it fills with
    // undiscovered "?" as you push toward distant objectives.
    void ensureWorldAround(loc.lat, loc.lng);

    const s2 = get();
    const loc2 = s2.locations[loc.id];

    // Jumped on the approach? Fight first — no doorway event, no auto-search.
    if (roadAmbushAt === loc.id) {
      roadAmbushAt = null;
      pushLog(flavor('roadAmbush', { name: loc.name }), 'bad');
      const fightRng = new Rng(s2.seed).fork(`roadfight:${loc.id}:${s2.day}:${s2.hour}`);
      const zombie = makeZombie(fightRng, Math.round(loc2.currentDanger), loc2.category);
      const combat: CombatState = {
        locationId: loc.id,
        zombie,
        round: 0,
        log: [{ round: 0, tone: 'bad', text: `${zombie.name} blocks the way!` }],
        over: false,
        outcome: null,
        playerHpSnapshot: totalHp(s2.bodyParts),
        context: { locationId: loc.id, grantOnFlee: false, roadAmbush: true },
        selectedStance: 'guarded',
        terrain: terrainForCategory(loc2.category, true),
        awaitingStance: true,
        playerGauge: 0,
        enemyGauge: 0,
        acting: null,
        paused: false,
        speedIndex: 1,
      };
      set({ combat, _combatRng: fightRng.fork('fight') });
      return;
    }

    // Did a previous run end on this doorstep? Something is still here.
    if (resolveGhost(loc2)) return;

    // Arrival ends here, at the frontage. Going inside is a separate decision
    // the survivor has to actually make — which is what gives the doorway its
    // weight, and what stops an encounter from feeling like it ambushed you
    // for the crime of walking down a street.
    if (!loc2.exhausted) pushLog(flavor('atDoor', { name: loc.name }), 'info');
    persist();
  };

  // Set by trek()'s en-route roll; consumed when the crossing lands.
  let trekAmbush: { danger: number; hazard: HazardKind | null } | null = null;

  // Fires when a cross-country glide finishes. There is no site here — no
  // faction, no doorway event, no search. Just ground, and whatever found you
  // on it.
  const arriveWilds = (lat: number, lng: number, startedAt: number) => {
    const anim = get().travelAnim;
    if (!anim || anim.toId !== null || anim.startedAt !== startedAt) return; // superseded

    set((st) => ({
      travelAnim: null,
      currentPos: { lat, lng },
      currentPositionId: null,
      raidMode: null,
      exploredArea: [...st.exploredArea, { lat, lng, radius: TREK_LIGHT_RADIUS }],
    }));
    pushLog(flavor('trekArrive'), 'info');

    // Open ground is how you leave the starting bubble — materialise whatever
    // the bake has under this landing so the walk toward evac stays a city.
    void ensureWorldAround(lat, lng);

    const pending = trekAmbush;
    trekAmbush = null;
    if (!pending) {
      persist();
      return;
    }

    const s = get();
    pushLog(flavor('trekAmbush'), 'bad');
    const fightRng = new Rng(s.seed).fork(`wildfight:${lat.toFixed(5)}:${lng.toFixed(5)}:${s.day}`);

    // Patrolled ground sends people; everything else sends the dead.
    const human = pending.hazard === 'gang_patrol';
    const gangFaction = ENEMIES.spawn.wildsGangFaction;
    const enemy = human
      ? makeHuman(fightRng, gangFaction, pending.danger)
      : makeZombie(fightRng, pending.danger);
    const gangDrop = human ? rollHumanDrop(ENEMIES, fightRng, gangFaction) : null;
    const drops = gangDrop ? [gangDrop] : undefined;

    const combat: CombatState = {
      locationId: null,
      zombie: enemy,
      round: 0,
      log: [{ round: 0, tone: 'bad', text: `${enemy.name} closes in across the open!` }],
      over: false,
      outcome: null,
      playerHpSnapshot: totalHp(s.bodyParts),
      // No site to search and none to flee into — win or run, you're still
      // standing in the same empty street afterwards.
      context: { locationId: null, grantOnFlee: false, wilds: true, drops },
      selectedStance: 'guarded',
      terrain: TERRAIN.open_ground,
      awaitingStance: true,
      playerGauge: 0,
      enemyGauge: 0,
      acting: null,
      paused: false,
      speedIndex: 1,
    };
    set({ combat, _combatRng: fightRng.fork('fight') });
  };

  return {
    phase: 'menu',
    character: null,
    seed: '',
    spawn: null,
    locations: {},
    currentPositionId: null,
    currentPos: { lat: 0, lng: 0 },
    worldLoading: false,
    worldError: null,
    usedFallback: false,
    travelAnim: null,
    expandedCells: [],
    hordeLevel: 0,
    evacZoneId: null,
    evacDeadline: null,
    evacCooldownUntil: null,
    escaped: false,
    maxHp: 100,
    meters: initialMeters(),
    bodyParts: initialBodyParts(100),
    day: 1,
    hour: START_HOUR,
    items: [],
    equipment: emptyEquipment(),
    clothingTears: OWN_CLOTHES_TEARS,
    rounds: 0,
    kills: 0,
    stats: emptyRunStats(),
    exploredArea: [],
    combat: null,
    _combatRng: null,
    hdb: null,
    hdbBlocks: {},
    tunnel: null,
    tunnelSeq: 0,
    tunnelOffer: null,
    noisePulses: [],
    ghostOffer: null,
    pendingEvent: null,
    pendingSearch: null,
    _eventRng: null,
    _eventClock: freshEventClock(),
    factionStanding: emptyStanding(),
    raidMode: null,
    outposts: {},
    trader: null,
    traderTaken: {},
    log: [],
    deathCause: null,
    finalScore: 0,
    highScores: loadHighScores(),
    hasSavedRun: !!loadRun(),

    goToCharacter: () => set({ phase: 'character' }),

    commitCharacter: (c) => {
      const maxHp = maxHpFor(c);
      setBackpackWidthBonus(sumTraitMod(c.traitIds, 'gridWidthBonus'));
      set({
        character: c,
        maxHp,
        meters: initialMeters(),
        bodyParts: initialBodyParts(maxHp),
        phase: 'spawn',
        day: 1,
        hour: START_HOUR,
        items: [],
        equipment: emptyEquipment(),
        clothingTears: OWN_CLOTHES_TEARS,
        kills: 0,
        stats: emptyRunStats(),
        log: [],
      });
    },

    setSpawn: async (spawn) => {
      const seed = randomSeed();
      const rng = new Rng(seed);

      try {
        await ensureZonesLoaded();
      } catch {
        // Degraded: walkability falls back to country clip only.
      }
      const spawnWalk = walkabilityOf(spawn.lat, spawn.lng);
      if (spawnWalk !== 'ok') return 'unplayable';

      // Map data, in order of preference:
      //   1. the pre-baked island-wide set (static file, can't rate-limit us)
      //   2. a live Overpass call, if the bake is missing or malformed
      //   3. a simulated neighbourhood, if both are unavailable
      // The rail network rides along with the POIs: it names the stations and
      // decides which of them are nodes you can ride between. A failure here is
      // survivable — stations stay ordinary locations.
      const net = await loadMrtNetwork();

      let raw: RawPoi[] | null = null;
      try {
        raw = await bakedPoisNear(spawn.lat, spawn.lng, SCAVENGE_RADIUS);
      } catch {
        try {
          raw = await fetchOsmPois(spawn.lat, spawn.lng, SCAVENGE_RADIUS);
        } catch {
          raw = null;
        }
      }
      if (raw) raw = filterWalkablePois(raw);

      let list: LocationState[];
      let usedFallback = false;
      let worldError: string | null = null;
      if (raw) {
        // Real data but almost nothing nearby means the spot is genuinely
        // remote (sea/forest/reserve) — reject so the player can pick again.
        if (raw.length < 5) return 'remote';
        list = buildLocations(rng, spawn, raw, net);
      } else {
        // Offline fallback only on walkable ground — never invent a sea town.
        list = generateFallbackWorld(rng, spawn, SCAVENGE_RADIUS);
        usedFallback = true;
        worldError = 'Live map data unavailable — using a simulated neighbourhood.';
      }

      set({
        spawn,
        seed,
        phase: 'game',
        worldLoading: false,
        worldError,
        usedFallback,
        locations: {},
        currentPositionId: null,
        currentPos: { lat: spawn.lat, lng: spawn.lng },
        // Opening bubble is already materialised — mark its cell so the first
        // trek doesn't rebuild the same 1.5 km from the bake.
        expandedCells: [expandCellKey(spawn.lat, spawn.lng)],
      });
      pushLog(
        flavor(usedFallback ? 'wakeOffline' : 'wake', { name: spawn.name }),
        'info',
      );

      // A scavenger by trade gets more out of every site than the search budget
      // allows anyone else.
      const searchBonus = sumTraitMod(get().character!.traitIds, 'searchBonusMod');
      const locations: Record<string, LocationState> = {};
      for (const l of list) {
        locations[l.id] =
          searchBonus > 0 ? { ...l, remainingSearches: l.remainingSearches + searchBonus } : l;
      }

      // Designate the extraction zone and open its window.
      //
      // The world is only built within SCAVENGE_RADIUS of spawn, so choosing
      // from `list` can never produce anything more than 1.5 km away — that is
      // what made the first evac a stroll. Sweep the island-wide baked set
      // instead and drop the chosen site straight into the world as a distant,
      // known objective; trek/travel calls ensureWorldAround so the ground
      // around it (and the corridor toward it) fills in as the player nears.
      let evacZoneId: string | null = null;
      try {
        const island = filterWalkablePois(
          await bakedPoisNear(spawn.lat, spawn.lng, EVAC_ISLAND_RADIUS),
        );
        const far = pickDistantEvacPoi(island, spawn, rng.fork('evac'));
        if (far) {
          // Take the site *by id*, never `[0]`. `buildLocations` ends in
          // `bridgeWorld`, which strings stepping-stone waypoints every 420 m
          // toward a distant node and returns the lot sorted by distance from
          // spawn — so for a 20 km evac the first element is a synthetic
          // waypoint a few hundred metres away, not the site that was chosen.
          const built = buildLocations(rng.fork('evacsite'), spawn, [far], net).find(
            (l) => l.id === far.osmId && l.category !== 'waypoint',
          );
          if (built) {
            // Already in the world? Keep the world's copy and just mark it.
            locations[built.id] = locations[built.id] ?? built;
            evacZoneId = built.id;
          }
        }
      } catch {
        // No bake — fall through to the local pick below.
      }
      if (!evacZoneId) evacZoneId = pickEvacZone(list);

      const firstWindow = evacWindowHours(true, 1);
      const evacDeadline = totalGameHour(1, START_HOUR) + firstWindow;
      set({ hordeLevel: 0, evacZoneId, evacDeadline, evacCooldownUntil: null, escaped: false });
      const evacLoc = evacZoneId ? locations[evacZoneId] : null;
      if (evacLoc) {
        pushLog(
          `Radio static, then a voice: "Evac staging at ${evacLoc.name}. Pack fuel, meds, and ammo — the heavier that kit, the better. We hold the window ${firstWindow} hours, no more. Stay longer and the score climbs — but so does the city."`,
          'good',
        );
      }

      // Starting kit comes from ItemDef.startingItem flags (editable in the DEV loot browser).
      let items: ItemInstance[] = [];
      const equipment = emptyEquipment();
      for (const def of Object.values(ITEMS)) {
        if (!def.startingItem) continue;
        if (def.slot && !equipment[def.slot]) {
          equipment[def.slot] = {
            uid: `equip_start_${def.id}`,
            defId: def.id,
            container: `equip:${def.slot}`,
            x: 0,
            y: 0,
            rotated: false,
            stack: 1,
            condition: def.maxCondition ?? 100,
          };
        } else {
          const count = Math.max(1, def.startingCount ?? 1);
          items = addToGrid(items, 'backpack', def.id, count).items;
        }
      }

      // Promote up to two sites per faction to outposts, seed services, and
      // reveal outpost pins so they read as destinations from day one.
      const outposts = pickOutposts(Object.values(locations));
      const withServices = applyFactionServices(locations, outposts, get().seed);

      set({
        locations: withServices,
        items,
        equipment,
        outposts,
        // Who you were before the world ended still counts for something: a
        // build can start owing somebody a favour, or having been somebody's
        // neighbour.
        factionStanding: startingStanding(get().character!.traitIds),
      });
      for (const [fid, ids] of Object.entries(outposts)) {
        const cfg = FACTION_CONFIG[fid as Exclude<FactionId, null>];
        for (const id of ids ?? []) {
          const loc = withServices[id];
          if (!loc) continue;
          pushLog(
            `Word is ${cfg.shortName} run a ${cfg.outpostName.toLowerCase()} out of ${loc.name}, ${loc.distanceFromSpawn} m off — full services if they know you.`,
            'info',
          );
        }
      }
      persist();
      return 'ok';
    },

    travel: (locationId) => {
      const s = get();
      const loc = s.locations[locationId];
      if (!loc || s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim) return;
      if (s.meters.energy < 5) {
        pushLog('Too exhausted to move out. Rest first.', 'bad');
        return;
      }

      const weather = weatherKindFor(s.seed, s.day);
      const encumbered = isEncumbered(
        s.items,
        s.character!.attributes,
        s.equipment,
        sumTraitMod(s.character!.traitIds, 'carryCapacityMod'),
      );

      const route = routeLandPath(s.currentPos, { lat: loc.lat, lng: loc.lng });
      if (!route) {
        pushLog(NO_DRY_ROUTE_MSG, 'bad');
        return;
      }
      const dist = route.lengthM;

      // You can only push so far in one go. Beyond your current range you must
      // hop via a closer waypoint, rest to recover, or walk a tunnel segment.
      const range = travelableRange(
        s.character!.attributes,
        s.meters.energy,
        moveFactor(s),
        weather,
        encumbered,
      );
      if (dist > range) {
        pushLog(
          `${loc.name} is ${dist} m off — too far to reach in one push (range ${range} m). Rest, hop closer, or go down into the tunnels.`,
          'bad',
        );
        return;
      }

      const est = estimateExpedition(
        dist,
        loc.category,
        s.character!.attributes,
        s.meters.energy,
        s.hour,
        weather,
        encumbered,
        moveFactor(s),
      );

      // Advance the in-game clock for the trip up front (search time is spent
      // later, on searching). Bail if the survivor dies en route.
      if (advanceTime(est.travelMin / 60)) return;
      bumpStats({ distanceM: dist });

      // Start pulling the destination cell while the glide runs so "?" beyond
      // the current bubble can appear by the time you land.
      void ensureWorldAround(loc.lat, loc.lng);

      // --- en-route risk: the open road is no longer free ---
      // Longer treks, darkness, foul weather, a swelling horde and a noisy
      // survivor all raise the odds of trouble between here and there.
      roadAmbushAt = null;
      {
        const now = get();
        const band = timeOfDay(now.hour);
        let p = (dist / 100) * 0.018;
        if (band === 'night') p += 0.12;
        else if (band === 'dusk') p += 0.06;
        p += hordeIntensity(now.hordeLevel) * 0.15;
        p += sumTraitMod(now.character!.traitIds, 'encounterChanceMod');
        if (band === 'night' || band === 'dusk') {
          p += sumTraitMod(now.character!.traitIds, 'nightEncounterChanceMod');
        }
        p += equipEncounterChanceMod(now.equipment);
        p += weatherEncounterMod(weather);
        // An open wound carries further than footsteps do.
        p += bleedEncounterMod(now.bodyParts);
        p = Math.max(0, Math.min(0.6, p));

        const encRng = new Rng(now.seed).fork(`road:${loc.id}:${now.day}:${Math.round(now.hour)}`);
        if (encRng.chance(p)) {
          const ambushW = Math.max(
            5,
            Math.round(55 * Math.max(0.15, 1 + sumTraitMod(now.character!.traitIds, 'ambushChanceMod'))),
          );
          const kind = encRng.weighted([
            ['ambush', ambushW],
            ['hazard', 30],
            ['find', 15],
          ] as const);
          if (kind === 'ambush') {
            roadAmbushAt = loc.id; // sprung on arrival
          } else if (kind === 'hazard') {
            const loss = 6 + encRng.int(0, 10);
            set({ meters: { ...now.meters, energy: clampMeter(now.meters.energy - loss) } });
            if (encRng.chance(0.3)) set({ bodyParts: applyWound(get().bodyParts, encRng.int(4, 9), encRng) });
            pushLog(flavor('roadHazard', { name: loc.name }), 'bad');
          } else {
            const pool = ['snacks', 'water_bottle', 'bandage', 'scrap_metal', 'duct_tape', 'batteries', 'instant_noodles', 'painkillers'];
            const defId = encRng.pick(pool);
            const res = addToGrid(get().items, 'backpack', defId, 1);
            if (res.leftover === 0) {
              set({ items: res.items });
              pushLog(`${flavor('roadFind', { name: loc.name })} (${itemDef(defId).name})`, 'good');
            } else {
              pushLog(`Something useful on the road to ${loc.name}, but your pack's full.`, 'info');
            }
          }
        }
      }

      // Kick off the walking glide; arrival logic runs when it finishes.
      // Duration scales with the trip length but is capped so it never drags.
      const from = s.currentPos;
      const durationMs = Math.min(2500, Math.max(800, Math.round(est.travelMin * 22)));
      pushLog(flavor('setout', { name: loc.name }), 'info');
      set({
        travelAnim: {
          fromLat: from.lat,
          fromLng: from.lng,
          toLat: loc.lat,
          toLng: loc.lng,
          path: route.points,
          toId: loc.id,
          startedAt: Date.now(),
          durationMs,
        },
      });
      setTimeout(() => arriveAt(loc.id), durationMs);
    },

    enter: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim || s.hdb) return;
      if (!s.currentPositionId) {
        pushLog('There\'s nothing to go into out here.', 'info');
        return;
      }
      enterLocation(s.currentPositionId);
    },

    sneakEnter: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim || s.hdb || s.raidMode) return;
      const id = s.currentPositionId;
      if (!id) return;
      const loc = s.locations[id];
      if (!loc?.factionId) return;
      if (hasFactionClearance(loc, s.factionStanding, s.day)) {
        pushLog('They already know your face here — no need to sneak.', 'info');
        return;
      }
      const rng = new Rng(s.seed).fork(`sneak:${loc.id}:${s.day}:${Math.round(s.hour)}`);
      const bonus = sumTraitMod(s.character!.traitIds, 'checkBonusMod');
      const dc = dcFor(loc.currentDanger);
      const res = rollCheck(rng, s.character!.attributes.dexterity, dc, bonus);
      if (res.success) {
        pushLog(
          res.roll === 20
            ? 'You ghost past the gate without a sound.'
            : `You slip past the gate (dex ${res.total} vs ${dc}).`,
          'good',
        );
        enterRaid(id, 'sneak');
        persist();
        return;
      }
      pushLog(`Spotted slipping in (dex ${res.total} vs ${dc}). Blades come out.`, 'bad');
      illicitStandingHit(id);
      startHumanCombat(id, loc.factionId, false, { pendingRaid: 'sneak' });
    },

    forceEnter: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim || s.hdb || s.raidMode) return;
      const id = s.currentPositionId;
      if (!id) return;
      const loc = s.locations[id];
      if (!loc?.factionId) return;
      if (hasFactionClearance(loc, s.factionStanding, s.day)) {
        pushLog('They wave you through — drawing steel would be madness.', 'info');
        return;
      }
      pushLog('You force the gate. They answer in kind.', 'bad');
      illicitStandingHit(id);
      startHumanCombat(id, loc.factionId, false, { pendingRaid: 'force' });
    },

    raidSearch: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim || s.hdb) return;
      const raid = s.raidMode;
      if (!raid || raid.locationId !== s.currentPositionId) return;
      const loc = s.locations[raid.locationId];
      if (!loc?.factionId) {
        clearRaid();
        return;
      }
      if (loc.exhausted) {
        pushLog(flavor('pickedClean', { name: loc.name }), 'info');
        clearRaid();
        persist();
        return;
      }

      if (raid.mode === 'force') {
        pushLog('You tear into the shelves — and they hear you.', 'bad');
        illicitStandingHit(raid.locationId);
        startHumanCombat(raid.locationId, loc.factionId, false, { raidLoot: true });
        return;
      }

      // Sneak: each search is another dexterity check.
      const rng = new Rng(s.seed).fork(
        `raidsneak:${loc.id}:${s.day}:${loc.remainingSearches}`,
      );
      const bonus = sumTraitMod(s.character!.traitIds, 'checkBonusMod');
      const dc = dcFor(loc.currentDanger);
      const res = rollCheck(rng, s.character!.attributes.dexterity, dc, bonus);
      if (res.success) {
        pushLog(
          res.roll === 20
            ? 'You work the shelves without a whisper.'
            : `Quiet hands (dex ${res.total} vs ${dc}).`,
          'good',
        );
        attemptSearch(raid.locationId);
        persist();
        return;
      }
      pushLog(`Caught rifling the place (dex ${res.total} vs ${dc}).`, 'bad');
      illicitStandingHit(raid.locationId);
      startHumanCombat(raid.locationId, loc.factionId, false, { raidLoot: true });
    },

    // Walk out to bare coordinates. This is the release valve on a sparse map:
    // wherever the pins thin out, the streets between them are still walkable,
    // so no survivor is ever boxed in by the POI data. It is deliberately the
    // worse option — no loot, no stash, no roof, and the hazard field bites.
    trek: (lat, lng) => {
      const s = get();
      if (s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim) return;
      if (s.meters.energy < 5) {
        pushLog('Too exhausted to move out. Rest first.', 'bad');
        return;
      }

      const walk = walkabilityOf(lat, lng);
      if (walk !== 'ok') {
        pushLog(unplayableMessage(walk, 'trek'), 'bad');
        return;
      }

      const from = s.currentPos;
      const route = routeLandPath(from, { lat, lng });
      if (!route) {
        pushLog(NO_DRY_ROUTE_MSG, 'bad');
        return;
      }
      const dist = route.lengthM;
      if (dist < TREK_MIN_DISTANCE_M) {
        pushLog('That\'s a few steps, not a move. Pick somewhere worth the walk.', 'info');
        return;
      }

      const weather = weatherKindFor(s.seed, s.day);
      const encumbered = isEncumbered(
        s.items,
        s.character!.attributes,
        s.equipment,
        sumTraitMod(s.character!.traitIds, 'carryCapacityMod'),
      );

      // Open ground obeys the same one-push limit as everything else — it's an
      // escape hatch from bad geometry, not from the stamina economy.
      const range = travelableRange(
        s.character!.attributes,
        s.meters.energy,
        moveFactor(s),
        weather,
        encumbered,
      );
      if (dist > range) {
        pushLog(
          `That's ${dist} m of open ground — further than you can push in one go (range ${range} m).`,
          'bad',
        );
        return;
      }

      const est = estimateExpedition(
        dist,
        'fuel', // search time is discarded below; only the travel leg matters
        s.character!.attributes,
        s.meters.energy,
        s.hour,
        weather,
        encumbered,
        moveFactor(s),
      );
      if (advanceTime(est.travelMin / 60)) return;
      bumpStats({ distanceM: dist });

      // Prefetch the landing cell — open ground is how you leave the bubble.
      void ensureWorldAround(lat, lng);

      const now = get();
      const trekBand = timeOfDay(now.hour);
      const risk = trekRisk(
        now.seed,
        from,
        { lat, lng },
        {
          band: trekBand,
          hordeIntensity: hordeIntensity(now.hordeLevel),
          weatherEncounterMod: weatherEncounterMod(weather),
          traitEncounterMod:
            sumTraitMod(now.character!.traitIds, 'encounterChanceMod') +
            (trekBand === 'night' || trekBand === 'dusk'
              ? sumTraitMod(now.character!.traitIds, 'nightEncounterChanceMod')
              : 0) +
            equipEncounterChanceMod(now.equipment) +
            bleedEncounterMod(now.bodyParts),
          safe: now.spawn ?? undefined,
        },
        undefined,
        route.points,
      );

      // Exposure: crossing open ground costs stamina the clock alone wouldn't.
      set({
        meters: { ...now.meters, energy: clampMeter(now.meters.energy - risk.energyCost) },
      });

      const encRng = new Rng(now.seed).fork(
        `trek:${lat.toFixed(5)}:${lng.toFixed(5)}:${now.day}:${Math.round(now.hour)}`,
      );
      trekAmbush = null;
      if (encRng.chance(risk.encounterChance)) {
        // The nastiest thing on the route decides what comes for you.
        const worst = risk.hazards.reduce<HazardZone | null>(
          (acc, z) => (!acc || z.severity > acc.severity ? z : acc),
          null,
        );
        trekAmbush = { danger: risk.combatDanger, hazard: worst?.kind ?? null };
      }

      const durationMs = Math.min(2500, Math.max(800, Math.round(est.travelMin * 22)));
      const startedAt = Date.now();
      pushLog(flavor('trekOut'), 'info');
      set({
        travelAnim: {
          fromLat: from.lat,
          fromLng: from.lng,
          toLat: lat,
          toLng: lng,
          path: route.points,
          toId: null,
          startedAt,
          durationMs,
        },
      });
      setTimeout(() => arriveWilds(lat, lng, startedAt), durationMs);
    },

    tunnelEnter: (toStationId) => {
      const s = get();
      const from = s.currentPositionId ? s.locations[s.currentPositionId] : null;
      if (!from || s.combat || s.pendingEvent || s.tunnel || s.hdb) return;
      if (!from.isMrtStation || !from.mrtStationId) {
        pushLog('You have to be on a platform to get into the tunnels.', 'bad');
        return;
      }
      // One segment at a time — nothing runs, so you walk to the next platform
      // and no further. Neither end needs to be cleared: the stairs are open,
      // and what's waiting at the far end is the reason to go.
      const net = getMrtNetwork();
      if (!net || !adjacentEdge(net, from.mrtStationId, toStationId)) {
        pushLog(`That isn't the next stop — the tunnel from here doesn't run that way.`, 'bad');
        return;
      }
      if (s.meters.energy < 5) {
        pushLog('Too spent to walk a tunnel. Rest first.', 'bad');
        return;
      }

      // Resolving the far end can mean building it, so the rest happens once
      // there is somewhere to arrive.
      void ensureStationLocation(toStationId).then((to) => {
        if (!to) return;
        const cur = get();
        if (cur.combat || cur.pendingEvent || cur.tunnel || cur.hdb) return;

        // The STA still works the turnstiles at the stations they hold. Pay at
        // the gate and the descent happens on the other side of the event.
        // A fare bought today covers today. It used to be charged per descent,
        // which taxed every there-and-back twice and made the tunnels feel
        // like a turnstile rather than a route.
        const dayPass = (from.tollPaidThroughDay ?? -1) >= cur.day;
        if (
          from.factionId === 'sta' &&
          !dayPass &&
          (cur.factionStanding.sta ?? 0) < STANDING_TRUSTED
        ) {
          set({ pendingEvent: { locationId: from.id, event: mrtTollEvent(), tunnelTo: to.id } });
          return;
        }
        beginTunnel(to.id);
      });
    },

    tunnelStep: (nodeId) => {
      const s = get();
      const run = s.tunnel;
      if (!run || s.combat || s.pendingEvent) return;
      const node = run.nodes[nodeId];
      if (!node || !reachable(run).some((n) => n.id === nodeId)) return;

      // The walk between columns is charged first: whatever is on the node
      // happens after you have already spent the minutes getting to it.
      const walked = tunnelTick(run.minutesPerHop / 60);
      if (!walked) return;
      set({ tunnel: stepTo(walked, nodeId) });
      // Save the move itself before resolving it. A fight is never part of a
      // save, so without this a reload mid-contact would rewind you to the
      // previous node with the minutes already spent.
      persist();

      resolveTunnelNode(nodeId);
    },

    tunnelRest: () => {
      const s = get();
      const run = s.tunnel;
      if (!run || s.combat || s.pendingEvent) return;
      if (currentNode(run).kind !== 'settlement') return;

      const restored = sleepRestore(
        s.meters.energy,
        CAMP_REST_HOURS,
        s.meters,
        sumTraitMod(s.character!.traitIds, 'sleepRestoreMod'),
      );
      if (advanceTime(CAMP_REST_HOURS, restored, true)) return;
      const after = get().tunnel;
      if (!after) return;
      // Sleeping behind their barricade is the one thing down here that makes
      // the tunnel quieter rather than louder.
      set({ tunnel: addPressure(after, -REST_PRESSURE_RELIEF) });
      shiftStanding('sta', 1);
      pushLog(
        `You sleep ${CAMP_REST_HOURS} hours on a mat by the barricade. Someone else keeps watch.`,
        'good',
      );
      persist();
    },

    tunnelTreat: () => {
      const s = get();
      const run = s.tunnel;
      if (!run || s.combat || s.pendingEvent) return;
      if (currentNode(run).kind !== 'settlement') return;
      if (!hasBackpackItem('canned_food')) {
        pushLog('They will look at your injuries for a tin of food. You have none.', 'bad');
        return;
      }
      consumeBackpackItem('canned_food');
      if (advanceTime(1)) return;
      const g = get();
      const bodyParts = treatInjuries(g.bodyParts, 30, 'all');
      set({ bodyParts });
      shiftStanding('sta', 1);
      pushLog('Someone with steady hands and boiled water puts you back together.', 'good');
      persist();
    },

    tunnelAcceptOffer: () => {
      const s = get();
      const offer = s.tunnelOffer;
      if (!offer || !s.tunnel) return;
      if (!hasBackpackItem(offer.wantDefId)) {
        pushLog(`They want ${itemDef(offer.wantDefId).name}. You have none.`, 'bad');
        return;
      }
      consumeBackpackItem(offer.wantDefId);
      const r = addToGrid(get().items, 'backpack', offer.giveDefId, 1);
      set({ items: r.items, tunnelOffer: null });
      shiftStanding('sta', 1);
      pushLog(
        `Traded ${itemDef(offer.wantDefId).name} for ${itemDef(offer.giveDefId).name}. Nobody haggles down here.`,
        'good',
      );
      persist();
    },

    tunnelDeclineOffer: () => {
      set({ tunnelOffer: null });
    },

    // ---- faction hubs ----------------------------------------------------
    // Trade / rest / aid / intel. Gated by standing and by what the site was
    // seeded to offer — outposts have all four; ordinary territory fewer.

    openTrader: (locationId) => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim) return;
      const loc = s.locations[locationId];
      if (!loc?.factionId) return;
      if (s.currentPositionId !== locationId) return;
      if (!locationServices(loc, s.outposts).includes('trade')) {
        pushLog('Nobody is running a counter here.', 'info');
        return;
      }
      if (!hasFactionClearance(loc, s.factionStanding, s.day)) {
        pushLog('You are not on their grounds yet. Approach the gate first.', 'bad');
        return;
      }

      const fid = loc.factionId;
      if (!factionTrades(fid, s.factionStanding)) {
        pushLog(
          `${FACTION_CONFIG[fid].shortName} won't open the counter to a stranger. Earn their trust first.`,
          'bad',
        );
        return;
      }
      const rep = s.factionStanding[fid];
      const outpost = isOutpostSite(s.outposts, fid, locationId);
      set({
        trader: {
          factionId: fid,
          locationId,
          greeting: traderGreeting(fid, rep),
          offers: traderBoard(s.seed, fid, s.day, s.factionStanding, { outpost }),
          taken: s.traderTaken[`${fid}:${s.day}`] ?? [],
        },
      });
    },

    closeTrader: () => set({ trader: null }),

    acceptTrade: (offerId) => {
      const s = get();
      const t = s.trader;
      if (!t) return;
      const offer = t.offers.find((o) => o.id === offerId);
      if (!offer) return;
      if (t.taken.includes(offerId)) return;

      const want = itemDef(offer.wantDefId);
      const give = itemDef(offer.giveDefId);

      const held = s.items.filter(
        (i) => i.container === 'backpack' && i.defId === offer.wantDefId,
      ).reduce((n, i) => n + i.stack, 0);
      if (held < offer.wantCount) {
        pushLog(`They want ${offer.wantCount}× ${want.name}. You have ${held}.`, 'bad');
        return;
      }

      // Check the goods will fit *before* taking payment — a trade that eats
      // your tins and then can't hand you the medkit is a robbery with extra
      // steps.
      let items = s.items;
      for (let n = 0; n < offer.wantCount; n++) items = consumeOneOf(items, offer.wantDefId);
      const packed = addToGrid(items, 'backpack', offer.giveDefId, offer.giveCount);
      if (packed.leftover > 0) {
        pushLog(
          `No room in the pack for ${offer.giveCount}× ${give.name}. They wait while you sort yourself out.`,
          'bad',
        );
        return;
      }

      const taken = [...t.taken, offerId];
      set({
        items: packed.items,
        trader: { ...t, taken },
        traderTaken: { ...s.traderTaken, [`${t.factionId}:${s.day}`]: taken },
      });
      // Dealing straight with people is itself how you become someone they
      // deal straight with — but slowly, or the ladder would be a treadmill.
      if (taken.length % 3 === 0) shiftStanding(t.factionId, 1);
      pushLog(
        `Traded ${offer.wantCount}× ${want.name} for ${offer.giveCount}× ${give.name} with ${FACTION_CONFIG[t.factionId].shortName}.`,
        'good',
      );
      persist();
    },

    outpostRest: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim) return;
      const posId = s.currentPositionId;
      const loc = posId ? s.locations[posId] : null;
      if (!loc?.factionId) return;
      if (!locationServices(loc, s.outposts).includes('rest')) {
        pushLog('No beds on offer here.', 'info');
        return;
      }
      if (!hasFactionClearance(loc, s.factionStanding, s.day)) {
        pushLog('You are not on their grounds yet. Approach the gate first.', 'bad');
        return;
      }
      if (!factionShelters(loc.factionId, s.factionStanding)) {
        pushLog(
          `${FACTION_CONFIG[loc.factionId].shortName} will trade with you, but a bed behind the wire is for people they trust.`,
          'bad',
        );
        return;
      }

      const hoursToMorning =
        ((START_HOUR - s.hour + HOURS_PER_DAY) % HOURS_PER_DAY) || HOURS_PER_DAY;
      // The whole value of a faction bed: no encounter roll. Somebody else is
      // on the wire tonight.
      if (
        advanceTime(
          hoursToMorning,
          sleepRestore(
            s.meters.energy,
            hoursToMorning,
            s.meters,
            sumTraitMod(s.character!.traitIds, 'sleepRestoreMod'),
          ),
          true,
        )
      )
        return;
      bumpStats({ nightsSlept: 1 });
      set({ trader: null });
      discoverLocation(loc.id);
      pushLog(
        `You sleep behind ${FACTION_CONFIG[loc.factionId].shortName} wire. Morning comes without a roll.`,
        'good',
      );
      persist();
    },

    factionAid: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim) return;
      const posId = s.currentPositionId;
      const loc = posId ? s.locations[posId] : null;
      if (!loc?.factionId) return;
      if (!locationServices(loc, s.outposts).includes('aid')) {
        pushLog('No medic on this site.', 'info');
        return;
      }
      if (!hasFactionClearance(loc, s.factionStanding, s.day)) {
        pushLog('You are not on their grounds yet. Approach the gate first.', 'bad');
        return;
      }
      if (!factionOffersAid(loc.factionId, s.factionStanding)) {
        pushLog(
          `${FACTION_CONFIG[loc.factionId].shortName} keep their medics for people they trust.`,
          'bad',
        );
        return;
      }
      if ((loc.aidUsedDay ?? -1) >= s.day) {
        pushLog('They already patched you up today. Come back tomorrow.', 'info');
        return;
      }
      if (advanceTime(0.5)) return;
      const treated = treatInjuries(get().bodyParts, 8, 'one', false);
      set({
        bodyParts: treated,
        locations: {
          ...get().locations,
          [loc.id]: { ...get().locations[loc.id], aidUsedDay: s.day },
        },
      });
      pushLog(
        `${FACTION_CONFIG[loc.factionId].shortName} field aid: pressure, a wrap, and a shove back on your feet.`,
        'good',
      );
      persist();
    },

    factionIntel: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim) return;
      const posId = s.currentPositionId;
      const loc = posId ? s.locations[posId] : null;
      if (!loc?.factionId) return;
      if (!locationServices(loc, s.outposts).includes('intel')) {
        pushLog('Nobody here is sharing maps.', 'info');
        return;
      }
      if (!hasFactionClearance(loc, s.factionStanding, s.day)) {
        pushLog('You are not on their grounds yet. Approach the gate first.', 'bad');
        return;
      }
      if (!factionSharesIntel(loc.factionId, s.factionStanding)) {
        pushLog(
          `${FACTION_CONFIG[loc.factionId].shortName} don't brief strangers.`,
          'bad',
        );
        return;
      }
      if ((loc.intelUsedDay ?? -1) >= s.day) {
        pushLog('They already told you what they know today.', 'info');
        return;
      }
      if (advanceTime(0.25)) return;

      const rng = new Rng(s.seed).fork(`intel:${loc.id}:${s.day}`);
      const locs = { ...get().locations };
      locs[loc.id] = { ...locs[loc.id], intelUsedDay: s.day };

      // Prefer revealing a nearby undiscovered POI; else tip an outpost.
      const nearby = Object.values(locs)
        .filter((l) => l.id !== loc.id && !l.discovered)
        .map((l) => ({
          l,
          d: haversine(loc.lat, loc.lng, l.lat, l.lng),
        }))
        .filter((x) => x.d <= 1200)
        .sort((a, b) => a.d - b.d);

      if (nearby.length) {
        const pick = nearby[rng.int(0, Math.min(4, nearby.length) - 1)].l;
        const revealed: LocationState = {
          ...pick,
          discovered: true,
          isFactionRevealed: pick.factionId ? true : pick.isFactionRevealed,
        };
        revealed.lastSeen = snapshot(revealed);
        locs[pick.id] = revealed;
        set({ locations: locs });
        const tip = pick.isFactionOutpost
          ? `${FACTION_CONFIG[pick.factionId!].shortName} ${FACTION_CONFIG[pick.factionId!].outpostName}`
          : POI_CONFIG[pick.category].label;
        pushLog(
          `${FACTION_CONFIG[loc.factionId].shortName} tip you off: ${pick.name} (${tip}) about ${Math.round(haversine(loc.lat, loc.lng, pick.lat, pick.lng))} m out. Marked on your map.`,
          'good',
        );
      } else {
        const ops = (s.outposts[loc.factionId] ?? [])
          .map((id) => locs[id])
          .filter(Boolean);
        const other = ops.find((o) => o.id !== loc.id) ?? ops[0];
        set({ locations: locs });
        if (other) {
          pushLog(
            `${FACTION_CONFIG[loc.factionId].shortName}: "Our ${FACTION_CONFIG[loc.factionId].outpostName.toLowerCase()} at ${other.name} has the full counter — ${other.distanceFromSpawn} m from where you woke up."`,
            'good',
          );
        } else {
          pushLog(
            `${FACTION_CONFIG[loc.factionId].shortName} shrug. Nothing fresh on the board today.`,
            'info',
          );
        }
      }
      persist();
    },

    callEvac: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim) return;
      if (!s.evacZoneId || s.currentPositionId !== s.evacZoneId) {
        pushLog('You need to be at the evac zone to signal for a lift.', 'bad');
        return;
      }
      if (!hasEvacReadiness(s.items, s.day)) {
        pushLog(
          'The crew wants a heavier pack — fuel, meds, and ammo count most toward the lift.',
          'bad',
        );
        return;
      }
      pushLog('You pop the flare. Rotors thunder over the rooftops — they came.', 'good');
      winRun();
    },

    notify: (text, tone = 'info') => {
      pushLog(text, tone);
    },

    tickSearch: () => {
      const s = get();
      const session = s.pendingSearch;
      if (!session) return;
      const now = Date.now();
      const armed = ensureSearching(session, now);
      if (armed !== session) set({ pendingSearch: armed });

      const current = get().pendingSearch;
      if (!current) return;

      if (!hasFoggedOrSearching(current)) {
        // All slots revealed — leave session open for take / Done.
        if (current.searchingStartedAt != null) {
          set({ pendingSearch: { ...current, searchingStartedAt: null } });
        }
        return;
      }

      const head = current.slots.find((sl) => sl.id === current.queue[0]);
      if (!head) return;
      const uid = newUid();
      const result = tryReveal(current, now, uid);
      if (!result) return;

      const def = itemDef(result.slot.defId);
      const inst: ItemInstance = {
        uid,
        defId: result.slot.defId,
        container: current.containerId,
        x: result.slot.x,
        y: result.slot.y,
        rotated: result.slot.rotated,
        stack: result.slot.count,
        ...(result.slot.condition !== undefined ? { condition: result.slot.condition } : {}),
      };
      // Only place if it fits — layout already reserved the cells among slots.
      void def;
      set({
        pendingSearch: result.session,
        items: [...get().items, inst],
      });
      if (result.minutes > 0) {
        if (advanceTime(result.minutes / 60)) return;
      }
    },

    prioritizeSearchSlot: (slotId) => {
      const s = get();
      if (!s.pendingSearch) return;
      set({ pendingSearch: prioritizeSlot(s.pendingSearch, slotId, Date.now()) });
    },

    takeSearchItem: (uid) => {
      const s = get();
      const session = s.pendingSearch;
      if (!session) return;
      const slot = session.slots.find((sl) => sl.uid === uid && sl.state === 'found');
      if (!slot) return;
      const moved = relocateFoundItem(s.items, uid, session.stashLocationId);
      if (!moved) return;
      const nextSlots = session.slots.map((sl) =>
        sl.uid === uid ? { ...sl, state: 'taken' as const } : sl,
      );
      set({
        items: moved.items,
        pendingSearch: { ...session, slots: nextSlots, lastWhisper: null },
      });
      if (moved.lost) pushLog(`No room for the ${itemDef(moved.defId).name}.`, 'bad');
      else if (moved.stashed) {
        pushLog(`${itemDef(moved.defId).name} goes in the stash — pack is full.`, 'info');
      }
      persist();
    },

    takeAllFound: () => {
      const s = get();
      const session = s.pendingSearch;
      if (!session) return;
      let items = s.items;
      let working = session;
      let stashed = false;
      for (const slot of session.slots) {
        if (slot.state !== 'found' || !slot.uid) continue;
        const moved = relocateFoundItem(items, slot.uid, working.stashLocationId);
        if (!moved) continue;
        items = moved.items;
        if (moved.stashed || moved.lost) stashed = true;
        working = {
          ...working,
          slots: working.slots.map((sl) =>
            sl.id === slot.id ? { ...sl, state: 'taken' as const } : sl,
          ),
        };
      }
      set({ items, pendingSearch: working });
      if (stashed) pushLog('Pack full — extras went to the stash.', 'info');
      persist();
    },

    abortSearch: () => {
      const session = get().pendingSearch;
      if (!session) return;
      closeSearchSession(session, 'abort');
    },

    completeSearch: () => {
      const session = get().pendingSearch;
      if (!session) return;
      const mode = hasFoggedOrSearching(session) ? 'abort' : 'complete';
      closeSearchSession(session, mode);
    },

    resolveEvent: (choiceId) => {
      const s = get();
      const pe = s.pendingEvent;
      if (!pe) return;
      const ev = pe.event;
      const choice = ev.choices.find((c) => c.id === choiceId);
      if (!choice) return;
      const rng = s._eventRng ?? new Rng(s.seed).fork(`ev2:${pe.locationId}:${s.day}`);
      set({ pendingEvent: null, _eventRng: null });

      const grantAccess = () => {
        // Paying at the turnstile buys the stairs down, not a ride — the walk
        // itself is still ahead of you.
        if (pe.tunnelTo) {
          beginTunnel(pe.tunnelTo);
          return;
        }
        const site = get().locations[pe.locationId];
        if (site?.factionId) {
          // Occupied ground: clearance only — never search / HDB.
          pushLog(
            `${FACTION_CONFIG[site.factionId].shortName} let you on the grounds. No scavenging here — talk to them.`,
            'info',
          );
          persist();
          return;
        }
        attemptSearch(pe.locationId);
      };

      const fightOut = (foe?: LonerKind, opts?: { pendingRaid?: 'sneak' | 'force' }) => {
        if (foe) {
          startLonerCombat(pe.locationId, foe);
        } else if (ev.factionId) {
          startHumanCombat(pe.locationId, ev.factionId, false, {
            pendingRaid: opts?.pendingRaid,
          });
        } else {
          startHumanCombat(pe.locationId, 'syndicate_88', false, {
            pendingRaid: opts?.pendingRaid,
          });
        }
      };

      const applyTrespass = () => {
        illicitStandingHit(pe.locationId);
        const locs = get().locations;
        const cur = locs[pe.locationId];
        if (cur?.factionId && !cur.trespassStandingHit) {
          set({
            locations: {
              ...locs,
              [pe.locationId]: { ...cur, trespassStandingHit: true },
            },
          });
          pushLog('Trespassing here costs you with them.', 'bad');
        } else if (cur?.factionId) {
          pushLog('They already marked you for trespass here. Blades come out anyway.', 'bad');
        }
        fightOut(undefined, { pendingRaid: 'force' });
      };

      // --- effect interpreter --------------------------------------------
      // What a choice does is data on the choice, not a branch in here. Costs
      // and rewards land first; the one terminal effect (access / deny /
      // fight / zombies / trespass) is applied last, because it may hand
      // control to combat or to the search and never come back.
      const mark = (m: DoorwayMark) => {
        const locs = get().locations;
        const cur = locs[pe.locationId];
        if (!cur) return;
        const patch: Partial<LocationState> = {};
        if (m.door) patch.doorForced = true;
        if (m.survivorSettled) patch.survivorSettledDay = s.day;
        if (m.tollDays !== undefined) patch.tollPaidThroughDay = s.day + m.tollDays;
        set({ locations: { ...locs, [pe.locationId]: { ...cur, ...patch } } });
      };


      /** @returns false if the survivor died partway through. */
      const applyOne = (e: EventEffect): boolean => {
        switch (e.t) {
          case 'mark':
            mark(e.mark);
            return true;
          case 'standing':
            if (ev.factionId) shiftStanding(ev.factionId, e.delta);
            return true;
          case 'time':
            if (e.line) pushLog(e.line, 'info');
            return !advanceTime(e.hours);
          case 'energy': {
            const cur = get();
            set({ meters: { ...cur.meters, energy: clampMeter(cur.meters.energy - e.amount) } });
            if (e.line) pushLog(e.line, 'info');
            return true;
          }
          case 'wound': {
            const cur = get();
            set({ bodyParts: applyWound(cur.bodyParts, e.amount, rng) });
            pushLog(e.line, 'bad');
            return true;
          }
          case 'noise': {
            const cur = get();
            get().emitNoise(cur.currentPos.lat, cur.currentPos.lng, e.radius, e.intensity);
            return true;
          }
          case 'gain': {
            const cur = get();
            const def = itemDef(e.defId);
            const r = addToGrid(cur.items, 'backpack', e.defId, e.count ?? 1);
            if (r.leftover > 0 && (e.count ?? 1) === r.leftover) {
              pushLog(`${def.name} — but your pack is full.`, 'info');
            } else {
              set({ items: r.items });
              const got = (e.count ?? 1) - r.leftover;
              pushLog(`You come away with ${got}× ${def.name}.`, 'good');
            }
            return true;
          }
          case 'intel': {
            const locs = get().locations;
            const cur = locs[pe.locationId];
            if (!cur) return true;
            const updated: LocationState = { ...cur, isFactionRevealed: true, discovered: true };
            updated.lastSeen = snapshot(updated);
            set({ locations: { ...locs, [pe.locationId]: updated } });
            const richness = POI_CONFIG[cur.category].richness;
            const holder = cur.factionId ? FACTION_CONFIG[cur.factionId].shortName : 'nobody';
            pushLog(
              `You read ${cur.name}: held by ${holder}, danger ${Math.max(1, Math.round(cur.currentDanger))}/5, ` +
                `${richness >= 4 ? 'still worth a lot' : richness >= 2 ? 'worth a look' : 'thin pickings'}.`,
              'good',
            );
            return true;
          }
          // --- terminal ---
          case 'deny':
            pushLog(e.line, 'info');
            persist();
            return true;
          case 'fight':
            fightOut(e.foe);
            return true;
          case 'trespass':
            applyTrespass();
            return true;
          case 'raid':
            enterRaid(pe.locationId, e.mode);
            persist();
            return true;
          case 'zombies':
            pushLog(e.line, 'bad');
            startZombieCombat(pe.locationId, false);
            return true;
          case 'access':
            grantAccess();
            return true;
        }
      };

      const run = (effects: EventEffect[]) => {
        const terminal = effects.find(isTerminal);
        for (const e of effects) {
          if (isTerminal(e)) continue;
          if (!applyOne(e)) return; // died to the clock or the wound
        }
        if (terminal) applyOne(terminal);
        else persist();
      };

      switch (choice.kind) {
        case 'leave':
        case 'fight':
          run(choice.onSuccess);
          break;
        case 'pay': {
          // They named several things they'd take; hand over the first one you
          // actually have, which is also the one they'd rather be given.
          const paying = choice.itemIds?.find((id) => hasBackpackItem(id));
          if (paying) {
            consumeBackpackItem(paying);
            pushLog(`Handed over 1× ${itemDef(paying).name}.`, 'info');
            run(choice.onSuccess);
          } else {
            pushLog("You don't have anything they'll take.", 'bad');
            run(choice.onFailure ?? [{ t: 'deny', line: 'That ends the conversation.' }]);
          }
          break;
        }
        case 'check': {
          const attrKey = choice.attr!;
          const attrVal = s.character!.attributes[attrKey];
          const bonus = sumTraitMod(s.character!.traitIds, 'checkBonusMod');
          const res = rollCheck(rng, attrVal, choice.dc!, bonus);
          pushLog(
            `${choice.label} — ${attrEmoji(attrKey)} ${ATTRIBUTE_LABELS[attrKey]} d20 ${res.roll}+${attrVal}${bonus ? `+${bonus}` : ''}=${res.total} vs ${res.dc}: ${res.success ? 'success' : 'failure'}`,
            res.success ? 'good' : 'bad',
          );
          run(res.success ? choice.onSuccess : (choice.onFailure ?? [{ t: 'access' }]));
          break;
        }
      }
    },

    rest: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim) return;
      const hoursToMorning = ((START_HOUR - s.hour + HOURS_PER_DAY) % HOURS_PER_DAY) || HOURS_PER_DAY;

      // Sleeping rough in the open is not sleeping. You recover a fraction of
      // what four walls would give you, and the night gets a vote — otherwise
      // trekking out and napping would be a free reset.
      const exposed = s.currentPositionId === null;
      const fullRest = sleepRestore(
        s.meters.energy,
        hoursToMorning,
        s.meters,
        sumTraitMod(s.character!.traitIds, 'sleepRestoreMod'),
      );
      const restedEnergy = exposed
        ? Math.round(s.meters.energy + (fullRest - s.meters.energy) * EXPOSED_SLEEP_RECOVERY)
        : fullRest;
      if (advanceTime(hoursToMorning, restedEnergy, true)) return;
      bumpStats({ nightsSlept: 1 });

      // you slept here — your knowledge of THIS place stays current
      const posId = get().currentPositionId;
      if (posId) discoverLocation(posId);
      pushLog(flavor(exposed ? 'restExposed' : 'rest'), exposed ? 'bad' : 'info');

      if (exposed) {
        const g = get();
        const nightRng = new Rng(g.seed).fork(`roughsleep:${g.day}:${g.currentPos.lat.toFixed(5)}`);
        const risk = trekRisk(g.seed, g.currentPos, g.currentPos, {
          band: 'night',
          hordeIntensity: hordeIntensity(g.hordeLevel),
          weatherEncounterMod: 0,
          traitEncounterMod:
            sumTraitMod(g.character!.traitIds, 'encounterChanceMod') +
            sumTraitMod(g.character!.traitIds, 'nightEncounterChanceMod') +
            sumTraitMod(g.character!.traitIds, 'ambushChanceMod') * 0.15 +
            equipEncounterChanceMod(g.equipment) +
            bleedEncounterMod(g.bodyParts),
          safe: g.spawn ?? undefined,
        });
        if (nightRng.chance(Math.max(EXPOSED_SLEEP_MIN_RISK, risk.encounterChance))) {
          pushLog('Something found you in the dark.', 'bad');
          const enemy = makeZombie(nightRng, risk.combatDanger);
          set({
            combat: {
              locationId: null,
              zombie: enemy,
              round: 0,
              log: [{ round: 0, tone: 'bad', text: `You wake to ${enemy.name} standing over you.` }],
              over: false,
              outcome: null,
              playerHpSnapshot: totalHp(g.bodyParts),
              context: { locationId: null, grantOnFlee: false, wilds: true },
              selectedStance: 'guarded',
              terrain: TERRAIN.open_ground,
              awaitingStance: true,
              playerGauge: 0,
              enemyGauge: 0,
              acting: null,
              paused: false,
              speedIndex: 1,
            },
            _combatRng: nightRng.fork('fight'),
          });
          return;
        }
      }
      persist();
    },

    useItem: (uid) => {
      const s = get();
      // Fights are committed — no mid-swing bandages from the pack.
      if (s.combat && !s.combat.over) {
        pushLog('No time to dig through the pack mid-fight.', 'bad');
        return;
      }
      const inst = s.items.find((i) => i.uid === uid);
      if (!inst) return;
      const def = itemDef(inst.defId);
      const healBonus = sumTraitMod(s.character!.traitIds, 'healBonus');
      const foodEffectMod = sumTraitMod(s.character!.traitIds, 'foodEffectMod');
      const m = { ...s.meters };
      let newBodyParts = s.bodyParts;
      let consumed = false;
      let newRounds = s.rounds;
      // Spoiled food still feeds you — it just asks for something back.
      let spoiledInfection = 0;
      switch (def.effect.kind) {
        case 'food':
          m.hunger = clampMeter(m.hunger + Math.round(def.effect.hunger * (1 + foodEffectMod)));
          consumed = true;
          pushLog(`Ate ${def.name}. Hunger restored.`, 'good');
          break;
        case 'water':
          m.thirst = clampMeter(m.thirst + def.effect.thirst);
          consumed = true;
          pushLog(`Drank ${def.name}. Thirst quenched.`, 'good');
          break;
        case 'heal': {
          const healAmt = (def.effect.partHeal ?? 0) + (def.effect.health ?? 0) + healBonus;
          newBodyParts = treatInjuries(
            s.bodyParts,
            healAmt,
            def.effect.stopsBleeding,
            def.id === 'splint',
          );
          // A dirty dressing buys you the bleed and charges you the infection.
          // The Polyclinic Nurse's training takes most of that sting out.
          const risk = def.effect.infectionRisk ?? 0;
          if (risk > 0) {
            const resist = sumTraitMod(s.character!.traitIds, 'infectionResist');
            m.infection = clampMeter(m.infection + risk * (1 - resist));
          }
          consumed = true;
          pushLog(
            def.effect.stopsBleeding
              ? risk > 0
                ? `Bound the wound with ${def.name}. Bleeding stopped — it is not clean.`
                : `Used ${def.name}. Bleeding stopped, wound dressed.`
              : `Used ${def.name}. Patched up.`,
            risk > 0 ? 'info' : 'good',
          );
          break;
        }
        case 'cure':
          m.infection = clampMeter(m.infection - def.effect.infection);
          consumed = true;
          pushLog(`Took ${def.name}. Infection pushed back.`, 'good');
          break;
        case 'energy':
          m.energy = clampMeter(m.energy + def.effect.energy);
          consumed = true;
          pushLog(`Had a ${def.name}. Feeling sharper.`, 'good');
          break;
        case 'ammo': {
          newRounds = s.rounds + def.effect.rounds;
          consumed = true;
          pushLog(`Loaded ${def.effect.rounds} rounds. ${newRounds} in hand.`, 'good');
          break;
        }
        default:
          pushLog(`${def.name} can't be used directly.`, 'info');
      }
      if (consumed) {
        // Food that has gone over is a gamble, not a refusal — the player took
        // it knowing the bag had been warm for three days.
        if (def.perishable && def.effect.kind === 'food' && isBroken(inst)) {
          spoiledInfection = 12;
          m.infection = clampMeter(m.infection + spoiledInfection);
          pushLog(`${def.name} had turned. It sits badly — infection +${spoiledInfection}.`, 'bad');
        }
        set({
          meters: m,
          bodyParts: newBodyParts,
          rounds: newRounds,
          items: consumeOne(s.items, uid),
        });
        persist();
      }
    },

    moveItem: (uid, container, x, y, rotated) => {
      const s = get();
      const inst = s.items.find((i) => i.uid === uid);
      if (!inst) return false;
      // stashes can only be touched while standing at that location
      if (container !== 'backpack' && container !== s.currentPositionId) return false;
      if (inst.container !== 'backpack' && inst.container !== s.currentPositionId) return false;
      const def = itemDef(inst.defId);
      const { w, h } = footprint(def, rotated);
      if (!canPlace(container, s.items, { x, y, w, h }, uid)) return false;
      set({ items: s.items.map((i) => (i.uid === uid ? { ...i, container, x, y, rotated } : i)) });
      persist();
      return true;
    },

    rotateItem: (uid) => {
      const s = get();
      const inst = s.items.find((i) => i.uid === uid);
      if (!inst) return;
      const def = itemDef(inst.defId);
      if (def.w === def.h) return;
      const rotated = !inst.rotated;
      const { w, h } = footprint(def, rotated);
      if (!canPlace(inst.container, s.items, { x: inst.x, y: inst.y, w, h }, uid)) {
        pushLog('No room to rotate there.', 'bad');
        return;
      }
      set({ items: s.items.map((i) => (i.uid === uid ? { ...i, rotated } : i)) });
      persist();
    },

    transferItem: (uid, toContainer) => {
      const s = get();
      const inst = s.items.find((i) => i.uid === uid);
      if (!inst || inst.container === toContainer) return;
      if (toContainer !== 'backpack' && toContainer !== s.currentPositionId) {
        pushLog('You can only use this stash while here.', 'bad');
        return;
      }
      const others = s.items.filter((i) => i.uid !== uid);
      const def = itemDef(inst.defId);
      const slot = findSlot(toContainer, others, def);
      if (!slot) {
        pushLog('No space there.', 'bad');
        return;
      }
      set({
        items: s.items.map((i) =>
          i.uid === uid ? { ...i, container: toContainer, x: slot.x, y: slot.y, rotated: slot.rotated } : i,
        ),
      });
      persist();
    },

    dropItem: (uid) => {
      const s = get();
      const inst = s.items.find((i) => i.uid === uid);
      if (!inst) return;
      const def = itemDef(inst.defId);
      // The hoarder can't make themselves let go of anything.
      if (hasTraitFlag(s.character!.traitIds, 'cannotDropItems')) {
        pushLog(`You can't bring yourself to leave the ${def.name} behind.`, 'bad');
        return;
      }
      set({ items: s.items.filter((i) => i.uid !== uid) });
      pushLog(
        inst.stack > 1 ? `Dropped ${inst.stack}× ${def.name}.` : `Dropped ${def.name}.`,
        'info',
      );
      persist();
    },

    craftItem: (recipeId) => {
      const s = get();
      const recipe = RECIPES.find((r) => r.id === recipeId);
      if (!recipe) return;
      // A stash is a workbench: somewhere to put things down and take your time.
      const atShelter = s.currentPositionId !== null || s.hdb !== null;
      const inputs = adjustCraftInputs(recipe.inputs, s.character!.traitIds);
      const check = canCraft(recipe, s.items, atShelter, inputs);
      if (!check.ok) {
        pushLog(`Can't make that — ${check.reason.toLowerCase()}.`, 'bad');
        return;
      }
      if (advanceTime(recipe.hours)) return;

      let items = get().items;
      for (const [defId, need] of Object.entries(inputs)) {
        for (let n = 0; n < need; n++) items = consumeOneOf(items, defId);
      }
      const made = addToGrid(items, 'backpack', recipe.outputDefId, recipe.outputCount);
      const outName = itemDef(recipe.outputDefId).name;
      if (made.leftover === recipe.outputCount) {
        // The inputs are already gone; refusing now would eat them for nothing.
        const here = s.currentPositionId;
        const spilled = here
          ? addToGrid(items, here, recipe.outputDefId, recipe.outputCount)
          : { items, leftover: recipe.outputCount };
        set({ items: spilled.items });
        pushLog(
          spilled.leftover > 0
            ? `Made ${outName}, but there was nowhere to put it.`
            : `Made ${outName} — no room in the pack, so it's in the stash.`,
          spilled.leftover > 0 ? 'bad' : 'info',
        );
      } else {
        set({ items: made.items });
        pushLog(`Made ${recipe.outputCount}× ${outName}.`, 'good');
      }
      persist();
    },

    tearForRags: (uid) => {
      const s = get();
      const equippedSlot = (Object.keys(s.equipment) as (keyof Equipment)[]).find(
        (slot) => s.equipment[slot]?.uid === uid,
      );
      const inst = s.items.find((i) => i.uid === uid) ?? (equippedSlot ? s.equipment[equippedSlot] : null);
      if (!inst) return;
      const def = itemDef(inst.defId);

      if (!canTearForRags(def)) {
        pushLog(`${def.name} won't tear into anything useful.`, 'info');
        return;
      }
      // Below the threshold there is no whole cloth left worth cutting — the
      // garment is already more hole than shirt.
      if (conditionOf(inst) < TEAR_CONDITION_COST) {
        pushLog(`The ${def.name} is too far gone to get clean strips out of.`, 'bad');
        return;
      }
      if (advanceTime(TEAR_HOURS)) return;

      const now = get();
      const torn = degrade(
        now.items.find((i) => i.uid === uid) ??
          (equippedSlot ? now.equipment[equippedSlot]! : inst),
        TEAR_CONDITION_COST,
      );
      const items = now.items.map((i) => (i.uid === uid ? torn : i));
      const equipment = equippedSlot ? { ...now.equipment, [equippedSlot]: torn } : now.equipment;

      const made = addToGrid(items, 'backpack', 'cloth_rags', TEAR_RAGS_YIELD);
      if (made.leftover === TEAR_RAGS_YIELD) {
        pushLog('No room in the pack for the strips — make space first.', 'bad');
        return;
      }
      set({ items: made.items, equipment });
      pushLog(
        `Cut up the ${def.name} for ${TEAR_RAGS_YIELD - made.leftover}× ${itemDef('cloth_rags').name}. It won't protect you like it did.`,
        'info',
      );
      persist();
    },

    tearOwnClothes: () => {
      const s = get();
      if (s.clothingTears <= 0) {
        pushLog("There is nothing left of your clothes worth cutting.", 'bad');
        return;
      }
      if (advanceTime(TEAR_HOURS)) return;

      const now = get();
      const made = addToGrid(now.items, 'backpack', 'cloth_rags', TEAR_RAGS_YIELD);
      if (made.leftover === TEAR_RAGS_YIELD) {
        pushLog('No room in the pack for the strips — make space first.', 'bad');
        return;
      }
      const left = now.clothingTears - 1;
      set({ items: made.items, clothingTears: left });
      pushLog(
        left > 0
          ? `Cut strips off your own clothes. ${left} more like that and there is nothing left.`
          : 'Cut the last usable strip off your own clothes.',
        'info',
      );
      persist();
    },

    repairItem: (uid, materialDefId) => {
      const s = get();
      const inst =
        s.items.find((i) => i.uid === uid) ??
        Object.values(s.equipment).find((e) => e?.uid === uid) ??
        null;
      if (!inst) return;
      const def = itemDef(inst.defId);
      if (def.maxCondition === undefined) {
        pushLog(`${def.name} isn't something that wears out.`, 'info');
        return;
      }

      // Field repairs are quick, weapon-specific and need no workbench; the
      // toolbox route is slower, costs materials, and fixes anything.
      const field = materialDefId
        ? FIELD_REPAIRS.find((f) => f.defId === materialDefId)
        : undefined;
      if (field) {
        const isMelee = def.effect.kind === 'weapon' && !def.effect.ranged;
        if (def.effect.kind !== 'weapon' || isMelee !== field.melee) {
          pushLog(`${itemDef(field.defId).name} is no use on a ${def.name}.`, 'bad');
          return;
        }
        if (countOf(s.items, field.defId) < 1) {
          pushLog(`No ${itemDef(field.defId).name} left.`, 'bad');
          return;
        }
        if (advanceTime(0.5)) return;
        applyRepair(uid, field.amount, [field.defId]);
        return;
      }

      const atShelter = s.currentPositionId !== null || s.hdb !== null;
      if (!atShelter) {
        pushLog('You need somewhere to work — find a stash or a shelter.', 'bad');
        return;
      }
      if (countOf(s.items, REPAIR_TOOL) < 1) {
        pushLog(`You need a ${itemDef(REPAIR_TOOL).name} to do proper repairs.`, 'bad');
        return;
      }
      for (const [defId, need] of Object.entries(REPAIR_INPUTS)) {
        if (countOf(s.items, defId) < need) {
          pushLog(`Needs ${need}× ${itemDef(defId).name}.`, 'bad');
          return;
        }
      }
      if (advanceTime(REPAIR_HOURS)) return;
      applyRepair(
        uid,
        REPAIR_AMOUNT,
        Object.entries(REPAIR_INPUTS).flatMap(([defId, n]) => Array<string>(n).fill(defId)),
      );
    },

    equipItem: (uid, slot) => {
      const s = get();
      const inst = s.items.find((i) => i.uid === uid);
      if (!inst) return;
      const def = itemDef(inst.defId);
      if (!canEquip(def, slot)) {
        pushLog(`${def.name} can't go in the ${slot} slot.`, 'bad');
        return;
      }
      let nextItems = s.items.filter((i) => i.uid !== uid);
      const prev = s.equipment[slot];
      if (prev) {
        const backSlot = findSlot('backpack', nextItems, itemDef(prev.defId));
        if (!backSlot) {
          pushLog('No room to stow the currently-equipped item.', 'bad');
          return;
        }
        nextItems = [
          ...nextItems,
          { ...prev, container: 'backpack', x: backSlot.x, y: backSlot.y, rotated: backSlot.rotated },
        ];
      }
      const equipped = { ...inst, container: `equip:${slot}`, x: 0, y: 0, rotated: false };
      set({ items: nextItems, equipment: { ...s.equipment, [slot]: equipped } });
      pushLog(`Equipped ${def.name}.`, 'good');
      persist();
    },

    unequipItem: (slot) => {
      const s = get();
      const inst = s.equipment[slot];
      if (!inst) return;
      const backSlot = findSlot('backpack', s.items, itemDef(inst.defId));
      if (!backSlot) {
        pushLog('Backpack is full.', 'bad');
        return;
      }
      set({
        items: [
          ...s.items,
          { ...inst, container: 'backpack', x: backSlot.x, y: backSlot.y, rotated: backSlot.rotated },
        ],
        equipment: { ...s.equipment, [slot]: null },
      });
      persist();
    },


    combatSetStance: (stance) => {
      const s = get();
      if (!s.combat || s.combat.over) return;
      const weather = { kind: weatherKindFor(s.seed, s.day), time: timeOfDay(s.hour) };
      set({
        combat: {
          ...s.combat,
          selectedStance: stance,
          awaitingStance: false,
          // Both markers start level; from here it is speed that decides who
          // swings first, not turn order.
          playerGauge: 0,
          enemyGauge: 0,
          log: [...s.combat.log, ...openingNotes(s.combat.terrain, weather)],
        },
      });
      // Disengage resolves as a break-away attempt rather than a trade of blows.
      // Anything else commits: the track starts running and the fight plays
      // itself out.
      if (stance === 'disengage') get().combatFlee();
    },

    /** Bail out mid-fight — always resolved on the disengage profile. */
    combatBreakOff: () => {
      const s = get();
      if (!s.combat || s.combat.over) return;
      set({ combat: { ...s.combat, selectedStance: 'disengage' } });
      get().combatFlee();
    },

    // ---------------------------------------------- HDB vertical dungeon --

    hdbEnter: () => {
      const s = get();
      const loc = s.currentPositionId ? s.locations[s.currentPositionId] : null;
      if (!loc || s.combat || s.pendingEvent || s.hdb) return;
      if (loc.factionId) {
        pushLog(
          `${FACTION_CONFIG[loc.factionId].shortName} hold this block. You deal with them at the void deck — you don't crawl the stairs.`,
          'info',
        );
        return;
      }
      // A block you've already worked keeps its state — cleared units stay cleared.
      // Blocks saved before the cutaway strip topology have nothing safe to restore,
      // so they get rebuilt rather than loaded into a UI that would crash on them.
      const stored = s.hdbBlocks[loc.id];
      const saved = hasStripTopology(stored) ? stored : null;
      if (saved) {
        // The block settles while you're gone, but it doesn't forget entirely.
        // Re-enter at the void deck / lobby — fog memory stays in revealedLevels.
        const pos = { level: 1, column: saved.pos?.column ?? 0 };
        set({
          hdb: {
            ...saved,
            pos,
            currentLevel: 1,
            moveSeq: saved.moveSeq ?? 0,
            blockHeat: saved.blockHeat / 2,
            floors: saved.floors.map((f) => ({ ...f, heatLevel: f.heatLevel / 2 })),
            revealedLevels: saved.revealedLevels.includes(1)
              ? saved.revealedLevels
              : [1, ...saved.revealedLevels],
          },
        });
        pushLog(`You climb back into ${loc.name}. You remember which doors you've done.`, 'info');
        sweepFloor(1);
        return;
      }
      const archetype: HdbArchetype = loc.cleared && loc.factionId ? 'shelter' : 'estate';
      const rng = new Rng(s.seed).fork(`hdb:${loc.id}`);
      set({ hdb: generateDungeon(rng, loc, archetype) });
      pushLog(
        archetype === 'shelter'
          ? `You climb into ${loc.name}. Someone has made this block liveable.`
          : get().hdb?.groundKind === 'enclosed'
            ? `You push into the ground lobby of ${loc.name}. The stairs climb into the dark.`
            : `You slip under ${loc.name}'s void deck. Pillars, stair mouths, and the smell of old rain.`,
        'info',
      );
      sweepFloor(1);
    },

    hdbBreach: (unitId) => {
      const s = get();
      if (!s.hdb || s.combat) return;
      const level = s.hdb.currentLevel;
      const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
      // Boarded doors and finished rooms never open a second time.
      // Maze: you have to be standing on that door's cell.
      if (!unit || !unit.available || unit.state === 'cleared') return;
      if (s.hdb.pos.column !== unit.column || s.hdb.pos.level !== level) {
        pushLog('You need to walk to that door first.', 'info');
        return;
      }

      const outcome = breachOutcome(s.hdb, unit, level);
      if (advanceTime(outcome.minutes / 60)) return;

      const g = get();
      if (!g.hdb) return;
      const rng = new Rng(g.seed).fork(`breach:${g.hdb.locationId}:${unitId}`);
      set({ hdb: addHeat(updateUnit(g.hdb, level, unitId, { state: 'breached' }), outcome.heat, level) });
      if (outcome.noise > 0) {
        // Forcing a door is loud — the block hears it, and so does the street.
        get().emitNoise(g.currentPos.lat, g.currentPos.lng, outcome.noise, outcome.dangerBoost);
        pushLog(`You force ${unit.label}. The sound carries.`, 'bad');
      } else {
        pushLog(`You slip into ${unit.label} without touching the frame.`, 'info');
      }

      if (outcome.hazard && rng.chance(0.35)) {
        const dmg = rng.int(4, 12);
        const bodyParts = applyWound(get().bodyParts, dmg, rng);
        const hot = get().hdb;
        set({ bodyParts, ...(hot ? { hdb: addHeat(hot, HAZARD_HEAT, level) } : {}) });
        pushLog(`${outcome.hazard} — it costs you ${dmg} health.`, 'bad');
        const cause = checkDeath(get().meters, bodyParts);
        if (cause) {
          endRun(cause);
          return;
        }
      }

      // Re-read: the heat this breach added is what the roll has to answer to.
      const hot = get().hdb;
      if (!hot) return;
      const hdbUnit = { level, unitId, lootMod: outcome.lootMod };

      // A pinned block isn't guarding doors any more — it's hunting the floor.
      if (isHunting(hot)) {
        if (rng.chance(HUNT_ELITE_CHANCE)) {
          startZombieCombat(hot.locationId, false, {
            terrainOverride: 'hdb_corridor',
            enemy: makeBlockHunter(rng, floorThreat(hot, level)),
            intro: `The corridor behind you fills. Whatever ${unit.label} held, it isn't the problem now.`,
            hdbUnit,
          });
          return;
        }
        pushLog('Something heavy passes the corridor mouth and moves on.', 'info');
      } else if (rng.chance(outcome.encounterChance)) {
        startZombieCombat(hot.locationId, false, {
          terrainOverride: 'hdb_corridor',
          danger: floorThreat(hot, level),
          intro: `Something was waiting inside ${unit.label}.`,
          hdbUnit,
        });
        return;
      }

      // Clean entry — take the room.
      clearHdbUnit(level, unitId, outcome.lootMod, rng.fork('loot'));
      persist();
    },

    hdbGoTo: (target) => {
      const s = get();
      if (!s.hdb || s.combat) return;
      if (samePos(s.hdb.pos, target)) return;
      if (!canTargetCell(s.hdb, target)) return;

      const path = findPath(s.hdb, s.hdb.pos, target);
      if (!path || path.length < 2) {
        pushLog('No way through from here.', 'info');
        return;
      }

      const from = s.hdb.pos;
      const descending = pathDescends(path);
      const onStairs = pathUsesStairs(path);

      const seq = (s.hdb.moveSeq ?? 0) + 1;
      set({ hdb: { ...s.hdb, moveSeq: seq } });

      if (onStairs && isHunting(s.hdb)) {
        const huntRng = new Rng(s.seed).fork(
          `hunt:${s.hdb.locationId}:${posKey(from)}:${posKey(target)}:${s.day}:${seq}`,
        );
        if (huntRng.chance(HUNT_ELITE_CHANCE)) {
          if (advanceTime(STAIR_MINUTES / 60)) return;
          const g = get();
          if (!g.hdb) return;
          pushLog('The stairwell is not empty. It has been waiting.', 'bad');
          startZombieCombat(g.hdb.locationId, false, {
            terrainOverride: 'hdb_corridor',
            enemy: makeBlockHunter(huntRng, floorThreat(g.hdb, from.level)),
            intro: 'It fills the landing shoulder to shoulder.',
            hdbStairs: true,
          });
          return;
        }
        pushLog('You take the stairs in silence. Nothing follows — this time.', 'info');
      }

      if (descending && descentIsChecked(s.hdb)) {
        const rng = new Rng(s.seed).fork(
          `retreat:${s.hdb.locationId}:${from.level}:${s.day}:${seq}`,
        );
        const check = retreatCheck(rng, s.character!.attributes, s.hdb);
        pushLog(
          `Stairwell descent — ${attrEmoji('dexterity')} ${attrEmoji('endurance')} d20 ${check.roll}+${s.character!.attributes.dexterity + s.character!.attributes.endurance} = ${check.total} vs DC ${check.dc}`,
          check.success ? 'good' : 'bad',
        );
        if (!check.success) {
          if (advanceTime(STAIR_MINUTES / 60)) return;
          const g = get();
          pushLog('Something comes up the stairs to meet you.', 'bad');
          startZombieCombat(g.hdb!.locationId, false, {
            terrainOverride: 'hdb_corridor',
            danger: floorThreat(g.hdb!, from.level),
            intro: 'Cut off on the landing.',
            hdbStairs: true,
          });
          return;
        }
      }

      const minutes = pathMinutes(path);
      if (advanceTime(minutes / 60)) return;
      const g = get();
      if (!g.hdb) return;
      const wasNew = !g.hdb.revealedLevels.includes(target.level);
      set({ hdb: moveTo(g.hdb, target) });
      if (wasNew) sweepFloor(target.level);
    },

    hdbForceBlock: (key) => {
      const s = get();
      if (!s.hdb || s.combat) return;
      const adj = adjacentBreakableBlocks(s.hdb).find((a) => a.key === key);
      if (!adj) return;
      if (advanceTime(adj.block.minutes / 60)) return;
      const g = get();
      if (!g.hdb) return;
      const cleared = addHeat(clearBlock(g.hdb, key), adj.block.heat, g.hdb.pos.level);
      set({ hdb: cleared });
      get().emitNoise(g.currentPos.lat, g.currentPos.lng, 280, 1);
      pushLog(
        `You clear the ${BLOCK_META[adj.block.kind].label.toLowerCase()}. ${adj.block.minutes} min, loud.`,
        'bad',
      );
      persist();
    },

    /**
     * Dig out a welded gate or a packed landing. Slow, loud, and it buys a
     * floor nobody else has been able to reach — which is why it's worth it.
     */
    hdbForceSeal: (level) => {
      const s = get();
      if (!s.hdb || s.combat) return;
      const seal = s.hdb.floors[level - 1]?.sealed;
      if (!seal?.breakable) return;
      if (!forceableLevels(s.hdb).includes(level)) return;

      const from = s.hdb.currentLevel;
      if (advanceTime(seal.minutes / 60)) return;

      const g = get();
      if (!g.hdb) return;
      const rng = new Rng(g.seed).fork(`seal:${g.hdb.locationId}:${level}`);
      const opened = openSealedFloor(rng.fork('rooms'), g.hdb, level, g.hdb.archetype);
      set({ hdb: addHeat(opened, seal.heat, from) });
      get().emitNoise(g.currentPos.lat, g.currentPos.lng, 360, 2);
      pushLog(
        `You force the landing on ${String(level).padStart(2, '0')}. It takes ${seal.minutes} minutes and the whole block hears it.`,
        'bad',
      );

      // That much noise, in a stairwell, rarely goes unanswered.
      const hot = get().hdb;
      if (!hot) return;
      if (isHunting(hot)) {
        if (rng.chance(HUNT_ELITE_CHANCE)) {
          startZombieCombat(hot.locationId, false, {
            terrainOverride: 'hdb_corridor',
            enemy: makeBlockHunter(rng, floorThreat(hot, from)),
            intro: 'The noise brought it up the shaft.',
            hdbStairs: true,
          });
          return;
        }
      } else if (rng.chance(Math.min(0.6, 0.15 + floorThreat(hot, from) * 0.07))) {
        startZombieCombat(hot.locationId, false, {
          terrainOverride: 'hdb_corridor',
          danger: floorThreat(hot, from),
          intro: 'Something answers the hammering.',
          hdbStairs: true,
        });
        return;
      }
      persist();
    },

    hdbUseService: (unitId) => {
      const s = get();
      if (!s.hdb || s.combat) return;
      const level = s.hdb.currentLevel;
      const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
      if (!unit?.service || !unit.available || unit.state === 'cleared') return;
      if (s.hdb.pos.column !== unit.column || s.hdb.pos.level !== level) {
        pushLog('You need to walk to that door first.', 'info');
        return;
      }

      if (unit.service === 'safe_bunk') {
        const restored = sleepRestore(
          s.meters.energy,
          6,
          s.meters,
          sumTraitMod(s.character!.traitIds, 'sleepRestoreMod'),
        );
        if (advanceTime(6, restored, true)) return;
        pushLog('You sleep six hours behind a locked gate. Nothing finds you.', 'good');
      } else if (unit.service === 'field_doctor') {
        if (!hasBackpackItem('canned_food')) {
          pushLog('The doctor wants payment in food. You have none to give.', 'bad');
          return;
        }
        consumeBackpackItem('canned_food');
        if (advanceTime(1)) return;
        const g = get();
        const bodyParts = treatInjuries(g.bodyParts, 35, 'all');
        set({ bodyParts });
        pushLog('The field doctor patches you up for a tin of food.', 'good');
      } else {
        if (!hasBackpackItem('jewellery')) {
          pushLog('The trader looks at your pack and shrugs. Nothing they want.', 'info');
          return;
        }
        consumeBackpackItem('jewellery');
        const r = addToGrid(get().items, 'backpack', 'medkit', 1);
        set({ items: r.items });
        pushLog('You trade jewellery for a medkit. Gold is worth less every day.', 'good');
      }
      const hdb = updateUnit(get().hdb!, level, unitId, { state: 'cleared' });
      set({ hdb, hdbBlocks: { ...get().hdbBlocks, [hdb.locationId]: hdb } });
      persist();
    },

    hdbLeave: () => {
      const s = get();
      if (!s.hdb || s.combat) return;
      // Walking out from height takes the whole descent.
      const blockId = s.hdb.locationId;
      if (advanceTime((STAIR_MINUTES * (s.hdb.currentLevel - 1)) / 60)) return;
      const g = get();
      set({
        hdb: null,
        hdbBlocks: g.hdb ? { ...g.hdbBlocks, [blockId]: g.hdb } : g.hdbBlocks,
      });
      pushLog('You step back out onto the void deck.', 'info');
      persist();
    },

    // ------------------------------------------------------ noise & legacy --

    emitNoise: (lat, lng, radiusMeters, intensity) => {
      const s = get();
      const pulse = emitNoisePulse(lat, lng, radiusMeters, intensity);
      set({
        noisePulses: [...prunePulses(s.noisePulses), pulse],
        locations: applyPulse(s.locations, pulse),
      });
    },

    acceptGhostTrade: () => {
      const s = get();
      if (!s.ghostOffer) return;
      const { wantDefId, giveDefId } = s.ghostOffer;
      if (!hasBackpackItem(wantDefId)) {
        pushLog(`They want ${itemDef(wantDefId).name}. You have none.`, 'bad');
        return;
      }
      consumeBackpackItem(wantDefId);
      const r = addToGrid(get().items, 'backpack', giveDefId, 1);
      set({ items: r.items, ghostOffer: null });
      pushLog(`Trade made: ${itemDef(giveDefId).name}. They wish you better luck.`, 'good');
      persist();
    },

    declineGhostTrade: () => {
      set({ ghostOffer: null });
      pushLog('You leave them to their corner.', 'info');
    },

    combatTogglePause: () => {
      const s = get();
      if (!s.combat || s.combat.over) return;
      set({ combat: { ...s.combat, paused: !s.combat.paused } });
    },

    combatSetSpeedIndex: (i) => {
      const s = get();
      if (!s.combat) return;
      set({
        combat: {
          ...s.combat,
          speedIndex: Math.max(0, Math.min(COMBAT_SPEEDS.length - 1, i)),
        },
      });
    },

    /**
     * Advance the initiative track by `dtSeconds` of fight time (the panel has
     * already scaled real time by the chosen playback rate). Both markers move
     * every tick; whoever crosses the line takes a single action and is sent
     * back to the start carrying their overshoot. Nothing here assumes the
     * other side gets a reply — a Runner really can land two hits between your
     * swings, and a Brute really can be left behind.
     */
    combatTick: (dtSeconds) => {
      const s = get();
      const c = s.combat;
      if (!c || c.over || c.awaitingStance || c.paused || !s._combatRng || !s.character) return;

      const stance = STANCES[c.selectedStance];
      const pSpeed = playerSpeed(
        s.character.attributes,
        stance,
        s.meters.energy,
        legTravelFactor(s.bodyParts),
        equipSpeedBonus(s.equipment),
      );
      const playerGauge = c.playerGauge + pSpeed * dtSeconds;
      const enemyGauge = c.enemyGauge + c.zombie.speed * dtSeconds;

      // Nobody home yet — just slide the markers along.
      if (playerGauge < GAUGE_FULL && enemyGauge < GAUGE_FULL) {
        set({ combat: { ...c, playerGauge, enemyGauge, acting: null } });
        return;
      }

      // Both over the line on the same tick: the one further past it swings
      // first, and the loser keeps its gauge so it acts on the very next tick.
      const playerActs =
        playerGauge >= GAUGE_FULL &&
        (enemyGauge < GAUGE_FULL || playerGauge - enemyGauge >= 0);

      const round = c.round + 1;
      const weather = { kind: weatherKindFor(s.seed, s.day), time: timeOfDay(s.hour) };
      const pStats = playerCombatStats(
        s.character.attributes,
        s.character.traitIds,
        s.equipment,
        armCombatPenalty(s.bodyParts),
        s.rounds,
      );

      if (playerActs) {
        const res = resolvePlayerAction(
          s._combatRng,
          pStats,
          c.zombie,
          weather,
          round,
          stance,
          c.terrain,
          s.meters.energy,
        );
        const { equipment, notes } = applyWear(s.equipment, res.weaponWear, 0);
        const rounds = Math.max(0, s.rounds - res.roundsSpent);
        const zombie = { ...c.zombie, hp: res.zombieHpAfter };
        const log = [
          ...c.log,
          ...res.log,
          ...(res.roundsSpent > 0
            ? [{ round, tone: 'info' as const, text: `${rounds} rounds left.` }]
            : []),
          ...notes.map((text) => ({ round, tone: 'bad' as const, text })),
        ];
        const next = {
          ...c,
          zombie,
          round,
          log,
          acting: 'player' as const,
          playerGauge: playerGauge - GAUGE_FULL,
          enemyGauge: Math.min(enemyGauge, GAUGE_FULL),
        };

        if (res.zombieDead) {
          set({
            equipment,
            rounds,
            combat: { ...next, over: true, outcome: 'win' },
            kills: s.kills + 1,
          });
          bumpStats(zombie.kind === 'human' ? { humanKills: 1 } : { zombieKills: 1 });
        } else {
          set({ equipment, rounds, combat: next });
        }

        // Gunfire in an echoing space is heard for streets around.
        if (res.dangerNoise > 0) {
          const g = get();
          get().emitNoise(
            g.currentPos.lat,
            g.currentPos.lng,
            350 * res.dangerNoise,
            res.dangerNoise,
          );
        }
        if (res.timeCostHours > 0) advanceTime(res.timeCostHours);
        return;
      }

      // --- the enemy's turn ---
      const res = resolveEnemyAction(
        s._combatRng,
        pStats,
        c.zombie,
        weather,
        round,
        stance,
        c.terrain,
        s.meters.energy,
        s.character!.attributes,
        s.character!.traitIds,
        s.equipment,
        s.bodyParts,
      );
      const bodyParts =
        res.playerDamage > 0 && !res.dodged && res.hitZone
          ? applyPartDamage(
              s.bodyParts,
              res.hitZone,
              res.playerDamage,
              s._combatRng.fork(`wound:${round}`),
              {
                critical: res.critical,
                limbDamageMult: res.limbDamageMult,
                headCritReduction: res.headCritReduction,
                statusResist: res.statusResist,
              },
            )
          : s.bodyParts;
      const meters: Meters = {
        ...s.meters,
        infection: clampMeter(s.meters.infection + res.infectionGain),
      };
      const { equipment, notes } = applyWear(s.equipment, 0, res.armorWear, res.wearSlot);
      const dead = checkDeath(meters, bodyParts) !== null;
      const log = [...c.log, ...res.log, ...notes.map((text) => ({ round, tone: 'bad' as const, text }))];
      const next = {
        ...c,
        round,
        log,
        acting: 'enemy' as const,
        enemyGauge: enemyGauge - GAUGE_FULL,
        playerGauge: Math.min(playerGauge, GAUGE_FULL),
      };
      set({
        meters,
        bodyParts,
        equipment,
        combat: dead ? { ...next, over: true, outcome: 'dead' as const } : next,
      });
    },

    combatFlee: () => {
      const s = get();
      if (!s.combat || s.combat.over || !s._combatRng) return;
      const pStats = playerCombatStats(
        s.character!.attributes,
        s.character!.traitIds,
        s.equipment,
        armCombatPenalty(s.bodyParts),
        s.rounds,
      );
      const round = s.combat.round + 1;
      const stance = STANCES[s.combat.selectedStance];
      const res = attemptFlee(
        s._combatRng,
        s.character!.attributes,
        pStats,
        s.combat.zombie,
        round,
        stance,
        s.combat.terrain,
        s.meters.energy,
      );
      let fleeWearSlot: EquipSlot | null = null;
      const bodyParts =
        res.playerDamage > 0
          ? (() => {
              const zone = rollHitZone(s._combatRng!.fork(`flee-zone:${round}`));
              fleeWearSlot = slotForZone(zone) ?? 'body';
              const soak = limbArmorForZone(s.equipment, zone);
              const dmg = Math.max(1, res.playerDamage - soak);
              return applyPartDamage(
                s.bodyParts,
                zone,
                dmg,
                s._combatRng!.fork(`flee:${round}`),
                {
                  critical: zone === 'head',
                  limbDamageMult: res.limbDamageMult,
                  statusResist: statusResistForZone(s.equipment, zone),
                },
              );
            })()
          : s.bodyParts;
      const meters: Meters = { ...s.meters };
      // Running costs the weapon nothing, but a parting blow still lands on
      // the piece covering wherever it caught you.
      const { equipment, notes } = applyWear(
        s.equipment,
        0,
        res.playerDamage > 0 ? 0.5 + res.playerDamage * 0.15 : 0,
        fleeWearSlot,
      );
      const log = [
        ...s.combat.log,
        ...res.log,
        ...notes.map((text) => ({ round, tone: 'bad' as const, text })),
      ];
      const dead = checkDeath(meters, bodyParts) !== null;
      if (res.success && !dead) {
        set({ meters, bodyParts, equipment, combat: { ...s.combat, round, log, over: true, outcome: 'flee' } });
        bumpStats({ fightsFled: 1 });
      } else if (dead) {
        set({ meters, bodyParts, equipment, combat: { ...s.combat, round, log, over: true, outcome: 'dead' } });
      } else {
        set({ meters, bodyParts, equipment, combat: { ...s.combat, round, log } });
      }
    },

    combatContinue: () => {
      const s = get();
      if (!s.combat || !s.combat.over) return;
      const { outcome, context, locationId, zombie } = s.combat;
      if (outcome === 'dead') {
        endRun(checkDeath(s.meters, s.bodyParts) ?? 'health');
        return;
      }
      set({ combat: null, _combatRng: null, phase: 'game' });

      // grant human drops on a win
      if (outcome === 'win' && context.drops?.length) {
        let items = get().items;
        for (const defId of context.drops) items = addToGrid(items, 'backpack', defId, 1).items;
        set({ items });
        pushLog(`Looted the ${zombie.name}'s body.`, 'good');
      }

      // A fight in a stairwell is the loudest thing that happens in the block.
      // Applied before the unit settles, so the next door prices it in.
      if (context.hdbUnit || context.hdbStairs) {
        const g0 = get();
        if (g0.hdb) {
          const at = context.hdbUnit?.level ?? g0.hdb.currentLevel;
          set({ hdb: addHeat(g0.hdb, FIGHT_HEAT, at) });
        }
      }

      // Checked before the site-search fallback: a win underground settles the
      // node you're standing on, never the station up on the surface.
      if (context.tunnel) {
        const { nodeId, lootMod } = context.tunnel;
        const g = get();
        const run = g.tunnel;
        if (run) {
          const node = run.nodes[nodeId];
          const after = addPressure(markDone(run, nodeId), FIGHT_PRESSURE);
          set({ tunnel: after });
          if (outcome === 'win') {
            pushLog('It stops moving. The bore goes quiet again.', 'good');
            // The salvage this fight interrupted is still there afterwards.
            if (node && node.kind === 'scavenge') {
              grantTunnelSalvage(after, node, new Rng(g.seed).fork(tunnelKey(after, `loot:${nodeId}`)));
            } else if (lootMod > 0 && node) {
              grantTunnelSalvage(after, { ...node, lootMod }, new Rng(g.seed).fork(tunnelKey(after, `loot:${nodeId}`)));
            }
          } else {
            // There is no back. Breaking off means shoving past and walking on.
            pushLog('You shove past it in the dark and keep walking.', 'info');
          }
        }
        persist();
      } else if (context.hdbUnit) {
        // The doorway fight settles the unit: won, you take it; fled, you seal it
        // behind you. Either way you never open that door again.
        const { level, unitId, lootMod } = context.hdbUnit;
        const g = get();
        if (outcome === 'win' && g.hdb) {
          const rng = new Rng(g.seed).fork(`hdbloot:${g.hdb.locationId}:${unitId}`);
          clearHdbUnit(level, unitId, lootMod, rng);
        } else if (g.hdb) {
          const hdb = updateUnit(g.hdb, level, unitId, { state: 'cleared' });
          set({ hdb, hdbBlocks: { ...g.hdbBlocks, [hdb.locationId]: hdb } });
          pushLog('You back out of the doorway and leave that unit behind.', 'info');
        }
      } else if (context.hdbStairs) {
        pushLog(
          outcome === 'win'
            ? 'The landing clears. You keep your hand on the rail.'
            : 'You shoulder past it and keep going down.',
          outcome === 'win' ? 'good' : 'info',
        );
      } else if (context.wilds) {
        // Nothing out here to search or loot beyond what the body carried.
        if (outcome === 'win') pushLog('It stops moving. The street is yours again — for now.', 'good');
        else pushLog('You break contact and keep moving across the open.', 'info');
      } else if (context.roadAmbush) {
        // A road ambush isn't a search — winning just clears the way in.
        if (outcome === 'win') pushLog('You fight clear and reach the site.', 'good');
        else pushLog('You break away and duck into cover.', 'info');
      } else if (context.pendingRaid) {
        if (outcome === 'win') {
          enterRaid(locationId!, context.pendingRaid);
        } else {
          pushLog('You break off before you get inside.', 'info');
        }
      } else if (context.raidLoot) {
        if (outcome === 'win') {
          resolveSearch(locationId!, false);
        } else {
          pushLog('You break contact empty-handed — still inside, still hunted.', 'info');
        }
      } else if (outcome === 'win') {
        resolveSearch(locationId!, false);
      } else if (outcome === 'flee') {
        if (context.grantOnFlee) resolveSearch(locationId!, true);
        else pushLog('You slip away empty-handed.', 'info');
      }
      const cause = checkDeath(get().meters, get().bodyParts);
      if (cause) endRun(cause);
      else persist();
    },

    resetToMenu: () => {
      set({
        phase: 'menu',
        character: null,
        spawn: null,
        locations: {},
        currentPositionId: null,
        travelAnim: null,
        expandedCells: [],
        hordeLevel: 0,
        evacZoneId: null,
        evacDeadline: null,
        evacCooldownUntil: null,
        escaped: false,
        combat: null,
        _combatRng: null,
        hdb: null,
        hdbBlocks: {},
        tunnel: null,
        tunnelSeq: 0,
        tunnelOffer: null,
        noisePulses: [],
        ghostOffer: null,
        pendingEvent: null,
        pendingSearch: null,
        _eventRng: null,
        _eventClock: freshEventClock(),
        factionStanding: emptyStanding(),
        raidMode: null,
        log: [],
        stats: emptyRunStats(),
        hasSavedRun: !!loadRun(),
        highScores: loadHighScores(),
      });
    },

    continueRun: () => {
      const run = loadRun();
      if (!run) return;
      // Stations were bound to the network when the run was created; get it
      // back in memory so the tunnels still route.
      void loadMrtNetwork();
      void ensureZonesLoaded().catch(() => {
        /* trek/spawn degrade to country clip */
      });
      setBackpackWidthBonus(sumTraitMod(run.character.traitIds, 'gridWidthBonus'));
      set({
        phase: 'game',
        character: run.character,
        seed: run.seed,
        spawn: run.spawn,
        locations: run.locations,
        currentPositionId: run.currentPositionId,
        currentPos: run.currentPos,
        equipment: coerceEquipment(run.equipment),
        bodyParts: migrateBodyParts(run.bodyParts, run.maxHp),
        meters: migrateMeters(run.meters as Meters & { health?: number }),
        maxHp: run.maxHp,
        day: run.day,
        hour: run.hour,
        items: run.items,
        rounds: run.rounds ?? 0,
        clothingTears: run.clothingTears ?? OWN_CLOTHES_TEARS,
        kills: run.kills,
        stats: normalizeRunStats(run.stats),
        usedFallback: run.usedFallback,
        exploredArea: run.exploredArea ?? [],
        expandedCells: run.expandedCells ?? [],
        hordeLevel: run.hordeLevel ?? 0,
        evacZoneId: run.evacZoneId ?? pickEvacZone(Object.values(run.locations)),
        evacDeadline:
          run.evacDeadline ?? totalGameHour(run.day, run.hour) + evacWindowHours(true, run.day),
        evacCooldownUntil: run.evacCooldownUntil ?? null,
        escaped: false,
        travelAnim: null,
        worldLoading: false,
        worldError: null,
        combat: null,
        _combatRng: null,
        hdb: null,
        hdbBlocks: run.hdbBlocks ?? {},
        // Unlike a block, a tunnel run resumes exactly where it stopped. The
        // player's position only moves on arrival, so ejecting them here would
        // refund every node they hadn't walked yet.
        tunnel: resumableTunnel(run.tunnel),
        tunnelSeq: run.tunnelSeq ?? 0,
        tunnelOffer: null,
        noisePulses: [],
        ghostOffer: null,
        pendingEvent: null,
        pendingSearch: null,
        _eventRng: null,
        _eventClock: run.eventClock ?? { ...freshEventClock(), day: run.day },
        factionStanding: { ...emptyStanding(), ...(run.factionStanding ?? {}) },
        raidMode: null,
        // A save written before outposts existed has none. Rather than leave
        // that run permanently without markets, re-derive them from the world
        // it already has — the pick is deterministic, so a save written after
        // outposts existed lands on exactly the same sites (legacy single-id
        // shape is coerced to an array).
        outposts: (() => {
          const migrated = migrateOutposts(run.outposts);
          return Object.keys(migrated).length
            ? migrated
            : pickOutposts(Object.values(run.locations ?? {}));
        })(),
        trader: null,
        traderTaken: run.traderTaken ?? {},
        // The timeline is the run's memory — a resumed run keeps every day of it.
        log: run.log ?? [],
      });
      // Stamp services / outpost flags on any location that still lacks them.
      {
        const s = get();
        set({
          locations: applyFactionServices(s.locations, s.outposts, s.seed),
        });
      }
      // Mid-search items from a killed tab: fold them into pack / site stash.
      {
        const s = get();
        const orphans = s.items.filter((i) => i.container.startsWith('search:'));
        if (orphans.length > 0) {
          let items = s.items.filter((i) => !i.container.startsWith('search:'));
          const stashId = s.currentPositionId;
          for (const inst of orphans) {
            const packed = addToGrid(items, 'backpack', inst.defId, inst.stack, inst.condition);
            items = packed.items;
            if (packed.leftover > 0 && stashId) {
              items = addToGrid(items, stashId, inst.defId, packed.leftover, inst.condition).items;
            }
          }
          set({ items });
        }
      }
      // Keep new entries above anything restored, or React keys collide.
      logCounter = (run.log ?? []).reduce((m, e) => Math.max(m, e.id), logCounter);
      pushLog('You pick up where you left off.', 'info');

      // Old saves lack expandedCells; a resume far from spawn may also sit in a
      // thin bubble. Pull the cell underfoot so the neighbourhood fills in.
      void ensureWorldAround(run.currentPos.lat, run.currentPos.lng);

      // A fight is never part of a save. In the tunnel that would otherwise be
      // a free pass: reload while something has you cornered and walk off the
      // node as if you'd won it. It's still standing there.
      const resumed = get().tunnel;
      const at = resumed ? resumed.nodes[resumed.currentId] : null;
      if (resumed && at?.kind === 'pack' && at.state !== 'done') {
        pushLog('It never left. The bore is still occupied.', 'bad');
        startTunnelFight(resumed, at, 0);
      }
    },
  };
});

function consumeOne(items: ItemInstance[], uid: string): ItemInstance[] {
  const out: ItemInstance[] = [];
  for (const inst of items) {
    if (inst.uid !== uid) {
      out.push(inst);
      continue;
    }
    if (inst.stack > 1) out.push({ ...inst, stack: inst.stack - 1 });
  }
  return out;
}

// Dev/debug handle — lets tooling inspect the live store without fighting
// HMR module identity. Harmless in production.
if (typeof window !== 'undefined') {
  (window as unknown as { __game?: typeof useGame }).__game = useGame;
}
