import type {
  AttributeKey,
  FactionId,
  LocationState,
  PoiCategory,
  TimeOfDay,
  WeatherKind,
} from './types';
import type { Rng } from './rng';
import {
  activeLocale,
  ev,
  factionFullName,
  factionShortName,
  pickEventProse,
  pickFieldDoctorText,
  priceList,
} from './eventCopy';
export { priceList } from './eventCopy';
import { itemName } from '../i18n/display';
import type { LocaleId } from '../i18n/types';
import type { LonerKind } from './enemies';
import {
  FACTION_CONFIG,
  gateStandingBand,
  hasFactionClearance,
  type FactionStanding,
} from './factions';

// Standing moved to factions.ts once it started gating shop counters and beds
// as well as doorways. Re-exported so the UI and the store keep one import.
export {
  clampStanding,
  emptyStanding,
  factionIsHostile,
  factionEscorts,
  factionFeeds,
  factionOffersAid,
  factionSharesIntel,
  factionShelters,
  factionTrades,
  factionWavesYouThrough,
  gateStandingBand,
  hasFactionClearance,
  standingLabel,
  STANDING_BAD,
  STANDING_HATED,
  STANDING_KIN,
  STANDING_KNOWN,
  STANDING_MAX,
  STANDING_MIN,
  STANDING_TRUSTED,
  type FactionStanding,
  type GateStandingBand,
} from './factions';

export type EventKind =
  | 'locked_door'
  | 'desperate_survivor'
  | 'faction_shakedown'
  | 'faction_checkpoint'
  | 'mrt_toll'
  | 'rival_scavenger'
  | 'armed_raider'
  | 'block_tout'
  | 'rigged_door'
  | 'quiet_tap'
  | 'body_in_the_doorway'
  | 'looters_fleeing'
  | 'smoke_block'
  | 'distress_beacon'
  | 'nomad_trader'
  | 'car_blockade'
  | 'flooded_entry'
  | 'field_doctor';

export type ChoiceKind = 'check' | 'pay' | 'fight' | 'leave';

// ---------------------------------------------------------------------------
// Doorway events.
//
// These fire at the moment a survivor commits to going *inside* a site, not
// when they walk up to it — arriving somewhere never freezes the screen.
//
// Four things keep them from wearing out their welcome:
//   1. The doorway remembers. A pried door stays pried, a paid toll buys
//      passage, a survivor you dealt with doesn't ask twice (DoorwayMemory on
//      LocationState), and factions remember whether you paid or drew down.
//   2. A cooldown and a daily cap (EVENT_COOLDOWN_HOURS / EVENT_MAX_PER_DAY)
//      keep them rare enough to feel like events rather than turnstiles.
//   3. Eligible kinds are gathered and picked by weight, not walked down a
//      priority list — so a faction site isn't always a shakedown.
//   4. The prose is a pool, not a constant — picked against time and weather.
//
// What a choice *does* is data, not a branch: every choice carries a list of
// EventEffects for success and for failure, and the store interprets them.
// Adding an event kind should never mean touching the resolver.
// ---------------------------------------------------------------------------

/** Hours that must pass after any doorway event before another can fire. */
export const EVENT_COOLDOWN_HOURS = 7;
/** Hard ceiling on doorway events in a single day. */
export const EVENT_MAX_PER_DAY = 3;
/** Days before a survivor you've already dealt with will approach again. */
export const SURVIVOR_MEMORY_DAYS = 3;

// ---------------------------------------------------------------------------
// Effects — what a choice actually costs or buys
// ---------------------------------------------------------------------------

/** A patch to the doorway's memory, expressed relative to the current day. */
export interface DoorwayMark {
  door?: boolean;
  /** Days of free passage bought, counting today as 0. */
  tollDays?: number;
  survivorSettled?: boolean;
}

export type EventEffect =
  /** Cleared the gate — services (occupied) or search (unclaimed). Terminal. */
  | { t: 'access' }
  /** Turned away — no search, no fight. Terminal. */
  | { t: 'deny'; line: string }
  /**
   * Humans, right now. Terminal. `foe` says who: omitted means the event's
   * faction (falling back to the local muscle), while a LonerKind means an
   * unaffiliated loner who answers to nobody.
   */
  | { t: 'fight'; foe?: LonerKind }
  /**
   * Forced entry / refused the gate: standing hit, then human combat. On a win
   * the survivor enters raid mode (`force`). Terminal.
   */
  | { t: 'trespass' }
  /**
   * Enter illicit raid mode at this site (loot by size, no services). Terminal
   * when used alone; usually paired after a successful sneak check outside events.
   */
  | { t: 'raid'; mode: 'sneak' | 'force' }
  /** The dead, right now. Terminal. */
  | { t: 'zombies'; line: string }
  /** Read the place: reveals the holder and what the shelves are worth. */
  | { t: 'intel' }
  | { t: 'time'; hours: number; line: string }
  | { t: 'energy'; amount: number; line: string }
  | { t: 'wound'; amount: number; line: string }
  | { t: 'noise'; radius: number; intensity: number }
  | { t: 'gain'; defId: string; count?: number }
  | { t: 'standing'; delta: number }
  | { t: 'mark'; mark: DoorwayMark }
  /** Patch injuries. Used by the shelter field doctor. */
  | { t: 'treat'; amount: number; line: string }
  /** Consume a one-shot HDB shelter service (clears the unit). */
  | { t: 'service' };

