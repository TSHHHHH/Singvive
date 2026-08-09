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

const FOG_COLOUR = 'rgba(10, 12, 8, 0.92)';

/**
 * Convert a radius in metres to pixels at a given latitude and zoom level.
 * Uses the Web Mercator formula: one pixel = C·cos(lat) / 2^(zoom+8) metres.
 */
function metresToPixels(radius: number, lat: number, zoom: number): number {
  const metersPerPixel =
    (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  return radius / metersPerPixel;
}

interface FogLayer extends L.GridLayer {
  _fogProps: FogOverlayProps;
  setFogProps(props: FogOverlayProps): void;
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
    (L.GridLayer.prototype as unknown as { initialize: (opts: L.GridLayerOptions) => void }).initialize.call(this, options);
    this._fogProps = options;
  },

  createTile(this: FogLayer, coords: L.Coords): HTMLElement {
    const tileSize = this.getTileSize();
    const canvas = document.createElement('canvas');

    // Back the canvas at device resolution, not CSS resolution. Without this
    // the fog is a half-res bitmap stretched over the whole map on any
    // high-DPI screen, which reads as the *basemap* being blurry — it isn't.
    // Leaflet sizes the tile element in CSS px itself; scaling the context by
    // the same factor lets all the drawing below stay in CSS px.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(tileSize.x * dpr);
    canvas.height = Math.round(tileSize.y * dpr);
    canvas.style.width = `${tileSize.x}px`;
    canvas.style.height = `${tileSize.y}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.scale(dpr, dpr);

    // Fill with fog colour
    ctx.fillStyle = FOG_COLOUR;
    ctx.fillRect(0, 0, tileSize.x, tileSize.y);

    // Punch out explored circles
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'white';

    const { exploredArea, currentRevealCenter, currentRevealRadius } = this._fogProps;

    // Origin of this tile in pixel space at this zoom level
    const tileOrigin = coords.scaleBy(tileSize);

    // Combine explored area with the live reveal circle
    const allCircles: ExploredCircle[] = [
      ...exploredArea,
      {
        lat: currentRevealCenter.lat,
        lng: currentRevealCenter.lng,
        radius: currentRevealRadius,
      },
    ];

    // Access the map instance (protected in TS but available at runtime)
    const map = (this as unknown as { _map: L.Map })._map;

    for (const circle of allCircles) {
      const pixelCoords = map.project(
        L.latLng(circle.lat, circle.lng),
        coords.z,
      );
      const px = pixelCoords.x - tileOrigin.x;
      const py = pixelCoords.y - tileOrigin.y;
      const pixelRadius = metresToPixels(circle.radius, circle.lat, coords.z);

      // Skip circles that don't intersect this tile
      if (
        px + pixelRadius < 0 ||
        px - pixelRadius > tileSize.x ||
        py + pixelRadius < 0 ||
        py - pixelRadius > tileSize.y
      ) {
        continue;
      }

      ctx.beginPath();
      ctx.arc(px, py, pixelRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas;
  },

  setFogProps(this: FogLayer, props: FogOverlayProps) {
    this._fogProps = props;
    this.redraw();
  },
});

function createFogLayer(props: FogOverlayProps, context: LeafletContextInterface) {
  const layer = new (FogGridLayer as unknown as new (options: FogOverlayProps) => FogLayer)(props);
  return createElementObject(layer, context);
}

function updateFogLayer(
  instance: FogLayer,
  props: FogOverlayProps,
  prevProps: FogOverlayProps,
) {
  if (
    props.exploredArea !== prevProps.exploredArea ||
    props.currentRevealCenter !== prevProps.currentRevealCenter ||
    props.currentRevealRadius !== prevProps.currentRevealRadius
  ) {
    instance.setFogProps(props);
  }
}

export const FogOverlay = createLayerComponent<FogLayer, FogOverlayProps>(
  createFogLayer,
  updateFogLayer,
);
