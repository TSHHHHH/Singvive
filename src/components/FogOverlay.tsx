import {
  createLayerComponent,
  createElementObject,
  type LayerProps,
  type LeafletContextInterface,
} from '@react-leaflet/core';
import L from 'leaflet';
import type { ExploredCircle } from '../game/fog';

export interface FogOverlayProps extends LayerProps {
  exploredArea: ExploredCircle[];
  currentRevealCenter: { lat: number; lng: number };
  currentRevealRadius: number;
}

// Charcoal veil, not a blackout — Dark Matter streets vanish at ~0.9 opacity,
// especially on a phone. Keep explored ground clearly brighter than fog.
const FOG_COLOUR = 'rgba(22, 26, 22, 0.66)';

/**
 * Convert a radius in metres to pixels at a given latitude and zoom level.
 * Uses the Web Mercator formula: one pixel = C·cos(lat) / 2^(zoom+8) metres.
 */
function metresToPixels(radius: number, lat: number, zoom: number): number {
  const metersPerPixel =
    (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  return radius / metersPerPixel;
}

type FogTileRecord = {
  el: HTMLElement;
  coords: L.Coords;
  current: boolean;
};

/** Runtime GridLayer shape — Leaflet keeps these fields protected in .d.ts. */
type FogLayer = L.GridLayer & {
  _fogProps: FogOverlayProps;
  _tiles: Record<string, FogTileRecord>;
  _map: (L.Map & { _fadeAnimated?: boolean }) | null;
  _wrapCoords(coords: L.Coords): L.Coords;
  setFogProps(props: FogOverlayProps): void;
  _refreshTiles(): void;
};

/**
 * Paint (or repaint) a single fog canvas. Keeps the DOM tile in place so
 * Leaflet never removes/fades tiles when energy/travel-range ticks — that
 * redraw path was the fog flicker on every action.
 *
 * Tiled canvas GridLayer on purpose. Do not remount tiles on energy ticks or
 * replace this with one fullscreen canvas.
 */
function paintFogTile(this: FogLayer, canvas: HTMLCanvasElement, coords: L.Coords): void {
  const tileSize = this.getTileSize();
  const dpr = window.devicePixelRatio || 1;
  const cssW = tileSize.x;
  const cssH = tileSize.y;

  const needW = Math.round(cssW * dpr);
  const needH = Math.round(cssH * dpr);
  if (canvas.width !== needW || canvas.height !== needH) {
    canvas.width = needW;
    canvas.height = needH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Reset every paint so in-place refreshes don't stack transforms.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, cssW, cssH);

  ctx.fillStyle = FOG_COLOUR;
  ctx.fillRect(0, 0, cssW, cssH);

  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'white';

  const { exploredArea, currentRevealCenter, currentRevealRadius } = this._fogProps;
  const tileOrigin = coords.scaleBy(tileSize);

  const map = this._map;
  if (!map) return;

  const punch = (circle: ExploredCircle) => {
    const pixelCoords = map.project(L.latLng(circle.lat, circle.lng), coords.z);
    const px = pixelCoords.x - tileOrigin.x;
    const py = pixelCoords.y - tileOrigin.y;
    const pixelRadius = metresToPixels(circle.radius, circle.lat, coords.z);

    if (
      px + pixelRadius < 0 ||
      px - pixelRadius > cssW ||
      py + pixelRadius < 0 ||
      py - pixelRadius > cssH
    ) {
      return;
    }

    ctx.beginPath();
    ctx.arc(px, py, pixelRadius, 0, Math.PI * 2);
    ctx.fill();
  };

  for (const circle of exploredArea) punch(circle);
  punch({
    lat: currentRevealCenter.lat,
    lng: currentRevealCenter.lng,
    radius: currentRevealRadius,
  });
}

/**
 * Custom GridLayer subclass that renders fog of war as canvas tiles.
 * Each tile is filled with fog colour, then explored areas are punched out
 * using canvas composite operations.
 */
const FogGridLayer = L.GridLayer.extend({
  options: {
    pane: 'overlayPane',
    opacity: 1,
    zIndex: 250, // between tilePane (200) and markerPane (600)
  },

  initialize(this: FogLayer, options: FogOverlayProps) {
    (L.GridLayer.prototype as unknown as { initialize: (opts: L.GridLayerOptions) => void }).initialize.call(
      this,
      options,
    );
    this._fogProps = options;
  },

  createTile(this: FogLayer, coords: L.Coords): HTMLElement {
    const canvas = document.createElement('canvas');
    paintFogTile.call(this, canvas, coords);
    return canvas;
  },

  /**
   * Fog must never fade from transparent — a 200ms opacity ramp after
   * createTile reads as the whole map flashing undarkened. Temporarily
   * disable the map's tile fade for this layer's ready callback only.
   */
  _tileReady(this: FogLayer, coords: L.Coords, err: Error | undefined, tile: HTMLElement) {
    const map = this._map;
    const prev = map?._fadeAnimated;
    if (map) map._fadeAnimated = false;
    (
      L.GridLayer.prototype as unknown as {
        _tileReady: (this: FogLayer, c: L.Coords, e: Error | undefined, t: HTMLElement) => void;
      }
    )._tileReady.call(this, coords, err, tile);
    if (map) map._fadeAnimated = prev;
  },

  setFogProps(this: FogLayer, props: FogOverlayProps) {
    this._fogProps = props;
    this._refreshTiles();
  },

  /** Repaint loaded canvases without GridLayer.redraw() (no remove + fade-in). */
  _refreshTiles(this: FogLayer) {
    const tiles = this._tiles;
    if (!tiles) return;
    for (const key of Object.keys(tiles)) {
      const tile = tiles[key];
      if (!(tile.el instanceof HTMLCanvasElement)) continue;
      paintFogTile.call(this, tile.el, this._wrapCoords(tile.coords));
    }
  },
});

function createFogLayer(props: FogOverlayProps, context: LeafletContextInterface) {
  const layer = new (FogGridLayer as unknown as new (options: FogOverlayProps) => FogLayer)(props);
  return createElementObject(layer, context);
}

function sameCenter(
  a: FogOverlayProps['currentRevealCenter'],
  b: FogOverlayProps['currentRevealCenter'],
): boolean {
  return a.lat === b.lat && a.lng === b.lng;
}

function updateFogLayer(
  instance: FogLayer,
  props: FogOverlayProps,
  prevProps: FogOverlayProps,
) {
  if (
    props.exploredArea !== prevProps.exploredArea ||
    props.currentRevealRadius !== prevProps.currentRevealRadius ||
    !sameCenter(props.currentRevealCenter, prevProps.currentRevealCenter)
  ) {
    instance.setFogProps(props);
  }
}

export const FogOverlay = createLayerComponent<FogLayer, FogOverlayProps>(
  createFogLayer,
  updateFogLayer,
);
