import type { ItemDef, ItemInstance, Meters } from './types';

// ---------- Upset stomach: what bad food and murky water cost ----------
//
// Eating something that has turned no longer lands as a lump of infection on
// the spot. It upsets the stomach instead: a pending load that seeps into the
// infection meter over the next few hours, and makes you thirsty while it
// does. Po Chai pills (or a Yakult) settle it before it lands.
//
// What lands from the gut is tracked apart from wound infection. It sits in
// the same meter, but it recedes on its own while you keep drinking, so a bad
// meal is a bad afternoon rather than a permanent scar. Food alone can never
// stack more than GUT_CAP of it, which is why eating rubbish can't kill you on
// its own — it only becomes dangerous on top of infected wounds.

/** Below this freshness (condition %) a perishable upsets the stomach. */
export const SPOILED_BELOW = 50;
/** Stomach load from a meal right at the line, and from one fully rotten. */
export const STOMACH_LOAD_MIN = 6;
export const STOMACH_LOAD_MAX = 20;
/** How fast the stomach load seeps into the infection meter. */
export const STOMACH_PER_HOUR = 3;
/** Thirst drains this much faster while the stomach is upset. */
export const STOMACH_THIRST_MULT = 1.6;
/** The most infection food and drink can hold in the meter at once. */
export const GUT_CAP = 40;
/** Gut infection fades this fast while you're not parched. */
export const GUT_RECEDE_PER_HOUR = 1.5;
/** Thirst at or above this lets gut infection recede (matches the starving line). */
export const GUT_RECEDE_THIRST = 35;
/** Share of a pending stomach load each remedy settles. */
export const STOMACH_SETTLE: Readonly<Record<string, number>> = { po_chai: 1, yakult: 0.5 };

export function stomachOf(m: Pick<Meters, 'stomach'>): number {
  return m.stomach ?? 0;
}

export function gutOf(m: Pick<Meters, 'gut'>): number {
  return m.gut ?? 0;
}

/** Stomach load from eating or drinking something at `conditionPct` freshness. */
export function spoiledLoad(conditionPct: number): number {
  if (conditionPct >= SPOILED_BELOW) return 0;
  const k = 1 - Math.max(0, conditionPct) / SPOILED_BELOW;
  return Math.round(STOMACH_LOAD_MIN + (STOMACH_LOAD_MAX - STOMACH_LOAD_MIN) * k);
}

/**
 * Everything a swallowed item puts on the stomach: rot for a perishable past
 * the line, plus whatever murky water it carries. Infection resistance (traits)
 * trims the whole lot.
 */
export function ingestLoad(
  def: ItemDef,
  inst: Pick<ItemInstance, 'condition' | 'contaminationRisk'>,
  resist = 0,
): { load: number; spoiled: boolean; murky: boolean } {
  const kind = def.effect.kind;
  if (kind !== 'food' && kind !== 'water') return { load: 0, spoiled: false, murky: false };
  const rot = def.perishable ? spoiledLoad(inst.condition ?? 100) : 0;
  const water = (kind === 'water' ? def.effect.infectionRisk ?? 0 : 0) + (inst.contaminationRisk ?? 0);
  const raw = rot + water;
  const load = raw > 0 ? Math.max(1, Math.round(raw * Math.max(0, 1 - resist))) : 0;
  return { load, spoiled: rot > 0, murky: water > 0 };
}

/** Add a stomach load. */
export function upsetStomach(m: Meters, load: number): Meters {
  if (load <= 0) return m;
  return { ...m, stomach: stomachOf(m) + load };
}

/** Po Chai / Yakult: settle the pending load. Returns the meters unchanged for other items. */
export function settleStomach(m: Meters, defId: string): Meters {
  const share = STOMACH_SETTLE[defId];
  const pending = stomachOf(m);
  if (!share || pending <= 0) return m;
  const left = pending * (1 - share);
  return { ...m, stomach: left < 0.5 ? 0 : left };
}

/**
 * Advance the stomach and gut by `hours`: the pending load seeps into the
 * infection meter, and gut infection recedes while you are drinking enough.
 * `thirst` is the reading the recede check uses (the tick's start value).
 */
