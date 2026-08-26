import type { FactionId, FactionService, LocationState, PoiCategory } from './types';
import { Rng } from './rng';
import type { IconName } from '../icons/keys';
import { haversine } from './overpass';

export interface FactionData {
  id: Exclude<FactionId, null>;
  /** Full institutional name, as it reads on a signboard. */
  name: string;
  /** Compact label for badges and log lines. */
  shortName: string;
  /** semantic icon key — see src/icons/keys.ts */
  icon: IconName;
  /** Hex for map badge / border UI. */
  color: string;
  /** Hostile factions fight when negotiations fail; others just block access. */
  hostileByDefault: boolean;
  blurb: string;
  /**
   * What they'll take at a shakedown or a toll, in order of preference. Any one
   * of them settles it — a gate that accepts exactly one item def is a gate
   * that's shut most of the time.
   */
  tribute: string[];
  /** Where they set up shop — drives seeded territory assignment. */
  preferredPoiCategories: PoiCategory[];
  /** Default odds a preferred site is actually claimed. */
  claimChance: number;
  /** Per-category overrides — schools must stay sparse. */
  claimChanceByCategory?: Partial<Record<PoiCategory, number>>;

  // ---- the outpost -------------------------------------------------------
  /**
   * What the place is called once you're inside the wire. A faction's outpost
   * is a site of theirs you go to *on purpose* — full services, marked on the
   * map, worth the walk.
   */
  outpostName: string;
  /**
   * Preferred categories for outpost placement (still must be claimed by them).
   * Picker falls back to preferred territory, then any claimed site.
   */
  outpostCategories: PoiCategory[];

  /**
   * Services at an outpost. Ordinary territory samples from `ordinaryServices`
   * (or from this list minus `signature`) and never rolls the signature.
   */
  services: FactionService[];
  /** Outpost-only verb. Ordinary claimed ground never offers this. */
  signature?: FactionService;
  /**
   * Ordinary-territory pool. Empty means the site is a gate / toll only.
   * Absent means `services` minus `signature`, sampled 1–2.
   */
  ordinaryServices?: FactionService[];
  /** Firearms (ranged weapons) on the board. Only the 88 fence sells them. */
  sellsFirearms: boolean;
  /** Ammunition on the board. The Muster hoards rounds; they do not sell them. */
  sellsAmmo: boolean;

  // ---- the counter -------------------------------------------------------
  /**
   * What they'll hand over, in rough order of how gladly. Each faction's list
   * is the reason to walk to their gate rather than anyone else's.
   */
  stock: string[];
  /** Reserved for the ones they count as their own — standing STANDING_KIN. */
  exclusiveStock: string[];
  /**
   * What they're short of and will pay over the odds for. Selling into a want
   * is how a stranger becomes a regular.
   */
  wants: string[];
}

