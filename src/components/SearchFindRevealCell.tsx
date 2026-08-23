import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type React from 'react';
import type { ItemDef } from '../game/types';
import type { SearchHighlight } from '../game/searchSession';
import { conditionBarColor, tileColor } from '../game/itemTileColor';
import { Icon } from '../icons/Icon';
import { itemIcon } from './Inventory/itemIcon';
import { tip } from './tips';

const BURST_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;
const BURST_MS = 1000;

/** Outer-ring colors as box-shadow — must compose with the inset tile edge. */
const HIGHLIGHT_RING_SHADOW: Record<SearchHighlight, string> = {
  exotic: '0 0 0 2px #fcd34d',
  pristine: '0 0 0 2px #e8e5dd',
  scarce: '0 0 0 2px rgba(245,245,244,0.7)',
};

const BURST_COLOR: Record<SearchHighlight, string> = {
  exotic: '#fcd34d',
  pristine: '#8fbf4b',
  scarce: '#f5f5f4',
};

function cellBoxShadow(
  def: ItemDef,
  highlight: SearchHighlight | null | undefined,
): string {
  const hex = tileColor(def);
  const inset = `inset 0 0 0 1px ${hex}`;
  if (highlight) return `${inset}, ${HIGHLIGHT_RING_SHADOW[highlight]}`;
  if (def.exotic) return `${inset}, 0 0 0 1px rgba(252,211,77,0.5)`;
  return `${inset}, 0 0 0 1px rgba(0,0,0,0.4)`;
}

function FindBurst({ highlight, runId }: { highlight: SearchHighlight; runId: number }) {
  const angles = highlight === 'exotic' ? BURST_ANGLES : BURST_ANGLES.slice(0, 6);
  return (
    <span
      key={runId}
      className={`search-find-burst${highlight === 'exotic' ? ' search-find-burst--exotic' : ''}`}
      style={{ ['--burst-color' as string]: BURST_COLOR[highlight] }}
      aria-hidden
    >
      {angles.map((rot, i) => (
        <span
          key={rot}
          className="search-find-burst-arm"
          style={{ ['--burst-rot' as string]: `${rot}deg` }}
        >
          <span
            className="search-find-burst-shard"
            style={{ ['--burst-delay' as string]: `${i * 30}ms` }}
          />
        </span>
      ))}
    </span>
  );
}

type Props = {
  def: ItemDef;
  count?: number;
  condition?: number;
  highlight?: SearchHighlight | null;
  /** Bump to replay beat + burst. */
  playKey?: string | number;
  iconSize?: number;
  className?: string;
  style?: CSSProperties;
  tip?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onPointerEnter?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onFocus?: () => void;
  /** When false, show settled ring without pulse/burst. */
  animate?: boolean;
  /**
   * Play the one-shot reveal FX even when OS prefers reduced motion.
   * Live search + loot editor both pass true — this cue is gameplay feedback.
   */
  forceMotion?: boolean;
  as?: 'button' | 'div';
};

/**
 * Shared found-cell chrome for live search and the loot-editor reveal preview.
 *
 * Outer shell is always a `div`: `<button>` clips overflow in Chromium even with
 * `overflow: visible`, which ate the star burst. The interactive control is an
 * inner full-size button when `as="button"`.
 */
export function SearchFindRevealCell({
  def,
  count = 1,
  condition,
  highlight = null,
  playKey = 0,
  iconSize = 14,
  className = '',
  style,
  tip: tipText,
  onClick,
  onMouseEnter,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onFocus,
  animate = true,
  forceMotion = false,
  as = 'button',
}: Props) {
  const condPct =
    condition !== undefined ? Math.max(0, Math.min(100, Math.round(condition))) : null;
  const play = animate && highlight != null;
  const [runId, setRunId] = useState(0);
  const [bursting, setBursting] = useState(false);
  const clearRef = useRef(0);

  useLayoutEffect(() => {
    window.clearTimeout(clearRef.current);
    if (!play || !highlight) {
      setBursting(false);
      return;
    }
    setRunId((n) => n + 1);
    setBursting(true);
    clearRef.current = window.setTimeout(() => setBursting(false), BURST_MS);
    return () => window.clearTimeout(clearRef.current);
  }, [playKey, play, highlight]);

  const { boxShadow: _ignoredShadow, ...restStyle } = style ?? {};
  void _ignoredShadow;

  const faceClass = `relative z-[1] flex h-full w-full flex-col items-center justify-center rounded ${
    bursting ? 'search-find-pulse' : ''
  }`;

  const face: ReactNode = (
    <>
      <Icon name={itemIcon(def)} size={iconSize} className="relative z-[1] drop-shadow" />
      {count > 1 && (
        <span className="absolute bottom-0 right-0 z-[1] rounded-tl bg-black/60 px-0.5 text-2xs font-black leading-tight text-white">
          ×{count}
        </span>
      )}
      {condPct != null && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[2px] bg-black/50">
          <span
            className="block h-full"
            style={{
              width: `${condPct}%`,
              background: conditionBarColor(condPct),
            }}
          />
        </span>
      )}
    </>
  );

  return (
    <div
      // Callers pass `absolute` + footprint; do not add `relative` here (Tailwind order clash).
      className={`search-find-cell overflow-visible rounded text-center ${
        forceMotion ? 'search-find-fx--force-motion' : ''
      } ${className}`}
      style={{
        background: `${tileColor(def)}66`,
        boxShadow: cellBoxShadow(def, highlight),
        ...restStyle,
      }}
      {...tip(as === 'div' ? tipText : undefined)}
    >
      {bursting && highlight ? <FindBurst highlight={highlight} runId={runId} /> : null}
      {as === 'button' ? (
        <button
          type="button"
          {...tip(tipText)}
          onClick={onClick}
          onMouseEnter={onMouseEnter}
          onPointerEnter={onPointerEnter}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onFocus={onFocus}
          className={`absolute inset-0 ${faceClass}`}
        >
          {face}
        </button>
      ) : (
        <div className={faceClass}>{face}</div>
      )}
    </div>
  );
}