const TERMINAL = new Set(['access', 'deny', 'fight', 'zombies', 'trespass', 'raid']);
export const isTerminal = (e: EventEffect) => TERMINAL.has(e.t);

export interface EventChoice {
  id: string;
  label: string;
  kind: ChoiceKind;
  attr?: AttributeKey; // for 'check'
  dc?: number;
  /** For 'pay': any one of these settles it, preferred first. */
  itemIds?: string[];
  /** Applied when the check passes, the item is handed over, or there's no roll. */
  onSuccess: EventEffect[];
  /** Applied when the check fails or the price can't be met. */
  onFailure?: EventEffect[];
}

export interface GameEvent {
  kind: EventKind;
  title: string;
  /** One line of foreshadowing, logged before the prompt appears. */
  tell: string;
  text: string;
  choices: EventChoice[];
  factionId: FactionId | null;
}

/** Everything the prose and the gating need to know about right now. */
export interface EventCtx {
  day: number;
  time: TimeOfDay;
  weather: WeatherKind;
  standing: FactionStanding;
  /** Player language — doorway copy resolves against this locale. */
  locale?: LocaleId;
}

/** Attribute-check DC scaled off the site's current danger. */
export function dcFor(currentDanger: number): number {
  return 8 + Math.round(currentDanger * 2);
}

// ---------------------------------------------------------------------------
// Prose — pools live in i18n catalogs (`event.*`); see eventCopy.ts
// ---------------------------------------------------------------------------

const WET: readonly WeatherKind[] = ['rain', 'thunderstorm'];

