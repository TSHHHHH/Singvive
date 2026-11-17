import { Rng } from './rng';
import { ITEMS } from './loot';
import { haversine } from './overpass';
import { FACTION_CONFIG, INTEL_CATEGORIES } from './factions';
import type { FactionId, LocationState } from './types';

// ---------------------------------------------------------------------------
// Bounties.
//
// Work a faction posts at the door. They are asked for from outside the wire,
// so a stranger has a way in that isn't tribute, and each one leans on a
// system the player already uses — the pack (deliver), the map (scout) or the
// fight loop (cull). The board is seeded on (site, day): stable within a day,
// fresh at dawn, and a reload can't reroll it.
// ---------------------------------------------------------------------------

type Fid = Exclude<FactionId, null>;

export type BountyKind = 'deliver' | 'scout' | 'cull';

export interface BountyOffer {
  /** `${siteId}:${day}:${n}` — unique per board line. */
  id: string;
  factionId: Fid;
  siteId: string;
  kind: BountyKind;
  /** deliver: what they want, and how many. */
  defId?: string;
  /** deliver: items · cull: kills. */
  count: number;
  /** scout: the site to set foot on. */
  targetId?: string;
  rewardStanding: number;
  rewardDefId: string;
  rewardCount: number;
  /** Doubles as the entrance fee: finishing it opens the door for a week. */
  passDays?: number;
}

export interface ActiveBounty extends BountyOffer {
  acceptedDay: number;
  /** Kill tally when taken, so a cull counts only fights after it. */
  killsAtAccept: number;
}

/** At most this many jobs open at once, across every faction. */
export const MAX_ACTIVE_BOUNTIES = 3;
/** A gate job that stands in for the fee opens the door this long. */
export const BOUNTY_PASS_DAYS = 7;

const SCOUT_MIN_M = 250;
const SCOUT_MAX_M = 1400;

/** Faction flavour: which jobs each one tends to post. */
const KIND_ODDS: Record<Fid, Record<BountyKind, number>> = {
  muster: { cull: 0.45, scout: 0.3, deliver: 0.25 },
  gotong: { deliver: 0.6, scout: 0.25, cull: 0.15 },
  syndicate_88: { deliver: 0.45, cull: 0.4, scout: 0.15 },
  sta: { scout: 0.45, deliver: 0.35, cull: 0.2 },
};

function pickKind(rng: Rng, fid: Fid): BountyKind {
  const odds = KIND_ODDS[fid];
  const r = rng.next();
  let acc = 0;
  for (const k of ['deliver', 'scout', 'cull'] as BountyKind[]) {
    acc += odds[k];
    if (r < acc) return k;
  }
  return 'deliver';
}

function scoutTarget(
  rng: Rng,
  site: LocationState,
  locations: Record<string, LocationState>,
): LocationState | null {
  const bias = INTEL_CATEGORIES[site.factionId as Fid];
  const pool = Object.values(locations).filter((l) => {
    if (l.id === site.id || l.visited) return false;
    if (l.category === 'waypoint') return false;
    const d = haversine(site.lat, site.lng, l.lat, l.lng);
    return d >= SCOUT_MIN_M && d <= SCOUT_MAX_M;
  });
  if (!pool.length) return null;
  const preferred =
    bias === 'danger'
      ? pool.filter((l) => l.currentDanger >= 3)
      : pool.filter((l) => bias.includes(l.category));
  const from = preferred.length ? preferred : pool;
  return from[rng.int(0, from.length - 1)];
}

/**
 * Today's jobs at a faction site: two lines. When the door charges a fee, the
 * first line also pays the fee — "the fee can be a job".
 */
export function bountyBoard(
  seed: string,
  site: LocationState,
  day: number,
  locations: Record<string, LocationState>,
): BountyOffer[] {
  const fid = site.factionId;
  if (!fid) return [];
  const cfg = FACTION_CONFIG[fid];
  const rng = new Rng(seed).fork(`bounty:${site.id}:${day}`);
  const rewards = cfg.stock.filter((id) => ITEMS[id] && !cfg.exclusiveStock.includes(id));
  const wants = cfg.wants.filter((id) => ITEMS[id]);
  const out: BountyOffer[] = [];
  const usedKinds = new Set<BountyKind>();

  for (let n = 0; n < 2; n++) {
    const line = rng.fork(`line${n}`);
    let kind = pickKind(line, fid);
    if (usedKinds.has(kind)) kind = (['deliver', 'scout', 'cull'] as BountyKind[]).find((k) => !usedKinds.has(k))!;
    const base = {
      id: `${site.id}:${day}:${n}`,
      factionId: fid,
      siteId: site.id,
      rewardDefId: rewards.length ? line.pick(rewards) : 'bandage',
    };
    let offer: BountyOffer | null = null;
    if (kind === 'deliver' && wants.length) {
      const defId = line.pick(wants);
      const heavy = (ITEMS[defId].weight ?? 0.5) >= 2;
      offer = { ...base, kind, defId, count: heavy ? 1 : line.int(2, 3), rewardStanding: 1, rewardCount: 1 };
    } else if (kind === 'scout') {
      const target = scoutTarget(line, site, locations);
      if (target) offer = { ...base, kind, targetId: target.id, count: 1, rewardStanding: 1, rewardCount: 1 };
    }
    if (!offer) {
      kind = 'cull';
      offer = {
        ...base,
        kind,
        count: line.int(2, 4),
        rewardStanding: fid === 'muster' ? 2 : 1,
        rewardCount: 2,
      };
    }
    usedKinds.add(offer.kind);
    out.push(offer);
  }
  if ((site.gatePolicy ?? 'fee') === 'fee' && out[0]) out[0] = { ...out[0], passDays: BOUNTY_PASS_DAYS };
  return out;
}

export interface BountyProgress {
  have: number;
  need: number;
  done: boolean;
}

/** How far along a job is, from what the run already tracks. */
export function bountyProgress(
  b: ActiveBounty,
  ctx: { kills: number; locations: Record<string, LocationState>; carried: (defId: string) => number },
): BountyProgress {
  if (b.kind === 'deliver') {
    const have = Math.min(b.count, ctx.carried(b.defId!));
    return { have, need: b.count, done: have >= b.count };
  }
  if (b.kind === 'scout') {
    const done = !!ctx.locations[b.targetId!]?.visited;
    return { have: done ? 1 : 0, need: 1, done };
  }
  const have = Math.min(b.count, Math.max(0, ctx.kills - b.killsAtAccept));
  return { have, need: b.count, done: have >= b.count };
}

/** Coerce saved jobs, dropping anything malformed. */
export function migrateBounties(raw: unknown): ActiveBounty[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (b): b is ActiveBounty =>
      !!b && typeof b === 'object' && typeof b.id === 'string' && typeof b.factionId === 'string' &&
      b.factionId in FACTION_CONFIG && ['deliver', 'scout', 'cull'].includes(b.kind),
  );
}
