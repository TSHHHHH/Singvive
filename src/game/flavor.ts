import type { TimeOfDay, WeatherKind } from './types';

// ---------------------------------------------------------------------------
// Log flavour.
//
// Turns the timeline from flat status lines into a survivor's diary voice —
// second-person, a little Singlish, weather/time aware. Everything is data:
// add a line to a pool, or a whole new pool, and it just works. Purely
// cosmetic, so a plain Math.random pick is fine (no game RNG is disturbed).
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
  | 'searchFound'
  | 'searchEmpty'
  | 'pickedClean'
  | 'ambush'
  | 'roadAmbush'
  | 'roadHazard'
  | 'roadFind'
  | 'rest'
  | 'trekOut'
  | 'trekArrive'
  | 'trekAmbush'
  | 'restExposed';

const POOLS: Record<FlavorKey, string[]> = {
  wake: [
    'You come to on cold concrete in {name}. The city has gone quiet — the bad kind of quiet.',
    'You jolt awake in {name}. No traffic, no birds. Just the hum of a dead island.',
    'Eyes open. {name}, or what\'s left of it. Whatever comes next, you\'re on your own now.',
  ],
  wakeOffline: [
    'You come to somewhere near {name}. The maps are down — you\'ll have to trust your feet.',
    'You wake up close to {name}. No signal, no grid. Just you and the ruins.',
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
  pickedClean: [
    '{name} is stripped bare — nothing left to find.',
    'You\'ve wrung {name} dry. Move on.',
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
  ],
  restExposed: [
    'You sleep rough in the open, and it barely counts as sleep.',
    'No roof, no door. You doze in snatches, jerking awake at every sound.',
    'You lie in the dirt with one hand on your weapon and wait out the dark.',
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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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

  return line;
}
