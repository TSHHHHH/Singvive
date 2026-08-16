import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { itemDef } from '../../game/loot';
import type { Equipment, EquipSlot, ItemInstance } from '../../game/types';
import { EQUIP_SLOTS } from './equipSlots';
import { ItemInspectBody } from './ItemInspectBody';

const VIEW_PAD = 8;
const OFFSET = 14;
const CARD_W = 'w-56';

function clampIntoView(el: HTMLElement, preferredLeft: number, preferredTop: number) {
  const vv = window.visualViewport;
  const leftBound = vv?.offsetLeft ?? 0;
  const topBound = vv?.offsetTop ?? 0;
  const rightBound = leftBound + (vv?.width ?? window.innerWidth);
  const bottomBound = topBound + (vv?.height ?? window.innerHeight);

  el.style.left = `${preferredLeft}px`;
  el.style.top = `${preferredTop}px`;
  const rect = el.getBoundingClientRect();

  let left = preferredLeft;
  let top = preferredTop;
  if (rect.right > rightBound - VIEW_PAD) left = preferredLeft - (rect.right - (rightBound - VIEW_PAD));
  if (rect.left < leftBound + VIEW_PAD) left = leftBound + VIEW_PAD;
  if (rect.bottom > bottomBound - VIEW_PAD) top = preferredTop - (rect.bottom - (bottomBound - VIEW_PAD));
  if (rect.top < topBound + VIEW_PAD) top = topBound + VIEW_PAD;
  return { left, top };
}

function HoverPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${CARD_W} shrink-0 rounded-lg border border-white/20 bg-concrete-900/95 p-3 shadow-signage backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Floating RPG-style item card. When the hovered piece can replace something
 * already worn, shows Equipped | Candidate side by side.
 */
export function ItemHoverCard({
  inst,
  equipment,
  equipSlot,
  clientX,
  clientY,
}: {
  inst: ItemInstance;
  equipment: Equipment;
  equipSlot: EquipSlot | null;
  clientX: number;
  clientY: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: clientX + OFFSET, top: clientY + OFFSET });

  const def = itemDef(inst.defId);
  const compareSlot = def.slot ?? null;
  const worn =
    compareSlot && equipment[compareSlot] && equipment[compareSlot]!.uid !== inst.uid
      ? equipment[compareSlot]!
      : null;
  const dual = worn != null;
  const wornSlotLabel = compareSlot
    ? (EQUIP_SLOTS.find((s) => s.slot === compareSlot)?.label ?? compareSlot)
    : '';

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(clampIntoView(el, clientX + OFFSET, clientY + OFFSET));
  }, [clientX, clientY, inst.uid, dual]);

  return createPortal(
    <div
      ref={ref}
      className={`pointer-events-none fixed z-[920] flex max-w-[calc(100vw-16px)] items-start gap-2 ${
        dual ? 'flex-row' : ''
      }`}
      style={{ left: pos.left, top: pos.top }}
      role="tooltip"
    >
      <HoverPanel className={dual ? 'border-signal/35' : undefined}>
        <ItemInspectBody
          inst={inst}
          equipment={equipment}
          equipSlot={equipSlot}
          compact
          hideCompareNote={dual}
          badge={dual ? 'Hovering' : undefined}
        />
      </HoverPanel>
      {worn && compareSlot && (
        <HoverPanel className="border-white/12 bg-concrete-900/90 opacity-95">
          <ItemInspectBody
            inst={worn}
            equipment={equipment}
            equipSlot={compareSlot}
            compact
            hideCompareNote
            badge={`Equipped · ${wornSlotLabel}`}
          />
        </HoverPanel>
      )}
    </div>,
    document.body,
  );
}
