import { create } from 'zustand';
import type {
  BodyParts,
  Character,
  CombatState,
  Equipment,
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
import { maxHpFor, sumTraitMod } from './character';
import { fetchOsmPois, haversine, type RawPoi } from './overpass';
import { bakedPoisNear } from './bakedPois';
import { buildLocations, generateFallbackWorld } from './world';
import { itemDef, rollLoot, type LootStack } from './loot';
import {
  addToGrid,
  canPlace,
  canEquip,
  emptyEquipment,
  findSlot,
  footprint,
  isEncumbered,
  totalLootValue,
} from './inventory';
import {
  applyWound,
  armCombatPenalty,
  checkDeath,
  clampMeter,
  computeScore,
  DEATH_TEXT,
  effectiveMaxHp,
  HOURS_PER_DAY,
  initialBodyParts,
  initialMeters,
  legTravelFactor,
  sleepRestore,
  STARVING_THRESHOLD,
  START_HOUR,
  tickInjuries,
  tickMeters,
  treatInjuries,
  type DeathCause,
} from './survival';
import { rollWeather, timeOfDay, weatherEncounterMod } from './weather';
import { snapshot, travelableRange, VISITED_LIGHT_RADIUS, type ExploredCircle } from './fog';
import { estimateExpedition, estimateMrtTravel } from './travel';
import {
  makeBlockHunter,
  makeHuman,
  makeZombie,
  playerCombatStats,
  resolveRound,
  attemptFlee,
  terrainForCategory,
  TERRAIN,
  STANCES,
} from './combat';
import {
  mrtTollEvent,
  rollCheck,
  rollPreScavengeEvent,
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
import { flavor } from './flavor';
import {
  trekRisk,
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
  FIGHT_HEAT,
  HAZARD_HEAT,
  HUNT_ELITE_CHANCE,
  STAIR_MINUTES,
  updateUnit,
  type HdbArchetype,
  type HdbDungeon,
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
  FIRST_EVAC_WINDOW_HOURS,
  NEXT_EVAC_WINDOW_HOURS,
  HORDE_MAX,
  HORDE_PER_DAY,
  hasEvacKit,
  hordeIntensity,
  pickEvacZone,
  pickNextEvacZone,
} from './goal';

const SCAVENGE_RADIUS = 1500;
const DANGER_DEPLETE = 0.7;
const REGEN_PER_DAY = { small: 0.6, medium: 1.2, large: 2.4 };


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
  mrtTo?: string;
}

/** In-flight walking animation between two points. Purely visual — the clock has
 *  already advanced; arrival logic fires when the glide finishes. */
export interface TravelAnim {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
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

  // extraction goal + doom clock
  hordeLevel: number; // 0..HORDE_MAX; rises each day
  evacZoneId: string | null; // the location you must reach to escape
  evacDeadline: number | null; // absolute game-hour the current evac departs
  escaped: boolean; // true on a victory ending

  maxHp: number; // base max HP; effective max is reduced by injuries
  meters: Meters;
  bodyParts: BodyParts;
  day: number;
  hour: number;

  items: ItemInstance[];
  equipment: Equipment;
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
  /** Live noise rings for the map to draw. */
  noisePulses: NoisePulse[];
  /** A predecessor's ghost waiting to be resolved at this spot. */
  ghostOffer: { kind: 'trader'; wantDefId: string; giveDefId: string } | null;

  pendingEvent: PendingEvent | null;
  _eventRng: Rng | null;

  log: GameLogEntry[];

  deathCause: DeathCause;
  finalScore: number;
  highScores: HighScore[];
  hasSavedRun: boolean;

  // actions
  goToCharacter: () => void;
  commitCharacter: (c: Character) => void;
  setSpawn: (spawn: { lat: number; lng: number; name: string }) => Promise<'ok' | 'remote'>;
  travel: (locationId: string) => void;
  /** Strike out to bare coordinates — no site, no loot, no shelter. */
  trek: (lat: number, lng: number) => void;
  mrtTravel: (toId: string) => void;
  resolveEvent: (choiceId: string) => void;
  callEvac: () => void;
  rest: () => void;
  useItem: (uid: string) => void;
  moveItem: (uid: string, container: string, x: number, y: number, rotated: boolean) => boolean;
  rotateItem: (uid: string) => void;
  transferItem: (uid: string, toContainer: string) => void;
  equipItem: (uid: string, slot: keyof Equipment) => void;
  unequipItem: (slot: keyof Equipment) => void;

  combatStep: () => void;
  combatFlee: () => void;
  combatUseItem: (uid: string) => void;
  combatContinue: () => void;
  /** Commit a stance once — the fight then resolves itself. */
  combatSetStance: (stance: StanceId) => void;
  combatBreakOff: () => void;
  /** Assign (or clear) a quick-belt slot. */
  combatSetBeltSlot: (slot: number, uid: string | null) => void;

  // --- HDB vertical dungeon ---
  hdbEnter: () => void;
  hdbBreach: (unitId: string) => void;
  hdbMove: (level: number) => void;
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
    if (itemsLooted > 0) bumpStats({ itemsLooted, lootValue });
  };

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
      kills: s.kills,
      stats: s.stats,
      log: s.log,
      usedFallback: s.usedFallback,
      exploredArea: s.exploredArea,
      hordeLevel: s.hordeLevel,
      evacZoneId: s.evacZoneId,
      evacDeadline: s.evacDeadline,
      // Snapshot the block you're standing in too, so a reload keeps it cleared.
      hdbBlocks: s.hdb ? { ...s.hdbBlocks, [s.hdb.locationId]: s.hdb } : s.hdbBlocks,
    };
    saveRun(run);
  };

  const endRun = (cause: Exclude<DeathCause, null>) => {
    const s = get();
    const score = computeScore(s.day, s.kills, totalLootValue(s.items));
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
      hasSavedRun: false,
    });
  };

  // Successful extraction — the one and only victory ending.
  const winRun = () => {
    const s = get();
    const score = computeScore(s.day, s.kills, totalLootValue(s.items)) + EVAC_SCORE_BONUS;
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
      hasSavedRun: false,
    });
  };

  // Stage a fresh evac window elsewhere after the last one departed without you.
  const refreshEvac = () => {
    const s = get();
    const nextId = pickNextEvacZone(
      Object.values(s.locations),
      s.currentPos.lat,
      s.currentPos.lng,
      s.evacZoneId,
    );
    const deadline = totalGameHour(s.day, s.hour) + NEXT_EVAC_WINDOW_HOURS;
    set({ evacZoneId: nextId, evacDeadline: deadline });
    const loc = nextId ? s.locations[nextId] : null;
    pushLog(
      loc
        ? `The bird lifted off without you. Comms crackle: new evac staging at ${loc.name} — move.`
        : 'The evac left without you. No new window yet.',
      'bad',
    );
  };

  // Advance clock by `hours`: passive meter drain + location danger regen.
  const advanceTime = (hours: number, restedEnergy?: number, sleeping = false): boolean => {
    const s = get();
    const total = s.hour + hours;
    const day = s.day + Math.floor(total / HOURS_PER_DAY);
    const hour = ((total % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;

    // injuries slowly recover; bleeding parts drain HP instead
    const { parts: bodyParts, bleedDrain } = tickInjuries(s.bodyParts, hours);
    const effMax = effectiveMaxHp(s.maxHp, bodyParts);
    let meters = tickMeters(s.meters, effMax, hours, bleedDrain, { sleeping });
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

    // Time in a block is free — only the noise you make raises its heat.
    set({ hour, day, meters, bodyParts, locations, hordeLevel });

    // warn once, on the way down, so the HP bleed isn't a silent surprise
    if (s.meters.thirst >= STARVING_THRESHOLD && meters.thirst < STARVING_THRESHOLD) {
      pushLog('Your throat is raw. Find water — this is costing you blood now.', 'bad');
    }
    if (s.meters.hunger >= STARVING_THRESHOLD && meters.hunger < STARVING_THRESHOLD) {
      pushLog('Hunger cramps set in. Your body is eating itself.', 'bad');
    }

    const cause = checkDeath(meters, bodyParts);
    if (cause) {
      endRun(cause);
      return true;
    }
    if (hordeLevel >= HORDE_MAX) {
      endRun('overrun');
      return true;
    }
    // Missed the current evac window? Stage a fresh one further out.
    const now = totalGameHour(day, hour);
    const g = get();
    if (g.evacZoneId && g.evacDeadline != null && now >= g.evacDeadline && !g.escaped) {
      refreshEvac();
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

  const hasBackpackItem = (defId: string): boolean =>
    get().items.some((i) => i.container === 'backpack' && i.defId === defId);

  const consumeBackpackItem = (defId: string) => {
    const items = get().items;
    const idx = items.findIndex((i) => i.container === 'backpack' && i.defId === defId);
    if (idx < 0) return;
    const inst = items[idx];
    const next =
      inst.stack > 1
        ? items.map((i) => (i.uid === inst.uid ? { ...i, stack: i.stack - 1 } : i))
        : items.filter((i) => i.uid !== inst.uid);
    set({ items: next });
  };

  // Grant a search's loot into the backpack, deplete danger, spend a search.
  const resolveSearch = (locationId: string, fled: boolean) => {
    const s = get();
    const loc = s.locations[locationId];
    if (!loc) return;

    // searching takes time
    const searchMinHours = (12 + POI_CONFIG[loc.category].richness * 6) / 60;
    if (advanceTime(searchMinHours)) return;

    const s2 = get();
    const loc2 = s2.locations[locationId];
    const lootRng = new Rng(s2.seed).fork(`loot:${loc2.id}:${loc2.remainingSearches}`);
    const lootMod = sumTraitMod(s2.character!.traitIds, 'lootMod');
    const perceptionBonus = Math.floor((s2.character!.attributes.perception - 5) / 2);
    const loot = rollLoot(
      lootRng,
      loc2.category,
      POI_CONFIG[loc2.category].richness,
      lootMod + perceptionBonus,
    );

    // place loot into backpack
    let items = s2.items;
    const leftover: LootStack[] = [];
    for (const stack of loot) {
      const r = addToGrid(items, 'backpack', stack.defId, stack.count);
      items = r.items;
      if (r.leftover > 0) leftover.push({ defId: stack.defId, count: r.leftover });
    }

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
    updated.lastSeen = snapshot(updated); // you're here — memory is current
    const locations = { ...s2.locations, [locationId]: updated };

    set({ items, locations });
    bumpStats({ poisSearched: 1 });
    bumpHaul(loot, leftover);
    if (loot.length === 0) {
      pushLog(flavor('searchEmpty', { name: loc2.name }), 'info');
    } else {
      pushLog(
        fled ? `Grabbed what you could from ${loc2.name}.` : flavor('searchFound', { name: loc2.name }),
        'good',
        { loot, leftover },
      );
    }
    persist();
  };

  /** Auto-slot the three most useful carried consumables into the quick belt. */
  const initialQuickBelt = (): (string | null)[] => {
    const PRIORITY = ['heal', 'cure', 'water', 'food', 'energy'];
    const carried = get()
      .items.filter((i) => i.container === 'backpack')
      .filter((i) => PRIORITY.includes(itemDef(i.defId).effect.kind))
      .sort(
        (a, b) =>
          PRIORITY.indexOf(itemDef(a.defId).effect.kind) -
          PRIORITY.indexOf(itemDef(b.defId).effect.kind),
      );
    const slots: (string | null)[] = [null, null, null];
    const seen = new Set<string>();
    let n = 0;
    for (const inst of carried) {
      if (n >= 3 || seen.has(inst.defId)) continue;
      seen.add(inst.defId);
      slots[n++] = inst.uid;
    }
    return slots;
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
      playerHpSnapshot: s.meters.health,
      context: {
        locationId,
        grantOnFlee,
        drops: opts.drops,
        hdbUnit: opts.hdbUnit,
        hdbStairs: opts.hdbStairs,
      },
      selectedStance: 'guarded',
      terrain: opts.terrainOverride ? TERRAIN[opts.terrainOverride] : terrainForCategory(loc.category),
      quickBeltItems: initialQuickBelt(),
      awaitingStance: true,
    };
    set({ combat, _combatRng: encRng.fork('fight') });
  };

  const HUMAN_DROPS: Record<Exclude<FactionId, null>, string[]> = {
    syndicate_88: ['parang', 'jewellery', 'painkillers'],
    idtf: ['ammo_box', 'kevlar_vest', 'bandage'],
    pasir_panjang: ['hawker_meal', 'kitchen_knife', 'canned_food'],
    sta: ['torch', 'batteries', 'soft_drink'],
  };

  const startHumanCombat = (
    locationId: string,
    faction: Exclude<FactionId, null>,
    grantOnFlee: boolean,
  ) => {
    const s = get();
    const loc = s.locations[locationId];
    const humanRng = new Rng(s.seed).fork(`human:${loc.id}:${s.day}`);
    const enemy = makeHuman(humanRng, faction, Math.round(loc.currentDanger));
    const pool = HUMAN_DROPS[faction];
    const drops = humanRng.chance(0.7) ? [humanRng.pick(pool)] : [];
    const combat: CombatState = {
      locationId,
      zombie: enemy,
      round: 0,
      log: [{ round: 0, tone: 'bad', text: `The ${enemy.name} draws on you!` }],
      over: false,
      outcome: null,
      playerHpSnapshot: s.meters.health,
      context: { locationId, grantOnFlee, drops },
      selectedStance: 'guarded',
      terrain: terrainForCategory(loc.category),
      quickBeltItems: initialQuickBelt(),
      awaitingStance: true,
    };
    set({ combat, _combatRng: humanRng.fork('fight') });
  };

  // Roll the encounter chance for searching a location right now.
  const attemptSearch = (locationId: string) => {
    const s = get();
    const loc = s.locations[locationId];
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
    encChance = Math.max(0.02, Math.min(0.95, encChance));

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
    const loot = rollLoot(rng, 'residential', 3 + lootMod, lootMod);
    let items = s.items;
    const leftover: LootStack[] = [];
    for (const stack of loot) {
      const r = addToGrid(items, 'backpack', stack.defId, stack.count);
      items = r.items;
      if (r.leftover > 0) leftover.push({ defId: stack.defId, count: r.leftover });
    }
    const hdb = updateUnit(s.hdb, level, unitId, { state: 'cleared' });
    set({ items, hdb, hdbBlocks: { ...s.hdbBlocks, [hdb.locationId]: hdb } });
    bumpStats({ hdbUnitsCleared: 1 });
    bumpHaul(loot, leftover);
    const label = unit?.label ?? 'the unit';
    pushLog(
      loot.length ? `You clear ${label}.` : `${label} is bare.`,
      loot.length ? 'good' : 'info',
      loot.length ? { loot, leftover } : undefined,
    );
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
        playerHpSnapshot: s2.meters.health,
        context: { locationId: loc.id, grantOnFlee: false, roadAmbush: true },
        selectedStance: 'guarded',
        terrain: terrainForCategory(loc2.category, true),
        quickBeltItems: initialQuickBelt(),
        awaitingStance: true,
      };
      set({ combat, _combatRng: fightRng.fork('fight') });
      return;
    }

    // Did a previous run end on this doorstep? Something is still here.
    if (resolveGhost(loc2)) return;

    const eventRng = new Rng(s2.seed).fork(`event:${loc.id}:${s2.day}:${loc2.remainingSearches}`);
    const event = rollPreScavengeEvent(eventRng, loc2);
    if (event) {
      set({ pendingEvent: { locationId: loc.id, event }, _eventRng: eventRng });
      return;
    }
    attemptSearch(loc.id);
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
      exploredArea: [...st.exploredArea, { lat, lng, radius: TREK_LIGHT_RADIUS }],
    }));
    pushLog(flavor('trekArrive'), 'info');

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
    const enemy = human
      ? makeHuman(fightRng, 'syndicate_88', pending.danger)
      : makeZombie(fightRng, pending.danger);
    const drops =
      human && fightRng.chance(0.7) ? [fightRng.pick(HUMAN_DROPS.syndicate_88)] : undefined;

    const combat: CombatState = {
      locationId: null,
      zombie: enemy,
      round: 0,
      log: [{ round: 0, tone: 'bad', text: `${enemy.name} closes in across the open!` }],
      over: false,
      outcome: null,
      playerHpSnapshot: s.meters.health,
      // No site to search and none to flee into — win or run, you're still
      // standing in the same empty street afterwards.
      context: { locationId: null, grantOnFlee: false, wilds: true, drops },
      selectedStance: 'guarded',
      terrain: TERRAIN.open_ground,
      quickBeltItems: initialQuickBelt(),
      awaitingStance: true,
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
    hordeLevel: 0,
    evacZoneId: null,
    evacDeadline: null,
    escaped: false,
    maxHp: 100,
    meters: initialMeters(100),
    bodyParts: initialBodyParts(),
    day: 1,
    hour: START_HOUR,
    items: [],
    equipment: emptyEquipment(),
    kills: 0,
    stats: emptyRunStats(),
    exploredArea: [],
    combat: null,
    _combatRng: null,
    hdb: null,
    hdbBlocks: {},
    noisePulses: [],
    ghostOffer: null,
    pendingEvent: null,
    _eventRng: null,
    log: [],
    deathCause: null,
    finalScore: 0,
    highScores: loadHighScores(),
    hasSavedRun: !!loadRun(),

    goToCharacter: () => set({ phase: 'character' }),

    commitCharacter: (c) => {
      const maxHp = maxHpFor(c);
      set({
        character: c,
        maxHp,
        meters: initialMeters(maxHp),
        bodyParts: initialBodyParts(),
        phase: 'spawn',
        day: 1,
        hour: START_HOUR,
        items: [],
        equipment: emptyEquipment(),
        kills: 0,
        stats: emptyRunStats(),
        log: [],
      });
    },

    setSpawn: async (spawn) => {
      const seed = randomSeed();
      const rng = new Rng(seed);

      // Map data, in order of preference:
      //   1. the pre-baked island-wide set (static file, can't rate-limit us)
      //   2. a live Overpass call, if the bake is missing or malformed
      //   3. a simulated neighbourhood, if both are unavailable
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

      let list: LocationState[];
      let usedFallback = false;
      let worldError: string | null = null;
      if (raw) {
        // Real data but almost nothing nearby means the spot is genuinely
        // remote (sea/forest/reserve) — reject so the player can pick again.
        if (raw.length < 5) return 'remote';
        list = buildLocations(rng, spawn, raw);
      } else {
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
      });
      pushLog(
        flavor(usedFallback ? 'wakeOffline' : 'wake', { name: spawn.name }),
        'info',
      );

      const locations: Record<string, LocationState> = {};
      for (const l of list) locations[l.id] = l;

      // Designate the extraction zone (far-off POI), open its window, and reset
      // the doom clock.
      const evacZoneId = pickEvacZone(list);
      const evacDeadline = totalGameHour(1, START_HOUR) + FIRST_EVAC_WINDOW_HOURS;
      set({ hordeLevel: 0, evacZoneId, evacDeadline, escaped: false });
      const evacLoc = evacZoneId ? locations[evacZoneId] : null;
      if (evacLoc) {
        pushLog(
          `Radio static, then a voice: "Evac staging at ${evacLoc.name}. Bring fuel, a medkit, ammo — and hurry. We hold the window ${FIRST_EVAC_WINDOW_HOURS} hours, no more."`,
          'good',
        );
      }

      // starting gear: a knife equipped, plus water & snacks in the pack
      let items: ItemInstance[] = [];
      items = addToGrid(items, 'backpack', 'water_bottle', 1).items;
      items = addToGrid(items, 'backpack', 'snacks', 2).items;
      const knifeSlot = findSlot('backpack', items, itemDef('kitchen_knife'));
      const equipment = emptyEquipment();
      equipment.mainHand = {
        uid: `equip_knife`,
        defId: 'kitchen_knife',
        container: 'equip:mainHand',
        x: 0,
        y: 0,
        rotated: false,
        stack: 1,
      };
      void knifeSlot;

      set({ locations, items, equipment });
      persist();
      return 'ok';
    },

    travel: (locationId) => {
      const s = get();
      const loc = s.locations[locationId];
      if (!loc || s.combat || s.pendingEvent || s.travelAnim) return;
      if (s.meters.energy < 5) {
        pushLog('Too exhausted to move out. Rest first.', 'bad');
        return;
      }

      const weather = weatherKindFor(s.seed, s.day);
      const encumbered = isEncumbered(s.items, s.character!.attributes, s.equipment);

      const dist = Math.round(haversine(s.currentPos.lat, s.currentPos.lng, loc.lat, loc.lng));

      // You can only push so far in one go. Beyond your current range you must
      // hop via a closer waypoint, rest to recover, or ride the MRT.
      const range = travelableRange(
        s.character!.attributes,
        s.meters.energy,
        legTravelFactor(s.bodyParts),
        weather,
        encumbered,
      );
      if (dist > range) {
        pushLog(
          `${loc.name} is ${dist} m off — too far to reach in one push (range ${range} m). Rest, hop closer, or take the MRT.`,
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
        legTravelFactor(s.bodyParts),
      );

      // Advance the in-game clock for the trip up front (search time is spent
      // later, on searching). Bail if the survivor dies en route.
      if (advanceTime(est.travelMin / 60)) return;
      bumpStats({ distanceM: dist });

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
        p += weatherEncounterMod(weather);
        p = Math.max(0, Math.min(0.6, p));

        const encRng = new Rng(now.seed).fork(`road:${loc.id}:${now.day}:${Math.round(now.hour)}`);
        if (encRng.chance(p)) {
          const kind = encRng.weighted([
            ['ambush', 55],
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
          toId: loc.id,
          startedAt: Date.now(),
          durationMs,
        },
      });
      setTimeout(() => arriveAt(loc.id), durationMs);
    },

    // Walk out to bare coordinates. This is the release valve on a sparse map:
    // wherever the pins thin out, the streets between them are still walkable,
    // so no survivor is ever boxed in by the POI data. It is deliberately the
    // worse option — no loot, no stash, no roof, and the hazard field bites.
    trek: (lat, lng) => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim) return;
      if (s.meters.energy < 5) {
        pushLog('Too exhausted to move out. Rest first.', 'bad');
        return;
      }

      const from = s.currentPos;
      const dist = Math.round(haversine(from.lat, from.lng, lat, lng));
      if (dist < TREK_MIN_DISTANCE_M) {
        pushLog('That\'s a few steps, not a move. Pick somewhere worth the walk.', 'info');
        return;
      }

      const weather = weatherKindFor(s.seed, s.day);
      const encumbered = isEncumbered(s.items, s.character!.attributes, s.equipment);

      // Open ground obeys the same one-push limit as everything else — it's an
      // escape hatch from bad geometry, not from the stamina economy.
      const range = travelableRange(
        s.character!.attributes,
        s.meters.energy,
        legTravelFactor(s.bodyParts),
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
        legTravelFactor(s.bodyParts),
      );
      if (advanceTime(est.travelMin / 60)) return;
      bumpStats({ distanceM: dist });

      const now = get();
      const risk = trekRisk(now.seed, from, { lat, lng }, {
        band: timeOfDay(now.hour),
        hordeIntensity: hordeIntensity(now.hordeLevel),
        weatherEncounterMod: weatherEncounterMod(weather),
        traitEncounterMod: sumTraitMod(now.character!.traitIds, 'encounterChanceMod'),
        safe: now.spawn ?? undefined,
      });

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
          toId: null,
          startedAt,
          durationMs,
        },
      });
      setTimeout(() => arriveWilds(lat, lng, startedAt), durationMs);
    },

    mrtTravel: (toId) => {
      const s = get();
      const from = s.currentPositionId ? s.locations[s.currentPositionId] : null;
      const to = s.locations[toId];
      if (!from || !to || s.combat || s.pendingEvent) return;
      if (!from.isMrtStation || !to.isMrtStation) {
        pushLog('You must be at an MRT station to ride the tunnels.', 'bad');
        return;
      }
      if (!from.cleared || !to.cleared) {
        pushLog('Both stations must be cleared before the tunnel is safe.', 'bad');
        return;
      }
      set({ pendingEvent: { locationId: from.id, event: mrtTollEvent(), mrtTo: toId } });
    },

    callEvac: () => {
      const s = get();
      if (s.combat || s.pendingEvent || s.travelAnim) return;
      if (!s.evacZoneId || s.currentPositionId !== s.evacZoneId) {
        pushLog('You need to be at the evac zone to signal for a lift.', 'bad');
        return;
      }
      if (!hasEvacKit(s.items)) {
        pushLog('The evac crew won\'t launch without the full kit: fuel, a medkit, and ammo.', 'bad');
        return;
      }
      pushLog('You pop the flare. Rotors thunder over the rooftops — they came.', 'good');
      winRun();
    },

    resolveEvent: (choiceId) => {
      const s = get();
      const pe = s.pendingEvent;
      if (!pe) return;
      const ev = pe.event;
      const choice = ev.choices.find((c) => c.id === choiceId);
      if (!choice) return;
      const loc = s.locations[pe.locationId];
      const rng = s._eventRng ?? new Rng(s.seed).fork(`ev2:${pe.locationId}:${s.day}`);
      set({ pendingEvent: null, _eventRng: null });

      const grantAccess = () => {
        if (pe.mrtTo) {
          // MRT fast travel through the tunnels
          const to = get().locations[pe.mrtTo];
          const cur = get();
          const dist = Math.round(haversine(cur.currentPos.lat, cur.currentPos.lng, to.lat, to.lng));
          const mrt = estimateMrtTravel(
            dist,
            cur.character!.attributes,
            cur.meters.energy,
            cur.hour,
            legTravelFactor(cur.bodyParts),
          );
          if (advanceTime(mrt.totalHours)) return;
          set({ currentPos: { lat: to.lat, lng: to.lng }, currentPositionId: to.id });
          discoverLocation(to.id);
          pushLog(`You ride the tunnels to ${to.name} (weather ignored).`, 'good');
          persist();
        } else {
          attemptSearch(pe.locationId);
        }
      };

      const fightOut = () => {
        if (ev.factionId && ev.factionId !== 'sta') {
          startHumanCombat(pe.locationId, ev.factionId, false);
        } else {
          startHumanCombat(pe.locationId, 'syndicate_88', false);
        }
      };

      switch (choice.kind) {
        case 'leave':
          pushLog('You back off.', 'info');
          persist();
          break;
        case 'pay':
          if (choice.itemId && hasBackpackItem(choice.itemId)) {
            consumeBackpackItem(choice.itemId);
            pushLog(`Paid 1× ${itemDef(choice.itemId).name}.`, 'info');
            grantAccess();
          } else {
            pushLog("You don't have what they want.", 'bad');
            if (ev.hostile) fightOut();
            else persist();
          }
          break;
        case 'fight':
          fightOut();
          break;
        case 'check': {
          const attrVal = s.character!.attributes[choice.attr!];
          const res = rollCheck(rng, attrVal, choice.dc!);
          pushLog(
            `${choice.label.split(' (')[0]} — d20 ${res.roll}+${attrVal}=${res.total} vs ${res.dc}: ${res.success ? 'success' : 'failure'}`,
            res.success ? 'good' : 'bad',
          );
          if (res.success) {
            grantAccess();
          } else if (ev.kind === 'locked_door') {
            startZombieCombat(pe.locationId, false); // the noise draws the dead
            pushLog('The racket draws something out.', 'bad');
          } else if (ev.hostile || FACTION_HOSTILE(ev.factionId, loc)) {
            fightOut();
          } else {
            pushLog('They turn you away.', 'bad');
            persist();
          }
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
      const restedEnergy = exposed
        ? Math.round(s.meters.energy + (sleepRestore(s.meters.energy, hoursToMorning) - s.meters.energy) * EXPOSED_SLEEP_RECOVERY)
        : sleepRestore(s.meters.energy, hoursToMorning);
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
          traitEncounterMod: sumTraitMod(g.character!.traitIds, 'encounterChanceMod'),
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
              playerHpSnapshot: g.meters.health,
              context: { locationId: null, grantOnFlee: false, wilds: true },
              selectedStance: 'guarded',
              terrain: TERRAIN.open_ground,
              quickBeltItems: initialQuickBelt(),
              awaitingStance: true,
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
      const inst = s.items.find((i) => i.uid === uid);
      if (!inst) return;
      const def = itemDef(inst.defId);
      const healBonus = sumTraitMod(s.character!.traitIds, 'healBonus');
      const foodEffectMod = sumTraitMod(s.character!.traitIds, 'foodEffectMod');
      const m = { ...s.meters };
      let newBodyParts = s.bodyParts;
      let consumed = false;
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
          newBodyParts = treatInjuries(
            s.bodyParts,
            def.effect.partHeal ?? 0,
            def.effect.stopsBleeding,
          );
          const effMax = effectiveMaxHp(s.maxHp, newBodyParts);
          m.health = Math.min(effMax, m.health + def.effect.health + healBonus);
          consumed = true;
          pushLog(
            def.effect.stopsBleeding
              ? `Used ${def.name}. Bleeding stopped, wound dressed.`
              : `Used ${def.name}. Patched up.`,
            'good',
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
        default:
          pushLog(`${def.name} can't be used directly.`, 'info');
      }
      if (consumed) {
        set({ meters: m, bodyParts: newBodyParts, items: consumeOne(s.items, uid) });
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
      set({ combat: { ...s.combat, selectedStance: stance, awaitingStance: false } });
      // Disengage resolves as a break-away attempt rather than a trade of blows.
      // Anything else commits: the fight then plays itself out round by round.
      if (stance === 'disengage') get().combatFlee();
      else get().combatStep();
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
      // A block you've already worked keeps its state — cleared units stay cleared.
      // Blocks saved before the stairwells existed have no topology to restore,
      // so they get rebuilt rather than loaded into a UI that would crash on them.
      const stored = s.hdbBlocks[loc.id];
      const saved = stored?.risers?.length ? stored : null;
      if (saved) {
        // The block settles while you're gone, but it doesn't forget entirely.
        set({
          hdb: {
            ...saved,
            currentLevel: 1,
            moveSeq: saved.moveSeq ?? 0,
            blockHeat: saved.blockHeat / 2,
            floors: saved.floors.map((f) => ({ ...f, heatLevel: f.heatLevel / 2 })),
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
          : `You slip into the stairwell of ${loc.name}. The shaft goes up into the dark.`,
        'info',
      );
      sweepFloor(1);
    },

    hdbBreach: (unitId) => {
      const s = get();
      if (!s.hdb || s.combat) return;
      const level = s.hdb.currentLevel;
      const unit = currentFloor(s.hdb).units.find((u) => u.id === unitId);
      // A unit you've already finished is done — no second sweep, no second fight.
      if (!unit || unit.state === 'cleared') return;

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
        const meters = { ...get().meters, health: Math.max(0, get().meters.health - dmg) };
        // A hazard going off is its own kind of noise.
        const hot = get().hdb;
        set({ meters, ...(hot ? { hdb: addHeat(hot, HAZARD_HEAT, level) } : {}) });
        pushLog(`${outcome.hazard} — it costs you ${dmg} health.`, 'bad');
        const cause = checkDeath(meters, get().bodyParts);
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

    hdbMove: (level) => {
      const s = get();
      if (!s.hdb || s.combat) return;
      const from = s.hdb.currentLevel;
      if (level === from) return;
      const descending = level < from;

      // Every stairwell attempt gets its own roll. Without this the same seed
      // came up after the fight a failed roll caused, locking the player on
      // the floor: fail, fight, win, fail again, forever.
      const seq = (s.hdb.moveSeq ?? 0) + 1;
      set({ hdb: { ...s.hdb, moveSeq: seq } });

      // A hunting block owns the stairwell in both directions — this fires
      // before the descent check, since being caught mid-flight is the point.
      if (isHunting(s.hdb)) {
        const huntRng = new Rng(s.seed).fork(
          `hunt:${s.hdb.locationId}:${from}:${level}:${s.day}:${seq}`,
        );
        if (huntRng.chance(HUNT_ELITE_CHANCE)) {
          if (advanceTime(STAIR_MINUTES / 60)) return;
          const g = get();
          if (!g.hdb) return;
          pushLog('The stairwell is not empty. It has been waiting.', 'bad');
          startZombieCombat(g.hdb.locationId, false, {
            terrainOverride: 'hdb_corridor',
            enemy: makeBlockHunter(huntRng, floorThreat(g.hdb, from)),
            intro: 'It fills the landing shoulder to shoulder.',
            hdbStairs: true,
          });
          return;
        }
        pushLog('You take the stairs in silence. Nothing follows — this time.', 'info');
      }

      // Climbing is just slow. Going back down through a woken block is a check.
      if (descending && descentIsChecked(s.hdb)) {
        const rng = new Rng(s.seed).fork(
          `retreat:${s.hdb.locationId}:${from}:${s.day}:${seq}`,
        );
        const check = retreatCheck(rng, s.character!.attributes, s.hdb);
        pushLog(
          `Stairwell descent — d20 ${check.roll}+${s.character!.attributes.dexterity + s.character!.attributes.endurance} = ${check.total} vs DC ${check.dc}`,
          check.success ? 'good' : 'bad',
        );
        if (!check.success) {
          if (advanceTime(STAIR_MINUTES / 60)) return;
          const g = get();
          pushLog('Something comes up the stairs to meet you.', 'bad');
          startZombieCombat(g.hdb!.locationId, false, {
            terrainOverride: 'hdb_corridor',
            danger: floorThreat(g.hdb!, from),
            intro: 'Cut off on the landing.',
            hdbStairs: true,
          });
          return;
        }
      }

      if (advanceTime((STAIR_MINUTES * Math.abs(level - from)) / 60)) return;
      const g = get();
      if (!g.hdb) return;
      set({
        hdb: {
          ...g.hdb,
          currentLevel: level,
          visited: g.hdb.visited.includes(level) ? g.hdb.visited : [...g.hdb.visited, level],
        },
      });
      sweepFloor(level);
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
      if (!unit?.service) return;

      if (unit.service === 'safe_bunk') {
        const restored = sleepRestore(s.meters.energy, 6);
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
        const meters = { ...g.meters, health: Math.min(effectiveMaxHp(g.maxHp, bodyParts), g.meters.health + 25) };
        set({ bodyParts, meters });
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

    combatSetBeltSlot: (slot, uid) => {
      const s = get();
      if (!s.combat || slot < 0 || slot > 2) return;
      const quickBeltItems = s.combat.quickBeltItems.map((v, i) =>
        i === slot ? uid : v === uid ? null : v,
      );
      set({ combat: { ...s.combat, quickBeltItems } });
    },

    combatStep: () => {
      const s = get();
      if (!s.combat || s.combat.over || !s._combatRng) return;
      const pStats = playerCombatStats(
        s.character!.attributes,
        s.character!.traitIds,
        s.equipment,
        armCombatPenalty(s.bodyParts),
      );
      const round = s.combat.round + 1;
      const weather = { kind: weatherKindFor(s.seed, s.day), time: timeOfDay(s.hour) };

      const stance = STANCES[s.combat.selectedStance];
      const res = resolveRound(
        s._combatRng,
        pStats,
        s.combat.zombie,
        weather,
        round,
        stance,
        s.combat.terrain,
      );
      const bodyParts =
        res.playerDamage > 0
          ? applyWound(
              s.bodyParts,
              res.playerDamage,
              s._combatRng.fork(`wound:${round}`),
              res.limbDamageMult,
            )
          : s.bodyParts;
      const effMax = effectiveMaxHp(s.maxHp, bodyParts);
      const newHealth = Math.min(effMax, Math.max(0, s.meters.health - res.playerDamage));
      const newInfection = clampMeter(s.meters.infection + res.infectionGain);
      const meters: Meters = { ...s.meters, health: newHealth, infection: newInfection };
      const zombie = { ...s.combat.zombie, hp: res.zombieHpAfter };
      const log = [...s.combat.log, ...res.log];
      const dead = checkDeath(meters, bodyParts) !== null;

      if (res.zombieDead && !dead) {
        set({ meters, bodyParts, combat: { ...s.combat, zombie, round, log, over: true, outcome: 'win' }, kills: s.kills + 1 });
        bumpStats(zombie.kind === 'human' ? { humanKills: 1 } : { zombieKills: 1 });
        if (res.timeCostHours > 0) advanceTime(res.timeCostHours);
        return;
      }
      if (dead) {
        set({ meters, bodyParts, combat: { ...s.combat, zombie, round, log, over: true, outcome: 'dead' } });
        return;
      }
      set({
        meters,
        bodyParts,
        combat: { ...s.combat, zombie, round, log },
      });

      // Gunfire in an echoing space is heard for streets around.
      if (res.dangerNoise > 0) {
        const g = get();
        get().emitNoise(g.currentPos.lat, g.currentPos.lng, 350 * res.dangerNoise, res.dangerNoise);
      }
      if (res.timeCostHours > 0) advanceTime(res.timeCostHours);
    },

    combatFlee: () => {
      const s = get();
      if (!s.combat || s.combat.over || !s._combatRng) return;
      const pStats = playerCombatStats(
        s.character!.attributes,
        s.character!.traitIds,
        s.equipment,
        armCombatPenalty(s.bodyParts),
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
      );
      const bodyParts =
        res.playerDamage > 0
          ? applyWound(
              s.bodyParts,
              res.playerDamage,
              s._combatRng.fork(`flee:${round}`),
              res.limbDamageMult,
            )
          : s.bodyParts;
      const effMax = effectiveMaxHp(s.maxHp, bodyParts);
      const newHealth = Math.min(effMax, Math.max(0, s.meters.health - res.playerDamage));
      const meters: Meters = { ...s.meters, health: newHealth };
      const log = [...s.combat.log, ...res.log];
      const dead = checkDeath(meters, bodyParts) !== null;
      if (res.success && !dead) {
        set({ meters, bodyParts, combat: { ...s.combat, round, log, over: true, outcome: 'flee' } });
        bumpStats({ fightsFled: 1 });
      } else if (dead) {
        set({ meters, bodyParts, combat: { ...s.combat, round, log, over: true, outcome: 'dead' } });
      } else {
        set({ meters, bodyParts, combat: { ...s.combat, round, log } });
      }
    },

    combatUseItem: (uid) => {
      const before = get().items.find((i) => i.uid === uid);
      const name = before ? itemDef(before.defId).name : 'something';
      get().useItem(uid);
      const s = get();
      if (!s.combat || s.combat.over) return;
      // A spent stack vacates its belt slot.
      const gone = !s.items.some((i) => i.uid === uid);
      set({
        combat: {
          ...s.combat,
          quickBeltItems: gone
            ? s.combat.quickBeltItems.map((v) => (v === uid ? null : v))
            : s.combat.quickBeltItems,
          log: [
            ...s.combat.log,
            { round: s.combat.round, tone: 'player', text: `You use ${name} mid-fight.` },
          ],
        },
      });
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

      if (context.hdbUnit) {
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
        hordeLevel: 0,
        evacZoneId: null,
        evacDeadline: null,
        escaped: false,
        combat: null,
        _combatRng: null,
        hdb: null,
        hdbBlocks: {},
        noisePulses: [],
        ghostOffer: null,
        pendingEvent: null,
        _eventRng: null,
        log: [],
        stats: emptyRunStats(),
        hasSavedRun: !!loadRun(),
        highScores: loadHighScores(),
      });
    },

    continueRun: () => {
      const run = loadRun();
      if (!run) return;
      set({
        phase: 'game',
        character: run.character,
        seed: run.seed,
        spawn: run.spawn,
        locations: run.locations,
        currentPositionId: run.currentPositionId,
        currentPos: run.currentPos,
        equipment: run.equipment,
        bodyParts: run.bodyParts ?? initialBodyParts(),
        meters: run.meters,
        maxHp: run.maxHp,
        day: run.day,
        hour: run.hour,
        items: run.items,
        kills: run.kills,
        stats: normalizeRunStats(run.stats),
        usedFallback: run.usedFallback,
        exploredArea: run.exploredArea ?? [],
        hordeLevel: run.hordeLevel ?? 0,
        evacZoneId: run.evacZoneId ?? pickEvacZone(Object.values(run.locations)),
        evacDeadline:
          run.evacDeadline ?? totalGameHour(run.day, run.hour) + FIRST_EVAC_WINDOW_HOURS,
        escaped: false,
        travelAnim: null,
        worldLoading: false,
        worldError: null,
        combat: null,
        _combatRng: null,
        hdb: null,
        hdbBlocks: run.hdbBlocks ?? {},
        noisePulses: [],
        ghostOffer: null,
        pendingEvent: null,
        _eventRng: null,
        // The timeline is the run's memory — a resumed run keeps every day of it.
        log: run.log ?? [],
      });
      // Keep new entries above anything restored, or React keys collide.
      logCounter = (run.log ?? []).reduce((m, e) => Math.max(m, e.id), logCounter);
      pushLog('You pick up where you left off.', 'info');
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

function FACTION_HOSTILE(faction: FactionId, _loc: LocationState): boolean {
  return faction === 'syndicate_88';
}

// Dev/debug handle — lets tooling inspect the live store without fighting
// HMR module identity. Harmless in production.
if (typeof window !== 'undefined') {
  (window as unknown as { __game?: typeof useGame }).__game = useGame;
}
