import type { BleedLevel, BodyPartId, BodyParts, WoundKind } from './types';

/**
 * Per-fight counters for the post-fight summary card.
 *
 * Display only: every function here is pure and nothing it returns is read by
 * a roll, so the tally can never change how a seeded fight plays out. The
 * store folds each resolved action into `CombatState.tally` and drops it with
 * the fight.
 */

/** What one fight did to one body part — only what got worse counts. */
export interface PartInjury {
  /** Connecting blows that landed on this part. */
  hits: number;
  /** Part HP lost to those blows. */
  damage: number;
  /** Set when the part's wound got worse during the fight (the new kind). */
  wound?: WoundKind;
  /** Set when bleeding started or worsened during the fight (the new level). */
  bleed?: Exclude<BleedLevel, 'none'>;
  fractured?: boolean;
  crippled?: boolean;
}

export interface CombatTally {
  // ---- you ----
  /** Attacks you made: melee swings plus shots. Off-hand follow-ups ride on the swing. */
  swings: number;
  /** Swings or shots that connected (an off-hand follow-up hit counts the swing as a hit). */
  hits: number;
  crits: number;
  /** Shots fired from the holster. */
  shots: number;
  /** Sum of each attack's pre-roll hit chance (0..1); divide by `swings` for the average. */
  oddsSum: number;
  damageDealt: number;
  /** Largest single action's damage. */
  bestHit: number;
  /** Game minutes your actions cost. */
  minutes: number;

  // ---- them ----
  enemyAttacks: number;
  /** Their roll beat your defence (before dodge / block). */
  enemyRollHits: number;
  /** Blows that actually landed on you. */
  enemyHits: number;
  dodges: number;
  blocks: number;
  /** Sum of each enemy attack's pre-roll chance to beat your defence. */
  enemyOddsSum: number;
  /** Enemy attacks with a known pre-roll chance (a parting blow while fleeing has none). */
  enemyRolls: number;
  /** Total body HP lost in the fight. */
  damageTaken: number;
  infection: number;

  injuries: Partial<Record<BodyPartId, PartInjury>>;
}

export function emptyTally(): CombatTally {
  return {
    swings: 0,
    hits: 0,
    crits: 0,
    shots: 0,
    oddsSum: 0,
    damageDealt: 0,
    bestHit: 0,
    minutes: 0,
    enemyAttacks: 0,
    enemyRollHits: 0,
    enemyHits: 0,
    dodges: 0,
    blocks: 0,
    enemyOddsSum: 0,
    enemyRolls: 0,
    damageTaken: 0,
    infection: 0,
    injuries: {},
  };
}

/**
 * Chance a d20 attack hits: the roll plus `mod` meets `target`, or the natural
 * roll lands in the crit band (`critFloor`..20), which always connects.
 */
export function d20HitChance(mod: number, target: number, critFloor = 20): number {
  let n = 0;
  for (let roll = 1; roll <= 20; roll++) if (roll >= critFloor || roll + mod >= target) n++;
  return n / 20;
}

export interface PlayerActionTally {
  hit: boolean;
  critical: boolean;
  damageDealt: number;
  hitChance: number;
  minutes: number;
  shot?: boolean;
}

export function tallyPlayerAction(t: CombatTally, a: PlayerActionTally): CombatTally {
  return {
    ...t,
    swings: t.swings + 1,
    hits: t.hits + (a.hit ? 1 : 0),
    crits: t.crits + (a.critical ? 1 : 0),
    shots: t.shots + (a.shot ? 1 : 0),
    oddsSum: t.oddsSum + a.hitChance,
    damageDealt: t.damageDealt + a.damageDealt,
    bestHit: Math.max(t.bestHit, a.damageDealt),
    minutes: t.minutes + a.minutes,
  };
}

export interface EnemyActionTally {
  /** Pre-roll chance their attack beats your defence; omit for a parting blow. */
  hitChance?: number;
  /** Their roll beat your defence (true for a parting blow that landed). */
  rollHit: boolean;
  dodged?: boolean;
  blocked?: boolean;
  infection?: number;
  /** Where it landed, when it landed. */
  zone?: BodyPartId | null;
}

const WOUND_RANK: Record<WoundKind, number> = { bruise: 1, cut: 2, deep: 3 };
const BLEED_RANK: Record<BleedLevel, number> = { none: 0, minor: 1, major: 2 };

/**
 * Fold one enemy action into the tally. `before` / `after` are the body parts
 * either side of this action, so only what this blow did is counted — time
 * passing between swings never shows up as a combat injury.
 */
