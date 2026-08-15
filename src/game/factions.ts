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

  // ---- the counter -------------------------------------------------------
  /**
   * What they'll hand over, in rough order of how gladly. Each faction's list
   * is the reason to walk to their gate rather than anyone else's — the IDTF
   * are the only reliable ammunition on the island, the Co-op the only
   * reliable calories.
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
  idtf: {
    id: 'idtf',
    name: 'Island Defence Task Force (IDTF)',
    shortName: 'IDTF',
    icon: 'faction.idtf',
    color: '#9fb4c4',
    hostileByDefault: false,
    blurb: 'What is left of the standing order — armouries, clinics, checkpoints. Orderly, but they tax entry.',
    tribute: ['ammo_box', 'medkit', 'batteries'],
    // Schools were the designated shelters when it fell — so they were theirs
    // to hold, and mostly still are.
    preferredPoiCategories: ['police', 'hospital', 'clinic', 'school'],
    outpostName: 'Forward Aid Post',
    // A hospital they can defend beats a police post they can't.
    outpostCategories: ['hospital', 'police'],
    // The armoury and the aid station: nobody else on the island can resupply
    // a firearm or close a wound properly.
    stock: ['bandage', 'medkit', 'antiseptic', 'antibiotics', 'n95_mask', 'splint', 'army_ration'],
    exclusiveStock: ['ammo_box', 'ammo_shell', 'kevlar_vest', 'riot_helmet'],
    // Standing army, no supply chain: they are permanently short of calories
    // and of anything that runs on cells.
    wants: ['canned_food', 'rice_pack', 'batteries', 'fuel_can', 'purification_tabs'],
  },
  pasir_panjang: {
    id: 'pasir_panjang',
    name: 'Pasir Panjang Wholesale Co-op',
    shortName: 'PP Co-op',
    icon: 'faction.pasir_panjang',
    color: '#cfccc4',
    hostileByDefault: false,
    blurb: 'The old wholesale traders run the food chain now. Pay in supplies and they let you dig in.',
    tribute: ['canned_food', 'hawker_meal', 'water_bottle'],
    preferredPoiCategories: ['foodcourt', 'supermarket', 'convenience'],
    outpostName: 'Wet Market',
    outpostCategories: ['foodcourt', 'supermarket'],
    // Hot food and clean water, which is a shorter list than it sounds and the
    // only such list on the island.
    stock: [
      'hawker_meal', 'canned_food', 'rice_pack', 'water_bottle',
      'newater', 'purification_tabs', 'milo_tin', 'kaya_toast',
    ],
    exclusiveStock: ['nasi_lemak', 'bak_kwa', 'durian', 'coffee'],
    // They cook, so they need fire, blades and things to cook. Junk metal buys
    // lunch here and nowhere else.
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
    // Estates first, but the Jurong yards are where the materials are — and
    // muscle follows materials.
    preferredPoiCategories: ['residential', 'hardware', 'industrial'],
    outpostName: 'Void Deck Court',
    outpostCategories: ['residential', 'industrial'],
    // The black market: the things the other two won't sell you, and the
    // things the other two would arrest you for.
    stock: [
      'painkillers', 'tiger_beer', 'parang', 'meat_cleaver',
      'duct_tape', 'spare_parts', 'powerbank', 'energy_drink',
    ],
    exclusiveStock: ['pistol', 'ammo_box', 'katana', 'sbo_vest'],
    // A fence pays for what a fence can move.
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
    // A card first, because a turnstile wants a card. But the marshal on the
    // gate is a person standing in a dark tunnel, and a person will take a
    // working torch or a set of cells — gating passage on one uncommon item
    // meant the tunnels were shut to anyone who hadn't found that item yet.
    tribute: ['ez_link_card', 'batteries', 'torch', 'canned_food'],
    preferredPoiCategories: ['mrt'],
    outpostName: 'Barricade Camp',
    // Surface STA outposts sit on manned platforms; abandoned MRTs stay null.
    outpostCategories: ['mrt'],
    stock: ['torch', 'batteries', 'ez_link_card', 'rain_tarp', 'powerbank', 'glass_bottle'],
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
  idtf: 0,
  pasir_panjang: 0,
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

/**
 * Odds a preferred site is actually claimed, per faction.
 *
 * The STA used to hold *every* station, which made the toll a fixed tax on
 * every descent rather than a thing that happens sometimes. Roughly half the
 * platforms now stand empty — nobody on the gate, nothing to pay.
 */