function prose(
  rng: Rng,
  kind: Exclude<EventKind, 'mrt_toll' | 'field_doctor'>,
  ctx: EventCtx,
  vars: Record<string, string>,
  factionId?: FactionId,
): { tell: string; text: string } {
  return pickEventProse(rng, kind, ctx, vars, factionId);
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

// Which doorways can host which scene. Every non-waypoint category wants at
// least two entries here, or its doorway only ever tells one story.
const RIGGED_AT: PoiCategory[] = ['police', 'hardware', 'industrial', 'fuel'];
const LOCKED_AT: PoiCategory[] = ['police', 'hospital', 'clinic', 'hardware'];
const RIVAL_AT: PoiCategory[] = [
  'supermarket', 'convenience', 'pharmacy', 'clinic', 'hardware', 'foodcourt', 'fuel', 'industrial',
];
const RAIDER_AT: PoiCategory[] = [
  'police', 'fuel', 'industrial', 'hardware', 'supermarket', 'mrt',
];
const TOUT_AT: PoiCategory[] = [
  'residential', 'foodcourt', 'convenience', 'school', 'mrt', 'pharmacy',
];
// Water points cluster where people already queued for food — and the schools
// were the designated shelters when it fell.
const TAP_AT: PoiCategory[] = ['supermarket', 'foodcourt', 'convenience', 'school'];
const BODY_AT: PoiCategory[] = ['hospital', 'clinic', 'police', 'mrt', 'school'];
const LOOTERS_AT: PoiCategory[] = [
  'supermarket', 'convenience', 'pharmacy', 'hardware', 'foodcourt',
];
const SMOKE_AT: PoiCategory[] = ['foodcourt', 'industrial', 'fuel', 'pharmacy', 'hospital'];
const BEACON_AT: PoiCategory[] = ['police', 'hospital', 'mrt', 'school', 'clinic', 'pharmacy'];
const TRADER_AT: PoiCategory[] = ['convenience', 'foodcourt', 'mrt', 'fuel', 'school'];
const BARRICADE_AT: PoiCategory[] = ['fuel', 'police', 'industrial', 'hospital'];
const FLOODED_AT: PoiCategory[] = ['mrt', 'industrial', 'school'];

/** Odds that *something* is waiting, given anything is eligible at all. */
function doorwayChance(loc: LocationState, ctx: EventCtx): number {
  let p = 0.4 + loc.currentDanger * 0.03;
  if (ctx.time === 'night') p += 0.08;
  return Math.max(0.05, Math.min(0.8, p));
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function locOf(ctx: EventCtx): LocaleId {
  return activeLocale(ctx.locale);
}

/**
 * Lawful fee gate (−1…+1). Sneak / force live on the frontage before this
 * scene — here the only ask is the introduction fee, or walking away.
 */
function buildFeeGate(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const faction = loc.factionId as Exclude<FactionId, null>;
  const cfg = FACTION_CONFIG[faction];
  const locale = locOf(ctx);
  const vars = {
    name: loc.name,
    faction: factionFullName(faction, locale),
    short: factionShortName(faction, locale),
    tribute: itemName(cfg.tribute[0], locale),
  };
  const { tell, text } = prose(rng, 'faction_checkpoint', ctx, vars, faction);
  const price = priceList(cfg.tribute, locale);
  return {
    kind: 'faction_checkpoint',
    factionId: faction,
    title: ev('faction_checkpoint.title', { short: vars.short }, locale),
    tell,
    text,
    choices: [
      {
        id: 'pay',
        kind: 'pay',
        itemIds: cfg.tribute,
        label: ev('faction_checkpoint.choices.pay', { price }, locale),
        onSuccess: [
          { t: 'standing', delta: 1 },
          { t: 'mark', mark: { tollDays: 7 } },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'deny', line: ev('faction_checkpoint.lines.payEmpty', undefined, locale) },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: ev('faction_checkpoint.choices.leave', undefined, locale),
        onSuccess: [{ t: 'deny', line: ev('faction_checkpoint.lines.leave', undefined, locale) }],
      },
    ],
  };
}

/**
 * Tribute demand on Bad / Terrible ground. Illicit entry is still a frontage
 * choice; at Terrible, refusing tribute draws steel and opens a force raid.
 */
function buildTributeGate(rng: Rng, loc: LocationState, ctx: EventCtx, terrible: boolean): GameEvent {
  const faction = loc.factionId as Exclude<FactionId, null>;
  const cfg = FACTION_CONFIG[faction];
  const locale = locOf(ctx);
  const vars = {
    name: loc.name,
    faction: factionFullName(faction, locale),
    short: factionShortName(faction, locale),
    tribute: itemName(cfg.tribute[0], locale),
  };
  const { tell, text } = prose(rng, 'faction_shakedown', ctx, vars, faction);
  const price = priceList(cfg.tribute, locale);
  const choices: EventChoice[] = [
    {
      id: 'pay',
      kind: 'pay',
      itemIds: cfg.tribute,
      label: ev('faction_shakedown.choices.pay', { price }, locale),
      onSuccess: [
        { t: 'standing', delta: 1 },
        { t: 'mark', mark: { tollDays: 1 } },
        { t: 'access' },
      ],
      onFailure: [
        { t: 'deny', line: ev('faction_shakedown.lines.payEmpty', undefined, locale) },
      ],
    },
  ];
  if (terrible) {
    choices.push({
      id: 'refuse',
      kind: 'fight',
      label: ev('faction_shakedown.choices.refuse', undefined, locale),
      onSuccess: [{ t: 'trespass' }],
    });
  }
  choices.push({
    id: 'leave',
    kind: 'leave',
    label: ev('faction_shakedown.choices.leave', undefined, locale),
    onSuccess: [{ t: 'deny', line: ev('faction_shakedown.lines.leave', undefined, locale) }],
  });
  return {
    kind: 'faction_shakedown',
    factionId: faction,
    title: ev(
      terrible ? 'faction_shakedown.titleTerrible' : 'faction_shakedown.title',
      { short: vars.short },
      locale,
    ),
    tell,
    text,
    choices,
  };
}

function buildLockedDoor(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'locked_door', ctx, { name: loc.name });
  const opened: EventEffect[] = [{ t: 'mark', mark: { door: true } }, { t: 'access' }];
  const racket: EventEffect[] = [
    { t: 'noise', radius: 140, intensity: 2 },
    { t: 'zombies', line: ev('locked_door.lines.pryFailZombies', undefined, locale) },
  ];
  return {
    kind: 'locked_door',
    factionId: null,
    title: ev('locked_door.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'pry',
        kind: 'check',
        attr: 'strength',
        dc,
        label: ev('locked_door.choices.pry', undefined, locale),
        onSuccess: opened,
        onFailure: racket,
      },
      {
        id: 'pick',
        kind: 'check',
        attr: 'wits',
        dc,
        label: ev('locked_door.choices.pick', undefined, locale),
        onSuccess: opened,
        onFailure: [
          { t: 'time', hours: 0.5, line: ev('locked_door.lines.pickFailTime', undefined, locale) },
          { t: 'deny', line: ev('locked_door.lines.pickFailDeny', undefined, locale) },
        ],
      },
      {
        id: 'find',
        kind: 'check',
        attr: 'perception',
        dc,
        label: ev('locked_door.choices.find', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.4, line: ev('locked_door.lines.findOk', undefined, locale) },
          ...opened,
        ],
        onFailure: [
          { t: 'time', hours: 0.4, line: ev('locked_door.lines.findFailTime', undefined, locale) },
          { t: 'energy', amount: 5, line: ev('locked_door.lines.findFailEnergy', undefined, locale) },
          { t: 'deny', line: ev('locked_door.lines.findFailDeny', undefined, locale) },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: ev('locked_door.choices.leave', undefined, locale),
        onSuccess: [{ t: 'deny', line: ev('locked_door.lines.leave', undefined, locale) }],
      },
    ],
  };
}

