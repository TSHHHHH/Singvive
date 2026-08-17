import type { TimeOfDay, WeatherKind } from './types';
import type { HazardKind } from './wilds';

// ---------------------------------------------------------------------------
// Log flavour.
//
// Turns the timeline from flat status lines into a survivor's diary voice.
// Source of truth for every high-frequency timeline line (travel, search, rest,
// gates, survival). Doorway event prose in events.ts follows the same brief.
//
// Voice checklist:
//   - Second person, present tense, short sentences
//   - Name the place or the stakes; mood in the sentence, loot chips for numbers
//   - Light Singlish only where it lands naturally (ah, shiok, bupkis) — never forced
//   - Prefer body/scene consequence over UI instruction ("Rest first", "temp stash")
//   - No check math in the feed (no "dex 14 vs 12")
//
// Rare systems refusals (crafting, slot errors) may stay terse. Everything else
// the player sees every loop must sound like the diary.
//
// Purely cosmetic pools: Math.random is fine (no game RNG disturbed).
// ---------------------------------------------------------------------------

export interface FlavorCtx {
  name?: string; // location name
  time?: TimeOfDay;
  weather?: WeatherKind;
}

export type FlavorKey =
  | 'wake'
  | 'wakeOffline'
  | 'setout'
  | 'arrive'
  | 'atDoor'
  | 'charted'
  | 'searchStart'
  | 'searchStartRaid'
  | 'searchStartFlee'
  | 'searchFound'
  | 'searchEmpty'
  | 'searchAbort'
  | 'searchAbortEmpty'
  | 'searchClear'
  | 'searchBare'
  | 'searchFledDone'
  | 'searchRaidDone'
  | 'pickedClean'
  | 'ambush'
  | 'roadAmbush'
  | 'roadHazard'
  | 'roadFind'
  | 'rest'
  | 'trekOut'
  | 'trekArrive'
  | 'trekAmbush'
  | 'restExposed'
  | 'tooTired'
  | 'tooTiredTunnel'
  | 'sortHaul'
  | 'sortHaulSurface'
  | 'packSpill'
  | 'packLost';

