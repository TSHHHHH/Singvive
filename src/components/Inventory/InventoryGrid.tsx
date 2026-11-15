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
import { itemName, useT } from '../../i18n';
import { itemIcon } from './itemIcon';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { tip } from '../tips';

export const CELL = 34;
/** Extra px taken off the scaled icon so art doesn't sit on the cell border. */
const ICON_INSET = 16;

/** Icon size for a grid-placed item — same scale in backpack, stash, and search. */
export function gridItemIconSize(w: number, h: number, cell = CELL): number {
  const inset = cell === CELL ? ICON_INSET : Math.round((ICON_INSET * cell) / CELL);
  return Math.max(1, Math.min(w, h) * cell - inset);
}

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
  headerControl?: ReactNode;
  collapsed?: boolean;
  largeCells?: boolean;
  items: ItemInstance[];
  selectedUid: string | null;
  draggingUid: string | null;
  /** Shift-click multi-selection; dragged together, drawn as selected. */
  multiSelected?: ReadonlySet<string>;
  /** Uids riding along in a group drag (dimmed like the dragged one). */
  draggingUids?: readonly string[];
  preview: DragPreview | null;
  gridRef: (el: HTMLDivElement | null) => void;
  onItemPointerDown: (e: React.PointerEvent, inst: ItemInstance) => void;
  onItemDoubleClick?: (inst: ItemInstance) => void;
  onItemContextMenu?: (e: React.MouseEvent, inst: ItemInstance) => void;
  onItemPointerEnter?: (e: React.PointerEvent, inst: ItemInstance) => void;
  onItemPointerLeave?: (inst: ItemInstance) => void;
  onItemPointerMove?: (e: React.PointerEvent, inst: ItemInstance) => void;
  /** Skip the plain hover tip when the richer ItemHoverCard is doing the job. */
  suppressTip?: boolean;
}

/** Presentational Tetris grid. Drag state is owned by the parent panel so
 *  items can be dragged across multiple grids. */
export function InventoryGrid({
  grid,
  title,
  titleAccessory,
  headerControl,
  collapsed = false,
  largeCells = false,
  items,
  selectedUid,
  draggingUid,
  multiSelected,
  draggingUids,
  preview,
  gridRef,
  onItemPointerDown,
  onItemDoubleClick,
  onItemContextMenu,
  onItemPointerEnter,
  onItemPointerLeave,
  onItemPointerMove,
  suppressTip = false,
}: Props) {
  const { locale, t } = useT();
  const dims = dimsFor(grid);
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !largeCells) return;
    const measure = () => setAvailableWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [largeCells]);
  const cell = largeCells ? Math.max(48, Math.min(56, Math.floor((availableWidth - 2) / dims.w))) : CELL;
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
    <div ref={containerRef} className="min-w-0">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-label uppercase text-white/40">
        <span className="inline-flex items-center gap-1.5">
          <span>{title}</span>
          {titleAccessory}
        </span>
        <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
          {holes.length > 0 ? t('ui.stats.packCells', { n: usable, w: dims.w, h: dims.h }) : `${dims.w}×${dims.h}`}
          {headerControl}
        </span>
      </div>
      {!collapsed && <div className="overflow-x-auto overscroll-x-contain">
        <div
          ref={gridRef}
          data-grid={grid}
          data-cell-size={cell}
          className="relative touch-none select-none rounded border border-white/10 bg-black/40"
          style={{
            width: dims.w * cell + 2,
            height: dims.h * cell + 2,
            backgroundImage:
              'linear-gradient(#ffffff10 1px, transparent 1px), linear-gradient(90deg, #ffffff10 1px, transparent 1px)',
            backgroundSize: `${cell}px ${cell}px`,
          }}
        >
          {holes.map((hole) => (
            <div
              key={packCellKey(hole.x, hole.y)}
              className="pointer-events-none absolute z-[1] bg-black/55"
              style={{
                left: hole.x * cell,
                top: hole.y * cell,
                width: cell,
                height: cell,
                backgroundImage:
                  'repeating-linear-gradient(-45deg, transparent, transparent 4px, #ffffff12 4px, #ffffff12 5px)',
              }}
            />
          ))}

          {showPreview && (
            <div
              className="pointer-events-none absolute z-20 rounded"
              style={{
                left: preview!.cellX * cell,
                top: preview!.cellY * cell,
                width: preview!.w * cell - 2,
                height: preview!.h * cell - 2,
                background: preview!.valid ? '#6b8e2355' : '#c0392b55',
                border: `2px dashed ${preview!.valid ? '#8fbf4b' : '#e0342b'}`,
              }}
            />
          )}

          {cells.map((inst) => {
            const def = itemDef(inst.defId);
            const { w, h } = footprint(def, inst.rotated);
            const isDragging = draggingUid === inst.uid || !!draggingUids?.includes(inst.uid);
            const selected = selectedUid === inst.uid || !!multiSelected?.has(inst.uid);
            const wears = hasCondition(inst);
            const cond = conditionPct(inst);
            const broken = isBroken(inst);
            const displayName = itemName(inst.defId, locale);
            return (
              <div
                key={inst.uid}
                data-uid={inst.uid}
                onDragStart={(e) => e.preventDefault()}
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
                  left: inst.x * cell + 1,
                  top: inst.y * cell + 1,
                  width: w * cell - 2,
                  height: h * cell - 2,
                  background: `${tileColor(def)}66`,
                  boxShadow: `inset 0 0 0 1px ${tileColor(def)}`,
                  opacity: isDragging ? 0.25 : 1,
                  zIndex: selected ? 10 : 5,
                }}
                {...tip(
                  suppressTip
                    ? undefined
                    : wears
                      ? `${displayName} — ${cond}%`
                      : displayName,
                )}
              >
                <Icon
                  name={itemIcon(def)}
                  size={largeCells ? Math.min(w, h) * cell - 16 : gridItemIconSize(w, h)}
                  className="pointer-events-none drop-shadow"
                />
                {def.stackable && inst.stack > 1 && (
                  <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-micro font-bold text-white">
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
      </div>}
    </div>
  );
}
