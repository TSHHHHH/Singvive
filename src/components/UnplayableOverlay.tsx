import { useEffect, useMemo, useState } from 'react';
import { Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { ZonesData, ZoneRing } from '../game/playable';
import { ensureZonesLoaded, getZones, seaMaskOuter } from '../game/playable';
import { useT } from '../i18n';

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

/** Opaque fill; ImageOverlay opacity applies once (no stacked polygons). */
const VEGETATION_OPAQUE = '#2f5a38';
const VEGETATION_OPACITY = 0.38;

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
 * Paint all vegetation rings into one raster so overlapping OSM polygons do
 * not stack opacity (source-over on opaque fill, then one ImageOverlay alpha).
 */
function VegetationMaskImage({ rings }: { rings: ZoneRing[] }) {
  const map = useMap();

  useEffect(() => {
    if (rings.length === 0) return;

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const ring of rings) {
      for (const [lat, lng] of ring) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
    }
    const pad = 0.005;
    minLat -= pad;
    maxLat += pad;
    minLng -= pad;
    maxLng += pad;

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

    ctx.fillStyle = VEGETATION_OPAQUE;
    for (const ring of rings) {
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
      opacity: VEGETATION_OPACITY,
      interactive: false,
      className: 'pointer-events-none',
      // Below fog (zIndex 250) so unexplored ground stays dark; above tiles.
      zIndex: 220,
    });
    overlay.addTo(map);

    return () => {
      overlay.remove();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [map, rings]);

  return null;
}

/**
 * Soft-cost forest wash for the in-run world map. Loads zones if needed;
 * fog sits above so only explored greenery reads.
 */
export function VegetationOverlay() {
  const [rings, setRings] = useState<ZoneRing[]>(() => getZones()?.vegetation ?? []);

  useEffect(() => {
    let cancelled = false;
    void ensureZonesLoaded()
      .then((z) => {
        if (!cancelled) setRings(z.vegetation ?? []);
      })
      .catch(() => {
        if (!cancelled) setRings(getZones()?.vegetation ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (rings.length === 0) return null;
  return <VegetationMaskImage rings={rings} />;
}

/**
 * Spawn-only wash: open sea (canvas mask) + inland water + restricted + vegetation.
 * Non-interactive so ClickCatcher keeps the picks.
 */
export function UnplayableOverlay({ zones }: { zones: ZonesData }) {
  // Stable ref for the effect when zone object identity changes but land doesn't.
  const land = useMemo(() => zones.land, [zones]);
  const vegetation = useMemo(() => zones.vegetation ?? [], [zones]);

  return (
    <>
      <SeaMaskImage land={land} />
      <VegetationMaskImage rings={vegetation} />
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
  const { t } = useT();
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded border border-white/15 bg-black/70 px-2.5 py-2 text-[11px] leading-relaxed text-white/75 backdrop-blur-sm">
      <div className="mb-1 font-medium text-white/90">{t('ui.terrain.title')}</div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#4d7a8c]" />
        {t('ui.terrain.water')}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#6b4a32]" />
        {t('ui.terrain.restricted')}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#2f5a38]" />
        {t('ui.terrain.vegetation')}
      </div>
    </div>
  );
}
