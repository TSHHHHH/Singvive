import type {
  AttributeKey,
  FactionId,
  LocationState,
  PoiCategory,
  TimeOfDay,
  WeatherKind,
} from './types';
import type { Rng } from './rng';
import { itemDef } from './loot';
import { FACTION_CONFIG } from './factions';

export type EventKind =
  | 'locked_door'
  | 'desperate_survivor'
  | 'faction_shakedown'
  | 'mrt_toll'
  | 'rival_scavenger'
  | 'rigged_door'
  | 'quiet_tap'
  | 'body_in_the_doorway';

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

/** Standing at or above this and a faction stops charging you at the door. */
export const STANDING_TRUSTED = 2;
/** Standing at or below this and even the orderly factions open fire. */
export const STANDING_HATED = -2;
export const STANDING_MIN = -3;
export const STANDING_MAX = 3;

export type FactionStanding = Record<Exclude<FactionId, null>, number>;

export const emptyStanding = (): FactionStanding => ({
  idtf: 0,
  pasir_panjang: 0,
  syndicate_88: 0,
  sta: 0,
});

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
  /** The search proceeds. Terminal. */
  | { t: 'access' }
  /** Turned away — no search, no fight. Terminal. */
  | { t: 'deny'; line: string }
  /**
   * Humans, right now. Terminal. `foe` says who: omitted means the event's
   * faction (falling back to the local muscle), while 'scavenger'/'survivor'
   * mean an unaffiliated loner who answers to nobody.
   */
  | { t: 'fight'; foe?: 'scavenger' | 'survivor' }
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
  | { t: 'mark'; mark: DoorwayMark };

const TERMINAL = new Set(['access', 'deny', 'fight', 'zombies']);
export const isTerminal = (e: EventEffect) => TERMINAL.has(e.t);

export interface EventChoice {
  id: string;
  label: string;
  kind: ChoiceKind;
  attr?: AttributeKey; // for 'check'
  dc?: number;
  itemId?: string; // for 'pay'
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
  factionId: FactionId;
}

/** Everything the prose and the gating need to know about right now. */
export interface EventCtx {
  day: number;
  time: TimeOfDay;
  weather: WeatherKind;
  standing: FactionStanding;
}

function dcFor(currentDanger: number): number {
  return 8 + Math.round(currentDanger * 2);
}

/** Would this faction shoot rather than haggle? */
export function factionIsHostile(id: FactionId, standing: FactionStanding): boolean {
  if (!id) return false;
  if (standing[id] <= STANDING_HATED) return true;
  return FACTION_CONFIG[id].hostileByDefault;
}

/** True once a faction knows your face well enough to stop charging you. */
export function factionWavesYouThrough(id: FactionId, standing: FactionStanding): boolean {
  return !!id && standing[id] >= STANDING_TRUSTED;
}

export const clampStanding = (n: number) =>
  Math.max(STANDING_MIN, Math.min(STANDING_MAX, n));

// ---------------------------------------------------------------------------
// Prose pools
// ---------------------------------------------------------------------------

type Pools = { tell: string[]; text: string[]; night?: string[]; wet?: string[] };

const WET: readonly WeatherKind[] = ['rain', 'thunderstorm'];

