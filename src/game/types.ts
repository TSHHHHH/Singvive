import type { IconName } from '../icons/keys';

// ---------- Phases ----------
// Combat no longer has its own phase — it renders as a panel inside 'game'.
export type GamePhase = 'menu' | 'character' | 'spawn' | 'game' | 'death';

// ---------- Character ----------
export type AttributeKey = 'strength' | 'dexterity' | 'endurance' | 'perception' | 'wits';

export type Attributes = Record<AttributeKey, number>;

export type TraitCategory = 'positive' | 'negative';

export interface Trait {
  id: string;
  name: string;
  description: string;
  category: TraitCategory;
  cost: number; // positive traits: 1..3; negative traits: −1..−2 (refund)
  conflicts: string[]; // trait ids that are mutually exclusive

  // --- attributes (traits are now the sole source of stat deltas) ---
  strengthMod?: number;
  dexterityMod?: number;
  enduranceMod?: number;
  perceptionMod?: number;
  witsMod?: number;

  // --- combat ---
  attackMod?: number;
  defenseMod?: number;
  /** Additive dodge chance on a connecting hit, e.g. 0.03 = +3%. */
  dodgeMod?: number;
  infectionResist?: number; // 0..1
  /** Attack mod applied only vs undead (not human foes). */
  zombieAttackMod?: number;

  // --- loot/search ---
  lootMod?: number;
  searchBonusMod?: number; // extra searches per POI
  /** Additive search-speed bonus, e.g. 0.1 = +10% faster sequential reveals. */
  searchSpeedMod?: number;

  // --- health ---
  healBonus?: number;
  maxHpBonus?: number;

  // --- survival meters ---
  hungerDrainMod?: number; // multiplier delta: +0.2 = 20% more drain
  thirstDrainMod?: number;
  energyDrainMod?: number;
  /** Energy drain delta applied only outdoors or in heat weather. */
  outdoorEnergyDrainMod?: number;
  sleepRestoreMod?: number; // multiplier delta on sleep energy recovery

  // --- mobility ---
  travelSpeedMod?: number; // multiplier delta: +0.15 = 15% faster

  // --- encounter / stealth ---
  encounterChanceMod?: number; // additive delta to encounter roll
  ambushChanceMod?: number; // multiplier delta on ambush weight/chance (e.g. −0.5 = half)
  /** Extra encounter chance at night / dusk only. */
  nightEncounterChanceMod?: number;
  /** Extra player accuracy at night/dusk (negative = worse). */
  nightAccuracyExtra?: number;

  // --- perception / fog ---
  awarenessMod?: number;
  detectRadiusMod?: number; // multiplier delta to detect radius / blip margin

  // --- inventory ---
  gridWidthBonus?: number; // extra columns on backpack
  /** Flat kg added to carry capacity. */
  carryCapacityMod?: number;

  // --- crafting ---
  /** Delta on total craft material count (e.g. −1 = one fewer input). */
  craftCostMod?: number;

  // --- events ---
  /** Flat bonus on doorway / dialogue attribute checks. */
  checkBonusMod?: number;

  // --- faction ---
  /**
   * Standing each faction starts the run at. This replaces the old
   * `factionHostilityMod`, which was declared, typed, and read by absolutely
   * nothing.
   *
   * It is the *only* lever a trait needs over factions, because hostility now
   * lifts at STANDING_KNOWN (+1): handing a build one point of standing with the 88
   * Syndicate is exactly what "you know someone" means, with no special case
   * anywhere in the faction code. Standing runs −5…+5.
   */
  factionStandingMod?: Partial<Record<Exclude<FactionId, null>, number>>;

  // --- food effectiveness ---
  foodEffectMod?: number; // multiplier delta: −0.25 = food 25% less effective

  // --- misc flags ---
  nightAccuracyPenaltyRemoved?: boolean;
  bleedingSelfStopDisabled?: boolean; // bleeding never self-heals
  cannotDropItems?: boolean; // hoarder: must consume or stash
  showSearchesRemaining?: boolean; // reveals POI search count
  lootValueMod?: number; // multiplier delta on loot value display/score
  legHealMod?: number; // multiplier delta on leg injury recovery speed
}

export interface Character {
  name: string;
  attributes: Attributes;
  traitIds: string[];
  /**
   * The preset this build started from, kept for flavour and for showing the
   * player what they picked. Absent on hand-rolled builds — and on any build
   * whose traits were edited away from the preset.
   */
  occupationId?: string;
}

