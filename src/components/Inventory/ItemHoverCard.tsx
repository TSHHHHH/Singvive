import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { itemDef } from '../../game/loot';
import type { Equipment, EquipSlot, ItemInstance } from '../../game/types';
import { useT } from '../../i18n';
import { ItemInspectBody } from './ItemInspectBody';
import type { ContextMenuAction } from './ItemContextMenu';
import { clampBox, placeNear } from '../tips/clamp';
import { tip } from '../tips';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { sfx } from '../../audio/sfx';

const OFFSET = 14;
const CARD_W = 'w-64';
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

const RING_R = 10;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Corner dwell cue: the ring fills while the cursor rests on a tile, then the
 * dim pin in its centre lights once the card sticks.
 */
function PinRing({ state, label }: { state: 'pending' | 'pinned'; label: string }) {
  const reduced = useReducedMotion();
  const pinned = state === 'pinned';
  useEffect(() => {
    if (pinned) sfx.play('hud.pin');
  }, [pinned]);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`relative flex h-6 w-6 shrink-0 items-center justify-center ${pinned ? 'text-signal' : 'text-white/30'}`}
    >
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="12" cy="12" r={RING_R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
        <circle
          cx="12"
          cy="12"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={pinned ? 0 : RING_C}
          className={pinned ? 'text-signal' : reduced ? 'hidden' : 'item-pin-ring text-signal/70'}
          style={{ ['--ring-c' as string]: RING_C }}
        />
      </svg>
      <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-colors duration-150 ${pinned ? 'drop-shadow-[0_0_3px_rgba(232,229,221,0.85)]' : ''}`} aria-hidden>
        <path
          fill="currentColor"
          d="M15 3l6 6-2.2.6-3.6 3.6.6 4.6-1.4 1.4-4-4L5 20.6 3.4 19l5.4-5.4-4-4 1.4-1.4 4.6.6 3.6-3.6z"
        />
      </svg>
    </span>
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
  pinPending = false,
}: {
  inst: ItemInstance;
  equipment: Equipment;
  equipSlot: EquipSlot | null;
  clientX: number;
  clientY: number;
  /** Pinned cards sit beside the tile instead of following the cursor. */
  anchorEl?: HTMLElement | null;
  /** Phone: stack Equipped / Candidate vertically. */
  stacked?: boolean;
  /** Desktop: Use / Equip / … on the pinned card. Phone uses its inspect strip. */
  actions?: ContextMenuAction[];
  onClose?: () => void;
  /** Only show the dwell cue when the owner has armed a pin timer. */
  pinPending?: boolean;
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
    const position = () => {
      const rect = el.getBoundingClientRect();
      const next = anchorEl?.isConnected
        ? placeNear(anchorEl.getBoundingClientRect(), rect.width, rect.height, stacked ? 'bottom' : 'right', GAP)
        : clampBox(rect.width, rect.height, clientX + OFFSET, clientY + OFFSET);
      setPos((prev) => prev.left === next.left && prev.top === next.top ? prev : { left: next.left, top: next.top });
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(el);
    window.addEventListener('resize', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
    };
  }, [clientX, clientY, inst.uid, dual, stacked, hasActions, anchorEl]);

  useEffect(() => {
    if (!onClose) return;
    const close = onClose;
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      // A touch hold can synthesize a mouse event on its original tile.
      if (anchorEl?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    const onScroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onScroll, true);
    // Keyboard panel switches can remove the anchor without a pointer/scroll event.
    const observer = new MutationObserver(() => {
      if (anchorEl && !anchorEl.isConnected) close();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onScroll, true);
      observer.disconnect();
    };
  }, [onClose, anchorEl]);

  return createPortal(
    <div
      ref={ref}
      data-item-peek=""
      data-inventory-zone
      className={`fixed z-[920] flex max-h-[calc(100dvh-16px)] max-w-[calc(100vw-16px)] items-start gap-2 overflow-y-auto ${
        stacked ? 'flex-col' : dual ? 'flex-row' : ''
      } ${interactive ? '' : 'pointer-events-none'}`}
      style={{ left: pos.left, top: pos.top }}
      role={interactive ? 'dialog' : 'tooltip'}
      aria-label={t('ui.inventory.inspect')}
    >
      <HoverPanel className={dual ? 'border-signal/35' : undefined}>
        {interactive ? (
          <div className="float-right -mr-1.5 -mt-1.5 ml-2 flex items-center">
            <PinRing state="pinned" label={t('ui.inventory.detailsPinned')} />
            <button type="button" onClick={onClose} aria-label={t('ui.common.close')}
              className="flex min-h-8 min-w-8 items-center justify-center rounded text-white/50 hover:bg-white/10 hover:text-white">✕</button>
          </div>
        ) : pinPending ? (
          <div className="float-right -mr-1 -mt-1 ml-2" key={inst.uid}>
            <PinRing state="pending" label={t('ui.inventory.hoverToPin')} />
          </div>
        ) : null}
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
                className={`w-full rounded px-1.5 py-1 text-left text-body leading-tight ${
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