export const FACTION_CONFIG: Record<Exclude<FactionId, null>, FactionData> = {
  muster: {
    id: 'muster',
    name: 'The Muster',
    shortName: 'Muster',
    icon: 'faction.muster',
    color: '#c4b07a',
    hostileByDefault: false,
    blurb:
      'Ex-NS who kept showing up after the chain of command died. No mandate — just ledgers, checkpoints, and the belief that managed order is the only way Singapore comes back.',
    tribute: ['canned_food', 'batteries', 'bandage'],
    preferredPoiCategories: ['police', 'school'],
    claimChance: 0.45,
    claimChanceByCategory: { school: 0.15 },
    outpostName: 'Muster Point',
    outpostCategories: ['school', 'police'],
    services: ['escort', 'aid', 'rest'],
    signature: 'escort',
    sellsFirearms: false,
    sellsAmmo: false,
    stock: ['bandage', 'medkit', 'antiseptic', 'antibiotics', 'n95_mask', 'splint', 'army_ration'],
    exclusiveStock: ['army_ration', 'antibiotics'],
    wants: ['canned_food', 'rice_pack', 'batteries', 'fuel_can', 'purification_tabs'],
  },
  gotong: {
    id: 'gotong',
    name: 'Gotong Royong',
    shortName: 'Gotong',
    icon: 'faction.gotong',
    color: '#d4c4a8',
    hostileByDefault: false,
    blurb:
      'Gotong royong — neighbours pooling what they have so the estate eats. Stallholders and aunties who kept the hawker and the wet market running. Not a company. Not armed.',
    tribute: ['canned_food', 'hawker_meal', 'water_bottle'],
    preferredPoiCategories: ['foodcourt', 'supermarket'],
    claimChance: 0.4,
    outpostName: 'Common Kitchen',
    outpostCategories: ['foodcourt', 'supermarket'],
    services: ['feed', 'trade', 'rest'],
    signature: 'feed',
    sellsFirearms: false,
    sellsAmmo: false,
    stock: [
      'hawker_meal', 'canned_food', 'rice_pack', 'water_bottle',
      'newater', 'purification_tabs', 'milo_tin', 'kaya_toast',
    ],
    exclusiveStock: ['nasi_lemak', 'bak_kwa', 'durian', 'coffee'],
    wants: ['fuel_can', 'scrap_metal', 'glass_bottle', 'wild_boar_meat', 'river_fish', 'cloth_rags'],
  },
  syndicate_88: {
    id: 'syndicate_88',
    name: 'The 88 Syndicate (双八会)',
    shortName: '88 Syndicate',
    icon: 'faction.syndicate_88',
    color: '#d92d2d',
    hostileByDefault: true,
    blurb: 'Void-deck muscle turned estate warlords. They take what they want.',
    tribute: ['jewellery', 'tiger_beer', 'painkillers'],
    preferredPoiCategories: ['residential', 'industrial'],
    claimChance: 0.12,
    outpostName: 'Void Deck Court',
    outpostCategories: ['residential', 'industrial'],
    services: ['trade', 'intel', 'rest'],
    signature: 'trade',
    ordinaryServices: ['intel'],
    sellsFirearms: true,
    sellsAmmo: true,
    stock: [
      'painkillers', 'tiger_beer', 'parang', 'meat_cleaver',
      'duct_tape', 'spare_parts', 'powerbank', 'energy_drink',
    ],
    exclusiveStock: ['pistol', 'ammo_box', 'katana', 'sbo_vest'],
    wants: ['jewellery', 'red_packet', 'four_d_ticket', 'tiger_beer', 'toolbox', 'gun_oil'],
  },
  sta: {
    id: 'sta',
    name: 'Subterranean Transit Authority (STA)',
    shortName: 'STA',
    icon: 'faction.sta',
    color: '#2bc4d9',
    hostileByDefault: false,
    blurb: 'They keep the tunnels running — for a toll.',
    tribute: ['batteries', 'torch', 'canned_food'],
    preferredPoiCategories: ['mrt'],
    claimChance: 0.35,
    outpostName: 'Barricade Camp',
    outpostCategories: ['mrt'],
    // Ride is the existing tunnel flow, not a hub button. Ordinary platforms
    // are a turnstile, not a shop.
    services: ['rest', 'intel', 'trade'],
    ordinaryServices: [],
    sellsFirearms: false,
    sellsAmmo: false,
    stock: ['torch', 'batteries', 'rain_tarp', 'powerbank', 'glass_bottle'],
    exclusiveStock: ['toolbox', 'hard_hat'],
    wants: ['batteries', 'canned_food', 'duct_tape', 'scrap_metal'],
  },
};

// ---------------------------------------------------------------------------
// Standing
//
// One number per faction, -5..+5 (EVE-style grace), and every service hangs
// off it. Lives here rather than in events.ts because standing gates the
// counter, the bed, and the gate scene.
//
// The ladder, and what each rung actually buys:
//
//   ≤ -4     TERRIBLE  they shoot; tribute or refuse → fight.
//   -3..-2   BAD       tribute demanded; refuse is just turned away.
//   -1..+1   NEUTRAL   entrance fee at the gate; illicit entry from frontage.
//   +1       KNOWN     the counter opens. A hostile faction stops shooting.
//   +2..+3   WELCOME   waved through; outpost bed / aid unlock.
//   +4..+5   KIN       they break out the stock they keep for their own.
// ---------------------------------------------------------------------------

export const STANDING_MIN = -5;
export const STANDING_MAX = 5;
/** At or below this, even the orderly factions open fire. */
export const STANDING_HATED = -4;
/** Bad standing: tribute at the gate, but refuse does not start a fight. */
export const STANDING_BAD = -2;
/** The rung where a faction will trade with you — and stop shooting at you. */
export const STANDING_KNOWN = 1;
/** Waved through the territory, and welcome to sleep at the outpost. */
export const STANDING_TRUSTED = 2;
/** Counted as one of their own; the reserved stock comes out. */
export const STANDING_KIN = 4;

export type FactionStanding = Record<Exclude<FactionId, null>, number>;

export const emptyStanding = (): FactionStanding => ({
  muster: 0,
  gotong: 0,
  syndicate_88: 0,
  sta: 0,
});

