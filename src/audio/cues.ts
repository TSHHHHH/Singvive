// ---------------------------------------------------------------------------
// Sound cue catalog.
//
// A cue is a *moment* in the game that can make a sound ("a search slot
// reveals a rare find"), not a file. The code fires cues by id; which file
// plays for each cue lives in `public/audio/manifest.json`, which the DEV
// Sound console writes. A cue with no file assigned is a silent no-op, so cues
// can be wired before any audio exists, and audio can be swapped without
// touching code.
//
// Pure data: no browser APIs, safe to import from tests and the dev server.
// ---------------------------------------------------------------------------

export type CueCategory =
  | 'ui'
  | 'travel'
  | 'search'
  | 'inventory'
  | 'combat'
  | 'body'
  | 'vitals'
  | 'rest'
  | 'world'
  | 'dice'
  | 'site'
  | 'craft'
  | 'tunnel'
  | 'faction'
  | 'evac'
  | 'run';

export const CUE_CATEGORIES: readonly { id: CueCategory; label: string }[] = [
  { id: 'ui', label: 'Interface' },
  { id: 'travel', label: 'Travel' },
  { id: 'search', label: 'Searching & loot' },
  { id: 'inventory', label: 'Inventory & use' },
  { id: 'combat', label: 'Combat' },
  { id: 'body', label: 'Injuries & care' },
  { id: 'vitals', label: 'Vitals warnings' },
  { id: 'rest', label: 'Rest & sleep' },
  { id: 'world', label: 'Weather, time & the city' },
  { id: 'dice', label: 'Dice checks' },
  { id: 'site', label: 'Doors & HDB blocks' },
  { id: 'craft', label: 'Crafting' },
  { id: 'tunnel', label: 'MRT tunnels' },
  { id: 'faction', label: 'Factions & traders' },
  { id: 'evac', label: 'Evac & beacons' },
  { id: 'run', label: 'Run start & end' },
];

/**
 * How much a cue matters when voices run out: 3 must be heard (a hit, a
 * death), 2 is normal feedback, 1 is texture (hover, footsteps) and is the
 * first to be dropped.
 */
export type CuePriority = 1 | 2 | 3;

export interface CueDef {
  id: string;
  category: CueCategory;
  label: string;
  /** Where in the game it fires, in plain words. */
  trigger: string;
  /** Suggested length for whoever makes the audio. */
  length: string;
  /** Plays continuously while a state holds; the engine starts and stops it. */
  loop?: boolean;
  priority: CuePriority;
  /** Briefly lowers the ambience while it plays (stingers, big moments). */
  duck?: boolean;
  /**
   * The procedural ambience already synthesises this moment. Assigning a file
   * replaces the synth version; with no file the synth keeps playing.
   */
  synth?: boolean;
  /** Linear gain 0..1 before the manifest overrides it. */
  volume?: number;
  /** Random pitch spread in semitones (±), so repeats don't sound canned. */
  pitchVar?: number;
  /** Concurrent copies of this cue allowed. */
  maxVoices?: number;
  /** Ignore re-fires closer together than this. */
  minGapMs?: number;
}

const L = {
  tick: '0.03–0.1 s',
  short: '0.1–0.4 s',
  medium: '0.4–1.5 s',
  long: '1.5–4 s',
  sting: '2–6 s',
  loop: 'seamless loop, 4–20 s',
} as const;

