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
  infectionResist?: number; // 0..1

  // --- loot/search ---
  lootMod?: number;
  searchBonusMod?: number; // extra searches per POI

  // --- health ---
  healBonus?: number;
  maxHpBonus?: number;

  // --- survival meters ---
  hungerDrainMod?: number; // multiplier delta: +0.2 = 20% more drain
  thirstDrainMod?: number;
  energyDrainMod?: number;
  sleepRestoreMod?: number; // multiplier delta on sleep energy recovery

  // --- mobility ---
  travelSpeedMod?: number; // multiplier delta: +0.15 = 15% faster

  // --- encounter / stealth ---
  encounterChanceMod?: number; // additive delta to encounter roll
  ambushChanceMod?: number; // additive delta to ambush/surprise chance

  // --- perception / fog ---
  awarenessMod?: number;
  detectRadiusMod?: number; // multiplier delta to detect radius

  // --- inventory ---
  gridWidthBonus?: number; // extra columns on backpack

  // --- faction ---
  factionHostilityMod?: number; // −1 = one tier friendlier start

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
}

// ---------- Items / Inventory ----------
export type ItemEffect =
  | { kind: 'food'; hunger: number }
  | { kind: 'water'; thirst: number }
  | { kind: 'heal'; health: number; partHeal?: number; stopsBleeding?: 'one' | 'all' }
  | { kind: 'cure'; infection: number }
  | { kind: 'energy'; energy: number }
  | { kind: 'weapon'; damage: number; accuracy: number; ranged: boolean }
  | { kind: 'fuel' }
  | { kind: 'misc' };

export type EquipSlot = 'head' | 'body' | 'mainHand' | 'offHand';

export interface ItemModifiers {
  attackBonus?: number;
  defenseBonus?: number;
  weightCapacityBonus?: number;
  awarenessMod?: number;
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
  slot?: EquipSlot; // equippable slot, if any
  modifiers?: ItemModifiers; // combat/capacity bonuses when equipped
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
}

export type Equipment = Record<EquipSlot, ItemInstance | null>;

// ---------- POIs ----------
export type PoiCategory =
  | 'supermarket'
  | 'convenience'
  | 'pharmacy'
  | 'hospital'
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
  isMrtStation: boolean;

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

export interface BodyPart {
  condition: number; // 0..100, 100 = healthy
  bleeding: boolean;
}

export type BodyParts = Record<BodyPartId, BodyPart>;

// ---------- Survival ----------
export interface Meters {
  health: number;
  hunger: number; // 100 = full, 0 = starving
  thirst: number; // 100 = hydrated
  energy: number; // 100 = rested
  infection: number; // 0 = clean, 100 = turned
}

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'thunderstorm' | 'haze';
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
  critChanceBonus: number; // 0..1
  ignoresArmor: boolean;
  /** Extra in-game hours burned per round. */
  timeCostHours: number;
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
  /** cut off on the stairwell — there's nothing to search, you just fight clear. */
  hdbStairs?: boolean;
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

  /** Stance chosen before the next round resolves. */
  selectedStance: StanceId;
  terrain: TerrainModifier;
  /** Quick-belt slots: 3 backpack item uids (null = empty slot). */
  quickBeltItems: (string | null)[];
  /** Rounds resolve only while the player has committed a stance. */
  awaitingStance: boolean;
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
