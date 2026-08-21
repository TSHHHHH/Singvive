import { haversine } from './overpass';
import { edgeKey, isEdgeDestroyed } from './mrtDamage';

/**
 * Singapore's rail network, baked from OpenStreetMap by `npm run bake:mrt` into
 * public/mrt.json.
 *
 * Two things use it. The map overlay draws it — real track geometry, official
 * liveries, station codes — and the tunnel planner reuses that same overlay so
 * both views stay in lockstep. Travel walks it: no train has run in months, so
 * a trip is a planned tunnel crawl along a chosen route (possibly many stops),
 * with some edges collapsed each run. Collapsed bores stay walkable — they are
 * a brutal crawl, not a wall. `findRoute` / `findRoutes` prefer intact hops
 * and still offer a shorter rubble shortcut; `neighbours` is the one-hop
 * building block.
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
  /** Adjacent hops on this path that are collapsed this run. */
  collapsedHops: number;
  /** Track metres of those collapsed hops. */
  collapsedMeters: number;
}

/** Whether collapsed bores are skipped (`avoid`) or walked (`allow`). */
export type CollapsedPolicy = 'avoid' | 'allow';

export type DestroyedEdges = ReadonlySet<string> | readonly string[] | null | undefined;

/**
 * Tie-break only: prefer fewer line changes when hop counts match.
 * Kept tiny vs hop cost (each hop costs 1000) so hop count always wins.
 */
const CHANGE_TIEBREAK = 1;
const HOP_COST = 1000;

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
 * Nearest station with no distance cap — used for corridor bias / planner
 * anchors when the POI isn't within STATION_MATCH_M of a platform.
 */