function buildSurvivor(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'desperate_survivor', ctx, { name: loc.name });
  const settled: EventEffect = { t: 'mark', mark: { survivorSettled: true } };
  return {
    kind: 'desperate_survivor',
    factionId: null,
    title: ev('desperate_survivor.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'give',
        kind: 'pay',
        itemIds: ['water_bottle', 'isotonic', 'canned_food'],
        label: ev('desperate_survivor.choices.give', undefined, locale),
        onSuccess: [settled, { t: 'intel' }, { t: 'access' }],
        onFailure: [settled, { t: 'fight', foe: 'survivor' }],
      },
      {
        id: 'reason',
        kind: 'check',
        attr: 'wits',
        dc,
        label: ev('desperate_survivor.choices.reason', undefined, locale),
        onSuccess: [settled, { t: 'access' }],
        onFailure: [settled, { t: 'fight', foe: 'survivor' }],
      },
      {
        id: 'scare',
        kind: 'check',
        attr: 'perception',
        dc,
        label: ev('desperate_survivor.choices.scare', undefined, locale),
        onSuccess: [settled, { t: 'noise', radius: 90, intensity: 1 }, { t: 'access' }],
        onFailure: [settled, { t: 'fight', foe: 'survivor' }],
      },
      {
        id: 'refuse',
        kind: 'fight',
        label: ev('desperate_survivor.choices.refuse', undefined, locale),
        onSuccess: [settled, { t: 'fight', foe: 'survivor' }],
      },
    ],
  };
}

function buildRival(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'rival_scavenger', ctx, { name: loc.name });
  const prize = rng.pick(['medkit', 'ammo_box', 'toolbox', 'antibiotics', 'fuel_can']);
  return {
    kind: 'rival_scavenger',
    factionId: null,
    title: ev('rival_scavenger.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'race',
        kind: 'check',
        attr: 'dexterity',
        dc,
        label: ev('rival_scavenger.choices.race', undefined, locale),
        onSuccess: [
          { t: 'gain', defId: prize },
          { t: 'energy', amount: 8, line: ev('rival_scavenger.lines.raceWin', undefined, locale) },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'energy', amount: 8, line: ev('rival_scavenger.lines.raceLose', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'split',
        kind: 'leave',
        label: ev('rival_scavenger.choices.split', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.5, line: ev('rival_scavenger.lines.split', undefined, locale) },
          { t: 'gain', defId: 'water_bottle' },
          { t: 'access' },
        ],
      },
      {
        id: 'watch',
        kind: 'check',
        attr: 'perception',
        dc,
        label: ev('rival_scavenger.choices.watch', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.6, line: ev('rival_scavenger.lines.watchWin', undefined, locale) },
          { t: 'intel' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.6, line: ev('rival_scavenger.lines.watchLose', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'confront',
        kind: 'fight',
        label: ev('rival_scavenger.choices.confront', undefined, locale),
        onSuccess: [{ t: 'fight', foe: 'scavenger' }],
      },
    ],
  };
}

function buildRaider(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger) + 1;
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'armed_raider', ctx, { name: loc.name });
  return {
    kind: 'armed_raider',
    factionId: null,
    title: ev('armed_raider.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'sneak',
        kind: 'check',
        attr: 'dexterity',
        dc: dc + 1,
        label: ev('armed_raider.choices.sneak', undefined, locale),
        onSuccess: [{ t: 'access' }],
        onFailure: [{ t: 'fight', foe: 'raider' }],
      },
      {
        id: 'bluff',
        kind: 'check',
        attr: 'wits',
        dc,
        label: ev('armed_raider.choices.bluff', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.3, line: ev('armed_raider.lines.bluffOk', undefined, locale) },
          { t: 'access' },
        ],
        onFailure: [{ t: 'fight', foe: 'raider' }],
      },
      {
        id: 'pay',
        kind: 'pay',
        itemIds: ['canned_food', 'ammo_box', 'painkillers', 'jewellery'],
        label: ev('armed_raider.choices.pay', undefined, locale),
        onSuccess: [{ t: 'access' }],
        onFailure: [{ t: 'fight', foe: 'raider' }],
      },
      {
        id: 'fight',
        kind: 'fight',
        label: ev('armed_raider.choices.fight', undefined, locale),
        onSuccess: [{ t: 'fight', foe: 'raider' }],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: ev('armed_raider.choices.leave', undefined, locale),
        onSuccess: [{ t: 'deny', line: ev('armed_raider.lines.leave', undefined, locale) }],
      },
    ],
  };
}

function buildTout(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'block_tout', ctx, { name: loc.name });
  return {
    kind: 'block_tout',
    factionId: null,
    title: ev('block_tout.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'pay',
        kind: 'pay',
        itemIds: ['snacks', 'soft_drink', 'water_bottle', 'canned_food'],
        label: ev('block_tout.choices.pay', undefined, locale),
        onSuccess: [{ t: 'access' }],
        onFailure: [{ t: 'fight', foe: 'tout' }],
      },
      {
        id: 'stare',
        kind: 'check',
        attr: 'perception',
        dc,
        label: ev('block_tout.choices.stare', undefined, locale),
        onSuccess: [{ t: 'noise', radius: 60, intensity: 1 }, { t: 'access' }],
        onFailure: [{ t: 'fight', foe: 'tout' }],
      },
      {
        id: 'fight',
        kind: 'fight',
        label: ev('block_tout.choices.fight', undefined, locale),
        onSuccess: [{ t: 'fight', foe: 'tout' }],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: ev('block_tout.choices.leave', undefined, locale),
        onSuccess: [{ t: 'deny', line: ev('block_tout.lines.leave', undefined, locale) }],
      },
    ],
  };
}

