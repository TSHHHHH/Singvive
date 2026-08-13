import { useEffect, useState, type ReactNode } from 'react';
import type { MapPoint } from './GameMap';

/** How wide the bubble wants to be, and how much breathing room it keeps from
 *  the edges of the map before it starts sliding sideways. Deliberately narrow:
 *  it sits on top of the thing the player is looking at, so it has to read as a
 *  note pinned to the map rather than as a second panel. */
const WIDTH = 268;
const MARGIN = 12;
/** Vertical gap between the marker and the tip of the tail. */
const GAP = 14;

/** Reads the CSS chrome inset used on the tab shell (< lg). */
function readBottomChrome(): number {
  if (typeof window === 'undefined') return 0;
  if (window.matchMedia('(min-width: 1024px)').matches) return 0;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--mobile-chrome-bottom')
    .trim();
  if (!raw) return 96;
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;height:${raw}`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px || 96;
}

/**
 * The target card, floated over the map and pointing at the thing it describes.
 * It used to live in the left rail, which meant tapping a building on one side
 * of the screen and reading about it on the other; here the answer appears
 * where the question was asked.
 *
 * `point` is the anchor in map-container pixels, recomputed by the map as it
 * moves. The box slides sideways to stay on screen, and flips below the marker
 * when there isn't room above — but the tail always stays over the anchor, so
 * it never stops being obvious what's being described.
 */
export function MapBubble({
  point,
  title,
  onClose,
  children,
}: {
  point: MapPoint;
  title: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}) {
  const [bottomChrome, setBottomChrome] = useState(0);

  useEffect(() => {
    const update = () => setBottomChrome(readBottomChrome());
    update();
    const mq = window.matchMedia('(min-width: 1024px)');
    mq.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const width = Math.min(WIDTH, point.width - MARGIN * 2);
  const half = width / 2;
  // Clamped so a marker near the edge doesn't push the card off the map.
  const left = Math.max(MARGIN + half, Math.min(point.width - MARGIN - half, point.x));

  const spaceAbove = point.y - GAP - MARGIN;
  const spaceBelow = point.height - point.y - GAP - MARGIN - bottomChrome;
  // Prefer above (speech-bubble default). Flip below only when above is tight
  // and below still has usable room after mobile chrome.
  const above = spaceAbove >= 160 || spaceAbove >= spaceBelow || spaceBelow < 120;
  const maxHeight = Math.max(140, above ? spaceAbove : Math.max(spaceBelow, 120));

  const tailY = above ? point.y - GAP : point.y + GAP;

  return (
    <div className="pointer-events-none absolute inset-0 z-[600]">
      {/* Quiet chrome on purpose. This floats over the map the player is
          reading, so it borrows no accent colour and casts only enough shadow
          to lift off the tiles — the tail, not the frame, is what says "this
          one". The compact type and buttons are scoped to here rather than
          changed in LocationCard, which still has a rail's room to breathe at
          the foot of the timeline. */}
      <div
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border border-white/15 bg-concrete-900/90 shadow-lg backdrop-blur-sm"
        style={{
          left,
          top: tailY,
          width,
          maxHeight,
          transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        }}
      >
        {/* The label rides along the top edge of the content instead of taking
            a bar of its own — the tail already says what's being described. */}
        <div
          className={
            'min-h-0 flex-1 overflow-y-auto p-2 text-white/80 ' +
            '[&_button]:py-1.5 [&_button]:text-xs'
          }
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-2xs font-semibold uppercase tracking-widest text-white/30">
              {title}
            </span>
            {onClose && (
              <button
                onClick={onClose}
                className="-my-1 shrink-0 px-1 text-xs leading-none text-white/25 hover:text-white/60"
              >
                ✕
              </button>
            )}
          </div>
          {children}
        </div>
      </div>

      {/* The tail stays over the marker even when the box has slid away. */}
      <span
        className="absolute h-0 w-0"
        style={{
          left: point.x,
          top: tailY,
          transform: `translate(-50%, ${above ? '-100%' : '0'})`,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          ...(above
            ? { borderTop: '7px solid rgba(255,255,255,0.15)' }
            : { borderBottom: '7px solid rgba(255,255,255,0.15)' }),
        }}
      />
    </div>
  );
}
