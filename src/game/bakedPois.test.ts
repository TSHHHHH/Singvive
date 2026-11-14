import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import revision from './data/poiRevision.json';

const ring = [[1.3, 103.8], [1.301, 103.8], [1.3, 103.801]];
const index = { revision, cells: ['65_5190', '70_5200'], evacIds: ['way/a'], pois: [
  { osmId: 'way/a', name: 'School', category: 'school', lat: 1.3, lng: 103.8, outlineCell: '65_5190' },
  { osmId: 'way/b', name: 'Far house', category: 'housing', lat: 1.4, lng: 104, outlineCell: '70_5200' },
] };
const responses: Record<string, unknown> = {
  'index': index,
  '65_5190': { revision, outlines: { 'way/a': ring } },
  '70_5200': { revision, outlines: { 'way/b': ring } },
};
const serve = (url: string) => new Response(JSON.stringify(responses[url.split('/').at(-1)!.replace('.json', '')]));

beforeEach(() => { vi.resetModules(); vi.stubGlobal('caches', undefined); vi.stubGlobal('fetch', vi.fn(async (url: string) => serve(url))); });
afterEach(() => vi.unstubAllGlobals());

describe('split POI assets', () => {
  it('loads metadata for evac selection, and only nearby exact geometry for world generation', async () => {
    const bake = await import('./bakedPois');
    expect((await bake.bakedEvacPois())[0].outline).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [a, b] = await Promise.all([bake.bakedPoisNear(1.3,103.8,500), bake.bakedPoisNear(1.3,103.8,500)]);
    expect(a[0].outline).toEqual(ring);
    expect(a[0]).toBe(b[0]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bake.bakedOutlineByOsmId()!.has('way/b')).toBe(false);
  });
  it('rejects incomplete or mismatched footprints and retries instead of changing world size', async () => {
    const bake = await import('./bakedPois');
    await bake.ensureBakeLoaded();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ revision: 'stale', outlines: { 'way/a': ring } })));
    await expect(bake.ensurePoiOutlines(['way/a'])).rejects.toThrow('revision');
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ revision, outlines: {} })));
    await expect(bake.ensurePoiOutlines(['way/a'])).rejects.toThrow('invalid');
    expect(bake.bakedOutlineByOsmId()!.has('way/a')).toBe(false);
    await bake.ensurePoiOutlines(['way/a']);
    expect(bake.bakedOutlineByOsmId()!.get('way/a')).toEqual(ring);
  });
  it('rejects stale metadata', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ...index, revision: 'old' })));
    const bake = await import('./bakedPois');
    await expect(bake.ensureBakeLoaded()).rejects.toThrow('revision');
    await expect(bake.ensureBakeLoaded()).resolves.toHaveLength(5); // includes curated landmarks
  });
  it('finishes successful cells before reporting a partial resume failure', async () => {
    const bake = await import('./bakedPois');
    await bake.ensureBakeLoaded();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('65_5190.json')) return new Response('offline', { status: 503 });
      await new Promise((resolve) => setTimeout(resolve, 10));
      return serve(url);
    });
    await expect(bake.ensurePoiOutlines(['way/a', 'way/b'])).rejects.toThrow('503');
    expect(bake.bakedOutlineByOsmId()!.get('way/b')).toEqual(ring);
  });
  it('works online when cache storage is denied', async () => {
    vi.stubGlobal('caches', { open: vi.fn().mockRejectedValue(new Error('denied')) });
    const bake = await import('./bakedPois');
    expect((await bake.bakedPoisNear(1.3,103.8,500))[0].outline).toEqual(ring);
  });
  it('reports an incomplete background pass and retries failed cells', async () => {
    const bake = await import('./bakedPois');
    await bake.ensureBakeLoaded();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('offline', { status: 503 }));
    await expect(bake.cacheAllPoiAssets()).rejects.toThrow('unavailable');
    await expect(bake.cacheAllPoiAssets()).resolves.toBeUndefined();
    expect(bake.bakedOutlineByOsmId()!.has('way/a')).toBe(true);
    expect(bake.bakedOutlineByOsmId()!.has('way/b')).toBe(true);
  });
  it('can reload and discover a distant location offline after the cache pass', async () => {
    const stored = new Map<string, Response>();
    const open = vi.fn(async () => ({
      match: async (url: string) => stored.get(url)?.clone(),
      put: async (url: string, response: Response) => { stored.set(url, response); },
      delete: async (url: string) => stored.delete(url),
    }));
    vi.stubGlobal('caches', { open });
    const bake = await import('./bakedPois');
    await bake.cacheAllPoiAssets();
    expect(open).toHaveBeenCalledWith(`singvive-pois-${revision}`);
    vi.resetModules();
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const fresh = await import('./bakedPois');
    expect((await fresh.bakedPoisNear(1.4,104,500))[0].outline).toEqual(ring);
  });
  it('ships every canonical footprint unchanged and keeps the compiled revision in sync', () => {
    const full = JSON.parse(readFileSync('public/pois.json','utf8'));
    const packed = JSON.parse(readFileSync(`public/poi-data/${revision}/index.json`,'utf8'));
    expect(packed.revision).toBe(revision);
    const outlines = Object.assign({}, ...packed.cells.map((cell: string) =>
      JSON.parse(readFileSync(`public/poi-data/${revision}/${cell}.json`,'utf8')).outlines));
    expect(packed.pois.map(({ outlineCell, ...p }: { outlineCell?: string; osmId: string }) =>
      outlineCell ? { ...p, outline: outlines[p.osmId] } : p)).toEqual(full.pois);
  });
});
