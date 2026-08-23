import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { itemDef } from '../../game/loot';
import type { Equipment, EquipSlot, ItemInstance } from '../../game/types';
import { useT } from '../../i18n';
import { ItemInspectBody } from './ItemInspectBody';
import type { ContextMenuAction } from './ItemContextMenu';
import { clampBox, placeNear } from '../tips/clamp';
import { LONG_PRESS_MS, tip } from '../tips';

const OFFSET = 14;
const CARD_W = 'w-56';
const GAP = 6;

function HoverPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${CARD_W} max-w-full shrink-0 rounded-lg border border-white/20 bg-concrete-900/95 p-3 shadow-signage backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Floating RPG-style item card. When the hovered piece can replace something
 * already worn, shows Equipped | Candidate side by side (or stacked on phone).
 */
export function ItemHoverCard({
  inst,
  equipment,
  equipSlot,
  clientX,
  clientY,
  anchorEl = null,
  stacked = false,
  actions,
  onClose,
}: {
  inst: ItemInstance;
  equipment: Equipment;
  equipSlot: EquipSlot | null;
  clientX: number;
  clientY: number;
  /** When set (coarse pin), sit beside the tile instead of the cursor. */
  anchorEl?: HTMLElement | null;
  /** Phone: stack Equipped / Candidate vertically. */
  stacked?: boolean;
  /** Tablet coarse: Use / Equip / … on the card. Phone leaves this empty. */
  actions?: ContextMenuAction[];
  onClose?: () => void;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: clientX + OFFSET, top: clientY + OFFSET });

  const def = itemDef(inst.defId);
  const compareSlot = def.slot ?? null;
  const worn =
    compareSlot && equipment[compareSlot] && equipment[compareSlot]!.uid !== inst.uid
      ? equipment[compareSlot]!
      : null;
  const dual = worn != null;
  const wornSlotLabel = compareSlot ? t(`ui.slots.${compareSlot}`) : '';
  const interactive = !!onClose;
  const hasActions = !!actions && actions.length > 0;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (anchorEl) {
      const next = placeNear(
        anchorEl.getBoundingClientRect(),
        rect.width,
        rect.height,
        'bottom',
        GAP,
      );
      setPos({ left: next.left, top: next.top });
      return;
    }
    setPos(clampBox(rect.width, rect.height, clientX + OFFSET, clientY + OFFSET));
  }, [clientX, clientY, inst.uid, dual, stacked, hasActions, anchorEl]);

  useEffect(() => {
    if (!onClose) return;
    const close = onClose;
    const onDown = (e: PointerEvent) => {
      // iOS synthesizes mouse pointerdown after a hold; ignore or the pin vanishes.
      if (e.pointerType === 'mouse') return;
      if (ref.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    let attached = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      document.addEventListener('pointerdown', onDown, true);
    };
    // Don't dismiss on the same press that opened the pin.
    document.addEventListener('pointerup', attach, { once: true });
    const fallback = window.setTimeout(attach, LONG_PRESS_MS + 200);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(fallback);
      document.removeEventListener('pointerup', attach);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      data-item-peek=""
      className={`fixed z-[920] flex max-h-[calc(100dvh-16px)] max-w-[calc(100vw-16px)] items-start gap-2 overflow-y-auto ${
        stacked ? 'flex-col' : dual ? 'flex-row' : ''
      } ${interactive ? '' : 'pointer-events-none'}`}
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
          badge={dual ? t('ui.inventory.candidate') : undefined}
        />
        {hasActions && (
          <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
            {actions.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={a.disabled}
                {...tip(a.title, { placement: 'right' })}
                onClick={() => {
                  if (a.disabled) return;
                  a.onSelect();
                }}
                className={`w-full rounded px-1.5 py-1 text-left text-xs leading-tight ${
                  a.disabled
                    ? 'cursor-not-allowed bg-white/10 text-white/30'
                    : a.danger
                      ? 'border border-hiss/40 text-hiss/80 hover:bg-hiss/10'
                      : a.id === 'use'
                        ? 'bg-signal/80 font-semibold text-black hover:bg-signal'
                        : 'border border-white/15 bg-white/10 hover:bg-white/20'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </HoverPanel>
      {worn && compareSlot && (
        <HoverPanel className="border-white/12 bg-concrete-900/90 opacity-95">
          <ItemInspectBody
            inst={worn}
            equipment={equipment}
            equipSlot={compareSlot}
            compact
            hideCompareNote
            badge={`${t('ui.inventory.equipped')} · ${wornSlotLabel}`}
          />
        </HoverPanel>
      )}
    </div>,
    document.body,
  );
}
