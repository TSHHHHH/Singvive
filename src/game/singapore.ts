// Singapore-only bounds and curated spawn neighbourhoods.

export const SG_BOUNDS = {
  minLat: 1.20,
  maxLat: 1.48,
  minLng: 103.6,
  maxLng: 104.05,
};

export const SG_CENTER: [number, number] = [1.3521, 103.8198];

export interface Neighbourhood {
  name: string;
  lat: number;
  lng: number;
}

// A spread of real HDB towns & districts across the island.
export const NEIGHBOURHOODS: Neighbourhood[] = [
  { name: 'Tampines', lat: 1.3496, lng: 103.9568 },
  { name: 'Jurong East', lat: 1.3329, lng: 103.7436 },
  { name: 'Woodlands', lat: 1.4382, lng: 103.789 },
  { name: 'Bishan', lat: 1.3526, lng: 103.8352 },
  { name: 'Bedok', lat: 1.3236, lng: 103.9273 },
  { name: 'Ang Mo Kio', lat: 1.3691, lng: 103.8454 },
  { name: 'Clementi', lat: 1.3151, lng: 103.7654 },
  { name: 'Toa Payoh', lat: 1.3343, lng: 103.8563 },
  { name: 'Yishun', lat: 1.4304, lng: 103.835 },
  { name: 'Serangoon', lat: 1.3554, lng: 103.8679 },
  { name: 'Hougang', lat: 1.3612, lng: 103.8863 },
  { name: 'Choa Chu Kang', lat: 1.3854, lng: 103.7443 },
  { name: 'Pasir Ris', lat: 1.3721, lng: 103.9474 },
  { name: 'Sengkang', lat: 1.3868, lng: 103.8914 },
  { name: 'Punggol', lat: 1.4041, lng: 103.9025 },
  { name: 'Bukit Batok', lat: 1.349, lng: 103.7495 },
  { name: 'Queenstown', lat: 1.2942, lng: 103.806 },
  { name: 'Geylang', lat: 1.3186, lng: 103.8873 },
  { name: 'Marine Parade', lat: 1.3021, lng: 103.9057 },
  { name: 'Kallang', lat: 1.3119, lng: 103.8714 },
];

/**
 * A coarse outline of Singapore, as [lat, lng] wound clockwise: the Johor
 * Strait along the north, open water elsewhere.
 *
 * A bounding box cannot do this job. Johor's coast dips *south* of Singapore's
 * northern tip — Pasir Gudang sits at 1.4481 while Sembawang reaches 1.4707 —
 * so any latitude cutoff either swallows Johor Bahru or amputates Sembawang.
 * The baked POI set carries ~1,000 Malaysian sites within the island sweep, and
 * without this they turn up as spawn points and evac zones.
 *
 * The northern edge follows the middle of the strait, which is roughly a
 * kilometre wide — precise enough to separate two countries, and deliberately
 * not a survey. Outlying islands (Ubin, Tekong, the southern islands) fall
 * inside the same loop.
 */
export const SG_OUTLINE: [number, number][] = [
  // north edge, west → east, tracking the strait's midline
  [1.3500, 103.6100],
  [1.3900, 103.6350],
  [1.4250, 103.6800],
  [1.4450, 103.7200],
  [1.4560, 103.7600], // Causeway: SG shore 1.4525, Johor shore 1.4600
  [1.4700, 103.8000],
  [1.4790, 103.8350], // the Sembawang bulge, SG's northernmost ground (1.4707)
  [1.4650, 103.8900],
  [1.4400, 103.9300], // south of Pasir Gudang, north of Punggol and Ubin
  [1.4350, 103.9800],
  [1.4300, 104.0900], // past Tekong
  // south edge, east → west, out in open water
  [1.3000, 104.1000],
  [1.2500, 103.9900],
  [1.2100, 103.8600],
  [1.2000, 103.7600],
  [1.2200, 103.6600],
  [1.2150, 103.6050], // Tuas South tip — the reclaimed industrial corner
  [1.3000, 103.5950], // up the Tuas coast, still inside the Second Link
];

/** Standard ray-casting point-in-polygon. */
function inPolygon(lat: number, lng: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [latI, lngI] = poly[i];
    const [latJ, lngJ] = poly[j];
    if (
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Whether a point is on Singaporean soil — the real test, used for anything the
 * run treats as a place: spawns, evac zones, generated world.
 */
export function inSingapore(lat: number, lng: number): boolean {
  return inPolygon(lat, lng, SG_OUTLINE);
}
