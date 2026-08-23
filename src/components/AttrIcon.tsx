import { Icon } from '../icons/Icon';
import {
  ATTRIBUTE_ICONS,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  attrEmoji,
} from '../game/character';
import type { AttributeKey } from '../game/types';
import { useT } from '../i18n';

interface AttrIconProps {
  attr: AttributeKey;
  size?: number;
  className?: string;
  /** Show the full label beside the icon (default: icon only). */
  label?: boolean;
  /** Short 3-letter label instead of the full name. */
  short?: boolean;
}

/**
 * Attribute glyph for panels and choice rows. Same key as the emoji used in
 * plain log text via `attrEmoji` / `withAttrEmojis`.
 */
export function AttrIcon({
  attr,
  size = 14,
  className = '',
  label = false,
  short = false,
}: AttrIconProps) {
  const text = short
    ? ATTRIBUTE_LABELS[attr].slice(0, 3)
    : ATTRIBUTE_LABELS[attr];
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Icon name={ATTRIBUTE_ICONS[attr]} size={size} title={ATTRIBUTE_LABELS[attr]} />
      {label && <span>{text}</span>}
    </span>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type AttrTextPart =
  | { kind: 'text'; value: string }
  | { kind: 'attr'; key: AttributeKey; label: string };

/**
 * Split a blurbs/effect line so React can drop in `<Icon>` next to each
 * attribute name. Logs stay on `withAttrEmojis` — they cannot embed the PNG.
 */
function splitAttrMentions(
  text: string,
  localized: Record<AttributeKey, string>,
): AttrTextPart[] {
  const aliases: { key: AttributeKey; label: string }[] = [];
  const seen = new Set<string>();
  for (const key of ATTRIBUTE_KEYS) {
    for (const label of [ATTRIBUTE_LABELS[key], localized[key]]) {
      if (!label || seen.has(label)) continue;
      seen.add(label);
      aliases.push({ key, label });
    }
  }
  aliases.sort((a, b) => b.label.length - a.label.length);

  const taken = new Uint8Array(text.length);
  const hits: { start: number; end: number; key: AttributeKey; label: string }[] = [];
  for (const { key, label } of aliases) {
    const ascii = /^[\x00-\x7F]+$/.test(label);
    const re = new RegExp(ascii ? `\\b${escapeRegExp(label)}\\b` : escapeRegExp(label), 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + label.length;
      let overlap = false;
      for (let i = start; i < end; i++) {
        if (taken[i]) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
      taken.fill(1, start, end);
      hits.push({ start, end, key, label: text.slice(start, end) });
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const parts: AttrTextPart[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) parts.push({ kind: 'text', value: text.slice(cursor, hit.start) });
    parts.push({ kind: 'attr', key: hit.key, label: hit.label });
    cursor = hit.end;
  }
  if (cursor < text.length) parts.push({ kind: 'text', value: text.slice(cursor) });
  return parts;
}

/**
 * Inline attribute names as the same tinted PNG the rest of the UI uses,
 * instead of the emoji fallback `withAttrEmojis` injects for logs.
 */
export function AttrText({ text }: { text: string }) {
  const { t } = useT();
  const localized = Object.fromEntries(
    ATTRIBUTE_KEYS.map((k) => [k, t(`ui.attributes.${k}`)]),
  ) as Record<AttributeKey, string>;
  const parts = splitAttrMentions(text, localized);
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'text' ? (
          <span key={i}>{p.value}</span>
        ) : (
          <span key={`${p.key}-${i}`} className="inline-flex items-center gap-0.5 whitespace-nowrap">
            <Icon name={ATTRIBUTE_ICONS[p.key]} title={p.label} />
            {p.label}
          </span>
        ),
      )}
    </>
  );
}

/** For callers that only need the emoji string (pushLog, map markup). */
export { attrEmoji };