export const clampStanding = (n: number) =>
  Math.max(STANDING_MIN, Math.min(STANDING_MAX, n));

/**
 * Would this faction shoot rather than haggle?
 *
 * `hostileByDefault` is no longer a permanent sentence — it means "hostile
 * until you are KNOWN here". That single change is what makes the 88 Syndicate
 * approachable at all, and it's the same rule a starting trait exploits by
 * simply handing you the first point of standing up front.
 */
export function factionIsHostile(id: FactionId, standing: FactionStanding): boolean {
  if (!id) return false;
  if (standing[id] <= STANDING_HATED) return true;
  return FACTION_CONFIG[id].hostileByDefault && standing[id] < STANDING_KNOWN;
}

/** True once a faction knows your face well enough to stop charging you. */
export function factionWavesYouThrough(id: FactionId, standing: FactionStanding): boolean {
  return !!id && standing[id] >= STANDING_TRUSTED;
}

/** Will they sell to you at all? */
export function factionTrades(id: FactionId, standing: FactionStanding): boolean {
  return !!id && standing[id] >= STANDING_KNOWN;
}

/** Is their ground safe enough to sleep on? */
export function factionShelters(id: FactionId, standing: FactionStanding): boolean {
  return !!id && standing[id] >= STANDING_TRUSTED;
}

/** Intel / rumors open with the counter. */
export function factionSharesIntel(id: FactionId, standing: FactionStanding): boolean {
  return factionTrades(id, standing);
}

/** Field aid is for people they trust with their medics. */
export function factionOffersAid(id: FactionId, standing: FactionStanding): boolean {
  return factionShelters(id, standing);
}

/** Canteen — Known, and only Gotong offers the button. */
export function factionFeeds(id: FactionId, standing: FactionStanding): boolean {
  return !!id && id === 'gotong' && standing[id] >= STANDING_KNOWN;
}

/** Escort — Known, and only the Muster books the walk. */
export function factionEscorts(id: FactionId, standing: FactionStanding): boolean {
  return !!id && id === 'muster' && standing[id] >= STANDING_KNOWN;
}

/** Short label for the standing badge. */
export function standingLabel(n: number): string {
  if (n <= STANDING_HATED) return 'Terrible';
  if (n <= STANDING_BAD) return 'Bad';
  if (n < 0) return 'Wary';
  if (n < STANDING_KNOWN) return 'Stranger';
  if (n < STANDING_TRUSTED) return 'Known';
  if (n < STANDING_KIN) return 'Welcome';
  return 'Kin';
}

/** Standing band used to pick the lawful gate scene (fee vs tribute). */
export type GateStandingBand = 'fee' | 'tribute' | 'terrible';

export function gateStandingBand(
  id: Exclude<FactionId, null>,
  standing: FactionStanding,
): GateStandingBand {
  const n = standing[id] ?? 0;
  if (n <= STANDING_HATED) return 'terrible';
  if (n <= STANDING_BAD) return 'tribute';
  return 'fee';
}

/** Priority order — first faction whose preferred categories match wins. */
const CLAIM_ORDER: Exclude<FactionId, null>[] = ['sta', 'muster', 'gotong', 'syndicate_88'];

/**
 * Seeded faction assignment by OSM category, driven by each faction's
 * `preferredPoiCategories`. Anything unclaimed returns null.
 */
export function assignFaction(rng: Rng, category: PoiCategory): FactionId {
  const r = rng.next();
  for (const id of CLAIM_ORDER) {
    const cfg = FACTION_CONFIG[id];
    if (!cfg.preferredPoiCategories.includes(category)) continue;
    const chance = cfg.claimChanceByCategory?.[category] ?? cfg.claimChance;
    return r < chance ? id : null;
  }
  return null;
}

export const ALL_FACTION_SERVICES: FactionService[] = [
  'trade',
  'rest',
  'aid',
  'intel',
  'feed',
  'escort',
];

export const OUTPOSTS_PER_FACTION = 2;
/** Same-faction outposts stay a walk apart so twin pins aren't a cluster. */
export const OUTPOST_MIN_SPACING_M = 1400;

/** Muster escort: one neighbourhood walk, not a cross-island taxi. */
export const ESCORT_RANGE_M = 2000;
/** Additive encounter-chance hit while an escort is walking you there. */
export const ESCORT_ENCOUNTER_MOD = -0.4;
/** Canteen restore — a proper sitting-down meal, no pack item. */
export const CANTEEN_HUNGER = 38;
export const CANTEEN_THIRST = 28;

export type OutpostIds = Partial<Record<Exclude<FactionId, null>, string[]>>;

