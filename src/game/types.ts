// ---------- Phases ----------
export type GamePhase = 'menu' | 'character' | 'spawn' | 'game' | 'combat' | 'death';

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
  | 'mrt';

export type FactionId = 'saf' | 'hawker' | 'raiders' | 'transit' | null;
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
  remainingSearches: number;
  exhausted: boolean; // remainingSearches hit 0 — permanently picked clean
  cleared: boolean; // visited & searched at least once
  looted: boolean; // convenience: true once fully picked over this visit-cycle

  factionId: FactionId;
  isFactionRevealed: boolean;
  isMrtStation: boolean;

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
  locationId: string;
  /** true if fleeing still yields the (partial) search loot. */
  grantOnFlee: boolean;
  /** dropped gear granted to the backpack on a human-combat win. */
  drops?: string[];
  /** road ambush on the approach — winning doesn't auto-search the site. */
  roadAmbush?: boolean;
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