const PROSE: Record<Exclude<EventKind, 'mrt_toll'>, Pools> = {
  faction_shakedown: {
    tell: [
      'Voices inside — not the dead. The dead don\'t chat.',
      'Someone whistles once as you reach the entrance. A signal.',
      'There\'s a mark sprayed by the door, still tacky.',
      'A shape peels off the wall ahead of you.',
    ],
    text: [
      '{faction} runners step out of the doorway and spread wide. "Toll\'s one {tribute}. Pay, or walk."',
      'Two of {faction}\'s people are already inside {name}, and they saw you first. "One {tribute} and the place is yours for a bit."',
      'One of {faction}\'s lookouts drops down off the ledge, hand out. "You know how this works. One {tribute}."',
      '{faction} has {name} sewn up. The one doing the talking taps a crowbar against her boot. "{tribute}. Then we\'re friends."',
      'Someone in {short} colours blocks the entrance without hurrying about it. "Nothing personal, ah. One {tribute}."',
    ],
    night: [
      'A torch beam pins you in the doorway of {name}. "{short}. One {tribute}, and lower your hands."',
      'They let you get all the way to the entrance before the lights come on. "One {tribute}, and we forget you came at night."',
    ],
    wet: [
      '{faction} has the entrance to {name} tarped over and manned. "Dry inside. One {tribute}."',
    ],
  },
  locked_door: {
    tell: [
      'The main way in is shut, and shut properly.',
      'Someone secured this place before they left.',
      'The doors have been chained from the inside.',
    ],
    text: [
      'A steel security door bars the way into {name}. It can be forced — loudly.',
      'The roller shutter on {name} is down and padlocked. Whoever locked it didn\'t come back out.',
      'Fire door, magnetic lock, dead building. {name} is sealed and it doesn\'t care how badly you need it.',
      'Someone welded a bar across the entrance to {name}. Thorough. Inconvenient.',
      'The doors to {name} are chained. Through the gap you can see shelves — and they look untouched.',
    ],
    night: [
      'In the dark you can barely find the seam of the security door at {name}, let alone the lock.',
    ],
    wet: [
      'The shutter on {name} is streaked with rain and locked fast. Every sound you make here will carry.',
    ],
  },
  desperate_survivor: {
    tell: [
      'Someone is sheltering just inside the entrance.',
      'You\'re not the first one to want in here today.',
      'A cough, close by. Human.',
    ],
    text: [
      'A gaunt figure is huddled inside the doorway of {name}. "Please… you got water?"',
      'Someone has made a nest of cardboard just inside {name}. She doesn\'t get up. "Just a bottle, boss. Anything."',
      'A man steps out of the stairwell with both hands showing, eyeing your pack. "Two days no drink already."',
      'There\'s a kid\'s school bag by the entrance to {name}, and the man wearing it hasn\'t eaten in a while. "Spare something?"',
      'Someone blocks your way into {name} — not with a weapon, just with need. "You look like you\'re doing okay, ah."',
    ],
    night: [
      'A voice out of the dark inside {name}, cracked and dry. "Don\'t shine that at me. Please. You got water?"',
    ],
    wet: [
      'Someone is pressed into the doorway of {name} out of the rain, soaked through anyway. "Water? Clean water, I mean."',
    ],
  },
  rival_scavenger: {
    tell: [
      'Fresh boot prints in the dust, going in. None coming out.',
      'Something falls over inside, and someone swears.',
      'A trolley is wedged in the doorway to hold it open.',
    ],
    text: [
      'Someone else is already working {name} — you can hear them stripping a shelf. They haven\'t seen you yet.',
      'A scavenger in a motorcycle helmet is halfway through {name}, bags at her feet. She looks up. Neither of you moves.',
      'There\'s another survivor inside {name}, filling a duffel fast. Whoever commits first gets the back rooms.',
      'You aren\'t the only one who thought of {name} today. He raises a hand — not a weapon, just a hand.',
    ],
    night: [
      'A torch is sweeping the aisles of {name}, and it isn\'t yours. Whoever holds it is working fast.',
    ],
  },
  rigged_door: {
    tell: [
      'There\'s something wrong with how this door sits.',
      'A thin line of fishing wire catches the light.',
      'Someone left this place ready for visitors.',
    ],
    text: [
      'The entrance to {name} has been rigged — wire at ankle height, and a bundle of something taped behind the frame.',
      'Whoever held {name} last booby-trapped the way in and never came back to disarm it.',
      'A tripwire runs across the doorway of {name}, strung to a cluster of tins. Not lethal. Very loud.',
      '{name} has been made unfriendly on purpose: broken glass set in the frame, and a line running somewhere you can\'t see.',
    ],
    wet: [
      'Rain has soaked the rigging on the door of {name}, but the wire is still taut.',
    ],
  },
  quiet_tap: {
    tell: [
      'You can hear running water. Actual running water.',
      'There\'s a queue. An orderly one.',
      'People are here, and none of them are panicking.',
    ],
    text: [
      'A standpipe behind {name} is still pressurised, and eleven people are queuing at it in the shade. Nobody is pushing.',
      'Someone has rigged a working tap at {name} and made a system of it — a queue, a tally, a woman with a clipboard.',
      'There\'s clean water at {name}, and a line of survivors waiting their turn for it. They watch you decide what kind of person you are.',
    ],
    night: [
      'A single lamp over a working tap at {name}, and a short, patient queue beneath it.',
    ],
  },
  body_in_the_doorway: {
    tell: [
      'Something is lying across the threshold.',
      'The smell reaches you before the doorway does.',
      'Flies. A lot of them, and all in one place.',
    ],
    text: [
      'A body is slumped in the entrance to {name}, pack still on. It has been there a while, and it is wedged.',
      'Someone died in the doorway of {name} with their kit on. Moving them means touching them.',
      'There\'s a corpse across the way into {name} — recent enough to still be carrying, old enough to be part of the floor.',
    ],
    wet: [
      'A body lies in the flooded entrance to {name}, pack half-submerged. The water has not been kind.',
    ],
  },
};

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