export function tickGut(m: Meters, hours: number, thirst = m.thirst): Meters {
  const pending = stomachOf(m);
  let gut = gutOf(m);
  if (hours <= 0 || (pending <= 0 && gut <= 0)) return m;
  let infection = m.infection;
  let stomach = pending;
  if (stomach > 0) {
    const seep = Math.min(stomach, STOMACH_PER_HOUR * hours);
    stomach -= seep;
    // Past the cap the stomach still clears, it just can't add any more.
    const land = Math.max(0, Math.min(seep, GUT_CAP - gut));
    gut += land;
    infection += land;
  }
  if (gut > 0 && thirst >= GUT_RECEDE_THIRST) {
    const fade = Math.min(gut, GUT_RECEDE_PER_HOUR * hours);
    gut -= fade;
    infection -= fade;
  }
  return {
    ...m,
    infection: Math.max(0, Math.min(100, infection)),
    stomach: stomach < 1e-6 ? 0 : stomach,
    gut: gut < 1e-6 ? 0 : Math.min(gut, Math.max(0, infection)),
  };
}

/** Lower the meter (a cure): gut infection is taken first, then wound infection. */
export function cureInfection(m: Meters, amount: number): Meters {
  if (amount <= 0) return m;
  const infection = Math.max(0, m.infection - amount);
  const gut = Math.max(0, gutOf(m) - amount);
  return { ...m, infection, gut: Math.min(gut, infection) };
}

/** Net change to the infection meter per hour, as the HUD shows it. */
export function infectionRatePerHour(m: Meters): number {
  let rate = 0;
  if (stomachOf(m) > 0 && gutOf(m) < GUT_CAP) rate += STOMACH_PER_HOUR;
  if ((gutOf(m) > 0 || stomachOf(m) > 0) && m.thirst >= GUT_RECEDE_THIRST) rate -= GUT_RECEDE_PER_HOUR;
  // Nothing to recede from: don't promise a drop that won't happen.
  if (rate < 0 && gutOf(m) <= 0) rate = 0;
  return rate;
}

// ---------- What a high reading does ----------
//
// Infection no longer kills the moment the meter fills. It makes you ill in
// steps instead — tiring faster, healing slower, swinging worse — and the HP it
// already drains from the torso (see `tickSystemicDamage`) is what finally
// ends a run nobody treats. Slow, shown, and fixable with antibiotics.

export type InfectionTier = 'none' | 'fever' | 'high' | 'critical';

export interface InfectionEffect {
  /** Added to the energy drain multiplier (0.2 ⇒ +20%). */
  energyDrain: number;
  /** Multiplier on limb recovery and wound closing. */
  recovery: number;
  /** Subtracted from attack rolls. */
  attack: number;
}

export const INFECTION_TIER_FLOOR: Readonly<Record<InfectionTier, number>> = {
  none: 0,
  fever: 30,
  high: 60,
  critical: 85,
};

export const INFECTION_EFFECTS: Readonly<Record<InfectionTier, InfectionEffect>> = {
  none: { energyDrain: 0, recovery: 1, attack: 0 },
  fever: { energyDrain: 0.2, recovery: 0.7, attack: 0 },
  high: { energyDrain: 0.4, recovery: 0.4, attack: 1 },
  critical: { energyDrain: 0.6, recovery: 0.2, attack: 2 },
};

export function infectionTier(infection: number): InfectionTier {
  if (infection >= INFECTION_TIER_FLOOR.critical) return 'critical';
  if (infection >= INFECTION_TIER_FLOOR.high) return 'high';
  if (infection >= INFECTION_TIER_FLOOR.fever) return 'fever';
  return 'none';
}

export function infectionEffect(infection: number): InfectionEffect {
  return INFECTION_EFFECTS[infectionTier(infection)];
}

/** Torso HP the meter drains per hour (mirrors `tickSystemicDamage`). */
export function infectionHpPerHour(infection: number): number {
  return infection > 0 ? infection / 25 : 0;
}
