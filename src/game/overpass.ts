import { classifyOsm } from './poi';
import type { PoiCategory } from './types';

export interface RawPoi {
  osmId: string;
  name: string;
  category: PoiCategory;
  lat: number;
  lng: number;
  /** Building footprint ring [lat,lng][] when OSM has one (way geometry). */
  outline?: [number, number][];
}

// Multiple mirrors — we try them in order if one is rate-limited/down.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** Metres between two lat/lng points (haversine). */
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function buildQuery(lat: number, lng: number, radius: number): string {
  // Grab the POI types we classify. `nwr` = nodes, ways, relations.
  const filters = [
    'nwr["shop"="supermarket"]',
    'nwr["shop"="convenience"]',
    'nwr["shop"="chemist"]',
    'nwr["amenity"="pharmacy"]',
    'nwr["amenity"="hospital"]',
    'nwr["amenity"="clinic"]',
    'nwr["amenity"="doctors"]',
    'nwr["shop"="hardware"]',
    'nwr["shop"="doityourself"]',
    'nwr["amenity"="fuel"]',
    'nwr["amenity"="police"]',
    'nwr["amenity"="food_court"]',
    'nwr["amenity"="marketplace"]',
    'nwr["amenity"="community_centre"]',
    'nwr["station"="subway"]',
    'nwr["station"="light_rail"]',
  ]
    .map((f) => `  ${f}(around:${radius},${lat},${lng});`)
    .join('\n');

  // HDB blocks (void decks) as a second group with its own cap, so the dense
  // residential estates don't crowd shops/amenities out of a single limit.
  const buildings = [
    'nwr["building"="apartments"]',
    'nwr["building"="residential"]',
  ]
    .map((f) => `  ${f}(around:${radius},${lat},${lng});`)
    .join('\n');

  // Shops/amenities: full geometry (mostly point nodes, so cheap) for outlines.
  // HDB buildings: centroid only (`out center`) — polygon geometry for ~180
  // blocks times out the free Overpass servers, and they render as rectangles
  // anyway. This keeps the query light while still populating the estates.
  return `[out:json][timeout:25];
(
${filters}
);
out geom tags 220;
(
${buildings}
);
out center tags 180;`;
}

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[]; // way node ring (out geom)
  tags?: Record<string, string>;
}

/** Centroid of a way's geometry ring. */
function ringCentroid(ring: { lat: number; lon: number }[]): { lat: number; lng: number } {
  let lat = 0;
  let lng = 0;
  for (const p of ring) {
    lat += p.lat;
    lng += p.lon;
  }
  return { lat: lat / ring.length, lng: lng / ring.length };
}

const NAME_BY_CATEGORY: Record<PoiCategory, string> = {
  supermarket: 'Supermarket',
  convenience: 'Convenience Store',
  pharmacy: 'Pharmacy',
  hospital: 'Clinic',
  hardware: 'Hardware Store',
  fuel: 'Petrol Station',
  police: 'Police Post',
  residential: 'HDB Block',
  foodcourt: 'Hawker Centre',
  mrt: 'MRT Station',
};

function parseElements(elements: OsmElement[]): RawPoi[] {
  const out: RawPoi[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const category = classifyOsm(tags);
    if (!category) continue;

    let lat = el.lat ?? el.center?.lat;
    let lng = el.lon ?? el.center?.lon;
    let outline: [number, number][] | undefined;

    // ways come back with a geometry ring — use it as the building footprint
    const ring = el.geometry;
    if (ring && ring.length >= 4) {
      const c = ringCentroid(ring);
      lat = c.lat;
      lng = c.lng;
      outline = ring.map((p) => [p.lat, p.lon] as [number, number]);
    }
    if (lat == null || lng == null) continue;

    // Void decks: HDB blocks rarely have a name, so use the block number.
    let name = tags.name || tags['name:en'];
    if (!name && category === 'residential') {
      const blk = tags['addr:housenumber'] || tags['addr:block_number'] || tags.ref;
      name = blk ? `Blk ${blk} Void Deck` : 'HDB Void Deck';
    }
    if (!name) name = NAME_BY_CATEGORY[category];

    out.push({
      osmId: `${el.type}/${el.id}`,
      name,
      category,
      lat,
      lng,
      outline,
    });
  }
  return out;
}

/**
 * Fetch classified POIs around a point from Overpass.
 *
 * Races all mirrors concurrently and returns whichever responds first, so a
 * single queued/slow endpoint no longer blocks the whole load. Throws only if
 * every mirror fails (caller should fall back to bundled data).
 */
export async function fetchOsmPois(
  lat: number,
  lng: number,
  radius: number,
): Promise<RawPoi[]> {
  const body = 'data=' + encodeURIComponent(buildQuery(lat, lng, radius));
  const attempts = OVERPASS_ENDPOINTS.map(async (endpoint) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const json = (await res.json()) as { elements: OsmElement[] };
    return parseElements(json.elements ?? []);
  });
  // Promise.any resolves with the first fulfilled request; rejects only if all fail.
  return Promise.any(attempts);
}
