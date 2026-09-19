/**
 * The one type scale.
 *
 * Every font-size, line-height, letter-spacing and weight in the app resolves
 * here — the Tailwind roles (`text-body`, `text-label`, …), the plain CSS in
 * index.css (via the generated custom properties), and the imperative Leaflet
 * label builders that hand-write style strings. One file to edit, nothing to
 * keep in sync.
 *
 * Sizes are rem, never px, so the player's Font size setting
 * (src/game/settings.ts -> src/App.tsx sets the root px) actually reaches them.
 * A px value here is a value that silently opts out of that setting.
 *
 * Four reading sizes, two of which have a signage twin (wide-tracked, heavier,
 * meant to be paired with `uppercase`), plus two display steps:
 *
 *   micro / label     10px   readouts        / small caps
 *   body  / plate     12px   the workhorse   / section kicker
 *   read              14px   buttons, inputs, emphasised rows
 *   title             18px   modal + panel headings, hero numerics
 *   marquee           30px   clock, death stat, SIGNAL LOST
 *   banner            48px   the wordmark
 *
 * Weights are limited to 400/600/700 — that is the exact set index.html loads
 * Noto Sans SC at, and anything else gets synthesised into mud on Han glyphs.
 */

export type TypeRole =
  | 'micro'
  | 'label'
  | 'body'
  | 'plate'
  | 'read'
  | 'title'
  | 'marquee'
  | 'banner';

export interface TypeSpec {
  /** rem. Never px — see the note above. */
  size: string;
  lineHeight: string;
  letterSpacing?: string;
  fontWeight?: string;
}

export const TYPE: Record<TypeRole, TypeSpec> = {
  micro: { size: '0.625rem', lineHeight: '1.4' },
  label: { size: '0.625rem', lineHeight: '1.2', letterSpacing: '0.12em', fontWeight: '600' },
  body: { size: '0.75rem', lineHeight: '1.4' },
  plate: { size: '0.75rem', lineHeight: '1.25', letterSpacing: '0.12em', fontWeight: '700' },
  read: { size: '0.875rem', lineHeight: '1.35' },
  title: { size: '1.125rem', lineHeight: '1.3', fontWeight: '700' },
  marquee: { size: '1.875rem', lineHeight: '1', letterSpacing: '-0.01em', fontWeight: '700' },
  banner: { size: '3rem', lineHeight: '0.95', letterSpacing: '-0.02em', fontWeight: '700' },
};

export const TYPE_ROLES = Object.keys(TYPE) as TypeRole[];

/**
 * The single font stack. Latin lands on the OS monospace face; Han glyphs fall
 * through to Noto Sans SC. Both `body` and Tailwind's `font-mono` are emitted
 * from this, so there is no way for the two to drift apart again.
 */
export const FONT_STACK_MONO = [
  'ui-monospace',
  'SFMono-Regular',
  'Menlo',
  'Consolas',
  "'Noto Sans SC'",
  "'Microsoft YaHei'",
  "'PingFang SC'",
  "'Segoe UI'",
  'monospace',
];

/** `theme.fontSize` for tailwind.config.ts. */
export function tailwindFontSize(): Record<string, [string, Record<string, string>]> {
  const out: Record<string, [string, Record<string, string>]> = {};
  for (const role of TYPE_ROLES) {
    const spec = TYPE[role];
    const opts: Record<string, string> = { lineHeight: spec.lineHeight };
    if (spec.letterSpacing) opts.letterSpacing = spec.letterSpacing;
    if (spec.fontWeight) opts.fontWeight = spec.fontWeight;
    out[role] = [spec.size, opts];
  }
  return out;
}

/** `:root` custom properties, so index.css can reach the scale too. */
export function typeVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of TYPE_ROLES) {
    const spec = TYPE[role];
    out[`--type-${role}-size`] = spec.size;
    out[`--type-${role}-leading`] = spec.lineHeight;
    if (spec.letterSpacing) out[`--type-${role}-tracking`] = spec.letterSpacing;
    if (spec.fontWeight) out[`--type-${role}-weight`] = spec.fontWeight;
  }
  return out;
}

/**
 * A CSS declaration string for the imperative label builders — Leaflet
 * divIcons and the town wash, which assemble HTML by hand and so can't wear a
 * Tailwind class.
 *
 * `scale` shrinks the role for a denser map zoom without inventing a new step;
 * it stays a multiple of the role, so it still tracks the Font size setting.
 */
export function typeCss(role: TypeRole, opts: { scale?: number } = {}): string {
  const spec = TYPE[role];
  const size =
    opts.scale != null && opts.scale !== 1 ? `calc(${spec.size} * ${opts.scale})` : spec.size;
  const parts = [`font-size:${size}`, `line-height:${spec.lineHeight}`];
  if (spec.letterSpacing) parts.push(`letter-spacing:${spec.letterSpacing}`);
  if (spec.fontWeight) parts.push(`font-weight:${spec.fontWeight}`);
  return parts.join(';') + ';';
}
