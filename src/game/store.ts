import { create } from 'zustand';
import type {
  AttributeKey,
  BodyPartId,
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
  TimeOfDay,
  WeatherKind,
  SkillDayXp,
  SkillsState,
} from './types';
import { freshEventClock } from './types';
import { cureInfection, ingestLoad, infectionEffect, settleStomach, stomachOf, upsetStomach } from './infection';
import { buildFacility, collectedRain, gameHour, surfaceSite } from './facilities';
import {
  completeExplorationLeads, discoverLocalFacility, findExplorationLeads, readNoticeboard, type RevealTourCue,
  localFacilityFor, normalizeExplorationLeads, recognitionRadius, recognizeNearby,
  type ExplorationLead,
} from './exploration';
import { sightFactor } from './nightSight';
import { emptyRunStats, normalizeRunStats } from './stats';
import { Rng, randomSeed } from './rng';
import { crossingLogText, type CrossingLog } from './crossingEvent';
import {
  adjustCraftInputs,
  attrEmoji,
  ATTRIBUTE_LABELS,
  equipAwarenessMod,
  equipLightPower,
  hasTraitFlag,
  maxHpFor,
  startingStanding,
  sumTraitMod,
  traitFirstHitDamageMult,
  traitAwarenessMod,
  traitPoiLootBonus,
} from './character';
import {
  applySkillBook,
  emptySkillDayXp,
  emptySkills,
  gainSkillXp,
  PRACTICE_XP,
  skillMods,
  skillsFromTraits,
  SKILL_LABELS,
  traitSkillXpMult,
  type SkillId,
  SKILLS_ENABLED,
} from './skills';
import { fetchOsmPois, haversine, type RawPoi } from './overpass';
import { bakedEvacPois, bakedPoisNear, ensurePoiOutlines } from './bakedPois';
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
  loadMrtNetwork,
} from './mrt';
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
import { buildLocations, makeStationLocation } from './world';
import { isVerifiedHdb } from './hdbSites';
import {
  conditionRoll,
  conditionRollForRuin,
  ensureDestruction,
  isStreetLootPoi,
  itemDef,
  rollFactionRaidLoot,
  rollLoot,
  rollStreetLoot,
  streetHaulCount,
  type LootStack,
} from './loot';
import {
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
  addToCarry,
  arrangeOrLoose,
  carrySlot,
  isCarried,
  LOOSE,
  BACKPACK,
  placeReplacing,
  LOAD_SPRAIN_CHANCE_PER_KM,
  isBroken,
  isTwoHandedEquipped,
  limbArmorForZone,
  loadEffects,
  loadEffectsFor,
  type LoadEffects,
  newUid,
  preparedEffect,
  prepOf,
  OWN_CLOTHES_TEARS,
  TEAR_CONDITION_COST,
  TEAR_HOURS,
  TEAR_RAGS_YIELD,
  repair as repairInstance,
  syncBackpackBonuses,
  refitBackpack,
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
  craftedPrep,
  recipeInputs,
  type CraftContext,
} from './crafting';
import {
  applyPartDamage,
  applyStrainInjury,
  BODY_PART_IDS,
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
  headAwarenessPenalty,
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
import { mergeExploredCircles, snapshot, VISITED_LIGHT_RADIUS, type ExploredCircle } from './fog';
import { quoteTravelEnergy, surfaceTravelProfile } from './travelEnergy';
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
import { emptyTally, tallyEnemyAction, tallyPlayerAction } from './combatTally';
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
  canFireHolstered,
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
  type CheckResult,
  type ShownRoll,
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
import { applyStartingFactionIntel } from './startingIntel';
import {
  MAX_ACTIVE_BOUNTIES,
  bountyBoard,
  bountyProgress,
  migrateBounties,
  type ActiveBounty,
} from './bounties';
import { resolveStartingKit, type KitLine } from './startingKit';
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
  STANDING_BAD,
  STANDING_HATED,
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
  repriceTrekRisk,
  rollHazardChecks,
  isWetWeather,
  hazardsAtPoint,
  type HazardKind,
  type CrossingOutcome,
  type TrekRisk,
} from './wilds';
import {
  applySleepOccupancy,
  evaluateSleepConditions,
  restAmbushPreview,
  type RestPreview,
  type SleepConditions,
} from './sleep';
import {
  formatRestHours,
  planRest,
  restLengthHours,
  type RestLength,
  type RestOutcome,
} from './restPlan';
import { vegetationCost } from './vegetation';
import { habitatAt, rollWildsEncounter, FLOODWATER_ANIMAL_CHANCE } from './wildsEncounter';
import { nextSearchStreak, searchAmbushChance } from './encounterOdds';
import type { AnimalHabitat } from './enemies';
import {
  addHeat,
  addDoorHeat,
  dropHeat,
  scoutUnit,
  needsScout,
  breachOutcome,
  currentFloor,
  generateDungeon,
  floorThreat,
  levelHunting,
  retreatCheck,
  travelPlan,
  canTravelTo,
  isStripModel,
  halveHeat,
  coolLevels,
  SPILL,
  THEME_META,
  storeysFromRoof,
  storeyLabel,
  moveTo,
  FIGHT_HEAT,
  HAZARD_HEAT,
  HUNT_ELITE_CHANCE,
  updateUnit,
  canCutAlarm,
  gangHostile,
  shaftOpen,
  themeSearchMult,
  THEME_RULES,
  cutAlarmCheck,
  ROOM_EVENTS,
  tripAlarm,
  UNIT_META,
  LOCKPICK_ID,
  PICK_MINUTES,
  SHELTER_HEAT_DROP,
  SHELTER_HOURS,
  scaleDoorCost,
  pickCheck,
  migrateHdbDungeon,
  type BreachOutcome,
  type HdbArchetype,
  type HdbDungeon,
  type RoomScoutRoll,
  type HdbEntry,
} from './hdbDungeon';
import {
  effectiveDanger,
  emitNoisePulse,
  prunePulses,
  type NoisePulse,
} from './noise';
import {
  activityPressure, BASE_ACTIVITY_PRESSURE, exploreActivity,
  freshActivity, normalizeActivity, pruneActivity, type ActivityEvent, type ActivityState,
} from './activity';
import {
  addDisturbance, disturbanceAt, disturbanceSpec, quietDisturbance,
  type Disturbance, type DisturbanceKind,
} from './disturbance';