function buildRigged(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'rigged_door', ctx, { name: loc.name });
  return {
    kind: 'rigged_door',
    factionId: null,
    title: ev('rigged_door.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'disarm',
        kind: 'check',
        attr: 'perception',
        dc: dc + 1,
        label: ev('rigged_door.choices.disarm', undefined, locale),
        onSuccess: [
          { t: 'gain', defId: 'scrap_metal' },
          { t: 'mark', mark: { door: true } },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'wound', amount: 9, line: ev('rigged_door.lines.disarmFailWound', undefined, locale) },
          { t: 'noise', radius: 200, intensity: 3 },
          { t: 'zombies', line: ev('rigged_door.lines.disarmFailZombies', undefined, locale) },
        ],
      },
      {
        id: 'power',
        kind: 'check',
        attr: 'wits',
        dc,
        label: ev('rigged_door.choices.power', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.5, line: ev('rigged_door.lines.powerOk', undefined, locale) },
          { t: 'mark', mark: { door: true } },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.5, line: ev('rigged_door.lines.powerFailTime', undefined, locale) },
          { t: 'deny', line: ev('rigged_door.lines.powerFailDeny', undefined, locale) },
        ],
      },
      {
        id: 'around',
        kind: 'leave',
        label: ev('rigged_door.choices.around', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 1, line: ev('rigged_door.lines.aroundTime', undefined, locale) },
          { t: 'energy', amount: 12, line: ev('rigged_door.lines.aroundEnergy', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: ev('rigged_door.choices.leave', undefined, locale),
        onSuccess: [{ t: 'deny', line: ev('rigged_door.lines.leave', undefined, locale) }],
      },
    ],
  };
}

function buildTap(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'quiet_tap', ctx, { name: loc.name });
  const holder = loc.factionId && loc.factionId !== 'sta' ? loc.factionId : null;
  return {
    kind: 'quiet_tap',
    factionId: holder,
    title: ev('quiet_tap.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'queue',
        kind: 'leave',
        label: ev('quiet_tap.choices.queue', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 1, line: ev('quiet_tap.lines.queue', undefined, locale) },
          { t: 'gain', defId: 'water_bottle', count: 1 },
          { t: 'standing', delta: 1 },
          { t: 'access' },
        ],
      },
      {
        id: 'trade',
        kind: 'pay',
        itemIds: ['canned_food', 'snacks', 'hawker_meal'],
        label: ev('quiet_tap.choices.trade', undefined, locale),
        onSuccess: [
          { t: 'gain', defId: 'water_bottle', count: 1 },
          { t: 'gain', defId: 'isotonic' },
          { t: 'standing', delta: 1 },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'deny', line: ev('quiet_tap.lines.tradeEmpty', undefined, locale) },
        ],
      },
      {
        id: 'push',
        kind: 'fight',
        label: ev('quiet_tap.choices.push', undefined, locale),
        onSuccess: [
          { t: 'gain', defId: 'water_bottle', count: 1 },
          { t: 'standing', delta: -2 },
          { t: 'fight' },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: ev('quiet_tap.choices.leave', undefined, locale),
        onSuccess: [{ t: 'deny', line: ev('quiet_tap.lines.leave', undefined, locale) }],
      },
    ],
  };
}

function buildBody(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'body_in_the_doorway', ctx, { name: loc.name });
  const carried = rng.pick(['bandage', 'painkillers', 'torch', 'batteries', 'canned_food', 'ammo_box']);
  return {
    kind: 'body_in_the_doorway',
    factionId: null,
    title: ev('body_in_the_doorway.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'strip',
        kind: 'check',
        attr: 'dexterity',
        dc,
        label: ev('body_in_the_doorway.choices.strip', undefined, locale),
        onSuccess: [{ t: 'gain', defId: carried }, { t: 'access' }],
        onFailure: [
          { t: 'gain', defId: carried },
          { t: 'noise', radius: 120, intensity: 2 },
          { t: 'zombies', line: ev('body_in_the_doorway.lines.stripFailZombies', undefined, locale) },
        ],
      },
      {
        id: 'read',
        kind: 'check',
        attr: 'wits',
        dc,
        label: ev('body_in_the_doorway.choices.read', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.3, line: ev('body_in_the_doorway.lines.readOk', undefined, locale) },
          { t: 'intel' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.3, line: ev('body_in_the_doorway.lines.readFail', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'step',
        kind: 'leave',
        label: ev('body_in_the_doorway.choices.step', undefined, locale),
        onSuccess: [{ t: 'access' }],
      },
    ],
  };
}

