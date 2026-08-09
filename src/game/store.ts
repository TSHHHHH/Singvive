import { create } from 'zustand';
import type {
  BodyParts,
  Character,
  CombatState,
  Equipment,
  FactionId,
  GamePhase,
  HighScore,
  ItemInstance,
  LocationState,
  Meters,
} from './types';
import { Rng, randomSeed } from './rng';
import { maxHpFor, sumTraitMod } from './character';
import { fetchOsmPois, haversine } from './overpass';
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
  START_HOUR,
  tickInjuries,
  tickMeters,
  treatInjuries,
  type DeathCause,
} from './survival';
import { rollWeather, timeOfDay, weatherEncounterMod } from './weather';
import { snapshot, travelableRange, VISITED_LIGHT_RADIUS, type ExploredCircle } from './fog';
import { estimateExpedition, estimateMrtTravel } from './travel';
import { makeHuman, makeZombie, playerCombatStats, resolveRound, attemptFlee } from './combat';
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

export interface ScavengeResult {
  poiName: string;
  loot: LootStack[];
  leftover: LootStack[];
  fled: boolean;
}

export interface GameLogEntry {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
  day: number;
  hour: number;
}

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
  toId: string;
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
  exploredArea: ExploredCircle[];

  combat: CombatState | null;
  _combatRng: Rng | null;

  pendingEvent: PendingEvent | null;
  _eventRng: Rng | null;

  scavengeResult: ScavengeResult | null;
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
  clearScavengeResult: () => void;

  combatStep: () => void;
  combatFlee: () => void;
  combatUseItem: (uid: string) => void;
  combatContinue: () => void;

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
  const pushLog = (text: string, tone: GameLogEntry['tone']) => {
    logCounter += 1;
    const { day, hour } = get();
    set((s) => ({ log: [{ id: logCounter, text, tone, day, hour }, ...s.log].slice(0, 40) }));
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
      usedFallback: s.usedFallback,
      exploredArea: s.exploredArea,
      hordeLevel: s.hordeLevel,
      evacZoneId: s.evacZoneId,
      evacDeadline: s.evacDeadline,
    };
    saveRun(run);
  };

  const endRun = (cause: Exclude<DeathCause, null>) => {
    const s = get();
    const score = computeScore(s.day, s.kills, totalLootValue(s.items));
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
  const advanceTime = (hours: number, restedEnergy?: number): boolean => {
    const s = get();
    const total = s.hour + hours;
    const day = s.day + Math.floor(total / HOURS_PER_DAY);
    const hour = ((total % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;

    // injuries slowly recover; bleeding parts drain HP instead
    const { parts: bodyParts, bleedDrain } = tickInjuries(s.bodyParts, hours);
    const effMax = effectiveMaxHp(s.maxHp, bodyParts);
    let meters = tickMeters(s.meters, effMax, hours, bleedDrain);
    if (restedEnergy != null) meters = { ...meters, energy: restedEnergy };

    // danger creeps back toward baseDanger, faster for larger locations
    const locations: Record<string, LocationState> = {};
    for (const [id, loc] of Object.entries(s.locations)) {
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

    set({ hour, day, meters, bodyParts, locations, hordeLevel });

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

    set({
      items,
      locations,
      scavengeResult: { poiName: loc2.name, loot, leftover, fled },
    });
    if (loot.length === 0) pushLog(flavor('searchEmpty', { name: loc2.name }), 'info');
    else pushLog(flavor('searchFound', { name: loc2.name }), 'good');
    persist();
  };

  const startZombieCombat = (locationId: string, grantOnFlee: boolean) => {
    const s = get();
    const loc = s.locations[locationId];
    const encRng = new Rng(s.seed).fork(`enc:${loc.id}:${s.day}:${loc.remainingSearches}`);
    const zombie = makeZombie(encRng, Math.round(loc.currentDanger), loc.category);
    const combat: CombatState = {
      locationId,
      zombie,
      round: 0,
      log: [
        {
          round: 0,
          tone: 'info',
          text: `A ${zombie.name} lurches out of the ${POI_CONFIG[loc.category].label.toLowerCase()}!`,
        },
      ],
      over: false,
      outcome: null,
      playerHpSnapshot: s.meters.health,
      context: { locationId, grantOnFlee },
    };
    set({ combat, _combatRng: encRng.fork('fight'), phase: 'combat' });
  };

  const HUMAN_DROPS: Record<Exclude<FactionId, null>, string[]> = {
    raiders: ['parang', 'jewellery', 'painkillers'],
    saf: ['ammo_box', 'kevlar_vest', 'bandage'],
    hawker: ['hawker_meal', 'kitchen_knife', 'canned_food'],
    transit: ['torch', 'batteries', 'soft_drink'],
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
    };
    set({ combat, _combatRng: humanRng.fork('fight'), phase: 'combat' });
  };

  // Roll the encounter chance for searching a location right now.
  const attemptSearch = (locationId: string) => {
    const s = get();
    const loc = s.locations[locationId];
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
      };
      set({ combat, _combatRng: fightRng.fork('fight'), phase: 'combat' });
      return;
    }

    const eventRng = new Rng(s2.seed).fork(`event:${loc.id}:${s2.day}:${loc2.remainingSearches}`);
    const event = rollPreScavengeEvent(eventRng, loc2);
    if (event) {
      set({ pendingEvent: { locationId: loc.id, event }, _eventRng: eventRng });
      return;
    }
    attemptSearch(loc.id);
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
    exploredArea: [],
    combat: null,
    _combatRng: null,
    pendingEvent: null,
    _eventRng: null,
    scavengeResult: null,
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
        log: [],
      });
    },

    setSpawn: async (spawn) => {
      const seed = randomSeed();
      const rng = new Rng(seed);

      // Single Overpass round-trip. A successful-but-sparse response means the
      // spot is genuinely remote (sea/forest/reserve) — reject so the player can
      // pick again. A thrown request means the API is down — fall back to a
      // simulated neighbourhood rather than blocking the player.
      let list: LocationState[];
      let usedFallback = false;
      let worldError: string | null = null;
      try {
        const raw = await fetchOsmPois(spawn.lat, spawn.lng, SCAVENGE_RADIUS);
        if (raw.length < 5) return 'remote';
        list = buildLocations(rng, spawn, raw);
      } catch {
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
        if (ev.factionId && ev.factionId !== 'transit') {
          startHumanCombat(pe.locationId, ev.factionId, false);
        } else {
          startHumanCombat(pe.locationId, 'raiders', false);
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
      if (s.combat || s.pendingEvent) return;
      const hoursToMorning = ((START_HOUR - s.hour + HOURS_PER_DAY) % HOURS_PER_DAY) || HOURS_PER_DAY;
      const restedEnergy = sleepRestore(s.meters.energy, hoursToMorning);
      if (advanceTime(hoursToMorning, restedEnergy)) return;
      // you slept here — your knowledge of THIS place stays current
      const posId = get().currentPositionId;
      if (posId) discoverLocation(posId);
      pushLog(flavor('rest'), 'info');
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

    clearScavengeResult: () => set({ scavengeResult: null }),

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

      const res = resolveRound(s._combatRng, pStats, s.combat.zombie, weather, round);
      const bodyParts =
        res.playerDamage > 0
          ? applyWound(s.bodyParts, res.playerDamage, s._combatRng.fork(`wound:${round}`))
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
        return;
      }
      if (dead) {
        set({ meters, bodyParts, combat: { ...s.combat, zombie, round, log, over: true, outcome: 'dead' } });
        return;
      }
      set({ meters, bodyParts, combat: { ...s.combat, zombie, round, log } });
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
      const res = attemptFlee(s._combatRng, s.character!.attributes, pStats, s.combat.zombie, round);
      const bodyParts =
        res.playerDamage > 0
          ? applyWound(s.bodyParts, res.playerDamage, s._combatRng.fork(`flee:${round}`))
          : s.bodyParts;
      const effMax = effectiveMaxHp(s.maxHp, bodyParts);
      const newHealth = Math.min(effMax, Math.max(0, s.meters.health - res.playerDamage));
      const meters: Meters = { ...s.meters, health: newHealth };
      const log = [...s.combat.log, ...res.log];
      const dead = checkDeath(meters, bodyParts) !== null;
      if (res.success && !dead) {
        set({ meters, bodyParts, combat: { ...s.combat, round, log, over: true, outcome: 'flee' } });
      } else if (dead) {
        set({ meters, bodyParts, combat: { ...s.combat, round, log, over: true, outcome: 'dead' } });
      } else {
        set({ meters, bodyParts, combat: { ...s.combat, round, log } });
      }
    },

    combatUseItem: (uid) => {
      get().useItem(uid);
      const s = get();
      if (s.combat && !s.combat.over) {
        set({
          combat: {
            ...s.combat,
            log: [...s.combat.log, { round: s.combat.round, tone: 'player', text: 'You use an item mid-fight.' }],
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
      if (outcome === 'win' && zombie.kind === 'human' && context.drops?.length) {
        let items = get().items;
        for (const defId of context.drops) items = addToGrid(items, 'backpack', defId, 1).items;
        set({ items });
        pushLog(`Looted the ${zombie.name}'s body.`, 'good');
      }

      if (context.roadAmbush) {
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
        pendingEvent: null,
        _eventRng: null,
        scavengeResult: null,
        log: [],
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
        pendingEvent: null,
        _eventRng: null,
        log: [],
      });
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
  return faction === 'raiders';
}

// Dev/debug handle — lets tooling inspect the live store without fighting
// HMR module identity. Harmless in production.
if (typeof window !== 'undefined') {
  (window as unknown as { __game?: typeof useGame }).__game = useGame;
}
