import { useGame } from '../game/store';
import { isCarried } from '../game/inventory';
import { itemDefOrNull } from '../game/loot';
import { HOURS_PER_DAY, totalHp, totalMaxHp } from '../game/survival';
import { careForItem } from '../game/woundCare';
import type { BodyPartId, CombatImpact } from '../game/types';
import type { CueId } from './cues';
import { sfx } from './sfx';
import { isDicePending, onDiceRelease } from '../ui/diceGate';

// ---------------------------------------------------------------------------
// Sound director: turns game state changes into cues.
//
// `src/game/` must stay pure (no browser APIs), so the store never calls the
// sound engine. Instead this module watches the store from outside:
//   - state diffs for things that *happen* (a slot reveals, a part starts
//     bleeding, a fight ends), and
//   - thin wrappers around a few store actions for things the player *does*
//     where the state alone is ambiguous (crafted vs refused, stash vs bag).
// Wrappers call the original action and only look at what changed; they never
// alter arguments or results.
//
// Cost: one reference-compare pass per store update. It is only installed
// while sound effects are audible, or in DEV for the Sound console.
// ---------------------------------------------------------------------------

type State = ReturnType<typeof useGame.getState>;
type ActionKey = {
  [K in keyof State]: State[K] extends (...args: never[]) => unknown ? K : never;
}[keyof State];

/** Suppress the generic timeline blip when a specific cue just played. */
const NOTIFY_QUIET_MS = 350;

let lastSpecificAt = 0;

/**
 * Cues caused by a check wait for its die to land, so a wound or a fight
 * sting never plays over the tumble. Released just after the verdict sound.
 */
const RELEASE_AFTER_MS = 220;
let heldCues: Array<[CueId, number | undefined]> = [];

function cue(id: CueId, delayMs?: number): void {
  if (isDicePending()) {
    heldCues.push([id, delayMs]);
    return;
  }
  lastSpecificAt = performance.now();
  sfx.play(id, delayMs ? { delayMs } : undefined);
}

function releaseHeldCues(): void {
  const q = heldCues;
  heldCues = [];
  for (const [id, delayMs] of q) cue(id, (delayMs ?? 0) + RELEASE_AFTER_MS);
}

function absHour(s: State): number {
  return (s.day - 1) * HOURS_PER_DAY + s.hour;
}

function hpFrac(s: State): number {
  const max = totalMaxHp(s.bodyParts);
  return max > 0 ? totalHp(s.bodyParts) / max : 1;
}

function crossedDown(prev: number, next: number, at: number): boolean {
  return prev >= at && next < at;
}

function crossedUp(prev: number, next: number, at: number): boolean {
  return prev < at && next >= at;
}

const IMPACT_CUE: Record<CombatImpact['side'], Partial<Record<CombatImpact['kind'], CueId>>> = {
  // The enemy was on the receiving end: the player acted.
  enemy: { hit: 'combat.hit', crit: 'combat.crit', miss: 'combat.miss', dodge: 'combat.miss', block: 'combat.miss', kill: 'combat.kill' },
  // The player was on the receiving end.
  player: { hit: 'combat.hurt', crit: 'combat.hurt.crit', miss: 'combat.dodge', dodge: 'combat.dodge', block: 'combat.block', death: 'combat.hurt.crit' },
};

const CARE_CUE: Record<string, CueId> = {
  bandage: 'care.bandage',
  clean: 'care.clean',
  splint: 'care.splint',
  support: 'care.splint',
  firstAid: 'care.firstaid',
  pain: 'care.pain',
};

const ACTIVITY_CUE: Record<string, CueId> = {
  car_alarm: 'world.car_alarm',
  gunfire: 'world.gunfire',
  shutter: 'world.shutter',
  scavengers: 'world.scavengers',
};

// ---- state diffs ------------------------------------------------------------