export function nearestStationAny(net: MrtNetwork, lat: number, lng: number): MrtStation {
  let best = net.stations[0];
  let bestD = Infinity;
  for (const s of net.stations) {
    const d = haversine(lat, lng, s.lat, s.lng);
    if (d < bestD) {
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

/** The line to *name* — a branch answers with its parent. @see linesAt */
export function displayLine(net: MrtNetwork, line: MrtLine): MrtLine {
  return (line.parent ? net.lineByCode.get(line.parent) : null) ?? line;
}

/** One hop on a planned crawl, coloured as the map draws it (branch → parent). */
export interface JourneyHop {
  fromId: string;
  toId: string;
  lineCode: string;
  lineName: string;
  color: string;
  meters: number;
  /** True when this hop is a collapsed bore this run. */
  collapsed?: boolean;
}

/** One station on a planned crawl. `isTransfer` is a change on *this* route. */
export interface JourneyStop {
  id: string;
  name: string;
  codes: string[];
  isTransfer: boolean;
}

export interface JourneyStrip {
  stops: JourneyStop[];
  hops: JourneyHop[];
}

/** One tunnel segment: the next station down the line, and how far it is. */
export interface MrtSegment {
  station: MrtStation;
  line: MrtLine;
  /** Distance along the tunnel between the two platforms. */
  meters: number;
  /** True when this hop is a collapsed bore this run — passable, brutal. */
  collapsed?: boolean;
}

/**
 * The stations one stop away. Collapsed hops stay in the list and are flagged
 * so the caller can warn; they are not skipped. Two stations can be joined by
 * more than one line; the shortest wins.
 */
export function neighbours(
  net: MrtNetwork,
  stationId: string,
  destroyed?: DestroyedEdges,
): MrtSegment[] {
  const out = new Map<string, MrtSegment>();
  for (const edge of net.adjacency.get(stationId) ?? []) {
    const station = net.byId.get(edge.to);
    const line = net.lineByCode.get(edge.line);
    if (!station || !line) continue;
    const collapsed = isEdgeDestroyed(destroyed, stationId, edge.to);
    const seen = out.get(edge.to);
    if (seen && seen.meters <= edge.meters) continue;
    out.set(edge.to, {
      station,
      line,
      meters: Math.round(edge.meters),
      collapsed,
    });
  }
  return [...out.values()].sort((a, b) => a.meters - b.meters);
}

/** The segment joining two stations, or null if they aren't neighbours. */
export function adjacentEdge(
  net: MrtNetwork,
  fromId: string,
  toId: string,
  destroyed?: DestroyedEdges,
): MrtSegment | null {
  return neighbours(net, fromId, destroyed).find((n) => n.station.id === toId) ?? null;
}

const FALLBACK_HOP = { code: '', name: 'Tunnel', color: '#9c9890' };

/**
 * Liveries and transfer flags for an ordered station-id path. Derived at
 * render so a crawl save does not need a new schema key. Missing network or
 * a hop the adjacency table does not know still returns a strip — the HUD
 * falls back to the run's first-line colour rather than going blank.
 */
export function journeyStrip(
  net: MrtNetwork | null,
  stationIds: readonly string[],
  opts?: {
    names?: readonly string[];
    fallback?: { code: string; name: string; color: string };
    destroyed?: DestroyedEdges;
  },
): JourneyStrip {
  const fallback = opts?.fallback ?? FALLBACK_HOP;
  const hops: JourneyHop[] = [];
  for (let i = 1; i < stationIds.length; i++) {
    const fromId = stationIds[i - 1];
    const toId = stationIds[i];
    const seg = net ? adjacentEdge(net, fromId, toId, opts?.destroyed) : null;
    const shown = seg && net ? displayLine(net, seg.line) : null;
    const prev = hops[hops.length - 1];
    hops.push({
      fromId,
      toId,
      lineCode: shown?.code ?? prev?.lineCode ?? fallback.code,
      lineName: shown?.name ?? prev?.lineName ?? fallback.name,
      color: shown?.color ?? prev?.color ?? fallback.color,
      meters: seg?.meters ?? 0,
      collapsed: seg?.collapsed ?? isEdgeDestroyed(opts?.destroyed, fromId, toId),
    });
  }

  const stops: JourneyStop[] = stationIds.map((id, i) => {
    const station = net?.byId.get(id);
    const name = opts?.names?.[i] || station?.name || id;
    const codes = station?.codes.length ? station.codes : [id];
    const isTransfer =
      i > 0 && i < hops.length && hops[i - 1].lineCode !== hops[i].lineCode;
    return { id, name, codes, isTransfer };
  });

  return { stops, hops };
}

/** The code on this station that belongs to `lineCode`, else the canonical id. */
export function codeOnLine(stop: JourneyStop, lineCode: string): string {
  if (!lineCode) return stop.codes[0] ?? stop.id;
  const prefix = lineCode.slice(0, 2);
  return stop.codes.find((c) => c.startsWith(prefix)) ?? stop.codes[0] ?? stop.id;
}

/** As `adjacentEdge`, for two locations — null unless both are known stations. */
export function tunnelSegmentBetween(
  from: { mrtStationId?: string },
  to: { mrtStationId?: string },
  destroyed?: DestroyedEdges,
): MrtSegment | null {
  const net = cached;
  if (!net || !from.mrtStationId || !to.mrtStationId) return null;
  return adjacentEdge(net, from.mrtStationId, to.mrtStationId, destroyed);
}

interface SearchNode {
  station: string;
  line: string | null;
  cost: number;
  prev: SearchNode | null;
}

const EMPTY_ROUTE: MrtRoute = {
  legs: [],
  stops: 0,
  changes: 0,
  meters: 0,
  collapsedHops: 0,
  collapsedMeters: 0,
};

function pathToRoute(
  net: MrtNetwork,
  arrived: SearchNode,
  destroyed?: DestroyedEdges,
): MrtRoute {
  const path: SearchNode[] = [];
  for (let n: SearchNode | null = arrived; n; n = n.prev) path.unshift(n);

  const legs: MrtLeg[] = [];
  let meters = 0;
  let collapsedHops = 0;
  let collapsedMeters = 0;
  for (let i = 1; i < path.length; i++) {
    const prevStation = net.byId.get(path[i - 1].station)!;
    const station = net.byId.get(path[i].station)!;
    const line = net.lineByCode.get(path[i].line!)!;
    const hop = haversine(prevStation.lat, prevStation.lng, station.lat, station.lng);
    meters += hop;
    if (isEdgeDestroyed(destroyed, prevStation.id, station.id)) {
      collapsedHops += 1;
      collapsedMeters += hop;
    }

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
    collapsedHops,
    collapsedMeters: Math.round(collapsedMeters),
  };
}

/**
 * Shortest ride by **fewest stations**, with a light tie-break for fewer line
 * changes. `avoid` skips collapsed bores (intact detour). `allow` walks them
 * (fewest hops, rubble included). Returns null if disconnected under that policy.
 *
 * Dijkstra over (station, line-you-arrived-on) pairs.
 */
export function findRoute(
  net: MrtNetwork,
  fromId: string,
  toId: string,
  destroyed?: DestroyedEdges,
  policy: CollapsedPolicy = 'avoid',
  /** Extra undirected keys to skip (Yen-lite), counted separately from collapsed. */
  forbid?: DestroyedEdges,
): MrtRoute | null {
  const from = net.byId.get(fromId);
  const to = net.byId.get(toId);
  if (!from || !to) return null;
  if (from.id === to.id) return EMPTY_ROUTE;

  const start: SearchNode = { station: from.id, line: null, cost: 0, prev: null };
  const best = new Map<string, number>([[`${from.id}|`, 0]]);
  const frontier: SearchNode[] = [start];
  let arrived: SearchNode | null = null;

  while (frontier.length) {
    const node = frontier.shift()!;
    const key = `${node.station}|${node.line ?? ''}`;
    if (node.cost > (best.get(key) ?? Infinity)) continue;
    if (node.station === to.id) {
      arrived = node;
      break;
    }
    for (const edge of net.adjacency.get(node.station) ?? []) {
      if (isEdgeDestroyed(forbid, node.station, edge.to)) continue;
      if (policy === 'avoid' && isEdgeDestroyed(destroyed, node.station, edge.to)) continue;
      const change = node.line !== null && node.line !== edge.line;
      const cost = node.cost + HOP_COST + (change ? CHANGE_TIEBREAK : 0);
      const nextKey = `${edge.to}|${edge.line}`;
      if (cost >= (best.get(nextKey) ?? Infinity)) continue;
      best.set(nextKey, cost);
      const next: SearchNode = { station: edge.to, line: edge.line, cost, prev: node };
      const at = frontier.findIndex((n) => n.cost > cost);
      if (at === -1) frontier.push(next);
      else frontier.splice(at, 0, next);
    }
  }

  if (!arrived) return null;
  return pathToRoute(net, arrived, destroyed);
}

/** Ordered station ids along a route, including the origin. */
export function routeStationIds(route: MrtRoute, fromId: string): string[] {
  const ids = [fromId];
  for (const leg of route.legs) {
    for (const s of leg.stops) ids.push(s.id);
  }
  return ids;
}

/** Stable signature so we can dedupe alternate routes. */
function routeSignature(route: MrtRoute, fromId: string): string {
  return routeStationIds(route, fromId).join('>');
}

function pushUniqueRoute(
  out: MrtRoute[],
  seen: Set<string>,
  fromId: string,
  route: MrtRoute | null,
  limit: number,
): void {
  if (!route || out.length >= limit) return;
  const sig = routeSignature(route, fromId);
  if (seen.has(sig)) return;
  seen.add(sig);
  out.push(route);
}

function yenAlts(
  net: MrtNetwork,
  fromId: string,
  toId: string,
  primary: MrtRoute,
  destroyed: DestroyedEdges,
  policy: CollapsedPolicy,
  seen: Set<string>,
  out: MrtRoute[],
  limit: number,
): void {
  const pathIds = routeStationIds(primary, fromId);
  for (let i = 1; i < pathIds.length && out.length < limit; i++) {
    const hopForbid = new Set([edgeKey(pathIds[i - 1], pathIds[i])]);
    const alt = findRoute(net, fromId, toId, destroyed, policy, hopForbid);
    if (!alt || alt.stops === 0) continue;
    pushUniqueRoute(out, seen, fromId, alt, limit);
  }

  if (out.length >= limit || primary.changes <= 0) return;
  const hubs = primary.legs.slice(0, -1).map((l) => l.to.id);
  for (const hub of hubs) {
    if (out.length >= limit) break;
    const idx = pathIds.indexOf(hub);
    if (idx <= 0 || idx >= pathIds.length - 1) continue;
    const hopForbid = new Set([edgeKey(pathIds[idx], pathIds[idx + 1])]);
    const alt = findRoute(net, fromId, toId, destroyed, policy, hopForbid);
    if (!alt || alt.stops === 0) continue;
    pushUniqueRoute(out, seen, fromId, alt, limit);
  }
}

/**
 * Up to `limit` distinct routes from A to B. Default is the fewest-stop
 * **intact** path. A shorter walk that crawls collapsed bores is offered as a
 * risky shortcut. Further candidates come from briefly forbidding edges on
 * earlier paths (Yen-lite).
 */
export function findRoutes(
  net: MrtNetwork,
  fromId: string,
  toId: string,
  destroyed?: DestroyedEdges,
  limit = 3,
): MrtRoute[] {
  const intact = findRoute(net, fromId, toId, destroyed, 'avoid');
  const shortest = findRoute(net, fromId, toId, destroyed, 'allow');
  if (!intact && !shortest) return [];

  const out: MrtRoute[] = [];
  const seen = new Set<string>();
  if (intact) pushUniqueRoute(out, seen, fromId, intact, limit);
  if (shortest && (!intact || shortest.stops < intact.stops)) {
    pushUniqueRoute(out, seen, fromId, shortest, limit);
  }

  const primary = intact ?? shortest;
  if (!primary || limit <= 1 || primary.stops === 0) return out.slice(0, limit);

  yenAlts(
    net,
    fromId,
    toId,
    primary,
    destroyed,
    intact ? 'avoid' : 'allow',
    seen,
    out,
    limit,
  );

  return out.slice(0, limit);
}

/**
 * The ride between two locations, or null if either isn't a station the network
 * knows, the network isn't loaded, or no line connects them. Prefers an intact
 * path; falls back to a collapsed crawl if every route is ruined.
 */
export function mrtRouteBetween(
  from: { mrtStationId?: string },
  to: { mrtStationId?: string },
  destroyed?: DestroyedEdges,
): MrtRoute | null {
  const net = cached;
  if (!net || !from.mrtStationId || !to.mrtStationId) return null;
  return (
    findRoute(net, from.mrtStationId, to.mrtStationId, destroyed, 'avoid') ??
    findRoute(net, from.mrtStationId, to.mrtStationId, destroyed, 'allow')
  );
}

/** Per-hop collapsed flags along an ordered station-id path (length = ids-1). */
export function hopCollapsedFlags(
  stationIds: readonly string[],
  destroyed?: DestroyedEdges,
): boolean[] {
  const flags: boolean[] = [];
  for (let i = 1; i < stationIds.length; i++) {
    flags.push(isEdgeDestroyed(destroyed, stationIds[i - 1], stationIds[i]));
  }
  return flags;
}

/** Human label for a planner route option. */
export function routeOptionLabel(route: MrtRoute, index: number): string {
  const stops = `${route.stops} stop${route.stops === 1 ? '' : 's'}`;
  if (route.collapsedHops > 0) {
    const n = route.collapsedHops;
    return `Through collapsed (${stops} · ${n} ruined)`;
  }
  if (index === 0) return `Fewest intact (${stops})`;
  if (route.changes === 0 && route.legs[0]) {
    return `Via ${route.legs[0].line.name} · ${route.stops} stops`;
  }
  const via = route.legs.map((l) => l.line.code).join('→');
  return `${via} · ${route.stops} stops · ${route.changes} change${route.changes === 1 ? '' : 's'}`;
}
