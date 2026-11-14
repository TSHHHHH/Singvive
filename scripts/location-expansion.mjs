// Shared, offline source normalisation and geometry for the manual expansion step.
import { inRing } from './hdb-reference.mjs';

export const distance = (a, b) => Math.hypot((a.lat - b.lat) * 111000, (a.lng - b.lng) * 110969);
export const round = (n) => Number(n.toFixed(5));

export function zoneContains(rings) {
  const grid = new Map();
  for (const ring of rings) {
    const ys = ring.map((p) => p[0]), xs = ring.map((p) => p[1]);
    const bounds = [Math.min(...ys), Math.max(...ys), Math.min(...xs), Math.max(...xs)];
    for (let y = Math.floor(bounds[0] * 100); y <= Math.floor(bounds[1] * 100); y++) {
      for (let x = Math.floor(bounds[2] * 100); x <= Math.floor(bounds[3] * 100); x++) {
        const key = `${y},${x}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push({ ring, bounds });
      }
    }
  }
  return (lat, lng) => (grid.get(`${Math.floor(lat * 100)},${Math.floor(lng * 100)}`) ?? [])
    .some(({ ring, bounds: b }) => lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3] && inRing(lat, lng, ring));
}

/** Douglas-Peucker preserves corners; sampling every Nth vertex does not. */
export function simplifyFootprint(ring, tolerance = 1.5) {
  function simplify(points) {
    if (points.length <= 2) return points;
    const a = points[0], b = points.at(-1);
    const dx = (b[0] - a[0]) * 110969, dy = (b[1] - a[1]) * 111000;
    const len = dx * dx + dy * dy;
    let far = tolerance, at = -1;
    for (let i = 1; i < points.length - 1; i++) {
      const px = (points[i][0] - a[0]) * 110969, py = (points[i][1] - a[1]) * 111000;
      const t = len ? Math.max(0, Math.min(1, (px * dx + py * dy) / len)) : 0;
      const d = Math.hypot(px - t * dx, py - t * dy);
      if (d > far) { far = d; at = i; }
    }
    return at < 0 ? [a, b] : [...simplify(points.slice(0, at + 1)).slice(0, -1), ...simplify(points.slice(at))];
  }
  return simplify(ring).map(([lng, lat]) => [round(lat), round(lng)]);
}

export function verifiedFootprint(ring, lat, lng) {
  const outline = simplifyFootprint(ring);
  // Even rounding the original corners can clip pins on narrow/concave edges.
  return inRing(lat, lng, outline) ? outline : ring.map(([x, y]) => [y, x]);
}

export function sourceName(tags, category, config) {
  const named = (tags['name:en'] || tags.name || '').trim();
  if (named.length >= 3) return named;
  const block = tags['addr:block_number'] || tags['addr:housenumber'] || tags.ref;
  if (category === 'residential') return block ? `Blk ${block} Void Deck` : 'HDB Void Deck';
  if (category === 'housing') {
    const address = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
    return address ? `Residence · ${address}` : 'Residence';
  }
  return config[category].label;
}

export function activeSource(tags) {
  return !tags.demolished && !tags.construction && !tags.proposed
    && !['construction', 'proposed', 'demolished', 'ruins'].includes(tags.building)
    && tags.access !== 'no' && tags.access !== 'military';
}

/** Government GeoJSON sometimes encodes its fields in an HTML table. */
export function sourceProperties(properties) {
  const result = { ...properties };
  for (const match of (properties.Description ?? '').matchAll(/<th>([^<]+)<\/th>\s*<td>([\s\S]*?)<\/td>/gi)) {
    result[match[1]] = match[2].replace(/<[^>]*>/g, '').replaceAll('&amp;', '&').trim();
  }
  return result;
}

export function activeGovernmentRecord(properties) {
  return (!properties.STATUS || /^(existing|interim)/i.test(properties.STATUS))
    && !/\bU\/C\b|under construction|\bproposed\b/i.test(properties.NAME ?? properties.Name ?? '');
}

const nameKey = (name) => name.toLowerCase().replace(/\b(centre|center|community|club|cc|market|hawker|food)\b/g, '').replace(/[^a-z0-9]/g, '');
export function sameVenue(a, b, official = false) {
  if (a.category !== b.category) return false;
  const metres = distance(a, b);
  if (metres <= 12) return true;
  if (official && b.outline && inRing(a.lat, a.lng, b.outline)) return true;
  const name = nameKey(a.name);
  return name.length >= 4 && name === nameKey(b.name) && metres <= (official ? 180 : 35);
}