function onChange(s: State, p: State): void {
  // Run start / end.
  if (s.phase !== p.phase) {
    if (s.phase === 'game' && p.phase === 'spawn') cue('run.start');
    if (s.phase === 'death' && !s.escaped) cue('run.death');
  }
  if (s.escaped && !p.escaped) cue('run.escape');
  if (s.phase !== 'game') {
    if (p.phase === 'game') sfx.stopLoops();
    return;
  }

  // Travel.
  if (s.travelAnim !== p.travelAnim) {
    if (s.travelAnim && !p.travelAnim) cue('travel.depart');
    if (!s.travelAnim && p.travelAnim) cue('travel.arrive');
    sfx.loop('travel.steps', !!s.travelAnim);
  }
  if (s.nearbyRecognition !== p.nearbyRecognition && s.nearbyRecognition.length > p.nearbyRecognition.length) {
    cue('travel.landmark');
  }

  // Searching.
  if (s.pendingSearch !== p.pendingSearch) diffSearch(s, p);

  // Combat.
  if (s.combat !== p.combat) diffCombat(s, p);

  // Injuries and care.
  if (s.bodyParts !== p.bodyParts) {
    let bleed: CueId | null = null;
    for (const id of Object.keys(s.bodyParts) as BodyPartId[]) {
      const a = p.bodyParts[id];
      const b = s.bodyParts[id];
      if (!a || !b || a === b) continue;
      if (b.bleed === 'major' && a.bleed !== 'major') bleed = 'body.bleed.major';
      else if (b.bleed === 'minor' && a.bleed === 'none' && !bleed) bleed = 'body.bleed';
      if (b.fractured && !a.fractured) cue('body.fracture');
      if (b.crippled && !a.crippled) cue('body.cripple');
    }
    if (bleed) cue(bleed);
    const hp0 = hpFrac(p);
    const hp1 = hpFrac(s);
    if (crossedDown(hp0, hp1, 0.3)) cue('vitals.hp.low');
  }
  if (s.lastCare && s.lastCare.sequence !== p.lastCare?.sequence) {
    const id = CARE_CUE[s.lastCare.action];
    if (id) cue(id);
  }

  // Vitals.
  if (s.meters !== p.meters) {
    const a = p.meters;
    const b = s.meters;
    for (const [key, id] of [['thirst', 'vitals.thirst'], ['hunger', 'vitals.hunger'], ['energy', 'vitals.energy']] as const) {
      if (crossedDown(a[key], b[key], 25) || crossedDown(a[key], b[key], 10)) cue(id);
    }
    if ([30, 60, 85].some((t) => crossedUp(a.infection, b.infection, t))) cue('vitals.infection');
  }

  // HDB scouting.
  if (s.hdbScout && s.hdbScout !== p.hdbScout && s.hdbScout.unitId !== p.hdbScout?.unitId) cue('hdb.scout');

  // Tunnels.
  if (s.tunnel !== p.tunnel) {
    if (s.tunnel && !p.tunnel) cue('tunnel.enter');
    if (!s.tunnel && p.tunnel) cue('tunnel.exit');
    sfx.loop('tunnel.loop', !!s.tunnel);
  }

  // Factions and traders.
  if (s.trader && !p.trader) cue('faction.trader');
  if (s.factionStanding !== p.factionStanding) {
    let up = false;
    let down = false;
    for (const k of Object.keys(s.factionStanding) as (keyof typeof s.factionStanding)[]) {
      const d = s.factionStanding[k] - (p.factionStanding[k] ?? 0);
      if (d > 0) up = true;
      if (d < 0) down = true;
    }
    if (down) cue('faction.down');
    else if (up) cue('faction.up');
  }

  // Evac.
  if (s.evacContacted && !p.evacContacted) cue('evac.manifest');
  if (s.evacDeadline !== null && (s.day !== p.day || s.hour !== p.hour)) {
    const left0 = (p.evacDeadline ?? s.evacDeadline) - absHour(p);
    const left1 = s.evacDeadline - absHour(s);
    if (left0 > 2 && left1 <= 2 && left1 > 0) cue('evac.warning');
  }

  // The city.
  const ev = s.activity.event;
  if (ev && ev.id !== p.activity.event?.id) {
    const id = ACTIVITY_CUE[ev.kind];
    if (id) cue(id);
  }
  if (s.noisePulses !== p.noisePulses && s.noisePulses.length) {
    const top = s.noisePulses[s.noisePulses.length - 1]!.id;
    const prevTop = p.noisePulses.length ? p.noisePulses[p.noisePulses.length - 1]!.id : -1;
    if (top > prevTop) cue('world.noise');
  }
  if (s.pendingEvent && !p.pendingEvent) cue('world.event');

  // Generic timeline blip, only when nothing more specific just played.
  if (s.log !== p.log && s.log.length) {
    const last = s.log[s.log.length - 1]!;
    const prevLast = p.log.length ? p.log[p.log.length - 1]!.id : -1;
    if (last.id !== prevLast && last.tone !== 'info' && performance.now() - lastSpecificAt > NOTIFY_QUIET_MS) {
      const blip = last.tone === 'good' ? 'hud.notify.good' : 'hud.notify.bad';
      if (isDicePending()) heldCues.push([blip, undefined]);
      else sfx.play(blip);
    }
  }
}

