/**
 * Offline pedestrian links that the coastline mask cannot represent.
 * Keep these narrow: a crossing makes its deck walkable, not the surrounding sea.
 * Restricted ground still takes precedence in playable.ts.
 */
export const LAND_CROSSINGS = [
  {
    id: 'sentosa-gateway',
    name: 'Sentosa Gateway pedestrian crossing',
    halfWidthM: 12,
    // OpenStreetMap contributors (ODbL), retrieved 2026-11-14:
    // https://www.openstreetmap.org/way/689975819
    // https://www.openstreetmap.org/way/689988553
    // https://www.openstreetmap.org/way/689988555
    // https://www.openstreetmap.org/way/1329663765
    // South → north; include the approaches inside the committed land mask.
    points: [
      { lat: 1.2565696, lng: 103.8236330 },
      { lat: 1.2569194, lng: 103.8236392 },
      { lat: 1.2571009, lng: 103.8236396 },
      { lat: 1.2572902, lng: 103.8236348 },
      { lat: 1.2576484, lng: 103.8236085 },
      { lat: 1.2586350, lng: 103.8236335 },
      { lat: 1.2590237, lng: 103.8236418 },
      { lat: 1.2596923, lng: 103.8236701 },
      { lat: 1.2600364, lng: 103.8236756 },
      { lat: 1.2601392, lng: 103.8236345 },
      { lat: 1.2602448, lng: 103.8236095 },
      { lat: 1.2607160, lng: 103.8236205 },
      { lat: 1.2608568, lng: 103.8236164 },
      { lat: 1.2611175, lng: 103.8236091 },
      { lat: 1.2615795, lng: 103.8236204 },
      { lat: 1.2618611, lng: 103.8236285 },
      { lat: 1.2621614, lng: 103.8236338 },
      { lat: 1.2624658, lng: 103.8236298 },
      { lat: 1.2630549, lng: 103.8236248 },
      { lat: 1.2631685, lng: 103.8236239 },
    ],
  },
];

const M_LAT = 111_320;
const M_LNG = M_LAT * Math.cos((1.35 * Math.PI) / 180);

const indexedCrossings = LAND_CROSSINGS.map((crossing) => ({
  ...crossing,
  minLat: Math.min(...crossing.points.map((p) => p.lat)) - crossing.halfWidthM / M_LAT,
  maxLat: Math.max(...crossing.points.map((p) => p.lat)) + crossing.halfWidthM / M_LAT,
  minLng: Math.min(...crossing.points.map((p) => p.lng)) - crossing.halfWidthM / M_LNG,
  maxLng: Math.max(...crossing.points.map((p) => p.lng)) + crossing.halfWidthM / M_LNG,
}));

/** Cheap bbox rejection before doing metre-scale point-to-segment checks. */
export function onLandCrossing(lat: number, lng: number): boolean {
  for (const crossing of indexedCrossings) {
    if (lat < crossing.minLat || lat > crossing.maxLat ||
        lng < crossing.minLng || lng > crossing.maxLng) continue;
    for (let i = 1; i < crossing.points.length; i++) {
      const a = crossing.points[i - 1];
      const b = crossing.points[i];
      const dx = (b.lng - a.lng) * M_LNG;
      const dy = (b.lat - a.lat) * M_LAT;
      const px = (lng - a.lng) * M_LNG;
      const py = (lat - a.lat) * M_LAT;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSq));
      if ((px - t * dx) ** 2 + (py - t * dy) ** 2 <= crossing.halfWidthM ** 2) return true;
    }
  }
  return false;
}

/** Use finer chord checks only near narrow crossing decks. */
export function nearLandCrossing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return indexedCrossings.some((c) =>
    Math.max(a.lat, b.lat) >= c.minLat && Math.min(a.lat, b.lat) <= c.maxLat &&
    Math.max(a.lng, b.lng) >= c.minLng && Math.min(a.lng, b.lng) <= c.maxLng);
}