function buildLooters(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'looters_fleeing', ctx, { name: loc.name });
  const prize = rng.pick(['medkit', 'ammo_box', 'canned_food', 'painkillers', 'antibiotics', 'fuel_can']);
  return {
    kind: 'looters_fleeing',
    factionId: null,
    title: ev('looters_fleeing.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'chase',
        kind: 'check',
        attr: 'dexterity',
        dc,
        label: ev('looters_fleeing.choices.chase', undefined, locale),
        onSuccess: [{ t: 'gain', defId: prize }, { t: 'access' }],
        onFailure: [
          { t: 'energy', amount: 6, line: ev('looters_fleeing.lines.chaseLose', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'read',
        kind: 'check',
        attr: 'perception',
        dc,
        label: ev('looters_fleeing.choices.read', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.2, line: ev('looters_fleeing.lines.readOk', undefined, locale) },
          { t: 'intel' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.2, line: ev('looters_fleeing.lines.readFail', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'let',
        kind: 'leave',
        label: ev('looters_fleeing.choices.let', undefined, locale),
        onSuccess: [{ t: 'access' }],
      },
    ],
  };
}

function buildSmoke(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'smoke_block', ctx, { name: loc.name });
  return {
    kind: 'smoke_block',
    factionId: null,
    title: ev('smoke_block.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'side',
        kind: 'check',
        attr: 'perception',
        dc,
        label: ev('smoke_block.choices.side', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.3, line: ev('smoke_block.lines.sideOk', undefined, locale) },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.3, line: ev('smoke_block.lines.sideFailTime', undefined, locale) },
          { t: 'deny', line: ev('smoke_block.lines.sideFailDeny', undefined, locale) },
        ],
      },
      {
        id: 'push',
        kind: 'check',
        attr: 'strength',
        dc,
        label: ev('smoke_block.choices.push', undefined, locale),
        onSuccess: [{ t: 'access' }],
        onFailure: [
          { t: 'wound', amount: 8, line: ev('smoke_block.lines.pushFailWound', undefined, locale) },
          { t: 'deny', line: ev('smoke_block.lines.pushFailDeny', undefined, locale) },
        ],
      },
      {
        id: 'wait',
        kind: 'leave',
        label: ev('smoke_block.choices.wait', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.8, line: ev('smoke_block.lines.wait', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: ev('smoke_block.choices.leave', undefined, locale),
        onSuccess: [{ t: 'deny', line: ev('smoke_block.lines.leave', undefined, locale) }],
      },
    ],
  };
}

function buildBeacon(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'distress_beacon', ctx, { name: loc.name });
  return {
    kind: 'distress_beacon',
    factionId: null,
    title: ev('distress_beacon.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'trace',
        kind: 'check',
        attr: 'wits',
        dc,
        label: ev('distress_beacon.choices.trace', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.3, line: ev('distress_beacon.lines.traceOk', undefined, locale) },
          { t: 'intel' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.3, line: ev('distress_beacon.lines.traceFail', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'rush',
        kind: 'leave',
        label: ev('distress_beacon.choices.rush', undefined, locale),
        onSuccess: [
          { t: 'noise', radius: 100, intensity: 2 },
          { t: 'zombies', line: ev('distress_beacon.lines.rushZombies', undefined, locale) },
        ],
      },
      {
        id: 'ignore',
        kind: 'leave',
        label: ev('distress_beacon.choices.ignore', undefined, locale),
        onSuccess: [{ t: 'access' }],
      },
    ],
  };
}

function buildTrader(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'nomad_trader', ctx, { name: loc.name });
  const stock = rng.pick(['medkit', 'ammo_box', 'batteries', 'bandage', 'painkillers']);
  return {
    kind: 'nomad_trader',
    factionId: null,
    title: ev('nomad_trader.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'trade',
        kind: 'pay',
        itemIds: ['canned_food', 'snacks', 'hawker_meal', 'instant_noodles'],
        label: ev('nomad_trader.choices.trade', undefined, locale),
        onSuccess: [{ t: 'gain', defId: stock }, { t: 'access' }],
        onFailure: [
          { t: 'deny', line: ev('nomad_trader.lines.tradeEmpty', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: ev('nomad_trader.choices.leave', undefined, locale),
        onSuccess: [{ t: 'deny', line: ev('nomad_trader.lines.leave', undefined, locale) }],
      },
    ],
  };
}

function buildBarricade(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'car_blockade', ctx, { name: loc.name });
  const opened: EventEffect[] = [{ t: 'mark', mark: { door: true } }, { t: 'access' }];
  return {
    kind: 'car_blockade',
    factionId: null,
    title: ev('car_blockade.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'shift',
        kind: 'check',
        attr: 'strength',
        dc,
        label: ev('car_blockade.choices.shift', undefined, locale),
        onSuccess: [
          { t: 'energy', amount: 10, line: ev('car_blockade.lines.shiftOk', undefined, locale) },
          ...opened,
        ],
        onFailure: [
          { t: 'energy', amount: 10, line: ev('car_blockade.lines.shiftFailEnergy', undefined, locale) },
          { t: 'deny', line: ev('car_blockade.lines.shiftFailDeny', undefined, locale) },
        ],
      },
      {
        id: 'gap',
        kind: 'check',
        attr: 'perception',
        dc,
        label: ev('car_blockade.choices.gap', undefined, locale),
        onSuccess: opened,
        onFailure: [
          { t: 'time', hours: 0.3, line: ev('car_blockade.lines.gapFailTime', undefined, locale) },
          { t: 'deny', line: ev('car_blockade.lines.gapFailDeny', undefined, locale) },
        ],
      },
      {
        id: 'long',
        kind: 'leave',
        label: ev('car_blockade.choices.long', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.9, line: ev('car_blockade.lines.longTime', undefined, locale) },
          { t: 'energy', amount: 12, line: ev('car_blockade.lines.longEnergy', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: ev('car_blockade.choices.leave', undefined, locale),
        onSuccess: [{ t: 'deny', line: ev('car_blockade.lines.leave', undefined, locale) }],
      },
    ],
  };
}

function buildFlooded(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const locale = locOf(ctx);
  const { tell, text } = prose(rng, 'flooded_entry', ctx, { name: loc.name });
  return {
    kind: 'flooded_entry',
    factionId: null,
    title: ev('flooded_entry.title', undefined, locale),
    tell,
    text,
    choices: [
      {
        id: 'wade',
        kind: 'check',
        attr: 'perception',
        dc,
        label: ev('flooded_entry.choices.wade', undefined, locale),
        onSuccess: [
          { t: 'time', hours: 0.3, line: ev('flooded_entry.lines.wadeOk', undefined, locale) },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.3, line: ev('flooded_entry.lines.wadeFailTime', undefined, locale) },
          { t: 'wound', amount: 7, line: ev('flooded_entry.lines.wadeFailWound', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'rush',
        kind: 'leave',
        label: ev('flooded_entry.choices.rush', undefined, locale),
        onSuccess: [
          { t: 'energy', amount: 10, line: ev('flooded_entry.lines.rushEnergy', undefined, locale) },
          { t: 'wound', amount: 5, line: ev('flooded_entry.lines.rushWound', undefined, locale) },
          { t: 'access' },
        ],
      },
      {
        id: 'back',
        kind: 'leave',
        label: ev('flooded_entry.choices.back', undefined, locale),
        onSuccess: [{ t: 'deny', line: ev('flooded_entry.lines.leave', undefined, locale) }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

type Builder = (rng: Rng, loc: LocationState, ctx: EventCtx) => GameEvent;

const BUILDERS: Record<Exclude<EventKind, 'mrt_toll' | 'field_doctor'>, Builder> = {
  faction_shakedown: (rng, loc, ctx) => buildTributeGate(rng, loc, ctx, true),
  faction_checkpoint: buildFeeGate,
  locked_door: buildLockedDoor,
  desperate_survivor: buildSurvivor,
  rival_scavenger: buildRival,
  armed_raider: buildRaider,
  block_tout: buildTout,
  rigged_door: buildRigged,
  quiet_tap: buildTap,
  body_in_the_doorway: buildBody,
  looters_fleeing: buildLooters,
  smoke_block: buildSmoke,
  distress_beacon: buildBeacon,
  nomad_trader: buildTrader,
  car_blockade: buildBarricade,
  flooded_entry: buildFlooded,
};

/**
 * Mandatory gate on occupied ground: fee (−1…+1) or tribute (Bad / Terrible).
 * Clearance already checked by the caller. Sneak / force are frontage actions,
 * not choices inside these events.
 */
export function rollFactionGateEvent(
  rng: Rng,
  loc: LocationState,
  ctx: EventCtx,
): GameEvent | null {
  const faction = loc.factionId;
  if (!faction) return null;
  if (hasFactionClearance(loc, ctx.standing, ctx.day)) return null;
  const band = gateStandingBand(faction, ctx.standing);
  if (band === 'fee') return buildFeeGate(rng, loc, ctx);
  return buildTributeGate(rng, loc, ctx, band === 'terrible');
}

/**
 * Roll a single doorway event for entering an *unclaimed* location (or null
 * for a clear way in). Deterministic given the passed (already-forked) rng.
 *
 * Occupied sites use {@link rollFactionGateEvent} instead — they are NPC hubs,
 * not scavenger doorways.
 */
export function rollPreScavengeEvent(
  rng: Rng,
  loc: LocationState,
  ctx: EventCtx,
): GameEvent | null {
  // Faction ground never scavenges; don't mix locked-door theatre with gates.
  if (loc.factionId) return null;

  const cat = loc.category;
  const cands: [Exclude<EventKind, 'mrt_toll' | 'field_doctor'>, number][] = [];

  if (!loc.doorForced) {
    if (LOCKED_AT.includes(cat)) cands.push(['locked_door', 20]);
    if (RIGGED_AT.includes(cat)) cands.push(['rigged_door', 13]);
  }
  if (RIVAL_AT.includes(cat)) cands.push(['rival_scavenger', 16]);
  if (RAIDER_AT.includes(cat)) cands.push(['armed_raider', 12]);
  if (TOUT_AT.includes(cat)) cands.push(['block_tout', 11]);
  if (TAP_AT.includes(cat)) cands.push(['quiet_tap', 11]);
  if (BODY_AT.includes(cat)) cands.push(['body_in_the_doorway', 12]);
  if (LOOTERS_AT.includes(cat)) cands.push(['looters_fleeing', 13]);
  if (SMOKE_AT.includes(cat)) cands.push(['smoke_block', 11]);
  if (BEACON_AT.includes(cat)) cands.push(['distress_beacon', 11]);
  if (TRADER_AT.includes(cat)) cands.push(['nomad_trader', 6]);
  if (BARRICADE_AT.includes(cat)) cands.push(['car_blockade', 12]);
  if (WET.includes(ctx.weather) && FLOODED_AT.includes(cat)) {
    cands.push(['flooded_entry', 10]);
  }

  const settled = loc.survivorSettledDay ?? -Infinity;
  if (ctx.day - settled >= SURVIVOR_MEMORY_DAYS) cands.push(['desperate_survivor', 10]);

  if (!cands.length) return null;
  if (!rng.chance(doorwayChance(loc, ctx))) return null;

  return BUILDERS[rng.weighted(cands)](rng, loc, ctx);
}

/** The turnstile between a manned platform and the tunnel below it. */
export function mrtTollEvent(locale?: LocaleId): GameEvent {
  const lang = activeLocale(locale);
  const accepted = FACTION_CONFIG.sta.tribute;
  const price = priceList(accepted, lang);
  return {
    kind: 'mrt_toll',
    factionId: 'sta',
    title: ev('mrt_toll.title', undefined, lang),
    tell: ev('mrt_toll.tell', undefined, lang),
    text: ev('mrt_toll.text', undefined, lang),
    choices: [
      {
        id: 'pay',
        kind: 'pay',
        itemIds: accepted,
        label: ev('mrt_toll.choices.pay', { price }, lang),
        // A fare is a fare, but it used to be charged per descent — so a
        // there-and-back cost two. It's a day pass now, stamped at the gate.
        onSuccess: [
          { t: 'standing', delta: 1 },
          { t: 'mark', mark: { tollDays: 1 } },
          { t: 'access' },
        ],
        onFailure: [{ t: 'deny', line: ev('mrt_toll.lines.payEmpty', undefined, lang) }],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: ev('mrt_toll.choices.leave', undefined, lang),
        onSuccess: [{ t: 'deny', line: ev('mrt_toll.lines.leave', undefined, lang) }],
      },
    ],
  };
}

/** What the doctor in a shelter holdout will treat you for, best first. */
export const FIELD_DOCTOR_FEES = ['canned_food', 'army_ration', 'rice_pack', 'instant_noodles'];

/** Hours the doctor keeps you on the mat, and how much each part recovers. */
export const FIELD_DOCTOR_HOURS = 1;
export const FIELD_DOCTOR_HEAL = 35;

/**
 * The doctor behind a shelter door — an offer, not a transaction. Nothing is
 * spent until a choice is made, and walking away costs nothing but the walk.
 */
export function fieldDoctorEvent(rng: Rng, blockName: string, locale?: LocaleId): GameEvent {
  const lang = activeLocale(locale);
  const text = pickFieldDoctorText(rng, lang);
  const price = priceList(FIELD_DOCTOR_FEES, lang);
  return {
    kind: 'field_doctor',
    factionId: null,
    title: ev('field_doctor.title', undefined, lang),
    tell: ev('field_doctor.tell', { name: blockName }, lang),
    text,
    choices: [
      {
        id: 'pay',
        kind: 'pay',
        itemIds: FIELD_DOCTOR_FEES,
        label: ev('field_doctor.choices.pay', { price }, lang),
        onSuccess: [
          { t: 'time', hours: FIELD_DOCTOR_HOURS, line: ev('field_doctor.lines.treatTime', undefined, lang) },
          {
            t: 'treat',
            amount: FIELD_DOCTOR_HEAL,
            line: ev('field_doctor.lines.treat', undefined, lang),
          },
          { t: 'service' },
        ],
        onFailure: [
          { t: 'deny', line: ev('field_doctor.lines.payEmpty', undefined, lang) },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: ev('field_doctor.choices.leave', undefined, lang),
        onSuccess: [
          { t: 'deny', line: ev('field_doctor.lines.leave', undefined, lang) },
        ],
      },
    ],
  };
}

export interface CheckResult {
  roll: number;
  total: number;
  dc: number;
  success: boolean;
}

/** Resolve an attribute check: d20 + attribute vs DC (natural 20 always passes). */
export function rollCheck(
  rng: Rng,
  attrValue: number,
  dc: number,
  checkBonus = 0,
): CheckResult {
  const roll = rng.d20();
  const total = roll + attrValue + checkBonus;
  return { roll, total, dc, success: roll === 20 || total >= dc };
}
