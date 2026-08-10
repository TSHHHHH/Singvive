import { haversine } from './overpass';

/**
 * Singapore's rail network, baked from OpenStreetMap by `npm run bake:mrt` into
 * public/mrt.json.
 *
 * Two things use it. The map overlay draws it — real track geometry, official
 * liveries, station codes. And tunnel travel routes over it: riding the MRT is
 * no longer "teleport between any two cleared stations", it's a path along the
 * lines, which means a dogleg through an interchange costs what a dogleg costs.
 */

export interface MrtStation {
  /** Canonical id — the lowest-sorting station code, e.g. "CC1" for Dhoby Ghaut. */
  id: string;
  name: string;
  /** Every code this station carries; more than one means it's an interchange. */
  codes: string[];
  lat: number;
  lng: number;
}

export interface MrtLine {
  /** Station-code prefix: NS, EW, DT, BP... */
  code: string;
  name: string;
  color: string;
  mode: 'mrt' | 'lrt';
  /** Set when this is a branch drawn as part of another line (CG on EW). */
  parent: string | null;
  /** Station codes in running order; consecutive entries are adjacent stops. */
  stations: string[];
  /** Track polylines. Empty for branches — they draw on the parent's track. */
  shape: [number, number][][];
}

interface MrtFile {
  generatedAt: string;
  attribution: string;
  lines: MrtLine[];
  stations: MrtStation[];
}

interface Edge {
  to: string;
  line: string;
  meters: number;
}

export interface MrtNetwork {
  generatedAt: string;
  attribution: string;
  lines: MrtLine[];
  stations: MrtStation[];
  byId: Map<string, MrtStation>;
  byCode: Map<string, MrtStation>;
  lineByCode: Map<string, MrtLine>;
  /** station id -> the stops one hop away, and which line gets you there */
  adjacency: Map<string, Edge[]>;
}

/** One continuous ride on a single line. */
export interface MrtLeg {
  line: MrtLine;
  from: MrtStation;
  to: MrtStation;
  /** Every stop after `from`, ending at `to`. */
  stops: MrtStation[];
  meters: number;
}

export interface MrtRoute {
  legs: MrtLeg[];
  /** Total stops passed through. */
  stops: number;
  /** How many times you change line. */
  changes: number;
  /** Distance along the tunnels, which is what the ride actually costs. */
  meters: number;
}

/**
 * A change of line costs more than the walk across the concourse: stairs,
 * a wrong turn in the dark, the other platform's turnstiles. Expressed in
 * metres so it can just be added to the path cost during the search.
 */
const CHANGE_PENALTY_M = 900;

/** How far a surface POI can sit from a baked station and still *be* it. */
export const STATION_MATCH_M = 220;

function buildNetwork(file: MrtFile): MrtNetwork {
  const byId = new Map<string, MrtStation>();
  const byCode = new Map<string, MrtStation>();
  for (const s of file.stations) {
    byId.set(s.id, s);
    for (const c of s.codes) byCode.set(c, s);
  }

  const lineByCode = new Map<string, MrtLine>();
  for (const l of file.lines) lineByCode.set(l.code, l);

  const adjacency = new Map<string, Edge[]>();
  const link = (a: MrtStation, b: MrtStation, line: string) => {
    // A chain that loops back on itself (the LRT loops, the Circle Line) hands
    // us the same station twice in a row at the seam; skip the self-edge.
    if (a.id === b.id) return;
    const meters = haversine(a.lat, a.lng, b.lat, b.lng);
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      const edges = adjacency.get(from.id) ?? [];
      if (!edges.some((e) => e.to === to.id && e.line === line)) {
        edges.push({ to: to.id, line, meters });
      }
      adjacency.set(from.id, edges);
    }
  };

  for (const line of file.lines) {
    for (let i = 1; i < line.stations.length; i++) {
      const a = byCode.get(line.stations[i - 1]);
      const b = byCode.get(line.stations[i]);
      if (a && b) link(a, b, line.code);
    }
  }

  return {
    generatedAt: file.generatedAt,
    attribution: file.attribution,
    lines: file.lines,
    stations: file.stations,
    byId,
    byCode,
    lineByCode,
    adjacency,
  };
}

// ---------------------------------------------------------------------------
// Loading. One fetch per page load, shared by every caller; a failure is not
// fatal anywhere — the overlay hides itself and travel falls back to the old
// straight-line rule.
// ---------------------------------------------------------------------------

let cached: MrtNetwork | null = null;
let pending: Promise<MrtNetwork | null> | null = null;

/** The network if it's already in memory, else null. Never fetches. */
export function getMrtNetwork(): MrtNetwork | null {
  return cached;
}