/** Pick prose for a kind, weighting in the time-of-day and weather variants. */
function prose(
  rng: Rng,
  kind: Exclude<EventKind, 'mrt_toll'>,
  ctx: EventCtx,
  vars: Record<string, string>,
): { tell: string; text: string } {
  const p = PROSE[kind];
  const pool = [...p.text];
  if (ctx.time === 'night' && p.night) pool.push(...p.night, ...p.night); // twice as likely after dark
  if (p.wet && WET.includes(ctx.weather)) pool.push(...p.wet, ...p.wet);
  return { tell: fill(rng.pick(p.tell), vars), text: fill(rng.pick(pool), vars) };
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

// Which doorways can host which scene. Every non-waypoint category wants at
// least two entries here, or its doorway only ever tells one story.
const RIGGED_AT: PoiCategory[] = ['police', 'hardware', 'industrial', 'fuel'];
const LOCKED_AT: PoiCategory[] = ['police', 'hospital', 'hardware'];
const RIVAL_AT: PoiCategory[] = [
  'supermarket', 'convenience', 'pharmacy', 'hardware', 'foodcourt', 'fuel', 'industrial',
];
// Water points cluster where people already queued for food — and the schools
// were the designated shelters when it fell.
const TAP_AT: PoiCategory[] = ['supermarket', 'foodcourt', 'convenience', 'school'];
const BODY_AT: PoiCategory[] = ['hospital', 'police', 'mrt', 'school'];

/** Odds that *something* is waiting, given anything is eligible at all. */
function doorwayChance(loc: LocationState, ctx: EventCtx): number {
  let p = 0.4 + loc.currentDanger * 0.03;
  if (ctx.time === 'night') p += 0.08;
  return Math.max(0.05, Math.min(0.8, p));
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildShakedown(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const faction = loc.factionId as Exclude<FactionId, null>;
  const cfg = FACTION_CONFIG[faction];
  const tribute = itemDef(cfg.tribute);
  const hostile = factionIsHostile(faction, ctx.standing);
  const { tell, text } = prose(rng, 'faction_shakedown', ctx, {
    name: loc.name,
    faction: cfg.name,
    short: cfg.shortName,
    tribute: tribute.name,
  });
  return {
    kind: 'faction_shakedown',
    factionId: faction,
    title: `${cfg.shortName} Shakedown`,
    tell,
    text,
    choices: [
      {
        id: 'pay',
        kind: 'pay',
        itemId: cfg.tribute,
        label: `Pay 1× ${tribute.name}`,
        // Coin buys goodwill, and goodwill is the thing that compounds.
        onSuccess: [
          { t: 'standing', delta: 1 },
          { t: 'mark', mark: { tollDays: 1 } },
          { t: 'access' },
        ],
        onFailure: hostile
          ? [{ t: 'standing', delta: -1 }, { t: 'fight' }]
          : [{ t: 'standing', delta: -1 }, { t: 'deny', line: 'Empty hands buy nothing. They turn you around.' }],
      },
      {
        id: 'talk',
        kind: 'check',
        attr: 'wits',
        dc,
        label: `Talk your way past (Wits DC ${dc})`,
        // Words get you in today and buy you nothing beyond today.
        onSuccess: [{ t: 'mark', mark: { tollDays: 0 } }, { t: 'access' }],
        onFailure: hostile
          ? [{ t: 'fight' }]
          : [{ t: 'standing', delta: -1 }, { t: 'deny', line: 'They\'ve heard better. Out you go.' }],
      },
      hostile
        ? {
            id: 'fight',
            kind: 'fight',
            label: 'Refuse — draw down',
            onSuccess: [{ t: 'standing', delta: -2 }, { t: 'fight' }],
          }
        : {
            id: 'leave',
            kind: 'leave',
            label: 'Back off (skip search)',
            onSuccess: [{ t: 'deny', line: 'You back off. No hard feelings either way.' }],
          },
    ],
  };
}

function buildLockedDoor(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = prose(rng, 'locked_door', ctx, { name: loc.name });
  // A door you get through once is a door that stays got-through — every route
  // in marks it, so the win is permanent regardless of how you managed it.
  const opened: EventEffect[] = [{ t: 'mark', mark: { door: true } }, { t: 'access' }];
  const racket: EventEffect[] = [
    { t: 'noise', radius: 140, intensity: 2 },
    { t: 'zombies', line: 'The racket draws something out.' },
  ];
  return {
    kind: 'locked_door',
    factionId: null,
    title: 'Locked Security Door',
    tell,
    text,
    choices: [
      { id: 'pry', kind: 'check', attr: 'strength', dc, label: `Pry it open (Strength DC ${dc})`,
        onSuccess: opened, onFailure: racket },
      { id: 'pick', kind: 'check', attr: 'wits', dc, label: `Pick the lock (Wits DC ${dc})`,
        onSuccess: opened,
        // Picking quietly fails quietly — you just lose the time.
        onFailure: [
          { t: 'time', hours: 0.5, line: 'You work the lock until your hands cramp. It doesn\'t give.' },
          { t: 'deny', line: 'The door wins.' },
        ] },
      { id: 'find', kind: 'check', attr: 'perception', dc, label: `Find a side way (Perception DC ${dc})`,
        onSuccess: [
          { t: 'time', hours: 0.4, line: 'You circle the building and find a service door nobody thought about.' },
          ...opened,
        ],
        onFailure: [
          { t: 'time', hours: 0.4, line: 'You circle the whole building for nothing.' },
          { t: 'energy', amount: 5, line: '' },
          { t: 'deny', line: 'No way in but the hard way, and not today.' },
        ] },
      { id: 'leave', kind: 'leave', label: 'Leave it be',
        onSuccess: [{ t: 'deny', line: 'You leave it be.' }] },
    ],
  };
}

function buildSurvivor(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = prose(rng, 'desperate_survivor', ctx, { name: loc.name });
  // However this goes, the person at this door has been dealt with.
  const settled: EventEffect = { t: 'mark', mark: { survivorSettled: true } };
  return {
    kind: 'desperate_survivor',
    factionId: null,
    title: 'The Desperate Survivor',
    tell,
    text,
    choices: [
      {
        id: 'give',
        kind: 'pay',
        itemId: 'water_bottle',
        label: 'Give 1× Bottled Water',
        // Kindness costs a bottle and buys you what they know about the place.
        onSuccess: [
          settled,
          { t: 'intel' },
          { t: 'access' },
        ],
        onFailure: [settled, { t: 'fight', foe: 'survivor' }],
      },
      { id: 'reason', kind: 'check', attr: 'wits', dc, label: `Reason with them (Wits DC ${dc})`,
        onSuccess: [settled, { t: 'access' }],
        onFailure: [settled, { t: 'fight', foe: 'survivor' }] },
      { id: 'scare', kind: 'check', attr: 'perception', dc, label: `Scare them off (Perception DC ${dc})`,
        onSuccess: [settled, { t: 'noise', radius: 90, intensity: 1 }, { t: 'access' }],
        onFailure: [settled, { t: 'fight', foe: 'survivor' }] },
      { id: 'refuse', kind: 'fight', label: 'Refuse them',
        onSuccess: [settled, { t: 'fight', foe: 'survivor' }] },
    ],
  };
}

function buildRival(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = prose(rng, 'rival_scavenger', ctx, { name: loc.name });
  const prize = rng.pick(['medkit', 'ammo_box', 'toolbox', 'antibiotics', 'fuel_can']);
  return {
    kind: 'rival_scavenger',
    factionId: null,
    title: 'Someone Got Here First',
    tell,
    text,
    choices: [
      {
        id: 'race',
        kind: 'check',
        attr: 'dexterity',
        dc,
        label: `Race them for the back rooms (Dexterity DC ${dc})`,
        // Both outcomes let you in. What's at stake is who got the good stuff.
        onSuccess: [
          { t: 'gain', defId: prize },
          { t: 'energy', amount: 8, line: 'You get there first, and you\'re winded for it.' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'energy', amount: 8, line: 'They know the floor better than you do. By the time you reach the back, it\'s bare.' },
          { t: 'access' },
        ],
      },
      {
        id: 'split',
        kind: 'leave',
        label: 'Call out — split the place',
        // No roll: cooperating always works. It just costs you the clock.
        onSuccess: [
          { t: 'time', hours: 0.5, line: 'You each take a half and work it in silence. It\'s almost companionable.' },
          { t: 'gain', defId: 'water_bottle' },
          { t: 'access' },
        ],
      },
      {
        id: 'watch',
        kind: 'check',
        attr: 'perception',
        dc,
        label: `Hang back and read the place (Perception DC ${dc})`,
        onSuccess: [
          { t: 'time', hours: 0.6, line: 'You wait them out from the stairwell and learn the building for free.' },
          { t: 'intel' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.6, line: 'You wait them out and learn nothing except that your legs hurt.' },
          { t: 'access' },
        ],
      },
      { id: 'confront', kind: 'fight', label: 'Run them off',
        onSuccess: [{ t: 'fight', foe: 'scavenger' }] },
    ],
  };
}

function buildRigged(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = prose(rng, 'rigged_door', ctx, { name: loc.name });
  return {
    kind: 'rigged_door',
    factionId: null,
    title: 'The Door Is Rigged',
    tell,
    text,
    choices: [
      {
        id: 'disarm',
        kind: 'check',
        attr: 'perception',
        dc: dc + 1,
        label: `Trace the wire and disarm it (Perception DC ${dc + 1})`,
        onSuccess: [
          { t: 'gain', defId: 'scrap_metal' },
          { t: 'mark', mark: { door: true } },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'wound', amount: 9, line: 'The frame comes apart with a bang and takes a piece of you with it.' },
          { t: 'noise', radius: 200, intensity: 3 },
          { t: 'zombies', line: 'Every dead thing on the block heard that.' },
        ],
      },
      {
        id: 'power',
        kind: 'check',
        attr: 'wits',
        dc,
        label: `Work out what it's tied to (Wits DC ${dc})`,
        onSuccess: [
          { t: 'time', hours: 0.5, line: 'You follow the line back, find the anchor, and pull it slack.' },
          { t: 'mark', mark: { door: true } },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.5, line: 'You lose half an hour to a puzzle you can\'t solve.' },
          { t: 'deny', line: 'Not worth losing a hand over.' },
        ],
      },
      {
        id: 'around',
        kind: 'leave',
        label: 'Go the long way round (slow, safe)',
        // Always works. The cost is the clock and your legs — which, late in a
        // run with the horde rising, is a real price.
        onSuccess: [
          { t: 'time', hours: 1, line: 'You give the door a wide berth and let yourself in through a window on the far side.' },
          { t: 'energy', amount: 12, line: '' },
          { t: 'access' },
        ],
      },
      { id: 'leave', kind: 'leave', label: 'Not worth it',
        onSuccess: [{ t: 'deny', line: 'You back out the way you came.' }] },
    ],
  };
}