/**
 * A one-click starting build: a curated, budget-legal trait bundle with a
 * job title attached. See `src/game/occupations.ts`.
 */
export interface Occupation {
  id: string;
  /** The job, as it read on the pass hanging round your neck. */
  name: string;
  /** One line, shown on the card. */
  tagline: string;
  /** The longer pitch, shown once the card is selected. */
  blurb: string;
  /** Positive and negative traits together, in pick order. */
  traitIds: string[];
  /** Plain-English strengths — no numbers, for players who don't want them. */
  goodAt: string[];
  strugglesWith: string[];
}

// ---------- Items / Inventory ----------
export type ItemEffect =
  | {
      kind: 'food';
      hunger: number;
      /** Optional secondary restores — meals that come with a drink. */
      thirst?: number;
      energy?: number;
    }
  | {
      kind: 'water';
      thirst: number;
      hunger?: number;
      energy?: number;
      infectionRisk?: number;
    }
  | {
      kind: 'heal';
      health: number;
      partHeal?: number;
      stopsBleeding?: 'one' | 'all';
      /**
       * Infection points this adds when used. What you pay for dressing a wound
       * with a torn shirt instead of a sterile bandage — the cheap way out of a
       * bleed is always available, and always costs you something later.
       */
      infectionRisk?: number;
    }
  | { kind: 'cure'; infection: number }
  | {
      kind: 'energy';
      energy: number;
      hunger?: number;
      thirst?: number;
    }
  | {
      kind: 'weapon';
      damage: number;
      accuracy: number;
      ranged: boolean;
      /** Rounds a single shot burns. Absent ⇒ 1. A shotgun is not cheap to run. */
      roundsPerShot?: number;
    }
  | { kind: 'ammo'; rounds: number }
  | { kind: 'fuel' }
  | { kind: 'misc' };

export type EquipSlot =
  | 'head'
  | 'body'
  | 'hands'
  | 'legs'
  | 'feet'
  | 'bag'
  | 'mainHand'
  | 'offHand';

/**
 * How beaten-up an instance is. Derived from its `condition`, never stored —
 * the game has no abstract rarity ladder, only wear. A find is exciting because
 * it still works, not because it glows a different colour.
 */
export type ConditionTier = 'torn' | 'used' | 'worn' | 'pristine';

export interface ItemModifiers {
  attackBonus?: number;
  defenseBonus?: number;
  /** Additive dodge chance when equipped, e.g. 0.08 = +8%. Can be negative. */
  dodgeBonus?: number;
  /** Reduces head hit-zone weight (harder to headshot). 0..1 */
  headTargetReduction?: number;
  /** Shrinks head-crit damage multiplier. 0..1 */
  headCritReduction?: number;
  weightCapacityBonus?: number;
  awarenessMod?: number;
  /**
   * Flat damage subtracted when a hit lands on the body zone this piece covers.
   * Condition-scaled. Feet omit this — they do not soak combat hits.
   */
  limbArmor?: number;
  /** 0..1 reduction to bleed/fracture chance on covered zones. Condition-scaled. */
  statusResist?: number;
  /** Attack-roll accuracy (gloves). Condition-scaled. */
  accuracyBonus?: number;
  /** Combat initiative speed (gloves / light footwear). Condition-scaled. */
  speedBonus?: number;
  /** Multiplicative travel pace delta, e.g. 0.1 = +10% walk speed (feet). */
  travelSpeedBonus?: number;
  /** Additive encounter risk while travelling (camo negative, noisy boots positive). */
  encounterChanceMod?: number;
  /** Additive sequential-search speed, e.g. 0.15 = +15% faster reveals. */
  searchSpeedBonus?: number;
  /** Extra backpack columns when this bag is equipped. */
  bagWidthBonus?: number;
  /** Extra backpack rows when this bag is equipped. */
  bagHeightBonus?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  w: number; // grid cells wide
  h: number; // grid cells tall
  weight: number; // kg-ish, drives encumbrance
  effect: ItemEffect;
  value: number; // score / trade value
  stackable: boolean;
  maxStack: number;
  color: string; // tailwind-ish hex for the tile
  icon?: IconName; // specific art; falls back to the item's effect kind
  slot?: EquipSlot; // equippable slot, if any
  modifiers?: ItemModifiers; // combat/capacity bonuses when equipped
  /**
   * Two-handed weapon: occupies mainHand and blocks offHand while equipped.
   * Equipping one stows whatever was in the off hand.
   */
  twoHanded?: boolean;

