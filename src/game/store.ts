import { create } from 'zustand';
import type {
  BodyParts,
  Character,
  CombatState,
  Equipment,
  EquipSlot,
  EventClock,
  FactionId,
  GameLogEntry,
  GamePhase,
  HighScore,
  ItemInstance,
  LocationState,
  LogScope,
  MapAnnotation,
  Meters,
  RunStats,
  StanceId,
  TerrainId,
  Enemy,
} from './types';
import { freshEventClock } from './types';
import { emptyRunStats, normalizeRunStats } from './stats';
import { Rng, randomSeed } from './rng';
import {
  adjustCraftInputs,
  attrEmoji,
  ATTRIBUTE_LABELS,
  hasTraitFlag,
  maxHpFor,
  startingStanding,
  sumTraitMod,
  traitFirstHitDamageMult,
  traitPoiLootBonus,
} from './character';
import { fetchOsmPois, haversine, type RawPoi } from './overpass';
import { bakedEvacPois, bakedPoisNear, ensureBakeLoaded } from './bakedPois';
import {
  ensureZonesLoaded,
  filterWalkablePois,
  unplayableMessage,
  walkabilityOf,
} from './playable';
import { NO_DRY_ROUTE_MSG, routeLandPath } from './route';
import {
  adjacentEdge,
  displayLine,
  getMrtNetwork,
  hopCollapsedFlags,
  loadMrtNetwork,
  nearestStationAny,
} from './mrt';
import { rollDestroyedTunnels } from './mrtDamage';
import {
  canExitHere,
  CARRIAGE_BAIT_CHANCE,
  CARRIAGE_INVERT_ENERGY,
  CARRIAGE_INVERT_MINUTES,
  CARRIAGE_SMASH_MINUTES,
  currentNode,
  generateTunnelRun,
  hazardDc,
  hazardMinutes,
  isArrival,
  markDone,
  nodeNeedsChoice,
  nodeThreat,
  reachable,
  setSightBonus,
  stepTo,
  TUNNEL_HAZARD,
  TUNNEL_NODE_META,
  tunnelKey,
  type CarriageChoice,
  type CheckpointChoice,
  type TunnelNode,
  type TunnelRun,
  type TunnelStationStop,
} from './tunnelRun';
import {
  hdbBlockScope,
  hdbFloorScope,
  hdbUnitScope,
  inferLogScope,
  siteScope,
  tunnelNodeScope,
  tunnelRunScope,
} from './logGroup';
import { buildLocations, generateFallbackWorld, makeStationLocation } from './world';
import {
  conditionRoll,
  conditionRollForRuin,
  ensureDestruction,
  isStreetLootPoi,
  itemDef,
  ITEMS,
  rollFactionRaidLoot,
  rollLoot,
  rollStreetLoot,
  streetHaulCount,
  type LootStack,
} from './loot';
import {
  addToGrid,
  arrangeOverflowClause,
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
  packGridForBag,
  tryArrangeInGrid,
  isBroken,
  isTwoHandedEquipped,
  limbArmorForZone,
  loadEffects,
  loadEffectsFor,
  newUid,
  OWN_CLOTHES_TEARS,
  TEAR_CONDITION_COST,
  TEAR_HOURS,
  TEAR_RAGS_YIELD,
  repair as repairInstance,
  syncBackpackBonuses,
  TEMP_STASH,
  slotForZone,
  spoil,
  statusResistForZone,
  conditionFamily,
  consumableScale,
  hasCondition,
  scaledRestore,
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
  DIRTY_WATER_DRINK_INFECTION,
  waterInputFor,
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
  guardArmFactor,
  headCombatPenalty,
  headSearchFactor,
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
  torsoCarryMult,
  torsoEnergyDrainMult,
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
import { mergeExploredCircles, snapshot, travelableRange, VISITED_LIGHT_RADIUS, type ExploredCircle } from './fog';
import { estimateExpedition, estimateTunnelWalk, searchMinutes } from './travel';
import {
  makeAnimalById,
  makeHulk,
  makeHuman,
  makeLoner,
  makeStalker,
  type LonerKind,
  makeZombie,
  playerCombatStats,
  resolvePlayerAction,
  resolvePlayerFireAction,
  resolveEnemyAction,
  playerReloadSpeed,
  openingNotes,
  playerSpeed,
  offHandCombatMods,
  weaponSpeedFactor,
  GAUGE_FULL,
  COMBAT_SPEEDS,
  attemptFlee,
  terrainForCategory,
  TERRAIN,
  STANCES,
} from './combat';
import {
  canCombatReload,
  clearFirearmSlotConflict,
  firearmProfile,
  holsteredFirearm,
  loadGunFromMagazine,
  loadedRoundsOf,
  refillHolsteredFirearm,
  refillMagazineFromAmmo,
  resolveCombatReload,
  gunshotNoiseRadius,
  gunFireDamage,
  stampFirearmLoot,
  isGunClubMainHand,
  usesMagazine,
} from './firearms';
import { fullEquipment } from './equipmentSlots';
import {
  ENEMIES,
  rollAnimalDrop,
  rollHumanDrop,
  rollLonerDrop,
} from './enemies';
import {
  EVENT_COOLDOWN_HOURS,
  EVENT_MAX_PER_DAY,
  clampStanding,
  emptyStanding,
  fieldDoctorEvent,
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
  type SavedRun,
} from './storage';
import { cancelPersist, flushPersist, rehydrateLocationOutlines, schedulePersist, writeSavedRun } from './persistRun';
import {
  applyFactionTurfReveal,
  applyPreciseReveal,
  createRumourAnnotation,
  DEFAULT_INTEL_RADIUS_M,
  DEFAULT_RUMOUR_FUZZ_M,
  MAX_MAP_ANNOTATIONS,
  pickIntelTarget,
  pruneMapAnnotations,
} from './intel';
import { tickLocationClock } from './locationClock';
import { POI_CONFIG } from './poi';
import {
  FACTION_CONFIG,
  applyFactionServices,
  canKinSearch88Deck,
  escortCandidates,
  factionEscorts,
  factionFeeds,
  factionOffersAid,
  factionSharesIntel,
  factionShelters,
  factionTrades,
  hasFactionClearance,
  isOutpostSite,
  locationServices,
  migrateOutposts,
  migrateStanding,
  migrateTraderTaken,
  pickOutposts,
  standingLabel,
  CANTEEN_HUNGER,
  CANTEEN_THIRST,
  ESCORT_ENCOUNTER_MOD,
  ESCORT_RANGE_M,
  INTEL_CATEGORIES,
  STANDING_KNOWN,
  type OutpostIds,
} from './factions';
import { traderBoard, traderGreeting, type TraderState } from './trade';
import { flavor } from './flavor';
import {
  trekRisk,
  TREK_LIGHT_RADIUS,
  TREK_MIN_DISTANCE_M,
  resolveCrossing,
  hazardsAtPoint,
  type HazardKind,
  type CrossingOutcome,
} from './wilds';
import {
  applySleepRecovery,
  applySleepOccupancy,
  evaluateSleepConditions,
  restAmbushPreview,
  type RestPreview,
  type SleepConditions,
} from './sleep';
import { vegetationCost } from './vegetation';
import { habitatAt, rollWildsEncounter, FLOODWATER_ANIMAL_CHANCE } from './wildsEncounter';
import type { AnimalHabitat } from './enemies';
import {
  addHeat,
  dropHeat,
  scoutFloor,
  breachOutcome,
  currentFloor,
  descentIsChecked,
  generateDungeon,
  floorThreat,
  isHunting,
  retreatCheck,
  findPathToward,
  hopMinutes,
  hopWalkMs,
  hopStoreysDropped,
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
  updateUnit,
  hasStripTopology,
  UNIT_META,
  LOCKPICK_ID,
  PICK_MINUTES,
  FOB_MINUTES,
  SHELTER_HEAT_DROP,
  SHELTER_HOURS,
  scaleDoorCost,
  pickCheck,
  grantFob,
  hasFob,
  migrateHdbDungeon,
  type BreachOutcome,
  type HdbArchetype,
  type HdbDungeon,
  type HdbEntry,
  type HdbPos,
  type HdbBlock,
} from './hdbDungeon';
import {
  applyPulse,
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
  makePressureAt,
  nearestRoofedShelter,
  nearestTown,
  pickGroundZero,
  townDangerMod,
  townTierAt,
  TOWN_FIELD_START_HORDE,
} from './townField';
import type { TownTier } from './townField';
import {
  EVAC_SCORE_BONUS,
  HORDE_MAX,
  HORDE_PER_DAY,
  evacReadiness,
  hordeIntensity,
  pickDistantEvacPoi,
  pickEvacZone,
  rollEvacCooldown,
  rollEvacDemand,
  pickNextEvacZone,
  evacWindowHours,
  type EvacDemandBias,
} from './goal';

/** How the crew phrases this window's cargo appetite once the channel is up. */
const BIAS_LOG: Record<EvacDemandBias, string> = {
  fuel: 'and they are asking for fuel above all.',
  meds: 'and they are asking for meds above all.',
  ammo: 'and they are asking for ammo above all.',
  balanced: 'and they will take it balanced.',
};

const SCAVENGE_RADIUS = 1500;
const DANGER_DEPLETE = 0.7;

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
  /** Ordered station ids for the planned route (origin → destination). */
  tunnelStationIds?: string[];
  /** Set when the event is a holdout counter inside an HDB block. */
  hdbService?: { level: number; unitId: string };
}

/**
 * A saved tunnel run is only worth resuming if it still has a graph. Anything
 * written by an older shape is dropped instead of migrated — the player is
 * still standing on the departure platform either way, so backing out of the
 * tunnel costs them the time they already spent and nothing else.
 */
function resumableTunnel(saved: TunnelRun | null | undefined): TunnelRun | null {
  if (!saved?.nodes || !saved.columns?.length || typeof saved.seq !== 'number') return null;
  if (!saved.stationIds?.length) {
    return {
      ...saved,
      stationIds: [saved.fromStation, saved.toStation].filter(Boolean),
      stationNames: [saved.fromName, saved.toName],
      stationLocationIds: [saved.fromLocationId, saved.toLocationId],
    };
  }
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
  /**
   * Travelable range at setout (before the trip's energy spend). The map fog
   * and planning ring hold this until arrival, then ease to the post-trip range.
   */
  departRange: number;
}

/** In-flight HDB cutaway walk. Runtime-only — not persisted. */
export interface HdbWalk {
  path: HdbPos[];
  /** Standing on path[index]; animating toward path[index + 1]. */
  index: number;
  startedAt: number;
  stepMs: number;
  blockedBy: HdbBlock | null;
  /** False when the path stops short of a corridor / stair block. */
  reached: boolean;
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

  /**
   * Neighbourhood that went first this run. Null on saves from before the town
   * field existed — those keep the old global horde intensity.
   */
  groundZeroId: string | null;

  // extraction goal + doom clock
  hordeLevel: number; // 0..HORDE_MAX; rises each day
  evacZoneId: string | null; // the location you must reach to escape
  evacDeadline: number | null; // absolute game-hour the current evac departs
  /**
   * Absolute game-hour the next window gets staged, while the channel is dark.
   * Non-null only between a missed evac and its replacement.
   */
  evacCooldownUntil: number | null;
  /** Seeded readiness this bird wants — never shown as a number in UI. */
  evacDemand: number | null;
  /** Soft cargo bias for the current window. */
  evacDemandBias: EvacDemandBias | null;
  /**
   * Has the player raised the channel at the pad and read the real manifest?
   * Scoped to the window, not the run — a fresh bird stages fogged again.
   */
  evacManifestRevealed: boolean;
  escaped: boolean; // true on a victory ending

  /**
   * Undirected edge keys (`a|b`) collapsed this run. Seeded at spawn with a
   * soft bias toward the first-evac corridor. Empty until the network rolls.
   * Collapsed hops stay walkable — a brutal crawl, not a wall.
   */
  destroyedTunnelEdges: string[];

  maxHp: number; // base max HP; effective max is reduced by injuries
  meters: Meters;
  bodyParts: BodyParts;
  day: number;
  hour: number;

  items: ItemInstance[];
  equipment: Equipment;
  /** Tears left in the clothes on your back — see `tearOwnClothes`. */
  clothingTears: number;
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
  /** Pin walking a cutaway path. Runtime-only. */
  hdbWalk: HdbWalk | null;

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
   * run, because "walk two kilometres to the Gotong kitchen" is only a plan if
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
  /**
   * One-shot Muster escort: the next travel to `toId` is walked with a patrol.
   * Runtime + save — a reload mid-walk should not refund the tribute.
   */
  escort: { toId: string } | null;

  /** Rumoured sites from smudged map notes — fuzzy pins until the target is found. */
  mapAnnotations: MapAnnotation[];

  log: GameLogEntry[];
  /**
   * Bumped when game logic needs the inventory panel open (e.g. tunnel
   * overflow → temp stash). UI watches the token.
   */
  inventoryOpenToken: number;

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
   * Descend and walk a planned tunnel route (one or many stations), named by
   * ordered network station ids. Destinations need not be in the built world
   * yet — far ends are built on arrival / mid-route exit.
   */
  tunnelEnterRoute: (stationIds: string[]) => void;
  /** @deprecated Prefer tunnelEnterRoute — kept as a one-hop convenience. */
  tunnelEnter: (toStationId: string) => void;
  /** Surface at the platform you're standing on (intermediate stop). */
  tunnelExitHere: () => void;
  /** Move onto one of the nodes ahead and deal with whatever is on it. */
  tunnelStep: (nodeId: string) => void;
  /** Sleep at the tunnel camp you're standing in. */
  tunnelRest: () => void;
  /** Have the camp look at your injuries, for a tin of food. */
  tunnelTreat: () => void;
  tunnelAcceptOffer: () => void;
  tunnelDeclineOffer: () => void;
  /** Stalled consist: drop under or smash through the cars. */
  tunnelCarriage: (choice: CarriageChoice) => void;
  /** STA in the bore: pay tribute or sneak past. */
  tunnelCheckpoint: (choice: CheckpointChoice) => void;
  /** Abandon leftover temp-crawl stash and resume. */
  confirmTempStash: () => void;
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
  /** Gotong canteen — eat/drink on site. Once per day. Known+. */
  factionFeed: () => void;
  /** Muster escort to a discovered site within range. Known+. One-shot. */
  factionEscort: (destinationId: string) => void;
  /** 88 Kin: walk an occupied residential block (once per site). */
  searchKinDeck: () => void;
  resolveEvent: (choiceId: string) => void;
  /** Advance the active sequential search (RAF from the timeline UI). */
  tickSearch: () => void;
  /** Click a fogged cell to search it next. */
  prioritizeSearchSlot: (slotId: string) => void;
  /** Move one found item from the search grid into the pack (stash overflow). */
  takeSearchItem: (uid: string) => void;
  /** Take every found item still in the search grid. */
  /** Moves every found slot into pack/stash. Returns false if it stopped early for lack of space. */
  takeAllFound: () => boolean;
  /** Abandon unsearched slots and any unclaimed finds; spend a partial search charge. */
  abortSearch: () => void;
  /** Finish after all slots are searched; abandon unclaimed finds (or abort if fogged remain). */
  completeSearch: () => void;
  /** Lazy-roll ruin on discovered street POIs missing destruction (old saves / UI). */
  ensureSiteRuin: (locationId: string) => void;
  callEvac: () => void;
  /** Append a short line to the run log (UI soft-rejects, etc.). */
  notify: (text: string, tone?: GameLogEntry['tone']) => void;
  rest: () => void;
  /** Preview sleep quality for the Rest button (same evaluator as rest()). */
  peekSleepConditions: () => SleepConditions;
  /** Recovery + night-priced ambush chance (same math rest() rolls). */
  peekRestPreview: () => RestPreview;
  /** Eat / drink / bandage / load ammo / etc. Named applyItem so oxlint doesn't treat it as a Hook. */
  applyItem: (uid: string) => void;
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
  /** Leave contact and start the initiative track (default Guarded). */
  combatEngage: () => void;
  /** Switch fight stance mid-combat — applies to subsequent actions. */
  combatSetStance: (stance: StanceId) => void;
  /** Bail out at contact or mid-fight — resolved on the disengage profile. */
  combatBreakOff: () => void;
  combatPrepareFire: () => void;
  refillMagazine: (magUid: string, ammoUid: string) => void;
  loadGunFromMagazine: (magUid: string) => void;
  refillFirearm: (ammoUid: string) => void;

