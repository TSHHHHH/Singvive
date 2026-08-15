import { useEffect, useMemo } from 'react';
import { Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { ZonesData, ZoneRing } from '../game/playable';
import { seaMaskOuter } from '../game/playable';

const WATER_FILL = 'rgba(77, 122, 140, 0.48)';
const WATER_STYLE = {
  color: '#5a8a9a',
  weight: 0,
  fillColor: '#4d7a8c',
  fillOpacity: 0.48,
  interactive: false as const,
};

const RESTRICTED_STYLE = {
  color: '#7a5a3a',
  weight: 0,
  fillColor: '#6b4a32',
  fillOpacity: 0.42,
  interactive: false as const,
};

const SEA_CANVAS_W = 1536;

function ensureClosed(ring: ZoneRing): ZoneRing {
  if (ring.length < 3) return ring;
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (a[0] === b[0] && a[1] === b[1]) return ring;
  return [...ring, [a[0], a[1]] as [number, number]];
}

function toLatLngs(ring: ZoneRing): [number, number][] {
  return ensureClosed(ring).map(([lat, lng]) => [lat, lng]);
}

/**
 * Paint open sea as a raster: fill the bounds, then punch land out with
 * destination-out. Leaflet polygon-holes / GeoJSON kept flooding the whole
 * map blue on this basemap setup.
 */
function SeaMaskImage({ land }: { land: ZoneRing[] }) {
  const map = useMap();

  useEffect(() => {
    const outer = seaMaskOuter();
    const lats = outer.map((p) => p[0]);
    const lngs = outer.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const bounds = L.latLngBounds([minLat, minLng], [maxLat, maxLng]);

    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;
    const midLat = (minLat + maxLat) / 2;
    const aspect = (latSpan / lngSpan) * (1 / Math.cos((midLat * Math.PI) / 180));
    const w = SEA_CANVAS_W;
    const h = Math.max(256, Math.round(w * aspect));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const project = (lat: number, lng: number): [number, number] => [
      ((lng - minLng) / lngSpan) * w,
      ((maxLat - lat) / latSpan) * h,
    ];

    // Full sea wash
    ctx.fillStyle = WATER_FILL;
    ctx.fillRect(0, 0, w, h);

    // Punch dry land transparent
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    for (const ring of land) {
      const closed = ensureClosed(ring);
      if (closed.length < 4) continue;
      ctx.beginPath();
      for (let i = 0; i < closed.length; i++) {
        const [x, y] = project(closed[i][0], closed[i][1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }

    const url = canvas.toDataURL('image/png');
    const overlay = L.imageOverlay(url, bounds, {
      opacity: 1,
      interactive: false,
      className: 'pointer-events-none',
    });
    overlay.addTo(map);
    overlay.bringToBack();

    return () => {
      overlay.remove();
      // Drop the data URL promptly
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [map, land]);

  return null;
}

/**
 * Spawn-only wash: open sea (canvas mask) + inland water + restricted.
 * Non-interactive so ClickCatcher keeps the picks.
 */
export function UnplayableOverlay({ zones }: { zones: ZonesData }) {
  // Stable ref for the effect when zone object identity changes but land doesn't.
  const land = useMemo(() => zones.land, [zones]);

  return (
    <>
      <SeaMaskImage land={land} />
      {zones.water.map((ring, i) => (
        <Polygon key={`w-${i}`} positions={toLatLngs(ring)} pathOptions={WATER_STYLE} />
      ))}
      {zones.restricted.map((ring, i) => (
        <Polygon key={`r-${i}`} positions={toLatLngs(ring)} pathOptions={RESTRICTED_STYLE} />
      ))}
    </>
  );
}

/** Corner legend for the spawn map. */
export function UnplayableLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded border border-white/15 bg-black/70 px-2.5 py-2 text-[11px] leading-relaxed text-white/75 backdrop-blur-sm">
      <div className="mb-1 font-medium text-white/90">Unplayable</div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#4d7a8c]" />
        Water
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#6b4a32]" />
        Restricted — sealed off
      </div>
    </div>
  );
}