  /** Firearms and military kit: gated hard on drop, called out in the UI. */
  exotic?: boolean;
  /**
   * Present ⇒ this item wears out and can be repaired; absent ⇒ it has no
   * condition at all (most stackable consumables). Only non-stackable items
   * should set this — see the stacking invariant in inventory.ts.
   */
  maxCondition?: number;
  /**
   * Multiplier on the wear a weapon takes per swing; default 1.
   *
   * A kitchen knife and a fireman's axe used to blunt at exactly the same rate,
   * which made every weapon equally disposable and the good ones not worth
   * carrying. Below 1 is built to last (a crowbar is a steel bar), above 1 is
   * improvised (a taped stick, a paring knife).
   */
  wearRate?: number;
  /** Condition decays with elapsed time rather than with use. */
  perishable?: boolean;
  /**
   * 0..1 chance of surviving the drop gate in `rollLoot`; default 1. A hidden
   * tuning knob — the player never sees a scarcity badge, they just notice that
   * good things are hard to find.
   */
  scarcity?: number;
  /**
   * When carried (backpack or site stash), counts as a bed for sleep quality.
   */
  sleepGear?: boolean;
  /**
   * When true, this def is granted at the start of a run (DEV-tunable via the
   * loot browser). Equippable defs with a free slot are worn; otherwise they
   * go into the backpack.
   */
  startingItem?: boolean;
  /** How many to grant when `startingItem` is set and the item is not equipped. Default 1. */
  startingCount?: number;
}

/**
 * Where an item lives. 'backpack' is the carried 8×5 grid; any other value is a
 * location id whose 10×8 on-site stash the item is cached in.
 */
export type Container = string;

export interface ItemInstance {
  uid: string;
  defId: string;
  container: Container;
  x: number; // top-left cell
  y: number;
  rotated: boolean; // swaps w/h
  stack: number;
  /**
   * 0..100 wear. Absent means "as good as new" — which is also what every item
   * in a save written before conditions existed deserializes to.
   */
  condition?: number;
}

export type Equipment = Record<EquipSlot, ItemInstance | null>;

// ---------- POIs ----------
export type PoiCategory =
  | 'supermarket'
  | 'convenience'
  | 'pharmacy'
  | 'hospital'
  | 'clinic'
  | 'hardware'
  | 'fuel'
  | 'police'
  | 'residential'
  | 'foodcourt'
  | 'mrt'
  | 'industrial'
  | 'school'
  /** Synthetic connective tissue inserted by the world builder — see world.ts. */
  | 'waypoint';

export type FactionId = 'idtf' | 'pasir_panjang' | 'syndicate_88' | 'sta' | null;
export type LocationSize = 'small' | 'medium' | 'large';

/** NPC services available on faction-held ground (never scavenging). */
export type FactionService = 'trade' | 'rest' | 'aid' | 'intel';

/** Last-known snapshot of a discovered location (fog-of-war memory). */
export interface LocationMemory {
  currentDanger: number;
  isFactionRevealed: boolean;
  looted: boolean;
  exhausted: boolean;
  remainingSearches: number;
  cleared: boolean;
}

export interface LocationState {
  id: string;
  name: string;
  category: PoiCategory;
  lat: number;
  lng: number;
  /** Building footprint ring [lat,lng][] when OSM provides one. */
  outline?: [number, number][];

  size: LocationSize;
  baseDanger: number; // 1..5 resting level
  currentDanger: number; // float, depletes when cleared, regenerates over time
  /** Noise the site has heard lately — decays 1 per 2 in-game hours. */
  tempDangerBoost?: number;
  remainingSearches: number;
  exhausted: boolean; // remainingSearches hit 0 — permanently picked clean
  cleared: boolean; // visited & searched at least once
  looted: boolean; // convenience: true once fully picked over this visit-cycle

  factionId: FactionId;
  isFactionRevealed: boolean;
  /**
   * Services this occupied site offers. Outposts always have all four; ordinary
   * territory seeds a random 1–3. Absent / empty on unclaimed ground.
   */
  factionServices?: FactionService[];
  /** True when this site is one of the faction's marked outposts. */
  isFactionOutpost?: boolean;
  /** One-time standing penalty for trespass already applied at this doorway. */
  trespassStandingHit?: boolean;
  /** Day field aid was last taken here (once per day). */
  aidUsedDay?: number;
  /** Day intel was last taken here (once per day). */
  intelUsedDay?: number;
  isMrtStation: boolean;
  /**
   * Canonical station id in the baked rail network (see game/mrt.ts) when this
   * POI is a station the network actually knows — which is what makes it a
   * node you can ride from. Absent on a station OSM has but the network
   * doesn't, e.g. the KTM stops.
   */
  mrtStationId?: string;

