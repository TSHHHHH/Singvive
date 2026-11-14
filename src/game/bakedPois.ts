import { haversine, type RawPoi } from './overpass';
import { withLandmarks } from './landmarks';
import revision from './data/poiRevision.json';
import { readPoiAsset } from './poiAssetCache';

interface IndexedPoi extends RawPoi { outlineCell?: string }
interface BakedIndex { revision: string; pois: IndexedPoi[]; cells: string[]; evacIds: string[] }
interface OutlineChunk { revision: string; outlines: Record<string, [number, number][]> }
let pending: Promise<RawPoi[]> | null = null;
let cached: RawPoi[] | null = null;
let evacPois: RawPoi[] = [];
let osmIdSet: Set<string> | null = null;
let outlineById: Map<string, [number, number][]> | null = null;
const cellById = new Map<string, string>();
const idsByCell = new Map<string, string[]>();
const poiById = new Map<string, RawPoi>();
const chunkLoads = new Map<string, Promise<void>>();
let cells: string[] = [];
let background: Promise<void> | null = null;
let backgroundScheduled = false;

function validIndex(value: unknown): value is BakedIndex {
  const d = value as Partial<BakedIndex> | null;
  if (!d || d.revision !== revision || !Array.isArray(d.pois) || !d.pois.length
    || !Array.isArray(d.cells) || !d.cells.every((c) => typeof c === 'string' && /^\d+_\d+$/.test(c))
    || !Array.isArray(d.evacIds)) return false;
  const validCells = new Set(d.cells);
  return d.pois.every((p) => !!p && typeof p.osmId === 'string' && typeof p.name === 'string'
    && typeof p.category === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && (!p.outlineCell || validCells.has(p.outlineCell)));
}

async function loadAll(): Promise<RawPoi[]> {
  const data = await readPoiAsset('index', validIndex);
  // Curated identities/geometry win; only the metadata is needed for island-wide evac selection.
  cached = withLandmarks(data.pois);
  cells = data.cells;
  osmIdSet = new Set(cached.map((p) => p.osmId));
  outlineById = new Map();
  for (const p of cached) {
    poiById.set(p.osmId, p);
    if (p.outline) outlineById.set(p.osmId, p.outline);
  }
  for (const p of data.pois) if (p.outlineCell && !outlineById.has(p.osmId)) {
    cellById.set(p.osmId, p.outlineCell);
    const ids = idsByCell.get(p.outlineCell) ?? [];
    ids.push(p.osmId);
    idsByCell.set(p.outlineCell, ids);
  }
  const want = new Set(data.evacIds);
  evacPois = cached.filter((p) => want.has(p.osmId));
  return cached;
}

function ensurePending(): Promise<RawPoi[]> {
  pending ??= loadAll().catch((error: unknown) => { pending = null; throw error; });
  return pending;
}

function loadCell(cell: string): Promise<void> {
  const existing = chunkLoads.get(cell);
  if (existing) return existing;
  const expected = idsByCell.get(cell) ?? [];
  const load = readPoiAsset<OutlineChunk>(cell, (value): value is OutlineChunk => {
    const d = value as Partial<OutlineChunk> | null;
    return !!d && d.revision === revision && !!d.outlines && expected.every((id) => {
      const ring = d.outlines![id];
      return Array.isArray(ring) && ring.length >= 3
        && ring.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
    });
  }).then((data) => {
    for (const id of expected) {
      const ring = data.outlines[id];
      outlineById!.set(id, ring);
      // Raw bake objects are private to this cache. LocationStates are built separately.
      poiById.get(id)!.outline = ring;
    }
  }).catch((error: unknown) => { chunkLoads.delete(cell); throw error; });
  chunkLoads.set(cell, load);
  return load;
}

/** Load exact geometry before world sizing or save rehydration. Concurrent requests share work. */
export async function ensurePoiOutlines(ids: readonly string[]): Promise<void> {
  await ensurePending();
  const wanted = new Set(ids.map((id) => cellById.get(id)).filter((c): c is string => !!c));
  // Finish successful cells even when another fails, so resume can rehydrate partial coverage.
  const results = await Promise.allSettled([...wanted].map(loadCell));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}

/** Fill the versioned offline cache after nearby geometry; two requests at a time. Retryable. */
export async function cacheAllPoiAssets(): Promise<void> {
  await ensurePending();
  if (background) return background;
  const queue = [...cells];
  let failed = false;
  const worker = async () => {
    while (queue.length) {
      const cell = queue.shift()!;
      try { await loadCell(cell); } catch { failed = true; }
    }
  };
  background = Promise.all([worker(), worker()]).then(() => {
    if (failed) throw new Error('Some POI geometry is unavailable; retry caching when online');
  }).finally(() => { background = null; });
  return background;
}

function scheduleOfflineCache(): void {
  if (backgroundScheduled || typeof window === 'undefined') return;
  backgroundScheduled = true;
  // Give the opening map/interaction priority over background island geometry.
  window.setTimeout(() => { void cacheAllPoiAssets().catch(() => {}); }, 2000);
}

export function isBakeLoaded(): boolean { return cached !== null; }
export function prefetchBake(): void { void ensurePending().catch(() => {}); }
export function ensureBakeLoaded(): Promise<RawPoi[]> { return ensurePending(); }
export function bakedOsmIds(): Set<string> | null { return osmIdSet; }
export function bakedOutlineByOsmId(): Map<string, [number, number][]> | null { return outlineById; }

export async function bakedPoisNear(lat: number, lng: number, radius: number): Promise<RawPoi[]> {
  const all = await ensurePending();
  const latPad = radius / 111000;
  const lngPad = radius / (111000 * Math.cos((lat * Math.PI) / 180));
  const near: RawPoi[] = [];
  for (const p of all) {
    if (p.lat < lat - latPad || p.lat > lat + latPad) continue;
    if (p.lng < lng - lngPad || p.lng > lng + lngPad) continue;
    if (haversine(lat, lng, p.lat, p.lng) <= radius) near.push(p);
  }
  await ensurePoiOutlines(near.map((p) => p.osmId));
  scheduleOfflineCache();
  return near;
}

/** Metadata only: hydrate just the chosen evac rather than fetching every island footprint. */
export async function bakedEvacPois(): Promise<RawPoi[]> {
  await ensurePending();
  return evacPois;
}
