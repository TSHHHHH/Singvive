import { useEffect } from 'react';
import { useMapGL } from '../map/hooks';

/** Tile edge in px; the grain repeats at this size in screen space. */
const TILE = 128;

let tileUrl: string | null = null;

/** A static monochrome noise tile, built once per page (no SVG filter cost). */
function grainTile(): string {
  if (tileUrl) return tileUrl;
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(TILE, TILE);
  let s = 0x9e3779b9;
  for (let i = 0; i < img.data.length; i += 4) {
    // xorshift: stable grain, no Math.random churn between mounts
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const v = (s >>> 0) & 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tileUrl = c.toDataURL('image/png');
  return tileUrl;
}

/**
 * A faint film grain over the map ground, so the dark reads as a surface
 * rather than an empty canvas. One static DOM layer just above the map
 * canvas and below every marker: the compositor blends it, the map never
 * repaints for it.
 */
export function MapGrain() {
  const map = useMapGL();
  useEffect(() => {
    const host = map.getCanvasContainer();
    const canvas = map.getCanvas();
    const el = document.createElement('div');
    el.className = 'map-grain';
    el.style.backgroundImage = `url(${grainTile()})`;
    host.insertBefore(el, canvas.nextSibling);
    return () => el.remove();
  }, [map]);
  return null;
}