  // ---- doorway memory -----------------------------------------------------
  // What this entrance remembers about you. All optional: saves written before
  // the doorway remembered anything simply come back with a clean slate.
  /** A security door you already got through stays open. */
  doorForced?: boolean;
  /** Last day (inclusive) a paid faction toll still buys you passage. */
  tollPaidThroughDay?: number;
  /** Day the survivor camped here was dealt with, one way or another. */
  survivorSettledDay?: number;

  // fog of war
  discovered: boolean; // ever seen — kept as memory even when out of sight
  lastSeen: LocationMemory | null; // frozen state from the last time it was in sight

  distanceFromSpawn: number; // metres from the original spawn (for display/sort)
}

/** Back-compat alias — map/UI components read the shared fields. */
export type Poi = LocationState;

// ---------- Injuries ----------
export type BodyPartId =
  | 'head'
  | 'torso'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg';

/**
 * How badly a part is bleeding.
 *
 * `minor` is pressure, not a death sentence: it clots on its own, barely drains,
 * and does not stop the body recovering. `major` is the emergency — it never
 * clots, and it has to be dressed with something.
 */
export type BleedLevel = 'none' | 'minor' | 'major';

export interface BodyPart {
  hp: number;
  maxHp: number;
  bleed: BleedLevel;
  /**
   * In-game hours left before a `minor` bleed clots on its own. Meaningless for
   * `none` and `major` — a major never clots, and that is the whole point of it.
   */
  bleedHours: number;
  /** Heavy blow on an arm/leg — cleared by a splint, slows recovery until then. */
  fractured?: boolean;
  /** Limb hit 0 HP without proper treatment — passive heal caps at 70% max. */
  crippled?: boolean;
  /**
   * Torso was already Critical (0 HP) and took another solid hit / head spill.
   * That follow-up ends the run — emptying the body once alone does not.
   */
  mortalWound?: boolean;
}

export type BodyParts = Record<BodyPartId, BodyPart>;

// ---------- Survival ----------
export interface Meters {
  hunger: number; // 100 = full, 0 = starving
  thirst: number; // 100 = hydrated
  energy: number; // 100 = rested
  infection: number; // 0 = clean, 100 = turned
}

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'thunderstorm' | 'haze' | 'heat';
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface WeatherState {
  kind: WeatherKind;
  time: TimeOfDay;
}

// ---------- Combat ----------
export interface Enemy {
  name: string;
  kind: 'zombie' | 'human';
  hp: number;
  maxHp: number;
  attack: number; // modifier
  defense: number; // modifier
  damage: number; // per hit
  infectious: number; // 0..1 chance to infect on hit (0 for humans)
  armor: number; // flat damage soak — bypassed by the precision stance
  /**
   * Gauge units earned per second on the initiative track. A Runner at 13 acts
   * roughly twice for every one swing a Shambler at 5 gets in — this is the
   * number the race track on screen is actually drawing.
   */
  speed: number;
}

/** Back-compat alias for the spec's naming. */
export type Combatant = Enemy;

export type StanceId = 'aggressive' | 'guarded' | 'precision' | 'disengage';

export interface StanceDef {
  id: StanceId;
  name: string;
  /** semantic icon key — see src/icons/keys.ts */
  icon: IconName;
  description: string;
  attackMod: number;
  damageMod: number;
  defenseMod: number;
  /** Multiplier on limb damage taken. */
  limbDamageMult: number;
  /** Additive dodge chance on a connecting hit. */
  dodgeMod: number;
  critChanceBonus: number; // 0..1
  ignoresArmor: boolean;
  /** Extra in-game hours burned per round. */
  timeCostHours: number;
  /** Gauge units/second added to the player's initiative rate. */
  speedMod: number;
  fleeDcMod: number;
  /** Enemy gets a parting swing before you disengage. */
  opportunityAttack: boolean;
  opportunityAccuracy: number;
}

export type TerrainId =
  | 'hdb_corridor'
  | 'void_deck'
  | 'supermarket_aisle'
  | 'mrt_concourse'
  | 'tunnel_bore'
  | 'open_ground';

export interface TerrainModifier {
  id: TerrainId;
  name: string;
  defenseMod: number;
  dodgeMod: number; // 0..1 chance delta to shrug off a connecting hit
  fleeDcMod: number;
  meleeAccuracyMod: number;
  rangedAccuracyMod: number;
  ambushRateMod: number;
  /** Local danger added to the site when a gun goes off here. */
  gunshotDangerMod: number;
}

