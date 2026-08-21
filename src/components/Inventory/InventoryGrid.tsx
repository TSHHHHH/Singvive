import type { Container, ItemInstance } from '../../game/types';
import { itemDef } from '../../game/loot';
import {
  conditionPct,
  dimsFor,
  footprint,
  hasCondition,
  isBroken,
  blockedCellsFor,
} from '../../game/inventory';
import { conditionBarColor, tileColor } from '../../game/itemTileColor';
import { packCellKey } from '../../game/packGrid';
import { Icon } from '../../icons/Icon';
import { itemName, useLocale } from '../../i18n';
import { itemIcon } from './itemIcon';
import type { ReactNode } from 'react';

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
  /** Optional control next to the title (e.g. `?` tip for PC shortcuts). */
  titleAccessory?: ReactNode;
  items: ItemInstance[];
  selectedUid: string | null;
  draggingUid: string | null;
  preview: DragPreview | null;
  gridRef: (el: HTMLDivElement | null) => void;
  onItemPointerDown: (e: React.PointerEvent, inst: ItemInstance) => void;
  onItemDoubleClick?: (inst: ItemInstance) => void;
  onItemContextMenu?: (e: React.MouseEvent, inst: ItemInstance) => void;
  onItemPointerEnter?: (e: React.PointerEvent, inst: ItemInstance) => void;
  onItemPointerLeave?: (inst: ItemInstance) => void;
  onItemPointerMove?: (e: React.PointerEvent, inst: ItemInstance) => void;
  /** Hide native browser tooltips when a custom hover card is active. */
  suppressNativeTitle?: boolean;
}

/** Presentational Tetris grid. Drag state is owned by the parent panel so
 *  items can be dragged across multiple grids. */
export function InventoryGrid({
  grid,
  title,
  titleAccessory,
  items,
  selectedUid,
  draggingUid,
  preview,
  gridRef,
  onItemPointerDown,
  onItemDoubleClick,
  onItemContextMenu,
  onItemPointerEnter,
  onItemPointerLeave,
  onItemPointerMove,
  suppressNativeTitle = false,
}: Props) {
  const locale = useLocale();
  const dims = dimsFor(grid);
  const cells = items.filter((i) => i.container === grid);
  const showPreview = preview && preview.grid === grid;
  const blocked = blockedCellsFor(grid);
  const holes: { x: number; y: number }[] = [];
  if (blocked.size > 0) {
    for (let y = 0; y < dims.h; y++) {
      for (let x = 0; x < dims.w; x++) {
        if (blocked.has(packCellKey(x, y))) holes.push({ x, y });
      }
    }
  }
  const usable = dims.w * dims.h - holes.length;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-widest text-white/40">
        <span className="inline-flex items-center gap-1.5">
          <span>{title}</span>
          {titleAccessory}
        </span>
        <span>
          {holes.length > 0 ? `${usable} cells · ${dims.w}×${dims.h}` : `${dims.w}×${dims.h}`}
        </span>
      </div>
      <div className="overflow-x-auto">
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
          {holes.map((cell) => (
            <div
              key={packCellKey(cell.x, cell.y)}
              className="pointer-events-none absolute z-[1] bg-black/55"
              style={{
                left: cell.x * CELL,
                top: cell.y * CELL,
                width: CELL,
                height: CELL,
                backgroundImage:
                  'repeating-linear-gradient(-45deg, transparent, transparent 4px, #ffffff12 4px, #ffffff12 5px)',
              }}
            />
          ))}

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
            const wears = hasCondition(inst);
            const cond = conditionPct(inst);
            const broken = isBroken(inst);
            const displayName = itemName(inst.defId, locale);
            return (
              <div
                key={inst.uid}
                onPointerDown={(e) => onItemPointerDown(e, inst)}
                onDoubleClick={() => onItemDoubleClick?.(inst)}
                onContextMenu={(e) => onItemContextMenu?.(e, inst)}
                onPointerEnter={(e) => onItemPointerEnter?.(e, inst)}
                onPointerLeave={() => onItemPointerLeave?.(inst)}
                onPointerMove={(e) => onItemPointerMove?.(e, inst)}
                className={`absolute flex cursor-grab flex-col items-center justify-center rounded text-center active:cursor-grabbing ${
                  selected
                    ? 'ring-2 ring-signal'
                    : def.exotic
                      ? 'ring-1 ring-amber-300/70'
                      : 'ring-1 ring-black/40'
                }`}
                style={{
                  left: inst.x * CELL + 1,
                  top: inst.y * CELL + 1,
                  width: w * CELL - 2,
                  height: h * CELL - 2,
                  background: `${tileColor(def)}66`,
                  boxShadow: `inset 0 0 0 1px ${tileColor(def)}`,
                  opacity: isDragging ? 0.25 : 1,
                  zIndex: selected ? 10 : 5,
                }}
                title={
                  suppressNativeTitle
                    ? undefined
                    : wears
                      ? `${displayName} — ${cond}%`
                      : displayName
                }
              >
                <Icon
                  name={itemIcon(def)}
                  size={Math.min(w, h) > 1 ? 26 : 18}
                  className="drop-shadow"
                />
                {def.stackable && inst.stack > 1 && (
                  <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-2xs font-black leading-tight text-white">
                    ×{inst.stack}
                  </span>
                )}
                {wears && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-black/50">
                    <span
                      className="block h-full"
                      style={{
                        width: `${cond}%`,
                        background: conditionBarColor(cond, broken),
                      }}
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
