import { EMOJI_FALLBACK, type IconName } from './keys';

/**
 * The one place that knows what an icon key resolves to on disk.
 *
 * To add an asset: drop the file in `src/assets/icons/`, import it here, and
 * point the key at it. Nothing else in the codebase changes — call sites only
 * ever name the key. Anything left unmapped keeps rendering its emoji, so the
 * set can be migrated a few icons at a time.
 */

export interface IconAsset {
  /** Bundled URL — Vite fingerprints and caches it. */
  src: string;
  /**
   * true  → drawn through a CSS mask, so the glyph takes its colour from
   *         `currentColor` (white on panels, red when bleeding, and so on).
   *         Wants a monochrome silhouette on transparency.
   * false → drawn as a plain image, exactly as authored. For anything with
   *         its own colours that shouldn't be flattened.
   */
  tint: boolean;
}

// Assets are picked up automatically from src/assets/icons/<key>.png — the file
// name is the icon key with dots swapped for dashes, e.g.
//   src/assets/icons/poi-supermarket.png  →  'poi.supermarket'
//   src/assets/icons/action-sleep.png     →  'action.sleep'
// Drop a file in with that name and it appears in game on the next reload; no
// import statement, no edit to this file.
const discovered = import.meta.glob('../assets/icons/*.{png,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Icons that must NOT be tinted — listed by key. Everything else is masked. */
const UNTINTED = new Set<IconName>([]);

function keyFromPath(path: string): IconName {
  const file = path.split('/').pop() ?? '';
  return file.replace(/\.(png|webp|svg)$/, '').replace(/-/g, '.') as IconName;
}

export const ICON_ASSETS: Partial<Record<IconName, IconAsset>> = Object.fromEntries(
  Object.entries(discovered).map(([path, src]) => {
    const key = keyFromPath(path);
    return [key, { src, tint: !UNTINTED.has(key) } satisfies IconAsset];
  }),
);

/**
 * Explicit overrides — use this for anything the file-name convention can't
 * express (a shared file behind two keys, an untinted colour illustration):
 *
 *   import shieldPng from '../assets/icons/shield.png';
 *   Object.assign(ICON_ASSETS, {
 *     'stance.guarded': { src: shieldPng, tint: true },
 *   });
 */

export interface ResolvedIcon {
  kind: 'asset' | 'emoji';
  asset?: IconAsset;
  emoji: string;
}

export function resolveIcon(name: IconName): ResolvedIcon {
  const asset = ICON_ASSETS[name];
  const emoji = EMOJI_FALLBACK[name] ?? '·';
  return asset ? { kind: 'asset', asset, emoji } : { kind: 'emoji', emoji };
}

/** Which keys still need art — handy in the console while migrating. */
export function missingIcons(): IconName[] {
  return (Object.keys(EMOJI_FALLBACK) as IconName[]).filter((k) => !ICON_ASSETS[k]);
}
