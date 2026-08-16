import type { Rng } from './rng';
import type { MrtNetwork } from './mrt';

/**
 * Per-run tunnel collapses. Edges are undirected keys `"a|b"` with sorted
 * station ids. Rolled once at spawn after the first evac beacon is known, so
 * the soft bias can lean on the spawn→evac rail corridor.
 */

/** Undirected edge key — order-independent. */
export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function isEdgeDestroyed(
  destroyed: ReadonlySet<string> | readonly string[] | null | undefined,
  a: string,
  b: string,
): boolean {
  if (!destroyed) return false;
  const key = edgeKey(a, b);
  if (destroyed instanceof Set) return destroyed.has(key);
  // ReadonlySet from `new Set(...)` as prop, or a plain array.
  if (typeof (destroyed as ReadonlySet<string>).has === 'function') {
    return (destroyed as ReadonlySet<string>).has(key);
  }
  return (destroyed as readonly string[]).includes(key);
}

/** Every unique adjacency edge in the network (undirected). */
export function allUndirectedEdges(net: MrtNetwork): string[] {
  const seen = new Set<string>();
  for (const [from, edges] of net.adjacency) {
    for (const e of edges) seen.add(edgeKey(from, e.to));
  }
  return [...seen];
}

export interface DestroyBias {
  /** Station nearest spawn (or any stand-in). */
  fromStationId: string;
  /** Station nearest the first evac site. */
  toStationId: string;
}

/** Fewest-hop path (station ids including ends), or null if disconnected. */
function hopPath(net: MrtNetwork, fromId: string, toId: string): string[] | null {
  if (fromId === toId) return [fromId];
  const prev = new Map<string, string | null>([[fromId, null]]);
  const q = [fromId];
  while (q.length) {
    const cur = q.shift()!;
    if (cur === toId) break;
    const seenTo = new Set<string>();
    for (const e of net.adjacency.get(cur) ?? []) {
      if (seenTo.has(e.to) || prev.has(e.to)) continue;
      seenTo.add(e.to);
      prev.set(e.to, cur);
      q.push(e.to);
    }
  }
  if (!prev.has(toId)) return null;
  const path: string[] = [];
  for (let n: string | null = toId; n; n = prev.get(n) ?? null) path.unshift(n);
  return path;
}

/**
 * Soft corridor bias: edges on the undamaged shortest hop-path between the
 * two stations, plus edges touching corridor stations, get elevated weight.
 */
function corridorWeights(net: MrtNetwork, bias: DestroyBias | null): Map<string, number> {
  const weights = new Map<string, number>();
  if (!bias) return weights;

  const pathIds = hopPath(net, bias.fromStationId, bias.toStationId);
  if (!pathIds || pathIds.length < 2) return weights;

  for (let i = 1; i < pathIds.length; i++) {
    weights.set(edgeKey(pathIds[i - 1], pathIds[i]), 3);
  }

  const onPath = new Set(pathIds);
  for (const id of pathIds) {
    for (const e of net.adjacency.get(id) ?? []) {
      const key = edgeKey(id, e.to);
      if (!weights.has(key) && onPath.has(id)) {
        weights.set(key, 2);
      }
    }
  }
  return weights;
}

function remainingDegree(net: MrtNetwork, destroyed: Set<string>, id: string, skipKey: string): number {
  const seen = new Set<string>();
  for (const e of net.adjacency.get(id) ?? []) {
    const k = edgeKey(id, e.to);
    if (destroyed.has(k) || k === skipKey) continue;
    seen.add(e.to);
  }
  return seen.size;
}

/** Prefer not to isolate a station by removing its last live edge. */
function wouldIsolate(net: MrtNetwork, destroyed: Set<string>, key: string): boolean {
  const [a, b] = key.split('|');
  return remainingDegree(net, destroyed, a, key) === 0 || remainingDegree(net, destroyed, b, key) === 0;
}

/**
 * Medium destruction (~15–25%, target ~20%) with soft bias toward the
 * spawn→first-evac corridor. Seed-stable via the caller's rng fork.
 */
export function rollDestroyedTunnels(
  rng: Rng,
  net: MrtNetwork,
  bias: DestroyBias | null,
): string[] {
  const edges = allUndirectedEdges(net);
  if (edges.length === 0) return [];

  const fraction = 0.15 + rng.next() * 0.1; // 15–25%
  const target = Math.max(1, Math.round(edges.length * fraction));
  const biasW = corridorWeights(net, bias);

  const pool: [string, number][] = edges.map((e) => [e, biasW.get(e) ?? 1]);
  const destroyed = new Set<string>();

  while (destroyed.size < target && pool.length) {
    const pick = rng.weighted(pool);
    const idx = pool.findIndex(([e]) => e === pick);
    if (idx >= 0) pool.splice(idx, 1);
    if (wouldIsolate(net, destroyed, pick)) continue;
    destroyed.add(pick);
  }

  return [...destroyed].sort();
}