export const CUES = [
  // ---- UI ----------------------------------------------------------------
  { id: 'hud.click', category: 'ui', label: 'Button press', trigger: 'Any button or tab is pressed. A button can pick its own cue with data-sfx="<cue id>", or mute itself with data-sfx="none".', length: L.tick, priority: 1, volume: 0.5, pitchVar: 0.5, maxVoices: 2, minGapMs: 40 },
  { id: 'hud.hover', category: 'ui', label: 'Button hover', trigger: 'The pointer moves onto an enabled button (desktop only, throttled).', length: L.tick, priority: 1, volume: 0.25, pitchVar: 0.5, maxVoices: 1, minGapMs: 70 },
  { id: 'hud.panel.open', category: 'ui', label: 'Panel opens', trigger: 'A rail slide-out (inventory, craft, map tools…) or Settings opens.', length: L.short, priority: 1, volume: 0.6 },
  { id: 'hud.panel.close', category: 'ui', label: 'Panel closes', trigger: 'The slide-out or Settings closes.', length: L.short, priority: 1, volume: 0.5 },
  { id: 'hud.tab', category: 'ui', label: 'Phone tab switch', trigger: 'Switching Map / Status / Stash / Log tabs on a phone.', length: L.tick, priority: 1, volume: 0.5 },
  { id: 'hud.pin', category: 'ui', label: 'Item card pinned', trigger: 'The item hover card finishes its 2 s dwell and pins open.', length: L.short, priority: 1, volume: 0.5 },
  { id: 'hud.notify.good', category: 'ui', label: 'Good news line', trigger: 'A green line lands on the timeline (found something, made it, healed).', length: L.short, priority: 1, volume: 0.45, minGapMs: 250 },
  { id: 'hud.notify.bad', category: 'ui', label: 'Bad news line', trigger: 'A red line lands on the timeline (refused, hurt, lost something).', length: L.short, priority: 1, volume: 0.45, minGapMs: 250 },

  // ---- Travel ------------------------------------------------------------
  { id: 'travel.depart', category: 'travel', label: 'Set out', trigger: 'The survivor starts moving to a site or a spot on the map.', length: L.short, priority: 2, volume: 0.6 },
  { id: 'travel.steps', category: 'travel', label: 'Footsteps (loop)', trigger: 'Plays while the travel glide is running; stops on arrival.', length: L.loop, loop: true, priority: 1, volume: 0.4 },
  { id: 'travel.arrive', category: 'travel', label: 'Arrive', trigger: 'The travel glide reaches its destination.', length: L.short, priority: 2, volume: 0.6 },
  { id: 'travel.landmark', category: 'travel', label: 'Recognise a landmark', trigger: 'The survivor recognises nearby places from local knowledge.', length: L.medium, priority: 1, volume: 0.5 },

  // ---- Searching & loot --------------------------------------------------
  { id: 'search.start', category: 'search', label: 'Start a search', trigger: 'A site, raid or HDB-unit search opens its loot list.', length: L.short, priority: 2, volume: 0.7 },
  { id: 'search.rummage', category: 'search', label: 'Rummaging (loop)', trigger: 'Plays while a slot is being searched; stops when the search pauses or ends.', length: L.loop, loop: true, priority: 1, volume: 0.35 },
  { id: 'search.reveal', category: 'search', label: 'Item revealed', trigger: 'A searched slot reveals an ordinary item.', length: L.short, priority: 2, volume: 0.6, pitchVar: 1.5, maxVoices: 3 },
  { id: 'search.rare', category: 'search', label: 'Good find', trigger: 'A slot reveals a pristine, scarce or exotic item (the highlighted finds).', length: L.medium, priority: 3, volume: 0.8 },
  { id: 'search.take', category: 'search', label: 'Take item', trigger: 'An item is taken from the loot list (one, or Take all).', length: L.short, priority: 2, volume: 0.6, pitchVar: 1, maxVoices: 3, minGapMs: 60 },
  { id: 'search.empty', category: 'search', label: 'Nothing here', trigger: 'A search finishes having found nothing.', length: L.medium, priority: 2, volume: 0.6 },
  { id: 'search.done', category: 'search', label: 'Search finished', trigger: 'Every slot has been searched and the session closes.', length: L.short, priority: 2, volume: 0.6 },
  { id: 'search.abort', category: 'search', label: 'Search abandoned', trigger: 'The player walks away mid-search.', length: L.short, priority: 1, volume: 0.5 },

  // ---- Inventory & use ---------------------------------------------------
  { id: 'inv.place', category: 'inventory', label: 'Place in bag', trigger: 'An item is dropped into the bag grid or the loose pile.', length: L.tick, priority: 1, volume: 0.5, pitchVar: 1.5, minGapMs: 40 },
  { id: 'inv.refuse', category: 'inventory', label: 'Will not fit', trigger: 'A drag is refused (no room, wrong place).', length: L.short, priority: 1, volume: 0.5 },
  { id: 'inv.rotate', category: 'inventory', label: 'Rotate item', trigger: 'An item is turned in the grid.', length: L.tick, priority: 1, volume: 0.4 },
  { id: 'inv.equip', category: 'inventory', label: 'Put on gear', trigger: 'Clothing, armour or a bag is equipped.', length: L.short, priority: 2, volume: 0.6 },
  { id: 'inv.equip.weapon', category: 'inventory', label: 'Ready a weapon', trigger: 'A melee weapon, off-hand item or firearm is equipped.', length: L.short, priority: 2, volume: 0.7 },
  { id: 'inv.unequip', category: 'inventory', label: 'Take off gear', trigger: 'Any equipment slot is emptied.', length: L.short, priority: 1, volume: 0.5 },
  { id: 'inv.drop', category: 'inventory', label: 'Throw away', trigger: 'An item is thrown away.', length: L.short, priority: 1, volume: 0.6 },
  { id: 'inv.stash', category: 'inventory', label: 'Stash item', trigger: 'An item moves into the site stash (or the tunnel temp stash).', length: L.short, priority: 1, volume: 0.6 },
  { id: 'inv.unstash', category: 'inventory', label: 'Take from stash', trigger: 'An item moves from a stash back into the bag.', length: L.short, priority: 1, volume: 0.6 },
  { id: 'use.eat', category: 'inventory', label: 'Eat', trigger: 'Food is eaten.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'use.drink', category: 'inventory', label: 'Drink', trigger: 'Water or a drink is consumed.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'use.medicine', category: 'inventory', label: 'Take medicine', trigger: 'Pills, antibiotics, painkillers or an energy item are used.', length: L.short, priority: 2, volume: 0.6 },
  { id: 'use.read', category: 'inventory', label: 'Read', trigger: 'A map, note or skill book is read.', length: L.medium, priority: 1, volume: 0.6 },
  { id: 'gun.reload', category: 'inventory', label: 'Reload', trigger: 'A magazine is filled, or a firearm is loaded.', length: L.medium, priority: 2, volume: 0.8 },

  // ---- Combat ------------------------------------------------------------
  { id: 'combat.contact', category: 'combat', label: 'Contact!', trigger: 'A fight starts.', length: L.long, priority: 3, duck: true, synth: true, volume: 0.8 },
  { id: 'combat.enemy.zombie', category: 'combat', label: 'Infected snarl', trigger: 'A fight with an infected starts (plays with Contact).', length: L.medium, priority: 2, volume: 0.7, pitchVar: 2 },
  { id: 'combat.enemy.human', category: 'combat', label: 'Hostile shout', trigger: 'A fight with a human starts.', length: L.medium, priority: 2, volume: 0.7, pitchVar: 1 },
  { id: 'combat.enemy.animal', category: 'combat', label: 'Animal growl', trigger: 'A fight with an animal starts.', length: L.medium, priority: 2, volume: 0.7, pitchVar: 1.5 },
  { id: 'combat.stance', category: 'combat', label: 'Change stance', trigger: 'The player picks a stance.', length: L.tick, priority: 1, volume: 0.5 },
  { id: 'combat.swing', category: 'combat', label: 'Swing', trigger: 'The player swings a melee weapon or fists (plays before hit/miss).', length: L.short, priority: 2, volume: 0.7, pitchVar: 2, maxVoices: 2 },
  { id: 'combat.shot', category: 'combat', label: 'Gunshot', trigger: 'The player fires a prepared shot.', length: L.medium, priority: 3, duck: true, volume: 0.9, pitchVar: 1 },
  { id: 'combat.hit', category: 'combat', label: 'Hit lands', trigger: 'The player damages the enemy.', length: L.short, priority: 3, volume: 0.8, pitchVar: 2, maxVoices: 2 },
  { id: 'combat.crit', category: 'combat', label: 'Critical hit', trigger: 'The player lands a critical.', length: L.medium, priority: 3, volume: 0.9, pitchVar: 1 },
  { id: 'combat.miss', category: 'combat', label: 'Miss', trigger: 'The player misses, or the enemy dodges or blocks.', length: L.short, priority: 2, volume: 0.6, pitchVar: 2 },
  { id: 'combat.hurt', category: 'combat', label: 'Get hit', trigger: 'The enemy damages the player.', length: L.short, priority: 3, volume: 0.85, pitchVar: 1.5, maxVoices: 2 },
  { id: 'combat.hurt.crit', category: 'combat', label: 'Take a critical', trigger: 'The enemy lands a critical on the player.', length: L.medium, priority: 3, duck: true, volume: 0.9 },
  { id: 'combat.dodge', category: 'combat', label: 'Dodge', trigger: 'The player dodges an attack.', length: L.short, priority: 2, volume: 0.6, pitchVar: 2 },
  { id: 'combat.block', category: 'combat', label: 'Block', trigger: 'The player blocks an attack.', length: L.short, priority: 2, volume: 0.7, pitchVar: 1.5 },
  { id: 'combat.kill', category: 'combat', label: 'Enemy down', trigger: 'The killing blow lands.', length: L.medium, priority: 3, volume: 0.9 },
  { id: 'combat.flee', category: 'combat', label: 'Flee', trigger: 'The player gets away from a fight.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'combat.victory', category: 'combat', label: 'Victory summary', trigger: 'The fight summary opens after a win.', length: L.long, priority: 3, duck: true, volume: 0.7 },

  // ---- Injuries & care ---------------------------------------------------
  { id: 'body.bleed', category: 'body', label: 'Starts bleeding', trigger: 'A body part starts a minor bleed.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'body.bleed.major', category: 'body', label: 'Heavy bleeding', trigger: 'A body part starts a major bleed.', length: L.medium, priority: 3, duck: true, volume: 0.85 },
  { id: 'body.fracture', category: 'body', label: 'Bone breaks', trigger: 'An arm or leg fractures.', length: L.medium, priority: 3, duck: true, volume: 0.9 },
  { id: 'body.cripple', category: 'body', label: 'Limb gives out', trigger: 'A body part drops to 0 HP and is crippled.', length: L.medium, priority: 3, volume: 0.85 },
  { id: 'care.bandage', category: 'body', label: 'Bandage', trigger: 'A wound is bandaged or dressed.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'care.clean', category: 'body', label: 'Clean wound', trigger: 'A wound is cleaned (antiseptic, water).', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'care.splint', category: 'body', label: 'Splint / support', trigger: 'A fracture is splinted or supported.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'care.firstaid', category: 'body', label: 'First aid', trigger: 'A first-aid kit is used on a part.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'care.pain', category: 'body', label: 'Pain relief', trigger: 'Pain relief is applied to a part.', length: L.short, priority: 1, volume: 0.6 },

  // ---- Vitals warnings ---------------------------------------------------
  { id: 'vitals.thirst', category: 'vitals', label: 'Thirsty', trigger: 'Thirst drops below 25 (fires again below 10).', length: L.medium, priority: 2, volume: 0.6, minGapMs: 4000 },
  { id: 'vitals.hunger', category: 'vitals', label: 'Hungry', trigger: 'Hunger drops below 25 (fires again below 10) — a stomach growl.', length: L.medium, priority: 2, volume: 0.6, minGapMs: 4000 },
  { id: 'vitals.energy', category: 'vitals', label: 'Exhausted', trigger: 'Energy drops below 25 (fires again below 10).', length: L.medium, priority: 2, volume: 0.6, minGapMs: 4000 },
  { id: 'vitals.infection', category: 'vitals', label: 'Infection rising', trigger: 'Infection climbs past 30, then 60, then 85.', length: L.long, priority: 3, duck: true, volume: 0.7 },
  { id: 'vitals.hp.low', category: 'vitals', label: 'Near death', trigger: 'Total HP falls below 30%. (The ambience also adds a heartbeat below 40%.)', length: L.long, priority: 3, duck: true, volume: 0.75 },

  // ---- Rest & sleep ------------------------------------------------------
  { id: 'rest.sleep', category: 'rest', label: 'Lie down to rest', trigger: 'The survivor rests or sleeps (rest picker, outpost bunk, tunnel rest).', length: L.long, priority: 2, duck: true, volume: 0.7 },
  { id: 'rest.wake', category: 'rest', label: 'Wake up', trigger: 'Rest ends normally.', length: L.medium, priority: 2, volume: 0.6 },
  { id: 'rest.woken', category: 'rest', label: 'Woken suddenly', trigger: 'Rest ends in a fight or an event.', length: L.medium, priority: 3, duck: true, volume: 0.8 },

  // ---- World -------------------------------------------------------------
  { id: 'world.rain', category: 'world', label: 'Rain begins', trigger: 'The day\'s weather turns to rain or a storm.', length: L.long, priority: 1, volume: 0.6 },
  { id: 'world.thunder', category: 'world', label: 'Thunder', trigger: 'Thunder in a storm; lined up with a lightning flash when 3D weather is on.', length: L.sting, priority: 2, synth: true, volume: 0.8, pitchVar: 2, maxVoices: 2 },
  { id: 'world.dawn', category: 'world', label: 'Dawn', trigger: 'Night turns to day.', length: L.sting, priority: 2, volume: 0.6 },
  { id: 'world.dusk', category: 'world', label: 'Dusk', trigger: 'Day turns to dusk.', length: L.sting, priority: 1, volume: 0.6 },
  { id: 'world.nightfall', category: 'world', label: 'Nightfall', trigger: 'Dusk turns to night, above ground.', length: L.sting, priority: 3, duck: true, synth: true, volume: 0.7 },
  { id: 'world.car_alarm', category: 'world', label: 'Car alarm', trigger: 'A car alarm goes off nearby (activity event).', length: L.long, priority: 2, volume: 0.7 },
  { id: 'world.gunfire', category: 'world', label: 'Distant gunfire', trigger: 'Gunfire somewhere nearby (activity event).', length: L.long, priority: 2, volume: 0.7 },
  { id: 'world.shutter', category: 'world', label: 'Shutter rattles', trigger: 'A roller shutter goes up or down nearby (activity event).', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'world.scavengers', category: 'world', label: 'Scavengers', trigger: 'Voices of scavengers nearby (activity event).', length: L.long, priority: 2, volume: 0.7 },
  { id: 'world.noise', category: 'world', label: 'You made noise', trigger: 'A noise pulse goes out from the survivor (forcing doors, gunfire, breaking glass).', length: L.medium, priority: 1, volume: 0.6, minGapMs: 400 },
  { id: 'world.event', category: 'world', label: 'Encounter', trigger: 'A doorway or roadside event card opens.', length: L.medium, priority: 2, duck: true, volume: 0.7 },

  // ---- Dice --------------------------------------------------------------
  { id: 'dice.tumble', category: 'dice', label: 'Dice tumble', trigger: 'The d20 overlay starts rolling (doorway checks, sneaks, tunnel checks).', length: '≈0.75 s', priority: 2, volume: 0.6 },
  { id: 'dice.land', category: 'dice', label: 'Dice land', trigger: 'The die settles on its face.', length: L.tick, priority: 2, volume: 0.7 },
  { id: 'dice.success', category: 'dice', label: 'Check passed', trigger: 'The verdict shows a pass.', length: L.short, priority: 2, volume: 0.7 },
  { id: 'dice.fail', category: 'dice', label: 'Check failed', trigger: 'The verdict shows a fail.', length: L.short, priority: 2, volume: 0.7 },
  { id: 'dice.nat20', category: 'dice', label: 'Natural 20', trigger: 'The die lands on 20 (plays instead of pass).', length: L.medium, priority: 3, volume: 0.8 },
  { id: 'dice.nat1', category: 'dice', label: 'Natural 1', trigger: 'The die lands on 1 (plays instead of fail).', length: L.medium, priority: 3, volume: 0.8 },

  // ---- Doors & HDB -------------------------------------------------------
  { id: 'site.enter', category: 'site', label: 'Go inside', trigger: 'The survivor enters a site normally.', length: L.short, priority: 2, volume: 0.6 },
  { id: 'site.sneak', category: 'site', label: 'Sneak in', trigger: 'The survivor sneaks into a site or faction compound.', length: L.short, priority: 2, volume: 0.5 },
  { id: 'site.force', category: 'site', label: 'Force the door', trigger: 'The survivor forces their way in (crash, crowbar).', length: L.medium, priority: 3, volume: 0.9 },
  { id: 'hdb.enter', category: 'site', label: 'Enter HDB block', trigger: 'The survivor steps into an HDB block\'s void deck.', length: L.medium, priority: 2, volume: 0.6 },
  { id: 'hdb.stairs', category: 'site', label: 'Take the stairs', trigger: 'Moving between floors of an HDB block.', length: L.medium, priority: 1, volume: 0.6 },
  { id: 'hdb.scout', category: 'site', label: 'Scout a room', trigger: 'A unit is picked and scouted (Perception / Dexterity dice reveal).', length: L.short, priority: 2, volume: 0.6 },
  { id: 'hdb.breach', category: 'site', label: 'Breach a unit', trigger: 'A locked unit door is breached.', length: L.medium, priority: 3, volume: 0.9 },
  { id: 'hdb.unit', category: 'site', label: 'Open a unit', trigger: 'The survivor goes into a unit.', length: L.short, priority: 2, volume: 0.6 },
  { id: 'hdb.roof', category: 'site', label: 'Open the roof', trigger: 'The roof hatch is forced or opened with a fob.', length: L.medium, priority: 2, volume: 0.8 },
  { id: 'hdb.leave', category: 'site', label: 'Leave the block', trigger: 'The survivor leaves the HDB block.', length: L.short, priority: 1, volume: 0.6 },

  // ---- Crafting ----------------------------------------------------------
  { id: 'craft.make', category: 'craft', label: 'Craft item', trigger: 'A recipe completes.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'craft.cook', category: 'craft', label: 'Cook / boil', trigger: 'A recipe made hot (cooking, boiling water) completes.', length: L.long, priority: 2, volume: 0.7 },
  { id: 'craft.fail', category: 'craft', label: 'Craft refused', trigger: 'Craft was pressed but nothing was made.', length: L.short, priority: 1, volume: 0.5 },
  { id: 'craft.repair', category: 'craft', label: 'Repair', trigger: 'An item is repaired.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'craft.tear', category: 'craft', label: 'Tear cloth', trigger: 'Clothing is torn into rags.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'craft.water', category: 'craft', label: 'Collect water', trigger: 'Rainwater is collected or water is boiled at a site.', length: L.medium, priority: 2, volume: 0.7 },

  // ---- MRT tunnels -------------------------------------------------------
  { id: 'tunnel.enter', category: 'tunnel', label: 'Descend into tunnel', trigger: 'A tunnel run starts.', length: L.long, priority: 2, duck: true, volume: 0.8 },
  { id: 'tunnel.loop', category: 'tunnel', label: 'Tunnel air (loop)', trigger: 'Plays the whole time you are underground. (The ambience already adds rumble and drips.)', length: L.loop, loop: true, priority: 1, volume: 0.4 },
  { id: 'tunnel.step', category: 'tunnel', label: 'Move along track', trigger: 'Moving to the next node on the metro crawl.', length: L.medium, priority: 1, volume: 0.6, pitchVar: 1 },
  { id: 'tunnel.carriage', category: 'tunnel', label: 'Stalled carriage', trigger: 'A choice is made at a stalled train carriage.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'tunnel.checkpoint', category: 'tunnel', label: 'Checkpoint', trigger: 'A choice is made at a tunnel checkpoint.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'tunnel.exit', category: 'tunnel', label: 'Climb out', trigger: 'The tunnel run ends and the survivor surfaces.', length: L.long, priority: 2, volume: 0.7 },

  // ---- Factions & traders ------------------------------------------------
  { id: 'faction.trader', category: 'faction', label: 'Trader opens', trigger: 'A trader\'s stall opens.', length: L.medium, priority: 2, volume: 0.6 },
  { id: 'faction.trade', category: 'faction', label: 'Trade made', trigger: 'A trade is accepted (trader, tunnel or ghost trade).', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'faction.up', category: 'faction', label: 'Standing up', trigger: 'Standing with any faction rises.', length: L.medium, priority: 2, volume: 0.6 },
  { id: 'faction.down', category: 'faction', label: 'Standing down', trigger: 'Standing with any faction falls.', length: L.medium, priority: 2, volume: 0.6 },
  { id: 'faction.aid', category: 'faction', label: 'Faction help', trigger: 'A faction gives aid, intel, food or an escort.', length: L.medium, priority: 2, volume: 0.6 },

  // ---- Evac --------------------------------------------------------------
  { id: 'evac.call', category: 'evac', label: 'Board the evac', trigger: 'The survivor boards after reporting at the evacuation point.', length: L.sting, priority: 3, duck: true, volume: 0.9 },
  { id: 'evac.manifest', category: 'evac', label: 'Evac crew contacted', trigger: 'The crew confirms the survivor can board before departure.', length: L.medium, priority: 2, volume: 0.7 },
  { id: 'evac.warning', category: 'evac', label: 'Evac leaving soon', trigger: 'Two in-game hours or less before the evac departs.', length: L.long, priority: 3, duck: true, volume: 0.8 },

  // ---- Run ---------------------------------------------------------------
  { id: 'run.start', category: 'run', label: 'Wake up', trigger: 'A new run begins on the map.', length: L.sting, priority: 3, duck: true, volume: 0.8 },
  { id: 'run.death', category: 'run', label: 'Death', trigger: 'The survivor dies (death screen).', length: L.sting, priority: 3, duck: true, volume: 0.9 },
  { id: 'run.escape', category: 'run', label: 'Escape', trigger: 'The survivor makes the evac and wins.', length: L.sting, priority: 3, duck: true, volume: 0.9 },
] as const satisfies readonly CueDef[];

export type CueId = (typeof CUES)[number]['id'];

const BY_ID: ReadonlyMap<string, CueDef> = new Map(CUES.map((c) => [c.id, c]));

export function cueDef(id: string): CueDef | undefined {
  return BY_ID.get(id);
}

export function isCueId(id: string): id is CueId {
  return BY_ID.has(id);
}

/** Per-cue settings stored in the manifest, on top of the catalog defaults. */
export interface CueAsset {
  /** File name inside public/audio/. */
  file: string;
  volume?: number;
  pitchVar?: number;
  loop?: boolean;
  /** Bumped on each upload so browsers fetch the new file. */
  rev?: string;
}

export interface AudioManifest {
  version: 1;
  cues: Partial<Record<string, CueAsset>>;
}

export const EMPTY_MANIFEST: AudioManifest = { version: 1, cues: {} };

export const AUDIO_EXTS = ['ogg', 'mp3', 'wav', 'm4a', 'webm', 'flac', 'opus'] as const;

/** `hud.click.ogg` → `hud.click`; null for files that aren't audio. */
export function cueIdFromFile(file: string): string | null {
  const m = /^(.+)\.([a-z0-9]+)$/i.exec(file);
  if (!m) return null;
  return (AUDIO_EXTS as readonly string[]).includes(m[2]!.toLowerCase()) ? m[1]! : null;
}
