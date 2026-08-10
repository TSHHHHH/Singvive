import type { Container, ItemInstance } from '../../game/types';
import { itemDef } from '../../game/loot';
import { dimsFor, footprint } from '../../game/inventory';
import { itemGlyph } from './itemGlyph';

export const CELL = 34;

export interface DragPreview {
  grid: Container;
  cellX: number;
  cellY: number;
  w: number;
  h: number;
  valid: boolean;
}

interface Props {
  grid: Container;
  title: string;
  items: ItemInstance[];
  selectedUid: string | null;
  draggingUid: string | null;
  preview: DragPreview | null;
  gridRef: (el: HTMLDivElement | null) => void;
  onItemPointerDown: (e: React.PointerEvent, inst: ItemInstance) => void;
}

/** Presentational Tetris grid. Drag state is owned by the parent panel so
 *  items can be dragged across multiple grids. */
export function InventoryGrid({
  grid,
  title,
  items,
  selectedUid,
  draggingUid,
  preview,
  gridRef,
  onItemPointerDown,
}: Props) {
  const dims = dimsFor(grid);
  const cells = items.filter((i) => i.container === grid);
  const showPreview = preview && preview.grid === grid;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-widest text-white/40">
        <span>{title}</span>
        <span>
          {dims.w}×{dims.h}
        </span>
      </div>
      <div
        ref={gridRef}
        data-grid={grid}
        className="relative touch-none select-none rounded border border-white/10 bg-black/40"
        style={{
          width: dims.w * CELL,
          height: dims.h * CELL,
          backgroundImage:
            'linear-gradient(#ffffff10 1px, transparent 1px), linear-gradient(90deg, #ffffff10 1px, transparent 1px)',
          backgroundSize: `${CELL}px ${CELL}px`,
        }}
      >
        {showPreview && (
          <div
            className="pointer-events-none absolute z-20 rounded"
            style={{
              left: preview!.cellX * CELL,
              top: preview!.cellY * CELL,
              width: preview!.w * CELL - 2,
              height: preview!.h * CELL - 2,
              background: preview!.valid ? '#6b8e2355' : '#c0392b55',
              border: `2px dashed ${preview!.valid ? '#8fbf4b' : '#e0342b'}`,
            }}
          />
        )}

        {cells.map((inst) => {
          const def = itemDef(inst.defId);
          const { w, h } = footprint(def, inst.rotated);
          const isDragging = draggingUid === inst.uid;
          const selected = selectedUid === inst.uid;
          return (
            <div
              key={inst.uid}
              onPointerDown={(e) => onItemPointerDown(e, inst)}
              className={`absolute flex cursor-grab flex-col items-center justify-center rounded text-center active:cursor-grabbing ${
                selected ? 'ring-2 ring-signal' : 'ring-1 ring-black/40'
              }`}
              style={{
                left: inst.x * CELL + 1,
                top: inst.y * CELL + 1,
                width: w * CELL - 2,
                height: h * CELL - 2,
                background: def.color,
                opacity: isDragging ? 0.25 : 1,
                zIndex: selected ? 10 : 5,
              }}
              title={def.name}
            >
              <span
                className="leading-none drop-shadow"
                style={{ fontSize: Math.min(w, h) > 1 ? 26 : 18 }}
              >
                {itemGlyph(def)}
              </span>
              {def.stackable && inst.stack > 1 && (
                <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[10px] font-black leading-tight text-white">
                  ×{inst.stack}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
