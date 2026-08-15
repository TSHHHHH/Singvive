import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ItemDef } from '../game/types';
import type { SearchHighlight } from '../game/searchSession';
import { Icon } from '../icons/Icon';
import { itemIcon } from './Inventory/itemIcon';

const BURST_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

const HIGHLIGHT_RING: Record<SearchHighlight, string> = {
  exotic: 'ring-2 ring-amber-300',
  pristine: 'ring-2 ring-signal',
  scarce: 'ring-2 ring-white/70',
};

const BURST_COLOR: Record<SearchHighlight, string> = {
  exotic: '#fcd34d',
  pristine: '#8fbf4b',
  scarce: '#f5f5f4',
};

export function highlightRingClass(
  highlight: SearchHighlight | null | undefined,
  opts?: { pulse?: boolean; hover?: boolean; exoticIdle?: boolean },
): string {
  if (highlight) {
    const pulse = opts?.pulse === false ? '' : ' search-find-pulse';
    return `${HIGHLIGHT_RING[highlight]}${pulse}`;
  }
  if (opts?.hover) return 'ring-2 ring-white/50';
  if (opts?.exoticIdle) return 'ring-1 ring-amber-300/50';
  return 'ring-1 ring-black/40';
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
  title?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  /** When false, show settled ring without pulse/burst. */
  animate?: boolean;
  /** Keep animations even when OS prefers reduced motion (loot editor). */
  forceMotion?: boolean;
  as?: 'button' | 'div';
};

function CellShell({
  as,
  className,
  style,
  title,
  onClick,
  onMouseEnter,
  onFocus,
  children,
}: {
  as: 'button' | 'div';
  className: string;
  style: CSSProperties;
  title?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  children: ReactNode;
}) {
  if (as === 'div') {
    return (
      <div className={className} style={style} title={title}>
        {children}
      </div>
    );
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      className={className}
      style={style}
    >
      {children}
    </button>
  );
}

/**
 * Shared found-cell chrome for live search and the loot-editor reveal preview.
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
  title,
  onClick,
  onMouseEnter,
  onFocus,
  animate = true,
  forceMotion = false,
  as = 'button',
}: Props) {
  const condPct =
    condition !== undefined ? Math.max(0, Math.min(100, Math.round(condition))) : null;
  const play = animate && highlight != null;
  const pulseRef = useRef<HTMLSpanElement>(null);
  const [runId, setRunId] = useState(0);

  // Hard-restart CSS animations whenever playKey changes (Replay / first reveal).
  useLayoutEffect(() => {
    if (!play) return;
    const el = pulseRef.current;
    if (el) {
      el.classList.remove('search-find-pulse');
      // Force reflow so the next add restarts the animation.
      void el.offsetWidth;
      el.classList.add('search-find-pulse');
    }
    setRunId((n) => n + 1);
  }, [playKey, play, highlight]);

  const settledRing = highlightRingClass(highlight, {
    pulse: false,
    exoticIdle: !!def.exotic,
  });
  const playRing = highlight ? HIGHLIGHT_RING[highlight] : '';

  return (
    <CellShell
      as={as}
      title={title}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      className={`relative flex flex-col items-center justify-center overflow-visible rounded text-center ${settledRing} ${
        forceMotion ? 'search-find-fx--force-motion' : ''
      } ${className}`}
      style={{
        background: `${def.color}66`,
        boxShadow: `inset 0 0 0 1px ${def.color}`,
        ...style,
      }}
    >
      <span
        ref={pulseRef}
        className={`relative flex h-full w-full flex-col items-center justify-center rounded ${
          play ? playRing : ''
        }`}
      >
        {play && highlight ? <FindBurst highlight={highlight} runId={runId} /> : null}
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
                background: '#8fbf4b',
              }}
            />
          </span>
        )}
      </span>
    </CellShell>
  );
}
