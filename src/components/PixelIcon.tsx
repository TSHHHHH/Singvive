import { useEffect, useRef } from 'react';
import type { IconName } from '../icons/keys';
import { resolveIcon } from '../icons/registry';

/**
 * Pixel grid sizes the icon steps through as `progress` goes 0 → 1. The
 * canvas is only redrawn when the step changes (≈9 times per find), never
 * per frame, and is upscaled by the GPU with `image-rendering: pixelated`.
 */
const STEPS = [3, 4, 5, 6, 8, 10, 13, 16, 22] as const;
/** Intermediate size for downsampling, so tiny steps average instead of alias. */
const MID = 32;

export function pixelStep(progress: number): number {
  const i = Math.min(STEPS.length - 1, Math.max(0, Math.floor(progress * STEPS.length)));
  return STEPS[i];
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

/** Paint the icon (image, tinted silhouette or emoji) into a MID×MID canvas. */
async function paintSource(name: IconName, color: string): Promise<HTMLCanvasElement> {
  const icon = resolveIcon(name);
  const c = document.createElement('canvas');
  c.width = MID;
  c.height = MID;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  if (icon.kind === 'asset' && icon.asset) {
    const img = await loadImage(icon.asset.src);
    // object-contain into the square
    const s = Math.min(MID / img.naturalWidth, MID / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (MID - w) / 2, (MID - h) / 2, w, h);
    if (icon.asset.tint) {
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, MID, MID);
    }
  } else {
    ctx.font = `${MID * 0.85}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon.emoji, MID / 2, MID / 2 + 1);
  }
  return c;
}

const sourceCache = new Map<string, Promise<HTMLCanvasElement>>();

/**
 * An item icon drawn as a coarse pixel mosaic that gets finer with
 * `progress`. Used for unrevealed rows in the live loot list.
 */
export function PixelIcon({
  name,
  size,
  progress,
}: {
  name: IconName;
  size: number;
  progress: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const step = pixelStep(progress);

  useEffect(() => {
    let cancelled = false;
    const key = name;
    let src = sourceCache.get(key);
    if (!src) {
      src = paintSource(name, '#f5f5f4');
      sourceCache.set(key, src);
    }
    src
      .then((source) => {
        const canvas = ref.current;
        if (cancelled || !canvas) return;
        canvas.width = step;
        canvas.height = step;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, step, step);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, 0, 0, step, step);
      })
      .catch(() => {
        sourceCache.delete(key);
      });
    return () => {
      cancelled = true;
    };
  }, [name, step]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      width={step}
      height={step}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    />
  );
}