export function loadMrtNetwork(): Promise<MrtNetwork | null> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}mrt.json`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`mrt.json ${res.status}`);
        const file = (await res.json()) as MrtFile;
        if (!file.lines?.length || !file.stations?.length) throw new Error('mrt.json malformed');
        cached = buildNetwork(file);
        return cached;
      })
      .catch(() => {
        pending = null; // let a later attempt retry rather than caching the failure
        return null;
      });
  }
  return pending;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** The nearest station to a point, if one is within `maxMeters`. */
export function nearestStation(
  net: MrtNetwork,
  lat: number,
  lng: number,
  maxMeters = STATION_MATCH_M,
): MrtStation | null {
  let best: MrtStation | null = null;
  let bestD = maxMeters;
  for (const s of net.stations) {
    const d = haversine(lat, lng, s.lat, s.lng);
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/**
 * The lines serving a station, as the map draws them — a branch reports its
 * parent, so Expo reads "East West Line", not "Changi Airport Branch".
 */
export function linesAt(net: MrtNetwork, station: MrtStation): MrtLine[] {
  const out: MrtLine[] = [];
  for (const code of station.codes) {
    const own = net.lineByCode.get(code.slice(0, 2));
    const line = own?.parent ? net.lineByCode.get(own.parent) ?? own : own;
    if (line && !out.includes(line)) out.push(line);
  }
  return out;
}

/** The colour to draw a station's marker in — its first line's livery. */
export function stationColor(net: MrtNetwork, station: MrtStation): string {
  return linesAt(net, station)[0]?.color ?? '#9c9890';
}

/**
 * Shortest ride from one station to another, in tunnel distance with a penalty
 * per line change so the search prefers the route with fewer changes when two
 * are close. Returns null if the stations aren't connected at all.
 *
 * Dijkstra over (station, line-you-arrived-on) pairs rather than plain
 * stations: the cost of a stop depends on whether you're already on that line,
 * which a station-only graph can't express.
 */
export function findRoute(net: MrtNetwork, fromId: string, toId: string): MrtRoute | null {
  const from = net.byId.get(fromId);
  const to = net.byId.get(toId);
  if (!from || !to) return null;
  if (from.id === to.id) return { legs: [], stops: 0, changes: 0, meters: 0 };

  interface Node {
    station: string;
    line: string | null;
    cost: number;
    prev: Node | null;
  }

  const start: Node = { station: from.id, line: null, cost: 0, prev: null };
  const best = new Map<string, number>([[`${from.id}|`, 0]]);
  // The network is ~190 stations, so a sorted-insert frontier is plenty and
  // keeps this dependency-free.
  const frontier: Node[] = [start];
  let arrived: Node | null = null;

  while (frontier.length) {
    const node = frontier.shift()!;
    const key = `${node.station}|${node.line ?? ''}`;
    if (node.cost > (best.get(key) ?? Infinity)) continue;
    if (node.station === to.id) {
      arrived = node;
      break;
    }
    for (const edge of net.adjacency.get(node.station) ?? []) {
      const change = node.line !== null && node.line !== edge.line;
      const cost = node.cost + edge.meters + (change ? CHANGE_PENALTY_M : 0);
      const nextKey = `${edge.to}|${edge.line}`;
      if (cost >= (best.get(nextKey) ?? Infinity)) continue;
      best.set(nextKey, cost);
      const next: Node = { station: edge.to, line: edge.line, cost, prev: node };
      const at = frontier.findIndex((n) => n.cost > cost);
      if (at === -1) frontier.push(next);
      else frontier.splice(at, 0, next);
    }
  }

  if (!arrived) return null;

  // Walk the chain back to the start, then fold consecutive same-line hops
  // into legs.
  const path: Node[] = [];
  for (let n: Node | null = arrived; n; n = n.prev) path.unshift(n);

  const legs: MrtLeg[] = [];
  let meters = 0;
  for (let i = 1; i < path.length; i++) {
    const prevStation = net.byId.get(path[i - 1].station)!;
    const station = net.byId.get(path[i].station)!;
    const line = net.lineByCode.get(path[i].line!)!;
    const hop = haversine(prevStation.lat, prevStation.lng, station.lat, station.lng);
    meters += hop;

    const last = legs[legs.length - 1];
    if (last && last.line.code === line.code) {
      last.to = station;
      last.stops.push(station);
      last.meters += hop;
    } else {
      legs.push({ line, from: prevStation, to: station, stops: [station], meters: hop });
    }
  }

  return {
    legs,
    stops: path.length - 1,
    changes: Math.max(0, legs.length - 1),
    meters: Math.round(meters),
  };
}

/**
 * The ride between two locations, or null if either isn't a station the network
 * knows, the network isn't loaded, or no line connects them. Callers treat a
 * null as "can't ride" only when the network is actually loaded — see
 * getMrtNetwork().
 */
export function mrtRouteBetween(
  from: { mrtStationId?: string },
  to: { mrtStationId?: string },
): MrtRoute | null {
  const net = cached;
  if (!net || !from.mrtStationId || !to.mrtStationId) return null;
  return findRoute(net, from.mrtStationId, to.mrtStationId);
}

/** "6 stops · 1 change at City Hall" — the one-line ride summary. */
export function describeRoute(route: MrtRoute): string {
  const stops = `${route.stops} stop${route.stops === 1 ? '' : 's'}`;
  if (route.changes === 0) return stops;
  const at = route.legs
    .slice(0, -1)
    .map((l) => l.to.name)
    .join(', ');
  return `${stops} · ${route.changes} change${route.changes === 1 ? '' : 's'} at ${at}`;
}
