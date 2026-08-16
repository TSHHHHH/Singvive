import type { CSSProperties } from 'react';
import type { IconName } from './keys';
import { resolveIcon } from './registry';

interface Props {
  name: IconName;
  /** Rendered size in px — defaults to the surrounding font size. */
  size?: number;
  className?: string;
  /** Accessible label; omit for icons that only decorate labelled text. */
  title?: string;
}

/**
 * Renders an icon by key. A tinted asset is drawn through a CSS mask so it
 * inherits `currentColor` — the same icon comes out white on a panel, black on
 * a filled button and red when something is bleeding. Keys with no asset yet
 * fall back to their emoji, so the UI is never blank mid-migration.
 */
export function Icon({ name, size, className = '', title }: Props) {
  const icon = resolveIcon(name);
  const box: CSSProperties = size ? { width: size, height: size } : { width: '1em', height: '1em' };

  if (icon.kind === 'emoji') {
    // Same fixed box as assets — emoji ink often paints past its advance
    // width and will sit on neighbouring text without a clip.
    return (
      <span
        className={`inline-flex items-center justify-center overflow-hidden text-center leading-none ${className}`}
        style={{ ...box, fontSize: size ?? '1em' }}
        role={title ? 'img' : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
      >
        {icon.emoji}
      </span>
    );
  }

  const { src, tint } = icon.asset!;

  if (!tint) {
    return (
      <img
        src={src}
        alt={title ?? ''}
        aria-hidden={title ? undefined : true}
        className={`inline-block object-contain align-[-0.125em] ${className}`}
        style={box}
      />
    );
  }

  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`inline-block shrink-0 align-[-0.125em] ${className}`}
      style={{
        ...box,
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}