export function tallyEnemyAction(
  t: CombatTally,
  a: EnemyActionTally,
  before: BodyParts,
  after: BodyParts,
): CombatTally {
  const next: CombatTally = {
    ...t,
    enemyAttacks: t.enemyAttacks + 1,
    enemyRollHits: t.enemyRollHits + (a.rollHit ? 1 : 0),
    dodges: t.dodges + (a.dodged ? 1 : 0),
    blocks: t.blocks + (a.blocked ? 1 : 0),
    enemyOddsSum: t.enemyOddsSum + (a.hitChance ?? 0),
    enemyRolls: t.enemyRolls + (a.hitChance === undefined ? 0 : 1),
    infection: t.infection + (a.infection ?? 0),
  };
  const zone = a.zone;
  if (!zone || a.dodged || a.blocked || before === after) return next;
  const b = before[zone];
  const n = after[zone];
  const lost = Math.max(0, b.hp - n.hp);
  const prev = t.injuries[zone] ?? { hits: 0, damage: 0 };
  const part: PartInjury = { ...prev, hits: prev.hits + 1, damage: prev.damage + lost };
  if (n.wound && WOUND_RANK[n.wound] > (b.wound ? WOUND_RANK[b.wound] : 0)) {
    if (!part.wound || WOUND_RANK[n.wound] > WOUND_RANK[part.wound]) part.wound = n.wound;
  }
  if (BLEED_RANK[n.bleed] > BLEED_RANK[b.bleed] && n.bleed !== 'none') {
    if (!part.bleed || BLEED_RANK[n.bleed] > BLEED_RANK[part.bleed]) part.bleed = n.bleed;
  }
  if (n.fractured && !b.fractured) part.fractured = true;
  if (n.crippled && !b.crippled) part.crippled = true;
  return {
    ...next,
    enemyHits: next.enemyHits + 1,
    damageTaken: next.damageTaken + lost,
    injuries: { ...t.injuries, [zone]: part },
  };
}

export type CombatVerdict = 'flawless' | 'clean' | 'bloodied' | 'barely' | 'escaped';

export interface CombatSummary {
  /** Hits ÷ attacks, 0..1; null when you never attacked. */
  hitRate: number | null;
  /** Average pre-roll hit chance per attack, 0..1; null when you never attacked. */
  hitOdds: number | null;
  /** Their landed blows ÷ their attacks; null when they never attacked. */
  enemyHitRate: number | null;
  /** Average chance their roll beat your defence; null when they never attacked. */
  enemyOdds: number | null;
  /** Parts that took a blow, worst first. */
  injuries: { part: BodyPartId; injury: PartInjury }[];
  /** Worst outcome among new injuries — drives the verdict. */
  severe: boolean;
  verdict: CombatVerdict;
}

function injuryWeight(i: PartInjury): number {
  return (
    (i.crippled ? 100 : 0) +
    (i.fractured ? 40 : 0) +
    (i.bleed === 'major' ? 30 : i.bleed === 'minor' ? 10 : 0) +
    (i.wound ? WOUND_RANK[i.wound] * 5 : 0) +
    i.damage
  );
}

/**
 * Turn the raw counters into what the card shows. `hpBefore` / `hpAfter` /
 * `hpMax` are total body HP (they include anything the fight did not cause,
 * so the card shows them as a before → after pair, not as damage).
 */
export function summarizeTally(
  t: CombatTally,
  outcome: 'win' | 'flee',
  hpAfter: number,
  hpMax: number,
): CombatSummary {
  const injuries = (Object.entries(t.injuries) as [BodyPartId, PartInjury][])
    .map(([part, injury]) => ({ part, injury }))
    .sort((a, b) => injuryWeight(b.injury) - injuryWeight(a.injury));
  const severe = injuries.some(
    ({ injury }) => injury.crippled || injury.fractured || injury.bleed === 'major',
  );
  const verdict: CombatVerdict =
    outcome === 'flee'
      ? 'escaped'
      : t.damageTaken <= 0
        ? 'flawless'
        : severe || (hpMax > 0 && hpAfter / hpMax <= 0.35)
          ? 'barely'
          : injuries.some(({ injury }) => injury.wound || injury.bleed)
            ? 'bloodied'
            : 'clean';
  return {
    hitRate: t.swings > 0 ? t.hits / t.swings : null,
    hitOdds: t.swings > 0 ? t.oddsSum / t.swings : null,
    enemyHitRate: t.enemyAttacks > 0 ? t.enemyHits / t.enemyAttacks : null,
    enemyOdds: t.enemyRolls > 0 ? t.enemyOddsSum / t.enemyRolls : null,
    injuries,
    severe,
    verdict,
  };
}