export function isOutpostSite(
  outposts: OutpostIds,
  factionId: Exclude<FactionId, null>,
  locationId: string,
): boolean {
  return (outposts[factionId] ?? []).includes(locationId);
}

export function outpostKit(id: Exclude<FactionId, null>): FactionService[] {
  return [...FACTION_CONFIG[id].services];
}

export function ordinaryKit(id: Exclude<FactionId, null>): FactionService[] {
  const cfg = FACTION_CONFIG[id];
  if (cfg.ordinaryServices) return [...cfg.ordinaryServices];
  return cfg.services.filter((s) => s !== cfg.signature);
}

/** Services this site actually offers (outposts always the faction's full kit). */
export function locationServices(loc: LocationState, outposts: OutpostIds): FactionService[] {
  if (!loc.factionId) return [];
  if (loc.isFactionOutpost || isOutpostSite(outposts, loc.factionId, loc.id)) {
    return outpostKit(loc.factionId);
  }
  return loc.factionServices ?? [];
}

/**
 * Whether the player may use NPC services here without a fresh gate scene.
 * Trusted / day-pass / Known-and-not-hostile all count.
 */
export function hasFactionClearance(
  loc: LocationState,
  standing: FactionStanding,
  day: number,
): boolean {
  const id = loc.factionId;
  if (!id) return true;
  if (factionWavesYouThrough(id, standing)) return true;
  if ((loc.tollPaidThroughDay ?? -1) >= day) return true;
  if (!factionIsHostile(id, standing) && standing[id] >= STANDING_KNOWN) return true;
  return false;
}

/**
 * 88 Kin may walk an occupied residential block — once. The decks are yours
 * if they know your face; nobody else scavenges claimed ground.
 */
export function canKinSearch88Deck(
  loc: LocationState,
  standing: FactionStanding,
): boolean {
  if (loc.factionId !== 'syndicate_88') return false;
  if (loc.category !== 'residential') return false;
  if ((standing.syndicate_88 ?? 0) < STANDING_KIN) return false;
  return true;
}

function sampleServices(rng: Rng, pool: FactionService[], n: number): FactionService[] {
  const rest = [...pool];
  const out: FactionService[] = [];
  while (out.length < n && rest.length) {
    out.push(rest.splice(rng.int(0, rest.length - 1), 1)[0]);
  }
  return out;
}

/**
 * Stamp outpost flags and seed ordinary-territory service subsets.
 * Outposts always get that faction's full kit; ordinary ground samples 1–2
 * from the lesser pool (never the signature). STA ordinary platforms stay
 * a toll with no hub buttons.
 *
 * Untouched sites keep their previous object identity. Pass `onlyIds` when
 * expanding the world so existing neighbourhoods are not cloned.
 */
export function applyFactionServices(
  locations: Record<string, LocationState>,
  outposts: OutpostIds,
  seed: string,
  onlyIds?: Iterable<string>,
): Record<string, LocationState> {
  const base = new Rng(seed).fork('factionServices');
  const outpostSet = new Set<string>();
  for (const ids of Object.values(outposts)) {
    for (const id of ids ?? []) outpostSet.add(id);
  }

  const ids = onlyIds ? [...onlyIds] : Object.keys(locations);
  let next: Record<string, LocationState> | null = null;
  for (const id of ids) {
    const loc = locations[id];
    if (!loc) continue;
    const patched = stampFactionServices(loc, outpostSet.has(id), base.fork(id));
    if (patched === loc) continue;
    if (!next) next = { ...locations };
    next[id] = patched;
  }
  return next ?? locations;
}

function stampFactionServices(
  loc: LocationState,
  isOp: boolean,
  siteRng: Rng,
): LocationState {
  if (!loc.factionId) {
    if (!loc.factionServices && !loc.isFactionOutpost) return loc;
    return { ...loc, factionServices: undefined, isFactionOutpost: false };
  }
  // Already stamped this run — do not re-roll ordinary kits (or clone the site).
  if (loc.factionServices !== undefined && loc.isFactionOutpost === isOp) return loc;

  const lesser = ordinaryKit(loc.factionId);
  const patched: LocationState = {
    ...loc,
    isFactionOutpost: isOp,
    isFactionRevealed: isOp ? true : loc.isFactionRevealed,
    discovered: isOp ? true : loc.discovered,
    factionServices: isOp
      ? outpostKit(loc.factionId)
      : lesser.length
        ? sampleServices(siteRng, lesser, siteRng.int(1, Math.min(2, lesser.length)))
        : [],
  };
  if (isOp && !patched.lastSeen) {
    patched.lastSeen = {
      currentDanger: patched.currentDanger,
      isFactionRevealed: true,
      looted: patched.looted,
      exhausted: patched.exhausted,
      remainingSearches: patched.remainingSearches,
      cleared: patched.cleared,
    };
  }
  return patched;
}

