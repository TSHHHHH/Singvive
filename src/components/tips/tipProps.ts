import type { Placement } from './clamp';

export interface TipAttrs {
  'data-tip'?: string;
  'data-tip-placement'?: Placement;
  'data-tip-follow'?: string;
  'aria-label'?: string;
}

export interface TipOpts {
  /** Preferred side of the anchor. Flips automatically when short on room. Default 'bottom'. */
  placement?: Placement;
  /** Trail the cursor — for large surfaces like dungeon cells and map tiles. */
  follow?: boolean;
  /** Anchor has no visible text (icon-only button): also emit an aria-label. */
  label?: boolean;
}

const NONE: TipAttrs = Object.freeze({});

/**
 * Spread onto any DOM element to give it the in-game hover tip:
 * `<span {...tip('Damage per hit')}>`. Replaces native `title`.
 *
 * A pure function, not a hook, so it works inside `.map()` and helpers. Fine
 * pointers hover and coarse pointers long-press inside <TipLayer />, never at
 * the call site.
 * Falsy text yields no attributes, so `tip(cond ? s : undefined)` is fine.
 */
export function tip(text?: string | null, o: TipOpts = {}): TipAttrs {
  if (!text) return NONE;
  return {
    'data-tip': text,
    ...(o.placement ? { 'data-tip-placement': o.placement } : null),
    ...(o.follow ? { 'data-tip-follow': '1' } : null),
    ...(o.label ? { 'aria-label': text } : null),
  };
}