function buildTap(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const { tell, text } = prose(rng, 'quiet_tap', ctx, { name: loc.name });
  const holder = loc.factionId && loc.factionId !== 'sta' ? loc.factionId : null;
  return {
    kind: 'quiet_tap',
    factionId: holder,
    title: 'The Tap Still Runs',
    tell,
    text,
    choices: [
      {
        id: 'queue',
        kind: 'leave',
        label: 'Take your place in the queue',
        // The patient, decent option. Costs an hour, and an hour is not free.
        onSuccess: [
          { t: 'time', hours: 1, line: 'You wait your turn like everyone else. It takes an hour and nobody thanks you for it.' },
          { t: 'gain', defId: 'water_bottle', count: 2 },
          { t: 'standing', delta: 1 },
          { t: 'access' },
        ],
      },
      {
        id: 'trade',
        kind: 'pay',
        itemId: 'canned_food',
        label: 'Trade 1× Canned Food for a fill',
        onSuccess: [
          { t: 'gain', defId: 'water_bottle', count: 2 },
          { t: 'gain', defId: 'isotonic' },
          { t: 'standing', delta: 1 },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'deny', line: 'You\'ve nothing to trade, and they\'ve nothing spare for you.' },
        ],
      },
      {
        id: 'push',
        kind: 'fight',
        label: 'Push to the front',
        // Taking water off a queue is the fastest way to be remembered badly.
        onSuccess: [
          { t: 'gain', defId: 'water_bottle', count: 2 },
          { t: 'standing', delta: -2 },
          { t: 'fight' },
        ],
      },
      { id: 'leave', kind: 'leave', label: 'Leave them to it',
        onSuccess: [{ t: 'deny', line: 'You leave the queue to its water and move on.' }] },
    ],
  };
}