  // --- HDB vertical dungeon ---
  hdbEnter: () => void;
  hdbBreach: (unitId: string) => void;
  hdbPick: (unitId: string) => void;
  /** Auto-path to a cutaway cell (maze + fog rules). */
  hdbGoTo: (pos: HdbPos) => void;
  /** Advance one hop of an in-flight cutaway walk. */
  hdbWalkStep: () => void;
  /** Clear a breakable corridor / stair block underfoot. */
  hdbForceBlock: (key: string) => void;
  hdbUnlockGate: (key: string) => void;
  hdbUseService: (unitId: string) => void;
  hdbUseShelter: (unitId: string) => void;
  hdbReadNotice: (unitId: string) => void;
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

/**
 * Zustand façade over the pure modules in this folder. New systems belong in
 * `src/game/<system>.ts` and hook `advanceTime` / `persist` — do not grow a
 * second gameplay store. Persist mapping lives in persistRun.ts; hour ticks
 * on locations live in locationClock.ts.
 */
export const useGame = create<State>((set, get) => {
  const pushLog = (
    text: string,
    tone: GameLogEntry['tone'],
    haul?: { loot: LootStack[]; leftover: LootStack[] },
    focus?: GameLogEntry['focus'],
    scope?: LogScope,
  ) => {
    logCounter += 1;
    const s = get();
    const resolvedScope =
      scope ??
      inferLogScope({
        pendingSearch: s.pendingSearch,
        pendingEvent: s.pendingEvent,
        combat: s.combat,
        hdb: s.hdb,
        tunnel: s.tunnel,
        locations: s.locations,
        traveling: !!s.travelAnim,
      });
    const { day, hour } = s;
    const entry = {
      id: logCounter,
      text,
      tone,
      day,
      hour,
      loot: haul?.loot,
      leftover: haul?.leftover,
      focus,
      scope: resolvedScope,
    };
    // Newest-first, but trim only once we are actually at the cap. The old
    // spread-then-slice allocated two 4000-element arrays per line, and a
    // single search haul or combat round calls this many times over.
    set((st) => ({
      log: [entry, ...(st.log.length >= LOG_CAP ? st.log.slice(0, LOG_CAP - 1) : st.log)],
    }));
  };

  const siteLogScope = (locationId: string): LogScope | undefined => {
    const loc = get().locations[locationId];
    return loc ? siteScope(locationId, loc.name) : undefined;
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
   * Weapon wear hits mainHand; `offHandWear` hits offHand. Armor wear prefers
   * the piece covering the hit zone (or the shield, when a block lands);
   * other wearables take a light scrape so the rest of the kit still ages.
   */
  const applyWear = (
    equipment: Equipment,
    weaponWear: number,
    armorWear: number,
    wearSlot: EquipSlot | null = null,
    offHandWear = 0,
    weaponSlot: EquipSlot = 'mainHand',
  ): { equipment: Equipment; notes: string[] } => {
    if (weaponWear <= 0 && armorWear <= 0 && offHandWear <= 0) return { equipment, notes: [] };
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

    if (weaponWear > 0) wearOne(weaponSlot, weaponWear);
    if (offHandWear > 0) wearOne('offHand', offHandWear);

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

  const loadOf = (s: {
    items: ItemInstance[];
    character: Character | null;
    equipment: Equipment;
    bodyParts?: BodyParts;
  }) =>
    s.character
      ? loadEffectsFor(
          s.items,
          s.character.attributes,
          s.equipment,
          sumTraitMod(s.character.traitIds, 'carryCapacityMod'),
          s.bodyParts ? torsoCarryMult(s.bodyParts) : 1,
        )
      : loadEffects(0);

  /**
   * Combat resolution prelude, hoisted out of `combatTick`.
   *
   * `CombatPanel` ticks at 20 Hz (TICK_MS = 50), but every value here is a pure
   * function of the state references in `combatPreludeDeps` — and those only
   * change when the player actually acts. Computing it unconditionally meant
   * minting a fresh seedrandom instance (`weatherKindFor`), walking the whole
   * `items` array twice, and rebuilding the stat block 20x a second just to
   * reach the "gauges are still filling" early-out. Memoised below; same inputs
   * give the same outputs, so combat resolves identically.
   */
  const computeCombatPrelude = (
    s: State,
    c: NonNullable<State['combat']>,
    character: NonNullable<State['character']>,
  ) => {
    const stance = STANCES[c.selectedStance];
    const weather = { kind: weatherKindFor(s.seed, s.day), time: timeOfDay(s.hour) };
    const load = loadOf(s);
    const eq = fullEquipment(s.equipment);
    const pStats = playerCombatStats(
      character.attributes,
      character.traitIds,
      eq,
      armCombatPenalty(s.bodyParts) + headCombatPenalty(s.bodyParts),
      load.attackMod,
    );
    const prepGun = c.firePrepared || c.reloadPrepared ? holsteredFirearm(eq) : null;
    const prepGunDef = prepGun ? itemDef(prepGun.defId) : null;
    const prepProfile = prepGunDef ? firearmProfile(prepGunDef) : null;
    const equipSpd =
      equipSpeedBonus(eq) + offHandCombatMods(eq, guardArmFactor(s.bodyParts)).speed;
    const pSpeed =
      prepGun && c.reloadPrepared
        ? playerReloadSpeed(
            character.attributes,
            stance,
            prepGun.defId,
            s.meters.energy,
            1,
            equipSpd,
            load.combatSpeedMult,
          )
        : prepGun && prepProfile
          ? playerSpeed(
              character.attributes,
              stance,
              s.meters.energy,
              1,
              equipSpd,
              weaponSpeedFactor(prepProfile, !!prepGunDef?.twoHanded),
              load.combatSpeedMult,
            )
          : playerSpeed(
              character.attributes,
              stance,
              s.meters.energy,
              1,
              equipSpd,
              pStats.speedFactor,
              load.combatSpeedMult,
            );
    return { stance, weather, load, eq, pStats, prepGun, prepGunDef, prepProfile, pSpeed };
  };

  /** Identity tuple the prelude memo is keyed on. */
  const combatPreludeDeps = (
    s: State,
    c: NonNullable<State['combat']>,
  ): readonly unknown[] => [
    s.seed,
    s.day,
    s.hour,
    s.items,
    s.equipment,
    s.character,
    s.bodyParts,
    s.meters.energy,
    c.selectedStance,
    c.firePrepared,
    c.reloadPrepared,
  ];

  let combatPrelude: {
    deps: readonly unknown[];
    value: ReturnType<typeof computeCombatPrelude>;
  } | null = null;

  let overloadLogDay = -1;
  const noteOverload = (day: number, ratio: number) => {
    if (ratio <= 1 || overloadLogDay === day) return;
    overloadLogDay = day;
    pushLog('The pack is pulling at every step.', 'info');
  };

  // Set by an en-route roll in travel(); consumed on arrival to spring a road
  // ambush before the site can be searched.
  let roadAmbush: {
    locationId: string;
    danger: number;
    hazard: HazardKind | null;
    forest: boolean;
    habitat: AnimalHabitat | null;
    floodwater: boolean;
  } | null = null;

  /**
   * Snapshot the run. Call sites stay `persist()` so actions stay explicit.
   * The write is debounced (≥5 s) and OSM outlines are stripped — see persistRun.ts.
   */
  const persist = () => {
    schedulePersist(() => {
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
        clothingTears: s.clothingTears,
        kills: s.kills,
        stats: s.stats,
        log: s.log,
        usedFallback: s.usedFallback,
        exploredArea: s.exploredArea,
        expandedCells: s.expandedCells,
        groundZeroId: s.groundZeroId,
        hordeLevel: s.hordeLevel,
        evacZoneId: s.evacZoneId,
        evacDeadline: s.evacDeadline,
        evacCooldownUntil: s.evacCooldownUntil,
        evacDemand: s.evacDemand,
        evacDemandBias: s.evacDemandBias,
        evacManifestRevealed: s.evacManifestRevealed,
        destroyedTunnelEdges: s.destroyedTunnelEdges,
        hdbBlocks: s.hdb ? { ...s.hdbBlocks, [s.hdb.locationId]: s.hdb } : s.hdbBlocks,
        tunnel: s.tunnel,
        tunnelSeq: s.tunnelSeq,
        eventClock: s._eventClock,
        factionStanding: s.factionStanding,
        outposts: s.outposts,
        traderTaken: s.traderTaken,
        escort: s.escort,
        mapAnnotations: s.mapAnnotations,
      };
      const result = writeSavedRun(run);
      if (result === 'quota') {
        pushLog('Save failed — storage is full. Drop weight or the next reload may forget this run.', 'bad');
      }
    });
  };

  const pressureFn = () => {
    const s = get();
    return makePressureAt(s.seed, s.groundZeroId, s.hordeLevel);
  };

  const doomDanger = (loc: LocationState) => {
    const s = get();
    const base = effectiveDanger(loc);
    if (!s.groundZeroId) return base;
    const tier = townTierAt(s.seed, s.groundZeroId, s.hordeLevel, loc.lat, loc.lng);
    return Math.max(0, Math.min(5, base + townDangerMod(tier)));
  };

  const endRun = (cause: Exclude<DeathCause, null>) => {
    cancelPersist();
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
      hdbWalk: null,
      // Dying underground still ends on the death screen, not behind a map of
      // the tunnel you didn't finish.
      tunnel: null,
      tunnelOffer: null,
      hasSavedRun: false,
    });
  };

  // Successful extraction — the one and only victory ending.
  const winRun = () => {
    cancelPersist();
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
      hdbWalk: null,
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
      evacDemand: null,
      evacDemandBias: null,
      evacManifestRevealed: false,
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
    const rolled = rollEvacDemand(
      new Rng(s.seed).fork(`evacdemand:${totalGameHour(s.day, s.hour)}`),
      s.day,
    );
    set({
      evacZoneId: nextId,
      evacDeadline: deadline,
      evacCooldownUntil: null,
      evacDemand: rolled.demand,
      evacDemandBias: rolled.bias,
      evacManifestRevealed: false,
    });
    const loc = nextId ? s.locations[nextId] : null;
    pushLog(
      loc
        ? `The channel wakes up: "New evac staging at ${loc.name}. ${windowH} hours. Pack fuel, meds, ammo — the bird won't name a quota. Move."`
        : 'The channel wakes up, but there is nowhere left to stage a lift.',
      loc ? 'good' : 'bad',
    );
  };

  const applyCrossingOutcome = (outcome: CrossingOutcome, vegEnergy: number, rng: Rng) => {
    const cur = get();
    let meters = {
      ...cur.meters,
      energy: clampMeter(cur.meters.energy - outcome.energyCost - vegEnergy),
      infection: clampMeter(cur.meters.infection + outcome.infectionDelta),
    };
    let bodyParts = cur.bodyParts;
    if (outcome.woundHp > 0) {
      if (outcome.woundPreferLeg) {
        const leg = rng.chance(0.5) ? 'leftLeg' : 'rightLeg';
        bodyParts = applyPartDamage(bodyParts, leg, outcome.woundHp, rng);
      } else {
        bodyParts = applyWound(bodyParts, outcome.woundHp, rng);
      }
    }
    set({ meters, bodyParts });
    for (const line of outcome.logs) pushLog(line.text, line.tone);
    if (outcome.extraHours > 0) {
      return advanceTime(outcome.extraHours, undefined, false, true);
    }
    return false;
  };

  const applyTravelFind = (
    rng: Rng,
    mode: 'road' | 'trek',
    destName?: string,
  ): { text: string; tone: 'good' | 'info' } => {
    const pool = [
      'snacks', 'water_bottle', 'bandage', 'scrap_metal', 'duct_tape',
      'batteries', 'instant_noodles', 'painkillers',
    ];
    const defId = rng.pick(pool);
    const res = addToGrid(get().items, 'backpack', defId, 1);
    const flavorKey = mode === 'road' ? 'roadFind' : 'trekFind';
    if (res.leftover === 0) {
      set({ items: res.items });
      return {
        text: `${flavor(flavorKey, { name: destName ?? 'open ground' })} (${itemDef(defId).name})`,
        tone: 'good',
      };
    }
    return {
      text: destName
        ? `Something useful on the way to ${destName}, but you can't carry it.`
        : 'Something useful in the open, but you can\'t carry it.',
      tone: 'info',
    };
  };

  // Advance clock by `hours`: passive meter drain + location danger regen.
  // Untouched sites keep their previous object identity — a new locations dict
  // on every hour would re-render the map HUD.
  const advanceTime = (
    hours: number,
    restedEnergy?: number,
    sleeping = false,
    skipNightfall = false,
    extraEnergyMult = 1,
  ): boolean => {
    const s = get();
    const prevBand = timeOfDay(s.hour);
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
      sumTraitMod(traitIds, 'bleedStopBonus'),
    );
    const partsAfterSystemic = tickSystemicDamage(bodyParts, s.meters, hours);
    const skyNow = weatherKindFor(s.seed, s.day);
    const outdoors = s.hdb === null;
    let meters = tickMeters(s.meters, hours, {
      sleeping,
      thirstMult: weatherThirstMult(skyNow),
      energyMult:
        weatherEnergyMult(skyNow) *
        (sleeping ? 1 : extraEnergyMult) *
        torsoEnergyDrainMult(partsAfterSystemic),
      hungerDrainMod: sumTraitMod(traitIds, 'hungerDrainMod'),
      thirstDrainMod: sumTraitMod(traitIds, 'thirstDrainMod'),
      energyDrainMod: sumTraitMod(traitIds, 'energyDrainMod'),
      outdoorEnergyDrainMod: sumTraitMod(traitIds, 'outdoorEnergyDrainMod'),
      outdoors,
      heat: skyNow === 'heat',
    });
    if (restedEnergy != null) meters = { ...meters, energy: restedEnergy };

    // danger creeps back toward baseDanger, faster for larger locations
    const locations = tickLocationClock(s.locations, hours, HOURS_PER_DAY);

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

    const newBand = timeOfDay(hour);
    const duskOrNight = newBand === 'dusk' || newBand === 'night';
    const crossedIntoDark =
      !skipNightfall &&
      !sleeping &&
      !g.travelAnim &&
      !g.hdb &&
      !g.tunnel &&
      g.currentPositionId === null &&
      !g.combat &&
      duskOrNight &&
      prevBand !== newBand &&
      (prevBand === 'day' || (prevBand === 'dusk' && newBand === 'night'));
    if (crossedIntoDark) {
      const pockets = hazardsAtPoint(
        g.seed,
        g.currentPos.lat,
        g.currentPos.lng,
        g.spawn ?? undefined,
        hordeIntensity(g.hordeLevel),
        { band: newBand, day, pressureAt: pressureFn() },
      );
      const swarm = pockets.find((z) => z.kind === 'night_swarm');
      pushLog(
        newBand === 'dusk' ? 'They\'re coming out.' : 'The streets belong to them now.',
        'bad',
      );
      if (swarm) {
        const fightRng = new Rng(g.seed).fork(
          `nightfall:${g.currentPos.lat.toFixed(5)}:${g.day}:${Math.round(hour)}`,
        );
        const nightHabitat = habitatAt(g.currentPos.lat, g.currentPos.lng);
        const { enemy, drops } = rollWildsEncounter(fightRng, Math.min(5, 3 + swarm.severity), {
          hazard: 'night_swarm',
          forest: nightHabitat === 'forest',
          habitat: nightHabitat,
          floodwater: pockets.some((z) => z.kind === 'floodwater'),
        });
        set({
          combat: {
            locationId: null,
            zombie: enemy,
            round: 0,
            log: [{ round: 0, tone: 'bad', text: `${enemy.name} finds you in the open as the light dies.` }],
            over: false,
            outcome: null,
            playerHpSnapshot: totalHp(g.bodyParts),
            context: { locationId: null, grantOnFlee: false, wilds: true, drops },
            selectedStance: 'guarded',
            terrain: TERRAIN.open_ground,
            awaitingStance: true,
            playerGauge: 0,
            enemyGauge: 0,
            acting: null,
            paused: false,
            speedIndex: 1,
            impact: null,
          },
          _combatRng: fightRng.fork('fight'),
        });
        return true;
      }
    } else if (prevBand !== newBand) {
      const sheltered = !!(g.currentPositionId || g.hdb || g.tunnel);
      if (newBand === 'dusk') {
        pushLog(flavor(sheltered ? 'duskFallsInside' : 'duskFalls'), sheltered ? 'info' : 'bad');
      } else if (newBand === 'night') {
        pushLog(flavor(sheltered ? 'nightFallsInside' : 'nightFalls'), sheltered ? 'info' : 'bad');
      } else {
        pushLog(flavor('dawnBreaks'), 'info');
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
    let updated: LocationState = { ...loc, discovered: true };
    if (wasNew && isStreetLootPoi(updated.category)) {
      updated = ensureDestruction(updated, s.seed);
    }
    updated.lastSeen = snapshot(updated);
    set((st) => ({
      locations: { ...st.locations, [locationId]: updated },
      exploredArea: wasNew
        ? mergeExploredCircles([
            ...st.exploredArea,
            { lat: loc.lat, lng: loc.lng, radius: VISITED_LIGHT_RADIUS },
          ])
        : st.exploredArea,
    }));
    if (wasNew) {
      const scope = siteLogScope(locationId);
      if (isStreetLootPoi(updated.category) && updated.destruction !== undefined) {
        pushLog(
          flavor('siteSurvey', {
            name: updated.name,
            size: updated.size,
            destruction: updated.destruction,
          }),
          'info',
          undefined,
          undefined,
          scope,
        );
      } else {
        pushLog(flavor('charted', { name: loc.name }), 'info', undefined, undefined, scope);
      }
    }
  };

  /** Persist ruin on older discovered street POIs when the card / UI touches them. */
  const ensureSiteRuin = (locationId: string) => {
    const s = get();
    const loc = s.locations[locationId];
    if (!loc?.discovered || !isStreetLootPoi(loc.category) || loc.destruction !== undefined) {
      return;
    }
    const updated = ensureDestruction(loc, s.seed);
    updated.lastSeen = snapshot(updated);
    set((st) => ({ locations: { ...st.locations, [locationId]: updated } }));
  };

  const hasBackpackItem = (defId: string): boolean =>
    get().items.some((i) => i.container === 'backpack' && i.defId === defId);

  /** Sleeping bag (or other sleepGear) in the pack or the stash at the current site. */
  const hasSleepingBagNearby = (): boolean => {
    const s = get();
    const pos = s.currentPositionId;
    return s.items.some((i) => {
      if (!itemDef(i.defId).sleepGear) return false;
      return i.container === 'backpack' || (pos != null && i.container === pos);
    });
  };

  const sleepContextFromState = (
    extras: { serviceBed?: boolean; inTunnelCamp?: boolean } = {},
  ): Parameters<typeof evaluateSleepConditions>[0] => {
    const s = get();
    const loc = s.currentPositionId ? s.locations[s.currentPositionId] : null;
    return {
      currentPositionId: s.currentPositionId,
      category: loc?.category ?? null,
      hdb: s.hdb
        ? { groundKind: s.hdb.groundKind, currentLevel: s.hdb.currentLevel }
        : null,
      hasSleepingBag: hasSleepingBagNearby(),
      serviceBed: extras.serviceBed,
      inTunnelCamp: extras.inTunnelCamp,
    };
  };

  const peekRestFromState = (): RestPreview => {
    const s = get();
    const pockets = hazardsAtPoint(
      s.seed,
      s.currentPos.lat,
      s.currentPos.lng,
      s.spawn ?? undefined,
      hordeIntensity(s.hordeLevel),
      { band: 'night', day: s.day, pressureAt: pressureFn() },
    );
    const conditions = applySleepOccupancy(
      evaluateSleepConditions(sleepContextFromState()),
      pockets,
    );
    if (!s.character) {
      return restAmbushPreview(conditions, 0);
    }
    const risk = trekRisk(s.seed, s.currentPos, s.currentPos, {
      band: 'night',
      hordeIntensity: hordeIntensity(s.hordeLevel),
      pressureAt: pressureFn(),
      weatherEncounterMod: 0,
      traitEncounterMod:
        sumTraitMod(s.character.traitIds, 'encounterChanceMod') +
        sumTraitMod(s.character.traitIds, 'nightEncounterChanceMod') +
        sumTraitMod(s.character.traitIds, 'ambushChanceMod') * 0.15 +
        equipEncounterChanceMod(s.equipment) +
        bleedEncounterMod(s.bodyParts),
      safe: s.spawn ?? undefined,
      day: s.day,
    });
    return restAmbushPreview(conditions, risk.encounterChance);
  };

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
    let loc = s.locations[locationId];
    if (!loc) return;
    if (loc.remainingSearches <= 0) {
      pushLog(flavor('searchEmpty', { name: loc.name }), 'info', undefined, undefined, siteLogScope(locationId));
      return;
    }

    // Lazy-migrate ruin on older saves when the player next searches.
    if (isStreetLootPoi(loc.category) && loc.destruction === undefined) {
      loc = ensureDestruction(loc, s.seed);
      set((st) => ({
        locations: {
          ...st.locations,
          [locationId]: { ...loc, lastSeen: snapshot(loc) },
        },
      }));
    }

    const lootRng = new Rng(s.seed).fork(
      `loot:${loc.id}:${loc.remainingSearches}:${s.day}:${Math.round(s.hour * 60)}`,
    );
    const lootMod =
      sumTraitMod(s.character!.traitIds, 'lootMod') +
      traitPoiLootBonus(s.character!.traitIds, loc.category);
    const perceptionBonus = Math.floor((s.character!.attributes.perception - 5) / 2);
    const raiding =
      !!loc.factionId &&
      s.raidMode?.locationId === locationId &&
      !!s.raidMode.mode;
    const street = isStreetLootPoi(loc.category);
    const loot = raiding
      ? rollFactionRaidLoot(
          lootRng,
          loc.category,
          POI_CONFIG[loc.category].richness,
          lootMod + perceptionBonus,
          loc.factionId!,
        )
      : street
        ? rollStreetLoot(
            lootRng,
            loc.category,
            lootMod + perceptionBonus,
            streetHaulCount(lootRng, loc.size),
          )
        : rollLoot(
            lootRng,
            loc.category,
            POI_CONFIG[loc.category].richness,
            lootMod + perceptionBonus,
            { guaranteeFind: true },
          );

    // Depletion tracks site size (search charges), not category richness —
    // richness only decides rolls-per-charge on legacy / non-street paths.
    const maxCharges = loc.size === 'large' ? 3 : loc.size === 'medium' ? 2 : 1;
    const spent = Math.max(0, maxCharges - loc.remainingSearches);
    const deplete = spent / Math.max(1, maxCharges);
    const ruinTier =
      street && loc.destruction !== undefined ? loc.destruction : null;
    const ruinSkew =
      ruinTier != null
        ? raiding
          ? Math.min(1, 0.4 + loc.currentDanger / 16)
          : Math.max(-1, Math.min(1, loc.currentDanger / 20 - deplete * 0.9))
        : 0;
    const bias =
      ruinTier != null
        ? 0
        : raiding
          ? Math.min(1, 0.4 + loc.currentDanger / 12)
          : Math.max(
              // First charge can still whisper "pristine" (~6%); later charges
              // need danger. HDB sealed doors stay the reliable near-new source.
              spent === 0 ? 0.5 : 0.2,
              Math.min(1, loc.currentDanger / 5 - deplete * 0.25),
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
      condition:
        ruinTier != null
          ? conditionRollForRuin(lootRng, stack.defId, ruinTier, ruinSkew)
          : conditionRoll(lootRng, stack.defId, bias),
    }));

