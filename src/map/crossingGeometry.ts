import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import { LAND_CROSSINGS } from '../game/crossings';
import { discPolygon } from './geo';

const M_LAT = 111_320;
const M_LNG = M_LAT * Math.cos((1.35 * Math.PI) / 180);
let deckMask: MultiPolygon | undefined;

/** Match the route check's segment capsules, including round bends and ends. */
function crossingDeckMask(): MultiPolygon {
  if (deckMask) return deckMask;
  const pieces: Polygon[] = [];
  for (const { points, halfWidthM } of LAND_CROSSINGS) {
    for (const p of points) pieces.push(discPolygon({ ...p, r: halfWidthM }, 32));
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dx = (b.lng - a.lng) * M_LNG;
      const dy = (b.lat - a.lat) * M_LAT;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const lngOffset = (-dy / length) * halfWidthM / M_LNG;
      const latOffset = (dx / length) * halfWidthM / M_LAT;
      pieces.push([[
        [a.lng + lngOffset, a.lat + latOffset],
        [b.lng + lngOffset, b.lat + latOffset],
        [b.lng - lngOffset, b.lat - latOffset],
        [a.lng - lngOffset, a.lat - latOffset],
        [a.lng + lngOffset, a.lat + latOffset],
      ]]);
    }
  }
  deckMask = pieces.length ? polygonClipping.union(pieces[0], ...pieces.slice(1)) : [];
  return deckMask;
}

/** Remove traversable decks from water tint; never apply to restricted ground. */
export function withoutCrossingDecks(area: MultiPolygon): MultiPolygon {
  if (!area.length) return area;
  const decks = crossingDeckMask();
  return decks.length ? polygonClipping.difference(area, decks) : area;
}
