import { haversine } from './overpass';
import { inVegetation } from './playable';

/**
 * Vegetation cover — known forest / nature-reserve polygons from zones.json.
 *
 * Crossing dense greenery burns more stamina and stretches travel time.
 * Parks stay walkable (unlike water / restricted); this is a soft cost only.
 */

export interface VegetationPatch {
  id: string;
  lat: number;
  lng: number;
  /** Always dense forest for baked reserves (keeps store log branches simple). */
  density: number;
}

const PATH_STEP_M = 80;
/** Extra time per 100 m inside vegetation. */
const TRAVEL_PER_100M = 0.12;
/** Extra energy per 100 m inside vegetation. */
const ENERGY_PER_100M = 2.2;
const TRAVEL_MULT_CAP = 1.85;

export interface VegetationCost {
  /** Multiplier on travel minutes (>1 = slower). */
  travelMult: number;
  /** Extra energy burned for the crossing. */
  energyCost: number;
  patches: VegetationPatch[];
}

/**
 * Price thick greenery on a route by meters spent inside baked vegetation rings.
 * A short park fringe is a nudge; a long cut through Central Catchment is real cost.
 */
export function vegetationCost(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  via?: { lat: number; lng: number }[],
): VegetationCost {
  const points = via && via.length >= 2 ? via : [from, to];
  let vegMeters = 0;
  let hit = false;
  let hitLat = from.lat;
  let hitLng = from.lng;

  for (let s = 1; s < points.length; s++) {
    const a = points[s - 1];
    const b = points[s];
    const dist = haversine(a.lat, a.lng, b.lat, b.lng);
    const steps = Math.max(1, Math.ceil(dist / PATH_STEP_M));
    const stepM = dist / steps;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const midT = (t0 + t1) / 2;
      const lat = a.lat + (b.lat - a.lat) * midT;
      const lng = a.lng + (b.lng - a.lng) * midT;
      if (inVegetation(lat, lng)) {
        vegMeters += stepM;
        if (!hit) {
          hit = true;
          hitLat = lat;
          hitLng = lng;
        }
      }
    }
  }

  if (vegMeters <= 0) {
    return { travelMult: 1, energyCost: 0, patches: [] };
  }

  const hundreds = vegMeters / 100;
  return {
    travelMult: Math.min(TRAVEL_MULT_CAP, 1 + hundreds * TRAVEL_PER_100M),
    energyCost: Math.round(hundreds * ENERGY_PER_100M),
    patches: [
      {
        id: `veg:${hitLat.toFixed(4)}:${hitLng.toFixed(4)}`,
        lat: hitLat,
        lng: hitLng,
        density: 3,
      },
    ],
  };
}
