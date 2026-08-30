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
  canEquip,
  canPlace,
  dimsFor,
  footprint,
  isTwoHandedEquipped,
  TEMP_STASH,
} from '../../game/inventory';
import { tileColor } from '../../game/itemTileColor';
import type { Container, EquipSlot, ItemInstance } from '../../game/types';
import { useCoarsePointer } from '../TipHint';
import { useIsPhoneLayout } from '../HdbZoomViewport';
import { HOVER_DELAY_MS, LONG_PRESS_MS } from '../tips';
import { CELL, type DragPreview } from './InventoryGrid';
import { EQUIP_SLOTS } from './equipSlots';
import { isConsumableUsable } from './itemStatLines';
import { ItemHoverCard } from './ItemHoverCard';
import { ItemContextMenu, type ContextMenuAction } from './ItemContextMenu';
import { Icon } from '../../icons/Icon';
import { itemIcon } from './itemIcon';
import { useT } from '../../i18n';

interface GridDrop {
  type: 'grid';
  container: Container;
  cellX: number;
  cellY: number;
  w: number;
  h: number;
  valid: boolean;
}
interface SlotDrop {
  type: 'slot';
  slot: EquipSlot;
  valid: boolean;
}
type DropTarget = GridDrop | SlotDrop | null;

interface DragState {
  uid: string;
  pointerId: number;
  grabDX: number;
  grabDY: number;
  rotated: boolean;
  clientX: number;
  clientY: number;
  target: DropTarget;
}

const DRAG_THRESHOLD_PX = 6;

interface PendingDrag {
  uid: string;
  pointerId: number;
  startX: number;
  startY: number;
  grabDX: number;
  grabDY: number;
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
  dragUid: string | null;
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
  const equipItem = useGame((s) => s.equipItem);
  const unequipItem = useGame((s) => s.unequipItem);
  const dropItem = useGame((s) => s.dropItem);
  const refillMagazine = useGame((s) => s.refillMagazine);
  const loadGunFromMagazine = useGame((s) => s.loadGunFromMagazine);
  const refillFirearm = useGame((s) => s.refillFirearm);
  const tunnel = useGame((s) => s.tunnel);
  const inCombat = useGame((s) => !!s.combat && !s.combat.over);

