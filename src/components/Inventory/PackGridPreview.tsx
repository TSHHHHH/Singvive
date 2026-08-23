import { blockedSet, packCellKey } from '../../game/packGrid';
import type { PackGrid } from '../../game/types';

const CELL_MAX = 11;
const CELL_MIN = 5;
const PREVIEW_MAX_W = 168;
const PREVIEW_MAX_H = 72;

function cellPx(grid: PackGrid): number {
  return Math.max(
    CELL_MIN,
    Math.min(
      CELL_MAX,
      Math.floor(PREVIEW_MAX_W / grid.w),
      Math.floor(PREVIEW_MAX_H / grid.h),
    ),
  );
}

/** Miniature pack silhouette (usable cells vs holes) for inspect / hover. */
export function PackGridPreview({
  grid,
  label,
}: {
  grid: PackGrid;
  label: string;
}) {
  const blocked = blockedSet(grid);
  const size = cellPx(grid);

  return (
    <div
      role="img"
      aria-label={label}
      className="inline-grid overflow-hidden rounded border border-white/15 bg-black/40"
      style={{
        gridTemplateColumns: `repeat(${grid.w}, ${size}px)`,
        gridTemplateRows: `repeat(${grid.h}, ${size}px)`,
      }}
    >
      {Array.from({ length: grid.w * grid.h }, (_, i) => {
        const x = i % grid.w;
        const y = Math.floor(i / grid.w);
        const hole = blocked.has(packCellKey(x, y));
        return (
          <div
            key={packCellKey(x, y)}
            className={`border border-white/10 ${hole ? 'bg-black/55' : 'bg-signal/35'}`}
            style={
              hole
                ? {
                    backgroundImage:
                      'repeating-linear-gradient(-45deg, transparent, transparent 2px, #ffffff14 2px, #ffffff14 3px)',
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