    const speed =
      (searchSpeedFactor(
        equipSearchSpeedBonus(s.equipment),
        s.character!.attributes.perception,
        sumTraitMod(s.character!.traitIds, 'searchSpeedMod'),
      ) *
        loadOf(s).searchMult) /
      headSearchFactor(s.bodyParts);
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
        ? flavor('searchStartFlee', { name: loc.name })
        : raiding
          ? flavor('searchStartRaid', { name: loc.name })
          : flavor('searchStart', { name: loc.name }),
      'info',
    );
    persist();
  };

  /** Apply search-charge spend + danger deplete once per session. */
  const settleSearchSite = (session: SearchSession, chargeSpent: number) => {
    if (session.settled) {
      set({ pendingSearch: { ...session, settled: true } });
      return;
    }
    if (session.hdbUnit) {
      bumpStats({ hdbUnitsCleared: 1 });
      set({ pendingSearch: { ...session, settled: true } });
      return;
    }
    if (!session.spendCharges) {
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

    // Abandon fogged / searching / unclaimed finds. Explicit Take / Take all
    // already marked slots taken; Done and Leave leave the rest behind.
    const abandonedNote: LootStack[] = [];
    working = {
      ...working,
      slots: working.slots.map((sl) => {
        if (sl.state === 'fogged' || sl.state === 'searching') {
          return { ...sl, state: 'abandoned' as const, remainingMs: 0 };
        }
        if (sl.state === 'found') {
          abandonedNote.push({ defId: sl.defId, count: sl.count });
          return { ...sl, state: 'abandoned' as const, remainingMs: 0 };
        }
        return sl;
      }),
      queue: [],
      searchingStartedAt: null,
    };

    // Drop any stray items still in the session container (abandoned finds).
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
    const leftover = abandonedNote;
    bumpHaul(haulLoot, []);

    const unitLabel = working.hdbUnit?.label;
    const locName = unitLabel ?? get().locations[working.locationId]?.name ?? 'the site';
    if (working.hdbUnit) {
      if (haulLoot.length === 0 && leftover.length === 0 && mode === 'abort') {
        pushLog(flavor('searchAbortEmpty', { name: locName }), 'info');
      } else if (mode === 'abort') {
        pushLog(flavor('searchAbort', { name: locName }), 'info', {
          loot: haulLoot,
          leftover: [],
        });
      } else if (haulLoot.length === 0 && leftover.length === 0) {
        pushLog(flavor('searchBare', { name: locName }), 'info');
      } else if (haulLoot.length === 0) {
        pushLog(flavor('searchClear', { name: locName }), 'info');
      } else {
        pushLog(flavor('searchClear', { name: locName }), 'good', {
          loot: haulLoot,
          leftover: [],
        });
      }
    } else if (haulLoot.length === 0 && leftover.length === 0 && mode === 'abort') {
      pushLog(flavor('searchAbortEmpty', { name: locName }), 'info');
    } else if (mode === 'abort') {
      pushLog(flavor('searchAbort', { name: locName }), 'info', {
        loot: haulLoot,
        leftover: [],
      });
    } else if (working.fled) {
      pushLog(flavor('searchFledDone', { name: locName }), 'good', {
        loot: haulLoot,
        leftover: [],
      });
    } else if (working.raiding) {
      pushLog(flavor('searchRaidDone', { name: locName }), 'good', {
        loot: haulLoot,
        leftover: [],
      });
    } else if (haulLoot.length === 0) {
      pushLog(flavor('searchEmpty', { name: locName }), 'info');
    } else {
      pushLog(flavor('searchFound', { name: locName }), 'good', {
        loot: haulLoot,
        leftover: [],
      });
    }
    if (leftover.length > 0) {
      pushLog('You leave the rest behind.', 'info', { loot: [], leftover });
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
    /**
     * Cut off on the stairs — no unit/search. `dest` is the cell the interrupted
     * path was heading to; combatContinue finishes the move after the fight.
     */
    hdbStairs?: { dest: { level: number; column: number } };
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
    const danger = Math.round(opts.danger ?? doomDanger(loc));
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
      impact: null,
    };
    set({ combat, _combatRng: encRng.fork('fight') });
  };

  const startHumanCombat = (
    locationId: string,
    faction: Exclude<FactionId, null>,
    grantOnFlee: boolean,
    opts: {
      pendingRaid?: 'sneak' | 'force';
      raidLoot?: boolean;
      terrainOverride?: TerrainId;
      danger?: number;
      tunnel?: { nodeId: string; lootMod: number };
      intro?: string;
      key?: string;
    } = {},
  ) => {
    const s = get();
    const loc = s.locations[locationId];
    const humanRng = new Rng(s.seed).fork(
      `human:${loc.id}:${s.day}:${loc.remainingSearches}:${opts.pendingRaid ?? ''}:${opts.raidLoot ? 'loot' : ''}:${opts.key ?? ''}`,
    );
    const enemy = makeHuman(
      humanRng,
      faction,
      Math.round(opts.danger ?? loc.currentDanger),
    );
    const drop = rollHumanDrop(ENEMIES, humanRng, faction);
    const drops = drop ? [drop] : [];
    const combat: CombatState = {
      locationId,
      zombie: enemy,
      round: 0,
      log: [
        {
          round: 0,
          tone: 'bad',
          text: opts.intro ?? `The ${enemy.name} draws on you!`,
        },
      ],
      over: false,
      outcome: null,
      playerHpSnapshot: totalHp(s.bodyParts),
      context: {
        locationId,
        grantOnFlee,
        drops,
        pendingRaid: opts.pendingRaid,
        raidLoot: opts.raidLoot,
        tunnel: opts.tunnel,
      },
      selectedStance: 'guarded',
      terrain: opts.terrainOverride
        ? TERRAIN[opts.terrainOverride]
        : terrainForCategory(loc.category),
      awaitingStance: true,
      playerGauge: 0,
      enemyGauge: 0,
      acting: null,
      paused: false,
      speedIndex: 1,
      impact: null,
    };
    set({ combat, _combatRng: humanRng.fork('fight') });
  };

  /** Standing hit for illicit combat at a faction site (every fight, −1). */
  const illicitStandingHit = (locationId: string) => {
    const loc = get().locations[locationId];
    if (!loc?.factionId) return;
    const id = loc.factionId;
    shiftStanding(id, -1);
    // Cross-tension: going against the Muster is a gift to the 88, and vice versa.
    if (id === 'muster') shiftStanding('syndicate_88', 1);
    else if (id === 'syndicate_88') shiftStanding('muster', 1);
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
      undefined,
      undefined,
      siteLogScope(locationId),
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
      impact: null,
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
      const scope = siteLogScope(locationId);
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
          undefined,
          undefined,
          scope,
        );
        return;
      }
      // Gates are not optional: cooldown must not skip into free access.
      const eventRng = new Rng(s.seed).fork(`fgate:${loc.id}:${s.day}:${Math.round(s.hour)}`);
      const event = rollFactionGateEvent(eventRng, loc, ctx);
      if (event) {
        pushLog(event.tell, 'info', undefined, undefined, scope);
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
        undefined,
        undefined,
        scope,
      );
      return;
    }

    const siteScopeAt = siteLogScope(locationId);

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
      pushLog(event.tell, 'info', undefined, undefined, siteScopeAt);
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
        undefined,
        undefined,
        siteLogScope(locationId),
      );
      return;
    }
    // An HDB block isn't something you "search" — you go in, floor by floor.
    if (loc.category === 'residential') {
      get().hdbEnter();
      return;
    }
    if (loc.exhausted) {
      pushLog(flavor('pickedClean', { name: loc.name }), 'info', undefined, undefined, siteLogScope(locationId));
      return;
    }
    const encRng = new Rng(s.seed).fork(`encroll:${loc.id}:${s.day}:${loc.remainingSearches}`);
    const band = timeOfDay(s.hour);
    let encChance = 0.08 + doomDanger(loc) * 0.12;
    if (band === 'night') encChance += 0.2;
    else if (band === 'dusk') encChance += 0.08;
    encChance += weatherEncounterMod(weatherKindFor(s.seed, s.day));
    // Local neighbourhood pressure — a Fallen town is not a Stirring one.
    encChance += pressureFn()(loc.lat, loc.lng) * 0.3;
    encChance += sumTraitMod(s.character!.traitIds, 'encounterChanceMod');
    if (band === 'night' || band === 'dusk') {
      encChance += sumTraitMod(s.character!.traitIds, 'nightEncounterChanceMod');
    }
    // Ambush-prone builds get jumped more often when a search turns into a fight.
    const ambushMult = Math.max(0.15, 1 + sumTraitMod(s.character!.traitIds, 'ambushChanceMod'));
    encChance = Math.max(0.02, Math.min(0.95, encChance * (0.7 + 0.3 * ambushMult)));

    if (encRng.chance(encChance)) {
      startZombieCombat(locationId, true);
      pushLog(flavor('ambush', { name: loc.name }), 'bad', undefined, undefined, siteLogScope(locationId));
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
    const res = scoutFloor(
      rng,
      s.character!.attributes,
      s.hdb,
      level,
      sumTraitMod(s.character!.traitIds, 'hdbScoutBonus'),
    );
    set({ hdb: res.dungeon });
    pushLog(
      res.read === 0
        ? `Level ${level}: the corridor tells you nothing.`
        : `Level ${level}: you read ${res.read} of ${res.total} units from the corridor.`,
      'info',
      undefined,
      undefined,
      hdbFloorScope(s.hdb.locationId, level),
    );
  };

  /**
   * Empty a unit and mark it done for good. Called both on a clean entry and
   * after the fight that came out of the doorway — either way the room is spent.
   * Loot opens a sequential search session (same timeline grid as outdoor sites).
   */
  const markHdbUnitCleared = (hdb: HdbDungeon, level: number, unitId: string): HdbDungeon => {
    const unit = hdb.floors[level - 1]?.units.find((u) => u.id === unitId);
    let next = updateUnit(hdb, level, unitId, { state: 'cleared' });
    if (unit?.holdsKey) {
      const had = hasFob(next, unit.holdsKey);
      next = grantFob(next, unit.holdsKey);
      if (!had) {
        pushLog(
          'A fob on a lanyard. The stair grate might take it.',
          'good',
          undefined,
          undefined,
          hdbUnitScope(hdb.locationId, level, unitId, unit.label),
        );
      }
    }
    return next;
  };

  const hdbForceOpts = () => {
    const s = get();
    return {
      heatMult: sumTraitMod(s.character!.traitIds, 'hdbDoorHeatMult'),
      minutesMult: sumTraitMod(s.character!.traitIds, 'hdbBreachMinutesMult'),
      crowbar: s.items.some((i) => i.container === 'backpack' && i.defId === 'crowbar'),
    };
  };

  const hdbBusy = (allowWalk = false) => {
    const s = get();
    return !s.hdb || !!s.combat || !!s.pendingSearch || !!s.pendingEvent || (!allowWalk && !!s.hdbWalk);
  };

  const clearHdbUnit = (
    level: number,
    unitId: string,
    lootMod: number,
    rng: Rng,
    searchHp = 0,
  ) => {
    const s = get();
    if (!s.hdb || s.pendingSearch) return;
    const unit = s.hdb.floors[level - 1]?.units.find((u) => u.id === unitId);
    const label = unit?.label ?? 'the unit';
    const unitLogScope = hdbUnitScope(s.hdb.locationId, level, unitId, label);
    const table = unit ? UNIT_META[unit.type].lootTable : 'residential';
    if (!table) {
      bumpStats({ hdbUnitsCleared: 1 });
      const hdb = markHdbUnitCleared(s.hdb, level, unitId);
      set({ hdb, hdbBlocks: { ...s.hdbBlocks, [hdb.locationId]: hdb } });
      pushLog(`${label} is spoken for — nothing left to take.`, 'info', undefined, undefined, unitLogScope);
      persist();
      return;
    }
    // `lootMod` already carries the whole risk ladder — barricaded door, unit
    // type, height. Adding it to the base a second time double-counted it.
    const loot = rollLoot(rng, table, 2 + lootMod, lootMod);
    // A door nobody else could get through is the one thing behind which gear
    // is still in working order. This is the payoff for the noise and the time.
    const bias = Math.max(0, Math.min(1, lootMod / 5));

    const hdb = markHdbUnitCleared(s.hdb, level, unitId);
    set({ hdb, hdbBlocks: { ...s.hdbBlocks, [hdb.locationId]: hdb } });

    if (loot.length === 0) {
      bumpStats({ hdbUnitsCleared: 1 });
      pushLog(flavor('searchBare', { name: label }), 'info', undefined, undefined, unitLogScope);
      persist();
      return;
    }

    const pieces = loot.map((stack) => ({
      defId: stack.defId,
      count: stack.count,
      condition: conditionRoll(rng, stack.defId, bias),
    }));
    const speed =
      (searchSpeedFactor(
        equipSearchSpeedBonus(s.equipment),
        s.character!.attributes.perception,
        sumTraitMod(s.character!.traitIds, 'searchSpeedMod'),
      ) *
        loadOf(s).searchMult) /
      headSearchFactor(s.bodyParts);
    const nonce = rng.int(1, 1_000_000_000).toString(36);
    const session = ensureSearching(
      buildSearchSession({
        locationId: hdb.locationId,
        stashLocationId: hdb.locationId,
        raiding: false,
        fled: false,
        nonce,
        pieces,
        totalMinutes: searchMinutes(table),
        speedFactor: speed,
        spendCharges: false,
        chargeBudget: 1,
        hdbUnit: {
          level,
          unitId,
          label,
          ...(searchHp > 0 ? { searchHp } : {}),
        },
      }),
      Date.now(),
    );

    set({ pendingSearch: session });
    pushLog(flavor('searchStart', { name: label }), 'info');
    persist();
  };

  const resolveHdbDoor = (
    unitId: string,
    outcome: BreachOutcome,
    entry: HdbEntry,
    opts: { skipTime?: boolean } = {},
  ) => {
    const s = get();
    if (!s.hdb) return;
    const level = s.hdb.currentLevel;
    const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
    if (!unit) return;
    const verb = UNIT_META[unit.type].verb;
    const unitLogScope = hdbUnitScope(s.hdb.locationId, level, unitId, unit.label);
    const smash = entry === 'locked' || entry === 'barricaded';
    let minutes = outcome.minutes;
    let heat = verb === 'fight' ? 0 : outcome.heat;
    let noise = verb === 'fight' ? 0 : outcome.noise;
    if (smash) {
      const scaled = scaleDoorCost(outcome.minutes, outcome.heat, hdbForceOpts());
      minutes = scaled.minutes;
      if (verb !== 'fight') heat = scaled.heat;
    }
    if (!opts.skipTime && advanceTime(minutes / 60)) return;
    const g = get();
    if (!g.hdb) return;
    const rng = new Rng(g.seed).fork(`breach:${g.hdb.locationId}:${unitId}`);
    let next = updateUnit(g.hdb, level, unitId, { state: 'breached' });
    if (heat > 0) next = addHeat(next, heat, level);
    set({ hdb: next });
    if (noise > 0) {
      get().emitNoise(g.currentPos.lat, g.currentPos.lng, noise, outcome.dangerBoost);
      pushLog(`You force ${unit.label}. The sound carries.`, 'bad', undefined, undefined, unitLogScope);
    } else {
      pushLog(`You slip into ${unit.label} without touching the frame.`, 'info', undefined, undefined, unitLogScope);
    }

    if (outcome.trapped && rng.chance(0.35)) {
      const dmg = rng.int(4, 12);
      const bodyParts = applyWound(get().bodyParts, dmg, rng);
      const hot = get().hdb;
      set({ bodyParts, ...(hot ? { hdb: addHeat(hot, HAZARD_HEAT, level) } : {}) });
      pushLog(`Something by the door — it costs you ${dmg} health.`, 'bad', undefined, undefined, unitLogScope);
      const cause = checkDeath(get().meters, bodyParts);
      if (cause) {
        endRun(cause);
        return;
      }
    }

    const hot = get().hdb;
    if (!hot) return;
    const hdbUnit = { level, unitId, lootMod: outcome.lootMod };

    if (verb === 'fight') {
      const elite = !!UNIT_META[unit.type].fightElite;
      startZombieCombat(hot.locationId, false, {
        terrainOverride: 'hdb_corridor',
        ...(elite
          ? { enemy: makeHulk(rng, floorThreat(hot, level)) }
          : { danger: floorThreat(hot, level) }),
        intro: elite
          ? `Something huge has claimed ${unit.label}.`
          : `A pack fills ${unit.label}.`,
        hdbUnit,
      });
      return;
    }

    if (verb === 'rest') {
      persist();
      return;
    }

    // Swarm hunt rewrites ordinary loot doors, never Nest / Den (those returned above).
    if (isHunting(hot)) {
      if (rng.chance(HUNT_ELITE_CHANCE)) {
        startZombieCombat(hot.locationId, false, {
          terrainOverride: 'hdb_corridor',
          enemy: makeHulk(rng, floorThreat(hot, level)),
          intro: `The corridor behind you fills. Whatever ${unit.label} held, it isn't the problem now.`,
          hdbUnit,
        });
        return;
      }
      pushLog('Something heavy passes the corridor mouth and moves on.', 'info', undefined, undefined, unitLogScope);
    } else if (rng.chance(outcome.encounterChance)) {
      startZombieCombat(hot.locationId, false, {
        terrainOverride: 'hdb_corridor',
        danger: floorThreat(hot, level),
        intro: `Something was waiting inside ${unit.label}.`,
        hdbUnit,
      });
      return;
    }

    clearHdbUnit(level, unitId, outcome.lootMod, rng.fork('loot'), outcome.searchHp);
    persist();
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
    advanceTime(hours, undefined, false, false, loadOf(get()).energyMult) ? null : get().tunnel;

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
    const newIds: string[] = [];
    for (const loc of built) {
      // Synthetic bridge waypoints are numbered per build, so they'd collide
      // across expansions and silently lose their connective tissue.
      const id = loc.category === 'waypoint' ? `${loc.id}@${tag}` : loc.id;
      // Anything already in the world keeps whatever state it has earned.
      if (merged[id]) continue;
      merged[id] = { ...loc, id };
      newIds.push(id);
      added += 1;
    }
    if (added > 0) {
      const outposts = get().outposts;
      set({
        locations: applyFactionServices(merged, outposts, get().seed, newIds),
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

  /** Generate the crawl for a full planned route and drop onto the origin platform. */
  const beginTunnelRoute = (stationIds: string[]) => {
    const s = get();
    const from = s.currentPositionId ? s.locations[s.currentPositionId] : null;
    const net = getMrtNetwork();
    if (!from || !net || stationIds.length < 2) return;
    if (from.mrtStationId !== stationIds[0]) return;

    for (let i = 1; i < stationIds.length; i++) {
      if (!adjacentEdge(net, stationIds[i - 1], stationIds[i], s.destroyedTunnelEdges)) {
        pushLog('That route isn\'t on the rail map.', 'bad');
        return;
      }
    }

    const destId = stationIds[stationIds.length - 1];
    void ensureStationLocation(destId).then((to) => {
      if (!to) return;
      const cur = get();
      if (cur.combat || cur.pendingEvent || cur.tunnel || cur.hdb) return;
      const fromNow = cur.currentPositionId ? cur.locations[cur.currentPositionId] : null;
      if (!fromNow?.mrtStationId) return;

      const stations: TunnelStationStop[] = stationIds.map((id) => {
        const st = net.byId.get(id)!;
        const loc =
          id === fromNow.mrtStationId
            ? fromNow
            : id === destId
              ? to
              : Object.values(cur.locations).find((l) => l.mrtStationId === id) ?? null;
        return {
          stationId: id,
          locationId: loc?.id ?? '',
          name: loc?.name ?? st.name,
        };
      });

      const hopMeters: number[] = [];
      const hopCollapsed = hopCollapsedFlags(stationIds, cur.destroyedTunnelEdges);
      let meters = 0;
      let collapsedMeters = 0;
      let mode: 'mrt' | 'lrt' = 'lrt';
      let lineCode = '';
      let lineName = 'Tunnel';
      let lineColor = '#9c9890';
      for (let i = 1; i < stationIds.length; i++) {
        const seg = adjacentEdge(net, stationIds[i - 1], stationIds[i], cur.destroyedTunnelEdges)!;
        hopMeters.push(seg.meters);
        meters += seg.meters;
        if (seg.collapsed) collapsedMeters += seg.meters;
        if (seg.line.mode === 'mrt') mode = 'mrt';
        if (i === 1) {
          const line = displayLine(net, seg.line);
          lineCode = seg.line.code;
          lineName = line.name;
          lineColor = line.color;
        }
      }

      const seq = cur.tunnelSeq + 1;
      const walk = estimateTunnelWalk(
        meters,
        cur.character!.attributes,
        cur.meters.energy,
        cur.hour,
        moveFactor(cur),
        collapsedMeters,
        loadOf(cur).tunnelTravelMult,
      );
      const run = generateTunnelRun(
        new Rng(cur.seed).fork(`tunnel:${stations[0].stationId}:${destId}:${seq}`),
        {
          from: fromNow,
          to,
          stations,
          hopMeters,
          hopCollapsed,
          lineCode,
          lineName,
          lineColor,
          mode,
          meters,
          travelMin: walk.travelMin,
          day: cur.day,
          hour: cur.hour,
          hordeLevel: cur.hordeLevel,
          seq,
        },
      );

      set({ tunnel: run, tunnelSeq: seq, tunnelOffer: null });
      const runScope = tunnelRunScope(
        run.id,
        `${run.fromName} → ${run.stationNames?.[run.stationNames.length - 1] ?? run.toName}`,
      );
      const ruined = hopCollapsed.filter(Boolean).length;
      if (ruined > 0) {
        pushLog(
          ruined === 1
            ? 'Part of this walk crosses a collapsed bore — rubble, packs, no camps.'
            : `${ruined} stretches of this walk are collapsed bores — rubble, packs, no camps.`,
          'bad',
          undefined,
          undefined,
          runScope,
        );
      }
      pushLog(
        stationIds.length > 2
          ? `You drop off the platform at ${fromNow.name} — ${stationIds.length - 1} stops toward ${to.name}.`
          : `You drop off the platform edge at ${fromNow.name} and walk into the ${lineName} bore.`,
        'info',
        undefined,
        undefined,
        runScope,
      );
      persist();
    });
  };

  /** Climb the stairs at a chosen station along the route. */
  const arriveTunnelAt = (stationId: string) => {
    const s = get();
    const run = s.tunnel;
    if (!run) return;

    void ensureStationLocation(stationId).then((to) => {
      if (!to) return;
      const cur = get();
      const live = cur.tunnel;
      if (!live) return;

      const ids = live.stationIds?.length
        ? live.stationIds
        : [live.fromStation, live.toStation];
      const idx = Math.max(0, ids.indexOf(stationId));
      const fraction = ids.length <= 1 ? 1 : idx / (ids.length - 1);
      const walked = Math.round(live.meters * fraction);

      set({
        tunnel: null,
        tunnelOffer: null,
        currentPos: { lat: to.lat, lng: to.lng },
        currentPositionId: to.id,
      });
      discoverLocation(to.id);
      bumpStats({ distanceM: walked });
      const mid =
        stationId !== live.toStation && idx > 0 && idx < ids.length - 1;
      pushLog(
        mid
          ? `You take the stairs early. Daylight at ${to.name}.`
          : `Stairs, then daylight. You come up at ${to.name}.`,
        'good',
      );
      persist();
    });
  };

  /** Climb the stairs at the far end. The run ends here, one way or another. */
  const arriveTunnel = () => {
    const s = get();
    const run = s.tunnel;
    if (!run) return;
    arriveTunnelAt(run.toStation || run.stationIds?.[run.stationIds.length - 1] || '');
  };

  /**
   * Empty a stretch of tunnel. Shared by the quiet case and the one where
   * something came out of the dark first — either way the salvage is the same,
   * and it spills into the station you're walking *towards*, because the one
   * behind you is behind you.
   */
  const grantTunnelSalvage = (run: TunnelRun, node: TunnelNode, rng: Rng) => {
    void run;
    const s = get();
    const nodeScope = tunnelNodeScope(run.id, node.id, node.name);
    const lootMod = node.lootMod ?? 0;
    const loot = rollLoot(rng, 'mrt', POI_CONFIG.mrt.richness, lootMod);
    const bias = Math.max(0, Math.min(1, lootMod / 3));

    let items = s.items;
    const tempHeld: LootStack[] = [];
    const lost: LootStack[] = [];
    for (const stack of loot) {
      const condition = conditionRoll(rng, stack.defId, bias);
      const packed = addToGrid(items, 'backpack', stack.defId, stack.count, condition);
      items = packed.items;
      if (packed.leftover === 0) continue;
      // Mid-crawl: never touch the far-station stash. Overflow goes to a temp
      // grid the player must resolve before continuing.
      const spilled = addToGrid(items, TEMP_STASH, stack.defId, packed.leftover, condition);
      items = spilled.items;
      const held = packed.leftover - spilled.leftover;
      if (held > 0) tempHeld.push({ defId: stack.defId, count: held });
      if (spilled.leftover > 0) lost.push({ defId: stack.defId, count: spilled.leftover });
    }
    items = stampFirearmLoot(items, rng);
    const missed = [...tempHeld, ...lost];
    const openInv = tempHeld.length > 0;
    set({
      items,
      inventoryOpenToken: openInv ? s.inventoryOpenToken + 1 : s.inventoryOpenToken,
    });
    bumpHaul(loot, missed);
    pushLog(
      loot.length ? `You strip ${node.name}.` : `${node.name} was picked over long ago.`,
      loot.length ? 'good' : 'info',
      loot.length ? { loot, leftover: missed } : undefined,
      undefined,
      nodeScope,
    );
    if (tempHeld.length > 0) {
      pushLog(flavor('packSpill'), 'info', undefined, undefined, nodeScope);
    }
    if (lost.length > 0) {
      pushLog(flavor('packLost'), 'bad', undefined, undefined, nodeScope);
    }
  };

  /**
   * A fight in the bore. One way wide, so fleeing means shoving past and
   * carrying on — there is no back to run to.
   */
  const startTunnelFight = (
    run: TunnelRun,
    node: TunnelNode,
    lootMod: number,
    opts: { enemy?: Enemy; intro?: string; drops?: string[] } = {},
  ) => {
    const threat = nodeThreat(node);
    const elite = !opts.enemy && !!node.elite;
    const enemy =
      opts.enemy ??
      (elite
        ? makeStalker(new Rng(get().seed).fork(tunnelKey(run, `stalker:${node.id}`)), threat)
        : undefined);
    startZombieCombat(run.fromLocationId, false, {
      terrainOverride: 'tunnel_bore',
      danger: threat,
      key: tunnelKey(run, `fight:${node.id}`),
      enemy,
      drops: opts.drops,
      intro:
        opts.intro ??
        (elite
          ? 'Whatever has been pacing you down the tunnel stops pacing.'
          : `${node.name}: they come at you down the bore, and the bore is one way wide.`),
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
    const nodeScope = tunnelNodeScope(run.id, nodeId, node.name);

    // ---- something is already in here with you --------------------------
    if (node.kind === 'pack') {
      startTunnelFight(run, node, 0);
      return;
    }

    // ---- stalled consist: pick an approach before walking on ------------
    if (node.kind === 'carriage') {
      pushLog(
        `${node.name}: the consist is blocking the bore. Under it, or through it.`,
        'info',
        undefined,
        undefined,
        nodeScope,
      );
      persist();
      return;
    }

    // ---- STA in the bore ------------------------------------------------
    if (node.kind === 'checkpoint') {
      const after = tunnelTick(meta.minutes / 60);
      if (!after) return;
      if ((get().factionStanding.sta ?? 0) >= STANDING_TRUSTED) {
        set({ tunnel: markDone(after, nodeId) });
        pushLog(`${node.name}: they know the face. STA wave you through.`, 'good', undefined, undefined, nodeScope);
        persist();
        return;
      }
      set({ tunnel: after });
      pushLog(`${node.name}: marshals across the bore. Fare, or fade.`, 'info', undefined, undefined, nodeScope);
      persist();
      return;
    }

    // ---- look down the tube ---------------------------------------------
    if (node.kind === 'signal') {
      const after = tunnelTick(meta.minutes / 60);
      if (!after) return;
      const check = rollCheck(
        rng,
        s.character!.attributes.wits,
        hazardDc(node),
        sumTraitMod(s.character!.traitIds, 'checkBonusMod'),
      );
      if (check.success) {
        set({ tunnel: setSightBonus(markDone(after, nodeId), 1) });
        pushLog(`${node.name}: a board still answers. The next stretch lights up.`, 'good', undefined, undefined, nodeScope);
      } else {
        set({ tunnel: markDone(after, nodeId) });
        pushLog(`${node.name}: dead switches and dust. You see no further.`, 'info', undefined, undefined, nodeScope);
      }
      persist();
      return;
    }

    // ---- the tunnel itself is the problem -------------------------------
    if (node.kind === 'hazard') {
      const hazardKind = node.hazard ?? 'collapse';
      const cfg = TUNNEL_HAZARD[hazardKind];
      const check = rollCheck(
        rng,
        s.character!.attributes[cfg.attr],
        hazardDc(node),
        sumTraitMod(s.character!.traitIds, 'checkBonusMod'),
      );
      const minutes = hazardMinutes(node, !check.success);
      const after = tunnelTick(minutes / 60);
      if (!after) return;

      const cur = get();
      const energy = cfg.energyCost * (check.success ? 1 : cfg.failEnergyMult);
      const meters = { ...cur.meters, energy: clampMeter(cur.meters.energy - energy) };

      if (check.success) {
        set({ tunnel: markDone(after, nodeId), meters });
        pushLog(`${node.name}: you find the line through and take it.`, 'info', undefined, undefined, nodeScope);
        persist();
        return;
      }

      if (hazardKind === 'floodwater') {
        set({ meters, tunnel: after });
        const dropRng = rng.fork('otter');
        const otter = makeAnimalById(dropRng, 'otter', nodeThreat(node));
        const drop = rollAnimalDrop(ENEMIES, dropRng, otter.templateId ?? 'otter');
        pushLog(`${node.name}: something moves in the black water.`, 'bad', undefined, undefined, nodeScope);
        startTunnelFight(after, node, 0, {
          enemy: otter,
          drops: drop ? [drop] : undefined,
          intro: `A ${otter.name} comes up through the flood.`,
        });
        return;
      }

      let bodyParts = cur.bodyParts;
      if (cfg.wound) {
        const lo = node.collapsedBore ? cfg.wound.collapsedMin : cfg.wound.min;
        const hi = node.collapsedBore ? cfg.wound.collapsedMax : cfg.wound.max;
        bodyParts = applyWound(cur.bodyParts, rng.int(lo, hi), rng);
      }
      set({
        tunnel: markDone(after, nodeId),
        bodyParts,
        meters,
      });
      pushLog(
        cfg.wound
          ? `${node.name} takes its toll — you come out the other side hurt.`
          : `${node.name}: you lose the line and burn the extra minutes finding it.`,
        'bad',
        undefined,
        undefined,
        nodeScope,
      );
      const cause = checkDeath(get().meters, get().bodyParts);
      if (cause) {
        endRun(cause);
        return;
      }
      persist();
      return;
    }

    // ---- salvage, unless the salvage was bait ---------------------------
    if (node.kind === 'scavenge') {
      const after = tunnelTick(meta.minutes / 60);
      if (!after) return;
      if (rng.chance(0.25)) {
        pushLog(`Something was already working ${node.name}.`, 'bad', undefined, undefined, nodeScope);
        startTunnelFight(after, node, node.lootMod ?? 0);
        return;
      }
      set({ tunnel: markDone(after, nodeId) });
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
        undefined,
        undefined,
        nodeScope,
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
    if (roadAmbush?.locationId === loc.id) {
      const pending = roadAmbush;
      roadAmbush = null;
      pushLog(flavor('roadAmbush', { name: loc.name }), 'bad');
      const fightRng = new Rng(s2.seed).fork(`roadfight:${loc.id}:${s2.day}:${s2.hour}`);
      const { enemy, drops } = rollWildsEncounter(fightRng, pending.danger, {
        hazard: pending.hazard,
        forest: pending.forest,
        habitat: pending.habitat,
        floodwater: pending.floodwater,
      });
      const combat: CombatState = {
        locationId: loc.id,
        zombie: enemy,
        round: 0,
        log: [{ round: 0, tone: 'bad', text: `${enemy.name} blocks the way!` }],
        over: false,
        outcome: null,
        playerHpSnapshot: totalHp(s2.bodyParts),
        context: { locationId: loc.id, grantOnFlee: false, roadAmbush: true, drops },
        selectedStance: 'guarded',
        terrain: terrainForCategory(loc2.category, true),
        awaitingStance: true,
        playerGauge: 0,
        enemyGauge: 0,
        acting: null,
        paused: false,
        speedIndex: 1,
        impact: null,
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
    if (!loc2.exhausted) {
      pushLog(
        flavor('atDoor', {
          name: loc.name,
          time: timeOfDay(arr.hour),
          weather: weatherKindFor(arr.seed, arr.day),
        }),
        'info',
      );
    }
    persist();
  };

  // Set by trek()'s en-route roll; consumed when the crossing lands.
  let trekAmbush: {
    danger: number;
    hazard: HazardKind | null;
    forest: boolean;
    habitat: AnimalHabitat | null;
    floodwater: boolean;
  } | null = null;

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
      exploredArea: mergeExploredCircles([
        ...st.exploredArea,
        { lat, lng, radius: TREK_LIGHT_RADIUS },
      ]),
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

    const { enemy, drops } = rollWildsEncounter(fightRng, pending.danger, {
      hazard: pending.hazard,
      forest: pending.forest,
      habitat: pending.habitat,
      floodwater: pending.floodwater,
    });

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
      impact: null,
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
    groundZeroId: null,
    hordeLevel: 0,
    evacZoneId: null,
    evacDeadline: null,
    evacCooldownUntil: null,
    evacDemand: null,
    evacDemandBias: null,
    evacManifestRevealed: false,
    escaped: false,
    destroyedTunnelEdges: [],
    maxHp: 100,
    meters: initialMeters(),
    bodyParts: initialBodyParts(100),
    day: 1,
    hour: START_HOUR,
    items: [],
    equipment: emptyEquipment(),
    clothingTears: OWN_CLOTHES_TEARS,
    kills: 0,
    stats: emptyRunStats(),
    exploredArea: [],
    combat: null,
    _combatRng: null,
    hdb: null,
    hdbBlocks: {},
    hdbWalk: null,
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
    escort: null,
    mapAnnotations: [],
    log: [],
    inventoryOpenToken: 0,
    deathCause: null,
    finalScore: 0,
    highScores: loadHighScores(),
    hasSavedRun: !!loadRun(),

    goToCharacter: () => set({ phase: 'character' }),

    commitCharacter: (c) => {
      const maxHp = maxHpFor(c);
      syncBackpackBonuses(sumTraitMod(c.traitIds, 'gridWidthBonus'), emptyEquipment());
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
        inventoryOpenToken: 0,
        clothingTears: OWN_CLOTHES_TEARS,
        kills: 0,
        stats: emptyRunStats(),
        log: [],
      });
    },

    setSpawn: async (spawn) => {
      const seed = randomSeed();
      const rng = new Rng(seed);
      const groundZero = pickGroundZero(rng);

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
        groundZeroId: groundZero.id,
        hordeLevel: TOWN_FIELD_START_HORDE,
      });
      pushLog(
        flavor(usedFallback ? 'wakeOffline' : 'wake', { name: spawn.name }),
        'info',
      );
      const wakeTown = nearestTown(spawn.lat, spawn.lng);
      const wakeTier = townTierAt(
        seed,
        groundZero.id,
        TOWN_FIELD_START_HORDE,
        spawn.lat,
        spawn.lng,
      );
      const wakeKey: Record<TownTier, 'wakeTownStirring' | 'wakeTownRestless' | 'wakeTownMassing' | 'wakeTownFallen' | 'wakeTownLost'> = {
        stirring: 'wakeTownStirring',
        restless: 'wakeTownRestless',
        massing: 'wakeTownMassing',
        fallen: 'wakeTownFallen',
        lost: 'wakeTownLost',
      };
      pushLog(flavor(wakeKey[wakeTier], { name: wakeTown.name }), wakeTier === 'stirring' ? 'info' : 'bad');

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
        const island = filterWalkablePois(await bakedEvacPois());
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
      const firstDemand = rollEvacDemand(rng.fork('evacdemand:first'), 1);

      // Collapse some tunnels this run — medium density, soft bias toward the
      // rail corridor between spawn and the first evac beacon.
      let destroyedTunnelEdges: string[] = [];
      if (net) {
        const fromSt = nearestStationAny(net, spawn.lat, spawn.lng);
        const evacForBias = evacZoneId ? locations[evacZoneId] : null;
        const toSt = evacForBias
          ? nearestStationAny(net, evacForBias.lat, evacForBias.lng)
          : null;
        destroyedTunnelEdges = rollDestroyedTunnels(
          rng.fork('mrt:destroyed'),
          net,
          toSt ? { fromStationId: fromSt.id, toStationId: toSt.id } : null,
        );
      }

      set({
        hordeLevel: TOWN_FIELD_START_HORDE,
        groundZeroId: groundZero.id,
        evacZoneId,
        evacDeadline,
        evacCooldownUntil: null,
        evacDemand: firstDemand.demand,
        evacDemandBias: firstDemand.bias,
        evacManifestRevealed: false,
        escaped: false,
        destroyedTunnelEdges,
      });
      const evacLoc = evacZoneId ? locations[evacZoneId] : null;
      if (evacLoc) {
        pushLog(
          `Radio static, then a voice: "Evac staging at ${evacLoc.name}. Pack fuel, meds, and ammo — we won't name a number. We hold the window ${firstWindow} hours, no more. Stay longer and the score climbs — but so does the city."`,
          'good',
          undefined,
          { lat: evacLoc.lat, lng: evacLoc.lng, label: evacLoc.name },
        );
      }

      // Starting kit comes from ItemDef.startingItem flags (editable in the DEV loot browser).
      // Equip first (incl. bag), sync the pack silhouette, then pack leftovers into that mask.
      let items: ItemInstance[] = [];
      const equipment = emptyEquipment();
      const packStarters: { defId: string; count: number }[] = [];
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
          packStarters.push({
            defId: def.id,
            count: Math.max(1, def.startingCount ?? 1),
          });
        }
      }
      const traitW = sumTraitMod(get().character!.traitIds, 'gridWidthBonus');
      syncBackpackBonuses(traitW, equipment);

      let kitLeftover = 0;
      for (const { defId, count } of packStarters) {
        const packed = addToGrid(items, 'backpack', defId, count);
        items = packed.items;
        kitLeftover += packed.leftover;
        if (import.meta.env.DEV && packed.leftover > 0) {
          console.error(
            `[start] starting kit could not fit ${defId} ×${packed.leftover} in the pack grid`,
          );
        }
      }
      const packLegal = items
        .filter((i) => i.container === 'backpack')
        .every((i) => {
          const d = itemDef(i.defId);
          const { w, h } = footprint(d, i.rotated);
          return canPlace('backpack', items, { x: i.x, y: i.y, w, h }, i.uid);
        });
      if (import.meta.env.DEV && (!packLegal || kitLeftover > 0)) {
        console.error(
          '[start] starting bag packGrid is illegal for the starting kit',
          { packLegal, kitLeftover },
        );
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
        escort: null,
        traderTaken: {},
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

      if (wakeTier === 'lost') {
        const shelter = nearestRoofedShelter(Object.values(withServices), spawn);
        if (shelter) {
          discoverLocation(shelter.id);
          set({
            currentPositionId: shelter.id,
            currentPos: { lat: shelter.lat, lng: shelter.lng },
          });
          pushLog(
            `You come to inside ${shelter.name}. The street out there is not empty.`,
            'bad',
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
        pushLog(flavor('tooTired'), 'bad');
        return;
      }

      const weather = weatherKindFor(s.seed, s.day);
      const load = loadOf(s);

      const route = routeLandPath(s.currentPos, { lat: loc.lat, lng: loc.lng });
      if (!route) {
        pushLog(NO_DRY_ROUTE_MSG, 'bad');
        return;
      }
      const dist = route.lengthM;
      const from = s.currentPos;

      // You can only push so far in one go. Beyond your current range you must
      // hop via a closer waypoint, rest to recover, or walk a tunnel segment.
      const range = travelableRange(
        s.character!.attributes,
        s.meters.energy,
        moveFactor(s),
        weather,
        load.travelMult,
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
        load.travelMult,
        moveFactor(s),
      );

      const vegOnRoute = vegetationCost(from, { lat: loc.lat, lng: loc.lng }, route.points);

      // Advance the in-game clock for the trip up front (search time is spent
      // later, on searching). Bail if the survivor dies en route.
      if (advanceTime((est.travelMin / 60) * vegOnRoute.travelMult, undefined, false, true, load.energyMult)) return;
      bumpStats({ distanceM: dist });

      // Prefetch the landing cell while the glide runs.
      void ensureWorldAround(loc.lat, loc.lng);

      // --- en-route risk: hazards on the walked route + open-road chance ---
      roadAmbush = null;
      const now = get();
      const band = timeOfDay(now.hour);
      const risk = trekRisk(
        now.seed,
        from,
        { lat: loc.lat, lng: loc.lng },
        {
          band,
          hordeIntensity: hordeIntensity(now.hordeLevel),
          pressureAt: pressureFn(),
          weatherEncounterMod: weatherEncounterMod(weather),
          traitEncounterMod:
            sumTraitMod(now.character!.traitIds, 'encounterChanceMod') +
            (band === 'night' || band === 'dusk'
              ? sumTraitMod(now.character!.traitIds, 'nightEncounterChanceMod')
              : 0) +
            equipEncounterChanceMod(now.equipment) +
            bleedEncounterMod(now.bodyParts) +
            load.encounterMod +
            (now.escort?.toId === loc.id ? ESCORT_ENCOUNTER_MOD : 0),
          safe: now.spawn ?? undefined,
          day: now.day,
        },
        undefined,
        route.points,
      );

      const encRng = new Rng(now.seed).fork(`road:${loc.id}:${now.day}:${Math.round(now.hour)}`);
      const outcome = resolveCrossing(encRng, risk, {
        mode: 'road',
        siteDanger: loc.currentDanger,
        dexterity: now.character!.attributes.dexterity,
        checkBonus: sumTraitMod(now.character!.traitIds, 'checkBonusMod'),
        band,
        habitat: habitatAt(loc.lat, loc.lng),
        pressure: pressureFn()(loc.lat, loc.lng),
        forest: vegOnRoute.patches.length > 0,
        weather,
      });

      let travelFindLog: { text: string; tone: 'good' | 'info' } | null = null;
      if (outcome.ambush) {
        roadAmbush = {
          locationId: loc.id,
          danger: outcome.ambush.danger,
          hazard: outcome.ambush.hazard,
          forest: vegOnRoute.patches.length > 0,
          habitat: habitatAt(loc.lat, loc.lng),
          floodwater: risk.hazards.some((z) => z.kind === 'floodwater'),
        };
      } else if (
        risk.hazards.some((z) => z.kind === 'floodwater') &&
        encRng.chance(FLOODWATER_ANIMAL_CHANCE)
      ) {
        roadAmbush = {
          locationId: loc.id,
          danger: Math.round(loc.currentDanger),
          hazard: 'wildlife_water',
          forest: vegOnRoute.patches.length > 0,
          habitat: 'water',
          floodwater: false,
        };
      } else if (outcome.travelFind === 'road') {
        travelFindLog = applyTravelFind(encRng, 'road', loc.name);
      }

      // Vegetation stretches the real-time glide slightly so slow ground reads.
      const durationMs = Math.min(
        2800,
        Math.max(800, Math.round(est.travelMin * 22 * Math.min(1.35, vegOnRoute.travelMult))),
      );
      pushLog(flavor('setout', {
        name: loc.name,
        time: timeOfDay(s.hour),
        weather,
      }), 'info');
      if (vegOnRoute.patches.length > 0) {
        pushLog('Dense forest slows you — nature reserve overgrowth.', 'info');
      }
      noteOverload(s.day, load.ratio);
      if (get().escort?.toId === loc.id) {
        set({ escort: null });
        pushLog(
          `Two of the Muster walk you as far as ${loc.name}. They peel off at the door.`,
          'good',
        );
      }
      if (applyCrossingOutcome(outcome, vegOnRoute.energyCost * load.energyMult, encRng)) return;
      if (travelFindLog) pushLog(travelFindLog.text, travelFindLog.tone);
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
          departRange: range,
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
            : 'You slip past the gate — quiet feet, held breath.',
          'good',
        );
        enterRaid(id, 'sneak');
        persist();
        return;
      }
      pushLog('Spotted slipping in. Blades come out.', 'bad');
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
            : 'Quiet hands. The shelves give without a sound.',
          'good',
        );
        attemptSearch(raid.locationId);
        persist();
        return;
      }
      pushLog('Caught rifling the place. They come for you.', 'bad');
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
        pushLog(flavor('tooTired'), 'bad');
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
      const load = loadOf(s);

      // Open ground obeys the same one-push limit as everything else — it's an
      // escape hatch from bad geometry, not from the stamina economy.
      const range = travelableRange(
        s.character!.attributes,
        s.meters.energy,
        moveFactor(s),
        weather,
        load.travelMult,
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
        load.travelMult,
        moveFactor(s),
      );
      const veg = vegetationCost(from, { lat, lng }, route.points);
      if (advanceTime((est.travelMin / 60) * veg.travelMult, undefined, false, true, load.energyMult)) return;
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
          pressureAt: pressureFn(),
          weatherEncounterMod: weatherEncounterMod(weather),
          traitEncounterMod:
            sumTraitMod(now.character!.traitIds, 'encounterChanceMod') +
            (trekBand === 'night' || trekBand === 'dusk'
              ? sumTraitMod(now.character!.traitIds, 'nightEncounterChanceMod')
              : 0) +
            equipEncounterChanceMod(now.equipment) +
            bleedEncounterMod(now.bodyParts) +
            load.encounterMod,
          safe: now.spawn ?? undefined,
          day: now.day,
        },
        undefined,
        route.points,
      );

      const encRng = new Rng(now.seed).fork(
        `trek:${lat.toFixed(5)}:${lng.toFixed(5)}:${now.day}:${Math.round(now.hour)}`,
      );
      const outcome = resolveCrossing(encRng, risk, {
        mode: 'trek',
        dexterity: now.character!.attributes.dexterity,
        checkBonus: sumTraitMod(now.character!.traitIds, 'checkBonusMod'),
        band: trekBand,
        habitat: habitatAt(lat, lng),
        pressure: pressureFn()(lat, lng),
        forest: veg.patches.length > 0,
        weather,
      });

      trekAmbush = null;
      let trekFindLog: { text: string; tone: 'good' | 'info' } | null = null;
      if (outcome.ambush) {
        trekAmbush = {
          danger: outcome.ambush.danger,
          hazard: outcome.ambush.hazard,
          forest: veg.patches.length > 0,
          habitat: habitatAt(lat, lng),
          floodwater: risk.hazards.some((z) => z.kind === 'floodwater'),
        };
      } else if (
        risk.hazards.some((z) => z.kind === 'floodwater') &&
        encRng.chance(FLOODWATER_ANIMAL_CHANCE)
      ) {
        trekAmbush = {
          danger: risk.combatDanger,
          hazard: 'wildlife_water',
          forest: veg.patches.length > 0,
          habitat: 'water',
          floodwater: false,
        };
      } else if (outcome.travelFind === 'trek') {
        trekFindLog = applyTravelFind(encRng, 'trek');
      }

      const durationMs = Math.min(
        2800,
        Math.max(800, Math.round(est.travelMin * 22 * Math.min(1.35, veg.travelMult))),
      );
      const startedAt = Date.now();
      pushLog(flavor('trekOut'), 'info');
      if (veg.patches.length > 0) {
        pushLog('You push through dense forest — every step costs.', 'info');
      }
      noteOverload(s.day, load.ratio);
      if (applyCrossingOutcome(outcome, veg.energyCost * load.energyMult, encRng)) return;
      if (trekFindLog) pushLog(trekFindLog.text, trekFindLog.tone);
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
          departRange: range,
        },
      });
      setTimeout(() => arriveWilds(lat, lng, startedAt), durationMs);
    },

    tunnelEnterRoute: (stationIds) => {
      const s = get();
      const from = s.currentPositionId ? s.locations[s.currentPositionId] : null;
      if (!from || s.combat || s.pendingEvent || s.tunnel || s.hdb) return;
      if (!from.isMrtStation || !from.mrtStationId) {
        pushLog('You have to be on a platform to get into the tunnels.', 'bad');
        return;
      }
      if (stationIds.length < 2 || stationIds[0] !== from.mrtStationId) {
        pushLog('That route doesn\'t start from this platform.', 'bad');
        return;
      }
      const net = getMrtNetwork();
      if (!net) {
        pushLog('The rail map is blank — no way to plan a walk through the dark.', 'bad');
        return;
      }
      for (let i = 1; i < stationIds.length; i++) {
        if (!adjacentEdge(net, stationIds[i - 1], stationIds[i], s.destroyedTunnelEdges)) {
          pushLog('That route isn\'t on the rail map.', 'bad');
          return;
        }
      }
      if (s.meters.energy < 5) {
        pushLog(flavor('tooTiredTunnel'), 'bad');
        return;
      }

      const destId = stationIds[stationIds.length - 1];
      void ensureStationLocation(destId).then((to) => {
        if (!to) return;
        const cur = get();
        if (cur.combat || cur.pendingEvent || cur.tunnel || cur.hdb) return;

        const dayPass = (from.tollPaidThroughDay ?? -1) >= cur.day;
        if (
          from.factionId === 'sta' &&
          !dayPass &&
          (cur.factionStanding.sta ?? 0) < STANDING_TRUSTED
        ) {
          set({
            pendingEvent: {
              locationId: from.id,
              event: mrtTollEvent(),
              tunnelTo: to.id,
              tunnelStationIds: stationIds,
            },
          });
          return;
        }
        beginTunnelRoute(stationIds);
      });
    },

    tunnelEnter: (toStationId) => {
      const s = get();
      const from = s.currentPositionId ? s.locations[s.currentPositionId] : null;
      if (!from?.mrtStationId) return;
      get().tunnelEnterRoute([from.mrtStationId, toStationId]);
    },

    tunnelExitHere: () => {
      const s = get();
      const run = s.tunnel;
      if (!run || s.combat || s.pendingEvent) return;
      const node = currentNode(run);
      if (!canExitHere(run, node) || !node.stationId) {
        pushLog('No stairs here — keep walking the bore.', 'info');
        return;
      }
      if (s.items.some((i) => i.container === TEMP_STASH)) {
        pushLog(flavor('sortHaulSurface'), 'bad');
        set({ inventoryOpenToken: s.inventoryOpenToken + 1 });
        return;
      }
      arriveTunnelAt(node.stationId);
    },

    tunnelStep: (nodeId) => {
      const s = get();
      const run = s.tunnel;
      if (!run || s.combat || s.pendingEvent) return;
      if (nodeNeedsChoice(currentNode(run))) {
        pushLog('The bore is blocked until you pick a way through.', 'info');
        return;
      }
      if (s.items.some((i) => i.container === TEMP_STASH)) {
        pushLog(flavor('sortHaul'), 'bad');
        set({ inventoryOpenToken: s.inventoryOpenToken + 1 });
        return;
      }
      const node = run.nodes[nodeId];
      if (!node || !reachable(run).some((n) => n.id === nodeId)) return;

      const leaving = currentNode(run);
      // The walk between columns is charged first: whatever is on the node
      // happens after you have already spent the minutes getting to it.
      const walked = tunnelTick(run.minutesPerHop / 60);
      if (!walked) return;
      const nextRun = stepTo(walked, nodeId);
      if (node.collapsedBore && !leaving.collapsedBore) {
        const nodeScope = tunnelNodeScope(run.id, nodeId, node.name);
        pushLog(
          'The crown came down through here. You crawl the rubble — this stretch will not be kind.',
          'bad',
          undefined,
          undefined,
          nodeScope,
        );
      }
      set({ tunnel: nextRun });
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
      const node = currentNode(run);
      const nodeScope = tunnelNodeScope(run.id, node.id, node.name);
      if (node.kind !== 'settlement') return;
      if (node.servicesUsed) {
        pushLog('They already helped you once. The camp moves on.', 'info', undefined, undefined, nodeScope);
        return;
      }

      const restored = sleepRestore(
        s.meters.energy,
        CAMP_REST_HOURS,
        s.meters,
        sumTraitMod(s.character!.traitIds, 'sleepRestoreMod'),
      );
      if (advanceTime(CAMP_REST_HOURS, restored, true)) return;
      const after = get().tunnel;
      if (!after) return;
      const nodes = {
        ...after.nodes,
        [node.id]: { ...after.nodes[node.id], servicesUsed: true },
      };
      set({ tunnel: { ...after, nodes } });
      shiftStanding('sta', 1);
      pushLog(
        `You sleep ${CAMP_REST_HOURS} hours on a mat by the barricade. Someone else keeps watch.`,
        'good',
        undefined,
        undefined,
        nodeScope,
      );
      persist();
    },

    tunnelTreat: () => {
      const s = get();
      const run = s.tunnel;
      if (!run || s.combat || s.pendingEvent) return;
      const node = currentNode(run);
      const nodeScope = tunnelNodeScope(run.id, node.id, node.name);
      if (node.kind !== 'settlement') return;
      if (node.servicesUsed) {
        pushLog('They already helped you once. The camp moves on.', 'info', undefined, undefined, nodeScope);
        return;
      }
      if (!hasBackpackItem('canned_food')) {
        pushLog('They will look at your injuries for a tin of food. You have none.', 'bad', undefined, undefined, nodeScope);
        return;
      }
      consumeBackpackItem('canned_food');
      if (advanceTime(1)) return;
      const g = get();
      const bodyParts = treatInjuries(g.bodyParts, 30, 'all');
      const after = g.tunnel;
      if (!after) return;
      const nodes = {
        ...after.nodes,
        [node.id]: { ...after.nodes[node.id], servicesUsed: true },
      };
      set({ bodyParts, tunnel: { ...after, nodes } });
      shiftStanding('sta', 1);
      pushLog('Someone with steady hands and boiled water puts you back together.', 'good', undefined, undefined, nodeScope);
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

    tunnelCarriage: (choice) => {
      const s = get();
      const run = s.tunnel;
      if (!run || s.combat || s.pendingEvent) return;
      const node = currentNode(run);
      const nodeScope = tunnelNodeScope(run.id, node.id, node.name);
      if (node.kind !== 'carriage' || node.state === 'done') return;

      if (choice === 'invert') {
        const after = tunnelTick(CARRIAGE_INVERT_MINUTES / 60);
        if (!after) return;
        const cur = get();
        set({
          tunnel: markDone(after, node.id),
          meters: {
            ...cur.meters,
            energy: clampMeter(cur.meters.energy - CARRIAGE_INVERT_ENERGY),
          },
        });
        pushLog(`${node.name}: you drop to the invert and crawl under the consist.`, 'info', undefined, undefined, nodeScope);
        persist();
        return;
      }

      const after = tunnelTick(CARRIAGE_SMASH_MINUTES / 60);
      if (!after) return;
      const rng = new Rng(s.seed).fork(tunnelKey(after, `smash:${node.id}`));
      if (rng.chance(CARRIAGE_BAIT_CHANCE)) {
        pushLog(`Something was already living in ${node.name}.`, 'bad');
        set({ tunnel: after });
        startTunnelFight(after, node, node.lootMod ?? 0);
        return;
      }
      set({ tunnel: markDone(after, node.id) });
      grantTunnelSalvage(after, node, rng);
      persist();
    },

    tunnelCheckpoint: (choice) => {
      const s = get();
      const run = s.tunnel;
      if (!run || s.combat || s.pendingEvent) return;
      const node = currentNode(run);
      const nodeScope = tunnelNodeScope(run.id, node.id, node.name);
      if (node.kind !== 'checkpoint' || node.state === 'done') return;

      if (choice === 'pay') {
        const tribute = FACTION_CONFIG.sta.tribute;
        const paying = tribute.find((id) => hasBackpackItem(id));
        if (!paying) {
          pushLog(`No fare, no passage. They want ${tribute.map((id) => itemDef(id).name).join(', or ')}.`, 'bad');
          return;
        }
        consumeBackpackItem(paying);
        set({ tunnel: markDone(run, node.id) });
        shiftStanding('sta', 1);
        pushLog(`You hand over ${itemDef(paying).name}. The marshals step aside.`, 'good', undefined, undefined, nodeScope);
        persist();
        return;
      }

      const rng = new Rng(s.seed).fork(tunnelKey(run, `sneak:${node.id}`));
      const check = rollCheck(
        rng,
        s.character!.attributes.dexterity,
        hazardDc(node),
        sumTraitMod(s.character!.traitIds, 'checkBonusMod'),
      );
      if (check.success) {
        set({ tunnel: markDone(run, node.id) });
        pushLog(`${node.name}: you slip the chain and they never turn.`, 'good', undefined, undefined, nodeScope);
        persist();
        return;
      }
      shiftStanding('sta', -1);
      pushLog(`${node.name}: a torch finds you. Steel comes out.`, 'bad', undefined, undefined, nodeScope);
      startHumanCombat(run.fromLocationId, 'sta', false, {
        terrainOverride: 'tunnel_bore',
        danger: nodeThreat(node),
        tunnel: { nodeId: node.id, lootMod: 0 },
        key: tunnelKey(run, `sta:${node.id}`),
        intro: `An STA marshal draws on you in ${node.name}.`,
      });
    },

    confirmTempStash: () => {
      const s = get();
      const leftover = s.items.filter((i) => i.container === TEMP_STASH);
      if (leftover.length === 0) {
        pushLog('Loose haul sorted. You\'re clean to move.', 'info');
        return;
      }
      const names = leftover
        .map((i) => `${itemDef(i.defId).name}×${i.stack}`)
        .slice(0, 4)
        .join(', ');
      set({ items: s.items.filter((i) => i.container !== TEMP_STASH) });
      pushLog(`You leave behind ${names}${leftover.length > 4 ? '…' : ''} and move on.`, 'bad');
      persist();
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
      let locs = { ...get().locations };
      locs[loc.id] = { ...locs[loc.id], intelUsedDay: s.day };

      // Prefer revealing a nearby undiscovered POI that this faction would
      // actually know about; else any nearby; else tip an outpost.
      const bias = INTEL_CATEGORIES[loc.factionId];
      const pick = pickIntelTarget(
        rng,
        locs,
        { lat: loc.lat, lng: loc.lng, excludeId: loc.id },
        bias,
        DEFAULT_INTEL_RADIUS_M,
        get().evacZoneId,
      );

      if (pick) {
        const applied = applyPreciseReveal(locs, pick.id);
        if (!applied) {
          set({ locations: locs });
          pushLog(
            `${FACTION_CONFIG[loc.factionId].shortName} shrug. Nothing fresh on the board today.`,
            'info',
          );
          persist();
          return;
        }
        locs = applied.locs;
        set({ locations: locs, mapAnnotations: pruneMapAnnotations(get().mapAnnotations, locs) });
        const tip = applied.target.isFactionOutpost && applied.target.factionId
          ? `${FACTION_CONFIG[applied.target.factionId].shortName} ${FACTION_CONFIG[applied.target.factionId].outpostName}`
          : POI_CONFIG[applied.target.category].label;
        pushLog(
          `${FACTION_CONFIG[loc.factionId].shortName} tip you off: ${applied.target.name} (${tip}) about ${Math.round(haversine(loc.lat, loc.lng, applied.target.lat, applied.target.lng))} m out. Marked on your map.`,
          'good',
          undefined,
          { lat: applied.target.lat, lng: applied.target.lng, label: applied.target.name },
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
            undefined,
            { lat: other.lat, lng: other.lng, label: other.name },
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

    factionFeed: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim) return;
      const posId = s.currentPositionId;
      const loc = posId ? s.locations[posId] : null;
      if (!loc?.factionId) return;
      if (!locationServices(loc, s.outposts).includes('feed')) {
        pushLog('Nobody is cooking here.', 'info');
        return;
      }
      if (!hasFactionClearance(loc, s.factionStanding, s.day)) {
        pushLog('You are not on their grounds yet. Approach the gate first.', 'bad');
        return;
      }
      if (!factionFeeds(loc.factionId, s.factionStanding)) {
        pushLog(
          `${FACTION_CONFIG[loc.factionId].shortName} feed their own. Earn a place at the table.`,
          'bad',
        );
        return;
      }
      if ((loc.feedUsedDay ?? -1) >= s.day) {
        pushLog('The pot is empty until tomorrow. Come back then.', 'info');
        return;
      }
      if (advanceTime(0.5)) return;
      const foodEffectMod = sumTraitMod(get().character!.traitIds, 'foodEffectMod');
      const meters = { ...get().meters };
      meters.hunger = clampMeter(meters.hunger + Math.round(CANTEEN_HUNGER * (1 + foodEffectMod)));
      meters.thirst = clampMeter(meters.thirst + CANTEEN_THIRST);
      set({
        meters,
        locations: {
          ...get().locations,
          [loc.id]: { ...get().locations[loc.id], feedUsedDay: s.day },
        },
      });
      pushLog(
        'Gotong sits you down. Hot rice, a mug of something boiled, and a few minutes that are not the street.',
        'good',
      );
      persist();
    },

    factionEscort: (destinationId) => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim) return;
      const posId = s.currentPositionId;
      const loc = posId ? s.locations[posId] : null;
      if (!loc?.factionId) return;
      if (!locationServices(loc, s.outposts).includes('escort')) {
        pushLog('No patrol is leaving from here.', 'info');
        return;
      }
      if (!hasFactionClearance(loc, s.factionStanding, s.day)) {
        pushLog('You are not on their grounds yet. Approach the gate first.', 'bad');
        return;
      }
      if (!factionEscorts(loc.factionId, s.factionStanding)) {
        pushLog(
          `${FACTION_CONFIG[loc.factionId].shortName} do not walk strangers. Earn a name in the book.`,
          'bad',
        );
        return;
      }
      const dest = s.locations[destinationId];
      if (!dest?.discovered) {
        pushLog('Name a place they know. Walk it yourself first.', 'bad');
        return;
      }
      if (!escortCandidates(loc, s.locations).some((c) => c.id === dest.id)) {
        pushLog(
          `${dest.name} is outside their neighbourhood walk (${ESCORT_RANGE_M} m).`,
          'bad',
        );
        return;
      }
      const tributeId = FACTION_CONFIG.muster.tribute.find((id) =>
        s.items.some((i) => i.container === 'backpack' && i.defId === id && i.stack > 0),
      );
      if (!tributeId) {
        pushLog(
          `They want a tin, cells, or a wrap for the road. ${FACTION_CONFIG.muster.tribute.map((id) => itemDef(id).name).join(' / ')}.`,
          'bad',
        );
        return;
      }
      if (advanceTime(0.25)) return;
      set({
        items: consumeOneOf(get().items, tributeId),
        escort: { toId: dest.id },
      });
      pushLog(
        `The Muster take ${itemDef(tributeId).name} and fall in. They will walk you to ${dest.name}.`,
        'good',
      );
      persist();
    },

    searchKinDeck: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim || s.hdb) return;
      const loc = s.currentPositionId ? s.locations[s.currentPositionId] : null;
      if (!loc?.factionId) return;
      if (!hasFactionClearance(loc, s.factionStanding, s.day)) {
        pushLog('You are not on their grounds yet. Approach the gate first.', 'bad');
        return;
      }
      if (!canKinSearch88Deck(loc, s.factionStanding)) {
        pushLog('The decks are not yours. Not yet.', 'bad');
        return;
      }
      if (!loc.kinDeckUsed) {
        pushLog('They know your face. The decks are yours — this once.', 'good');
      }
      get().hdbEnter();
    },

    /**
     * Two-step at the pad. The approach stays fogged, but standing on the
     * ground gets you a real read: the first press raises the channel and the
     * crew states their manifest in numbers. That read persists for the rest of
     * the window, so a short haul can be topped up on purpose instead of by
     * guesswork. A pack that already clears the bar lifts on the same press.
     */
    callEvac: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim) return;
      if (!s.evacZoneId || s.currentPositionId !== s.evacZoneId) {
        pushLog('You need to be at the evac zone to signal for a lift.', 'bad');
        return;
      }
      const bias = s.evacDemandBias ?? 'balanced';
      const read = evacReadiness(s.items, s.day, s.evacDemand, bias);
      if (!s.evacManifestRevealed) {
        set({ evacManifestRevealed: true });
        pushLog(
          `Channel up. The crew reads out their manifest: ${read.required} of weighted haul, ${BIAS_LOG[bias]} Your pack scans at ${read.current}.`,
          'info',
        );
      }
      if (!read.ready) {
        pushLog(
          `Still ${read.required - read.current} short of the lift. Fuel, meds, and ammo count most.`,
          'bad',
        );
        persist();
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
      const burnHp = current.hdbUnit?.searchHp;
      if (burnHp && burnHp > 0) {
        const burnRng = new Rng(get().seed).fork(
          `burn:${current.nonce}:${result.session.revealedCount}`,
        );
        const bodyParts = applyWound(get().bodyParts, burnHp, burnRng);
        set({ bodyParts });
        pushLog(`The unit is still burning — it costs you ${burnHp} health.`, 'bad');
        const cause = checkDeath(get().meters, bodyParts);
        if (cause) {
          endRun(cause);
          return;
        }
      }
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
      const next: SearchSession = { ...session, slots: nextSlots, lastWhisper: null };
      set({
        items: moved.items,
        pendingSearch: next,
      });
      if (moved.lost) pushLog(`No room for the ${itemDef(moved.defId).name}.`, 'bad');
      else if (moved.stashed) {
        pushLog(`${itemDef(moved.defId).name} goes in the stash — pack is full.`, 'info');
      }
      // Nothing left to search or take — close the session without a Done click.
      if (!hasFoggedOrSearching(next) && !next.slots.some((sl) => sl.state === 'found')) {
        closeSearchSession(next, 'complete');
        return;
      }
      persist();
    },

    takeAllFound: () => {
      const s = get();
      const session = s.pendingSearch;
      if (!session) return true;
      let items = s.items;
      let working = session;
      let stashed = false;
      // Stop at the first find that fits nowhere rather than destroying it — the
      // rest stay on the ground until the player makes room.
      let blocked = false;
      for (const slot of session.slots) {
        if (slot.state !== 'found' || !slot.uid) continue;
        const moved = relocateFoundItem(items, slot.uid, working.stashLocationId);
        if (!moved) continue;
        if (moved.lost) {
          blocked = true;
          break;
        }
        items = moved.items;
        if (moved.stashed) stashed = true;
        working = {
          ...working,
          slots: working.slots.map((sl) =>
            sl.id === slot.id ? { ...sl, state: 'taken' as const } : sl,
          ),
        };
      }
      set({ items, pendingSearch: working });
      if (stashed) pushLog('Pack full — extras went onto the site stash.', 'info');
      if (blocked) pushLog('No room left — the rest stays where it lies.', 'bad');
      if (!hasFoggedOrSearching(working) && !working.slots.some((sl) => sl.state === 'found')) {
        closeSearchSession(working, 'complete');
        return !blocked;
      }
      persist();
      return !blocked;
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

    ensureSiteRuin: (locationId) => {
      ensureSiteRuin(locationId);
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
        if (pe.tunnelStationIds?.length) {
          beginTunnelRoute(pe.tunnelStationIds);
          return;
        }
        if (pe.tunnelTo) {
          const from = get().locations[pe.locationId];
          const to = get().locations[pe.tunnelTo];
          if (from?.mrtStationId && to?.mrtStationId) {
            beginTunnelRoute([from.mrtStationId, to.mrtStationId]);
          }
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
          case 'treat': {
            const cur = get();
            set({ bodyParts: treatInjuries(cur.bodyParts, e.amount, 'all') });
            pushLog(e.line, 'good');
            return true;
          }
          case 'service': {
            const svc = pe.hdbService;
            const cur = get();
            if (!svc || !cur.hdb) return true;
            const hdb = markHdbUnitCleared(cur.hdb, svc.level, svc.unitId);
            set({ hdb, hdbBlocks: { ...cur.hdbBlocks, [hdb.locationId]: hdb } });
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

      const pockets = hazardsAtPoint(
        s.seed,
        s.currentPos.lat,
        s.currentPos.lng,
        s.spawn ?? undefined,
        hordeIntensity(s.hordeLevel),
        { band: 'night', day: s.day, pressureAt: pressureFn() },
      );
      const conditions = applySleepOccupancy(
        evaluateSleepConditions(sleepContextFromState()),
        pockets,
      );
      const fullRest = sleepRestore(
        s.meters.energy,
        hoursToMorning,
        s.meters,
        sumTraitMod(s.character!.traitIds, 'sleepRestoreMod'),
      );
      const restedEnergy = applySleepRecovery(
        s.meters.energy,
        fullRest,
        conditions.recoveryMult,
      );
      if (advanceTime(hoursToMorning, restedEnergy, true)) return;
      bumpStats({ nightsSlept: 1 });

      // you slept here — your knowledge of THIS place stays current
      const posId = get().currentPositionId;
      if (posId) discoverLocation(posId);
      const rough = conditions.recoveryMult < 0.85;
      pushLog(flavor(rough ? 'restExposed' : 'rest'), rough ? 'bad' : 'info');
      pushLog(conditions.summary, rough ? 'bad' : 'info');
      for (const note of conditions.occupancyNotes) {
        pushLog(note, 'info');
      }

      const g = get();
      const nightRng = new Rng(g.seed).fork(`roughsleep:${g.day}:${g.currentPos.lat.toFixed(5)}`);
      const risk = trekRisk(g.seed, g.currentPos, g.currentPos, {
        band: 'night',
        hordeIntensity: hordeIntensity(g.hordeLevel),
        pressureAt: pressureFn(),
        weatherEncounterMod: 0,
        traitEncounterMod:
          sumTraitMod(g.character!.traitIds, 'encounterChanceMod') +
          sumTraitMod(g.character!.traitIds, 'nightEncounterChanceMod') +
          sumTraitMod(g.character!.traitIds, 'ambushChanceMod') * 0.15 +
          equipEncounterChanceMod(g.equipment) +
          bleedEncounterMod(g.bodyParts),
        safe: g.spawn ?? undefined,
        day: g.day,
      });
      const preview = restAmbushPreview(conditions, risk.encounterChance);
      if (preview.infectionDelta > 0) {
        set({
          meters: {
            ...get().meters,
            infection: clampMeter(get().meters.infection + preview.infectionDelta),
          },
        });
        pushLog('The damp gets into you.', 'bad');
      }
      if (preview.collapseWound && nightRng.chance(0.4)) {
        const leg = nightRng.chance(0.5) ? 'leftLeg' : 'rightLeg';
        set({
          bodyParts: applyPartDamage(get().bodyParts, leg, 6 + nightRng.int(0, 6), nightRng),
        });
        pushLog('The rubble shifts under you in the night.', 'bad');
      }

      if (conditions.ambush) {
        if (nightRng.chance(preview.ambushChance)) {
          pushLog('Something found you in the dark.', 'bad');
          const worst = pockets.reduce<typeof pockets[number] | null>(
            (acc, z) => (!acc || z.severity > acc.severity ? z : acc),
            null,
          );
          const swarm = pockets.find((z) => z.kind === 'night_swarm');
          const restHabitat = habitatAt(g.currentPos.lat, g.currentPos.lng);
          const { enemy, drops } = rollWildsEncounter(nightRng, risk.combatDanger, {
            hazard: swarm?.kind ?? worst?.kind ?? null,
            forest: restHabitat === 'forest',
            habitat: restHabitat,
            floodwater: pockets.some((z) => z.kind === 'floodwater'),
          });
          set({
            combat: {
              locationId: null,
              zombie: enemy,
              round: 0,
              log: [{ round: 0, tone: 'bad', text: `You wake to ${enemy.name} standing over you.` }],
              over: false,
              outcome: null,
              playerHpSnapshot: totalHp(g.bodyParts),
              context: { locationId: null, grantOnFlee: false, wilds: true, drops },
              selectedStance: 'guarded',
              terrain: TERRAIN.open_ground,
              awaitingStance: true,
              playerGauge: 0,
              enemyGauge: 0,
              acting: null,
              paused: false,
              speedIndex: 1,
              impact: null,
            },
            _combatRng: nightRng.fork('fight'),
          });
          return;
        }
      }
      persist();
    },

    peekSleepConditions: () => peekRestFromState().conditions,

    peekRestPreview: () => peekRestFromState(),

    applyItem: (uid) => {
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
      // Freshness pays. A wilting packet still feeds, just not as much — and the
      // log says so, so the player learns to eat the old stuff first.
      const fresh = (base: number) => scaledRestore(inst, base);
      const faded = hasCondition(inst) && consumableScale(inst) < 1;
      const foodEffectMod = sumTraitMod(s.character!.traitIds, 'foodEffectMod');
      const m = { ...s.meters };
      let newBodyParts = s.bodyParts;
      let consumed = false;
      // Spoiled food still feeds you — it just asks for something back.
      let spoiledInfection = 0;
      switch (def.effect.kind) {
        case 'food': {
          const fx = def.effect;
          m.hunger = clampMeter(m.hunger + Math.round(fresh(fx.hunger) * (1 + foodEffectMod)));
          if (fx.thirst != null) m.thirst = clampMeter(m.thirst + fresh(fx.thirst));
          if (fx.energy != null) m.energy = clampMeter(m.energy + fresh(fx.energy));
          consumed = true;
          pushLog(
            `Ate ${def.name}. ${consumableRestoreSummary(fx)}${freshnessNote(inst)}.`,
            faded ? 'info' : 'good',
          );
          break;
        }
        case 'water': {
          const fx = def.effect;
          m.thirst = clampMeter(m.thirst + fresh(fx.thirst));
          if (fx.hunger != null) {
            m.hunger = clampMeter(m.hunger + Math.round(fresh(fx.hunger) * (1 + foodEffectMod)));
          }
          if (fx.energy != null) m.energy = clampMeter(m.energy + fresh(fx.energy));
          const waterRisk = (fx.infectionRisk ?? 0) + (inst.contaminationRisk ?? 0);
          if (waterRisk > 0) {
            const resist = sumTraitMod(s.character!.traitIds, 'infectionResist');
            m.infection = clampMeter(m.infection + waterRisk * (1 - resist));
            pushLog(
              `Drank ${def.name}. ${consumableRestoreSummary(fx)} — it sits wrong (+${Math.round(waterRisk * (1 - resist))} infection).`,
              'bad',
            );
          } else {
            pushLog(
              `Drank ${def.name}. ${consumableRestoreSummary(fx)}${freshnessNote(inst)}.`,
              faded ? 'info' : 'good',
            );
          }
          consumed = true;
          break;
        }
        case 'heal': {
          const healAmt =
            fresh((def.effect.partHeal ?? 0) + (def.effect.health ?? 0)) + healBonus;
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
          m.infection = clampMeter(m.infection - fresh(def.effect.infection));
          consumed = true;
          pushLog(
            faded
              ? `Took ${def.name}. Past its date — infection pushed back, but not as hard.`
              : `Took ${def.name}. Infection pushed back.`,
            faded ? 'info' : 'good',
          );
          break;
        case 'energy': {
          const fx = def.effect;
          m.energy = clampMeter(m.energy + fresh(fx.energy));
          if (fx.hunger != null) {
            m.hunger = clampMeter(m.hunger + Math.round(fresh(fx.hunger) * (1 + foodEffectMod)));
          }
          if (fx.thirst != null) m.thirst = clampMeter(m.thirst + fresh(fx.thirst));
          consumed = true;
          pushLog(
            `Had a ${def.name}. ${consumableRestoreSummary(fx)}${freshnessNote(inst)}.`,
            faded ? 'info' : 'good',
          );
          break;
        }
        case 'ammo': {
          pushLog(
            'Use Refill on a magazine or holstered shotgun — ammo boxes do not load themselves.',
            'info',
          );
          return;
        }
        case 'intel': {
          if (s.travelAnim || s.pendingEvent) {
            pushLog('No time to unfold a map while you are on the move.', 'info');
            return;
          }
          if (advanceTime(0.25)) return;
          const g = get();
          const posLoc = g.currentPositionId ? g.locations[g.currentPositionId] : null;
          const origin = {
            lat: posLoc?.lat ?? g.currentPos.lat,
            lng: posLoc?.lng ?? g.currentPos.lng,
            excludeId: posLoc?.id,
          };
          const rng = new Rng(g.seed).fork(`intel:${inst.uid}`);
          const fx = def.effect;

          if (fx.mode === 'rumour') {
            const target = pickIntelTarget(
              rng,
              g.locations,
              origin,
              fx.bias,
              DEFAULT_INTEL_RADIUS_M,
              g.evacZoneId,
            );
            if (!target) {
              pushLog('The note is too faded — nothing left to mark.', 'info');
              return;
            }
            const fuzz = fx.fuzzM ?? DEFAULT_RUMOUR_FUZZ_M;
            let annotations = pruneMapAnnotations(g.mapAnnotations, g.locations);
            const ann = createRumourAnnotation(
              rng,
              target,
              fuzz,
              def.name,
              inst.uid,
              g.day,
            );
            annotations = [...annotations, ann];
            if (annotations.length > MAX_MAP_ANNOTATIONS) {
              annotations = annotations.slice(-MAX_MAP_ANNOTATIONS);
            }
            consumed = true;
            pushLog(
              `You study ${def.name}. Something worth checking lies roughly ${Math.round(haversine(origin.lat, origin.lng, ann.lat, ann.lng))} m away — marked as a rumour.`,
              'good',
              undefined,
              { lat: ann.lat, lng: ann.lng, label: ann.label },
            );
            set({ mapAnnotations: annotations });
            break;
          }

          if (fx.bias === 'faction') {
            const turf = applyFactionTurfReveal(
              rng,
              g.locations,
              origin,
              3,
              DEFAULT_INTEL_RADIUS_M,
              g.evacZoneId,
            );
            if (!turf.revealed.length) {
              pushLog('The turf lines do not match anything around you anymore.', 'info');
              return;
            }
            consumed = true;
            set({
              locations: turf.locs,
              mapAnnotations: pruneMapAnnotations(g.mapAnnotations, turf.locs),
            });
            const names = turf.revealed.map((site) => site.name).join(', ');
            pushLog(
              `The ${def.name} marks ${turf.revealed.length} held sites: ${names}. Their colours show on your map.`,
              'good',
            );
            break;
          }

          const target = pickIntelTarget(
            rng,
            g.locations,
            origin,
            fx.bias,
            DEFAULT_INTEL_RADIUS_M,
            g.evacZoneId,
          );
          if (!target) {
            pushLog('The note is too faded — nothing left to mark.', 'info');
            return;
          }
          const applied = applyPreciseReveal(g.locations, target.id);
          if (!applied) return;
          consumed = true;
          set({
            locations: applied.locs,
            mapAnnotations: pruneMapAnnotations(g.mapAnnotations, applied.locs),
          });
          const tip = applied.target.isFactionOutpost && applied.target.factionId
            ? `${FACTION_CONFIG[applied.target.factionId].shortName} ${FACTION_CONFIG[applied.target.factionId].outpostName}`
            : POI_CONFIG[applied.target.category].label;
          pushLog(
            `${def.name} points to ${applied.target.name} (${tip}) about ${Math.round(haversine(origin.lat, origin.lng, applied.target.lat, applied.target.lng))} m out. Marked on your map.`,
            'good',
            undefined,
            { lat: applied.target.lat, lng: applied.target.lng, label: applied.target.name },
          );
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
          items: consumeOne(s.items, uid),
        });
        persist();
      }
    },

    moveItem: (uid, container, x, y, rotated) => {
      const s = get();
      const inst = s.items.find((i) => i.uid === uid);
      if (!inst) return false;
      const allowed = (c: string) =>
        c === 'backpack' ||
        c === TEMP_STASH ||
        (c === s.currentPositionId && !s.tunnel);
      // Location stash only while standing there (and not mid-tunnel); temp + pack always ok.
      if (!allowed(container) || !allowed(inst.container)) return false;
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
      const allowed =
        toContainer === 'backpack' ||
        toContainer === TEMP_STASH ||
        toContainer === s.currentPositionId;
      if (!allowed) {
        pushLog('You can only use this stash while here.', 'bad');
        return;
      }
      if (toContainer === s.currentPositionId && s.tunnel) {
        pushLog('Location stash is sealed while you are in the tunnels.', 'bad');
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
      const waterInputId = recipe.waterInput
        ? waterInputFor(s.items, recipe.waterInput)
        : null;
      const inputs = adjustCraftInputs(recipe.inputs, s.character!.traitIds);
      if (waterInputId && recipe.waterInput) inputs[waterInputId] = recipe.waterInput;
      const check = canCraft(recipe, s.items, atShelter, inputs);
      if (!check.ok) {
        pushLog(`Can't make that — ${check.reason.toLowerCase()}.`, 'bad');
        return;
      }
      // Check the pack has room for the output *before* burning hours and
      // inputs — the inputs coming out first is what usually makes the space,
      // so the dry run has to consume them too.
      const spendInputs = (from: ItemInstance[]): ItemInstance[] => {
        let out = from;
        for (const [defId, need] of Object.entries(inputs)) {
          for (let n = 0; n < need; n++) out = consumeOneOf(out, defId);
        }
        return out;
      };
      const dryRun = addToGrid(
        spendInputs(s.items),
        'backpack',
        recipe.outputDefId,
        recipe.outputCount,
      );
      if (dryRun.leftover > 0) {
        pushLog(
          `No room in the pack for ${recipe.outputCount}× ${itemDef(recipe.outputDefId).name} — make space first.`,
          'bad',
        );
        return;
      }

      if (advanceTime(recipe.hours)) return;

      let items = spendInputs(get().items);
      const contaminated =
        waterInputId === 'dirty_water' ? DIRTY_WATER_DRINK_INFECTION : undefined;
      const made = addToGrid(
        items,
        'backpack',
        recipe.outputDefId,
        recipe.outputCount,
        undefined,
        contaminated,
      );
      const outName = itemDef(recipe.outputDefId).name;
      if (made.leftover === recipe.outputCount) {
        // The inputs are already gone; refusing now would eat them for nothing.
        const here = s.currentPositionId;
        const spilled = here
          ? addToGrid(
              items,
              here,
              recipe.outputDefId,
              recipe.outputCount,
              undefined,
              contaminated,
            )
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
      const fromHolster = s.equipment.firearm?.uid === uid;
      const inst = fromHolster ? s.equipment.firearm : s.items.find((i) => i.uid === uid);
      if (!inst) return;
      const def = itemDef(inst.defId);
      if (!canEquip(def, slot)) {
        pushLog(`${def.name} can't go in the ${slot} slot.`, 'bad');
        return;
      }
      if (slot === 'offHand' && isTwoHandedEquipped(s.equipment)) {
        pushLog('Your main-hand weapon needs both hands.', 'bad');
        return;
      }

      if (fromHolster && slot !== 'mainHand') {
        pushLog('Mid-fight you can only wield the holstered gun.', 'bad');
        return;
      }
      if (s.combat && !s.combat.over) {
        const ranged = def.effect.kind === 'weapon' && def.effect.ranged;
        if (slot === 'firearm' || (ranged && slot !== 'mainHand')) {
          pushLog('No time to fiddle with gear mid-fight.', 'bad');
          return;
        }
        if (slot === 'mainHand' && ranged && !fromHolster) {
          pushLog('Only the holstered gun can be wielded mid-fight.', 'bad');
          return;
        }
        if (slot === 'mainHand' && fromHolster && s.equipment.mainHand) {
          pushLog('Drop your melee weapon first — you cannot re-holster mid-fight.', 'bad');
          return;
        }
      }

      let nextItems = fromHolster ? s.items : s.items.filter((i) => i.uid !== uid);
      let nextEquip = { ...s.equipment };
      const prevBag = slot === 'bag' ? nextEquip.bag : null;

      const stow = (prev: ItemInstance | null): boolean => {
        if (!prev) return true;
        const backSlot = findSlot('backpack', nextItems, itemDef(prev.defId));
        if (!backSlot) return false;
        nextItems = [
          ...nextItems,
          { ...prev, container: 'backpack', x: backSlot.x, y: backSlot.y, rotated: backSlot.rotated },
        ];
        return true;
      };

      // Bags are packed onto the *new* silhouette below — never stow them on the old mask.
      if (slot !== 'bag') {
        if (!stow(nextEquip[slot])) {
          pushLog('No room to stow the currently-equipped item.', 'bad');
          return;
        }
        nextEquip[slot] = null;
      }

      // Two-handers clear the off hand; swapping onto main while 2H frees offHand first.
      if (slot === 'mainHand' && def.twoHanded) {
        if (!stow(nextEquip.offHand)) {
          pushLog('No room to stow your off-hand gear.', 'bad');
          return;
        }
        nextEquip.offHand = null;
      }

      const equipped = { ...inst, container: `equip:${slot}`, x: 0, y: 0, rotated: false };
      nextEquip = clearFirearmSlotConflict({ ...nextEquip, [slot]: equipped }, slot as 'firearm' | 'mainHand', uid);
      if (fromHolster) nextEquip = { ...nextEquip, firearm: null };

      const traitW = sumTraitMod(s.character!.traitIds, 'gridWidthBonus');
      if (slot === 'bag') {
        const grid = packGridForBag(traitW, equipped);
        const packItems = nextItems.filter((i) => i.container === 'backpack');
        const rest = nextItems.filter((i) => i.container !== 'backpack');
        const toPack = prevBag ? [...packItems, prevBag] : packItems;
        const arranged = tryArrangeInGrid(grid, toPack);
        if (!arranged.ok) {
          pushLog(
            `Too much in the pack to swap to ${def.name}. Drop or stash some items first.${arrangeOverflowClause(arranged.overflow)}`,
            'bad',
          );
          return;
        }
        nextItems = [...rest, ...arranged.items];
        syncBackpackBonuses(traitW, nextEquip);
      } else {
        syncBackpackBonuses(traitW, nextEquip);
      }

      set({ items: nextItems, equipment: nextEquip });
      pushLog(
        def.twoHanded ? `Equipped ${def.name} (two-handed).` : `Equipped ${def.name}.`,
        'good',
      );
      persist();
    },

    unequipItem: (slot) => {
      const s = get();
      const inst = s.equipment[slot];
      if (!inst) return;

      if (slot === 'bag') {
        const traitW = sumTraitMod(s.character!.traitIds, 'gridWidthBonus');
        const nextEquip = { ...s.equipment, bag: null };
        const grid = packGridForBag(traitW, null);
        const packItems = s.items.filter((i) => i.container === 'backpack');
        const rest = s.items.filter((i) => i.container !== 'backpack');
        const arranged = tryArrangeInGrid(grid, [...packItems, inst]);
        if (!arranged.ok) {
          pushLog(
            `Too much in the pack to take the bag off. Drop or stash some items first.${arrangeOverflowClause(arranged.overflow)}`,
            'bad',
          );
          return;
        }
        syncBackpackBonuses(traitW, nextEquip);
        set({ items: [...rest, ...arranged.items], equipment: nextEquip });
        persist();
        return;
      }

      const backSlot = findSlot('backpack', s.items, itemDef(inst.defId));
      if (!backSlot) {
        pushLog('Backpack is full.', 'bad');
        return;
      }
      const nextEquip = { ...s.equipment, [slot]: null };
      set({
        items: [
          ...s.items,
          { ...inst, container: 'backpack', x: backSlot.x, y: backSlot.y, rotated: backSlot.rotated },
        ],
        equipment: nextEquip,
      });
      persist();
    
    },


    combatEngage: () => {
      const s = get();
      if (!s.combat || s.combat.over || !s.combat.awaitingStance) return;
      const weather = { kind: weatherKindFor(s.seed, s.day), time: timeOfDay(s.hour) };
      set({
        combat: {
          ...s.combat,
          // Contact opens on Guarded; the player can shift stance once the
          // track is running.
          selectedStance: 'guarded',
          awaitingStance: false,
          // Both markers start level; from here it is speed that decides who
          // swings first, not turn order.
          playerGauge: 0,
          enemyGauge: 0,
          log: [...s.combat.log, ...openingNotes(s.combat.terrain, weather)],
        },
      });
    },

    combatSetStance: (stance) => {
      const s = get();
      if (!s.combat || s.combat.over || s.combat.awaitingStance) return;
      // Disengage is a flee attempt, not a holdable fight stance.
      if (stance === 'disengage') return;
      if (stance === s.combat.selectedStance) return;
      const next = STANCES[stance];
      set({
        combat: {
          ...s.combat,
          selectedStance: stance,
          log: [
            ...s.combat.log,
            {
              round: s.combat.round,
              tone: 'info' as const,
              text: `You shift to ${next.name}.`,
              side: 'player' as const,
            },
          ],
        },
      });
    },

    /** Bail out at contact or mid-fight — always resolved on the disengage profile. */
    combatBreakOff: () => {
      const s = get();
      if (!s.combat || s.combat.over) return;
      const wasAwaiting = s.combat.awaitingStance;
      const weather = { kind: weatherKindFor(s.seed, s.day), time: timeOfDay(s.hour) };
      set({
        combat: {
          ...s.combat,
          selectedStance: 'disengage',
          awaitingStance: false,
          log: wasAwaiting
            ? [...s.combat.log, ...openingNotes(s.combat.terrain, weather)]
            : s.combat.log,
        },
      });
      get().combatFlee();
    },

    // ---------------------------------------------- HDB vertical dungeon --

    hdbEnter: () => {
      const s = get();
      const loc = s.currentPositionId ? s.locations[s.currentPositionId] : null;
      if (!loc || s.combat || s.pendingEvent || s.pendingSearch || s.hdb) return;
      if (loc.factionId) {
        const kin =
          canKinSearch88Deck(loc, s.factionStanding) &&
          hasFactionClearance(loc, s.factionStanding, s.day);
        if (!kin) {
          pushLog(
            `${FACTION_CONFIG[loc.factionId].shortName} hold this block. You deal with them at the void deck — you don't crawl the stairs.`,
            'info',
          );
          return;
        }
        if (!loc.kinDeckUsed) {
          set({
            locations: {
              ...s.locations,
              [loc.id]: { ...loc, kinDeckUsed: true },
            },
          });
        }
      }
      // A block you've already worked keeps its state — cleared units stay cleared.
      // Blocks saved before the cutaway strip topology have nothing safe to restore,
      // so they get rebuilt rather than loaded into a UI that would crash on them.
      const stored = s.hdbBlocks[loc.id];
      const savedRaw = hasStripTopology(stored) ? stored : null;
      const saved = savedRaw ? migrateHdbDungeon(savedRaw) : null;
      if (saved) {
        // The block settles while you're gone, but it doesn't forget entirely.
        // Re-enter at the void deck / lobby — fog memory stays in revealedLevels.
        const pos = { level: 1, column: saved.pos?.column ?? 0 };
        set({
          hdbWalk: null,
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
        pushLog(
          `You climb back into ${loc.name}. You remember which doors you've done.`,
          'info',
          undefined,
          undefined,
          hdbBlockScope(loc.id, loc.name),
        );
        sweepFloor(1);
        return;
      }
      const archetype: HdbArchetype = loc.cleared && loc.factionId ? 'shelter' : 'estate';
      const rng = new Rng(s.seed).fork(`hdb:${loc.id}`);
      set({ hdbWalk: null, hdb: generateDungeon(rng, loc, archetype) });
      pushLog(
        archetype === 'shelter'
          ? `You climb into ${loc.name}. Someone has made this block liveable.`
          : get().hdb?.groundKind === 'enclosed'
            ? `You push into the ground lobby of ${loc.name}. The stairs climb into the dark.`
            : `You slip under ${loc.name}'s void deck. Pillars, stair mouths, and the smell of old rain.`,
        'info',
        undefined,
        undefined,
        hdbBlockScope(loc.id, loc.name),
      );
      sweepFloor(1);
    },

    hdbBreach: (unitId) => {
      const s = get();
      if (hdbBusy() || !s.hdb) return;
      const level = s.hdb.currentLevel;
      const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
      if (!unit || !unit.available || unit.state === 'cleared' || unit.state === 'breached') return;
      if (s.hdb.pos.column !== unit.column || s.hdb.pos.level !== level) {
        pushLog('You need to walk to that door first.', 'info');
        return;
      }
      const verb = UNIT_META[unit.type].verb;
      if (verb === 'service' || verb === 'intel') {
        pushLog('That door is already hanging. Use what is inside.', 'info');
        return;
      }
      resolveHdbDoor(unitId, breachOutcome(s.hdb, unit, level), unit.entry);
    },

    hdbPick: (unitId) => {
      const s = get();
      if (hdbBusy() || !s.hdb || !s.character) return;
      const level = s.hdb.currentLevel;
      const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
      if (!unit || !unit.available || unit.state === 'cleared' || unit.state === 'breached') return;
      if (s.hdb.pos.column !== unit.column || s.hdb.pos.level !== level) {
        pushLog('You need to walk to that door first.', 'info');
        return;
      }
      if (unit.entry !== 'locked') {
        pushLog(
          unit.entry === 'barricaded'
            ? 'A barricade does not take a pick. Force it or walk away.'
            : 'That door is not locked.',
          'info',
        );
        return;
      }
      if (!hasBackpackItem(LOCKPICK_ID)) {
        pushLog('You need a lockpick in the pack.', 'info');
        return;
      }
      consumeBackpackItem(LOCKPICK_ID);
      if (advanceTime(PICK_MINUTES / 60)) return;
      const g = get();
      if (!g.hdb || !g.character) return;
      const pickMod = sumTraitMod(g.character.traitIds, 'hdbPickMod');
      const rng = new Rng(g.seed).fork(`pick:${g.hdb.locationId}:${unitId}:${g.day}:${g.hdb.moveSeq}`);
      const check = pickCheck(rng, g.character.attributes.dexterity, pickMod);
      pushLog(
        `Pick the lock — ${attrEmoji('dexterity')} d20 ${check.roll}+${g.character.attributes.dexterity}${pickMod ? `+${pickMod}` : ''} = ${check.total} vs DC ${check.dc}`,
        check.success ? 'good' : 'bad',
      );
      if (!check.success) {
        pushLog('The lock holds. The pick snaps in the cylinder.', 'bad');
        persist();
        return;
      }
      pushLog('The lock turns without a sound.', 'good');
      const quiet = { ...unit, entry: 'ajar' as const };
      resolveHdbDoor(unitId, breachOutcome(g.hdb, quiet, level), 'ajar', { skipTime: true });
    },

    hdbGoTo: (target) => {
      const s = get();
      if (hdbBusy() || !s.hdb) return;
      if (samePos(s.hdb.pos, target)) return;
      if (!canTargetCell(s.hdb, target)) return;

      const attempt = findPathToward(s.hdb, s.hdb.pos, target);
      if (!attempt) {
        pushLog('No way through from here.', 'info');
        return;
      }
      if (attempt.path.length < 2) {
        if (attempt.blockedBy) {
          const label = BLOCK_META[attempt.blockedBy.kind].label.toLowerCase();
          pushLog(
            attempt.blockedBy.breakable
              ? `A ${label} blocks the way. Clear it from here to go further.`
              : `A ${label} blocks the way. No way through.`,
            'info',
          );
        } else {
          pushLog('No way through from here.', 'info');
        }
        return;
      }

      const path = attempt.path;
      const seq = (s.hdb.moveSeq ?? 0) + 1;
      set({
        hdb: { ...s.hdb, moveSeq: seq },
        hdbWalk: {
          path,
          index: 0,
          startedAt: Date.now(),
          stepMs: hopWalkMs(path[0], path[1]),
          blockedBy: attempt.reached ? null : attempt.blockedBy,
          reached: attempt.reached,
        },
      });
    },

    hdbWalkStep: () => {
      const s = get();
      if (!s.hdb || !s.hdbWalk || s.combat || s.pendingSearch || s.pendingEvent || !s.character) {
        return;
      }
      const walk = s.hdbWalk;
      const from = walk.path[walk.index];
      const to = walk.path[walk.index + 1];
      if (!from || !to) {
        set({ hdbWalk: null });
        return;
      }
      if (Date.now() - walk.startedAt < walk.stepMs - 16) return;

      const load = loadOf(s);
      const minutes = hopMinutes(from, to, load.stairMult);
      if (advanceTime(minutes / 60, undefined, false, false, load.energyMult)) {
        set({ hdbWalk: null });
        return;
      }
      const g = get();
      if (!g.hdb || !g.hdbWalk || !g.character) return;

      const seq = g.hdb.moveSeq ?? 0;
      const stairHop = from.level !== to.level;
      const floorLogScope = hdbFloorScope(g.hdb.locationId, from.level);

      if (stairHop && isHunting(g.hdb)) {
        const huntRng = new Rng(g.seed).fork(
          `hunt:${g.hdb.locationId}:${posKey(from)}:${posKey(to)}:${g.day}:${seq}:${walk.index}`,
        );
        if (huntRng.chance(HUNT_ELITE_CHANCE)) {
          set({ hdbWalk: null });
          pushLog('The stairwell is not empty. It has been waiting.', 'bad', undefined, undefined, floorLogScope);
          startZombieCombat(g.hdb.locationId, false, {
            terrainOverride: 'hdb_corridor',
            enemy: makeHulk(huntRng, floorThreat(g.hdb, from.level)),
            intro: 'It fills the landing shoulder to shoulder.',
            hdbStairs: { dest: to },
          });
          return;
        }
        pushLog('You take the stairs in silence. Nothing follows — this time.', 'info', undefined, undefined, floorLogScope);
      }

      const dropped = hopStoreysDropped(from, to);
      if (dropped > 0 && descentIsChecked(g.hdb)) {
        const rng = new Rng(g.seed).fork(
          `retreat:${g.hdb.locationId}:${from.level}:${to.level}:${g.day}:${seq}:${walk.index}`,
        );
        for (let i = 0; i < dropped; i++) {
          const check = retreatCheck(rng, g.character.attributes, g.hdb, load.fleeDcMod);
          pushLog(
            `Storey descent (${i + 1}/${dropped}) — ${attrEmoji('dexterity')} ${attrEmoji('endurance')} d20 ${check.roll}+${g.character.attributes.dexterity + g.character.attributes.endurance} = ${check.total} vs DC ${check.dc}`,
            check.success ? 'good' : 'bad',
            undefined,
            undefined,
            floorLogScope,
          );
          if (!check.success) {
            set({ hdbWalk: null });
            pushLog('Something comes up the stairs to meet you.', 'bad', undefined, undefined, floorLogScope);
            startZombieCombat(g.hdb.locationId, false, {
              terrainOverride: 'hdb_corridor',
              danger: floorThreat(g.hdb, from.level),
              intro: 'Cut off on the landing.',
              hdbStairs: { dest: to },
            });
            return;
          }
        }
      }

      const wasNew = !g.hdb.revealedLevels.includes(to.level);
      const moved = moveTo(g.hdb, to);
      const nextIndex = walk.index + 1;
      const more = nextIndex < walk.path.length - 1;
      if (more) {
        const nxt = walk.path[nextIndex + 1];
        set({
          hdb: moved,
          hdbWalk: {
            ...walk,
            index: nextIndex,
            startedAt: Date.now(),
            stepMs: hopWalkMs(to, nxt),
          },
        });
      } else {
        set({ hdb: moved, hdbWalk: null });
        if (!walk.reached && walk.blockedBy) {
          const label = BLOCK_META[walk.blockedBy.kind].label.toLowerCase();
          pushLog(
            walk.blockedBy.breakable
              ? `You stop short of a ${label}. Clear it to keep going.`
              : `You stop short of a ${label}. That way is gone.`,
            'info',
          );
        }
      }
      if (wasNew) sweepFloor(to.level);
    },

    hdbForceBlock: (key) => {
      const s = get();
      if (hdbBusy() || !s.hdb) return;
      const adj = adjacentBreakableBlocks(s.hdb).find((a) => a.key === key);
      if (!adj) return;
      const scaled = scaleDoorCost(adj.block.minutes, adj.block.heat, hdbForceOpts());
      if (advanceTime(scaled.minutes / 60)) return;
      const g = get();
      if (!g.hdb) return;
      const floorLogScope = hdbFloorScope(g.hdb.locationId, g.hdb.pos.level);
      const cleared = addHeat(clearBlock(g.hdb, key), scaled.heat, g.hdb.pos.level);
      set({ hdb: cleared });
      get().emitNoise(g.currentPos.lat, g.currentPos.lng, 280, 1);
      pushLog(
        `You clear the ${BLOCK_META[adj.block.kind].label.toLowerCase()}. ${Math.round(scaled.minutes)} min, loud.`,
        'bad',
        undefined,
        undefined,
        floorLogScope,
      );
      persist();
    },

    hdbUnlockGate: (key) => {
      const s = get();
      if (hdbBusy() || !s.hdb) return;
      const adj = adjacentBreakableBlocks(s.hdb).find((a) => a.key === key);
      if (!adj || adj.block.kind !== 'stair_gate' || !hasFob(s.hdb, adj.block.keyId)) return;
      if (advanceTime(FOB_MINUTES / 60)) return;
      const g = get();
      if (!g.hdb) return;
      set({ hdb: clearBlock(g.hdb, key) });
      pushLog(
        'The fob clicks. The grate swings.',
        'good',
        undefined,
        undefined,
        hdbFloorScope(g.hdb.locationId, g.hdb.pos.level),
      );
      persist();
    },

    hdbUseService: (unitId) => {
      const s = get();
      if (hdbBusy() || !s.hdb) return;
      const level = s.hdb.currentLevel;
      const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
      if (!unit?.service || !unit.available || unit.state === 'cleared') return;
      const unitLogScope = hdbUnitScope(s.hdb.locationId, level, unitId, unit.label);
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
        pushLog('You sleep six hours behind a locked gate. Nothing finds you.', 'good', undefined, undefined, unitLogScope);
      } else if (unit.service === 'field_doctor') {
        const rng = new Rng(s.seed).fork(`doc:${s.hdb.locationId}:${unitId}:${s.day}`);
        const event = fieldDoctorEvent(rng, s.hdb.name);
        pushLog(event.tell, 'info', undefined, undefined, unitLogScope);
        set({
          pendingEvent: { locationId: s.hdb.locationId, event, hdbService: { level, unitId } },
          _eventRng: rng,
        });
        return;
      } else {
        if (!hasBackpackItem('jewellery')) {
          pushLog('The trader looks at your pack and shrugs. Nothing they want.', 'info');
          return;
        }
        consumeBackpackItem('jewellery');
        const r = addToGrid(get().items, 'backpack', 'medkit', 1);
        set({ items: r.items });
        pushLog('You trade jewellery for a medkit. Gold is worth less every day.', 'good', undefined, undefined, unitLogScope);
      }
      const hdb = markHdbUnitCleared(get().hdb!, level, unitId);
      set({ hdb, hdbBlocks: { ...get().hdbBlocks, [hdb.locationId]: hdb } });
      persist();
    },

    hdbUseShelter: (unitId) => {
      const s = get();
      if (hdbBusy() || !s.hdb || !s.character) return;
      const level = s.hdb.currentLevel;
      const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
      if (!unit || unit.type !== 'shelter' || !unit.available || unit.state === 'cleared') return;
      const unitLogScope = hdbUnitScope(s.hdb.locationId, level, unitId, unit.label);
      if (unit.state !== 'breached') {
        pushLog('Force the steel door first.', 'info');
        return;
      }
      if (s.hdb.pos.column !== unit.column || s.hdb.pos.level !== level) {
        pushLog('You need to walk to that door first.', 'info');
        return;
      }
      const restored = sleepRestore(
        s.meters.energy,
        SHELTER_HOURS,
        s.meters,
        sumTraitMod(s.character.traitIds, 'sleepRestoreMod'),
      );
      if (advanceTime(SHELTER_HOURS, restored, true)) return;
      const g = get();
      if (!g.hdb) return;
      const cooled = dropHeat(g.hdb, SHELTER_HEAT_DROP, level);
      const hdb = markHdbUnitCleared(cooled, level, unitId);
      set({ hdb, hdbBlocks: { ...g.hdbBlocks, [hdb.locationId]: hdb } });
      bumpStats({ hdbUnitsCleared: 1 });
      pushLog(
        `You hole up for ${SHELTER_HOURS} hours. The stairwell forgets you a little (−${SHELTER_HEAT_DROP} heat).`,
        'good',
        undefined,
        undefined,
        unitLogScope,
      );
      persist();
    },

    hdbReadNotice: (unitId) => {
      const s = get();
      if (hdbBusy() || !s.hdb) return;
      const level = s.hdb.currentLevel;
      const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
      if (!unit || unit.type !== 'notice' || !unit.available || unit.state === 'cleared') return;
      const unitLogScope = hdbUnitScope(s.hdb.locationId, level, unitId, unit.label);
      if (s.hdb.pos.column !== unit.column || s.hdb.pos.level !== level) {
        pushLog('You need to walk to that door first.', 'info');
        return;
      }
      if (advanceTime(0.25)) return;
      const g = get();
      if (!g.hdb) return;
      const loc = g.locations[g.hdb.locationId];
      const rng = new Rng(g.seed).fork(`notice:${g.hdb.locationId}:${unitId}`);
      let locs = { ...g.locations };
      if (loc) {
        const pick = pickIntelTarget(
          rng,
          locs,
          { lat: loc.lat, lng: loc.lng, excludeId: loc.id },
          'any',
          DEFAULT_INTEL_RADIUS_M,
          g.evacZoneId,
        );
        if (pick) {
          const applied = applyPreciseReveal(locs, pick.id);
          if (applied) {
            locs = applied.locs;
            set({
              locations: locs,
              mapAnnotations: pruneMapAnnotations(get().mapAnnotations, locs),
            });
            pushLog(
              `The board still names ${applied.target.name} (${POI_CONFIG[applied.target.category].label}) about ${Math.round(haversine(loc.lat, loc.lng, applied.target.lat, applied.target.lng))} m out. Marked on your map.`,
              'good',
              undefined,
              { lat: applied.target.lat, lng: applied.target.lng, label: applied.target.name },
              unitLogScope,
            );
          }
        } else {
          pushLog('The board is rain-pulled blank. Nothing left to mark.', 'info', undefined, undefined, unitLogScope);
        }
      }
      const hdb = markHdbUnitCleared(get().hdb!, level, unitId);
      set({ hdb, hdbBlocks: { ...get().hdbBlocks, [hdb.locationId]: hdb } });
      bumpStats({ hdbUnitsCleared: 1 });
      persist();
    },

    hdbLeave: () => {
      const s = get();
      if (!s.hdb || s.combat || s.pendingEvent || s.hdbWalk) return;
      if (s.pendingSearch) {
        pushLog('Finish or leave the unit search before you walk out.', 'info');
        return;
      }
      if (s.hdb.currentLevel !== 1) {
        pushLog('Climb down to the void deck (level 01) before you leave the block.', 'info');
        return;
      }
      const blockId = s.hdb.locationId;
      const blockLabel = s.locations[blockId]?.name ?? 'the block';
      const leaveScope = hdbBlockScope(blockId, blockLabel);
      const g = get();
      set({
        hdb: null,
        hdbWalk: null,
        hdbBlocks: g.hdb ? { ...g.hdbBlocks, [blockId]: g.hdb } : g.hdbBlocks,
      });
      pushLog('You step back out onto the void deck.', 'info', undefined, undefined, leaveScope);
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

    combatPrepareFire: () => {
      const s = get();
      const c = s.combat;
      if (!c || c.over || c.awaitingStance) return;
      if (c.firePrepared || c.reloadPrepared) return;
      const eq = fullEquipment(s.equipment);
      if (isGunClubMainHand(eq)) {
        pushLog('You are wielding the gun — bash with your melee track.', 'bad');
        return;
      }
      const gun = holsteredFirearm(eq);
      if (!gun) {
        pushLog('Holster a firearm to shoot.', 'bad');
        return;
      }
      if (conditionOf(gun) <= 0) {
        pushLog('The firearm is broken — you cannot fire.', 'bad');
        return;
      }
      if (loadedRoundsOf(gun) > 0) {
        set({ combat: { ...c, firePrepared: true, reloadPrepared: false, playerGauge: 0 } });
        return;
      }
      if (canCombatReload(eq, s.items)) {
        set({ combat: { ...c, reloadPrepared: true, firePrepared: false, playerGauge: 0 } });
        return;
      }
      const gunDef = itemDef(gun.defId);
      pushLog(
        usesMagazine(gunDef) ? 'No loaded magazine in your pack.' : 'No shells in your pack.',
        'bad',
      );
    },

    refillMagazine: (magUid, ammoUid) => {
      const s = get();
      if (s.combat && !s.combat.over) {
        pushLog('No time to reload magazines mid-fight.', 'bad');
        return;
      }
      const res = refillMagazineFromAmmo(s.items, magUid, ammoUid);
      pushLog(res.log, res.ok ? 'good' : 'bad');
      if (res.ok) {
        set({ items: res.items });
        persist();
      }
    },

    loadGunFromMagazine: (magUid) => {
      const s = get();
      if (s.combat && !s.combat.over) {
        pushLog('Load magazines before the fight.', 'bad');
        return;
      }
      const eq = fullEquipment(s.equipment);
      const res = loadGunFromMagazine(eq, s.items, magUid);
      pushLog(res.log, res.ok ? 'good' : 'bad');
      if (res.ok) {
        set({ equipment: res.equipment, items: res.items });
        persist();
      }
    },

    refillFirearm: (ammoUid) => {
      const s = get();
      if (s.combat && !s.combat.over) {
        pushLog('Refill the shotgun before the fight.', 'bad');
        return;
      }
      const eq = fullEquipment(s.equipment);
      const res = refillHolsteredFirearm(eq, s.items, ammoUid);
      pushLog(res.log, res.ok ? 'good' : 'bad');
      if (res.ok) {
        set({ equipment: res.equipment, items: res.items });
        persist();
      }
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
      if (!c || c.over || c.awaitingStance || c.paused || !s._combatRng || !s.character) {
        // Drop the memo so a finished fight stops pinning an items snapshot.
        if (!c) combatPrelude = null;
        return;
      }

      const deps = combatPreludeDeps(s, c);
      const cached = combatPrelude;
      let prelude = cached && deps.every((d, i) => cached.deps[i] === d) ? cached.value : null;
      if (!prelude) {
        prelude = computeCombatPrelude(s, c, s.character);
        combatPrelude = { deps, value: prelude };
      }
      const { stance, weather, load, eq, pStats, prepGun, prepGunDef, prepProfile, pSpeed } =
        prelude;

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

      if (playerActs) {
        if (c.reloadPrepared && prepGun) {
          const res = resolveCombatReload(eq, s.items);
          const log = [
            ...c.log,
            ...res.log.map((text) => ({ round, tone: 'info' as const, text })),
          ];
          set({
            equipment: res.equipment,
            items: res.items,
            combat: {
              ...c,
              round,
              log,
              reloadPrepared: false,
              firePrepared: false,
              playerGauge: playerGauge - GAUGE_FULL,
              enemyGauge: Math.min(enemyGauge, GAUGE_FULL),
              acting: 'player',
            },
          });
          return;
        }
        if (c.firePrepared && prepGun && prepProfile) {
          const res = resolvePlayerFireAction(
            s._combatRng,
            prepGun.defId,
            gunFireDamage(prepGun),
            prepProfile.accuracy,
            prepGunDef?.wearRate ?? 1,
            c.zombie,
            weather,
            round,
            c.terrain,
            c.context,
            s.meters.energy,
            sumTraitMod(s.character.traitIds, 'attackMod'),
            sumTraitMod(s.character.traitIds, 'nightAccuracyExtra'),
            sumTraitMod(s.character.traitIds, 'zombieAttackMod'),
          );
          const nextGun = {
            ...prepGun,
            loadedRounds: Math.max(0, loadedRoundsOf(prepGun) - 1),
          };
          const { equipment, notes } = applyWear(
            { ...eq, firearm: nextGun },
            res.weaponWear,
            0,
            null,
            0,
            'firearm',
          );
          const zombie = { ...c.zombie, hp: res.zombieHpAfter };
          const log = [
            ...c.log,
            ...res.log,
            ...notes.map((text) => ({ round, tone: 'bad' as const, text })),
          ];
          const impactId = (c.impact?.id ?? 0) + 1;
          const impact = res.zombieDead
            ? { id: impactId, side: 'enemy' as const, kind: 'kill' as const }
            : res.hit
              ? {
                  id: impactId,
                  side: 'enemy' as const,
                  kind: (res.critical ? 'crit' : 'hit') as 'crit' | 'hit',
                }
              : { id: impactId, side: 'enemy' as const, kind: 'miss' as const };
          const next = {
            ...c,
            zombie,
            round,
            log,
            firePrepared: false,
            reloadPrepared: false,
            acting: 'player' as const,
            playerGauge: playerGauge - GAUGE_FULL,
            enemyGauge: Math.min(enemyGauge, GAUGE_FULL),
            impact,
          };
          if (res.zombieDead) {
            set({
              equipment,
              combat: { ...next, over: true, outcome: 'win' },
              kills: s.kills + 1,
            });
            bumpStats(
              zombie.kind === 'human'
                ? { humanKills: 1 }
                : zombie.kind === 'animal'
                  ? { animalKills: 1 }
                  : { zombieKills: 1 },
            );
          } else {
            set({ equipment, combat: next });
          }
          if (res.applyGunshotDanger && res.gunshotIntensity > 0) {
            const g = get();
            get().emitNoise(
              g.currentPos.lat,
              g.currentPos.lng,
              gunshotNoiseRadius(res.gunshotIntensity),
              res.gunshotIntensity,
            );
          }
          if (res.timeCostHours > 0) advanceTime(res.timeCostHours);
          return;
        }
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
        const { equipment, notes } = applyWear(
          eq,
          res.weaponWear,
          0,
          null,
          res.offHandWear,
        );
        const zombie = { ...c.zombie, hp: res.zombieHpAfter };
        const log = [
          ...c.log,
          ...res.log,
          ...notes.map((text) => ({ round, tone: 'bad' as const, text })),
        ];
        const impactId = (c.impact?.id ?? 0) + 1;
        const impact = res.zombieDead
          ? { id: impactId, side: 'enemy' as const, kind: 'kill' as const }
          : res.hit
            ? {
                id: impactId,
                side: 'enemy' as const,
                kind: (res.critical ? 'crit' : 'hit') as 'crit' | 'hit',
              }
            : { id: impactId, side: 'enemy' as const, kind: 'miss' as const };
        const next = {
          ...c,
          zombie,
          round,
          log,
          acting: 'player' as const,
          playerGauge: playerGauge - GAUGE_FULL,
          enemyGauge: Math.min(enemyGauge, GAUGE_FULL),
          impact,
        };

        if (res.zombieDead) {
          set({
            equipment,
            combat: { ...next, over: true, outcome: 'win' },
            kills: s.kills + 1,
          });
          bumpStats(
            zombie.kind === 'human'
              ? { humanKills: 1 }
              : zombie.kind === 'animal'
                ? { animalKills: 1 }
                : { zombieKills: 1 },
          );
        } else {
          set({ equipment, combat: next });
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
        load.dodgeMod,
      );
      const connecting = res.playerDamage > 0 && !res.dodged && !!res.hitZone;
      let incoming = res.playerDamage;
      let firstHitTaken = c.firstHitTaken === true;
      if (connecting && !firstHitTaken) {
        const mult = traitFirstHitDamageMult(s.character!.traitIds);
        if (mult < 1) incoming = Math.max(1, Math.round(incoming * mult));
        firstHitTaken = true;
      }
      const bodyParts =
        incoming > 0 && !res.dodged && res.hitZone
          ? applyPartDamage(
              s.bodyParts,
              res.hitZone,
              incoming,
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
        energy: clampMeter(s.meters.energy - res.energyCost),
      };
      const { equipment, notes } = applyWear(s.equipment, 0, res.armorWear, res.wearSlot);
      const dead = checkDeath(meters, bodyParts) !== null;
      const log = [...c.log, ...res.log, ...notes.map((text) => ({ round, tone: 'bad' as const, text }))];
      const impactId = (c.impact?.id ?? 0) + 1;
      const impact = dead
        ? { id: impactId, side: 'player' as const, kind: 'death' as const }
        : res.dodged
          ? { id: impactId, side: 'player' as const, kind: 'dodge' as const }
          : res.blocked
            ? { id: impactId, side: 'player' as const, kind: 'block' as const }
            : incoming > 0
            ? {
                id: impactId,
                side: 'player' as const,
                kind: (res.critical ? 'crit' : 'hit') as 'crit' | 'hit',
              }
            : { id: impactId, side: 'player' as const, kind: 'miss' as const };
      const next = {
        ...c,
        round,
        log,
        acting: 'enemy' as const,
        enemyGauge: enemyGauge - GAUGE_FULL,
        playerGauge: Math.min(playerGauge, GAUGE_FULL),
        impact,
        firstHitTaken,
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
      const load = loadOf(s);
      const pStats = playerCombatStats(
        s.character!.attributes,
        s.character!.traitIds,
        s.equipment,
        armCombatPenalty(s.bodyParts) + headCombatPenalty(s.bodyParts),
        load.attackMod,
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
        load.fleeDcMod,
      );
      let fleeWearSlot: EquipSlot | null = null;
      let firstHitTaken = s.combat.firstHitTaken === true;
      let fleeIncoming = res.playerDamage;
      if (fleeIncoming > 0 && !firstHitTaken) {
        const mult = traitFirstHitDamageMult(s.character!.traitIds);
        if (mult < 1) fleeIncoming = Math.max(1, Math.round(fleeIncoming * mult));
        firstHitTaken = true;
      }
      const bodyParts =
        fleeIncoming > 0
          ? (() => {
              const zone = rollHitZone(s._combatRng!.fork(`flee-zone:${round}`));
              fleeWearSlot = slotForZone(zone) ?? 'body';
              const soak = limbArmorForZone(s.equipment, zone);
              const dmg = Math.max(1, fleeIncoming - soak);
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
      const impactId = (s.combat.impact?.id ?? 0) + 1;
      const impact =
        dead
          ? { id: impactId, side: 'player' as const, kind: 'death' as const }
          : res.playerDamage > 0
            ? { id: impactId, side: 'player' as const, kind: 'hit' as const }
            : null;
      if (res.success && !dead) {
        set({
          meters,
          bodyParts,
          equipment,
          combat: {
            ...s.combat,
            round,
            log,
            over: true,
            outcome: 'flee',
            impact,
            firstHitTaken,
            firePrepared: false,
            reloadPrepared: false,
          },
        });
        bumpStats({ fightsFled: 1 });
      } else if (dead) {
        set({
          meters,
          bodyParts,
          equipment,
          combat: {
            ...s.combat,
            round,
            log,
            over: true,
            outcome: 'dead',
            impact,
            firstHitTaken,
            firePrepared: false,
            reloadPrepared: false,
          },
        });
      } else {
        // Flee failed — fight continues. Drop the disengage profile so the
        // next swing isn't stuck on a flee-only stance.
        set({
          meters,
          bodyParts,
          equipment,
          combat: {
            ...s.combat,
            round,
            log,
            selectedStance: 'guarded',
            impact,
            firstHitTaken,
            firePrepared: false,
            reloadPrepared: false,
          },
        });
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
          const nodeScope = tunnelNodeScope(run.id, nodeId, node?.name ?? nodeId);
          const after = markDone(run, nodeId);
          set({ tunnel: after });
          if (outcome === 'win') {
            pushLog('It stops moving. The bore goes quiet again.', 'good', undefined, undefined, nodeScope);
            // The salvage this fight interrupted is still there afterwards.
            if (node && (node.kind === 'scavenge' || node.kind === 'carriage')) {
              grantTunnelSalvage(after, node, new Rng(g.seed).fork(tunnelKey(after, `loot:${nodeId}`)));
            } else if (lootMod > 0 && node) {
              grantTunnelSalvage(after, { ...node, lootMod }, new Rng(g.seed).fork(tunnelKey(after, `loot:${nodeId}`)));
            }
          } else {
            // There is no back. Breaking off means shoving past and walking on.
            pushLog('You shove past it in the dark and keep walking.', 'info', undefined, undefined, nodeScope);
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
          const unit = g.hdb.floors[level - 1]?.units.find((u) => u.id === unitId);
          clearHdbUnit(
            level,
            unitId,
            lootMod,
            rng,
            unit ? (UNIT_META[unit.type].searchHp ?? 0) : 0,
          );
        } else if (g.hdb) {
          const unit = g.hdb.floors[level - 1]?.units.find((u) => u.id === unitId);
          const unitLogScope = hdbUnitScope(
            g.hdb.locationId,
            level,
            unitId,
            unit?.label ?? unitId,
          );
          const hdb = markHdbUnitCleared(g.hdb, level, unitId);
          set({ hdb, hdbBlocks: { ...g.hdbBlocks, [hdb.locationId]: hdb } });
          pushLog('You back out of the doorway and leave that unit behind.', 'info', undefined, undefined, unitLogScope);
        }
      } else if (context.hdbStairs) {
        const gStairs = get();
        const stairsScope =
          gStairs.hdb != null
            ? hdbFloorScope(gStairs.hdb.locationId, context.hdbStairs.dest.level)
            : undefined;
        pushLog(
          outcome === 'win'
            ? 'The landing clears. You keep your hand on the rail.'
            : 'You shoulder past it and keep going.',
          outcome === 'win' ? 'good' : 'info',
          undefined,
          undefined,
          stairsScope,
        );
        // Finish the stair hop the fight interrupted. Without this, you stay on
        // the origin floor and the next click can re-roll the same descent/hunt.
        const g = get();
        if (g.hdb) {
          const dest = context.hdbStairs.dest;
          const wasNew = !g.hdb.revealedLevels.includes(dest.level);
          set({ hdb: moveTo(g.hdb, dest) });
          if (wasNew) sweepFloor(dest.level);
        }
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
      flushPersist();
      set({
        phase: 'menu',
        character: null,
        spawn: null,
        locations: {},
        currentPositionId: null,
        travelAnim: null,
        expandedCells: [],
        groundZeroId: null,
        hordeLevel: 0,
        evacZoneId: null,
        evacDeadline: null,
        evacCooldownUntil: null,
        evacDemand: null,
        evacDemandBias: null,
        evacManifestRevealed: false,
        escaped: false,
        destroyedTunnelEdges: [],
        combat: null,
        _combatRng: null,
        hdb: null,
        hdbBlocks: {},
        hdbWalk: null,
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
        escort: null,
        mapAnnotations: [],
        log: [],
        stats: emptyRunStats(),
        hasSavedRun: !!loadRun(),
        highScores: loadHighScores(),
      });
    },

    continueRun: () => {
      const run = loadRun();
      if (!run) return;
      // Zones must be ready for vegetation soft-cost (and walkability) before
      // the first trek — don't wait on the MRT fetch.
      void ensureZonesLoaded().catch(() => {
        /* trek/spawn degrade to country clip */
      });
      void ensureBakeLoaded()
        .then(() => {
          const s = get();
          if (s.phase !== 'game' || s.seed !== run.seed) return;
          const next = rehydrateLocationOutlines(s.locations);
          if (next !== s.locations) set({ locations: next });
        })
        .catch(() => {
          /* outlines stay missing for fallback worlds */
        });
      // Stations were bound to the network when the run was created; get it
      // back in memory so the tunnels still route — and so old saves can
      // re-roll destroyed edges from seed before play resumes.
      void loadMrtNetwork().then((net) => {
      syncBackpackBonuses(
        sumTraitMod(run.character.traitIds, 'gridWidthBonus'),
        coerceEquipment(run.equipment),
      );
      let destroyedTunnelEdges = run.destroyedTunnelEdges ?? [];
      if (!destroyedTunnelEdges.length && net && run.spawn) {
        const fromSt = nearestStationAny(net, run.spawn.lat, run.spawn.lng);
        const evac = run.evacZoneId ? run.locations[run.evacZoneId] : null;
        const toSt = evac ? nearestStationAny(net, evac.lat, evac.lng) : null;
        destroyedTunnelEdges = rollDestroyedTunnels(
          new Rng(run.seed).fork('mrt:destroyed'),
          net,
          toSt ? { fromStationId: fromSt.id, toStationId: toSt.id } : null,
        );
      }
      set({
        phase: 'game',
        character: run.character,
        seed: run.seed,
        spawn: run.spawn,
        locations: rehydrateLocationOutlines(run.locations),
        currentPositionId: run.currentPositionId,
        currentPos: run.currentPos,
        equipment: coerceEquipment(run.equipment),
        bodyParts: migrateBodyParts(run.bodyParts, run.maxHp),
        meters: migrateMeters(run.meters as Meters & { health?: number }),
        maxHp: run.maxHp,
        day: run.day,
        hour: run.hour,
        items: run.items,
        clothingTears: run.clothingTears ?? OWN_CLOTHES_TEARS,
        kills: run.kills,
        stats: normalizeRunStats(run.stats),
        usedFallback: run.usedFallback,
        exploredArea: mergeExploredCircles(run.exploredArea ?? []),
        expandedCells: run.expandedCells ?? [],
        groundZeroId: run.groundZeroId ?? null,
        hordeLevel: run.hordeLevel ?? 0,
        evacZoneId: run.evacZoneId ?? pickEvacZone(Object.values(run.locations)),
        evacDeadline:
          run.evacDeadline ?? totalGameHour(run.day, run.hour) + evacWindowHours(true, run.day),
        evacCooldownUntil: run.evacCooldownUntil ?? null,
        evacManifestRevealed: run.evacManifestRevealed ?? false,
        ...(() => {
          const validBias = (b: string | null | undefined): EvacDemandBias | null =>
            b === 'fuel' || b === 'meds' || b === 'ammo' || b === 'balanced' ? b : null;
          if (run.evacDemand != null && run.evacDemand > 0) {
            return {
              evacDemand: run.evacDemand,
              evacDemandBias: validBias(run.evacDemandBias) ?? 'balanced',
            };
          }
          const rolled = rollEvacDemand(
            new Rng(run.seed).fork(`evacdemand:resume:${run.day}`),
            run.day,
          );
          return { evacDemand: rolled.demand, evacDemandBias: rolled.bias };
        })(),
        escaped: false,
        destroyedTunnelEdges,
        travelAnim: null,
        worldLoading: false,
        worldError: null,
        combat: null,
        _combatRng: null,
        hdb: null,
        hdbBlocks: run.hdbBlocks ?? {},
        hdbWalk: null,
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
        factionStanding: migrateStanding(run.factionStanding),
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
        traderTaken: migrateTraderTaken(run.traderTaken),
        escort: run.escort?.toId ? { toId: run.escort.toId } : null,
        // The timeline is the run's memory — a resumed run keeps every day of it.
        log: run.log ?? [],
      });
      // Stamp services / outpost flags on any location that still lacks them.
      {
        const s = get();
        set({
          locations: applyFactionServices(s.locations, s.outposts, s.seed),
          mapAnnotations: pruneMapAnnotations(run.mapAnnotations ?? [], s.locations),
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
      });
    },
  };
});

/**
 * Trailing clause naming why a portion fell short. Only for the bands a player
 * would notice — a Day-Old packet is close enough to full that saying so every
 * meal would be noise.
 */
function freshnessNote(inst: ItemInstance): string {
  if (!hasCondition(inst)) return '';
  const family = conditionFamily(itemDef(inst.defId));
  const tier = tierOf(inst);
  if (tier === 'pristine' || tier === 'worn') return '';
  if (family === 'medicine') {
    return tier === 'torn' ? ' — well past its date, so less of it landed' : ' — past its date, so less of it landed';
  }
  return tier === 'torn'
    ? ' — it had turned, so it barely counted as a meal'
    : ' — on the turn, so it went less far';
}

function consumableRestoreSummary(fx: {
  hunger?: number;
  thirst?: number;
  energy?: number;
}): string {
  const parts: string[] = [];
  if (fx.hunger != null) parts.push('hunger');
  if (fx.thirst != null) parts.push('thirst');
  if (fx.energy != null) parts.push('energy');
  if (parts.length === 0) return 'Feeling sharper';
  if (parts.length === 1) {
    const only = parts[0]!;
    if (only === 'hunger') return 'Hunger restored';
    if (only === 'thirst') return 'Thirst quenched';
    return 'Feeling sharper';
  }
  const pretty = parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p));
  if (pretty.length === 2) return `${pretty[0]} and ${pretty[1]} restored`;
  return `${pretty[0]}, ${pretty[1]}, and ${pretty[2]} restored`;
}

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