const POOLS: Record<FlavorKey, string[]> = {
  wake: [
    'You come to on cold concrete in {name}. The city has gone quiet — the bad kind of quiet.',
    'You jolt awake in {name}. No traffic, no birds. Just the hum of a dead island.',
    'Eyes open. {name}, or what\'s left of it. Whatever comes next, you\'re on your own now.',
    'You wake in {name} with a dry mouth and a list of things you do not have.',
    'Morning finds you still in {name}. The streets outside have not gotten friendlier overnight.',
  ],
  wakeOffline: [
    'You come to somewhere near {name}. The maps are down — you\'ll have to trust your feet.',
    'You wake up close to {name}. No signal, no grid. Just you and the ruins.',
    'You sit up near {name} with no pins on the map. Guesswork from here.',
  ],
  setout: [
    'You shoulder your pack and move out toward {name}.',
    'Nothing for it — you slip into the open, eyes on {name}.',
    'You steel yourself and set off for {name}.',
    'Keeping low, you push on toward {name}.',
  ],
  // Arrival stops at the frontage — going inside is its own decision now, so
  // none of these may put the survivor through the door.
  arrive: [
    'You reach {name} in one piece.',
    'You pull up short of {name}, back to the wall.',
    '{name} looms up out of the murk.',
    'You make it to {name}, breath held.',
  ],
  atDoor: [
    'The way in is right there. Whether you take it is up to you.',
    'You could go in. You could also keep walking.',
    'Nothing moves at the entrance. Nothing you can see, anyway.',
    'The door\'s within reach. Your call.',
    'You size up the entrance and wait for your pulse to settle.',
  ],
  charted: [
    'So that\'s what {name} was. Marked on your map now.',
    'You get a proper look at {name} and note it down.',
    '{name} — charted. One less blank on the map.',
    'You pin {name} and move on. Better to know than to wonder.',
    '{name} goes on the map. You\'ll remember the smell, too.',
  ],
  searchStart: [
    'You work through {name}, hands busy, ears open.',
    'You start picking over {name} — careful, quiet, thorough.',
    'Time to see what {name} still has left.',
    'You dig into {name}, shelf by shelf.',
  ],
  searchStartRaid: [
    'You tear into their stores at {name} — fast, before they notice.',
    'Raid mode. You strip {name} like you mean it.',
    'You hit the shelves at {name} hard. No time for manners.',
  ],
  searchStartFlee: [
    'You grab what you can from {name} and keep moving.',
    'No time for a proper sweep of {name} — take and go.',
    'You snatch what\'s in reach at {name} while your pulse settles.',
  ],
  searchFound: [
    'You pick through {name} and pocket what you can carry.',
    'Something useful buried in {name} after all. You take it.',
    'You rummage {name} and come away better off.',
    'Shelves half-stripped, but {name} still had a few gems.',
  ],
  searchEmpty: [
    '{name}\'s been picked over. Nothing worth the weight.',
    'You comb {name} top to bottom — bupkis.',
    'Others got to {name} first. Bare shelves.',
    'Whatever {name} held, it\'s long gone.',
  ],
  searchAbort: [
    'You cut the search short at {name} and back out.',
    'Enough of {name} for now — you leave with what you grabbed.',
    'You abandon the sweep of {name} mid-shelf.',
  ],
  searchAbortEmpty: [
    'You stop searching {name} empty-handed.',
    'Nothing worth the noise in {name}. You walk away with nothing.',
    'You quit {name} before you find a single useful thing.',
  ],
  searchClear: [
    'You finish with {name} and step back from the shelves.',
    '{name} has given up what it\'s going to. You bag it and go.',
    'You clear {name} — whatever was left is yours now.',
  ],
  searchBare: [
    '{name} is bare. Not even dust worth pocketing.',
    'You turn {name} inside out and come up empty.',
    'Nothing left in {name} but empty drawers.',
  ],
  searchFledDone: [
    'You grabbed what you could from {name} and got out.',
    'A hasty haul from {name} — better than staying put.',
    'You snatch a few things from {name} and keep moving.',
  ],
  searchRaidDone: [
    'You raided their stores at {name} — this is why they keep a gate.',
    'Their shelves at {name} are lighter for it. You don\'t look back.',
    'You strip {name} for everything loose and vanish.',
  ],
  pickedClean: [
    '{name} is stripped bare — nothing left to find.',
    'You\'ve wrung {name} dry. Move on.',
    '{name} has nothing left but footprints and empty shelves.',
    'You already took what {name} had. Coming back is a waste of daylight.',
    'The cupboards at {name} are hollow. You\'ve been here.',
  ],
  ambush: [
    'Something lurches out of the dark in {name} — teeth first!',
    'You\'re not alone in {name}, and it\'s already moving.',
    'A shape peels off the wall in {name}. Ambush!',
    'The rot-stink hits a beat too late — {name} was a trap.',
  ],
  roadAmbush: [
    'The dead were waiting on the road to {name}. No way around — you draw your weapon.',
    'Halfway to {name}, shapes rise from a stalled bus. They\'ve seen you.',
    'A moan echoes down the corridor toward {name}. Too late to hide — they\'re on you.',
  ],
  roadHazard: [
    'A collapsed overpass forces a long detour on the way to {name}. It costs you.',
    'You wade a flooded underpass toward {name} — soaked, winded, slowed.',
    'Rubble and razor wire choke the road to {name}. You pick through, and it wears you down.',
  ],
  roadFind: [
    'On the way to {name} you crack open a stalled car — someone left supplies behind.',
    'A dropped go-bag on the road to {name}. Finders keepers.',
    'You spot a cache tucked in the debris en route to {name}. Grab and go.',
  ],
  rest: [
    'You barricade the door and grab what sleep you can.',
    'You hunker down till first light, one ear open.',
    'You wedge the door shut and drift off, knife in hand.',
    'A few stolen hours of sleep. The streets refill by dawn.',
  ],
  trekOut: [
    'No door worth knocking on out there. You strike off across open ground.',
    'You leave the buildings behind and cut across the open.',
    'Nothing charted that way. You go anyway, keeping to the drains.',
    'You pick a line across the empty ground and commit to it.',
  ],
  trekArrive: [
    'You stop in the open, nothing but sky and silence. No walls, no door.',
    'You reach the spot. Bare ground, no shelter — you can\'t stay long.',
    'Open ground. You crouch low and take stock.',
    'You pull up short of nothing in particular. At least it\'s new ground.',
  ],
  trekAmbush: [
    'Out in the open with nowhere to duck — and something comes at you.',
    'Halfway across, the ground gives up what it was hiding.',
    'No cover, no warning. It\'s on you before you can pick a line.',
    'Something was lying low in the grass. It isn\'t anymore.',
    'Open ground was a bad idea. Something proves it.',
    'A splash on the canal. Then it comes up the bank.',
    'Something in the lallang does not stay hidden.',
    'The street goes quiet except for claws on concrete.',
  ],
  restExposed: [
    'You sleep rough in the open, and it barely counts as sleep.',
    'No roof, no door. You doze in snatches, jerking awake at every sound.',
    'You lie in the dirt with one hand on your weapon and wait out the dark.',
    'You curl up behind a low wall and call it a night. The cold disagrees.',
    'Exposed rest. You wake more tired than you lay down.',
  ],
  tooTired: [
    'Your legs won\'t take another block. Rest first.',
    'You\'re spent — one more walk and you\'ll drop. Find a place to hole up.',
    'Too exhausted to move out. Your body is done for now.',
  ],
  tooTiredTunnel: [
    'Too spent to walk a tunnel. Your hands shake on the rail.',
    'The bore can wait — you need rest before another stretch of dark.',
    'You can\'t face another hop underground. Rest first.',
  ],
  sortHaul: [
    'Sort what you hauled — or dump it — before you move on.',
    'That loose haul is still sitting open. Deal with it before you walk.',
    'Pack the spill, stash it, or leave it. You\'re not moving until you choose.',
  ],
  sortHaulSurface: [
    'Sort what you hauled — or dump it — before you surface.',
    'That spill is still open. Deal with it before you climb the stairs.',
    'Pack it, stash it, or abandon it. Then you can come up.',
  ],
  packSpill: [
    'Pack\'s full — extras sit in a loose pile. Swap what you need, then settle it.',
    'You can\'t carry it all. The overflow is waiting for you to sort.',
    'Too much for the pack. Spill is piled aside until you decide.',
  ],
  packLost: [
    'No room left even in the spill — some finds stay behind.',
    'You leave finds on the ground. Nowhere left to put them.',
    'Overflow full. Whatever you couldn\'t hold is gone.',
  ],
};

