import revision from './data/poiRevision.json';

/** Versioned, immutable assets; storage denial/quota must never prevent online play. */
export async function readPoiAsset<T>(file: string, valid: (value: unknown) => value is T): Promise<T> {
  const url = `${import.meta.env.BASE_URL}poi-data/${revision}/${file}.json`;
  let cache: Cache | undefined;
  try {
    if (typeof caches !== 'undefined') cache = await caches.open(`singvive-pois-${revision}`);
    const hit = await cache?.match(url);
    if (hit) {
      const data: unknown = await hit.json();
      if (valid(data)) return data;
      await cache?.delete(url);
    }
  } catch { /* Private mode / corrupt cache: try the network. */ }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const copy = response.clone();
  const data: unknown = await response.json();
  if (!valid(data)) throw new Error(`${file}: invalid POI asset or revision`);
  try { await cache?.put(url, copy); } catch { /* Cache is an optional acceleration. */ }
  return data;
}
