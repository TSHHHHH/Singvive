import { Icon } from '../icons/Icon';
import {
  ATTRIBUTE_ICONS,
  ATTRIBUTE_LABELS,
  attrEmoji,
} from '../game/character';
import type { AttributeKey } from '../game/types';

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

/** For callers that only need the emoji string (pushLog, map markup). */
export { attrEmoji };