// Occasional atmospheric tail added to arrivals, keyed to conditions.
const NIGHT_TAILS = ['The dark presses in close.', 'Every shadow could be moving.'];
const RAIN_TAILS = ['Rain needles down, cold and loud.', 'The downpour drowns out everything else.'];
const HAZE_TAILS = ['The haze burns your throat.'];
const HEAT_TAILS = [
  'The heat sits on you like a wet blanket.',
  'Concrete throws the sun back up at you. Your shirt is soaked through.',
  'Shiok if you had a drink. You do not.',
];

export type HazardBeat = 'cross' | 'wound' | 'clear' | 'infect';

const HAZARD_POOLS: Record<HazardKind, Partial<Record<HazardBeat, string[]>>> = {
  horde_pocket: {
    cross: [
      'You cut through a horde pocket. The stink clings, and every step costs you.',
      'Dead things packed this stretch. You push through anyway — it wears you down.',
      'A pocket of the horde. You keep moving. Your legs pay for it.',
    ],
    infect: [
      'The air in the pocket is wrong. You can feel it under your skin.',
      'Something in that clot gets into you. It will not stay a smell.',
    ],
  },
  gang_patrol: {
    cross: [
      'You cross claimed ground. Eyes on you the whole way. It takes it out of you.',
      'Someone still patrols this stretch. You do not linger — and it still costs you.',
      'Patrolled ground. You keep your head down and burn the energy to get off it.',
    ],
  },
  collapse: {
    wound: [
      'The slab shifts. Something in your leg goes wrong.',
      'Rebar and pancaked concrete — you misstep, and the leg takes it.',
      'The collapse field bites. Pain shoots up from the ankle.',
    ],
    clear: [
      'You pick a line through the pancaked slabs and make it.',
      'Unstable ground, but your feet find the gaps.',
      'The rubble wants a leg. You do not give it one.',
    ],
  },
  floodwater: {
    cross: [
      'You wade the drain runoff. Slow, cold, and the clock does not wait.',
      'Waist-deep floodwater. Each step is a fight, and daylight leaks away.',
      'The water hides the footing. You slog through. Time goes with it.',
    ],
    infect: [
      'The floodwater gets into a cut. It will not stay a cut.',
      'Foul water finds a break in the skin. Heat follows.',
    ],
  },
  wildlife_water: {
    cross: [
      'Something in the water has this bank. You do not linger — it still costs you.',
      'The canal is claimed. Crossing it puts eyes on you, and the effort in your legs.',
    ],
  },
  wildlife_forest: {
    cross: [
      'The trees went quiet here. You push through claimed catchment, and it drains you.',
      'Whatever lives in this stretch does not want company. Getting off it costs you.',
    ],
  },
  wildlife_urban: {
    cross: [
      'Strays own this block. You cut through their stretch, and it wears you down.',
      'Infested ground. You keep moving. They let you — for a price in energy.',
    ],
  },
  night_swarm: {
    cross: [
      'The street is theirs. Crossing it in the dark is a mistake you feel in your legs.',
      'Night swarm in the open. You run the gauntlet. It takes everything you have.',
      'They own the dark. You cross anyway. Your body knows it was a bad call.',
    ],
  },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Diary line for a hazard bite — consequence first, not the map label. */
export function flavorHazard(kind: HazardKind, beat: HazardBeat): string {
  const pool = HAZARD_POOLS[kind][beat];
  if (pool && pool.length > 0) return pick(pool);
  return pick(HAZARD_POOLS.horde_pocket.cross ?? ['The ground here takes its toll.']);
}

function fill(tpl: string, ctx: FlavorCtx): string {
  return tpl.replace(/\{name\}/g, ctx.name ?? 'here');
}

/** Build a flavourful log line for the given action + context. */
export function flavor(key: FlavorKey, ctx: FlavorCtx = {}): string {
  let line = fill(pick(POOLS[key]), ctx);

  // Sprinkle atmosphere on arrivals ~50% of the time.
  if (key === 'arrive' && Math.random() < 0.5) {
    let tail: string | null = null;
    if (ctx.weather === 'rain' || ctx.weather === 'thunderstorm') tail = pick(RAIN_TAILS);
    else if (ctx.weather === 'haze') tail = pick(HAZE_TAILS);
    else if (ctx.weather === 'heat') tail = pick(HEAT_TAILS);
    else if (ctx.time === 'night') tail = pick(NIGHT_TAILS);
    if (tail) line += ` ${tail}`;
  }

  // Light atmosphere on setout / atDoor less often so it isn't arrival-only.
  if ((key === 'setout' || key === 'atDoor') && Math.random() < 0.25) {
    let tail: string | null = null;
    if (ctx.weather === 'rain' || ctx.weather === 'thunderstorm') tail = pick(RAIN_TAILS);
    else if (ctx.weather === 'haze') tail = pick(HAZE_TAILS);
    else if (ctx.weather === 'heat') tail = pick(HEAT_TAILS);
    else if (ctx.time === 'night') tail = pick(NIGHT_TAILS);
    if (tail) line += ` ${tail}`;
  }

  return line;
}
