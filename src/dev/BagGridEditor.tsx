import type { PackGrid } from '../game/types';
import { packCellKey, packGridUsableCount } from '../game/packGrid';

const CELL = 22;
const MAX_EDGE = 16;

function clipBlocked(w: number, h: number, blocked: [number, number][] | undefined): PackGrid {
  const next = (blocked ?? []).filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h);
  return next.length ? { w, h, blocked: next } : { w, h };
}

type Props = {
  grid: PackGrid;
  onChange: (next: PackGrid) => void;
};

export function BagGridEditor({ grid, onChange }: Props) {
  const blocked = new Set((grid.blocked ?? []).map(([x, y]) => packCellKey(x, y)));
  const usable = packGridUsableCount(grid);
  const total = grid.w * grid.h;

  const toggle = (x: number, y: number) => {
    const key = packCellKey(x, y);
    const next: [number, number][] = [];
    for (const cell of grid.blocked ?? []) {
      if (packCellKey(cell[0], cell[1]) !== key) next.push(cell);
    }
    if (!blocked.has(key)) next.push([x, y]);
    if (next.length >= total) return;
    onChange(clipBlocked(grid.w, grid.h, next));
  };

  const setEdge = (axis: 'w' | 'h', raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(1, Math.min(MAX_EDGE, Math.round(n)));
    const w = axis === 'w' ? clamped : grid.w;
    const h = axis === 'h' ? clamped : grid.h;
    const next = clipBlocked(w, h, grid.blocked);
    if (packGridUsableCount(next) < 1) return;
    onChange(next);
  };

  return (
    <div className="rounded border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <h5 className="text-2xs uppercase tracking-widest text-white/30">Pack grid</h5>
        <span className="text-2xs tabular-nums text-white/45">
          {usable}/{total} cells
        </span>
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="uppercase tracking-wider text-white/35">w</span>
          <input
            type="number"
            min={1}
            max={MAX_EDGE}
            className="w-16 rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-signal/50"
            value={grid.w}
            onChange={(e) => setEdge('w', e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="uppercase tracking-wider text-white/35">h</span>
          <input
            type="number"
            min={1}
            max={MAX_EDGE}
            className="w-16 rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-signal/50"
            value={grid.h}
            onChange={(e) => setEdge('h', e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded border border-white/15 px-2 py-1.5 text-2xs text-white/70 transition hover:border-signal/40 hover:text-signal"
          onClick={() => onChange({ w: grid.w, h: grid.h })}
        >
          Fill / clear holes
        </button>
      </div>
      <div
        className="inline-grid touch-none select-none rounded border border-white/10 bg-black/40"
        style={{
          gridTemplateColumns: `repeat(${grid.w}, ${CELL}px)`,
          gridTemplateRows: `repeat(${grid.h}, ${CELL}px)`,
        }}
      >
        {Array.from({ length: total }, (_, i) => {
          const x = i % grid.w;
          const y = Math.floor(i / grid.w);
          const hole = blocked.has(packCellKey(x, y));
          return (
            <button
              key={packCellKey(x, y)}
              type="button"
              title={hole ? `Blocked ${x},${y}` : `Usable ${x},${y}`}
              className={`border border-white/10 ${
                hole
                  ? 'bg-black/70 hover:bg-black/50'
                  : 'bg-signal/25 hover:bg-signal/40'
              }`}
              style={
                hole
                  ? {
                      backgroundImage:
                        'repeating-linear-gradient(-45deg, transparent, transparent 3px, #ffffff14 3px, #ffffff14 4px)',
                    }
                  : undefined
              }
              onClick={() => toggle(x, y)}
            />
          );
        })}
      </div>
      <p className="mt-2 text-2xs text-white/30">
        Click a cell to punch or restore a hole. This is the full pack silhouette while the bag is
        equipped.
      </p>
    </div>
  );
}
