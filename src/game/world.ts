import type { LocationSize, LocationState, PoiCategory } from './types';
import type { Rng } from './rng';
import { haversine, type RawPoi } from './overpass';
import { POI_CONFIG, POI_CATEGORIES } from './poi';
import { assignFaction } from './factions';

// With fog of war, undiscovered locations aren't rendered — so the world can
// be much denser than what's ever on screen at once. Render cost grows only
// with what the player has actually explored.
const MAX_LOCATIONS = 220;
const MAX_RESIDENTIAL = 100; // keep void decks from burying shops/amenities

const SEARCHES_BY_SIZE: Record<LocationSize, number> = {
  small: 2,
  medium: 3,
  large: 5,
};

/** Rough m² area of a lat/lng polygon ring (shoelace on a local plane). */
function ringArea(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring[0][0];
  const mPerDegLat = 111000;
  const mPerDegLng = 111000 * Math.cos((lat0 * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [aLat, aLng] = ring[i];
    const [bLat, bLng] = ring[(i + 1) % ring.length];
    const ax = aLng * mPerDegLng;
    const ay = aLat * mPerDegLat;
    const bx = bLng * mPerDegLng;
    const by = bLat * mPerDegLat;
    area += ax * by - bx * ay;
  }
  return Math.abs(area) / 2;
}

function sizeFor(category: PoiCategory, outline?: [number, number][]): LocationSize {
  // Void decks now ship with real footprints (bake pass 3), and an HDB slab is
  // 1000-3000m² — deriving size from area would promote nearly every block to
  // `large` (5 searches instead of 3) and quietly rebalance the loot economy.
  // They stay on the category default; the outline is for display only.
  if (outline && category !== 'residential') {
    const a = ringArea(outline);
    if (a > 1500) return 'large';
    if (a > 400) return 'medium';
    return 'small';
  }
  // fallback by category footprint expectations
  // Warehouses and school campuses are big floors to sweep — and they arrive
  // without outlines (centroid-only in the query), so the fallback is the only
  // thing that sizes them.
  if (
    category === 'hospital' ||
    category === 'police' ||
    category === 'supermarket' ||
    category === 'industrial' ||
    category === 'school'
  )
    return 'large';
  if (category === 'residential' || category === 'foodcourt' || category === 'hardware') return 'medium';
  return 'small';
}

/**
 * Build the run's clickable world from raw OSM POIs as full LocationStates:
 * dedupe, assign seeded size/danger/searches/faction, compute distance from the
 * original spawn, sort by distance and cap the count.
 */
export function buildLocations(
  rng: Rng,
  spawn: { lat: number; lng: number },
  raw: RawPoi[],
): LocationState[] {
  const dangerRng = rng.fork('danger');
  const factionRng = rng.fork('faction');
  const seen = new Set<string>();
  const out: LocationState[] = [];

  for (const r of raw) {
    const key = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const cfg = POI_CONFIG[r.category];
    const baseDanger = Math.max(1, Math.min(5, cfg.baseDanger + dangerRng.int(-1, 1)));
    const size = sizeFor(r.category, r.outline);
    const factionId = assignFaction(factionRng.fork(r.osmId), r.category);

    out.push({
      id: r.osmId,
      name: r.name,
      category: r.category,
      lat: r.lat,
      lng: r.lng,
      outline: r.outline,
      size,
      baseDanger,
      currentDanger: baseDanger,
      remainingSearches: SEARCHES_BY_SIZE[size],
      exhausted: false,
      cleared: false,
      looted: false,
      factionId,
      isFactionRevealed: false,
      isMrtStation: r.category === 'mrt',
      discovered: false,
      lastSeen: null,
      distanceFromSpawn: Math.round(haversine(spawn.lat, spawn.lng, r.lat, r.lng)),
    });
  }

  out.sort((a, b) => a.distanceFromSpawn - b.distanceFromSpawn);

  // Keep all non-residential; cap void decks to the nearest MAX_RESIDENTIAL so
  // the estates are populated without crowding out shops. Re-sort by distance.
  const kept: LocationState[] = [];
  let residentialCount = 0;
  for (const loc of out) {
    if (loc.category === 'residential') {
      if (residentialCount >= MAX_RESIDENTIAL) continue;
      residentialCount += 1;
    }
    kept.push(loc);
  }
  const capped = kept
    .sort((a, b) => a.distanceFromSpawn - b.distanceFromSpawn)
    .slice(0, MAX_LOCATIONS);

  // Bridging runs *after* the cap, and its output is exempt from it: the whole
  // point is the far, sparse edges, which are exactly what the cap trims.
  return bridgeWorld(rng, spawn, capped);
}

// ---------------------------------------------------------------------------
// Connectivity.
//
// Travel is gated on a single push (see fog.travelableRange), so a cluster of
// POIs further than one push from everything else is a cage: walk in, and no
// destination is ever selectable again. Open-ground trekking (game/wilds.ts) is
// the safety net that makes this survivable, but a world you can only cross by
// walking through empty lots isn't a world — it's a gap.
//
// So we guarantee the property instead of hoping the OSM data has it: build the
// reachability graph, and wherever a hop is too long, lay down synthetic
// waypoints until it isn't. Deterministic per seed, and it only ever adds what
// the geometry actually demands — a dense town centre generates none at all.
// ---------------------------------------------------------------------------

/**
 * The hop length every link is guaranteed to fit inside. Deliberately well under
 * a healthy survivor's range: this has to hold for a low-endurance build with a
 * hurt leg, carrying too much, in the rain.
 */
const GUARANTEED_HOP = 420; // metres

/** Stops a pathological world (one distant island) from spawning hundreds. */
const MAX_BRIDGE_NODES = 80;

/** What the road left behind, for naming the fillers. */
const WAYPOINT_NAMES = [
  'Drain Culvert',
  'Bus Stop',
  'Multi-Storey Carpark',
  'Overhead Bridge',
  'Service Road',
  'Stalled Traffic',
  'Covered Walkway',
  'Canal Path',
  'Construction Hoarding',
  'Bin Centre',
];

function makeWaypoint(
  rng: Rng,
  spawn: { lat: number; lng: number },
  lat: number,
  lng: number,
  index: number,
): LocationState {
  const r = rng.fork(`bridge:${index}`);
  return {
    id: `bridge/${index}`,
    name: r.pick(WAYPOINT_NAMES),
    category: 'waypoint',
    lat,
    lng,
    size: 'small',
    baseDanger: 2,
    currentDanger: 2,
    remainingSearches: SEARCHES_BY_SIZE.small,
    exhausted: false,
    cleared: false,
    looted: false,
    factionId: null, // nobody claims a drain
    isFactionRevealed: false,
    isMrtStation: false,
    discovered: false,
    lastSeen: null,
    distanceFromSpawn: Math.round(haversine(spawn.lat, spawn.lng, lat, lng)),
  };
}

/**
 * Grow a spanning tree outward from spawn, laying waypoints across any hop
 * longer than GUARANTEED_HOP. Prim's algorithm, so it always bridges the
 * *cheapest* remaining gap — fillers land on the shortest crossing rather than
 * wherever the iteration order happened to look.
 */
function bridgeWorld(
  rng: Rng,
  spawn: { lat: number; lng: number },
  nodes: LocationState[],
): LocationState[] {
  if (nodes.length === 0) return nodes;
  const bridgeRng = rng.fork('bridge');
  const fillers: LocationState[] = [];

  const inTree = new Array<boolean>(nodes.length).fill(false);
  // Cheapest known link from the reached set to each outstanding node. The
  // survivor starts standing at spawn, so spawn itself seeds the tree.
  const best = nodes.map((n) => haversine(spawn.lat, spawn.lng, n.lat, n.lng));
  const bestFrom = nodes.map(() => ({ lat: spawn.lat, lng: spawn.lng }));

  /** Fold a newly reached point into the frontier. */
  const relax = (from: { lat: number; lng: number }) => {
    for (let v = 0; v < nodes.length; v++) {
      if (inTree[v]) continue;
      const d = haversine(from.lat, from.lng, nodes[v].lat, nodes[v].lng);
      if (d < best[v]) {
        best[v] = d;
        bestFrom[v] = from;
      }
    }
  };

  for (let added = 0; added < nodes.length; added++) {
    // nearest outstanding node to anything already reachable
    let u = -1;
    for (let v = 0; v < nodes.length; v++) {
      if (inTree[v]) continue;
      if (u === -1 || best[v] < best[u]) u = v;
    }
    if (u === -1) break;

    const target = nodes[u];
    if (best[u] > GUARANTEED_HOP && fillers.length < MAX_BRIDGE_NODES) {
      // Lay stepping stones along the gap, evenly spaced so no single leg
      // exceeds the guaranteed hop.
      const from = bestFrom[u];
      const legs = Math.ceil(best[u] / GUARANTEED_HOP);
      for (let i = 1; i < legs && fillers.length < MAX_BRIDGE_NODES; i++) {
        const t = i / legs;
        const wp = makeWaypoint(
          bridgeRng,
          spawn,
          from.lat + (target.lat - from.lat) * t,
          from.lng + (target.lng - from.lng) * t,
          fillers.length,
        );
        fillers.push(wp);
        relax(wp);
      }
    }

    inTree[u] = true;
    relax(target);
  }

  if (fillers.length === 0) return nodes;
  return [...nodes, ...fillers].sort((a, b) => a.distanceFromSpawn - b.distanceFromSpawn);
}

// Rough weight for how often each category appears in a Singapore town.
const FALLBACK_MIX: [PoiCategory, number][] = [
  ['residential', 10],
  ['convenience', 6],
  ['foodcourt', 4],
  ['supermarket', 3],
  ['pharmacy', 3],
  ['fuel', 2],
  ['hardware', 2],
  ['mrt', 2],
  ['hospital', 1],
  ['police', 1],
];

/**
 * Procedurally synthesise plausible locations around the spawn when Overpass
 * is unavailable. Deterministic for a given seed.
 */
export function generateFallbackWorld(
  rng: Rng,
  spawn: { lat: number; lng: number },
  radiusM: number,
  count = 70,
): LocationState[] {
  const gen = rng.fork('fallback');
  const raw: RawPoi[] = [];
  for (let i = 0; i < count; i++) {
    const category = gen.weighted(FALLBACK_MIX);
    const angle = gen.next() * Math.PI * 2;
    const dist = Math.sqrt(gen.next()) * radiusM;
    const dLat = (dist * Math.cos(angle)) / 111000;
    const dLng = (dist * Math.sin(angle)) / (111000 * Math.cos((spawn.lat * Math.PI) / 180));
    raw.push({
      osmId: `fallback/${i}`,
      name: POI_CONFIG[category].label,
      category,
      lat: spawn.lat + dLat,
      lng: spawn.lng + dLng,
    });
  }
  return buildLocations(rng, spawn, raw);
}

export const ALL_POI_CATEGORIES = POI_CATEGORIES;
