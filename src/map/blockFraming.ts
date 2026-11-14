/** Fit the whole building, including its footprint, into the unobstructed map. */
export function blockFraming(
  site: { lat: number; lng: number; outline?: ReadonlyArray<readonly [number, number]> },
  roof: number,
  width: number,
  height: number,
  bearing: number,
  pitch: number,
) {
  const ring = site.outline?.length ? site.outline : [[site.lat, site.lng]];
  const south = Math.min(...ring.map((p) => p[0]));
  const north = Math.max(...ring.map((p) => p[0]));
  const west = Math.min(...ring.map((p) => p[1]));
  const east = Math.max(...ring.map((p) => p[1]));
  const lat = (south + north) / 2;
  const lng = (west + east) / 2;
  const cosLat = Math.cos(lat * Math.PI / 180);
  const b = bearing * Math.PI / 180;
  const p = pitch * Math.PI / 180;
  const points = ring.map(([y, x]) => {
    const dx = (x - lng) * 111320 * cosLat;
    const dy = (y - lat) * 111320;
    return [dx * Math.cos(b) - dy * Math.sin(b), dx * Math.sin(b) + dy * Math.cos(b)];
  });
  const spanX = Math.max(20, ...points.map(([x]) => Math.abs(x) * 2));
  const spanY = Math.max(20, ...points.map(([, y]) => Math.abs(y) * 2));
  const roofM = Math.max(12, roof);
  // Leave room for perspective foreshortening and for the silhouette while orbiting.
  const pxPerM = Math.min(
    Math.max(80, width) * 0.68 / spanX,
    Math.max(120, height) * 0.64 / (roofM * Math.sin(p) + spanY * Math.cos(p)),
  );
  const zoom = Math.log2(pxPerM * 40075016.686 * cosLat / 512);
  return { center: [lng, lat] as [number, number], elevation: roofM / 2, zoom: Math.max(15, Math.min(19, zoom)) };
}
