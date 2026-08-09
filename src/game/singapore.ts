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

export function inSingapore(lat: number, lng: number): boolean {
  return (
    lat >= SG_BOUNDS.minLat &&
    lat <= SG_BOUNDS.maxLat &&
    lng >= SG_BOUNDS.minLng &&
    lng <= SG_BOUNDS.maxLng
  );
}