/**
 * Promote up to two sites per faction to outposts, spaced apart.
 *
 * Prefer `outpostCategories`, then preferred territory, then any claim. Quota
 * may undershoot on a thin local map — that is fine.
 */
export function pickOutposts(locations: LocationState[]): OutpostIds {
  const out: OutpostIds = {};
  for (const id of CLAIM_ORDER) {
    const cfg = FACTION_CONFIG[id];
    const claimed = locations.filter((l) => l.factionId === id);
    if (!claimed.length) continue;

    const rank = (l: LocationState) => {
      if (cfg.outpostCategories.includes(l.category)) return 0;
      if (cfg.preferredPoiCategories.includes(l.category)) return 1;
      return 2;
    };
    const cands = [...claimed].sort((a, b) => {
      const rd = rank(a) - rank(b);
      if (rd !== 0) return rd;
      // Mid-distance sites beat spawn-adjacent freebies and map-edge ghosts.
      const mid = (xs: LocationState[]) => {
        const sorted = [...xs].sort((x, y) => x.distanceFromSpawn - y.distanceFromSpawn);
        return sorted[Math.floor(sorted.length / 2)]?.distanceFromSpawn ?? 0;
      };
      const m = mid(claimed);
      return Math.abs(a.distanceFromSpawn - m) - Math.abs(b.distanceFromSpawn - m);
    });

    const picked: LocationState[] = [];
    for (const c of cands) {
      if (picked.length >= OUTPOSTS_PER_FACTION) break;
      if (
        picked.some(
          (p) => haversine(p.lat, p.lng, c.lat, c.lng) < OUTPOST_MIN_SPACING_M,
        )
      ) {
        continue;
      }
      picked.push(c);
    }
    if (picked.length) out[id] = picked.map((p) => p.id);
  }
  return out;
}

/** Categories a faction's intel prefers to name. */
export const INTEL_CATEGORIES: Record<Exclude<FactionId, null>, readonly PoiCategory[] | 'danger'> = {
  muster: 'danger',
  gotong: ['foodcourt', 'supermarket', 'convenience'],
  syndicate_88: ['residential'],
  sta: ['mrt'],
};

export function escortCandidates(
  from: LocationState,
  locations: Record<string, LocationState>,
): LocationState[] {
  return Object.values(locations)
    .filter((l) => l.id !== from.id && l.discovered)
    .map((l) => ({ l, d: haversine(from.lat, from.lng, l.lat, l.lng) }))
    .filter((x) => x.d <= ESCORT_RANGE_M)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.l);
}

/** Coerce save-file outposts (legacy single id → array). */
export function migrateOutposts(raw: unknown): OutpostIds {
  if (!raw || typeof raw !== 'object') return {};
  const out: OutpostIds = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const fid = migrateFactionId(k);
    if (!fid) continue;
    if (typeof v === 'string') out[fid] = [v];
    else if (Array.isArray(v)) {
      const ids = v.filter((x): x is string => typeof x === 'string');
      if (ids.length) out[fid] = ids;
    }
  }
  return out;
}

export function migrateStanding(raw: unknown): FactionStanding {
  const out = emptyStanding();
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = migrateFactionId(k);
    if (!id || typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[id] = clampStanding(v);
  }
  return out;
}

export function migrateTraderTaken(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const colon = k.indexOf(':');
    if (colon < 0 || !Array.isArray(v)) continue;
    const fid = migrateFactionId(k.slice(0, colon));
    if (!fid) continue;
    const day = k.slice(colon + 1);
    out[`${fid}:${day}`] = v.filter((x): x is string => typeof x === 'string');
  }
  return out;
}

/** Legacy save-file faction ids → current ids. */
const LEGACY_FACTION_IDS: Record<string, Exclude<FactionId, null>> = {
  saf: 'muster',
  idtf: 'muster',
  hawker: 'gotong',
  pasir_panjang: 'gotong',
  raiders: 'syndicate_88',
  transit: 'sta',
};

/** Normalise a faction id read off an old saved run. */
export function migrateFactionId(id: unknown): FactionId {
  if (typeof id !== 'string') return null;
  if (id in FACTION_CONFIG) return id as Exclude<FactionId, null>;
  return LEGACY_FACTION_IDS[id] ?? null;
}