  const { t } = useT();
  const isPhone = useIsPhoneLayout();
  const coarse = useCoarsePointer();
  const pcShortcuts = !isPhone && !coarse;
  /** Coarse + desktop chrome: peek card is the only Use / Equip surface. */
  const cardActions = coarse && !isPhone;

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<HoverTarget | null>(null);
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
  });
  liveRef.current = {
    items,
    equipment,
    stashContainer,
    hasTempStash,
    tunnel,
    moveItem,
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
  };

  const clearHoverTimer = () => {
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
    for (const { slot } of EQUIP_SLOTS) {
      const el = slotRefs.current[slot];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        let valid = canEquip(def, slot);
        if (valid && slot === 'offHand' && isTwoHandedEquipped(liveEq)) valid = false;
        return { type: 'slot', slot, valid };
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
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      const dims = dimsFor(container);
      const grabDX = dragRef.current?.grabDX ?? 0;
      const grabDY = dragRef.current?.grabDY ?? 0;
      let cellX = Math.round((clientX - r.left - grabDX) / CELL);
      let cellY = Math.round((clientY - r.top - grabDY) / CELL);
      cellX = Math.max(0, Math.min(dims.w - w, cellX));
      cellY = Math.max(0, Math.min(dims.h - h, cellY));
      const valid = canPlace(container, liveItems, { x: cellX, y: cellY, w, h }, inst.uid);
      return { type: 'grid', container, cellX, cellY, w, h, valid };
    }
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
      pointerId: pending.pointerId,
      grabDX: pending.grabDX,
      grabDY: pending.grabDY,
      rotated: pending.rotated,
      clientX,
      clientY,
      target: hitTest(clientX, clientY, inst, pending.rotated),
    };
    dragRef.current = next;
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
    const { items: liveItems, moveItem: move, equipItem: equip } = liveRef.current;
    const inst = liveItems.find((i) => i.uid === current.uid);
    const t = current.target;
    if (inst && t) {
      if (t.type === 'grid' && t.valid) {
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
    const live = liveRef.current;
    setCtxMenu(null);

    // Ctrl/Cmd+click → quick stash / pack transfer (PC only).
    if (live.pcShortcuts && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      const slot = EQUIP_SLOTS.find(({ slot: s }) => live.equipment[s]?.uid === inst.uid)?.slot;
      if (slot) return;
      if (!live.stashContainer) return;
      const dest = inst.container === BACKPACK ? live.stashContainer : BACKPACK;
      live.transferItem(inst.uid, dest);
      setSelectedUid(inst.uid);
      return;
    }

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
    const onGrid = live.items.some((i) => i.uid === inst.uid);
    if (!onGrid) return;

    const el = gridRefs.current[inst.container];
    if (!el) return;
    const r = el.getBoundingClientRect();
    pendingDrag.current = {
      uid: inst.uid,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabDX: e.clientX - (r.left + inst.x * CELL),
      grabDY: e.clientY - (r.top + inst.y * CELL),
      rotated: inst.rotated,
      el: e.currentTarget as HTMLElement,
    };
  }, [dismissHover]);

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
      if (dragRef.current) return;
      clearHoverTimer();
      hoverUidRef.current = inst.uid;
      const { clientX, clientY } = e;
      const el = e.currentTarget as HTMLElement;
      hoverTimer.current = setTimeout(() => {
        if (hoverUidRef.current !== inst.uid || dragRef.current) return;
        setHover({ uid: inst.uid, clientX, clientY, el, pinned: false });
      }, HOVER_DELAY_MS);
    },
    [],
  );

  const onItemPointerLeave = useCallback((inst: ItemInstance) => {
    if (liveRef.current.coarse) return;
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
      endDrag(e.pointerId);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const current = dragRef.current;
      if (!current) return;
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
      dragRef.current = next;
      setDrag(next);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      clearHoverTimer();
      clearHoldTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gridPreview = useCallback(
    (container: Container): DragPreview | null => {
      if (!drag || drag.target?.type !== 'grid' || drag.target.container !== container) return null;
      const t = drag.target;
      return { grid: container, cellX: t.cellX, cellY: t.cellY, w: t.w, h: t.h, valid: t.valid };
    },
    [drag],
  );

  const registerGrid = useCallback((container: Container, el: HTMLDivElement | null) => {
    gridRefs.current[container] = el;
  }, []);

  const registerSlot = useCallback((slot: EquipSlot, el: HTMLDivElement | null) => {
    slotRefs.current[slot] = el;
  }, []);

  const api = useMemo<InventoryInteractionApi>(
    () => ({
      selectedUid,
      setSelectedUid,
      dragUid: drag?.uid ?? null,
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
    return { inst, def: gDef, w, h };
  })();

  const hoverInst = hover && !drag ? findInst(hover.uid) : null;

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
    if (live.stashContainer) {
      const toStash = target.container === BACKPACK;
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
      onSelect: () => {
        live.dropItem(target.uid);
        setSelectedUid(null);
      },
    });
    return actions;
  };

  const ctxInst = ctxMenu ? findInst(ctxMenu.uid) : null;
  const ctxActions = ctxInst ? itemActionsFor(ctxInst) : [];
  const peekActions =
    hoverInst && cardActions
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
              left: drag.clientX - drag.grabDX,
              top: drag.clientY - drag.grabDY,
              width: dragGhost.w * CELL - 2,
              height: dragGhost.h * CELL - 2,
              background: `${tileColor(dragGhost.def)}aa`,
              boxShadow: `inset 0 0 0 1px ${tileColor(dragGhost.def)}`,
            }}
          >
            <Icon
              name={itemIcon(dragGhost.def)}
              size={Math.min(dragGhost.w, dragGhost.h) > 1 ? 26 : 18}
              className="drop-shadow"
            />
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
          onClose={hover.pinned ? dismissHover : undefined}
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