function diffSearch(s: State, p: State): void {
  const a = p.pendingSearch;
  const b = s.pendingSearch;
  if (b && (!a || a.nonce !== b.nonce)) {
    cue(b.slots.length === 0 ? 'search.empty' : 'search.start');
  }
  if (b && a && a.nonce === b.nonce && a.slots !== b.slots) {
    let rare = false;
    let found = false;
    const before = new Map(a.slots.map((x) => [x.id, x.state]));
    for (const slot of b.slots) {
      if (slot.state === 'found' && before.get(slot.id) !== 'found' && before.get(slot.id) !== 'taken') {
        found = true;
        if (slot.highlight) rare = true;
      }
    }
    if (rare) cue('search.rare');
    else if (found) cue('search.reveal');
  }
  sfx.loop('search.rummage', !!b && b.slots.some((x) => x.state === 'searching'));
}

function diffCombat(s: State, p: State): void {
  const a = p.combat;
  const b = s.combat;
  if (b && !a) {
    const kind = b.zombie.kind;
    cue(kind === 'human' ? 'combat.enemy.human' : kind === 'animal' ? 'combat.enemy.animal' : 'combat.enemy.zombie', 120);
  }
  if (!b) return;
  const imp = b.impact;
  if (imp && imp.id !== a?.impact?.id) {
    // The player's own action: a swing or a shot first, then how it landed.
    if (imp.side === 'enemy' && imp.kind !== 'win') cue(a?.firePrepared ? 'combat.shot' : 'combat.swing');
    const id = IMPACT_CUE[imp.side][imp.kind];
    if (id) cue(id, imp.side === 'enemy' ? 90 : 0);
  }
  if (b.outcome !== a?.outcome) {
    if (b.outcome === 'win') cue('combat.victory', 700);
    if (b.outcome === 'flee') cue('combat.flee');
  }
}

// ---- action wrappers ----------------------------------------------------------

type After<K extends ActionKey> = (
  before: State,
  after: State,
  args: Parameters<Extract<State[K], (...a: never[]) => unknown>>,
  result: ReturnType<Extract<State[K], (...a: never[]) => unknown>>,
) => void;

function changed(a: State, b: State): boolean {
  return a !== b;
}

