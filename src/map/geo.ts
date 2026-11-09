import type { Feature, FeatureCollection, Geometry, Polygon as GeoPolygon } from 'geojson';

/**
 * Geometry helpers for the MapLibre layer. The game keeps `[lat, lng]`
 * everywhere; GeoJSON and MapLibre want `[lng, lat]`. The swap happens here
 * and nowhere else.
 */

/** [lng, lat] — GeoJSON / MapLibre order. */
export type LngLatPair = [number, number];

export interface Disc {
  lat: number;
  lng: number;
  /** Radius in metres. */
  r: number;
}

const M_PER_DEG_LAT = 111_320;

export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** `[lat, lng]` ring → closed `[lng, lat]` ring. */
export function toLngLatRing(ring: ReadonlyArray<readonly [number, number]>): LngLatPair[] {
  const out: LngLatPair[] = ring.map(([lat, lng]) => [lng, lat]);
  if (out.length) {
    const [a, b] = [out[0], out[out.length - 1]];
    if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]);
  }
  return out;
}

/** Metre-accurate disc as one closed `[lng, lat]` ring. MapLibre has no metre circle. */
export function circleRing(lat: number, lng: number, metres: number, steps = 48): LngLatPair[] {
  const r = Math.max(1, metres);
  const dLat = r / M_PER_DEG_LAT;
  const dLng = r / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const ring: LngLatPair[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

/** A disc as a polygon-clipping / GeoJSON polygon (`[ring]`). */
export function discPolygon(d: Disc, steps = 48): LngLatPair[][] {
  return [circleRing(d.lat, d.lng, d.r, steps)];
}

export function circleFeature(
  lat: number,
  lng: number,
  metres: number,
  properties: Record<string, unknown> = {},
  steps = 48,
): Feature<GeoPolygon> {
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [circleRing(lat, lng, metres, steps)] }, properties };
}

export function lineFeature(points: ReadonlyArray<{ lat: number; lng: number }>, properties: Record<string, unknown> = {}): Feature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) },
    properties,
  };
}

export function fc(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

/** Ray-cast point-in-ring on `[lng, lat]` rings. */
export function pointInRing(x: number, y: number, ring: ReadonlyArray<ReadonlyArray<number>>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Screen pixels per metre at a zoom (MapLibre's 512 px world tile). */
export function pxPerMetre(zoom: number, lat: number): number {
  return (512 * 2 ** zoom) / (40_075_016.686 * Math.cos((lat * Math.PI) / 180));
}

/** Inside a disc, by flat-earth squared distance (fine at city scale). */
export function inDisc(lat: number, lng: number, d: Disc, cosLat: number): boolean {
  const dy = (lat - d.lat) * M_PER_DEG_LAT;
  const dx = (lng - d.lng) * M_PER_DEG_LAT * cosLat;
  return dx * dx + dy * dy <= d.r * d.r;
}

/** Blend a #rrggbb colour toward black. */
export function dimHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) =>
    Math.round(((n >> s) & 255) * k)
      .toString(16)
      .padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
}

/** Mix two #rrggbb colours: t = 0 gives a, 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) =>
    Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** A representative `[lng, lat]`: a point, a line's middle vertex, or a polygon's bbox centre. */
export function anchorOf(g: Geometry): LngLatPair | null {
  switch (g.type) {
    case 'Point':
      return [g.coordinates[0], g.coordinates[1]];
    case 'MultiPoint':
      return g.coordinates.length ? [g.coordinates[0][0], g.coordinates[0][1]] : null;
    case 'LineString': {
      const v = g.coordinates[Math.floor(g.coordinates.length / 2)];
      return v ? [v[0], v[1]] : null;
    }
    case 'MultiLineString': {
      const line = g.coordinates[0];
      const v = line?.[Math.floor(line.length / 2)];
      return v ? [v[0], v[1]] : null;
    }
    case 'Polygon':
    case 'MultiPolygon': {
      const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0]?.[0];
      if (!ring?.length) return null;
      const b = ringBounds(ring);
      return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    }
    default:
      return null;
  }
}

/** `[x0, y0, x1, y1]` of a `[lng, lat]` ring. */
export function ringBounds(ring: ReadonlyArray<ReadonlyArray<number>>): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export interface LatLngBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Leaflet's `bounds.pad(ratio)`: grow each side by `ratio` of its span. */
export function padBox(b: LatLngBox, ratio: number): LatLngBox {
  const dLat = (b.north - b.south) * ratio;
  const dLng = (b.east - b.west) * ratio;
  return { south: b.south - dLat, west: b.west - dLng, north: b.north + dLat, east: b.east + dLng };
}

export const boxContains = (b: LatLngBox, lat: number, lng: number) =>
  lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