function buildBody(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = prose(rng, 'body_in_the_doorway', ctx, { name: loc.name });
  const carried = rng.pick(['bandage', 'painkillers', 'torch', 'batteries', 'canned_food', 'ammo_box']);
  return {
    kind: 'body_in_the_doorway',
    factionId: null,
    title: 'Body in the Doorway',
    tell,
    text,
    choices: [
      {
        id: 'strip',
        kind: 'check',
        attr: 'dexterity',
        dc,
        label: `Go through their pack (Dexterity DC ${dc})`,
        // You get the kit either way. Failure is about what hears you get it.
        onSuccess: [{ t: 'gain', defId: carried }, { t: 'access' }],
        onFailure: [
          { t: 'gain', defId: carried },
          { t: 'noise', radius: 120, intensity: 2 },
          { t: 'zombies', line: 'The body comes free all at once, and the clatter carries.' },
        ],
      },
      {
        id: 'read',
        kind: 'check',
        attr: 'wits',
        dc,
        label: `Work out what killed them (Wits DC ${dc})`,
        onSuccess: [
          { t: 'time', hours: 0.3, line: 'Bite on the forearm, defensive. Whatever did it went back inside.' },
          { t: 'intel' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.3, line: 'You learn nothing except that you didn\'t want to look that closely.' },
          { t: 'access' },
        ],
      },
      {
        id: 'step',
        kind: 'leave',
        label: 'Step over and get on with it',
        onSuccess: [{ t: 'access' }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

type Builder = (rng: Rng, loc: LocationState, ctx: EventCtx) => GameEvent;

const BUILDERS: Record<Exclude<EventKind, 'mrt_toll'>, Builder> = {
  faction_shakedown: buildShakedown,
  locked_door: buildLockedDoor,
  desperate_survivor: buildSurvivor,
  rival_scavenger: buildRival,
  rigged_door: buildRigged,
  quiet_tap: buildTap,
  body_in_the_doorway: buildBody,
};

/**
 * Roll a single doorway event for entering a location (or null for a clear way
 * in). Deterministic given the passed (already-forked) rng.
 *
 * Every eligible kind goes into a weighted pool rather than a priority list,
 * so a faction site is a shakedown *often* rather than *always*. Anything the
 * site already remembers about you — a forced door, a toll paid, a survivor
 * dealt with, a faction that likes you — drops that kind out of the pool.
 */
export function rollPreScavengeEvent(
  rng: Rng,
  loc: LocationState,
  ctx: EventCtx,
): GameEvent | null {
  const cat = loc.category;
  const cands: [Exclude<EventKind, 'mrt_toll'>, number][] = [];

  const faction = loc.factionId;
  const tollGood = (loc.tollPaidThroughDay ?? -1) >= ctx.day;
  if (
    faction &&
    faction !== 'sta' &&
    loc.isFactionRevealed &&
    !tollGood &&
    !factionWavesYouThrough(faction, ctx.standing)
  ) {
    cands.push(['faction_shakedown', 30]);
  }

  if (!loc.doorForced) {
    if (LOCKED_AT.includes(cat)) cands.push(['locked_door', 20]);
    if (RIGGED_AT.includes(cat)) cands.push(['rigged_door', 13]);
  }
  if (RIVAL_AT.includes(cat)) cands.push(['rival_scavenger', 16]);
  if (TAP_AT.includes(cat)) cands.push(['quiet_tap', 11]);
  if (BODY_AT.includes(cat)) cands.push(['body_in_the_doorway', 12]);

  const settled = loc.survivorSettledDay ?? -Infinity;
  if (ctx.day - settled >= SURVIVOR_MEMORY_DAYS) cands.push(['desperate_survivor', 10]);

  if (!cands.length) return null;
  if (!rng.chance(doorwayChance(loc, ctx))) return null;

  return BUILDERS[rng.weighted(cands)](rng, loc, ctx);
}

/** The MRT toll gate event when using fast travel. */
export function mrtTollEvent(): GameEvent {
  const tribute = itemDef(FACTION_CONFIG.sta.tribute);
  return {
    kind: 'mrt_toll',
    factionId: 'sta',
    title: 'STA Turnstile Toll',
    tell: 'The turnstiles are manned.',
    text: `An STA marshal bars the turnstile. "Tunnel's not free — one ${tribute.name} for passage."`,
    choices: [
      {
        id: 'pay',
        kind: 'pay',
        itemId: FACTION_CONFIG.sta.tribute,
        label: `Pay 1× ${tribute.name}`,
        onSuccess: [{ t: 'standing', delta: 1 }, { t: 'access' }],
        onFailure: [{ t: 'deny', line: 'No fare, no tunnel. You take the stairs back up.' }],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: 'Take the surface instead',
        onSuccess: [{ t: 'deny', line: 'You take the surface instead.' }],
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
export function rollCheck(rng: Rng, attrValue: number, dc: number): CheckResult {
  const roll = rng.d20();
  const total = roll + attrValue;
  return { roll, total, dc, success: roll === 20 || total >= dc };
}