const WRAPS: { [K in ActionKey]?: After<K> } = {
  moveItem: (_b, _a, _args, ok) => cue(ok ? 'inv.place' : 'inv.refuse'),
  packReplacing: (_b, _a, _args, ok) => cue(ok ? 'inv.place' : 'inv.refuse'),
  rotateItem: (b, a) => {
    if (a.items !== b.items) cue('inv.rotate');
  },
  equipItem: (b, a, [, slot]) => {
    if (a.equipment === b.equipment) return;
    cue(slot === 'mainHand' || slot === 'offHand' || slot === 'firearm' ? 'inv.equip.weapon' : 'inv.equip');
  },
  unequipItem: (b, a) => {
    if (a.equipment !== b.equipment) cue('inv.unequip');
  },
  dropItem: (b, a) => {
    if (a.items !== b.items) cue('inv.drop');
  },
  transferItem: (b, a, [, to]) => {
    if (a.items !== b.items) cue(isCarried(to) ? 'inv.unstash' : 'inv.stash');
  },
  applyItem: (b, a, [uid]) => {
    if (a.items === b.items && a.meters === b.meters) return;
    if (a.lastCare?.sequence !== b.lastCare?.sequence) return; // the care diff has it
    const inst = b.items.find((i) => i.uid === uid);
    const def = inst ? itemDefOrNull(inst.defId) : undefined;
    if (!def || careForItem(def.id)) return;
    const k = def.effect.kind;
    if (k === 'food') cue('use.eat');
    else if (k === 'water') cue('use.drink');
    else if (k === 'heal' || k === 'cure' || k === 'energy') cue('use.medicine');
    else if (k === 'intel' || k === 'skillBook') cue('use.read');
  },
  refillMagazine: (b, a) => {
    if (a.items !== b.items) cue('gun.reload');
  },
  loadGunFromMagazine: (b, a) => {
    if (a.items !== b.items || a.equipment !== b.equipment) cue('gun.reload');
  },
  refillFirearm: (b, a) => {
    if (a.items !== b.items || a.equipment !== b.equipment) cue('gun.reload');
  },
  craftItem: (b, a, [, mode]) => {
    if (a.items === b.items) cue('craft.fail');
    else cue(mode === 'hot' ? 'craft.cook' : 'craft.make');
  },
  repairItem: (b, a) => {
    if (a.items !== b.items) cue('craft.repair');
  },
  tearForRags: (b, a) => {
    if (a.items !== b.items) cue('craft.tear');
  },
  tearOwnClothes: (b, a) => {
    if (a.items !== b.items) cue('craft.tear');
  },
  collectSiteWater: (b, a) => {
    if (a.items !== b.items) cue('craft.water');
  },
  rest: (b, a) => restCue(b, a),
  outpostRest: (b, a) => restCue(b, a),
  tunnelRest: (b, a) => restCue(b, a),
  enter: (b, a) => {
    if (changed(b, a)) cue('site.enter');
  },
  sneakEnter: (b, a) => {
    if (changed(b, a)) cue('site.sneak');
  },
  forceEnter: (b, a) => {
    if (changed(b, a)) cue('site.force');
  },
  hdbEnter: (b, a) => {
    if (a.hdb !== b.hdb && a.hdb) cue('hdb.enter');
  },
  hdbTravel: (b, a) => {
    if (a.hdb !== b.hdb) cue('hdb.stairs');
  },
  hdbBreach: (b, a) => {
    if (changed(b, a)) cue('hdb.breach');
  },
  hdbPick: (b, a) => {
    if (changed(b, a)) cue('hdb.unit');
  },
  hdbOpenRoof: (b, a) => {
    if (changed(b, a)) cue('hdb.roof');
  },
  hdbLeave: (b, a) => {
    if (b.hdb && !a.hdb) cue('hdb.leave');
  },
  tunnelStep: (b, a) => {
    if (a.tunnel && b.tunnel && a.tunnel.currentId !== b.tunnel.currentId) cue('tunnel.step');
  },
  tunnelCarriage: (b, a) => {
    if (changed(b, a)) cue('tunnel.carriage');
  },
  tunnelCheckpoint: (b, a) => {
    if (changed(b, a)) cue('tunnel.checkpoint');
  },
  acceptTrade: (b, a) => {
    if (a.items !== b.items) cue('faction.trade');
  },
  tunnelAcceptOffer: (b, a) => {
    if (a.items !== b.items) cue('faction.trade');
  },
  acceptGhostTrade: (b, a) => {
    if (a.items !== b.items) cue('faction.trade');
  },
  factionAid: (b, a) => {
    if (changed(b, a)) cue('faction.aid');
  },
  factionIntel: (b, a) => {
    if (changed(b, a)) cue('faction.aid');
  },
  factionFeed: (b, a) => {
    if (changed(b, a)) cue('faction.aid');
  },
  factionEscort: (b, a) => {
    if (changed(b, a)) cue('faction.aid');
  },
  callEvac: (b, a) => {
    if (!b.escaped && a.escaped) cue('evac.call');
  },
  combatSetStance: (b, a) => {
    if (a.combat?.selectedStance !== b.combat?.selectedStance) cue('combat.stance');
  },
  takeSearchItem: (b, a) => {
    if (a.items !== b.items) cue('search.take');
  },
  takeAllFound: (b, a) => {
    if (a.items !== b.items) cue('search.take');
  },
  abortSearch: (b, a) => {
    if (b.pendingSearch && !a.pendingSearch) cue('search.abort');
  },
  completeSearch: (b, a) => {
    if (!b.pendingSearch || a.pendingSearch) return;
    const found = b.pendingSearch.slots.some((x) => x.state === 'found' || x.state === 'taken');
    cue(found ? 'search.done' : 'search.empty');
  },
};

function restCue(b: State, a: State): void {
  if (a.day === b.day && a.hour === b.hour) return;
  cue('rest.sleep');
  const woken = (!!a.combat && !b.combat) || (!!a.pendingEvent && !b.pendingEvent);
  cue(woken ? 'rest.woken' : 'rest.wake', 1600);
}

// ---- install ----------------------------------------------------------------

let uninstall: (() => void) | null = null;

/** Start listening to the store. Idempotent. */
export function installSoundDirector(): void {
  if (uninstall) return;
  const originals: Partial<Record<ActionKey, unknown>> = {};
  const patch: Partial<State> = {};
  const state = useGame.getState();
  for (const key of Object.keys(WRAPS) as ActionKey[]) {
    const orig = state[key] as unknown as (...args: unknown[]) => unknown;
    const after = WRAPS[key] as unknown as (b: State, a: State, args: unknown[], r: unknown) => void;
    if (typeof orig !== 'function') continue;
    originals[key] = orig;
    (patch as Record<string, unknown>)[key] = (...args: unknown[]) => {
      const before = useGame.getState();
      const result = orig(...args);
      try {
        after(before, useGame.getState(), args, result);
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[sfx] director', key, err);
      }
      return result;
    };
  }
  useGame.setState(patch);
  const unsub = useGame.subscribe((s, p) => {
    try {
      onChange(s, p);
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[sfx] director', err);
    }
  });
  const unrelease = onDiceRelease(releaseHeldCues);
  uninstall = () => {
    unsub();
    unrelease();
    heldCues = [];
    useGame.setState(originals as Partial<State>);
    sfx.stopLoops();
  };
}

export function uninstallSoundDirector(): void {
  uninstall?.();
  uninstall = null;
}
