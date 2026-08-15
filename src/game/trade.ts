import { Rng } from './rng';
import { itemDef } from './loot';
import {
  FACTION_CONFIG,
  STANDING_KIN,
  STANDING_KNOWN,
  STANDING_TRUSTED,
  type FactionStanding,
} from './factions';
import type { FactionId } from './types';

// ---------------------------------------------------------------------------
// Barter.
//
// There is no currency in this world and there shouldn't be — a tin of food is
// worth what someone will give you for it, and that's the whole economy. So a
// trader doesn't have a price list, they have a handful of *swaps* chalked up
// for the day: this much of that, for one of these.
//
// Two consequences worth keeping in mind before adding anything here:
//
//   1. A swap is take-it-or-leave-it. No haggling UI, no running balance, no
//      partial fills. The interesting decision is "is this trade worth the walk
//      and the shelf space", not "can I shave 10% off".
//   2. The board is seeded on (faction, day). It is stable if you leave and
//      come back within a day, and it turns over at dawn — so an outpost is
//      worth revisiting, and reloading a save can't reroll it.
// ---------------------------------------------------------------------------

export interface TradeOffer {
  id: string;
  /** What you hand over. */
  wantDefId: string;
  wantCount: number;
  /** What you get. */
  giveDefId: string;
  giveCount: number;
  /** Standing needed before this line is on the board at all. */
  minStanding: number;
}

/** An open counter: who, where, and what's chalked up. */
export interface TraderState {
  factionId: Exclude<FactionId, null>;
  /** The site you're standing in — a faction hub that offers trade. */
  locationId: string;
  greeting: string;
  offers: TradeOffer[];
  /** Offer ids already taken today. A chalked line is a one-off, not a shop. */
  taken: string[];
}

/** How many swaps a faction chalks up in a day, by standing. */
function boardSize(standing: number): number {
  if (standing >= STANDING_KIN) return 6;
  if (standing >= STANDING_TRUSTED + 1) return 5; // Welcome +3
  return 4;
}

/**
 * The trader's cut, as a multiplier on what they charge.
 *
 * A stranger who just cleared KNOWN pays over the odds; someone they count as
 * their own pays roughly what the thing is worth. It never drops below 1 —
 * nobody in a famine trades at a loss to be nice.
 */
function markup(standing: number): number {
  return Math.max(1, 2.1 - 0.35 * standing);
}

/**
 * Pick `n` distinct entries out of `pool`, seeded. Falls back to fewer than `n`
 * rather than repeating — a board with the same line twice reads like a bug.
 */
function sample<T>(rng: Rng, pool: T[], n: number): T[] {
  const rest = [...pool];
  const out: T[] = [];
  while (out.length < n && rest.length) {
    out.push(rest.splice(rng.int(0, rest.length - 1), 1)[0]);
  }
  return out;
}

/**
 * How many of `wantId` it takes to buy `giveCount × giveId`, priced off item
 * `value` and rounded up. Clamped at 6 because a swap that needs seven of
 * something is a swap nobody can physically carry to the counter.
 */
function priceIn(wantId: string, giveId: string, giveCount: number, mult: number): number {
  const want = Math.max(1, itemDef(wantId).value);
  const give = Math.max(1, itemDef(giveId).value);
  return Math.max(1, Math.min(PRICE_CAP, Math.ceil((give * giveCount * mult) / want)));
}

/**
 * Most you'll ever be asked for in one swap. Beyond this the trade stops being
 * a decision and becomes a logistics problem — six of anything is most of a
 * backpack.
 */
const PRICE_CAP = 6;
/** Above this, the ask is technically payable but reads as a joke. */
const PRICE_COMFORTABLE = 4;

/**
 * Choose what they'll ask for, given what they're handing over.
 *
 * Naively picking any want produced asks like "one parang for six 4D tickets" —
 * the clamp firing on a want too cheap to price the goods. Try the wants in a
 * shuffled order and take the first that prices comfortably; fall back to the
 * least-bad one rather than whatever came up first.
 */
function chooseWant(
  rng: Rng,
  wants: string[],
  giveId: string,
  giveCount: number,
  mult: number,
): { wantDefId: string; wantCount: number } {
  let fallback: { wantDefId: string; wantCount: number } | null = null;
  for (const wantDefId of sample(rng, wants, wants.length)) {
    const wantCount = priceIn(wantDefId, giveId, giveCount, mult);
    if (wantCount <= PRICE_COMFORTABLE) return { wantDefId, wantCount };
    if (!fallback || wantCount < fallback.wantCount) fallback = { wantDefId, wantCount };
  }
  return fallback!;
}

/**
 * The swaps a faction has chalked up today.
 *
 * Deterministic in (world seed, faction, day, standing tier, outpost flag) —
 * ordinary territory boards are smaller so they never beat a real outpost.
 */
export function traderBoard(
  seed: string,
  factionId: Exclude<FactionId, null>,
  day: number,
  standing: FactionStanding,
  opts?: { outpost?: boolean },
): TradeOffer[] {
  const rep = standing[factionId] ?? 0;
  if (rep < STANDING_KNOWN) return [];

  const cfg = FACTION_CONFIG[factionId];
  const isOutpost = opts?.outpost !== false;
  const rng = new Rng(seed).fork(`trade:${factionId}:${day}:${rep}:${isOutpost ? 'op' : 't'}`);
  const mult = markup(rep);

  const full = boardSize(rep);
  // Territory counters: at most half the outpost board, capped at 3.
  const size = isOutpost ? full : Math.max(1, Math.min(3, Math.floor(full / 2)));
  // Their reserved stock only comes out for their own — and when it does, at
  // least one line of it is *guaranteed*. Merging the two lists and sampling
  // meant reaching KIN could produce a board with no reserved stock on it at
  // all, which makes the top of the ladder feel like it did nothing.
  const catalogue: string[] =
    isOutpost && rep >= STANDING_KIN
      ? [
          ...sample(rng, cfg.exclusiveStock, Math.min(2, size)),
          ...sample(rng, cfg.stock, Math.max(0, size - Math.min(2, size))),
        ]
      : sample(rng, cfg.stock, size);

  const offers: TradeOffer[] = [];
  for (const giveDefId of catalogue) {
    const give = itemDef(giveDefId);
    // Cheap consumables move in handfuls; anything substantial goes one at a
    // time, or the board turns into a wholesale order form.
    const giveCount = give.stackable && give.value <= 6 ? rng.int(2, 4) : 1;

    // They ask for what they're short of. Which of their wants lands on which
    // line is what makes two factions' boards read differently even when they
    // happen to stock the same tin.
    const { wantDefId, wantCount } = chooseWant(rng, cfg.wants, giveDefId, giveCount, mult);
    offers.push({
      id: `${factionId}:${day}:${giveDefId}`,
      wantDefId,
      wantCount,
      giveDefId,
      giveCount,
      minStanding: cfg.exclusiveStock.includes(giveDefId) ? STANDING_KIN : STANDING_KNOWN,
    });
  }
  return offers;
}

/** One line of prose for the board's header — who you're dealing with today. */
export function traderGreeting(factionId: Exclude<FactionId, null>, rep: number): string {
  const cfg = FACTION_CONFIG[factionId];
  if (rep >= STANDING_KIN) return `They pull out the good stuff without being asked. ${cfg.shortName} counts you as theirs.`;
  if (rep >= STANDING_TRUSTED) return 'The counter is open and nobody watches your hands.';
  return 'They\'ll deal with you. They\'ll also count everything twice.';
}
