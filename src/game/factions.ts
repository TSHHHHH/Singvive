import type { FactionId, PoiCategory } from './types';
import type { Rng } from './rng';
import type { IconName } from '../icons/keys';

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
    preferredPoiCategories: ['police', 'hospital', 'school'],
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
  },
};

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
