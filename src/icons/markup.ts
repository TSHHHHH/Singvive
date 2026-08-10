import type { IconName } from './keys';
import { resolveIcon } from './registry';

/**
 * The same icon, as an HTML string — Leaflet's `divIcon` takes markup, not
 * React. Tinted assets still mask against `color`, so map pins pick up the
 * danger palette exactly like the panels do.
 */
export function iconMarkup(
  name: IconName,
  opts: { size?: number; color?: string } = {},
): string {
  const { size = 16, color = 'currentColor' } = opts;
  const icon = resolveIcon(name);

  if (icon.kind === 'emoji') {
    return `<span style="font-size:${size}px;line-height:1">${icon.emoji}</span>`;
  }

  const { src, tint } = icon.asset!;
  if (!tint) {
    return `<img src="${src}" style="width:${size}px;height:${size}px;object-fit:contain" alt="">`;
  }

  return `<span style="
    display:inline-block;width:${size}px;height:${size}px;
    background-color:${color};
    -webkit-mask-image:url(${src});mask-image:url(${src});
    -webkit-mask-size:contain;mask-size:contain;
    -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
    -webkit-mask-position:center;mask-position:center;
  "></span>`;
}
