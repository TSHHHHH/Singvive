import type { AttributeKey, FactionId, LocationState } from './types';
import type { Rng } from './rng';
import { itemDef } from './loot';
import { FACTION_CONFIG } from './factions';

export type EventKind = 'locked_door' | 'desperate_survivor' | 'faction_shakedown' | 'mrt_toll';

export type ChoiceKind = 'check' | 'pay' | 'fight' | 'leave';

export interface EventChoice {
  id: string;
  label: string;
  kind: ChoiceKind;
  attr?: AttributeKey; // for 'check'
  dc?: number;
  itemId?: string; // for 'pay'
}

export interface GameEvent {
  kind: EventKind;
  title: string;
  text: string;
  choices: EventChoice[];
  factionId: FactionId;
  /** true when a failed/refused resolution should start human combat. */
  hostile: boolean;
}

function dcFor(currentDanger: number): number {
  return 8 + Math.round(currentDanger * 2);
}

/**
 * Roll a single pre-scavenge event for arriving at a location (or null for a
 * clear approach). Deterministic given the passed (already-forked) rng.
 * Priority: faction shakedown → locked door → desperate survivor.
 */
export function rollPreScavengeEvent(rng: Rng, loc: LocationState): GameEvent | null {
  const dc = dcFor(loc.currentDanger);
  const faction = loc.factionId;

  // --- Faction shakedown (revealed, claimed, non-transit) ---
  if (faction && faction !== 'transit' && loc.isFactionRevealed && rng.chance(0.55)) {
    const cfg = FACTION_CONFIG[faction];
    const tribute = itemDef(cfg.tribute);
    return {
      kind: 'faction_shakedown',
      factionId: faction,
      hostile: cfg.hostile,
      title: `${cfg.name} Shakedown`,
      text: `The ${cfg.name} block the way in. "Toll's one ${tribute.name}. Pay up, or turn around."`,
      choices: [
        { id: 'pay', kind: 'pay', itemId: cfg.tribute, label: `Pay 1× ${tribute.name}` },
        { id: 'talk', kind: 'check', attr: 'wits', dc, label: `Talk your way past (Wits DC ${dc})` },
        cfg.hostile
          ? { id: 'fight', kind: 'fight', label: 'Refuse — draw down' }
          : { id: 'leave', kind: 'leave', label: 'Back off (skip search)' },
      ],
    };
  }

  // --- Locked security door (secure sites) ---
  if (
    (loc.category === 'police' || loc.category === 'hospital' || loc.category === 'hardware') &&
    rng.chance(0.4)
  ) {
    return {
      kind: 'locked_door',
      factionId: null,
      hostile: false, // failure spawns a zombie ambush, handled by store
      title: 'Locked Security Door',
      text: 'A steel security door bars the entrance. It can be forced — loudly.',
      choices: [
        { id: 'pry', kind: 'check', attr: 'strength', dc, label: `Pry it open (Strength DC ${dc})` },
        { id: 'pick', kind: 'check', attr: 'wits', dc, label: `Pick the lock (Wits DC ${dc})` },
        { id: 'find', kind: 'check', attr: 'perception', dc, label: `Find a side way (Perception DC ${dc})` },
        { id: 'leave', kind: 'leave', label: 'Leave it be' },
      ],
    };
  }

  // --- The Desperate Survivor ---
  if (rng.chance(0.15)) {
    return {
      kind: 'desperate_survivor',
      factionId: null,
      hostile: true, // refusal/failure can turn violent
      title: 'The Desperate Survivor',
      text: 'A gaunt figure steps from the shadows, eyeing your pack. "Please… spare some water?"',
      choices: [
        { id: 'give', kind: 'pay', itemId: 'water_bottle', label: 'Give 1× Bottled Water' },
        { id: 'reason', kind: 'check', attr: 'wits', dc, label: `Reason with them (Wits DC ${dc})` },
        { id: 'scare', kind: 'check', attr: 'perception', dc, label: `Scare them off (Perception DC ${dc})` },
        { id: 'refuse', kind: 'fight', label: 'Refuse them' },
      ],
    };
  }

  return null;
}

/** The MRT toll gate event when using fast travel. */
export function mrtTollEvent(): GameEvent {
  const tribute = itemDef(FACTION_CONFIG.transit.tribute);
  return {
    kind: 'mrt_toll',
    factionId: 'transit',
    hostile: false,
    title: 'Transit Coalition Toll',
    text: `A Transit marshal bars the turnstile. "Tunnel's not free — one ${tribute.name} for passage."`,
    choices: [
      { id: 'pay', kind: 'pay', itemId: FACTION_CONFIG.transit.tribute, label: `Pay 1× ${tribute.name}` },
      { id: 'leave', kind: 'leave', label: 'Take the surface instead' },
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