const CLAIM_CHANCE: Record<Exclude<FactionId, null>, number> = {
  sta: 0.55,
  pasir_panjang: 0.7,
  idtf: 0.8,
  syndicate_88: 0.4,
};

/** Priority order — first faction whose preferred categories match wins. */
const CLAIM_ORDER: Exclude<FactionId, null>[] = ['sta', 'idtf', 'pasir_panjang', 'syndicate_88'];

/**
 * Seeded faction assignment by OSM category, driven by each faction's
 * `preferredPoiCategories`. Anything unclaimed returns null.
 */
export function assignFaction(rng: Rng, category: PoiCategory): FactionId {
  const r = rng.next();
  for (const id of CLAIM_ORDER) {
    if (!FACTION_CONFIG[id].preferredPoiCategories.includes(category)) continue;
    return r < CLAIM_CHANCE[id] ? id : null;
  }
  return null;
}

export const ALL_FACTION_SERVICES: FactionService[] = ['trade', 'rest', 'aid', 'intel'];

export const OUTPOSTS_PER_FACTION = 4;
/** Same-faction outposts stay a walk apart so four pins aren't a cluster. */
export const OUTPOST_MIN_SPACING_M = 1100;

export type OutpostIds = Partial<Record<Exclude<FactionId, null>, string[]>>;

export function isOutpostSite(
  outposts: OutpostIds,
  factionId: Exclude<FactionId, null>,
  locationId: string,
): boolean {
  return (outposts[factionId] ?? []).includes(locationId);
}

/** Services this site actually offers (outposts always full set). */
export function locationServices(loc: LocationState, outposts: OutpostIds): FactionService[] {
  if (!loc.factionId) return [];
  if (loc.isFactionOutpost || isOutpostSite(outposts, loc.factionId, loc.id)) {
    return [...ALL_FACTION_SERVICES];
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

function sampleServices(rng: Rng, n: number): FactionService[] {
  const pool = [...ALL_FACTION_SERVICES];
  const out: FactionService[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  }
  return out;
}

/**
 * Stamp outpost flags and seed ordinary-territory service subsets.
 * Outposts always get all four; other claimed sites get 1–3.
 */
export function applyFactionServices(
  locations: Record<string, LocationState>,
  outposts: OutpostIds,
  seed: string,
): Record<string, LocationState> {
  const base = new Rng(seed).fork('factionServices');
  const next: Record<string, LocationState> = { ...locations };
  const outpostSet = new Set<string>();
  for (const ids of Object.values(outposts)) {
    for (const id of ids ?? []) outpostSet.add(id);
  }

  for (const id of Object.keys(next)) {
    const loc = next[id];
    if (!loc.factionId) {
      if (loc.factionServices || loc.isFactionOutpost) {
        next[id] = { ...loc, factionServices: undefined, isFactionOutpost: false };
      }
      continue;
    }
    const isOp = outpostSet.has(id);
    const siteRng = base.fork(id);
    const patched: LocationState = {
      ...loc,
      isFactionOutpost: isOp,
      isFactionRevealed: isOp ? true : loc.isFactionRevealed,
      // Outposts are map destinations from day one — you can see the pin even
      // before you've walked there.
      discovered: isOp ? true : loc.discovered,
      factionServices: isOp
        ? [...ALL_FACTION_SERVICES]
        : loc.factionServices?.length
          ? loc.factionServices
          : sampleServices(siteRng, siteRng.int(1, 3)),
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
    next[id] = patched;
  }
  return next;
}

/**
 * Promote up to four sites per faction to outposts, spaced apart.
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

/** Legacy save-file faction ids → current ids. */
const LEGACY_FACTION_IDS: Record<string, Exclude<FactionId, null>> = {
  saf: 'idtf',
  hawker: 'pasir_panjang',
  raiders: 'syndicate_88',
  transit: 'sta',
};

/** Normalise a faction id read off an old saved run. */
export function migrateFactionId(id: unknown): FactionId {
  if (typeof id !== 'string') return null;
  if (id in FACTION_CONFIG) return id as Exclude<FactionId, null>;
  return LEGACY_FACTION_IDS[id] ?? null;
}
