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
}

/** Attribute-check DC scaled off the site's current danger. */
export function dcFor(currentDanger: number): number {
  return 8 + Math.round(currentDanger * 2);
}

// ---------------------------------------------------------------------------
// Prose pools
// ---------------------------------------------------------------------------

type Pools = { tell: string[]; text: string[]; night?: string[]; wet?: string[] };

const WET: readonly WeatherKind[] = ['rain', 'thunderstorm'];

const PROSE: Record<Exclude<EventKind, 'mrt_toll' | 'field_doctor'>, Pools> = {
  faction_checkpoint: {
    tell: [
      'There\'s a table across the entrance, and someone sitting at it.',
      'Someone raises a hand as you approach — not a weapon. A hand.',
      'A ledger sits open on a crate by the door of {name}.',
      'They\'ve put a stool in the doorway. That\'s the whole gate.',
    ],
    text: [
      '{faction} keeps a book at {name}. "{tribute} gets you on the grounds — and your name in the right column."',
      'The one on the gate at {name} taps the open page. "Entrance fee. One {tribute}. Then we know you."',
      'A {short} volunteer looks you over from behind a folding table. "Don\'t know your face. One {tribute} for the register and you can go in."',
      '"Sign in," says the gate. "One {tribute}. Or turn around."',
    ],
    night: [
      'A lamp over the ledger at {name}. "{short}. One {tribute} and you\'re on the list."',
    ],
    wet: [
      'They\'ve pulled the table under the awning. "{tribute} and you can come in out of this."',
    ],
  },
  faction_shakedown: {
    tell: [
      'Voices inside — not the dead. The dead don\'t chat.',
      'Someone whistles once as you reach the entrance. A signal.',
      'There\'s a mark sprayed by the door, still tacky.',
      'A shape peels off the wall ahead of you.',
    ],
    text: [
      '{faction} blockers fill the doorway of {name}. "Tribute. One {tribute}. Then maybe we talk."',
      'Two of {faction}\'s people are already inside {name}, and they saw you first. "One {tribute} — for the damage."',
      'One of {faction}\'s lookouts drops down off the ledge, hand out. "You owe us. One {tribute}."',
      '{faction} has {name} sewn up. The one doing the talking taps a crowbar against her boot. "{tribute}. Repair what you broke."',
      'Someone in {short} colours blocks the entrance without hurrying about it. "Nothing personal. One {tribute}."',
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
  armed_raider: {
    tell: [
      'Someone is posted at the entrance like they own it.',
      'A rifle sling creaks. Whoever\'s inside is not scavenging quietly.',
      'Fresh brass on the step. Recent work.',
    ],
    text: [
      'A raider has claimed the doorway of {name}, kit stacked behind him. "Walk away, or pay in blood."',
      'Someone with a parang and a stolen vest is screening {name}. He\'s already decided you\'re competition.',
      'An armed crew of one is stripping {name} methodically. He looks up mid-cut and doesn\'t bother with a greeting.',
      'The entrance to {name} is blocked by someone who treats looting like a job with overtime.',
    ],
    night: [
      'A red laser dots the frame of {name} for half a second, then vanishes. Someone is hunting this block.',
    ],
  },
  block_tout: {
    tell: [
      'Someone is hanging around the entrance like it\'s theirs to tax.',
      'A voice calls out before you reach the door — friendly, too friendly.',
      'There\'s a folding stool by the doorway. Occupied.',
    ],
    text: [
      'A tout at {name} opens with a smile and a price. "Entry fee, ah. Small one. Or we have a problem."',
      'Someone has set up shop in the doorway of {name} — no badge, just nerve. "You want in, you talk to me."',
      'A block tout blocks {name} with nothing but attitude and a scrap of cardboard that says ENTRY. He means it.',
      'He\'s not a guard and not a scavenger — just a man charging for the privilege of walking into {name}.',
    ],
    night: [
      'A cigarette tip glows in the doorway of {name}. "Night rate," someone says. "Still cheap."',
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
  looters_fleeing: {
    tell: [
      'Someone bursts out of the entrance — wrong way, wrong speed.',
      'A crash inside, then footsteps coming at you.',
      'The door swings open and someone nearly runs you down.',
      'You hear a bag hit the floor, then someone cursing their way out.',
    ],
    text: [
      'A scavenger bolts out of {name} with both arms full and nearly bowls you over. Whatever they grabbed is still in the building.',
      'Someone tears past you out of {name}, kit bouncing. The back rooms might still have something.',
      'A figure stumbles out of {name} clutching a duffel — they saw you too late to stop.',
      'Wrong-way traffic at {name}: someone exits at a sprint, leaving the place open behind them.',
    ],
    night: [
      'A torch beam swings out of {name} and someone runs without looking. The door stays open.',
    ],
  },
  smoke_block: {
    tell: [
      'Smoke curls out from under the door.',
      'The air at the entrance tastes of burnt plastic.',
      'Something inside is still smouldering.',
      'You cough before you reach the handle.',
    ],
    text: [
      'Smoke pours from the entrance to {name}. Something burned in there and never quite stopped.',
      'The doorway of {name} is hazy with smoke — not a bonfire, a kitchen or a stall gone wrong.',
      'You can barely see the frame of {name} through the smoke. It might clear. It might not.',
      'Burnt oil and charred plastic hang in the air at {name}. Going in blind is a bad idea.',
    ],
    night: [
      'An orange glow flickers behind the smoke at {name}. Still hot in there.',
    ],
    wet: [
      'Rain damps the smoke at {name} but the air inside is still wrong.',
    ],
  },
  distress_beacon: {
    tell: [
      'A radio crackles somewhere inside — on a loop.',
      'You hear a recorded message, tinny and repeating.',
      'Someone left a beacon running. It hasn\'t been switched off.',
      'A siren wails once, then a voice on a speaker.',
    ],
    text: [
      'A distress beacon is still broadcasting from inside {name}. "…anyone receiving… coordinates…"',
      'A PA system at {name} loops a pre-recorded SOS. Someone wanted to be found.',
      'The radio desk at {name} is still transmitting. Static, then a voice, then static again.',
      'An emergency beacon at {name} hasn\'t given up yet. The message repeats every thirty seconds.',
    ],
    night: [
      'In the dark the beacon at {name} is the only thing still working.',
    ],
    wet: [
      'Rain drums the roof while the beacon at {name} keeps calling.',
    ],
  },
  nomad_trader: {
    tell: [
      'Someone has set up a mat by the entrance — not scavenging, trading.',
      'A pack is open on the step. Someone is counting stock.',
      'There\'s a handwritten price list taped to the doorframe.',
      'You smell cooking oil and hear someone haggling with nobody.',
    ],
    text: [
      'A travelling merchant has camped the entrance to {name}. "Trade only. I don\'t bite unless you do."',
      'Someone has turned the doorway of {name} into a stall — small stock, fair prices, no questions.',
      'A nomad trader spreads goods on a tarp at {name}. "Food for medicine. Batteries for tins. You pick."',
      'The entrance to {name} smells of someone else\'s cooking. They\'ve got a mat, a scale, and a smile that doesn\'t reach their eyes.',
    ],
    night: [
      'A lamp over a travelling trader at {name}. "Night rate\'s the same. Food talks."',
    ],
  },
  car_blockade: {
    tell: [
      'Abandoned cars choke the entrance.',
      'Someone lined vehicles across the way in — bumper to bumper.',
      'The driveway is a parking lot nobody can leave.',
      'Tyres and metal block the only way in.',
    ],
    text: [
      'Abandoned cars barricade the entrance to {name} — bumper to bumper, keys gone, doors locked.',
      'Someone pushed three vehicles across the way into {name} and walked away.',
      'The forecourt of {name} is a junk barrier of stalled cars. There might be a gap if you look.',
      'A barricade of abandoned vehicles blocks {name}. Thorough. Not impassable.',
    ],
    night: [
      'In the dark the car barricade at {name} is just shapes and metal.',
    ],
    wet: [
      'Rain slicks the bonnets blocking {name}. Every surface is slippery.',
    ],
  },
  flooded_entry: {
    tell: [
      'Water pours out when you push the door.',
      'The entrance is ankle-deep and rising.',
      'Someone\'s sandbags didn\'t hold.',
      'You hear water moving inside before you see it.',
    ],
    text: [
      'The entrance to {name} is knee-deep in floodwater — drain runoff, or something worse backed up inside.',
      'Monsoon water has pooled at {name} and nobody drained it. The way in is a wade.',
      'A blocked drain turned the doorway of {name} into a wading pool. The shelves might still be dry.',
      'Floodwater fills the lobby of {name}. Whatever\'s worth taking is above the waterline — if you can reach it.',
    ],
    wet: [
      'The rain hasn\'t stopped and neither has the water at {name}. It\'s worse than yesterday.',
    ],
  },
};

const FACTION_GATE: Partial<
  Record<Exclude<FactionId, null>, Partial<Record<'faction_checkpoint' | 'faction_shakedown', Pools>>>
> = {
  muster: {
    faction_checkpoint: {
      tell: [
        'A folding table, a ledger, and someone who still stands like they\'re on duty.',
        'A clipboard comes up as you approach — not a rifle. A clipboard.',
        'They\'ve chalked a queue line on the ground in front of {name}.',
      ],
      text: [
        'The Muster keeps a book at {name}. "Name in the right column. One {tribute}. Then we know you."',
        'An NSman in mixed kit looks you over. "Managed order. One {tribute} for the register."',
        '"Have you served?" The ledger is already open. "One {tribute} either way."',
      ],
      night: [
        'A lamp over the ledger at {name}. "Muster. One {tribute} and you\'re on the list."',
      ],
      wet: [
        'They\'ve pulled the table under the school porch. "{tribute} and you can come in out of this."',
      ],
    },
  },
  gotong: {
    faction_checkpoint: {
      tell: [
        'Steam, a queue, and someone with a ladle who is also the gate.',
        'A plastic stool in the doorway of {name}. The auntie on it is not moving.',
        'They\'ve strung a rope across the wet-market entrance. People are waiting anyway.',
      ],
      text: [
        'Gotong Royong holds {name}. "Eat first, then we talk. One {tribute} for the pot."',
        'A stallholder wipes her hands. "We pool what we have. One {tribute} and you can come in."',
        '"This is neighbours\' food. One {tribute}. Don\'t bring trouble to the table."',
      ],
      night: [
        'A pot still going at {name}. "Gotong. One {tribute} and you\'re fed after."',
      ],
      wet: [
        'They\'ve pulled the queue under the tarpaulin. "{tribute} and you can come in out of this."',
      ],
    },
  },
  sta: {
    faction_checkpoint: {
      tell: [
        'A chain at waist height across the unpaid side of the gate.',
        'Someone in a high-vis vest that used to mean something is sitting on the turnstile.',
        'The barrier at {name} is down. A marshal is the only thing moving.',
      ],
      text: [
        'STA has the gate at {name} chained. "Tunnel\'s not free. One {tribute}."',
        'A marshal taps the turnstile. "Fare. One {tribute}. Then you can go down."',
        '"Platform\'s manned. One {tribute} and you\'re through."',
      ],
      night: [
        'A torch beam off the tiles at {name}. "STA. One {tribute} and you can go down."',
      ],
      wet: [
        'Rain drums the concourse. "{tribute} and you can come in out of this — the stairs stay dry."',
      ],
    },
  },
  syndicate_88: {
    faction_checkpoint: {
      tell: [
        'The whistle is friendlier than last time. Still a whistle.',
        'Someone at {name} nods you toward the stool.',
      ],
      text: [
        'The 88 have a book of their own at {name}. "You\'re on it. One {tribute} anyway."',
        'A runner at the void deck of {name} holds out a palm. "Known is not free. One {tribute}."',
      ],
    },
    faction_shakedown: {
      tell: [
        'A whistle from the void deck. Not a bird.',
        'Someone peels off a pillar at {name}, unhurried.',
        'There\'s a mark sprayed by the door, still tacky.',
      ],
      text: [
        '88 blockers fill the doorway of {name}. "Tribute. One {tribute}. Then maybe we talk."',
        'Two of the Syndicate are already inside {name}. "One {tribute} — for the damage."',
        'A lookout drops down off the ledge, hand out. "You owe the decks. One {tribute}."',
      ],
      night: [
        'A torch beam pins you in the doorway of {name}. "88. One {tribute}, and lower your hands."',
      ],
      wet: [
        'They\'ve tarped the entrance. "Dry inside. One {tribute}."',
      ],
    },
  },
};

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

/** Pick prose for a kind, weighting in the time-of-day and weather variants. */
function prose(
  rng: Rng,
  kind: Exclude<EventKind, 'mrt_toll' | 'field_doctor'>,
  ctx: EventCtx,
  vars: Record<string, string>,
  factionId?: FactionId,
): { tell: string; text: string } {
  const overlay =
    factionId && (kind === 'faction_checkpoint' || kind === 'faction_shakedown')
      ? FACTION_GATE[factionId]?.[kind]
      : undefined;
  const p = overlay ?? PROSE[kind];
  const pool = [...p.text];
  if (ctx.time === 'night' && p.night) pool.push(...p.night, ...p.night);
  if (p.wet && WET.includes(ctx.weather)) pool.push(...p.wet, ...p.wet);
  return { tell: fill(rng.pick(p.tell), vars), text: fill(rng.pick(pool), vars) };
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

/**
 * Lawful fee gate (−1…+1). Sneak / force live on the frontage before this
 * scene — here the only ask is the introduction fee, or walking away.
 */
function buildFeeGate(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const faction = loc.factionId as Exclude<FactionId, null>;
  const cfg = FACTION_CONFIG[faction];
  const tribute = itemDef(cfg.tribute[0]);
  const { tell, text } = prose(rng, 'faction_checkpoint', ctx, {
    name: loc.name,
    faction: cfg.name,
    short: cfg.shortName,
    tribute: tribute.name,
  }, faction);
  return {
    kind: 'faction_checkpoint',
    factionId: faction,
    title: `${cfg.shortName} Gate`,
    tell,
    text,
    choices: [
      {
        id: 'pay',
        kind: 'pay',
        itemIds: cfg.tribute,
        label: `Pay entrance — ${priceList(cfg.tribute)}`,
        onSuccess: [
          { t: 'standing', delta: 1 },
          { t: 'mark', mark: { tollDays: 7 } },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'deny', line: 'Empty hands. They shrug, not unkindly, and point you back the way you came.' },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: 'Back off',
        onSuccess: [{ t: 'deny', line: 'You step back from the table. They don\'t follow.' }],
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
  const tribute = itemDef(cfg.tribute[0]);
  const { tell, text } = prose(rng, 'faction_shakedown', ctx, {
    name: loc.name,
    faction: cfg.name,
    short: cfg.shortName,
    tribute: tribute.name,
  }, faction);
  const choices: EventChoice[] = [
    {
      id: 'pay',
      kind: 'pay',
      itemIds: cfg.tribute,
      label: `Give tribute — ${priceList(cfg.tribute)}`,
      onSuccess: [
        { t: 'standing', delta: 1 },
        { t: 'mark', mark: { tollDays: 1 } },
        { t: 'access' },
      ],
      onFailure: [
        { t: 'deny', line: 'Empty hands buy nothing. They turn you around.' },
      ],
    },
  ];
  if (terrible) {
    choices.push({
      id: 'refuse',
      kind: 'fight',
      label: 'Refuse — draw down',
      onSuccess: [{ t: 'trespass' }],
    });
  }
  choices.push({
    id: 'leave',
    kind: 'leave',
    label: 'Back off',
    onSuccess: [{ t: 'deny', line: 'You leave before tribute becomes blood.' }],
  });
  return {
    kind: 'faction_shakedown',
    factionId: faction,
    title: terrible ? `${cfg.shortName} Demands Tribute` : `${cfg.shortName} Tribute`,
    tell,
    text,
    choices,
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
      { id: 'pry', kind: 'check', attr: 'strength', dc, label: `Pry it open`,
        onSuccess: opened, onFailure: racket },
      { id: 'pick', kind: 'check', attr: 'wits', dc, label: `Pick the lock`,
        onSuccess: opened,
        // Picking quietly fails quietly — you just lose the time.
        onFailure: [
          { t: 'time', hours: 0.5, line: 'You work the lock until your hands cramp. It doesn\'t give.' },
          { t: 'deny', line: 'The door wins.' },
        ] },
      { id: 'find', kind: 'check', attr: 'perception', dc, label: `Find a side way`,
        onSuccess: [
          { t: 'time', hours: 0.4, line: 'You circle the building and find a service door nobody thought about.' },
          ...opened,
        ],
        onFailure: [
          { t: 'time', hours: 0.4, line: 'You circle the whole building for nothing.' },
          { t: 'energy', amount: 5, line: 'The circuit costs you. Legs heavy, nothing gained.' },
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
        // Thirst first, but someone this far gone will take a tin.
        itemIds: ['water_bottle', 'isotonic', 'canned_food'],
        label: 'Give 1× Bottled Water, Isotonic Drink or Canned Food',
        // Kindness costs a bottle and buys you what they know about the place.
        onSuccess: [
          settled,
          { t: 'intel' },
          { t: 'access' },
        ],
        onFailure: [settled, { t: 'fight', foe: 'survivor' }],
      },
      { id: 'reason', kind: 'check', attr: 'wits', dc, label: `Reason with them`,
        onSuccess: [settled, { t: 'access' }],
        onFailure: [settled, { t: 'fight', foe: 'survivor' }] },
      { id: 'scare', kind: 'check', attr: 'perception', dc, label: `Scare them off`,
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
        label: `Race them for the back rooms`,
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
        label: `Hang back and read the place`,
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

function buildRaider(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger) + 1;
  const { tell, text } = prose(rng, 'armed_raider', ctx, { name: loc.name });
  return {
    kind: 'armed_raider',
    factionId: null,
    title: 'Armed Claim',
    tell,
    text,
    choices: [
      {
        id: 'sneak',
        kind: 'check',
        attr: 'dexterity',
        dc: dc + 1,
        label: 'Slip past while they\'re busy',
        onSuccess: [
          { t: 'access' },
        ],
        onFailure: [
          { t: 'fight', foe: 'raider' },
        ],
      },
      {
        id: 'bluff',
        kind: 'check',
        attr: 'wits',
        dc,
        label: 'Talk like you belong here',
        onSuccess: [
          { t: 'time', hours: 0.3, line: 'You sell a story about a bigger crew coming. They clear a lane.' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'fight', foe: 'raider' },
        ],
      },
      {
        id: 'pay',
        kind: 'pay',
        itemIds: ['canned_food', 'ammo_box', 'painkillers', 'jewellery'],
        label: 'Buy passage with supplies',
        onSuccess: [
          { t: 'access' },
        ],
        onFailure: [
          { t: 'fight', foe: 'raider' },
        ],
      },
      {
        id: 'fight',
        kind: 'fight',
        label: 'Take the doorway',
        onSuccess: [{ t: 'fight', foe: 'raider' }],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: 'Back off',
        onSuccess: [{ t: 'deny', line: 'You leave them the claim.' }],
      },
    ],
  };
}

function buildTout(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = prose(rng, 'block_tout', ctx, { name: loc.name });
  return {
    kind: 'block_tout',
    factionId: null,
    title: 'Doorway Tax',
    tell,
    text,
    choices: [
      {
        id: 'pay',
        kind: 'pay',
        itemIds: ['snacks', 'soft_drink', 'water_bottle', 'canned_food'],
        label: 'Pay the nonsense fee',
        onSuccess: [
          { t: 'access' },
        ],
        onFailure: [
          { t: 'fight', foe: 'tout' },
        ],
      },
      {
        id: 'stare',
        kind: 'check',
        attr: 'perception',
        dc,
        label: 'Stare them down',
        onSuccess: [
          { t: 'noise', radius: 60, intensity: 1 },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'fight', foe: 'tout' },
        ],
      },
      {
        id: 'fight',
        kind: 'fight',
        label: 'Make it a problem',
        onSuccess: [{ t: 'fight', foe: 'tout' }],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: 'Find another door',
        onSuccess: [{ t: 'deny', line: 'You leave him his cardboard throne.' }],
      },
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
        label: `Trace the wire and disarm it`,
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
        label: `Work out what it's tied to`,
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
          { t: 'energy', amount: 12, line: 'The long way round leaves you winded — but in.' },
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
          { t: 'gain', defId: 'water_bottle', count: 1 },
          { t: 'standing', delta: 1 },
          { t: 'access' },
        ],
      },
      {
        id: 'trade',
        kind: 'pay',
        itemIds: ['canned_food', 'snacks', 'hawker_meal'],
        label: 'Trade food for a fill',
        onSuccess: [
          { t: 'gain', defId: 'water_bottle', count: 1 },
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
          { t: 'gain', defId: 'water_bottle', count: 1 },
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
        label: `Go through their pack`,
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
        label: `Work out what killed them`,
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

function buildLooters(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = prose(rng, 'looters_fleeing', ctx, { name: loc.name });
  const prize = rng.pick(['medkit', 'ammo_box', 'canned_food', 'painkillers', 'antibiotics', 'fuel_can']);
  return {
    kind: 'looters_fleeing',
    factionId: null,
    title: 'Wrong-Way Traffic',
    tell,
    text,
    choices: [
      {
        id: 'chase',
        kind: 'check',
        attr: 'dexterity',
        dc,
        label: 'Chase them — grab what they dropped',
        onSuccess: [{ t: 'gain', defId: prize }, { t: 'access' }],
        onFailure: [
          { t: 'energy', amount: 6, line: 'They know the floor better. You arrive winded and empty-handed.' },
          { t: 'access' },
        ],
      },
      {
        id: 'read',
        kind: 'check',
        attr: 'perception',
        dc,
        label: 'Watch where they came from',
        onSuccess: [
          { t: 'time', hours: 0.2, line: 'You clock the route they took and what they skipped.' },
          { t: 'intel' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.2, line: 'They\'re gone before you learn anything useful.' },
          { t: 'access' },
        ],
      },
      {
        id: 'let',
        kind: 'leave',
        label: 'Let them go — get inside',
        onSuccess: [{ t: 'access' }],
      },
    ],
  };
}

function buildSmoke(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = prose(rng, 'smoke_block', ctx, { name: loc.name });
  return {
    kind: 'smoke_block',
    factionId: null,
    title: 'Smoke Under the Door',
    tell,
    text,
    choices: [
      {
        id: 'side',
        kind: 'check',
        attr: 'perception',
        dc,
        label: 'Find a side entry out of the smoke',
        onSuccess: [
          { t: 'time', hours: 0.3, line: 'You circle to a service door where the air is clear enough.' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.3, line: 'Every way in is the same haze.' },
          { t: 'deny', line: 'Not worth coughing your lungs out today.' },
        ],
      },
      {
        id: 'push',
        kind: 'check',
        attr: 'strength',
        dc,
        label: 'Push through the smoke',
        onSuccess: [{ t: 'access' }],
        onFailure: [
          { t: 'wound', amount: 8, line: 'You stumble in the haze and catch something sharp on the way down.' },
          { t: 'deny', line: 'You back out coughing blood and ash.' },
        ],
      },
      {
        id: 'wait',
        kind: 'leave',
        label: 'Wait for it to clear',
        onSuccess: [
          { t: 'time', hours: 0.8, line: 'You wait downwind until the smoke thins enough to breathe.' },
          { t: 'access' },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: 'Not today',
        onSuccess: [{ t: 'deny', line: 'You leave the smoke to its work.' }],
      },
    ],
  };
}

function buildBeacon(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = prose(rng, 'distress_beacon', ctx, { name: loc.name });
  return {
    kind: 'distress_beacon',
    factionId: null,
    title: 'Still Broadcasting',
    tell,
    text,
    choices: [
      {
        id: 'trace',
        kind: 'check',
        attr: 'wits',
        dc,
        label: 'Trace the signal — read the place',
        onSuccess: [
          { t: 'time', hours: 0.3, line: 'The message tells you more about the building than the broadcaster meant.' },
          { t: 'intel' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.3, line: 'Static and repetition. You learn nothing but the clock.' },
          { t: 'access' },
        ],
      },
      {
        id: 'rush',
        kind: 'leave',
        label: 'Follow the voice inside',
        onSuccess: [
          { t: 'noise', radius: 100, intensity: 2 },
          { t: 'zombies', line: 'The beacon was bait — or the dead answered it first.' },
        ],
      },
      {
        id: 'ignore',
        kind: 'leave',
        label: 'Ignore it and go in quiet',
        onSuccess: [{ t: 'access' }],
      },
    ],
  };
}

function buildTrader(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const { tell, text } = prose(rng, 'nomad_trader', ctx, { name: loc.name });
  const stock = rng.pick(['medkit', 'ammo_box', 'batteries', 'bandage', 'painkillers']);
  return {
    kind: 'nomad_trader',
    factionId: null,
    title: 'Travelling Merchant',
    tell,
    text,
    choices: [
      {
        id: 'trade',
        kind: 'pay',
        itemIds: ['canned_food', 'snacks', 'hawker_meal', 'instant_noodles'],
        label: 'Trade food for supplies',
        onSuccess: [{ t: 'gain', defId: stock }, { t: 'access' }],
        onFailure: [
          { t: 'deny', line: 'No food, no trade. They fold the mat and let you pass anyway.' },
          { t: 'access' },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: 'No deal — move on',
        onSuccess: [{ t: 'deny', line: 'You leave the trader to their stock.' }],
      },
    ],
  };
}

function buildBarricade(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = prose(rng, 'car_blockade', ctx, { name: loc.name });
  const opened: EventEffect[] = [{ t: 'mark', mark: { door: true } }, { t: 'access' }];
  return {
    kind: 'car_blockade',
    factionId: null,
    title: 'Abandoned Barricade',
    tell,
    text,
    choices: [
      {
        id: 'shift',
        kind: 'check',
        attr: 'strength',
        dc,
        label: 'Shift a car enough to squeeze through',
        onSuccess: [
          { t: 'energy', amount: 10, line: 'Metal groans and your shoulders pay for every inch.' },
          ...opened,
        ],
        onFailure: [
          { t: 'energy', amount: 10, line: 'The car doesn\'t budge. Your arms do, and not in a good way.' },
          { t: 'deny', line: 'The barricade wins.' },
        ],
      },
      {
        id: 'gap',
        kind: 'check',
        attr: 'perception',
        dc,
        label: 'Find a gap between the wrecks',
        onSuccess: opened,
        onFailure: [
          { t: 'time', hours: 0.3, line: 'You walk the whole barricade looking for a seam.' },
          { t: 'deny', line: 'No gap wide enough.' },
        ],
      },
      {
        id: 'long',
        kind: 'leave',
        label: 'Go the long way round',
        onSuccess: [
          { t: 'time', hours: 0.9, line: 'You circle the block and come in through the loading bay.' },
          { t: 'energy', amount: 12, line: 'The long way round leaves you winded — but in.' },
          { t: 'access' },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: 'Not worth the trouble',
        onSuccess: [{ t: 'deny', line: 'You leave the barricade where it is.' }],
      },
    ],
  };
}

function buildFlooded(rng: Rng, loc: LocationState, ctx: EventCtx): GameEvent {
  const dc = dcFor(loc.currentDanger);
  const { tell, text } = prose(rng, 'flooded_entry', ctx, { name: loc.name });
  return {
    kind: 'flooded_entry',
    factionId: null,
    title: 'Knee-Deep at the Door',
    tell,
    text,
    choices: [
      {
        id: 'wade',
        kind: 'check',
        attr: 'perception',
        dc,
        label: 'Wade in carefully',
        onSuccess: [
          { t: 'time', hours: 0.3, line: 'You pick a line where the footing is still there under the water.' },
          { t: 'access' },
        ],
        onFailure: [
          { t: 'time', hours: 0.3, line: 'The water hides a step and you go in hard.' },
          { t: 'wound', amount: 7, line: 'Something sharp under the water finds your leg.' },
          { t: 'access' },
        ],
      },
      {
        id: 'rush',
        kind: 'leave',
        label: 'Plough through',
        onSuccess: [
          { t: 'energy', amount: 10, line: 'Cold water to the knee and every step a fight.' },
          { t: 'wound', amount: 5, line: 'You misstep on something that used to be a floor tile.' },
          { t: 'access' },
        ],
      },
      {
        id: 'back',
        kind: 'leave',
        label: 'Back off',
        onSuccess: [{ t: 'deny', line: 'You leave the flood to settle.' }],
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
export function mrtTollEvent(): GameEvent {
  const accepted = FACTION_CONFIG.sta.tribute;
  return {
    kind: 'mrt_toll',
    factionId: 'sta',
    title: 'STA Turnstile Toll',
    tell: 'The turnstiles are manned.',
    text:
      'An STA marshal has the gate chained at waist height. "Tunnel\'s not free. ' +
      `Cells, a torch, a tin — I'm not fussy. One of them and you're through."`,
    choices: [
      {
        id: 'pay',
        kind: 'pay',
        itemIds: accepted,
        label: `Pay ${priceList(accepted)}`,
        // A fare is a fare, but it used to be charged per descent — so a
        // there-and-back cost two. It's a day pass now, stamped at the gate.
        onSuccess: [
          { t: 'standing', delta: 1 },
          { t: 'mark', mark: { tollDays: 1 } },
          { t: 'access' },
        ],
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

/** What the doctor in a shelter holdout will treat you for, best first. */
export const FIELD_DOCTOR_FEES = ['canned_food', 'army_ration', 'rice_pack', 'instant_noodles'];

/** Hours the doctor keeps you on the mat, and how much each part recovers. */
export const FIELD_DOCTOR_HOURS = 1;
export const FIELD_DOCTOR_HEAL = 35;

/**
 * The doctor behind a shelter door — an offer, not a transaction. Nothing is
 * spent until a choice is made, and walking away costs nothing but the walk.
 */
export function fieldDoctorEvent(rng: Rng, blockName: string): GameEvent {
  const text = rng.pick([
    'A woman in a stained polo waves you onto a camp mat. "I can clean and pack that. ' +
      "I don't take money — I take food. One tin, one meal, whatever you have.\"",
    'The unit smells of iodine. "Sit," says the man sorting gauze by the window. ' +
      "\"An hour of my time for something to eat. That's the whole price list.\"",
    'Someone has taped a red cross to the gate of this unit. "Food first," they say, ' +
      "without looking up. \"Then I'll look at you.\"",
  ]);
  return {
    kind: 'field_doctor',
    factionId: null,
    title: 'Field Doctor',
    tell: `Someone is running a clinic out of a unit in ${blockName}.`,
    text,
    choices: [
      {
        id: 'pay',
        kind: 'pay',
        itemIds: FIELD_DOCTOR_FEES,
        label: `Get patched up — ${priceList(FIELD_DOCTOR_FEES)}, 1 hour`,
        onSuccess: [
          { t: 'time', hours: FIELD_DOCTOR_HOURS, line: 'You lie still while they work.' },
          {
            t: 'treat',
            amount: FIELD_DOCTOR_HEAL,
            line: 'The field doctor patches you up. Clean dressings, tight and even.',
          },
          { t: 'service' },
        ],
        onFailure: [
          { t: 'deny', line: 'The doctor wants payment in food. You have none to give.' },
        ],
      },
      {
        id: 'leave',
        kind: 'leave',
        label: 'Leave it — keep the food',
        onSuccess: [
          { t: 'deny', line: 'You keep your food and your wounds. The gate closes behind you.' },
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

/** "1× batteries, torch or canned food" — what a gate will settle for. */
export function priceList(defIds: string[]): string {
  const names = defIds.map((id) => itemDef(id).name);
  if (names.length === 1) return `1× ${names[0]}`;
  return `1× ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
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