let zoneCounter = 0;
import { buildStreetScene, STREET_ZONE } from './streetScenes';
import { t } from '../i18n/t';
import { itemName } from '../i18n/display';
import { ANTIBIOTIC_COVER_HOURS, applyAntibiotics, applyCare, isOpenWound, canCareWithItem, careForItem, chooseCareTarget, CARE_MINUTES, recoverySupportMultiplier, type CareAction } from './woundCare';
import { activeLocale } from './eventCopy';
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
  pickDistantEvacPoi,
  rollEvacCooldown,
  pickNextEvacZone,
  evacWindowHours,
  restoreEvacuation,
} from './goal';
import { travelAnimDurationMs } from '../ui/travelMotion';

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

  /** Retired v7 field, kept null for save compatibility. */
  groundZeroId: string | null;

  // Extraction goal; legacy horde field no longer advances or drives gameplay.
  hordeLevel: number;
  evacZoneId: string | null; // the location you must reach to escape
  evacDeadline: number | null; // absolute game-hour the current evac departs
  /**
   * Absolute game-hour the next window gets staged, while the channel is dark.
   * Non-null only between a missed evac and its replacement.
   */
  evacCooldownUntil: number | null;
  /** Contact acknowledged at this operation; cargo never gates admission. */
  evacContacted: boolean;
  escaped: boolean; // true on a victory ending

  maxHp: number; // base max HP; effective max is reduced by injuries
  meters: Meters;
  bodyParts: BodyParts;
  /** Ephemeral feedback; wound state itself is saved in bodyParts. */
  lastCare: { partId: BodyPartId; action: CareAction; sequence: number } | null;
  day: number;
  hour: number;

  items: ItemInstance[];
  equipment: Equipment;
  /** Tears left in the clothes on your back — see `tearOwnClothes`. */
  clothingTears: number;
  kills: number;
  /** Display-only run counters — see stats.ts. */
  stats: RunStats;
  /** In-run passive skills (die with the survivor). */
  skills: SkillsState;
  /** Practice XP banked today — soft daily cap. */
  skillDayXp: SkillDayXp;
  exploredArea: ExploredCircle[];

  combat: CombatState | null;
  _combatRng: Rng | null;

  /** The HDB block you're currently inside, if any. */
  hdb: HdbDungeon | null;
  /** Every block you've been inside, keyed by location — cleared stays cleared. */
  hdbBlocks: Record<string, HdbDungeon>;
  /**
   * Basemap roof heights (metres) of matched site buildings, fed by the 3D
   * engine. Runtime-only map data — never persisted, never reset by a run.
   */
  siteRoofs: Record<string, number>;
  /** Cutaway row the pointer is over, for the 3D storey band. Runtime-only. */
  hdbHoverLevel: number | null;
  /** Room picked on a level strip (UI only); the action card targets it. */
  hdbSelUnit: string | null;
  /** Playback of the room just read on first pick. Runtime-only; the intel lives in hdb. */
  hdbScout: { locationId: string; level: number; unitId: string; startedAt: number; roll: RoomScoutRoll } | null;

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
  activity: ActivityState;
  /** A predecessor's ghost waiting to be resolved at this spot. */
  ghostOffer: { kind: 'trader'; wantDefId: string; giveDefId: string } | null;

  pendingEvent: PendingEvent | null;
  /** The last attribute check, for the dice overlay to play back. UI only — never persisted. */
  shownRoll: ShownRoll | null;
  /**
   * Places a local map or noticeboard just named, for the guided camera tour
   * to show. UI only — never persisted.
   */
  revealTour: RevealTourCue | null;
  /** The tour for this cue finished or was skipped. */
  dismissRevealTour: (id: number) => void;
  /** The dice overlay finished or was skipped. */
  dismissRoll: () => void;
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
   * run, because "walk two kilometres to the Common Folk kitchen" is only a plan if
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
  /** Faction jobs in hand. */
  bounties: ActiveBounty[];
  /** Board line ids already taken (or finished) — a job is posted once. */
  bountiesTaken: string[];
  /**
   * One-shot Cordon escort: the next travel to `toId` is walked with a patrol.
   * Runtime + save — a reload mid-walk should not refund the tribute.
   */
  escort: { toId: string } | null;

  /** Rumoured sites from smudged map notes — fuzzy pins until the target is found. */
  mapAnnotations: MapAnnotation[];
  /** Local leads persist independently of the scrolling timeline. */
  explorationLeads: ExplorationLead[];
  trackLead: (id: string | null) => void;
  readLocalMap: () => void;
  /** Ephemeral identity-reveal cue; never part of a saved run. */
  nearbyRecognition: readonly string[];
  dismissNearbyRecognition: (cue: readonly string[]) => void;

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
  setSpawn: (spawn: { lat: number; lng: number; name: string }) => Promise<'ok' | 'remote' | 'unplayable' | 'unavailable'>;
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
  /** Circle in the bore: pay tribute or sneak past. */
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
  /** Common Folk canteen — eat/drink on site. Once per day. Known+. */
  factionFeed: () => void;
  /** Cordon escort to a discovered site within range. Known+. One-shot. */
  factionEscort: (destinationId: string) => void;
  /** 88 Kin: walk an occupied residential block (once per site). */
  searchKinDeck: () => void;
  /** Take a job off the board at the faction site you're standing at. */
  acceptBounty: (offerId: string) => void;
  /** Hand in a finished job at any site of that faction. */
  turnInBounty: (bountyId: string) => void;
  /** Drop a job you no longer want. */
  abandonBounty: (bountyId: string) => void;
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
  /** Sleep for a picked length (default: until 08:00). Applies `peekRestPlan(length)`. */
  rest: (length?: RestLength) => void;
  /** Exactly what `rest(length)` will do — the Rest dialog's preview. */
  peekRestPlan: (length: RestLength) => { preview: RestPreview; outcome: RestOutcome };
  /**
   * Unknown sites that arriving at `pos` would identify, by the same rule as
   * arrival recognition. Read-only: a map hover preview, never a state change.
   */
  peekRecognition: (pos: { lat: number; lng: number }) => string[];
  /** Preview sleep quality for the Rest button (same evaluator as rest()). */
  peekSleepConditions: () => SleepConditions;
  /** Recovery + night-priced ambush chance (same math rest() rolls). */
  peekRestPreview: () => RestPreview;
  /** Chance the next search at a site turns into a fight (same math the roll uses); null if unsearchable. */
  peekSearchRisk: (locationId: string) => number | null;
  /** The player's own encounter modifiers on a crossing (same sum the road / trek roll uses). */
  peekRouteEncounterMod: (band: TimeOfDay) => number;
  /** Eat / drink / bandage / load ammo / etc. Named applyItem so oxlint doesn't treat it as a Hook. */
  applyItem: (uid: string, partId?: BodyPartId) => void;
  moveItem: (uid: string, container: string, x: number, y: number, rotated: boolean) => boolean;
  /** Drop a loose item into the bag at (x, y); anything it lands on is bumped out to loose. */
  packReplacing: (uid: string, x: number, y: number, rotated: boolean) => boolean;
  rotateItem: (uid: string) => void;
  transferItem: (uid: string, toContainer: string) => void;
  equipItem: (uid: string, slot: keyof Equipment) => void;
  unequipItem: (slot: keyof Equipment) => void;
  /** Put an item down for good. The only way to shed weight without a stash. */
  dropItem: (uid: string) => void;
  /** Run a recipe from `crafting.ts`, consuming its inputs. */
  craftItem: (recipeId: string, mode?: 'hot' | 'room', waterSource?: 'carried' | 'site') => { loose: number } | undefined;
  collectSiteWater: (source: 'rain' | 'boiled') => void;
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
  tearOwnClothes: () => { loose: number } | undefined;

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
  setSiteRoofs: (roofs: ReadonlyMap<string, number>) => void;
  setHdbHoverLevel: (level: number | null) => void;
  setHdbSelUnit: (id: string | null) => void;
  hdbEnter: () => void;
  hdbBreach: (unitId: string) => void;
  hdbPick: (unitId: string) => void;
  /** Take the stairs to another landing (descent checks + Swarm ambushes on the way). */
  hdbTravel: (level: number) => void;
  hdbUseService: (unitId: string) => void;
  hdbUseShelter: (unitId: string) => void;
  hdbReadNotice: (unitId: string) => void;
  /** Try to cut a spotted alarm before opening its door. */
  hdbCutAlarm: (unitId: string) => void;
  /** Gang landing: hand over the toll so the doors are yours to work. */
  hdbPayToll: () => void;
  /** Lift-shaft landing: climb the cable straight down to the void deck, once. */
  hdbShaftDrop: () => void;
  hdbLeave: () => void;

  // --- noise & legacy ---
  /** Leave a one-shot disturbance zone (defaults to where you stand). */
  disturb: (kind: DisturbanceKind, at?: { lat: number; lng: number }) => void;
  acceptGhostTrade: () => void;
  declineGhostTrade: () => void;

  resetToMenu: () => void;
  continueRun: () => void;
  /** Throw the run away for good and go back to the menu. */
  abandonRun: () => void;
  /** Re-read the continue slot and the device board after they change on disk. */
  refreshSaveSlot: () => void;
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
    activityEvent?: GameLogEntry['activityEvent'],
    crossing?: CrossingLog,
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
      activityEvent,
      crossing,
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

  const pushCrossingLog = (message: CrossingLog, tone: GameLogEntry['tone'] = 'info') => {
    pushLog(crossingLogText(message, (key, vars) => t(key, vars, activeLocale())), tone,
      undefined, undefined, undefined, undefined, message);
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
    const base = c ? sumTraitMod(c.traitIds, 'lootValueMod') : 0;
    return base + skillMods(get().skills).lootValueMod;
  };

  const skillPackage = () => skillMods(get().skills);

  /** Practice XP from a meaningful action (books use applySkillBook instead). */
  const applyPracticeXp = (skill: SkillId, amount: number, fractional = false) => {
    const st = get();
    if (!SKILLS_ENABLED || !st.character || amount <= 0) return;
    const r = gainSkillXp(st.skills, st.skillDayXp, st.day, skill, amount, {
      xpMult: traitSkillXpMult(st.character.traitIds, skill),
      fractional,
    });
    if (r.applied <= 0) return;
    set({ skills: r.skills, skillDayXp: r.dayXp });
    if (r.leveled) {
      pushLog(
        SKILL_LABELS[skill] + ' rose to ' + r.skills[skill].level + '.',
        'good',
      );
    }
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

  /** Sight + light for a trek roll — must match what GameScreen previews. */
  const darkOpts = (
    s: { equipment: Equipment; character: Character | null },
    band: TimeOfDay,
    weather: WeatherKind,
  ) => {
    const lightPower = equipLightPower(s.equipment);
    return {
      lightPower,
      sight: sightFactor(
        band,
        weather,
        lightPower,
        sumTraitMod(s.character?.traitIds ?? [], 'nightSightMod'),
      ),
    };
  };

  /** Combined mobility factor: injuries × footwear × traits. */
  const moveFactor = (s: {
    bodyParts: BodyParts;
    equipment: Equipment;
    character: Character | null;
  }) =>
    legTravelFactor(s.bodyParts) *
    equipTravelSpeedFactor(s.equipment) *
    (1 + sumTraitMod(s.character?.traitIds ?? [], 'travelSpeedMod') + skillPackage().travelSpeedMod);

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
          sumTraitMod(s.character.traitIds, 'carryCapacityMod') + skillPackage().carryCapacityMod,
          s.bodyParts ? torsoCarryMult(s.bodyParts) : 1,
        )
      : loadEffects(0);

  /**
   * Roll an attribute check and hand it to the dice overlay. The result is
   * returned and applied straight away like any other roll — the overlay only
   * plays back what already happened, so logic stays headless and replayable.
   */
  let rollSeq = 0;
  let revealTourSeq = 0;
  const shownCheck = (
    rng: Rng,
    attr: AttributeKey,
    dc: number,
    label: string,
  ): CheckResult => {
    const s = get();
    const attrValue = s.character!.attributes[attr];
    const bonus = sumTraitMod(s.character!.traitIds, 'checkBonusMod');
    const res = rollCheck(rng, attrValue, dc, bonus);
    rollSeq += 1;
    const logMark = s.log[0]?.id ?? 0;
    set({ shownRoll: { ...res, id: rollSeq, attr, attrValue, bonus, label, logMark } });
    return res;
  };

  /** Player-side encounter modifiers on a crossing; the trek card previews the same sum. */
  const routeEncounterMod = (s: State, band: TimeOfDay): number => {
    if (!s.character) return 0;
    const traits = s.character.traitIds;
    return (
      sumTraitMod(traits, 'encounterChanceMod') +
      skillMods(s.skills).encounterChanceMod +
      (band === 'night' || band === 'dusk' ? sumTraitMod(traits, 'nightEncounterChanceMod') : 0) +
      equipEncounterChanceMod(s.equipment) +
      bleedEncounterMod(s.bodyParts) +
      loadOf(s).encounterMod
    );
  };

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
      armCombatPenalty(s.bodyParts) + headCombatPenalty(s.bodyParts) + infectionEffect(s.meters.infection).attack,
      load.attackMod,
      s.skills,
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

  /** Pinned (over the hard cap): refuse the move and say why. */
  const pinnedByLoad = (load: LoadEffects): boolean => {
    if (load.canTravel) return false;
    pushLog(
      'You can barely stand under all this, let alone walk. Drop or stash something first.',
      'bad',
    );
    return true;
  };

  /**
   * The walk itself under a Heavy or worse load: footsteps that carry (noise
   * at the far end) and, when Straining, wear on legs and back per km.
   */
  const applyLoadOnWalk = (
    load: LoadEffects,
    distM: number,
    dest: { lat: number; lng: number },
    rng: Rng,
  ) => {
    void dest;
    if (load.injuryPerKm <= 0) return;
    const km = distM / 1000;
    let sprain = false;
    for (let k = 0; k < Math.ceil(km); k++) {
      const share = Math.min(1, km - k);
      if (rng.chance(LOAD_SPRAIN_CHANCE_PER_KM * share)) sprain = true;
    }
    const cur = get();
    set({ bodyParts: applyStrainInjury(cur.bodyParts, load.injuryPerKm * km, rng, sprain) });
    pushLog(
      sprain
        ? 'Something in your leg gives under the weight. Every step after that is worse.'
        : 'The load grinds at your knees and back the whole way.',
      'bad',
    );
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
        skills: s.skills,
        skillDayXp: s.skillDayXp,
        log: s.log,
        usedFallback: s.usedFallback,
        exploredArea: s.exploredArea,
        expandedCells: s.expandedCells,
        groundZeroId: s.groundZeroId,
        hordeLevel: s.hordeLevel,
        activity: s.activity,
        evacZoneId: s.evacZoneId,
        evacDeadline: s.evacDeadline,
        evacCooldownUntil: s.evacCooldownUntil,

        evacContacted: s.evacContacted,
        hdbBlocks: s.hdb ? { ...s.hdbBlocks, [s.hdb.locationId]: s.hdb } : s.hdbBlocks,
        tunnel: s.tunnel,
        tunnelSeq: s.tunnelSeq,
        eventClock: s._eventClock,
        factionStanding: s.factionStanding,
        outposts: s.outposts,
        traderTaken: s.traderTaken,
        bounties: s.bounties,
        bountiesTaken: s.bountiesTaken,
        escort: s.escort,
        mapAnnotations: s.mapAnnotations,
        explorationLeads: s.explorationLeads,
      };
      const result = writeSavedRun(run);
      if (result === 'quota') {
        pushLog('Save failed — storage is full. Drop weight or the next reload may forget this run.', 'bad');
      }
    });
  };

  const pressureFn = () => {
    const s = get();
    const now = totalGameHour(s.day, s.hour);
    return (lat: number, lng: number) => activityPressure(s.activity, lat, lng, now);
  };

  // Each zone on the walk gets one check. A pass slips past it with no
  // consequence; the zones that catch the survivor stay in the risk and are
  // crossed directly. Seeded per target and hour, so a retry gives the same answer.
  const checkHazardZones = (target: { lat: number; lng: number }, risk: TrekRisk, rng: Rng, wet: boolean) => {
    if (!risk.hazards.length) return;
    const s = get();
    const checks = rollHazardChecks(
      rng.fork('hazard-check'),
      risk.hazards,
      s.currentPos,
      target,
      s.character!.attributes,
      sumTraitMod(s.character!.traitIds, 'checkBonusMod'),
    );
    const caught = new Set(checks.filter((c) => !c.success).map((c) => c.zone.id));
    const kinds = (pick: (c: (typeof checks)[number]) => boolean) =>
      [...new Set(checks.filter(pick).map((c) => c.zone.kind))];
    const slippedOut = kinds((c) => c.success && c.mode === 'exit');
    const slippedPast = kinds((c) => c.success && c.mode === 'cross');
    const caughtBy = kinds((c) => !c.success);
    if (slippedOut.length) pushCrossingLog({ kind: 'slippedOut', hazards: slippedOut }, 'good');
    if (slippedPast.length) pushCrossingLog({ kind: 'slipped', hazards: slippedPast }, 'good');
    if (caughtBy.length) pushCrossingLog({ kind: 'caught', hazards: caughtBy }, 'bad');
    Object.assign(risk, repriceTrekRisk(risk, risk.hazards.filter((z) => caught.has(z.id)), wet));
  };

  /** Danger points the strongest disturbance adds over a site right now. */
  const disturbanceOver = (loc: LocationState): number => {
    const s = get();
    const now = totalGameHour(s.day, s.hour);
    // A car alarm pulling everything toward it buys one quiet search here.
    const cover = s.activity.cover;
    if (cover && cover.locationId === loc.id && cover.until > now) return 0;
    return disturbanceAt(s.activity.zones ?? [], loc.lat, loc.lng, now)?.danger ?? 0;
  };
  /**
   * Leave a one-shot disturbance zone. Night keeps it longer, rain shrinks it
   * (disturbance.ts). The map gets its burst ring either way; the timeline
   * hears about it only when a new zone appears, not when a fight refreshes one.
   */
  const placeDisturbance = (
    kind: DisturbanceKind,
    at?: { lat: number; lng: number },
    opts: { silent?: boolean } = {},
  ): Disturbance => {
    const s = get();
    const now = totalGameHour(s.day, s.hour);
    const weather = weatherKindFor(s.seed, s.day);
    const spec = disturbanceSpec(kind, {
      night: timeOfDay(s.hour) === 'night',
      wet: weather === 'rain' || weather === 'thunderstorm',
    });
    const pos = at ?? s.currentPos;
    zoneCounter += 1;
    const placed = addDisturbance(s.activity.zones ?? [], {
      id: `zone-${Math.round(now * 60)}-${zoneCounter}`, kind,
      lat: pos.lat, lng: pos.lng, radiusM: spec.radiusM, danger: spec.danger,
      createdAt: now, expiresAt: now + spec.hours,
    }, now);
    set({
      activity: { ...s.activity, zones: placed.zones },
      noisePulses: [...prunePulses(s.noisePulses),
        emitNoisePulse(pos.lat, pos.lng, spec.radiusM, spec.danger)].slice(-24),
    });
    if (placed.created && !opts.silent) {
      pushLog(t(`ui.disturbance.made.${kind}`, {
        m: spec.radiusM, h: Math.round(spec.hours * 10) / 10,
      }, activeLocale()), 'bad');
    }
    persist();
    return placed.zone;
  };

  // Noise reaches a site only through its disturbance bonus, and only once.
  const siteDanger = (loc: LocationState) => effectiveDanger(loc, disturbanceOver(loc));

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
      hasSavedRun: false,
    });
  };

  /**
   * The window closed without you. Command doesn't turn another bird around on
   * the spot — the objective goes dark for a randomised stretch. Staying fed
   * and finding safe shelter through that dead air is the cost of missing one.
   */
  const beginEvacCooldown = () => {
    const s = get();
    const wait = rollEvacCooldown(
      new Rng(s.seed).fork(`evaccool:${totalGameHour(s.day, s.hour)}`),
    );
    set({
      evacZoneId: null,
      evacDeadline: null,

      evacContacted: false,
      evacCooldownUntil: totalGameHour(s.day, s.hour) + wait,
    });
    pushLog(
      t('ui.evac.missed', { hours: wait }, activeLocale()),
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
    const destination = nextId ? s.locations[nextId] : null;
    const route = destination ? routeLandPath(s.currentPos, destination, { deterministic: true }) : null;
    const windowH = evacWindowHours(false, s.day, route?.lengthM);
    const deadline = totalGameHour(s.day, s.hour) + windowH;
    set({
      evacZoneId: nextId,
      evacDeadline: nextId ? deadline : null,
      evacCooldownUntil: nextId ? null : totalGameHour(s.day, s.hour) + 12,

      evacContacted: false,
    });
    const loc = nextId ? s.locations[nextId] : null;
    pushLog(
      loc
        ? t('ui.evac.nextAnnounced', { zone: loc.name, hours: windowH }, activeLocale())
        : t('ui.evac.unavailable', undefined, activeLocale()),
      loc ? 'good' : 'bad',
      undefined,
      loc ? { lat: loc.lat, lng: loc.lng, label: loc.name } : undefined,
    );
  };

  const applyCrossingOutcome = (outcome: CrossingOutcome, rng: Rng, summarized = false) => {
    const cur = get();
    let meters = {
      ...cur.meters,
      energy: clampMeter(cur.meters.energy - outcome.energyCost),
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
    if (!summarized) for (const line of outcome.logs) pushLog(line.text, line.tone);
    if (outcome.extraHours > 0) {
      // Detours/flood delays advance survival and the world, but walking was paid upfront.
      return advanceTime(outcome.extraHours, undefined, false, true, 0);
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
    const res = addToCarry(get().items, defId, 1);
    const flavorKey = mode === 'road' ? 'roadFind' : 'trekFind';
    set({ items: res.items });
    return {
      text: `${flavor(flavorKey, { name: destName ?? 'open ground' })} (${itemDef(defId).name})`,
      tone: 'good',
    };
  };

  /** Trait + skill inputs to `tickInjuries`, shared by the clock and the rest planner. */
  const injuryTickArgs = () => {
    const traitIds = get().character?.traitIds ?? [];
    return {
      selfStopDisabled: hasTraitFlag(traitIds, 'bleedingSelfStopDisabled'),
      legHealMod: sumTraitMod(traitIds, 'legHealMod') + skillPackage().legHealMod,
      bleedStopBonus: sumTraitMod(traitIds, 'bleedStopBonus') + skillPackage().bleedStopBonus,
      careRecoveryMult: 1 + (sumTraitMod(traitIds, 'healBonus') + skillPackage().healBonus) / 100,
    };
  };

  /** Weather + trait inputs to `tickMeters` (everything except `sleeping`). */
  const meterTickOpts = (extraEnergyMult: number, parts: BodyParts) => {
    const s = get();
    const traitIds = s.character?.traitIds ?? [];
    const skyNow = weatherKindFor(s.seed, s.day);
    return {
      thirstMult: weatherThirstMult(skyNow),
      energyMult: weatherEnergyMult(skyNow) * extraEnergyMult * torsoEnergyDrainMult(parts),
      hungerDrainMod: sumTraitMod(traitIds, 'hungerDrainMod'),
      thirstDrainMod: sumTraitMod(traitIds, 'thirstDrainMod'),
      energyDrainMod: sumTraitMod(traitIds, 'energyDrainMod') + skillPackage().energyDrainMod,
      outdoorEnergyDrainMod: sumTraitMod(traitIds, 'outdoorEnergyDrainMod'),
      outdoors: s.hdb === null,
      heat: skyNow === 'heat',
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
    /** A rest already walked hour by hour in `planRest` — apply it as-is. */
    planned?: { meters: Meters; bodyParts: BodyParts },
  ): boolean => {
    const s = get();
    const prevBand = timeOfDay(s.hour);
    const total = s.hour + hours;
    const day = s.day + Math.floor(total / HOURS_PER_DAY);
    const hour = ((total % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;

    // Injuries slowly recover. Minor bleeds clot on their own and let the body
    // keep knitting; only a major stops recovery dead.
    const injury = injuryTickArgs();
    let partsAfterSystemic: BodyParts;
    let meters: Meters;
    if (planned) {
      partsAfterSystemic = planned.bodyParts;
      meters = planned.meters;
    } else {
      const { parts: bodyParts } = tickInjuries(
        s.bodyParts,
        hours,
        injury.selfStopDisabled,
        s.meters.hunger,
        injury.legHealMod,
        injury.bleedStopBonus,
        // Unplanned sleeping paths are protected service beds/camps. Ordinary
        // rest passes its condition-specific recovery through the planned result.
        recoverySupportMultiplier(s.meters.thirst, sleeping ? 1 : 0, s.meters.infection) * injury.careRecoveryMult,
      );
      partsAfterSystemic = tickSystemicDamage(bodyParts, s.meters, hours);
      meters = tickMeters(s.meters, hours, {
        sleeping,
        ...meterTickOpts(sleeping ? 1 : extraEnergyMult, partsAfterSystemic),
      });
    }
    if (restedEnergy != null) meters = { ...meters, energy: restedEnergy };

    // danger creeps back toward baseDanger, faster for larger locations
    const locations = tickLocationClock(s.locations, hours, HOURS_PER_DAY);

    // Perishables rot on the clock, not on use — which is what makes a bag
    // full of hoarded hawker food a liability rather than a stockpile. A stash
    // is no cooler than a backpack; nowhere in this city has power.
    const items = spoil(s.items, hours);

    // Landings you're not standing on settle with the clock.
    const hdb = s.hdb ? coolLevels(s.hdb, hours * 60, s.hdb.currentLevel) : s.hdb;
    set({
      hour,
      day,
      meters,
      bodyParts: partsAfterSystemic,
      locations,
      activity: pruneActivity(s.activity, totalGameHour(day, hour)),
      items,
      ...(hdb !== s.hdb ? { hdb } : {}),
    });

    // A wound that turns, or finally closes, is news — say which one.
    for (const id of BODY_PART_IDS) {
      const was = s.bodyParts[id];
      const now = partsAfterSystemic[id];
      const part = t(`ui.body.parts.${id}`, undefined, activeLocale());
      if (!was.woundInfected && now.woundInfected) {
        pushLog(t('ui.care.woundInfected', { part }, activeLocale()), 'bad');
      } else if (isOpenWound(was) && !isOpenWound(now)) {
        pushLog(t('ui.care.woundClosed', { part }, activeLocale()), 'good');
      }
    }

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
        BASE_ACTIVITY_PRESSURE,
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

  /** Today's recognition radius in metres, or 0 when recognition can't happen. */
  const recognitionRadiusNow = (s: State): number => {
    if (s.phase !== 'game' || !s.character || s.hdb || s.tunnel) return 0;
    const weather = weatherKindFor(s.seed, s.day);
    const sight = darkOpts(s, timeOfDay(s.hour), weather).sight;
    const awarenessValue = s.character.attributes.perception + equipAwarenessMod(s.equipment)
      + traitAwarenessMod(s.character.traitIds) - headAwarenessPenalty(s.bodyParts);
    return recognitionRadius(awarenessValue, sight, weather);
  };

  /** Recognition is an arrival action, never a passive tick or a map-camera effect. */
  const recognizeSurroundings = () => {
    const s = get();
    const radius = recognitionRadiusNow(s);
    if (!(radius > 0)) return;
    const locations = recognizeNearby(s.locations, s.currentPos, radius);
    if (locations !== s.locations) {
      const ids = Object.keys(locations).filter(id => locations[id].identified && !s.locations[id]?.identified);
      set({ locations, nearbyRecognition: [...new Set([...s.nearbyRecognition, ...ids])] });
    }
  };

  /** Add local identity-only leads. Never snapshot danger, stock or ownership. */
  const recordExplorationLeads = (leads: ExplorationLead[]) => {
    if (!leads.length) return;
    const s = get();
    const locations = { ...s.locations };
    for (const lead of leads) {
      const target = locations[lead.targetId];
      if (target && !target.identified && !target.discovered) {
        locations[target.id] = { ...target, identified: true };
      }
    }
    set({ locations, explorationLeads: normalizeExplorationLeads([...s.explorationLeads, ...leads], locations) });
    for (const lead of leads) {
      const target = locations[lead.targetId];
      if (target) pushLog(t('ui.exploration.clueFound', { name: target.name }, activeLocale()), 'good', undefined, {
        lat: target.lat, lng: target.lng, leadId: lead.id,
      });
    }
  };

  const checkSearchClue = (locationId: string) => {
    const s = get();
    const loc = s.locations[locationId];
    if (!loc || loc.searchClueChecked || s.phase !== 'game') return;
    // Mark even an empty result, so another search / reload cannot reroll it.
    set({ locations: { ...s.locations, [loc.id]: { ...loc, searchClueChecked: true } } });
    recordExplorationLeads(findExplorationLeads(s.seed, s.locations, loc.id, 'search', s.day, s.explorationLeads, s.evacZoneId ?? undefined));
  };

  // Visiting a site discovers it, snapshots memory, and lights a spot on the fog.
  // Map intel can also reveal a site without visiting it.
  const discoverLocation = (locationId: string) => {
    const s = get();
    const loc = s.locations[locationId];
    if (!loc) return;
    const wasNew = !loc.discovered;
    let updated: LocationState = { ...loc, discovered: true };
    const physicalVisit = s.currentPositionId === locationId && !s.hdb && !s.tunnel;
    if (physicalVisit) {
      updated = discoverLocalFacility(s.seed, { ...updated, visited: true, identified: true });
      const leads = completeExplorationLeads(s.explorationLeads, locationId, s.day);
      if (leads !== s.explorationLeads) {
        set({ explorationLeads: leads });
        pushLog(t('ui.exploration.leadCompleted', { name: loc.name }, activeLocale()), 'good');
      }
      if (!loc.localFacilityChecked && updated.facilities !== loc.facilities) {
        const kind = localFacilityFor(s.seed, loc);
        if (kind) pushLog(t('ui.exploration.facilityFound', {
          name: loc.name, facility: t(`ui.exploration.facilities.${kind}`, undefined, activeLocale()),
        }, activeLocale()), 'good');
      }
    }
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
    get().items.some((i) => isCarried(i.container) && i.defId === defId);

  /** Sleeping bag (or other sleepGear) in the pack or the stash at the current site. */
  const hasSleepingBagNearby = (): boolean => {
    const s = get();
    const pos = s.currentPositionId;
    return s.items.some((i) => {
      if (!itemDef(i.defId).sleepGear) return false;
      return isCarried(i.container) || (pos != null && i.container === pos);
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
      rainShelter: !s.hdb && !s.tunnel && !!loc?.facilities?.rainShelter,
      serviceBed: extras.serviceBed,
      inTunnelCamp: extras.inTunnelCamp,
    };
  };

  /** Hazard pockets that shape a night here. */
  const restPocketsFromState = () => {
    const s = get();
    return hazardsAtPoint(
      s.seed,
      s.currentPos.lat,
      s.currentPos.lng,
      s.spawn ?? undefined,
      BASE_ACTIVITY_PRESSURE,
      { band: 'night', day: s.day, pressureAt: pressureFn() },
    );
  };

  /** Night trek risk at your feet — the one source for the Rest preview and the roll. */
  const restRiskFromState = () => {
    const s = get();
    const traitIds = s.character?.traitIds ?? [];
    return trekRisk(s.seed, s.currentPos, s.currentPos, {
      band: 'night',
      hordeIntensity: BASE_ACTIVITY_PRESSURE,
      pressureAt: pressureFn(),
      weatherEncounterMod: 0,
      traitEncounterMod:
        sumTraitMod(traitIds, 'encounterChanceMod') +
        skillPackage().encounterChanceMod +
        sumTraitMod(traitIds, 'nightEncounterChanceMod') +
        (sumTraitMod(traitIds, 'ambushChanceMod') + skillPackage().ambushChanceMod) * 0.15 +
        equipEncounterChanceMod(s.equipment) +
        bleedEncounterMod(s.bodyParts),
      safe: s.spawn ?? undefined,
      day: s.day,
    });
  };

  /**
   * Everything a rest of `length` will do, computed without touching state.
   * `rest()` applies exactly this; the Rest dialog shows exactly this.
   */
  const planRestFromState = (length: RestLength) => {
    const s = get();
    const pockets = restPocketsFromState();
    const conditions = applySleepOccupancy(
      evaluateSleepConditions(sleepContextFromState()),
      pockets,
    );
    const risk = s.character ? restRiskFromState() : null;
    const preview = restAmbushPreview(conditions, risk?.encounterChance ?? 0);
    const outcome = planRest({
      day: s.day,
      hour: s.hour,
      meters: s.meters,
      bodyParts: s.bodyParts,
      requestedHours: restLengthHours(length, s.hour),
      recoveryMult: conditions.recoveryMult,
      sleepRestoreMod: sumTraitMod(s.character?.traitIds ?? [], 'sleepRestoreMod'),
      meterOpts: meterTickOpts(1, s.bodyParts),
      injury: injuryTickArgs(),
      nightAmbushChance: preview.ambushChance,
      floodSleep: conditions.floodSleep,
      collapseSleep: conditions.collapseSleep,
    });
    return { preview, outcome, pockets, conditions, risk };
  };

  const peekRestFromState = (): RestPreview => planRestFromState('morning').preview;

  const consumeBackpackItem = (defId: string) => {
    set({ items: consumeOneOf(get().items, defId) });
  };

  /**
   * Pure: take one of `defId` out of the backpack, decrementing a stack rather
   * than removing the tile where it can. Crafting burns several of these in a
   * row, so it needs a version that doesn't round-trip through the store.
   */
  const consumeOneOf = (items: ItemInstance[], defId: string): ItemInstance[] => {
    // Loose first: using it up is the cheapest way to shed awkward weight.
    const inst =
      items.find((i) => i.container === LOOSE && i.defId === defId) ??
      items.find((i) => i.container === 'backpack' && i.defId === defId);
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
        skillPackage().lootMod +
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
      checkSearchClue(locationId);
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
        sumTraitMod(s.character!.traitIds, 'searchSpeedMod') + skillPackage().searchSpeedMod,
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

  /** Move a found session instance into the pack, then carried loose. */
  const relocateFoundItem = (
    items: ItemInstance[],
    uid: string,
  ): { items: ItemInstance[]; loose: boolean; defId: string; count: number } | null => {
    const inst = items.find((i) => i.uid === uid);
    if (!inst) return null;
    const without = items.filter((i) => i.uid !== uid);
    const carried = addToCarry(
      without,
      inst.defId,
      inst.stack,
      inst.condition,
      prepOf(inst),
    );
    return { items: carried.items, loose: carried.loose > 0, defId: inst.defId, count: inst.stack };
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
    const haul = { loot: haulLoot, leftover };
    if (leftover.length) {
      const key = mode === 'abort' ? 'searchStopped' : 'searchDone';
      pushLog(t(`ui.log.${key}`, { name: locName }, activeLocale()), mode === 'complete' && haulLoot.length ? 'good' : 'info', haul);
    } else {
      let key: Parameters<typeof flavor>[0];
      if (mode === 'abort') key = haulLoot.length ? 'searchAbort' : 'searchAbortEmpty';
      else if (working.hdbUnit) key = haulLoot.length ? 'searchClear' : 'searchBare';
      else if (working.fled) key = 'searchFledDone';
      else if (working.raiding) key = 'searchRaidDone';
      else key = haulLoot.length ? 'searchFound' : 'searchEmpty';
      const good = mode === 'complete' && (haulLoot.length > 0 || (!working.hdbUnit && (working.fled || working.raiding)));
      pushLog(flavor(key, { name: locName }), good ? 'good' : 'info', haul);
    }

    applyPracticeXp('scavenging', PRACTICE_XP.searchComplete);
    set({ pendingSearch: null });
    if (mode === 'complete' && working.spendCharges && !working.hdbUnit) checkSearchClue(working.locationId);
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
    hdbStairs?: { dest: number };
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
    const danger = Math.round(opts.danger ?? siteDanger(loc));
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
    // Cross-tension: going against the Cordon is a gift to the 88, and vice versa.
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
      // Members-only doors don't sell entry. Standing, or work for it.
      if (loc.gatePolicy === 'members' && s.factionStanding[loc.factionId] > STANDING_BAD) {
        pushLog(
          `${FACTION_CONFIG[loc.factionId].shortName} don't open this door to strangers. Ask about work at the gate.`,
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
      pressure: pressureFn()(loc.lat, loc.lng),
      lastKind: clock.lastKind,
      disturbance: disturbanceOver(loc),
    });

    if (event) {
      // A beat of foreshadowing before the prompt — you notice, then you decide.
      pushLog(event.tell, 'info', undefined, undefined, siteScopeAt);
      set({
        pendingEvent: { locationId, event },
        _eventRng: eventRng,
        _eventClock: { ...clock, lastAt: now, count: clock.count + 1, lastKind: event.kind },
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
    const encChance = searchChanceAt(loc);
    const ambushed = encRng.chance(encChance);
    if (s.activity.cover?.locationId === locationId) {
      const { cover: _spent, ...rest } = get().activity;
      void _spent;
      set({ activity: rest });
    }
    {
      // The site remembers its last fight (see encounterOdds.ts).
      const locs = get().locations;
      const cur = locs[locationId];
      if (cur) {
        const searchesSinceAmbush = nextSearchStreak(cur.searchesSinceAmbush, ambushed);
        set({ locations: { ...locs, [locationId]: { ...cur, searchesSinceAmbush } } });
      }
    }

    if (ambushed) {
      startZombieCombat(locationId, true);
      pushLog(flavor('ambush', { name: loc.name }), 'bad', undefined, undefined, siteLogScope(locationId));
    } else {
      resolveSearch(locationId, false);
    }
  };

  /** What the next search roll at a site costs — the roll and the card both read this. */
  const searchChanceAt = (loc: LocationState): number => {
    const s = get();
    const band = timeOfDay(s.hour);
    const traits = s.character?.traitIds ?? [];
    return searchAmbushChance({
      danger: siteDanger(loc),
      band,
      weatherMod: weatherEncounterMod(weatherKindFor(s.seed, s.day)),
      pressure: pressureFn()(loc.lat, loc.lng),
      encounterMod: sumTraitMod(traits, 'encounterChanceMod') + skillPackage().encounterChanceMod,
      nightEncounterMod: sumTraitMod(traits, 'nightEncounterChanceMod'),
      ambushMod: sumTraitMod(traits, 'ambushChanceMod') + skillPackage().ambushChanceMod,
      searchesSinceAmbush: loc.searchesSinceAmbush,
    });
  };

  /**
   * Stepping onto a floor for the first time: the theme shows itself, but no
   * door is read yet. Each room is sized up when the player picks it.
   */
  const sweepFloor = (level: number) => {
    const s = get();
    if (!s.hdb) return;
    const label = storeyLabel(s.hdb, level);
    const theme = s.hdb.floors[level - 1]?.theme;
    if (theme && theme !== 'ordinary') {
      pushLog(
        `Level ${label}: ${THEME_META[theme].reveal}`,
        theme === 'nest' || theme === 'fire' ? 'bad' : 'info',
        undefined,
        undefined,
        hdbFloorScope(s.hdb.locationId, level, storeyLabel(s.hdb, level)),
      );
    }
  };

  /**
   * Read one room from the corridor the first time it is picked. Perception and
   * Dexterity roll against the floor's sweep stream forked by room, so a room
   * reads the same whichever order the doors are picked in. `show` plays the
   * dice in the action card; a door opened without a pick reads silently.
   */
  const scoutHdbRoom = (unitId: string, show: boolean) => {
    const s = get();
    if (!s.hdb || !s.character) return;
    const level = s.hdb.currentLevel;
    const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
    if (!needsScout(unit)) return;
    const rng = new Rng(s.seed).fork(`sweep:${s.hdb.locationId}:${level}:${s.day}`);
    const res = scoutUnit(
      rng,
      s.character.attributes,
      s.hdb,
      level,
      unitId,
      sumTraitMod(s.character.traitIds, 'hdbScoutBonus'),
    );
    if (!res.roll) return;
    set({
      hdb: res.dungeon,
      hdbScout: show
        ? { locationId: s.hdb.locationId, level, unitId, startedAt: Date.now(), roll: res.roll }
        : get().hdbScout,
    });
    const { perception, dexterity } = res.roll;
    const read = [perception.success && 'who is behind it', dexterity.success && 'what is inside']
      .filter(Boolean)
      .join(' and ');
    pushLog(
      read
        ? `${unit!.label}: from the corridor you read ${read}.`
        : `${unit!.label}: the doorway tells you nothing.`,
      'info',
      undefined,
      undefined,
      hdbFloorScope(s.hdb.locationId, level, storeyLabel(s.hdb, level)),
    );
  };

  /**
   * Empty a unit and mark it done for good. Called both on a clean entry and
   * after the fight that came out of the doorway — either way the room is spent.
   * Loot opens a sequential search session (same timeline grid as outdoor sites).
   */
  const markHdbUnitCleared = (hdb: HdbDungeon, level: number, unitId: string): HdbDungeon => {
    return updateUnit(hdb, level, unitId, { state: 'cleared' });
  };

  const hdbForceOpts = () => {
    const s = get();
    return {
      heatMult: sumTraitMod(s.character!.traitIds, 'hdbDoorHeatMult') + skillPackage().hdbDoorHeatMult,
      minutesMult: sumTraitMod(s.character!.traitIds, 'hdbBreachMinutesMult') + skillPackage().hdbBreachMinutesMult,
      crowbar: s.items.some((i) => isCarried(i.container) && i.defId === 'crowbar'),
    };
  };

  /** Bonus on cutting an alarm: a toolbox, plus the same trades mods a lockpick gets. */
  const hdbCutMod = () => {
    const s = get();
    const tool = s.items.some((i) => isCarried(i.container) && i.defId === ROOM_EVENTS.alarm.toolId);
    return (
      (tool ? ROOM_EVENTS.alarm.toolBonus : 0) +
      sumTraitMod(s.character!.traitIds, 'hdbPickMod') +
      skillPackage().hdbPickMod
    );
  };

  const hdbBusy = () => {
    const s = get();
    return !s.hdb || !!s.combat || !!s.pendingSearch || !!s.pendingEvent;
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
        sumTraitMod(s.character!.traitIds, 'searchSpeedMod') + skillPackage().searchSpeedMod,
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
        totalMinutes: searchMinutes(table) * themeSearchMult(hdb, level),
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

  /** An alarm goes off on `level`: stairwell-wide heat, street noise, a log line. */
  const soundHdbAlarm = (level: number, unitId: string, label: string, how: 'door' | 'cut') => {
    const g = get();
    if (!g.hdb) return;
    set({ hdb: tripAlarm(g.hdb, level, unitId) });
    placeDisturbance('hdb_alarm', g.currentPos, { silent: true });
    pushLog(
      how === 'door'
        ? `The door gives and an alarm starts screaming in ${label}. Every landing hears it (+${ROOM_EVENTS.alarm.heat} heat).`
        : `Wrong wire. The alarm in ${label} goes off in your hands (+${ROOM_EVENTS.alarm.heat} heat).`,
      'bad',
      undefined,
      undefined,
      hdbUnitScope(g.hdb.locationId, level, unitId, label),
    );
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
    // Whatever rides on the room shows itself once you are through the door.
    let next = updateUnit(g.hdb, level, unitId, {
      state: 'breached',
      ...(unit.event ? { eventKnown: true } : {}),
    });
    // A forced door carries through the whole stairwell, not just this landing.
    if (heat > 0) next = addDoorHeat(next, heat, level);
    set({ hdb: next });
    if (noise > 0) {
      pushLog(`You force ${unit.label}. The sound carries.`, 'bad', undefined, undefined, unitLogScope);
      placeDisturbance(entry === 'barricaded' ? 'barricade' : 'door');
    } else {
      pushLog(`You slip into ${unit.label} without touching the frame.`, 'info', undefined, undefined, unitLogScope);
    }
    if (outcome.alarm) soundHdbAlarm(level, unitId, unit.label, 'door');

    if (outcome.trapped && rng.chance(0.35)) {
      const dmg = rng.int(4, 12);
      const bodyParts = applyWound(get().bodyParts, dmg, rng);
      const hot = get().hdb;
      set({ bodyParts, ...(hot ? { hdb: addHeat(hot, HAZARD_HEAT, level, SPILL.trap) } : {}) });
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
    if (levelHunting(hot, level)) {
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
      // A gang landing that hasn't been paid sends people, not the dead.
      const gang = gangHostile(hot.floors[level - 1]);
      startZombieCombat(hot.locationId, false, {
        terrainOverride: 'hdb_corridor',
        ...(gang
          ? { enemy: makeLoner(rng, 'raider', floorThreat(hot, level)) }
          : { danger: floorThreat(hot, level) }),
        intro: gang
          ? `The crew that holds this landing comes out of ${unit.label}. You didn't pay.`
          : `Something was waiting inside ${unit.label}.`,
        hdbUnit,
      });
      return;
    }

    clearHdbUnit(level, unitId, outcome.lootMod, rng.fork('loot'), outcome.searchHp);
    persist();
  };

  /**
   * Move a faction's opinion of you. Lifted out of the event interpreter so
   * anything can spend or earn goodwill — the tunnel camps are Circle people, and
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
      if (!adjacentEdge(net, stationIds[i - 1], stationIds[i])) {
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
      let meters = 0;
      let mode: 'mrt' | 'lrt' = 'lrt';
      let lineCode = '';
      let lineName = 'Tunnel';
      let lineColor = '#9c9890';
      for (let i = 1; i < stationIds.length; i++) {
        const seg = adjacentEdge(net, stationIds[i - 1], stationIds[i])!;
        hopMeters.push(seg.meters);
        meters += seg.meters;
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
        loadOf(cur).tunnelTravelMult,
      );
      const run = generateTunnelRun(
        new Rng(cur.seed).fork(`tunnel:${stations[0].stationId}:${destId}:${seq}`),
        {
          from: fromNow,
          to,
          stations,
          hopMeters,
          lineCode,
          lineName,
          lineColor,
          mode,
          meters,
          travelMin: walk.travelMin,
          day: cur.day,
          hour: cur.hour,
          hordeLevel: BASE_ACTIVITY_PRESSURE * 100,
          localPressure: Math.max(pressureFn()(fromNow.lat, fromNow.lng), pressureFn()(to.lat, to.lng)),
          seq,
        },
      );

      set({ tunnel: run, tunnelSeq: seq, tunnelOffer: null });
      const runScope = tunnelRunScope(
        run.id,
        `${run.fromName} → ${run.stationNames?.[run.stationNames.length - 1] ?? run.toName}`,
      );
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
      recognizeSurroundings();
      const arrivalSeed = get().seed;
      void ensureWorldAround(to.lat, to.lng).then(() => {
        if (get().seed !== arrivalSeed || get().currentPositionId !== to.id) return;
        recognizeSurroundings();
        persist();
      });
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
    let wentLoose = false;
    for (const stack of loot) {
      const condition = conditionRoll(rng, stack.defId, bias);
      // Pack first, then carried loose. The temp pile is still there to drop
      // things into, but nothing is left behind for want of grid space.
      const carried = addToCarry(items, stack.defId, stack.count, condition);
      items = carried.items;
      if (carried.loose > 0) wentLoose = true;
    }
    items = stampFirearmLoot(items, rng);
    set({
      items,
      inventoryOpenToken: wentLoose ? s.inventoryOpenToken + 1 : s.inventoryOpenToken,
    });
    bumpHaul(loot, []);
    pushLog(
      loot.length ? `You strip ${node.name}.` : `${node.name} was picked over long ago.`,
      loot.length ? 'good' : 'info',
      loot.length ? { loot, leftover: [] } : undefined,
      undefined,
      nodeScope,
    );
    if (wentLoose) {
      pushLog('No room in the pack — the rest you carry loose.', 'info', undefined, undefined, nodeScope);
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

    // ---- Circle in the bore ------------------------------------------------
    if (node.kind === 'checkpoint') {
      const after = tunnelTick(meta.minutes / 60);
      if (!after) return;
      if ((get().factionStanding.sta ?? 0) >= STANDING_TRUSTED) {
        set({ tunnel: markDone(after, nodeId) });
        pushLog(`${node.name}: they know the face. The Circle waves you through.`, 'good', undefined, undefined, nodeScope);
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
      const check = shownCheck(rng, 'wits', hazardDc(node), `Read the signal at ${node.name}`);
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
      const check = shownCheck(rng, cfg.attr, hazardDc(node), `Get through ${node.name}`);
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
        const lo = cfg.wound.min;
        const hi = cfg.wound.max;
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
      for (const defId of drops) items = addToCarry(items, defId, 1).items;
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

  // Walking somewhere can stumble into a street scene. The roll's rate limits
  // live in activity.ts; the scene itself is staged once arrival has settled.
  const noticeActivity = (from: { lat: number; lng: number }): ActivityEvent | null => {
    const s = get();
    const loc = s.currentPositionId ? s.locations[s.currentPositionId] : null;
    if (!loc) return null;
    const now = totalGameHour(s.day, s.hour);
    const activity = exploreActivity(s.activity, {
      seed: s.seed, ...s.currentPos, now,
      distanceM: haversine(from.lat, from.lng, s.currentPos.lat, s.currentPos.lng),
      weather: weatherKindFor(s.seed, s.day),
      category: loc.category,
      disturbed: disturbanceOver(loc) > 0,
    });
    if (activity === s.activity) return null;
    set({ activity });
    const event = activity.event;
    return event && event.id !== s.activity.event?.id ? event : null;
  };

  /**
   * Put a street scene in front of the player: its disturbance goes down first
   * (the alarm is already ringing), then the same card and dice as a doorway.
   */
  const stageStreetScene = (scene: ActivityEvent, locId: string) => {
    const s = get();
    const loc = s.locations[locId];
    if (!loc || s.combat || s.pendingEvent || s.pendingSearch || s.hdb || s.tunnel) return;
    const rng = new Rng(s.seed).fork(`street:${scene.id}`);
    const zoneKind = STREET_ZONE[scene.kind];
    let zoneId: string | null = null;
    if (zoneKind) {
      let at = { lat: loc.lat, lng: loc.lng };
      if (zoneKind === 'gunfire') {
        // Somebody else's fight, a few streets over — not at your feet.
        const bearing = rng.next() * Math.PI * 2;
        const dist = 250 + rng.next() * 150;
        at = {
          lat: loc.lat + (dist * Math.cos(bearing)) / 111_320,
          lng: loc.lng + (dist * Math.sin(bearing)) / (111_320 * Math.cos((loc.lat * Math.PI) / 180)),
        };
      }
      zoneId = placeDisturbance(zoneKind, at, { silent: true }).id;
    }
    const event = buildStreetScene(scene.kind, rng.fork('scene'), loc, {
      day: s.day,
      time: timeOfDay(s.hour),
      weather: weatherKindFor(s.seed, s.day),
      standing: s.factionStanding,
      locale: activeLocale(),
    }, zoneId);
    pushLog(event.tell, 'bad', undefined, undefined, siteLogScope(locId));
    set({ pendingEvent: { locationId: locId, event }, _eventRng: rng.fork('resolve') });
  };

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
    recognizeSurroundings();
    const scene = noticeActivity({ lat: anim.fromLat, lng: anim.fromLng });

    // Pull in the bake cell under this site so the frontier past it fills with
    // undiscovered "?" as you push toward distant objectives.
    const arrivalSeed = get().seed;
    void ensureWorldAround(loc.lat, loc.lng).then(() => {
      if (get().seed !== arrivalSeed || get().currentPositionId !== loc.id) return;
      recognizeSurroundings();
      persist();
    });

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
    if (scene) stageStreetScene(scene, loc.id);
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
    recognizeSurroundings();

    // Open ground is how you leave the starting bubble — materialise whatever
    // the bake has under this landing so the walk toward evac stays a city.
    const arrivalSeed = get().seed;
    void ensureWorldAround(lat, lng).then(() => {
      const s = get();
      if (s.seed !== arrivalSeed || s.currentPos.lat !== lat || s.currentPos.lng !== lng || s.travelAnim) return;
      recognizeSurroundings();
      persist();
    });

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
    hordeLevel: BASE_ACTIVITY_PRESSURE * 100,
    evacZoneId: null,
    evacDeadline: null,
    evacCooldownUntil: null,

    evacContacted: false,
    escaped: false,
    maxHp: 100,
    meters: initialMeters(),
    bodyParts: initialBodyParts(100),
    lastCare: null,
    day: 1,
    hour: START_HOUR,
    items: [],
    equipment: emptyEquipment(),
    clothingTears: OWN_CLOTHES_TEARS,
    kills: 0,
    stats: emptyRunStats(),
    skills: emptySkills(),
    skillDayXp: emptySkillDayXp(1),
    exploredArea: [],
    combat: null,
    _combatRng: null,
    hdb: null,
    hdbBlocks: {},
    siteRoofs: {},
    hdbHoverLevel: null,
    hdbSelUnit: null,
    hdbScout: null,
    tunnel: null,
    tunnelSeq: 0,
    tunnelOffer: null,
    noisePulses: [],
        activity: freshActivity(),
    ghostOffer: null,
    pendingEvent: null,
    shownRoll: null,
    revealTour: null,
    pendingSearch: null,
    _eventRng: null,
    _eventClock: freshEventClock(),
    factionStanding: emptyStanding(),
    raidMode: null,
    outposts: {},
    trader: null,
    traderTaken: {},
    bounties: [],
    bountiesTaken: [],
    escort: null,
    mapAnnotations: [],
    explorationLeads: [],
    nearbyRecognition: [],
    dismissNearbyRecognition: (cue) => {
      if (get().nearbyRecognition === cue) set({ nearbyRecognition: [] });
    },
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
        explorationLeads: [],
        nearbyRecognition: [],
        maxHp,
        meters: initialMeters(),
        bodyParts: initialBodyParts(maxHp),
        lastCare: null,
        phase: 'spawn',
        day: 1,
        hour: START_HOUR,
        items: [],
        equipment: emptyEquipment(),
        inventoryOpenToken: 0,
        clothingTears: OWN_CLOTHES_TEARS,
        kills: 0,
        stats: emptyRunStats(),
        skills: SKILLS_ENABLED ? skillsFromTraits(c.traitIds) : emptySkills(),
        skillDayXp: emptySkillDayXp(1),
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
      // If both sources fail, stay on spawn selection and let the player retry.
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

      if (!raw) return 'unavailable';
      const list = buildLocations(rng, spawn, raw, net);
      // Count verified sites, never generated stepping stones or rejected HDBs.
      if (list.filter((loc) => loc.category !== 'waypoint').length < 5) return 'remote';
      const usedFallback = false;
      const worldError = null;

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
        groundZeroId: null,
        hordeLevel: BASE_ACTIVITY_PRESSURE * 100,
        activity: freshActivity(),
      });
      pushLog(
        flavor(usedFallback ? 'wakeOffline' : 'wake', { name: spawn.name }),
        'info',
      );
      // A scavenger by trade gets more out of every site than the search budget
      // allows anyone else.
      const searchBonus = sumTraitMod(get().character!.traitIds, 'searchBonusMod') + skillPackage().searchBonusMod;
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
          await ensurePoiOutlines([far.osmId]);
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
      if (!evacZoneId) evacZoneId = pickNextEvacZone(list, spawn.lat, spawn.lng, null);

      const firstRoute = evacZoneId ? routeLandPath(spawn, locations[evacZoneId], { deterministic: true }) : null;
      const firstWindow = evacWindowHours(true, 1, firstRoute?.lengthM);
      const evacDeadline = totalGameHour(1, START_HOUR) + firstWindow;

      set({
        hordeLevel: BASE_ACTIVITY_PRESSURE * 100,
        groundZeroId: null,
        evacZoneId,
        evacDeadline: evacZoneId ? evacDeadline : null,
        evacCooldownUntil: evacZoneId ? null : totalGameHour(1, START_HOUR) + 12,

        evacContacted: false,
        escaped: false,
      });
      const evacLoc = evacZoneId ? locations[evacZoneId] : null;
      if (evacLoc) {
        pushLog(
          t('ui.evac.announced', { zone: evacLoc.name, hours: firstWindow }, activeLocale()),
          'good',
          undefined,
          { lat: evacLoc.lat, lng: evacLoc.lng, label: evacLoc.name },
        );
      }

      // Starting kit: the role's kit plus trait kits (startingKit.ts).
      // Equip first (incl. bag), sync the pack silhouette, then pack the rest —
      // anything that does not fit rides loose. Pools roll off the run seed.
      let items: ItemInstance[] = [];
      const equipment = emptyEquipment();
      const character = get().character!;
      const kit = resolveStartingKit(character.occupationId, character.traitIds, rng.fork('startingKit'));
      for (const [slot, line] of Object.entries(kit.equip) as [EquipSlot, KitLine][]) {
        const def = itemDef(line.id);
        equipment[slot] = {
          uid: `equip_start_${def.id}`,
          defId: def.id,
          container: `equip:${slot}`,
          x: 0,
          y: 0,
          rotated: false,
          stack: 1,
          condition: def.maxCondition ?? 100,
        };
      }
      const packStarters = kit.pack.map((l) => ({ defId: l.id, count: l.count }));
      const traitW = sumTraitMod(get().character!.traitIds, 'gridWidthBonus');
      syncBackpackBonuses(traitW, equipment);

      let kitLeftover = 0;
      for (const { defId, count } of packStarters) {
        const packed = addToCarry(items, defId, count);
        items = packed.items;
        kitLeftover += packed.loose;
      }
      const packLegal = items
        .filter((i) => i.container === 'backpack')
        .every((i) => {
          const d = itemDef(i.defId);
          const { w, h } = footprint(d, i.rotated);
          return canPlace('backpack', items, { x: i.x, y: i.y, w, h }, i.uid);
        });
      if (import.meta.env.DEV && !packLegal) {
        console.error('[start] starting bag packGrid is illegal for the starting kit', {
          packLegal,
          kitLeftover,
        });
      }

      // Hubs exist independently of player knowledge. Only starting intel
      // traits reveal their pins; other hubs must be found during the run.
      const outposts = pickOutposts(Object.values(locations));
      const withServices = applyFactionServices(locations, outposts, get().seed);
      const startingIntel = applyStartingFactionIntel(
        rng, withServices, outposts, get().character!.traitIds,
      );

      set({
        locations: startingIntel.locations,
        items,
        equipment,
        outposts,
        // Who you were before the world ended still counts for something: a
        // build can start owing somebody a favour, or having been somebody's
        // neighbour.
        factionStanding: startingStanding(get().character!.traitIds),
        escort: null,
        traderTaken: {},
        bounties: [],
        bountiesTaken: [],
      });
      for (const loc of startingIntel.revealed) {
        if (!loc.factionId) continue;
        const cfg = FACTION_CONFIG[loc.factionId];
        pushLog(
          `Word is ${cfg.shortName} run a ${cfg.outpostName.toLowerCase()} out of ${loc.name}, ${loc.distanceFromSpawn} m off — full services if they know you.`,
          'info',
        );
      }

      recognizeSurroundings();
      persist();
      return 'ok';
    },

    travel: (locationId) => {
      const s = get();
      const loc = s.locations[locationId];
      if (!loc || s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim) return;
      if (s.meters.energy <= 0) {
        pushLog(flavor('tooTired'), 'bad');
        return;
      }

      const weather = weatherKindFor(s.seed, s.day);
      const profile = surfaceTravelProfile({ ...s, character: s.character! });
      const { load, range } = profile;
      if (pinnedByLoad(load)) return;

      const route = routeLandPath(s.currentPos, { lat: loc.lat, lng: loc.lng });
      if (!route) {
        pushLog(NO_DRY_ROUTE_MSG, 'bad');
        return;
      }
      const from = s.currentPos;
      const directM = haversine(from.lat, from.lng, loc.lat, loc.lng);
      // Routing rounds metres for display; it must not turn a short walk into zero time.
      const dist = Math.max(route.lengthM, directM);
      // The circle and walking charge use direct distance; the route prices time.
      const quote = quoteTravelEnergy(directM, s.meters.energy, profile.energyPerMetre, load.canTravel);
      if (!quote.affordable) {
        pushLog(
          `${loc.name} needs ${quote.energyCost.toFixed(1)} energy to walk there (range ${Math.floor(range)} m). Recover energy or use the tunnels.`,
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
        profile.legFactor,
      );

      const vegOnRoute = vegetationCost(from, { lat: loc.lat, lng: loc.lng }, route.points);

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
          hordeIntensity: BASE_ACTIVITY_PRESSURE,
          pressureAt: pressureFn(),
          weatherEncounterMod: weatherEncounterMod(weather),
          wet: isWetWeather(weather),
          traitEncounterMod:
            routeEncounterMod(now, band) +
            (now.escort?.toId === loc.id ? ESCORT_ENCOUNTER_MOD : 0),
          safe: now.spawn ?? undefined,
          day: now.day,
          ...darkOpts(now, band, weather),
        },
        undefined,
        route.points,
      );

      const encRng = new Rng(now.seed).fork(`road:${loc.id}:${now.day}:${Math.round(now.hour)}`);
      checkHazardZones({ lat: loc.lat, lng: loc.lng }, risk, encRng, isWetWeather(weather));
      set({ meters: { ...s.meters, energy: quote.remainingEnergy } });
      if (advanceTime((est.travelMin / 60) * vegOnRoute.travelMult, undefined, false, true, 0)) return;
      bumpStats({ distanceM: dist });
      applyPracticeXp('fitness', (est.travelMin / 60) * vegOnRoute.travelMult * PRACTICE_XP.trekHour, true);
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
      const durationMs = travelAnimDurationMs(est.travelMin, vegOnRoute.travelMult);
      pushLog(flavor('setout', {
        name: loc.name,
        time: timeOfDay(s.hour),
        weather,
      }), 'info');
      if (vegOnRoute.patches.length > 0) {
        pushLog('Dense forest slows you — nature reserve overgrowth.', 'info');
      }
      noteOverload(s.day, load.ratio);
      applyLoadOnWalk(load, dist, { lat: loc.lat, lng: loc.lng }, encRng.fork('load'));
      if (get().escort?.toId === loc.id) {
        set({ escort: null });
        pushLog(
          `Two of the Cordon walk you as far as ${loc.name}. They peel off at the door.`,
          'good',
        );
      }
      if (applyCrossingOutcome(outcome, encRng, risk.hazards.length > 0)) return;
      if (risk.hazards.length > 0) pushCrossingLog(
        { kind: 'resolved', woundHp: outcome.woundHp, infectionDelta: outcome.infectionDelta, intercepted: !!roadAmbush, extraMinutes: Math.round(outcome.extraHours * 60) },
        roadAmbush || outcome.woundHp > 0 || outcome.infectionDelta > 0 ? 'bad' : 'info');
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
      const dc = dcFor(loc.currentDanger);
      const res = shownCheck(rng, 'dexterity', dc, 'Sneak past the gate');
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
      const dc = dcFor(loc.currentDanger);
      const res = shownCheck(rng, 'dexterity', dc, 'Search without being heard');
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
      if (s.meters.energy <= 0) {
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
      const directM = haversine(from.lat, from.lng, lat, lng);
      const dist = Math.max(route.lengthM, directM);
      if (directM < TREK_MIN_DISTANCE_M) {
        pushLog('That\'s a few steps, not a move. Pick somewhere worth the walk.', 'info');
        return;
      }

      const weather = weatherKindFor(s.seed, s.day);
      const profile = surfaceTravelProfile({ ...s, character: s.character! });
      const { load, range } = profile;
      if (pinnedByLoad(load)) return;

      const quote = quoteTravelEnergy(directM, s.meters.energy, profile.energyPerMetre, load.canTravel);
      if (!quote.affordable) {
        pushLog(
          `That walk needs ${quote.energyCost.toFixed(1)} energy (range ${Math.floor(range)} m). Recover energy first.`,
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
        profile.legFactor,
      );
      const veg = vegetationCost(from, { lat, lng }, route.points);
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
          hordeIntensity: BASE_ACTIVITY_PRESSURE,
          pressureAt: pressureFn(),
          weatherEncounterMod: weatherEncounterMod(weather),
          wet: isWetWeather(weather),
          traitEncounterMod: routeEncounterMod(now, trekBand),
          safe: now.spawn ?? undefined,
          day: now.day,
          ...darkOpts(now, trekBand, weather),
        },
        undefined,
        route.points,
      );

      const encRng = new Rng(now.seed).fork(
        `trek:${lat.toFixed(5)}:${lng.toFixed(5)}:${now.day}:${Math.round(now.hour)}`,
      );
      checkHazardZones({ lat, lng }, risk, encRng, isWetWeather(weather));
      set({ meters: { ...s.meters, energy: quote.remainingEnergy } });
      if (advanceTime((est.travelMin / 60) * veg.travelMult, undefined, false, true, 0)) return;
      applyPracticeXp('fitness', (est.travelMin / 60) * veg.travelMult * PRACTICE_XP.trekHour, true);
      bumpStats({ distanceM: dist });
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

      const durationMs = travelAnimDurationMs(est.travelMin, veg.travelMult);
      const startedAt = Date.now();
      pushLog(flavor('trekOut'), 'info');
      if (veg.patches.length > 0) {
        pushLog('You push through dense forest — every step takes longer.', 'info');
      }
      noteOverload(s.day, load.ratio);
      applyLoadOnWalk(load, dist, { lat, lng }, encRng.fork('load'));
      if (applyCrossingOutcome(outcome, encRng, risk.hazards.length > 0)) return;
      if (risk.hazards.length > 0) pushCrossingLog(
        { kind: 'resolved', woundHp: outcome.woundHp, infectionDelta: outcome.infectionDelta, intercepted: !!trekAmbush, extraMinutes: Math.round(outcome.extraHours * 60) },
        trekAmbush || outcome.woundHp > 0 || outcome.infectionDelta > 0 ? 'bad' : 'info');
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
      if (pinnedByLoad(loadOf(s))) return;
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
        if (!adjacentEdge(net, stationIds[i - 1], stationIds[i])) {
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
      if (pinnedByLoad(loadOf(s))) return;
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

      // The walk between columns is charged first: whatever is on the node
      // happens after you have already spent the minutes getting to it.
      const walked = tunnelTick(run.minutesPerHop / 60);
      if (!walked) return;
      const nextRun = stepTo(walked, nodeId);
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
      const r = addToCarry(get().items, offer.giveDefId, 1);
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
      const check = shownCheck(rng, 'dexterity', hazardDc(node), `Slip past the marshals at ${node.name}`);
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
        intro: `A Warden marshal draws on you in ${node.name}.`,
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
        (i) => isCarried(i.container) && i.defId === offer.wantDefId,
      ).reduce((n, i) => n + i.stack, 0);
      if (held < offer.wantCount) {
        pushLog(`They want ${offer.wantCount}× ${want.name}. You have ${held}.`, 'bad');
        return;
      }

      let items = s.items;
      for (let n = 0; n < offer.wantCount; n++) items = consumeOneOf(items, offer.wantDefId);
      const packed = addToCarry(items, offer.giveDefId, offer.giveCount);

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
        'The Common Folk sit you down. Hot rice, a mug of something boiled, and a few minutes that are not the street.',
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
        s.items.some((i) => isCarried(i.container) && i.defId === id && i.stack > 0),
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
        `The Cordon take ${itemDef(tributeId).name} and fall in. They will walk you to ${dest.name}.`,
        'good',
      );
      persist();
    },

    acceptBounty: (offerId) => {
      const s = get();
      const loc = s.currentPositionId ? s.locations[s.currentPositionId] : null;
      if (!loc?.factionId || s.factionStanding[loc.factionId] <= STANDING_HATED) return;
      if (s.bounties.length >= MAX_ACTIVE_BOUNTIES) {
        pushLog(`You already carry ${MAX_ACTIVE_BOUNTIES} jobs. Finish or drop one first.`, 'bad');
        return;
      }
      if (s.bountiesTaken.includes(offerId)) return;
      const offer = bountyBoard(s.seed, loc, s.day, s.locations).find((o) => o.id === offerId);
      if (!offer) return;
      const bounty: ActiveBounty = { ...offer, acceptedDay: s.day, killsAtAccept: s.kills };
      let locations = s.locations;
      if (offer.kind === 'scout' && offer.targetId && locations[offer.targetId]) {
        // A job you can't find is no job: they point it out on your map.
        locations = { ...locations, [offer.targetId]: { ...locations[offer.targetId], discovered: true } };
      }
      set({ bounties: [...s.bounties, bounty], bountiesTaken: [...s.bountiesTaken, offerId], locations });
      pushLog(`${FACTION_CONFIG[loc.factionId].shortName} put you on a job.`, 'info', undefined, undefined, siteLogScope(loc.id));
      persist();
    },

    turnInBounty: (bountyId) => {
      const s = get();
      const b = s.bounties.find((x) => x.id === bountyId);
      const loc = s.currentPositionId ? s.locations[s.currentPositionId] : null;
      if (!b || !loc || loc.factionId !== b.factionId) return;
      const carried = (defId: string) =>
        s.items.filter((i) => isCarried(i.container) && i.defId === defId).reduce((n, i) => n + i.stack, 0);
      if (!bountyProgress(b, { kills: s.kills, locations: s.locations, carried }).done) return;
      let items = s.items;
      if (b.kind === 'deliver' && b.defId) {
        for (let i = 0; i < b.count; i++) items = consumeOneOf(items, b.defId);
      }
      items = addToCarry(items, b.rewardDefId, b.rewardCount).items;
      let locations = s.locations;
      if (b.passDays) {
        const pass = s.day + b.passDays;
        for (const id of new Set([b.siteId, loc.id])) {
          const l = locations[id];
          if (l) locations = { ...locations, [id]: { ...l, tollPaidThroughDay: Math.max(l.tollPaidThroughDay ?? -1, pass) } };
        }
      }
      set({ items, locations, bounties: s.bounties.filter((x) => x.id !== bountyId) });
      shiftStanding(b.factionId, b.rewardStanding);
      pushLog(
        `${FACTION_CONFIG[b.factionId].shortName} pay out: ${b.rewardCount}× ${itemDef(b.rewardDefId).name}.`,
        'good',
        undefined,
        undefined,
        siteLogScope(loc.id),
      );
      persist();
    },

    abandonBounty: (bountyId) => {
      const s = get();
      if (!s.bounties.some((b) => b.id === bountyId)) return;
      set({ bounties: s.bounties.filter((b) => b.id !== bountyId) });
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

    /** Confirm contact, then board during the advertised window. Both are free. */
    callEvac: () => {
      const s = get();
      if (s.phase !== 'game' || !s.character || s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim || s.hdb || s.tunnel) return;
      const now = totalGameHour(s.day, s.hour);
      if (s.evacZoneId && s.evacDeadline != null && now >= s.evacDeadline) {
        beginEvacCooldown();
        persist();
        return;
      }
      if (!s.evacZoneId || s.evacDeadline == null || !s.locations[s.evacZoneId] || s.currentPositionId !== s.evacZoneId) {
        pushLog(t('ui.evac.wrongPlace', undefined, activeLocale()), 'info');
        return;
      }
      if (!s.evacContacted) {
        set({ evacContacted: true });
        pushLog(t('ui.evac.contacted', undefined, activeLocale()), 'good');
        persist();
        return;
      }
      pushLog(t('ui.evac.boarded', undefined, activeLocale()), 'good');
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
      const moved = relocateFoundItem(s.items, uid);
      if (!moved) return;
      const nextSlots = session.slots.map((sl) =>
        sl.uid === uid ? { ...sl, state: 'taken' as const } : sl,
      );
      const next: SearchSession = { ...session, slots: nextSlots, lastWhisper: null };
      set({
        items: moved.items,
        pendingSearch: next,
      });
      if (moved.loose) {
        pushLog(`No room in the pack — you carry the ${itemDef(moved.defId).name} loose.`, 'info');
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
      let loose = false;
      for (const slot of session.slots) {
        if (slot.state !== 'found' || !slot.uid) continue;
        const moved = relocateFoundItem(items, slot.uid);
        if (!moved) continue;
        items = moved.items;
        if (moved.loose) loose = true;
        working = {
          ...working,
          slots: working.slots.map((sl) =>
            sl.id === slot.id ? { ...sl, state: 'taken' as const } : sl,
          ),
        };
      }
      set({ items, pendingSearch: working });
      if (loose) pushLog('Pack full — you carry the rest loose.', 'info');
      if (!hasFoggedOrSearching(working) && !working.slots.some((sl) => sl.state === 'found')) {
        closeSearchSession(working, 'complete');
        return true;
      }
      persist();
      return true;
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

    dismissRoll: () => {
      if (get().shownRoll) set({ shownRoll: null });
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


      let checkDetail = '';
      const reportOutcome = (line: string, tone: GameLogEntry['tone']) => {
        if (!line) return;
        pushLog(checkDetail ? `${line}\n${checkDetail}` : line, tone);
        checkDetail = '';
      };

      /** @returns false if the survivor died partway through. */
      const applyOne = (e: EventEffect): boolean => {
        switch (e.t) {
          case 'line':
            pushLog(e.line, 'info');
            return true;
          case 'mark':
            mark(e.mark);
            return true;
          case 'standing':
            if (ev.factionId) shiftStanding(ev.factionId, e.delta);
            return true;
          case 'time':
            reportOutcome(e.line, 'info');
            if (!advanceTime(e.hours)) return true;
            if (checkDetail) pushLog(checkDetail, 'bad');
            return false;
          case 'energy': {
            const cur = get();
            set({ meters: { ...cur.meters, energy: clampMeter(cur.meters.energy - e.amount) } });
            if (e.line) pushLog(e.line, 'info');
            return true;
          }
          case 'wound': {
            const cur = get();
            set({ bodyParts: applyWound(cur.bodyParts, e.amount, rng) });
            reportOutcome(e.line, 'bad');
            return true;
          }
          case 'disturb':
            placeDisturbance(e.kind);
            return true;
          case 'quiet': {
            const cur = get();
            const zones = quietDisturbance(cur.activity.zones ?? [], e.zoneId);
            if (zones !== cur.activity.zones) {
              set({ activity: { ...cur.activity, zones } });
              pushLog(t('ui.disturbance.quieted', undefined, activeLocale()), 'good');
            }
            return true;
          }
          case 'cover': {
            const cur = get();
            set({ activity: { ...cur.activity,
              cover: { locationId: pe.locationId, until: totalGameHour(cur.day, cur.hour) + 1 } } });
            return true;
          }
          case 'fireShot': {
            const cur = get();
            const gun = cur.equipment.firearm;
            if (gun && canFireHolstered(cur.equipment)) {
              set({ equipment: { ...cur.equipment,
                firearm: { ...gun, loadedRounds: Math.max(0, (gun.loadedRounds ?? 0) - 1) } } });
              placeDisturbance(gun.defId === 'shotgun' ? 'shotgun' : 'gunshot');
            }
            return true;
          }
          case 'scout': {
            const cur = get();
            const here = cur.locations[pe.locationId] ?? { lat: cur.currentPos.lat, lng: cur.currentPos.lng };
            const lead = Object.values(cur.locations).filter((l) => !l.discovered
              && haversine(here.lat, here.lng, l.lat, l.lng) <= 1000)
              .sort((a, b) => haversine(here.lat, here.lng, a.lat, a.lng) - haversine(here.lat, here.lng, b.lat, b.lng)
                || a.id.localeCompare(b.id))[0];
            if (lead) {
              discoverLocation(lead.id);
              pushLog(t('ui.surroundings.results.intel', { name: lead.name }, activeLocale()), 'good');
            } else {
              set({ items: addToCarry(get().items, 'scrap_metal', 1).items });
              pushLog(t('ui.surroundings.results.thanks', undefined, activeLocale()), 'good');
            }
            return true;
          }
          case 'gain': {
            const cur = get();
            const def = itemDef(e.defId);
            const r = addToCarry(cur.items, e.defId, e.count ?? 1);
            set({ items: r.items });
            pushLog(`You come away with ${e.count ?? 1}× ${def.name}.`, 'good');
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
            reportOutcome(e.line, 'info');
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
          const res = shownCheck(rng, attrKey, choice.dc!, choice.label);
          const effects = res.success ? choice.onSuccess : (choice.onFailure ?? [{ t: 'access' } as const]);
          const detail = `${choice.label} — ${attrEmoji(attrKey)} d20 ${res.roll}+${attrVal}${bonus ? `+${bonus}` : ''}=${res.total} vs DC ${res.dc}`;
          if ((ev.kind === 'smoke_block' || ev.kind === 'flooded_entry') &&
              effects.some((e) => (e.t === 'wound' || e.t === 'time' || e.t === 'deny') && e.line)) {
            checkDetail = detail;
          } else {
            pushLog(`${choice.label} — ${attrEmoji(attrKey)} ${ATTRIBUTE_LABELS[attrKey]} d20 ${res.roll}+${attrVal}${bonus ? `+${bonus}` : ''}=${res.total} vs ${res.dc}: ${res.success ? 'success' : 'failure'}`, res.success ? 'good' : 'bad');
          }
          run(effects);
          break;
        }
      }
    },

    rest: (length = 'morning') => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim || !s.character) return;
      const { outcome, pockets, conditions, risk } = planRestFromState(length);
      if (outcome.hours <= 0) {
        pushLog(
          outcome.wokeBy === 'blood'
            ? 'You are bleeding too badly to close your eyes. Patch yourself up first.'
            : 'Hunger and thirst keep you awake. Eat or drink something first.',
          'bad',
        );
        return;
      }
      // Seeded by the hour you lay down, so two naps on one day roll apart.
      const nightRng = new Rng(s.seed).fork(
        `roughsleep:${s.day}:${s.hour.toFixed(2)}:${s.currentPos.lat.toFixed(5)}`,
      );
      if (
        advanceTime(outcome.hours, outcome.after.energy, true, false, 1, {
          meters: outcome.after,
          bodyParts: outcome.bodyParts,
        })
      ) {
        return;
      }
      bumpStats({ nightsSlept: 1 });

      // you slept here — your knowledge of THIS place stays current
      const posId = get().currentPositionId;
      if (posId) discoverLocation(posId);
      const rough = conditions.recoveryMult < 0.85;
      const locale = activeLocale();
      const duration = formatRestHours(outcome.hours, (key, vars) => t(key, vars, locale));
      const notes = [t(`ui.sleep.result.${outcome.wokeBy ?? 'rested'}`, { dur: duration }, locale)];
      if (rough) notes.push(t('ui.sleep.result.rough', { pct: Math.round(conditions.recoveryMult * 100) }, locale));
      let harmed = false;

      if (outcome.infectionDelta > 0) {
        set({
          meters: {
            ...get().meters,
            infection: clampMeter(get().meters.infection + outcome.infectionDelta),
          },
        });
        notes.push(t('ui.sleep.result.damp', undefined, locale));
        harmed = true;
      }
      if (outcome.collapseChance > 0 && nightRng.chance(outcome.collapseChance)) {
        const leg = nightRng.chance(0.5) ? 'leftLeg' : 'rightLeg';
        set({
          bodyParts: applyPartDamage(get().bodyParts, leg, 6 + nightRng.int(0, 6), nightRng),
        });
        notes.push(t('ui.sleep.result.rubble', undefined, locale));
        harmed = true;
      }

      pushLog(notes.join(locale === 'zh-Hans' ? '' : ' '), rough || outcome.wokeBy || harmed ? 'bad' : 'info');

      if (conditions.ambush && risk && nightRng.chance(outcome.ambushChance)) {
        const g = get();
        pushLog(t('ui.sleep.result.ambush', undefined, locale), 'bad');
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
      persist();
    },

    peekRecognition: (pos) => {
      const s = get();
      const radius = recognitionRadiusNow(s);
      if (!(radius > 0)) return [];
      const next = recognizeNearby(s.locations, pos, radius);
      if (next === s.locations) return [];
      return Object.keys(next).filter(id => next[id].identified && !s.locations[id]?.identified);
    },

    peekRestPlan: (length) => {
      const { preview, outcome } = planRestFromState(length);
      return { preview, outcome };
    },

    peekSleepConditions: () => peekRestFromState().conditions,

    peekRestPreview: () => peekRestFromState(),
    peekSearchRisk: (locationId) => {
      const s = get();
      const loc = s.locations[locationId];
      if (!loc || !s.character || loc.factionId || loc.category === 'residential' || loc.exhausted) {
        return null;
      }
      return searchChanceAt(loc);
    },
    peekRouteEncounterMod: (band) => routeEncounterMod(get(), band),

    applyItem: (uid, partId) => {
      const s = get();
      // Fights are committed — no mid-swing bandages from the pack.
      if (s.combat && !s.combat.over) {
        pushLog('No time to dig through the pack mid-fight.', 'bad');
        return;
      }
      const inst = s.items.find((i) => i.uid === uid);
      if (!inst) return;
      const def = itemDef(inst.defId);
      const care = careForItem(def.id);
      if (care) {
        if (s.phase !== 'game' || !s.character || s.travelAnim || s.pendingEvent || s.pendingSearch) return;
        if (!isCarried(inst.container) && inst.container !== TEMP_STASH &&
            (inst.container !== s.currentPositionId || s.tunnel)) return;
        const target = partId ?? chooseCareTarget(s.bodyParts, care);
        if (!target || !canCareWithItem(s.bodyParts[target], def.id)) return;
        let parts = applyCare(s.bodyParts, target, care);
        if (parts === s.bodyParts) return;
        if (def.id === 'improvised_bandage') {
          parts = { ...parts, [target]: { ...parts[target], dirty: true, dressing: 'soiled' } };
        }
        const uses = inst.careUses ?? 3;
        const items = def.id === 'medkit' && uses > 1
          ? s.items.map(i => i.uid === uid ? { ...i, careUses: uses - 1 } : i)
          : consumeOne(s.items, uid);
        set({ bodyParts: parts, items,
          lastCare: { partId: target, action: care, sequence: (s.lastCare?.sequence ?? 0) + 1 } });
        applyPracticeXp('medicine', PRACTICE_XP.healUse);
        pushLog(t(`ui.care.result.${care}`, { part: t(`ui.body.parts.${target}`) }), 'good');
        advanceTime(CARE_MINUTES[care] / 60);
        persist();
        return;
      }
      // Freshness pays. A wilting packet still feeds, just not as much — and the
      // log says so, so the player learns to eat the old stuff first.
      const fresh = (base: number) => scaledRestore(inst, base);
      const faded = hasCondition(inst) && consumableScale(inst) < 1;
      const foodEffectMod = sumTraitMod(s.character!.traitIds, 'foodEffectMod');
      const m = { ...s.meters };
      let newBodyParts = s.bodyParts;
      let consumed = false;
      const effect = preparedEffect(def.effect, inst);
      switch (effect.kind) {
        case 'food': {
          const fx = effect;
          m.hunger = clampMeter(m.hunger + Math.round(fresh(fx.hunger) * (1 + foodEffectMod)));
          if (fx.thirst != null) m.thirst = clampMeter(m.thirst + fresh(fx.thirst));
          if (fx.energy != null) m.energy = clampMeter(m.energy + fresh(fx.energy));
          consumed = true;
          if (faded) pushLog(`Ate ${def.name}. ${consumableRestoreSummary(fx)}${freshnessNote(inst)}.`, 'info');
          break;
        }
        case 'water': {
          const fx = effect;
          m.thirst = clampMeter(m.thirst + fresh(fx.thirst));
          if (fx.hunger != null) {
            m.hunger = clampMeter(m.hunger + Math.round(fresh(fx.hunger) * (1 + foodEffectMod)));
          }
          if (fx.energy != null) m.energy = clampMeter(m.energy + fresh(fx.energy));
          // Murky water upsets the stomach like bad food does (see the consumed block).
          if (faded) {
            pushLog(`Drank ${def.name}. ${consumableRestoreSummary(fx)}${freshnessNote(inst)}.`, 'info');
          }
          consumed = true;
          break;
        }
        case 'heal': {
          // Medical items need a care action; they never grant instant HP.
          return;
        }
        case 'cure': {
          Object.assign(m, cureInfection(m, fresh(effect.infection)));
          // Po Chai (and a Yakult, partly) settles an upset stomach before it lands.
          const settled = settleStomach(m, def.id);
          if (stomachOf(settled) < stomachOf(m)) {
            pushLog(t(stomachOf(settled) > 0 ? 'ui.stomach.eased' : 'ui.stomach.settled', { name: itemName(def.id, activeLocale()) }, activeLocale()), 'good');
            Object.assign(m, settled);
          }
          consumed = true;
          if (def.id === 'antibiotics') {
            const hadInfectedWound = BODY_PART_IDS.some((id) => newBodyParts[id].woundInfected);
            newBodyParts = applyAntibiotics(newBodyParts);
            pushLog(t(hadInfectedWound ? 'ui.care.antibioticsCleared' : 'ui.care.antibioticsCover', { n: ANTIBIOTIC_COVER_HOURS }, activeLocale()), 'good');
          }
          if (faded) pushLog(`Took ${def.name}. Past its date — infection pushed back, but not as hard.`, 'info');
          break;
        }
        case 'energy': {
          const fx = effect;
          m.energy = clampMeter(m.energy + fresh(fx.energy));
          if (fx.hunger != null) {
            m.hunger = clampMeter(m.hunger + Math.round(fresh(fx.hunger) * (1 + foodEffectMod)));
          }
          if (fx.thirst != null) m.thirst = clampMeter(m.thirst + fresh(fx.thirst));
          consumed = true;
          if (faded) pushLog(`Had a ${def.name}. ${consumableRestoreSummary(fx)}${freshnessNote(inst)}.`, 'info');
          break;
        }
        case 'ammo': {
          pushLog(
            'Use Refill on a magazine or holstered shotgun — ammo boxes do not load themselves.',
            'info',
          );
          return;
        }
        case 'skillBook': {
          const book = effect;
          if (!SKILLS_ENABLED) {
            // Skills are switched off: a book carried over from an old save stays unread.
            pushLog(def.name + ' has nothing useful for you right now.', 'info');
            break;
          }
          const result = applySkillBook(s.skills, book.skill, book.tier);
          if (!result.ok) {
            pushLog(
              result.reason === 'too_advanced'
                ? def.name + ' is beyond you yet — come back when you know more.'
                : def.name + ' has nothing left to teach.',
              'info',
            );
            break;
          }
          advanceTime(result.hours);
          set({ skills: result.skills });
          if (result.gainedLevel) {
            pushLog(
              'You finish ' +
                def.name +
                '. ' +
                SKILL_LABELS[book.skill] +
                ' rises to ' +
                result.skills[book.skill].level +
                '.',
              'good',
            );
          } else {
            pushLog(
              'You finish ' +
                def.name +
                '. ' +
                SKILL_LABELS[book.skill] +
                ' inches forward (+' +
                result.xpGranted +
                ' XP).',
              'good',
            );
          }
          consumed = true;
          break;
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
          const fx = effect;

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
        // Food past its best, or murky water, is a gamble rather than a refusal:
        // it upsets the stomach, which seeps into infection over the next hours
        // unless Po Chai settles it (infection.ts).
        const resist = sumTraitMod(s.character!.traitIds, 'infectionResist') + skillPackage().infectionResist;
        const gut = ingestLoad(def, inst, resist);
        if (gut.load > 0) {
          Object.assign(m, upsetStomach(m, gut.load));
          pushLog(t(gut.murky && !gut.spoiled ? 'ui.stomach.murky' : 'ui.stomach.upset', { name: itemName(def.id, activeLocale()), n: gut.load }, activeLocale()), 'bad');
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
        isCarried(c) ||
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

    packReplacing: (uid, x, y, rotated) => {
      const s = get();
      const inst = s.items.find((i) => i.uid === uid);
      if (!inst || inst.container !== LOOSE) return false;
      const out = placeReplacing(s.items, uid, BACKPACK, x, y, rotated);
      if (!out) return false;
      set({ items: out.items });
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
        isCarried(toContainer) ||
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
      // Taking something into the pack never fails: no room in the grid means
      // you carry it loose. Only stashes and the temp pile can be full.
      const slot =
        toContainer === 'backpack' && inst.container !== LOOSE
          ? carrySlot(others, def)
          : (() => {
              const g = findSlot(toContainer, others, def);
              return g ? { container: toContainer, ...g } : null;
            })();
      if (!slot) {
        pushLog(toContainer === 'backpack' ? 'No room in the pack grid.' : 'No space there.', 'bad');
        return;
      }
      set({
        items: s.items.map((i) =>
          i.uid === uid ? { ...i, container: slot.container, x: slot.x, y: slot.y, rotated: slot.rotated } : i,
        ),
      });
      persist();
    },

    dropItem: (uid) => {
      const s = get();
      const inst = s.items.find((i) => i.uid === uid);
      if (!inst) return;
      // The hoarder can't make themselves let go of anything.
      if (hasTraitFlag(s.character!.traitIds, 'cannotDropItems')) {
        pushLog(`You can't bring yourself to leave the ${itemDef(inst.defId).name} behind.`, 'bad');
        return;
      }
      set({ items: s.items.filter((i) => i.uid !== uid) });
      persist();
    },

    craftItem: (recipeId, mode = 'room', waterSource = 'carried') => {
      const s = get();
      if (s.phase !== 'game' || !s.character || s.combat || s.travelAnim || s.pendingSearch || s.pendingEvent) return;
      const recipe = RECIPES.find((r) => r.id === recipeId);
      if (!recipe) return;
      const loc = surfaceSite(s);
      const context: CraftContext = { site: loc?.facilities, atSite: !!loc, now: gameHour(s.day, s.hour), mode, waterSource };
      // A stash is a workbench: somewhere to put things down and take your time.
      const atShelter = s.currentPositionId !== null || s.hdb !== null;
      const adjusted = recipe.fixedInputs ? recipe.inputs : adjustCraftInputs(
        recipe.inputs,
        sumTraitMod(s.character!.traitIds, 'craftCostMod') + skillPackage().craftCostMod,
      );
      const inputs = recipeInputs(recipe, s.items, adjusted, context);
      const check = canCraft(recipe, s.items, atShelter, inputs, context);
      if (!check.ok) {
        pushLog(`Can't make that — ${check.reason.toLowerCase()}.`, 'bad');
        return;
      }
      const spendInputs = (from: ItemInstance[]): ItemInstance[] => {
        let out = from;
        for (const [defId, need] of Object.entries(inputs)) {
          for (let n = 0; n < need; n++) out = consumeOneOf(out, defId);
        }
        return out;
      };
      if (advanceTime(recipe.hours)) return;

      const items = spendInputs(get().items);
      const end = gameHour(get().day, get().hour);
      if (recipe.facility && loc) {
        const current = get().locations[loc.id];
        const facilities = buildFacility(current.facilities, recipe.facility, end, recipe.outputCount);
        set({ items, locations: { ...get().locations, [loc.id]: { ...current, facilities } } });
        applyPracticeXp('trades', PRACTICE_XP.craft);
        persist();
        return { loose: 0 };
      }
      if (recipe.waterInput && waterSource === 'site' && recipe.preparation !== 'boil' && loc) {
        const current = get().locations[loc.id];
        const water = current.facilities!.water!;
        set({ locations: { ...get().locations, [loc.id]: { ...current, facilities: {
          ...current.facilities, water: { ...water, amount: water.amount - recipe.waterInput },
        } } } });
      }
      const made = addToCarry(items, recipe.outputDefId, recipe.outputCount, undefined, craftedPrep(recipe, inputs, context));
      set({ items: made.items });
      applyPracticeXp('trades', PRACTICE_XP.craft);
      persist();
      return { loose: made.loose };
    },

    trackLead: (id) => {
      const leads = get().explorationLeads;
      if (id !== null && !leads.some(lead => lead.id === id && lead.completedDay === undefined)) return;
      if ((leads.find(lead => lead.tracked)?.id ?? null) === id) return;
      set({ explorationLeads: leads.map(lead => {
        if (lead.id === id) return { ...lead, tracked: true };
        return lead.tracked ? { ...lead, tracked: undefined } : lead;
      }) });
      persist();
    },
    readLocalMap: () => {
      const s = get();
      const loc = surfaceSite(s);
      if (s.phase !== 'game' || !s.character || !loc || loc.localMapRead
        || s.combat || s.pendingEvent || s.pendingSearch || s.travelAnim || s.hdb || s.tunnel) return;
      const source = loc.category === 'mrt' || loc.isMrtStation ? 'locality'
        : loc.category === 'residential' || loc.category === 'community' ? 'noticeboard' : null;
      if (!source) return;
      if (source === 'noticeboard') {
        // A board names 5–12 places; a full logbook only stops it adding a lead.
        const reading = readNoticeboard(s.seed, s.locations, loc.id, s.day, s.explorationLeads, s.evacZoneId ?? undefined);
        set({ locations: { ...s.locations, [loc.id]: { ...loc, localMapRead: true } } });
        if (advanceTime(5 / 60)) return;
        const now = get();
        const locations = { ...now.locations };
        const named: string[] = [];
        for (const id of reading.revealIds) {
          const target = locations[id];
          if (!target || target.identified || target.discovered) continue;
          locations[id] = { ...target, identified: true };
          named.push(id);
        }
        if (named.length) set({ locations });
        recordExplorationLeads(reading.leads);
        pushLog(t(named.length ? 'ui.exploration.boardRead' : 'ui.exploration.mapEmpty', { count: named.length }, activeLocale()), named.length ? 'good' : 'info');
        if (named.length) set({ revealTour: { id: ++revealTourSeq, sourceId: loc.id, ids: named } });
        persist();
        return;
      }
      if (s.explorationLeads.filter((lead) => lead.completedDay === undefined).length >= 6) {
        pushLog(t('ui.exploration.tooManyLeads', undefined, activeLocale()), 'info');
        return;
      }
      const leads = findExplorationLeads(s.seed, s.locations, loc.id, source, s.day, s.explorationLeads, s.evacZoneId ?? undefined);
      set({ locations: { ...s.locations, [loc.id]: { ...loc, localMapRead: true } } });
      if (advanceTime(5 / 60)) return;
      recordExplorationLeads(leads);
      pushLog(t(leads.length ? 'ui.exploration.mapRead' : 'ui.exploration.mapEmpty', { count: leads.length }, activeLocale()), 'info');
      if (leads.length) set({ revealTour: { id: ++revealTourSeq, sourceId: loc.id, ids: leads.map((lead) => lead.targetId) } });
      persist();
    },
    dismissRevealTour: (id) => {
      if (get().revealTour?.id === id) set({ revealTour: null });
    },

    collectSiteWater: (source) => {
      const s = get();
      if (s.phase !== 'game' || s.combat || s.travelAnim || s.pendingSearch || s.pendingEvent) return;
      const loc = surfaceSite(s);
      if (!loc) return;
      const now = gameHour(s.day, s.hour);
      const site = loc.facilities;
      const available = source === 'rain' ? collectedRain(site, now, s.seed) : site?.water?.amount ?? 0;
      const count = Math.floor(available);
      if (count < 1) return;
      const facilities = source === 'rain'
        ? { ...site, collector: { checkedAt: now, water: available - count } }
        : { ...site, water: { amount: 0, hotUntil: 0 } };
      const made = addToCarry(s.items, source === 'rain' ? 'dirty_water' : 'newater', count);
      set({ items: made.items, locations: { ...s.locations, [loc.id]: { ...loc, facilities } } });
      pushLog(`Collected ${count} water at ${loc.name}.`, 'good');
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

      const made = addToCarry(items, 'cloth_rags', TEAR_RAGS_YIELD);
      set({ items: made.items, equipment });
      pushLog(
        `Cut up the ${def.name} for ${TEAR_RAGS_YIELD}× ${itemDef('cloth_rags').name}. It won't protect you like it did.`,
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
      const made = addToCarry(now.items, 'cloth_rags', TEAR_RAGS_YIELD);
      const left = now.clothingTears - 1;
      set({ items: made.items, clothingTears: left });
      if (left === 0) pushLog('Cut the last usable strip off your own clothes.', 'info');
      persist();
      return { loose: made.loose };
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
        nextItems = [...nextItems, { ...prev, ...carrySlot(nextItems, itemDef(prev.defId)) }];
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
        const arranged = arrangeOrLoose(grid, toPack);
        const spilled = arranged.filter((i) => i.container === LOOSE).length;
        if (spilled > 0) {
          pushLog(
            `${def.name} can't hold it all — ${spilled === 1 ? 'one thing goes' : `${spilled} things go`} loose.`,
            'info',
          );
        }
        nextItems = [...rest, ...arranged];
        syncBackpackBonuses(traitW, nextEquip);
      } else {
        syncBackpackBonuses(traitW, nextEquip);
      }

      set({ items: nextItems, equipment: nextEquip });
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
        const arranged = arrangeOrLoose(grid, [...packItems, inst]);
        if (arranged.some((i) => i.container === LOOSE)) {
          pushLog('Pockets can\'t hold it all — the rest you carry loose.', 'info');
        }
        syncBackpackBonuses(traitW, nextEquip);
        set({ items: [...rest, ...arranged], equipment: nextEquip });
        persist();
        return;
      }

      const nextEquip = { ...s.equipment, [slot]: null };
      set({
        items: [...s.items, { ...inst, ...carrySlot(s.items, itemDef(inst.defId)) }],
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
      if (!loadOf(s).canFlee) {
        pushLog('Not with this much on you. You stand and fight, or drop something and run.', 'bad');
        return;
      }
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

    setSiteRoofs: (roofs) => {
      const cur = get().siteRoofs;
      let changed = false;
      for (const [id, m] of roofs) {
        if (cur[id] !== m) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      set({ siteRoofs: { ...cur, ...Object.fromEntries(roofs) } });
    },

    setHdbSelUnit: (id) => {
      if (get().hdbSelUnit === id) return;
      set({ hdbSelUnit: id });
      if (id && !hdbBusy()) scoutHdbRoom(id, true);
    },
    setHdbHoverLevel: (level) => {
      if (get().hdbHoverLevel !== level) set({ hdbHoverLevel: level });
    },

    hdbEnter: () => {
      const s = get();
      const loc = s.currentPositionId ? s.locations[s.currentPositionId] : null;
      if (!loc || s.combat || s.pendingEvent || s.pendingSearch || s.hdb) return;
      if (loc.category !== 'residential' || !isVerifiedHdb(loc.id, loc.lat, loc.lng)) return;
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
      // Maze-era saves are converted to strips (doors, heat and fobs carry over).
      const stored = s.hdbBlocks[loc.id];
      const saved = stored ? migrateHdbDungeon(stored) : null;
      if (saved && isStripModel(saved)) {
        // The block settles while you're gone, but it doesn't forget entirely.
        // Re-enter at the void deck / lobby — fog memory stays in revealedLevels.
        set({ hdb: moveTo(halveHeat(saved), 1) });
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
      // The block on the map sets the scale; unmatched tiles fall back to a seeded height.
      const storeys = storeysFromRoof(s.siteRoofs[loc.id]);
      set({ hdb: generateDungeon(rng, loc, archetype, { storeys }) });
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
      const verb = UNIT_META[unit.type].verb;
      if (verb === 'service' || verb === 'intel') {
        pushLog('That door is already hanging. Use what is inside.', 'info');
        return;
      }
      scoutHdbRoom(unitId, false);
      const read = currentFloor(get().hdb!).units.find((u) => u.id === unitId) ?? unit;
      resolveHdbDoor(unitId, breachOutcome(get().hdb!, read, level), unit.entry);
    },

    hdbPick: (unitId) => {
      const s = get();
      if (hdbBusy() || !s.hdb || !s.character) return;
      const level = s.hdb.currentLevel;
      const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
      if (!unit || !unit.available || unit.state === 'cleared' || unit.state === 'breached') return;
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
      const pickMod = sumTraitMod(g.character.traitIds, 'hdbPickMod') + skillPackage().hdbPickMod;
      const rng = new Rng(g.seed).fork(`pick:${g.hdb.locationId}:${unitId}:${g.day}:${g.hdb.moveSeq}`);
      const check = pickCheck(rng, g.character.attributes.dexterity, pickMod);
      pushLog(
        t(check.success ? 'ui.log.lockOpened' : 'ui.log.lockFailed', undefined, activeLocale()) +
          `\n${attrEmoji('dexterity')} d20 ${check.roll}+${g.character.attributes.dexterity}${pickMod ? `+${pickMod}` : ''} = ${check.total} vs DC ${check.dc}`,
        check.success ? 'good' : 'bad',
      );
      if (!check.success) {
        persist();
        return;
      }
      applyPracticeXp('trades', PRACTICE_XP.hdbPick);
      scoutHdbRoom(unitId, false);
      const known = currentFloor(get().hdb!).units.find((u) => u.id === unitId) ?? unit;
      const quiet = { ...known, entry: 'ajar' as const };
      resolveHdbDoor(unitId, breachOutcome(get().hdb!, quiet, level), 'ajar', { skipTime: true });
    },

    hdbTravel: (level) => {
      const s = get();
      if (hdbBusy() || !s.hdb || !s.character) return;
      const from = s.hdb.pos.level;
      if (!canTravelTo(s.hdb, level)) return;
      const load = loadOf(s);
      const plan = travelPlan(s.hdb, from, level, load.stairMult);
      const seq = (s.hdb.moveSeq ?? 0) + 1;
      set({ hdb: { ...s.hdb, moveSeq: seq }, hdbScout: null });
      if (advanceTime(plan.minutes / 60, undefined, false, false, load.energyMult)) return;
      const g = get();
      if (!g.hdb || !g.character) return;
      const d = g.hdb;
      const attrs = g.character.attributes;
      // A fight stops you on that landing: the pin and the storey band go there
      // now; the combat resume marks it visited and sweeps it.
      const stopAt = (lvl: number) =>
        set({ hdb: { ...d, pos: { level: lvl }, currentLevel: lvl }, hdbSelUnit: null });
      for (const c of plan.crossings) {
        const scope = hdbFloorScope(d.locationId, c.level, storeyLabel(d, c.level));
        const label = storeyLabel(d, c.level);
        const rng = new Rng(g.seed).fork(
          `travel:${d.locationId}:${from}:${level}:${g.day}:${seq}:${c.level}`,
        );
        if (c.hunt) {
          if (rng.chance(HUNT_ELITE_CHANCE)) {
            pushLog(`Landing ${label} is not empty. It has been waiting.`, 'bad', undefined, undefined, scope);
            stopAt(c.level);
            startZombieCombat(d.locationId, false, {
              terrainOverride: 'hdb_corridor',
              enemy: makeHulk(rng, floorThreat(d, c.level)),
              intro: 'It fills the landing shoulder to shoulder.',
              hdbStairs: { dest: c.level },
            });
            return;
          }
          pushLog(`You pass landing ${label} in silence. Something heavy shifts and lets you by.`, 'info', undefined, undefined, scope);
        }
        if (c.descent) {
          const check = retreatCheck(rng, attrs, d, c.level, load.fleeDcMod);
          pushLog(
            `Down past ${label} — ${attrEmoji('dexterity')} ${attrEmoji('endurance')} d20 ${check.roll}+${attrs.dexterity + attrs.endurance} = ${check.total} vs DC ${check.dc}`,
            check.success ? 'good' : 'bad',
            undefined,
            undefined,
            scope,
          );
          if (!check.success) {
            pushLog('Something comes up the stairs to meet you.', 'bad', undefined, undefined, scope);
            stopAt(c.level);
            startZombieCombat(d.locationId, false, {
              terrainOverride: 'hdb_corridor',
              danger: floorThreat(d, c.level),
              intro: 'Cut off on the landing.',
              hdbStairs: { dest: c.level },
            });
            return;
          }
        }
      }
      const wasNew = !d.revealedLevels.includes(level);
      set({ hdb: moveTo(d, level), hdbSelUnit: null });
      if (wasNew) sweepFloor(level);
      persist();
    },

    hdbUseService: (unitId) => {
      const s = get();
      if (hdbBusy() || !s.hdb) return;
      const level = s.hdb.currentLevel;
      const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
      if (!unit?.service || !unit.available || unit.state === 'cleared') return;
      const unitLogScope = hdbUnitScope(s.hdb.locationId, level, unitId, unit.label);

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
        const r = addToCarry(get().items, 'medkit', 1);
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

    hdbCutAlarm: (unitId) => {
      const s = get();
      if (hdbBusy() || !s.hdb || !s.character) return;
      const level = s.hdb.currentLevel;
      const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
      if (!unit || !canCutAlarm(unit)) return;
      if (advanceTime(ROOM_EVENTS.alarm.cutMinutes / 60)) return;
      const g = get();
      if (!g.hdb || !g.character) return;
      const wits = g.character.attributes.wits;
      const mod = hdbCutMod();
      const rng = new Rng(g.seed).fork(`cut:${g.hdb.locationId}:${unitId}`);
      const check = cutAlarmCheck(rng, wits, mod);
      const scope = hdbUnitScope(g.hdb.locationId, level, unitId, unit.label);
      pushLog(
        `Cut the alarm — ${attrEmoji('wits')} d20 ${check.roll}+${wits}${mod ? `+${mod}` : ''} = ${check.total} vs DC ${check.dc}`,
        check.success ? 'good' : 'bad',
        undefined,
        undefined,
        scope,
      );
      if (check.success) {
        applyPracticeXp('trades', PRACTICE_XP.hdbPick);
        const hdb = updateUnit(g.hdb, level, unitId, { eventKnown: true, eventSpent: true });
        set({ hdb, hdbBlocks: { ...g.hdbBlocks, [hdb.locationId]: hdb } });
        pushLog(`The standby light on ${unit.label} goes dark. The door is just a door now.`, 'good', undefined, undefined, scope);
      } else {
        soundHdbAlarm(level, unitId, unit.label, 'cut');
        const hdb = get().hdb!;
        set({ hdbBlocks: { ...get().hdbBlocks, [hdb.locationId]: hdb } });
      }
      persist();
    },

    hdbPayToll: () => {
      const s = get();
      if (hdbBusy() || !s.hdb) return;
      const level = s.hdb.currentLevel;
      const floor = s.hdb.floors[level - 1];
      if (!gangHostile(floor)) return;
      const item = THEME_RULES.tollItems.find((id) => hasBackpackItem(id));
      const scope = hdbFloorScope(s.hdb.locationId, level, storeyLabel(s.hdb, level));
      if (!item) {
        pushLog('They look at your pack and laugh. Beer, a tin of food or some gold — come back with one.', 'info', undefined, undefined, scope);
        return;
      }
      consumeBackpackItem(item);
      if (advanceTime(5 / 60)) return;
      const g = get();
      if (!g.hdb) return;
      const floors = g.hdb.floors.map((f) => (f.level === level ? { ...f, tollPaid: true } : f));
      const hdb = { ...g.hdb, floors };
      set({ hdb, hdbBlocks: { ...g.hdbBlocks, [hdb.locationId]: hdb } });
      pushLog(
        `You hand over ${itemDef(item).name.toLowerCase()}. A nod down the corridor: work the doors, don't touch their room.`,
        'good',
        undefined,
        undefined,
        scope,
      );
      persist();
    },

    hdbShaftDrop: () => {
      const s = get();
      if (hdbBusy() || !s.hdb) return;
      const level = s.hdb.currentLevel;
      if (level === 1 || !shaftOpen(s.hdb.floors[level - 1])) return;
      if (advanceTime(THEME_RULES.shaftMinutes / 60)) return;
      const g = get();
      if (!g.hdb) return;
      // Hand over hand down a lift cable is the hardest few minutes of the day.
      set({ meters: { ...g.meters, energy: Math.max(0, g.meters.energy - THEME_RULES.shaftEnergy) } });
      const floors = g.hdb.floors.map((f) => (f.level === level ? { ...f, shaftUsed: true } : f));
      const hdb = moveTo({ ...g.hdb, floors, moveSeq: (g.hdb.moveSeq ?? 0) + 1 }, 1);
      set({ hdb, hdbSelUnit: null, hdbScout: null, hdbBlocks: { ...g.hdbBlocks, [hdb.locationId]: hdb } });
      pushLog(
        'You wrap your hands and go down the lift cable in the dark, past every landing, and drop onto the lift car roof at the bottom. The cable will not take you twice.',
        'good',
        undefined,
        undefined,
        hdbFloorScope(hdb.locationId, 1, storeyLabel(hdb, 1)),
      );
      persist();
    },

    hdbLeave: () => {
      const s = get();
      if (!s.hdb || s.combat || s.pendingEvent) return;
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
        hdbScout: null,
        hdbBlocks: g.hdb ? { ...g.hdbBlocks, [blockId]: g.hdb } : g.hdbBlocks,
      });
      pushLog('You step back out onto the void deck.', 'info', undefined, undefined, leaveScope);
      persist();
    },

    // ------------------------------------------------------ noise & legacy --

    disturb: (kind, at) => {
      if (get().phase !== 'game') return;
      placeDisturbance(kind, at);
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
      const r = addToCarry(get().items, giveDefId, 1);
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
            sumTraitMod(s.character.traitIds, 'attackMod') +
              skillPackage().shootingAccuracy,
            sumTraitMod(s.character.traitIds, 'nightAccuracyExtra') +
              skillPackage().nightAccuracyExtra,
            sumTraitMod(s.character.traitIds, 'zombieAttackMod') +
              skillPackage().zombieAttackMod,
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
            tally: tallyPlayerAction(c.tally ?? emptyTally(), {
              hit: res.hit,
              critical: res.critical,
              damageDealt: res.damageDealt,
              hitChance: res.hitChance,
              minutes: res.timeCostHours * 60,
              shot: true,
            }),
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
            applyPracticeXp('shooting', PRACTICE_XP.firearmKill);
            bumpStats(
              zombie.kind === 'human'
                ? { humanKills: 1 }
                : zombie.kind === 'animal'
                  ? { animalKills: 1 }
                  : { zombieKills: 1 },
            );
          } else {
            set({ equipment, combat: next });
            if (res.hit) applyPracticeXp('shooting', PRACTICE_XP.firearmShot);
          }
          if (res.applyGunshotDanger && res.gunshotIntensity > 0) {
            // Every gun is loud. One fight is one zone: later shots refresh it.
            placeDisturbance(res.gunshotIntensity > 1 ? 'shotgun' : 'gunshot');
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
          tally: tallyPlayerAction(c.tally ?? emptyTally(), {
            hit: res.hit,
            critical: res.critical,
            damageDealt: res.damageDealt,
            hitChance: res.hitChance,
            minutes: res.timeCostHours * 60,
          }),
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
          applyPracticeXp('fighting', PRACTICE_XP.meleeKill);
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
        tally: tallyEnemyAction(
          c.tally ?? emptyTally(),
          {
            hitChance: res.hitChance,
            rollHit: res.dodged || res.blocked || !!res.hitZone,
            dodged: res.dodged,
            blocked: res.blocked,
            infection: res.infectionGain,
            zone: res.hitZone,
          },
          s.bodyParts,
          bodyParts,
        ),
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
      if (!load.canFlee) {
        pushLog('Not with this much on you. You stand and fight, or drop something and run.', 'bad');
        return;
      }
      const pStats = playerCombatStats(
        s.character!.attributes,
        s.character!.traitIds,
        s.equipment,
        armCombatPenalty(s.bodyParts) + headCombatPenalty(s.bodyParts) + infectionEffect(s.meters.infection).attack,
        load.attackMod,
        s.skills,
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
      let fleeZone: BodyPartId | null = null;
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
              fleeZone = zone;
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
      // Only a parting blow counts as their attack; a clean getaway adds nothing.
      const tally =
        fleeIncoming > 0
          ? tallyEnemyAction(
              s.combat.tally ?? emptyTally(),
              { rollHit: true, zone: fleeZone },
              s.bodyParts,
              bodyParts,
            )
          : s.combat.tally;
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
            tally,
            firePrepared: false,
            reloadPrepared: false,
          },
        });
      applyPracticeXp('stealth', PRACTICE_XP.fleeSuccess);
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
            tally,
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
            tally,
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
        for (const defId of context.drops) items = addToCarry(items, defId, 1).items;
        set({ items });
        pushLog(`Looted the ${zombie.name}'s body.`, 'good');
      }

      // A fight in a stairwell is the loudest thing that happens in the block.
      // Applied before the unit settles, so the next door prices it in.
      if (context.hdbUnit || context.hdbStairs) {
        const g0 = get();
        if (g0.hdb) {
          const at = context.hdbUnit?.level ?? context.hdbStairs?.dest ?? g0.hdb.currentLevel;
          set({ hdb: addHeat(g0.hdb, FIGHT_HEAT, at, SPILL.fight) });
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
            ? hdbFloorScope(
                gStairs.hdb.locationId,
                context.hdbStairs.dest,
                storeyLabel(gStairs.hdb, context.hdbStairs.dest),
              )
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
        // The fight stopped you on that landing: you stand there now, and the
        // next trip starts from it (never re-rolls the same crossing).
        const g = get();
        if (g.hdb) {
          const dest = context.hdbStairs.dest;
          const wasNew = !g.hdb.revealedLevels.includes(dest);
          set({ hdb: moveTo(g.hdb, dest) });
          if (wasNew) sweepFloor(dest);
          persist();
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
        hordeLevel: BASE_ACTIVITY_PRESSURE * 100,
        evacZoneId: null,
        evacDeadline: null,
        evacCooldownUntil: null,

        evacContacted: false,
        escaped: false,
        combat: null,
        _combatRng: null,
        hdb: null,
        hdbScout: null,
        hdbBlocks: {},
        tunnel: null,
        tunnelSeq: 0,
        tunnelOffer: null,
        noisePulses: [],
        activity: freshActivity(),
        ghostOffer: null,
        pendingEvent: null,
        shownRoll: null,
        revealTour: null,
        pendingSearch: null,
        _eventRng: null,
        _eventClock: freshEventClock(),
        factionStanding: emptyStanding(),
        raidMode: null,
        escort: null,
        mapAnnotations: [],
        explorationLeads: [],
        nearbyRecognition: [],
        log: [],
        stats: emptyRunStats(),
        hasSavedRun: !!loadRun(),
        highScores: loadHighScores(),
      });
    },

    /**
     * Order matters and is easy to get backwards. `resetToMenu` opens with a
     * `flushPersist()`, so clearing the slot first and resetting second would
     * fire the pending write and resurrect the save we just deleted. Cancelling
     * the debounce makes that flush a no-op — the same sequence `endRun` uses.
     */
    abandonRun: () => {
      cancelPersist();
      clearRun();
      get().resetToMenu();
    },

    refreshSaveSlot: () => set({ hasSavedRun: !!loadRun(), highScores: loadHighScores() }),

    continueRun: () => {
      const run = loadRun();
      if (!run) return;
      // Zones must be ready for vegetation soft-cost (and walkability) before
      // the first trek — don't wait on the MRT fetch.
      void ensureZonesLoaded().catch(() => {
        /* trek/spawn degrade to country clip */
      });
      void ensurePoiOutlines(Object.keys(run.locations))
        .catch(() => {
          // A missing distant tile must not hide already restored nearby outlines.
        })
        .then(() => {
          const s = get();
          if (s.phase !== 'game' || s.seed !== run.seed) return;
          const next = rehydrateLocationOutlines(s.locations);
          if (next !== s.locations) set({ locations: next });
        });
      // Stations were bound to the network when the run was created; get it
      // back in memory so the tunnels still route before play resumes.
      void loadMrtNetwork().then(() => {
      syncBackpackBonuses(
        sumTraitMod(run.character.traitIds, 'gridWidthBonus'),
        coerceEquipment(run.equipment),
      );
      set({
        phase: 'game',
        character: run.character,
        seed: run.seed,
        explorationLeads: normalizeExplorationLeads(run.explorationLeads, run.locations),
        nearbyRecognition: [],
        spawn: run.spawn,
        locations: rehydrateLocationOutlines(run.locations),
        currentPositionId: run.currentPositionId,
        currentPos: run.currentPos,
        equipment: coerceEquipment(run.equipment),
        bodyParts: migrateBodyParts(run.bodyParts, run.maxHp),
        lastCare: null,
        meters: migrateMeters(run.meters as Meters & { health?: number }),
        maxHp: run.maxHp,
        day: run.day,
        hour: run.hour,
        items: refitBackpack(run.items),
        clothingTears: run.clothingTears ?? OWN_CLOTHES_TEARS,
        kills: run.kills,
        stats: normalizeRunStats(run.stats),
        // With skills off, levels from an older save reset to 0 so they add nothing.
        skills: SKILLS_ENABLED
          ? (run.skills ?? skillsFromTraits(run.character.traitIds))
          : emptySkills(),
        skillDayXp: run.skillDayXp ?? emptySkillDayXp(run.day),
        usedFallback: run.usedFallback,
        exploredArea: mergeExploredCircles(run.exploredArea ?? []),
        expandedCells: run.expandedCells ?? [],
        groundZeroId: null,
        hordeLevel: BASE_ACTIVITY_PRESSURE * 100,
        ...restoreEvacuation(run),
        escaped: false,
        travelAnim: null,
        worldLoading: false,
        worldError: null,
        combat: null,
        _combatRng: null,
        hdb: null,
        hdbScout: null,
        hdbBlocks: run.hdbBlocks ?? {},
        // Unlike a block, a tunnel run resumes exactly where it stopped. The
        // player's position only moves on arrival, so ejecting them here would
        // refund every node they hadn't walked yet.
        tunnel: resumableTunnel(run.tunnel),
        tunnelSeq: run.tunnelSeq ?? 0,
        tunnelOffer: null,
        noisePulses: [],
        activity: normalizeActivity(run.activity, totalGameHour(run.day, run.hour)),
        ghostOffer: null,
        pendingEvent: null,
        shownRoll: null,
        revealTour: null,
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
        bounties: migrateBounties(run.bounties),
        bountiesTaken: Array.isArray(run.bountiesTaken) ? run.bountiesTaken.filter((x): x is string => typeof x === 'string') : [],
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
          for (const inst of orphans) {
            items = addToCarry(items, inst.defId, inst.stack, inst.condition, prepOf(inst)).items;
          }
          set({ items });
        }
      }
      // Keep new entries above anything restored, or React keys collide.
      logCounter = (run.log ?? []).reduce((m, e) => Math.max(m, e.id), logCounter);
      pushLog('You pick up where you left off.', 'info');

      // Synchronize old/overdue objectives before the player spends another turn.
      const operation = get();
      const resumeHour = totalGameHour(operation.day, operation.hour);
      if (operation.evacZoneId && operation.evacDeadline != null && resumeHour >= operation.evacDeadline) {
        beginEvacCooldown();
        persist();
      } else if (operation.evacCooldownUntil != null && resumeHour >= operation.evacCooldownUntil) {
        stageNextEvac();
        persist();
      }

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
