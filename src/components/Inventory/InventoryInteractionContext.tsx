import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../game/store';
import { itemDef } from '../../game/loot';
import { normalizeAmmoDefId } from '../../game/firearms';
import {
  BACKPACK,
  isCarried,
  LOOSE,
  canEquip,
  canPlace,
  dimsFor,
  overlapsAt,
  footprint,
  isTwoHandedEquipped,
  TEMP_STASH,
} from '../../game/inventory';
import { tileColor } from '../../game/itemTileColor';
import type { Container, EquipSlot, ItemInstance } from '../../game/types';
import { useCoarsePointer } from '../TipHint';
import { useIsPhoneLayout } from '../useIsPhoneLayout';
import { HOVER_DELAY_MS, LONG_PRESS_MS } from '../tips';
import { CELL, type DragPreview } from './InventoryGrid';
import { dropCell } from './gridMetrics';
import { EQUIP_SLOTS } from './equipSlots';
import { isConsumableUsable } from './itemStatLines';
import { ItemHoverCard } from './ItemHoverCard';
import { ItemContextMenu, type ContextMenuAction } from './ItemContextMenu';
import { Icon } from '../../icons/Icon';
import { itemIcon } from './itemIcon';
import { useT } from '../../i18n';
import { useSetting, useSettings } from '../../game/settings';
import { DiscardConfirm } from './DiscardConfirm';

interface GridDrop {
  type: 'grid';
  container: Container;
  cellX: number;
  cellY: number;
  w: number;
  h: number;
  valid: boolean;
  /** Bag items a loose drop would bump out to the loose pile. */
  displaced?: string[];
}
interface SlotDrop {
  type: 'slot';
  slot: EquipSlot;
  valid: boolean;
}
/** Dropped outside every inventory panel: throw it away. */
interface DiscardDrop {
  type: 'discard';
  valid: true;
}
type DropTarget = GridDrop | SlotDrop | DiscardDrop | null;

/** Anything tagged with this attribute counts as "inside the inventory". */
const INVENTORY_ZONE_ATTR = 'data-inventory-zone';

function outsideInventoryZone(clientX: number, clientY: number): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return false; // off-window: don't throw things away by accident
  return !el.closest(`[${INVENTORY_ZONE_ATTR}]`);
}

interface DragState {
  uid: string;
  /** Every item in the drag: just `uid`, or the whole multi-selection. */
  uids: string[];
  pointerId: number;
  grabDX: number;
  grabDY: number;
  cellSize: number;
  rotated: boolean;
  clientX: number;
  clientY: number;
  target: DropTarget;
}

const DRAG_THRESHOLD_PX = 6;
const HOVER_PIN_MS = 2000;
const EMPTY_UIDS: readonly string[] = [];

interface PendingDrag {
  uid: string;
  pointerId: number;
  startX: number;
  startY: number;
  grabDX: number;
  grabDY: number;
  cellSize: number;
  rotated: boolean;
  el: HTMLElement;
}

type HoverTarget = {
  uid: string;
  clientX: number;
  clientY: number;
  el: HTMLElement | null;
  pinned: boolean;
};

type CtxMenu = {
  uid: string;
  x: number;
  y: number;
};

export type InventoryInteractionApi = {
  selectedUid: string | null;
  setSelectedUid: (uid: string | null) => void;
  /** Shift-click selection (size 0 or ≥2 in practice). */
  multiSelected: ReadonlySet<string>;
  clearMultiSelected: () => void;
  /** Throw items away, asking first unless the player turned that off. */
  requestDiscard: (uids: string[]) => void;
  dragUid: string | null;
  /** Other items riding along in a group drag. */
  dragUids: readonly string[];
  drag: DragState | null;
  stashContainer: string | null;
  hasTempStash: boolean;
  inTunnel: boolean;
  pcShortcuts: boolean;
  coarse: boolean;
  gridPreview: (container: Container) => DragPreview | null;
  registerGrid: (container: Container, el: HTMLDivElement | null) => void;
  registerSlot: (slot: EquipSlot, el: HTMLDivElement | null) => void;
  onItemPointerDown: (e: React.PointerEvent, inst: ItemInstance) => void;
  onItemDoubleClick: (inst: ItemInstance) => void;
  onItemContextMenu: (e: React.MouseEvent, inst: ItemInstance) => void;
  onItemPointerEnter: (e: React.PointerEvent, inst: ItemInstance) => void;
  onItemPointerLeave: (inst: ItemInstance) => void;
  onItemPointerMove: (e: React.PointerEvent, inst: ItemInstance) => void;
  equippedSlotOf: (uid: string) => EquipSlot | null;
  quickUseOrEquip: (inst: ItemInstance) => void;
};