/** Back-compat alias while combat is generalized. */
export type Zombie = Enemy;

export interface CombatLogEntry {
  round: number;
  text: string;
  tone: 'player' | 'enemy' | 'roll' | 'info' | 'good' | 'bad';
  /**
   * Whose action produced this line. Consecutive entries sharing a side are
   * drawn as one bubble, tucked to that side of the log. Omitted for scene
   * notes (terrain, weather, gear breaking) which belong to neither.
   */
  side?: 'player' | 'enemy';
}

/** What to do once a fight ends (win/flee). */
export interface CombatContext {
  /** null when the fight happens out in the open, away from any site. */
  locationId: string | null;
  /** true if fleeing still yields the (partial) search loot. */
  grantOnFlee: boolean;
  /** dropped gear granted to the backpack on a human-combat win. */
  drops?: string[];
  /** road ambush on the approach — winning doesn't auto-search the site. */
  roadAmbush?: boolean;
  /** jumped mid-crossing in open ground — there is no site to search at all. */
  wilds?: boolean;
  /** the HDB unit this fight came out of — settled instead of a site search. */
  hdbUnit?: { level: number; unitId: string; lootMod: number };
  /**
   * Cut off on the stairwell — nothing to search; after the fight, finish the
   * interrupted cell move to `dest` (otherwise you stay on the origin floor and
   * can fail/re-fight the same descent forever).
   */
  hdbStairs?: { dest: { level: number; column: number } };
  /**
   * Met in the tunnel between two stations. Winning settles the node, never the
   * station overhead; `lootMod` rides along when the fight interrupted a
   * salvage, so the win still pays for it.
   */
  tunnel?: { nodeId: string; lootMod: number };
  /**
   * Illicit gate fight: on a win, enter raid mode at the site (no immediate search).
   */
  pendingRaid?: 'sneak' | 'force';
  /**
   * Mid-raid search fight: on a win, resolve one search while staying in raid.
   */
  raidLoot?: boolean;
}

export interface CombatState {
  locationId: string | null;
  zombie: Enemy; // enemy stat block (zombie or human — see .kind)
  round: number;
  log: CombatLogEntry[];
  over: boolean;
  outcome: 'win' | 'flee' | 'dead' | null;
  playerHpSnapshot: number; // HP entering combat (for summary)
  context: CombatContext;

  /** Active fight stance — switchable mid-combat; drives the next swing. */
  selectedStance: StanceId;
  terrain: TerrainModifier;
  /** True at contact until the player chooses Fight or Flee. */
  awaitingStance: boolean;

  // ---- initiative track ----
  /** 0..GAUGE_FULL. Whoever reaches the end first takes the next action. */
  playerGauge: number;
  enemyGauge: number;
  /** Who just acted — drives the flash on the track and the log bubble. */
  acting: 'player' | 'enemy' | null;
  /** Fight is frozen mid-track; the gauges stop moving. */
  paused: boolean;
  /** Index into COMBAT_SPEEDS — how fast the track runs in real time. */
  speedIndex: number;
}

// ---------- Run statistics ----------
/**
 * Cumulative counters for the current run. Display only — nothing here ever
 * feeds back into a gameplay roll, so adding a counter can never change balance.
 */
export interface RunStats {
  zombieKills: number;
  humanKills: number;
  fightsFled: number;
  /** Metres actually walked (treks and site-to-site legs; MRT rides excluded). */
  distanceM: number;
  poisSearched: number;
  hdbUnitsCleared: number;
  itemsLooted: number;
  /** Sum of item `value` for everything ever picked up, kept or not. */
  lootValue: number;
  nightsSlept: number;
}

// ---------- Timeline ----------
export interface LootStackRef {
  defId: string;
  count: number;
}

/** One line of the run's timeline, stamped with the in-game moment it happened. */
export interface GameLogEntry {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
  day: number;
  hour: number;
  /** What the search yielded — rendered as chips under the entry. */
  loot?: LootStackRef[];
  /** What wouldn't fit in the pack. */
  leftover?: LootStackRef[];
  /** Optional map focus — e.g. outpost intel tip. */
  focus?: { lat: number; lng: number; label?: string };
}

// ---------- Scores ----------
export interface HighScore {
  name: string;
  days: number;
  score: number;
  cause: string;
  seed: string;
  date: number;
}
