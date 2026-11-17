import type { CSSProperties } from 'react';
import { Icon } from '../icons/Icon';
import type { GuideCallout } from './types';

/**
 * One call-out, anchored over the map or docked in the caption. The `reveal`
 * variant runs the emphasis pop (stamp in, glint, letter-spaced eyebrow);
 * `note` only fades. All motion is CSS on transform / opacity.
 */
export function GuideCalloutCard({ callout, docked = false }: { callout: GuideCallout; docked?: boolean }) {
  const accent = callout.accent ?? '#2bc4d9';
  const style = { '--guide-accent': accent } as CSSProperties;
  return (
    <div
      className={`guide-card ${callout.variant === 'reveal' ? 'guide-card-reveal' : 'guide-card-note'}${docked ? ' guide-card-docked' : ''}`}
      style={style}
      data-guide-callout={callout.variant}
    >
      {callout.variant === 'reveal' && <div className="guide-card-glint" aria-hidden />}
      <div className="flex items-start gap-2.5">
        {callout.icon && (
          <div className="guide-card-icon" aria-hidden>
            <Icon name={callout.icon} size={22} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {callout.eyebrow && <div className="guide-card-eyebrow text-label uppercase">{callout.eyebrow}</div>}
          <div className="break-words text-read font-semibold text-concrete-50">{callout.title}</div>
          {callout.meta && <div className="mt-0.5 text-body text-concrete-300">{callout.meta}</div>}
          {callout.body && <p className="mt-1 text-body text-concrete-200">{callout.body}</p>}
        </div>
      </div>
    </div>
  );
}