const InventoryInteractionContext = createContext<InventoryInteractionApi | null>(null);

export function useInventoryInteraction(): InventoryInteractionApi {
  const ctx = useContext(InventoryInteractionContext);
  if (!ctx) throw new Error('useInventoryInteraction requires InventoryInteractionProvider');
  return ctx;
}

export function InventoryInteractionProvider({ children }: { children: ReactNode }) {
  const items = useGame((s) => s.items);
  const equipment = useGame((s) => s.equipment);
  const currentPositionId = useGame((s) => s.currentPositionId);
  const locations = useGame((s) => s.locations);
  const applyItem = useGame((s) => s.applyItem);
  const transferItem = useGame((s) => s.transferItem);
  const moveItem = useGame((s) => s.moveItem);
  const packReplacing = useGame((s) => s.packReplacing);
  const equipItem = useGame((s) => s.equipItem);
  const unequipItem = useGame((s) => s.unequipItem);
  const dropItem = useGame((s) => s.dropItem);
  const refillMagazine = useGame((s) => s.refillMagazine);
  const loadGunFromMagazine = useGame((s) => s.loadGunFromMagazine);
  const refillFirearm = useGame((s) => s.refillFirearm);
  const tunnel = useGame((s) => s.tunnel);
  const confirmDiscard = useSetting('confirmDiscard') !== 'off';
  const inCombat = useGame((s) => !!s.combat && !s.combat.over);

  const { t } = useT();
  const isPhone = useIsPhoneLayout();
  const coarse = useCoarsePointer();
  const pcShortcuts = !isPhone && !coarse;
  const cardActions = !isPhone;

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [multiUids, setMultiUids] = useState<string[]>([]);
  const multiRef = useRef<string[]>([]);
  multiRef.current = multiUids;
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedUid;
  const [discardUids, setDiscardUids] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const hoverRef = useRef<HoverTarget | null>(null);
  hoverRef.current = hover;
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const pendingDrag = useRef<PendingDrag | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const dragStartedRef = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverUidRef = useRef<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef(0);
  const holdPeekRef = useRef<{
    uid: string;
    el: HTMLElement;
    clientX: number;
    clientY: number;
  } | null>(null);
  const peekLockedRef = useRef(false);

  const gridRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const slotRefs = useRef<Record<EquipSlot, HTMLDivElement | null>>({
    head: null,
    body: null,
    hands: null,
    legs: null,
    feet: null,
    bag: null,
    mainHand: null,
    offHand: null,
    firearm: null,
  });

  const hereLoc = currentPositionId ? locations[currentPositionId] : null;
  const hasTempStash = items.some((i) => i.container === TEMP_STASH);
  const stashContainer = tunnel || !hereLoc ? null : hereLoc.id;

  const liveRef = useRef({
    items,
    equipment,
    stashContainer,
    hasTempStash,
    tunnel,
    moveItem,
    packReplacing,
    equipItem,
    applyItem,
    unequipItem,
    transferItem,
    dropItem,
    refillMagazine,
    loadGunFromMagazine,
    refillFirearm,
    inCombat,
    pcShortcuts,
    coarse,
    cardActions,
    confirmDiscard,
  });
  liveRef.current = {
    items,
    equipment,
    stashContainer,
    hasTempStash,
    tunnel,
    moveItem,
    packReplacing,
    equipItem,
    applyItem,
    unequipItem,
    transferItem,
    dropItem,
    refillMagazine,
    loadGunFromMagazine,
    refillFirearm,
    inCombat,
    pcShortcuts,
    coarse,
    cardActions,
    confirmDiscard,
  };

  const requestDiscard = useCallback((uids: string[]) => {
    const live = liveRef.current;
    const real = uids.filter((u) => live.items.some((i) => i.uid === u));
    if (real.length === 0) return;
    if (!live.confirmDiscard) {
      for (const u of real) live.dropItem(u);
      setMultiUids([]);
      setSelectedUid(null);
      return;
    }
    setDiscardUids(real);
  }, []);

  /** The selection a drop / discard action should act on for `uid`. */
  const groupFor = (uid: string): string[] => {
    const multi = multiRef.current.filter((u) => liveRef.current.items.some((i) => i.uid === u));
    return multi.length > 1 && multi.includes(uid) ? multi : [uid];
  };

  const clearHoverTimer = () => {
    if (pinTimer.current) {
      clearTimeout(pinTimer.current);
      pinTimer.current = null;
    }
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const clearHoldTimer = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const dismissHover = useCallback(() => {
    clearHoverTimer();
    clearHoldTimer();
    hoverUidRef.current = null;
    holdPeekRef.current = null;
    peekLockedRef.current = false;
    hoverRef.current = null;
    setHover(null);
  }, []);

  const equippedSlotOf = useCallback(
    (uid: string): EquipSlot | null =>
      EQUIP_SLOTS.find(({ slot }) => equipment[slot]?.uid === uid)?.slot ?? null,
    [equipment],
  );

  const findInst = useCallback(
    (uid: string): ItemInstance | null => {
      const fromItems = items.find((i) => i.uid === uid);
      if (fromItems) return fromItems;
      for (const { slot } of EQUIP_SLOTS) {
        const eq = equipment[slot];
        if (eq?.uid === uid) return eq;
      }
      return null;
    },
    [items, equipment],
  );

  const quickUseOrEquip = useCallback(
    (inst: ItemInstance) => {
      const live = liveRef.current;
      const def = itemDef(inst.defId);
      const slot = EQUIP_SLOTS.find(({ slot: s }) => live.equipment[s]?.uid === inst.uid)?.slot ?? null;
      if (slot) {
        live.unequipItem(slot);
        setSelectedUid(null);
        return;
      }
      if (isConsumableUsable(def)) {
        if (live.inCombat) return;
        live.applyItem(inst.uid);
        return;
      }
      if (def.slot) {
        live.equipItem(inst.uid, def.slot);
        setSelectedUid(null);
      }
    },
    [],
  );

  const hitTest = (
    clientX: number,
    clientY: number,
    inst: ItemInstance,
    rotated: boolean,
  ): DropTarget => {
    const { items: liveItems, equipment: liveEq, stashContainer: stash, hasTempStash: temp } =
      liveRef.current;
    const def = itemDef(inst.defId);
    const underPointer = document.elementFromPoint(clientX, clientY);
    for (const { slot } of EQUIP_SLOTS) {
      const el = slotRefs.current[slot];
      if (!el || !underPointer || !el.contains(underPointer)) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        let valid = canEquip(def, slot) && (dragRef.current?.uids.length ?? 1) <= 1;
        if (valid && slot === 'offHand' && isTwoHandedEquipped(liveEq)) valid = false;
        return { type: 'slot', slot, valid };
      }
    }
    const looseEl = gridRefs.current[LOOSE];
    if (looseEl && underPointer && looseEl.contains(underPointer)) {
      const r = looseEl.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        const { w, h } = footprint(def, rotated);
        return {
          type: 'grid',
          container: LOOSE,
          cellX: 0,
          cellY: 0,
          w,
          h,
          valid: (dragRef.current?.uids ?? [inst.uid]).some(
            (u) => liveItems.find((i) => i.uid === u)?.container !== LOOSE,
          ),
        };
      }
    }
    const { w, h } = footprint(def, rotated);
    const grids = [
      BACKPACK,
      ...(stash ? [stash] : []),
      ...(temp || liveRef.current.tunnel ? [TEMP_STASH] : []),
    ];
    for (const container of grids) {
      const el = gridRefs.current[container];
      if (!el || !el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      // Scrolled-out cells and grids behind another surface aren't drop targets.
      if (!underPointer || !el.contains(underPointer)) continue;
      const dims = dimsFor(container);
      const grabDX = dragRef.current?.grabDX ?? 0;
      const grabDY = dragRef.current?.grabDY ?? 0;
      const targetCell = Number(el.dataset.cellSize) || CELL;
      const sourceCell = dragRef.current?.cellSize ?? targetCell;
      const cellX = dropCell(clientX, r.left + el.clientLeft, grabDX, sourceCell, targetCell, dims.w, w);
      const cellY = dropCell(clientY, r.top + el.clientTop, grabDY, sourceCell, targetCell, dims.h, h);
      const group = dragRef.current?.uids ?? [inst.uid];
      // A loose item dropped into the bag takes the spot, bumping whatever it
      // lands on out to the loose pile. Only out-of-bounds / holes refuse.
      if (container === BACKPACK && group.length === 1 && inst.container === LOOSE) {
        const displaced = overlapsAt(container, liveItems, { x: cellX, y: cellY, w, h }, inst.uid);
        return {
          type: 'grid',
          container,
          cellX,
          cellY,
          w,
          h,
          valid: displaced !== null,
          ...(displaced?.length ? { displaced } : {}),
        };
      }
      // A group drop auto-places each item, so the exact cell doesn't matter.
      const valid =
        group.length > 1
          ? group.some((u) => liveItems.find((i) => i.uid === u)?.container !== container)
          : canPlace(container, liveItems, { x: cellX, y: cellY, w, h }, inst.uid);
      return { type: 'grid', container, cellX, cellY, w, h, valid };
    }
    if (outsideInventoryZone(clientX, clientY)) return { type: 'discard', valid: true };
    return null;
  };

  const beginDrag = (pending: PendingDrag, clientX: number, clientY: number) => {
    pendingDrag.current = null;
    dragStartedRef.current = true;
    clearHoldTimer();
    holdPeekRef.current = null;
    peekLockedRef.current = false;
    dismissHover();
    setCtxMenu(null);
    const inst = liveRef.current.items.find((i) => i.uid === pending.uid);
    if (!inst) return;
    const next: DragState = {
      uid: pending.uid,
      uids: groupFor(pending.uid),
      pointerId: pending.pointerId,
      grabDX: pending.grabDX,
      grabDY: pending.grabDY,
      cellSize: pending.cellSize,
      rotated: pending.rotated,
      clientX,
      clientY,
      target: null,
    };
    dragRef.current = next;
    next.target = hitTest(clientX, clientY, inst, pending.rotated);
    setDrag(next);
    try {
      pending.el.setPointerCapture(pending.pointerId);
    } catch {
      /* synthetic events */
    }
  };

  const endDrag = (pointerId: number) => {
    if (pendingDrag.current?.pointerId === pointerId) {
      pendingDrag.current = null;
    }
    const current = dragRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const {
      items: liveItems,
      moveItem: move,
      packReplacing,
      equipItem: equip,
      transferItem: transfer,
    } = liveRef.current;
    const inst = liveItems.find((i) => i.uid === current.uid);
    const t = current.target;
    if (inst && t) {
      if (t.type === 'discard') {
        requestDiscard(current.uids);
      } else if (t.type === 'grid' && t.valid && current.uids.length > 1) {
        for (const u of current.uids) {
          const it = liveRef.current.items.find((i) => i.uid === u);
          if (it && it.container !== t.container) transfer(u, t.container);
        }
      } else if (t.type === 'grid' && t.valid && t.container === BACKPACK && inst.container === LOOSE) {
        packReplacing(current.uid, t.cellX, t.cellY, current.rotated);
      } else if (t.type === 'grid' && t.valid) {
        move(current.uid, t.container, t.cellX, t.cellY, current.rotated);
      } else if (t.type === 'slot' && t.valid) {
        equip(current.uid, t.slot);
      }
    }
    dragRef.current = null;
    setDrag(null);
  };

  const onItemPointerDown = useCallback((e: React.PointerEvent, inst: ItemInstance) => {
    if (e.button !== 0) return;
    dismissHover();
    const live = liveRef.current;
    setCtxMenu(null);

    // Ctrl/Cmd+click → quick stash / pack transfer (PC only).
    if (live.pcShortcuts && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      const slot = EQUIP_SLOTS.find(({ slot: s }) => live.equipment[s]?.uid === inst.uid)?.slot;
      if (slot) return;
      if (!live.stashContainer) return;
      const dest = isCarried(inst.container) ? live.stashContainer : BACKPACK;
      live.transferItem(inst.uid, dest);
      setSelectedUid(inst.uid);
      return;
    }

    const onGridItem = live.items.some((i) => i.uid === inst.uid);

    // Shift+click → add to / remove from the multi-selection (not equipped kit).
    if (e.shiftKey && !live.coarse && onGridItem) {
      e.preventDefault();
      dismissHover();
      const prev = multiRef.current.filter((u) => live.items.some((i) => i.uid === u));
      const anchor = selectedRef.current;
      const base =
        prev.length > 0
          ? prev
          : anchor && anchor !== inst.uid && live.items.some((i) => i.uid === anchor)
            ? [anchor]
            : [];
      const next = base.includes(inst.uid) ? base.filter((u) => u !== inst.uid) : [...base, inst.uid];
      setMultiUids(next);
      setSelectedUid(next.includes(inst.uid) ? inst.uid : (next[next.length - 1] ?? null));
      return;
    }
    // A plain click outside the selection starts over; inside it, keeps the
    // group so it can be dragged together.
    if (!multiRef.current.includes(inst.uid)) setMultiUids([]);

    dragStartedRef.current = false;
    setSelectedUid(inst.uid);

    if (live.coarse) {
      dismissHover();
      peekLockedRef.current = false;
      const el = e.currentTarget as HTMLElement;
      const { clientX, clientY } = e;
      holdStartRef.current = performance.now();
      holdPeekRef.current = { uid: inst.uid, el, clientX, clientY };
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        const peek = holdPeekRef.current;
        if (!peek || dragRef.current) return;
        peekLockedRef.current = true;
        pendingDrag.current = null;
        hoverUidRef.current = peek.uid;
        setHover({ ...peek, pinned: true });
      }, LONG_PRESS_MS);
    }

    // Equipped items aren't on a grid — select only (no drag from slot chrome).
    if (!onGridItem) return;

    const el = gridRefs.current[inst.container];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cellSize = Number(el.dataset.cellSize) || CELL;
    // Own the gesture from the initial press, even when it begins on artwork.
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* detached target */ }
    pendingDrag.current = {
      uid: inst.uid,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      // Loose rows aren't on cells: hold the ghost by its middle instead.
      grabDX: inst.container === LOOSE ? cellSize / 2 : e.clientX - (r.left + el.clientLeft + inst.x * cellSize),
      grabDY: inst.container === LOOSE ? cellSize / 2 : e.clientY - (r.top + el.clientTop + inst.y * cellSize),
      cellSize,
      rotated: inst.rotated,
      el: e.currentTarget as HTMLElement,
    };
  }, [dismissHover]); // eslint-disable-line react-hooks/exhaustive-deps

  const onItemDoubleClick = useCallback(
    (inst: ItemInstance) => {
      if (!liveRef.current.pcShortcuts) return;
      if (dragStartedRef.current) return;
      quickUseOrEquip(inst);
    },
    [quickUseOrEquip],
  );

  const onItemContextMenu = useCallback((e: React.MouseEvent, inst: ItemInstance) => {
    e.preventDefault();
    e.stopPropagation();
    if (!liveRef.current.pcShortcuts) return;
    dismissHover();
    setSelectedUid(inst.uid);
    setCtxMenu({ uid: inst.uid, x: e.clientX, y: e.clientY });
  }, [dismissHover]);

  const onItemPointerEnter = useCallback(
    (e: React.PointerEvent, inst: ItemInstance) => {
      if (liveRef.current.coarse) return;
      if (e.pointerType !== 'mouse') return;
      if (dragRef.current || pendingDrag.current || hoverRef.current?.pinned) return;
      clearHoverTimer();
      hoverUidRef.current = inst.uid;
      const { clientX, clientY } = e;
      const el = e.currentTarget as HTMLElement;
      hoverTimer.current = setTimeout(() => {
        if (hoverUidRef.current !== inst.uid || dragRef.current) return;
        setHover({ uid: inst.uid, clientX, clientY, el, pinned: false });
      }, HOVER_DELAY_MS);
      pinTimer.current = setTimeout(() => {
        if (hoverUidRef.current !== inst.uid || dragRef.current || pendingDrag.current) return;
        const pinned: HoverTarget = { uid: inst.uid, clientX, clientY, el, pinned: true };
        hoverRef.current = pinned;
        setHover(pinned);
      }, HOVER_PIN_MS);
    },
    [],
  );

  const onItemPointerLeave = useCallback((inst: ItemInstance) => {
    if (liveRef.current.coarse) return;
    if (hoverRef.current?.pinned) return;
    if (hoverUidRef.current === inst.uid) {
      clearHoverTimer();
      hoverUidRef.current = null;
      setHover(null);
    }
  }, []);

  const onItemPointerMove = useCallback((e: React.PointerEvent, inst: ItemInstance) => {
    if (liveRef.current.coarse) return;
    if (hover?.uid === inst.uid && !hover.pinned) {
      setHover({ uid: inst.uid, clientX: e.clientX, clientY: e.clientY, el: hover.el, pinned: false });
    }
  }, [hover?.uid, hover?.pinned, hover?.el]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const pending = pendingDrag.current;
      if (
        pending &&
        pending.pointerId === e.pointerId &&
        !dragRef.current &&
        !peekLockedRef.current
      ) {
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          e.preventDefault();
          beginDrag(pending, e.clientX, e.clientY);
        } else {
          return;
        }
      }

      const current = dragRef.current;
      if (!current || current.pointerId !== e.pointerId) return;
      e.preventDefault();
      const inst = liveRef.current.items.find((i) => i.uid === current.uid);
      if (!inst) return;
      const next: DragState = {
        ...current,
        clientX: e.clientX,
        clientY: e.clientY,
        target: hitTest(e.clientX, e.clientY, inst, current.rotated),
      };
      dragRef.current = next;
      setDrag(next);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pendingDrag.current?.pointerId === e.pointerId) {
        pendingDrag.current = null;
      }
      if (holdTimer.current) {
        if (performance.now() - holdStartRef.current >= LONG_PRESS_MS) {
          const peek = holdPeekRef.current;
          clearHoldTimer();
          if (peek && !dragRef.current) {
            peekLockedRef.current = true;
            pendingDrag.current = null;
            hoverUidRef.current = peek.uid;
            setHover({ ...peek, pinned: true });
          }
        } else {
          clearHoldTimer();
        }
      }
      peekLockedRef.current = false;
      const current = dragRef.current;
      const inst = current && liveRef.current.items.find((i) => i.uid === current.uid);
      if (current && inst && current.pointerId === e.pointerId) {
        current.target = hitTest(e.clientX, e.clientY, inst, current.rotated);
      }
      endDrag(e.pointerId);
    };

    const cancelDrag = () => {
      pendingDrag.current = null;
      dragRef.current = null;
      setDrag(null);
      dismissHover();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const current = dragRef.current;
      if (e.key === 'Escape' && (current || pendingDrag.current)) {
        e.preventDefault();
        e.stopPropagation();
        cancelDrag();
        return;
      }
      if (!current) {
        if (e.key === 'Escape' && multiRef.current.length) setMultiUids([]);
        return;
      }
      if (e.code !== 'KeyR' || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const inst = liveRef.current.items.find((i) => i.uid === current.uid);
      if (!inst) return;
      const def = itemDef(inst.defId);
      if (def.w === def.h) return;
      e.preventDefault();
      const rotated = !current.rotated;
      const next: DragState = {
        ...current,
        rotated,
        target: hitTest(current.clientX, current.clientY, inst, rotated),
      };
      if (current.uids.length > 1) return;
      dragRef.current = next;
      setDrag(next);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', cancelDrag);
      window.removeEventListener('blur', cancelDrag);
      window.removeEventListener('keydown', onKeyDown, true);
      clearHoverTimer();
      clearHoldTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gridPreview = useCallback(
    (container: Container): DragPreview | null => {
      if (!drag || drag.target?.type !== 'grid' || drag.target.container !== container) return null;
      const t = drag.target;
      return {
        grid: container,
        cellX: t.cellX,
        cellY: t.cellY,
        w: t.w,
        h: t.h,
        valid: t.valid,
        ...(t.displaced ? { displaced: t.displaced } : {}),
      };
    },
    [drag],
  );

  const registerGrid = useCallback((container: Container, el: HTMLDivElement | null) => {
    gridRefs.current[container] = el;
  }, []);

  const registerSlot = useCallback((slot: EquipSlot, el: HTMLDivElement | null) => {
    slotRefs.current[slot] = el;
  }, []);

  // Drop uids that left the inventory (used, dropped, crafted away).
  const multiSelected = useMemo(() => {
    const live = new Set(items.map((i) => i.uid));
    return new Set(multiUids.filter((u) => live.has(u)));
  }, [multiUids, items]);
  const clearMultiSelected = useCallback(() => setMultiUids([]), []);

  const api = useMemo<InventoryInteractionApi>(
    () => ({
      selectedUid,
      setSelectedUid,
      multiSelected,
      clearMultiSelected,
      requestDiscard,
      dragUid: drag?.uid ?? null,
      dragUids: drag?.uids ?? EMPTY_UIDS,
      drag,
      stashContainer,
      hasTempStash,
      inTunnel: !!tunnel,
      pcShortcuts,
      coarse,
      gridPreview,
      registerGrid,
      registerSlot,
      onItemPointerDown,
      onItemDoubleClick,
      onItemContextMenu,
      onItemPointerEnter,
      onItemPointerLeave,
      onItemPointerMove,
      equippedSlotOf,
      quickUseOrEquip,
    }),
    [
      selectedUid,
      multiSelected,
      clearMultiSelected,
      requestDiscard,
      drag,
      stashContainer,
      hasTempStash,
      tunnel,
      pcShortcuts,
      coarse,
      gridPreview,
      registerGrid,
      registerSlot,
      onItemPointerDown,
      onItemDoubleClick,
      onItemContextMenu,
      onItemPointerEnter,
      onItemPointerLeave,
      onItemPointerMove,
      equippedSlotOf,
      quickUseOrEquip,
    ],
  );

  const dragGhost = (() => {
    if (!drag) return null;
    const inst = items.find((i) => i.uid === drag.uid);
    if (!inst) return null;
    const gDef = itemDef(inst.defId);
    const { w, h } = footprint(gDef, drag.rotated);
    const targetCell = drag.target?.type === 'grid'
      ? Number(gridRefs.current[drag.target.container]?.dataset.cellSize) : 0;
    return { inst, def: gDef, w, h, cell: targetCell || drag.cellSize };
  })();

  const hoverInst = hover && !drag ? findInst(hover.uid) : null;
  useEffect(() => {
    // A used, transferred, or removed item must not leave an invisible pin lock.
    if (hover && !drag && (!hoverInst || !hover.el?.isConnected)) dismissHover();
  }, [hover, hoverInst, drag, dismissHover]);

  useEffect(() => {
    const onScroll = (e: Event) => {
      if ((e.target as Element).closest?.('[data-item-peek]')) return;
      dismissHover();
    };
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', dismissHover);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', dismissHover);
    };
  }, [dismissHover]);
  const discarding = drag?.target?.type === 'discard';

  const itemActionsFor = (target: ItemInstance): ContextMenuAction[] => {
    const live = liveRef.current;
    const def = itemDef(target.defId);
    const slot = equippedSlotOf(target.uid);
    const actions: ContextMenuAction[] = [];
    if (slot) {
      if (slot === 'firearm' && def.effect.kind === 'weapon' && def.effect.ranged && !def.effect.usesMagazine && !live.inCombat) {
        const gunCaliber = def.effect.caliber;
        const ammo = live.items.find((i) => {
          if (i.container !== BACKPACK) return false;
          const aDef = itemDef(normalizeAmmoDefId(i.defId));
          return aDef.effect.kind === 'ammo' && gunCaliber && aDef.effect.caliber === gunCaliber;
        });
        if (ammo) {
          actions.push({
            id: 'refillGun',
            label: t('ui.inventory.refillGun'),
            onSelect: () => live.refillFirearm(ammo.uid),
          });
        }
      }
      actions.push({
        id: 'unequip',
        label: t('ui.inventory.unequip'),
        onSelect: () => {
          live.unequipItem(slot);
          setSelectedUid(null);
        },
      });
      return actions;
    }
    if (isConsumableUsable(def)) {
      actions.push({
        id: 'use',
        label: def.effect.kind === 'intel' ? t('ui.inventory.decipher') : t('ui.inventory.use'),
        disabled: live.inCombat,
        title: live.inCombat ? t('ui.inventory.cannotUseCombat') : undefined,
        onSelect: () => live.applyItem(target.uid),
      });
    }
    if (def.effect.kind === 'magazine' && !live.inCombat) {
      const ammo = live.items.find((i) => {
        if (i.container !== BACKPACK) return false;
        const aDef = itemDef(normalizeAmmoDefId(i.defId));
        return aDef.effect.kind === 'ammo' && def.effect.kind === 'magazine' && aDef.effect.caliber === def.effect.caliber;
      });
      if (ammo) {
        actions.unshift({
          id: 'refillMag',
          label: t('ui.inventory.refillMag'),
          onSelect: () => live.refillMagazine(target.uid, ammo.uid),
        });
      }
    }
    if (def.effect.kind === 'weapon' && def.effect.ranged && def.slot === 'firearm') {
      const holstered = live.equipment.firearm?.uid === target.uid;
      if (holstered && !def.effect.usesMagazine && !live.inCombat) {
        const ammo = live.items.find((i) => {
          if (i.container !== BACKPACK) return false;
          const aDef = itemDef(normalizeAmmoDefId(i.defId));
          return aDef.effect.kind === 'ammo' && def.effect.kind === 'magazine' && aDef.effect.caliber === def.effect.caliber;
        });
        if (ammo) {
          actions.unshift({
            id: 'refillGun',
            label: t('ui.inventory.refillGun'),
            onSelect: () => live.refillFirearm(ammo.uid),
          });
        }
      }
    }
    if (def.effect.kind === 'magazine' && live.equipment.firearm && !live.inCombat) {
      const gunDef = itemDef(live.equipment.firearm.defId);
      if (
        gunDef.effect.kind === 'weapon' &&
        gunDef.effect.ranged &&
        def.effect.kind === 'magazine' &&
        gunDef.effect.caliber === def.effect.caliber
      ) {
        actions.unshift({
          id: 'loadGun',
          label: t('ui.inventory.loadMag'),
          onSelect: () => live.loadGunFromMagazine(target.uid),
        });
      }
    }
    if (def.slot) {
      actions.push({
        id: 'equip',
        label: t('ui.inventory.equip'),
        onSelect: () => {
          live.equipItem(target.uid, def.slot!);
          setSelectedUid(null);
        },
      });
      if (canEquip(def, 'offHand') && def.slot !== 'offHand') {
        const blocked = isTwoHandedEquipped(live.equipment);
        actions.push({
          id: 'equipOffHand',
          label: t('ui.inventory.equipOffHand'),
          disabled: blocked,
          title: blocked ? t('ui.inventory.twoHandBlocked') : undefined,
          onSelect: () => {
            live.equipItem(target.uid, 'offHand');
            setSelectedUid(null);
          },
        });
      }
    }
    if (target.container === BACKPACK || target.container === LOOSE) {
      const toLoose = target.container === BACKPACK;
      actions.push({
        id: 'loose',
        label: toLoose ? t('ui.inventory.carryLoose') : t('ui.inventory.pack'),
        onSelect: () => live.transferItem(target.uid, toLoose ? LOOSE : BACKPACK),
      });
    }
    if (live.stashContainer) {
      const toStash = isCarried(target.container);
      actions.push({
        id: 'transfer',
        label: toStash ? t('ui.inventory.stash') : t('ui.inventory.pack'),
        onSelect: () =>
          live.transferItem(target.uid, toStash ? live.stashContainer! : BACKPACK),
      });
    }
    actions.push({
      id: 'drop',
      label: t('ui.inventory.drop'),
      danger: true,
      title: t('ui.inventory.dropGone'),
      onSelect: () => requestDiscard(groupFor(target.uid)),
    });
    return actions;
  };

  const ctxInst = ctxMenu ? findInst(ctxMenu.uid) : null;
  const ctxActions = ctxInst ? itemActionsFor(ctxInst) : [];
  const peekActions =
    hoverInst && cardActions && hover?.pinned
      ? itemActionsFor(hoverInst).map((a) => ({
          ...a,
          onSelect: () => {
            dismissHover();
            a.onSelect();
          },
        }))
      : undefined;

  return (
    <InventoryInteractionContext.Provider value={api}>
      {children}
      {dragGhost &&
        drag &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[900] flex flex-col items-center justify-center rounded opacity-90 shadow-lg"
            style={{
              left: drag.clientX - drag.grabDX / drag.cellSize * dragGhost.cell,
              top: drag.clientY - drag.grabDY / drag.cellSize * dragGhost.cell,
              width: dragGhost.w * dragGhost.cell - 2,
              height: dragGhost.h * dragGhost.cell - 2,
              background: discarding ? '#e0342b88' : `${tileColor(dragGhost.def)}aa`,
              boxShadow: discarding
                ? 'inset 0 0 0 2px #e0342b'
                : `inset 0 0 0 1px ${tileColor(dragGhost.def)}`,
            }}
          >
            <Icon
              name={itemIcon(dragGhost.def)}
              size={Math.max(18, Math.min(dragGhost.w, dragGhost.h) * dragGhost.cell - 16)}
              className="drop-shadow"
            />
            {drag.uids.length > 1 && (
              <span className="absolute -right-2 -top-2 rounded-full bg-signal px-1.5 text-micro font-bold leading-tight text-black tabular-nums">
                {drag.uids.length}
              </span>
            )}
            {discarding && (
              <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-hiss px-1.5 py-0.5 text-micro font-bold uppercase tracking-wider text-black">
                {t('ui.inventory.discard.ghost')}
              </span>
            )}
          </div>,
          document.body,
        )}
      {hoverInst && hover && (
        <ItemHoverCard
          inst={hoverInst}
          equipment={equipment}
          equipSlot={equippedSlotOf(hoverInst.uid)}
          clientX={hover.clientX}
          clientY={hover.clientY}
          anchorEl={hover.pinned ? hover.el : null}
          stacked={isPhone}
          actions={peekActions}
          pinPending={!hover.pinned && !coarse}
          onClose={hover.pinned ? dismissHover : undefined}
        />
      )}
      {discardUids && (
        <DiscardConfirm
          uids={discardUids}
          onCancel={() => setDiscardUids(null)}
          onConfirm={(dontAsk) => {
            const live = liveRef.current;
            for (const u of discardUids) live.dropItem(u);
            if (dontAsk) useSettings.getState().setSetting('confirmDiscard', 'off');
            setDiscardUids(null);
            setMultiUids([]);
            setSelectedUid(null);
          }}
        />
      )}
      {ctxMenu && ctxInst && ctxActions.length > 0 && (
        <ItemContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          actions={ctxActions}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </InventoryInteractionContext.Provider>
  );
}
