import { useRef, useState } from 'react';
import { useGame } from '../../game/store';
import { itemDef } from '../../game/loot';
import {
  BACKPACK,
  canEquip,
  canPlace,
  canTearForRags,
  conditionOf,
  conditionPct,
  containerWeight,
  effectiveDamage,
  equipDefenseBonus,
  dimsFor,
  footprint,
  hasCondition,
  instanceValue,
  isBroken,
  isEncumbered,
  isTwoHandedEquipped,
  maxCarry,
  tierLabel,
  tierOf,
  TEAR_CONDITION_COST,
  TEAR_RAGS_YIELD,
} from '../../game/inventory';
import type { Container, Equipment, EquipSlot, ItemInstance } from '../../game/types';
import { sumTraitMod } from '../../game/character';
import {
  countOf,
  describeInputs,
  FIELD_REPAIRS,
  REPAIR_INPUTS,
  REPAIR_TOOL,
} from '../../game/crafting';
import { CELL, InventoryGrid, type DragPreview } from './InventoryGrid';
import { itemIcon } from './itemIcon';
import { Icon } from '../../icons/Icon';
import type { IconName } from '../../icons/keys';

const EQUIP_SLOTS: { slot: EquipSlot; label: string; icon: IconName }[] = [
  { slot: 'head', label: 'Head', icon: 'slot.head' },
  { slot: 'body', label: 'Body', icon: 'slot.body' },
  { slot: 'hands', label: 'Hands', icon: 'slot.hands' },
  { slot: 'legs', label: 'Legs', icon: 'slot.legs' },
  { slot: 'feet', label: 'Feet', icon: 'slot.feet' },
  { slot: 'bag', label: 'Bag', icon: 'slot.bag' },
  { slot: 'mainHand', label: 'Main', icon: 'slot.mainHand' },
  { slot: 'offHand', label: 'Off', icon: 'slot.offHand' },
];

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
  grabDX: number;
  grabDY: number;
  target: DropTarget;
}

const DRAG_THRESHOLD_PX = 8;

interface PendingDrag {
  uid: string;
  pointerId: number;
  startX: number;
  startY: number;
  grabDX: number;
  grabDY: number;
  el: HTMLElement;
}

export function InventoryPanel({ onClose }: { onClose?: () => void }) {
  const items = useGame((s) => s.items);
  const equipment = useGame((s) => s.equipment);
  const character = useGame((s) => s.character);
  const currentPositionId = useGame((s) => s.currentPositionId);
  const locations = useGame((s) => s.locations);
  const useItem = useGame((s) => s.useItem);
  const rotateItem = useGame((s) => s.rotateItem);
  const transferItem = useGame((s) => s.transferItem);
  const moveItem = useGame((s) => s.moveItem);
  const equipItem = useGame((s) => s.equipItem);
  const unequipItem = useGame((s) => s.unequipItem);
  const dropItem = useGame((s) => s.dropItem);
  const repairItem = useGame((s) => s.repairItem);
  const tearForRags = useGame((s) => s.tearForRags);
  const rounds = useGame((s) => s.rounds);
  const inCombat = useGame((s) => !!s.combat && !s.combat.over);

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [hoveredEquipSlot, setHoveredEquipSlot] = useState<EquipSlot | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const pendingDrag = useRef<PendingDrag | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

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
  });

  const hereLoc = currentPositionId ? locations[currentPositionId] : null;
  const tunnel = useGame((s) => s.tunnel);
  const confirmTempStash = useGame((s) => s.confirmTempStash);
  const hasTempStash = items.some((i) => i.container === 'temp:crawl');
  // Mid-tunnel: location stash is unreachable — only pack + temp overflow.
  const stashContainer = tunnel || !hereLoc ? null : hereLoc.id;

  const hitTest = (clientX: number, clientY: number, inst: ItemInstance): DropTarget => {
    const def = itemDef(inst.defId);
    // equipment slots first
    for (const { slot } of EQUIP_SLOTS) {
      const el = slotRefs.current[slot];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        let valid = canEquip(def, slot);
        if (valid && slot === 'offHand' && isTwoHandedEquipped(equipment)) valid = false;
        if (valid && slot === 'mainHand' && def.twoHanded && equipment.offHand) {
          // Still valid — equip will stow offHand; preview as ok
        }
        return { type: 'slot', slot, valid };
      }
    }
    // grids
    const { w, h } = footprint(def, inst.rotated);
    const grids = [
      BACKPACK,
      ...(stashContainer ? [stashContainer] : []),
      ...(hasTempStash || tunnel ? ['temp:crawl'] : []),
    ];
    for (const container of grids) {
      const el = gridRefs.current[container];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      const dims = dimsFor(container);
      let cellX = Math.round((clientX - r.left - (dragRef.current?.grabDX ?? 0)) / CELL);
      let cellY = Math.round((clientY - r.top - (dragRef.current?.grabDY ?? 0)) / CELL);
      cellX = Math.max(0, Math.min(dims.w - w, cellX));
      cellY = Math.max(0, Math.min(dims.h - h, cellY));
      const valid = canPlace(container, items, { x: cellX, y: cellY, w, h }, inst.uid);
      return { type: 'grid', container, cellX, cellY, w, h, valid };
    }
    return null;
  };

  const onItemPointerDown = (e: React.PointerEvent, inst: ItemInstance) => {
    // Select immediately; only start a drag after the pointer moves past a
    // threshold so the slide-out can still scroll on touch.
    setSelectedUid(inst.uid);
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
      el: e.currentTarget as HTMLElement,
    };
  };

  const beginDrag = (pending: PendingDrag) => {
    pendingDrag.current = null;
    const next: DragState = {
      uid: pending.uid,
      grabDX: pending.grabDX,
      grabDY: pending.grabDY,
      target: null,
    };
    dragRef.current = next;
    setDrag(next);
    try {
      pending.el.setPointerCapture(pending.pointerId);
    } catch {
      /* synthetic events */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pending = pendingDrag.current;
    if (pending && pending.pointerId === e.pointerId && !dragRef.current) {
      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        // Horizontal intent → drag; mostly vertical → let the panel scroll.
        if (Math.abs(dx) >= Math.abs(dy) * 0.6) {
          e.preventDefault();
          beginDrag(pending);
        } else {
          pendingDrag.current = null;
          return;
        }
      } else {
        return;
      }
    }

    const current = dragRef.current;
    if (!current) return;
    const inst = items.find((i) => i.uid === current.uid);
    if (!inst) return;
    const next = { ...current, target: hitTest(e.clientX, e.clientY, inst) };
    dragRef.current = next;
    setDrag(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (pendingDrag.current?.pointerId === e.pointerId) {
      pendingDrag.current = null;
    }
    const current = dragRef.current;
    if (!current) return;
    const inst = items.find((i) => i.uid === current.uid);
    const t = current.target;
    if (inst && t) {
      if (t.type === 'grid' && t.valid) moveItem(current.uid, t.container, t.cellX, t.cellY, inst.rotated);
      else if (t.type === 'slot' && t.valid) equipItem(current.uid, t.slot);
    }
    dragRef.current = null;
    setDrag(null);
  };

  const gridPreview = (container: Container): DragPreview | null => {
    if (!drag || drag.target?.type !== 'grid' || drag.target.container !== container) return null;
    const t = drag.target;
    return { grid: container, cellX: t.cellX, cellY: t.cellY, w: t.w, h: t.h, valid: t.valid };
  };

  const equippedList = EQUIP_SLOTS.map(({ slot }) => equipment[slot]).filter(
    (i): i is ItemInstance => i != null,
  );
  const selected =
    items.find((i) => i.uid === selectedUid) ??
    equippedList.find((i) => i.uid === selectedUid) ??
    null;
  const hoveredEquip =
    !drag && hoveredEquipSlot ? equipment[hoveredEquipSlot] : null;
  // Hover peeks into the inspect box; click locks selection and unlocks actions.
  const inspected = hoveredEquip ?? selected;
  const showActions = selected != null && inspected?.uid === selected.uid;
  const equippedSlotOf = (uid: string): EquipSlot | null =>
    EQUIP_SLOTS.find(({ slot }) => equipment[slot]?.uid === uid)?.slot ?? null;
  const inspectedEquipSlot = inspected ? equippedSlotOf(inspected.uid) : null;

  const def = inspected ? itemDef(inspected.defId) : null;
  const usable =
    def &&
    def.effect.kind !== 'misc' &&
    def.effect.kind !== 'weapon' &&
    def.effect.kind !== 'fuel' &&
    !inspectedEquipSlot;
  const canRotate = def && def.w !== def.h && !inspectedEquipSlot;

  // A whetstone or a bottle of gun oil fixes its own kind of weapon on the
  // spot; anything else needs the toolbox and a place to sit down.
  const fieldKit =
    def?.effect.kind === 'weapon'
      ? FIELD_REPAIRS.find(
          (f) => f.melee !== (def.effect as { ranged: boolean }).ranged && countOf(items, f.defId) > 0,
        )
      : undefined;
  const repairable = inspected != null && hasCondition(inspected) && conditionOf(inspected) < 100;
  // Cloth is the last line against a bleed, so cutting a garment up is offered
  // right here rather than buried in crafting — you reach for it mid-crisis.
  const tearable =
    inspected != null &&
    def != null &&
    canTearForRags(def) &&
    conditionOf(inspected) >= TEAR_CONDITION_COST;

  // Ammunition only matters once a ranged weapon is in hand.
  const hasFirearm = !!(
    equipment.mainHand && (itemDef(equipment.mainHand.defId).effect as { ranged?: boolean }).ranged
  );

  const carryMod = character ? sumTraitMod(character.traitIds, 'carryCapacityMod') : 0;
  const carry = character ? maxCarry(character.attributes, equipment, carryMod) : 0;
  const load = containerWeight(items, BACKPACK);
  const encumbered = character
    ? isEncumbered(items, character.attributes, equipment, carryMod)
    : false;
  const loadPct = carry > 0 ? (load / carry) * 100 : 0;

  return (
    <div
      className="flex flex-col gap-3"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {onClose && (
        <div className="flex justify-end">
          <button onClick={onClose} className="text-white/50 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Fixed height so hover content can't shove equipment slots out from under the cursor */}
      <div className="flex h-44 overflow-hidden rounded-lg border border-white/10 bg-black/40 p-3">
        {inspected && def ? (
          <div className="flex min-h-0 w-full gap-3">
            {/* Left: what it is */}
            <div className="min-h-0 w-4/5 overflow-y-auto pr-1">
              <div className="flex items-start gap-3">
                <Icon name={itemIcon(def)} size={30} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold">{def.name}</span>
                    {def.exotic && (
                      <span className="rounded bg-amber-300/15 px-1.5 text-2xs uppercase tracking-wide text-amber-300">
                        Exotic
                      </span>
                    )}
                  </div>
                  <div className="text-xs uppercase tracking-wide text-white/40">
                    {itemKind(def)} ·{' '}
                    {inspectedEquipSlot
                      ? `equipped · ${EQUIP_SLOTS.find((s) => s.slot === inspectedEquipSlot)!.label}`
                      : inspected.container === BACKPACK
                        ? 'backpack'
                        : 'stash'}
                  </div>
                </div>
              </div>
              <div className="mt-2 space-y-1">
                {statLines(def, inspected, equipment).map((line) => (
                  <div
                    key={line.key}
                    className="flex items-center justify-between gap-2 text-xs text-white/70"
                  >
                    <span>{line.label}</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <span>{line.value}</span>
                      {line.delta === 'up' && (
                        <span className="font-bold text-signal" title="Better than equipped">
                          ▲
                        </span>
                      )}
                      {line.delta === 'new' && (
                        <span className="font-bold text-signal" title="New bonus vs equipped">
                          ＋
                        </span>
                      )}
                      {line.delta === 'down' && (
                        <span className="text-hiss/80" title="Worse than equipped">
                          ▼
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Wear is the item's headline stat once things start breaking, so
                  it gets its own row rather than a footnote among the sizes. */}
              {hasCondition(inspected) && (
                <div className="mt-2">
                  <div className="flex items-baseline justify-between text-xs">
                    <span
                      className={
                        isBroken(inspected)
                          ? 'font-semibold text-hiss'
                          : 'uppercase tracking-wide text-white/50'
                      }
                    >
                      {isBroken(inspected)
                        ? 'Broken — unusable until repaired'
                        : tierLabel(tierOf(inspected))}
                    </span>
                    <span className="text-white/40">{conditionPct(inspected)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${
                        conditionOf(inspected) < 25
                          ? 'bg-hiss'
                          : conditionOf(inspected) < 50
                            ? 'bg-amber-400'
                            : 'bg-signal'
                      }`}
                      style={{ width: `${conditionPct(inspected)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/40">
                <span>
                  Size {def.w}×{def.h}
                </span>
                <span>{def.weight.toFixed(1)} kg</span>
                <span>Value {instanceValue(inspected)}</span>
                {def.stackable && inspected.stack > 1 && <span>×{inspected.stack} stacked</span>}
              </div>
            </div>

            {/* Right: what you can do with it */}
            <div className="flex w-1/5 min-h-0 flex-col gap-1 overflow-y-auto">
              {showActions ? (
                <>
                  {inspectedEquipSlot ? (
                    <button
                      onClick={() => {
                        unequipItem(inspectedEquipSlot);
                        setSelectedUid(null);
                      }}
                      className="w-full rounded border border-astral/40 bg-astral/10 px-1.5 py-1 text-xs leading-tight text-astral hover:bg-astral/20"
                    >
                      Unequip
                    </button>
                  ) : (
                    <>
                      {usable && (
                        <button
                          onClick={() => useItem(inspected.uid)}
                          disabled={inCombat}
                          title={inCombat ? 'Cannot use items during combat' : undefined}
                          className={`w-full rounded px-1.5 py-1 text-xs font-semibold leading-tight ${
                            inCombat
                              ? 'cursor-not-allowed bg-white/10 text-white/30'
                              : 'bg-signal/80 text-black hover:bg-signal'
                          }`}
                        >
                          Use
                        </button>
                      )}
                      {def.slot && (
                        <button
                          onClick={() => {
                            equipItem(inspected.uid, def.slot!);
                            setSelectedUid(null);
                          }}
                          className="w-full rounded border border-astral/40 bg-astral/10 px-1.5 py-1 text-xs leading-tight text-astral hover:bg-astral/20"
                        >
                          Equip
                        </button>
                      )}
                      {canRotate && (
                        <button
                          onClick={() => rotateItem(inspected.uid)}
                          className="w-full rounded bg-white/10 px-1.5 py-1 text-xs leading-tight hover:bg-white/20"
                        >
                          ⟳ Rotate
                        </button>
                      )}
                      {stashContainer && (
                        <button
                          onClick={() =>
                            transferItem(
                              inspected.uid,
                              inspected.container === BACKPACK ? stashContainer : BACKPACK,
                            )
                          }
                          className="w-full rounded bg-white/10 px-1.5 py-1 text-xs leading-tight hover:bg-white/20"
                        >
                          → {inspected.container === BACKPACK ? 'Stash' : 'Pack'}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          dropItem(inspected.uid);
                          setSelectedUid(null);
                        }}
                        className="w-full rounded border border-hiss/40 px-1.5 py-1 text-xs leading-tight text-hiss/80 hover:bg-hiss/10"
                        title="Gone for good — but the weight goes with it"
                      >
                        Drop
                      </button>
                    </>
                  )}
                  {repairable && (
                    <button
                      onClick={() => repairItem(inspected.uid, fieldKit?.defId)}
                      className="w-full rounded border border-amber-300/40 bg-amber-300/10 px-1.5 py-1 text-xs leading-tight text-amber-200 hover:bg-amber-300/20"
                      title={
                        fieldKit
                          ? `Uses 1× ${itemDef(fieldKit.defId).name}`
                          : `Uses ${describeInputs(REPAIR_INPUTS)} and a ${itemDef(REPAIR_TOOL).name}`
                      }
                    >
                      Repair
                    </button>
                  )}
                  {tearable && (
                    <button
                      onClick={() => tearForRags(inspected.uid)}
                      className="w-full rounded bg-white/10 px-1.5 py-1 text-xs leading-tight hover:bg-white/20"
                      title={`Costs ${TEAR_CONDITION_COST}% condition — yields ${TEAR_RAGS_YIELD}× Cloth Rags for dressings`}
                    >
                      ✂ Rags
                    </button>
                  )}
                </>
              ) : (
                <p className="text-center text-2xs leading-snug text-white/25">
                  Click to act
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="m-auto text-center text-xs text-white/30">
            Select an item to inspect it. Drag onto an equipment slot to equip.
          </p>
        )}
      </div>

      {/* Equipment slots — hover peeks into inspect; click locks actions */}
      <div className="grid grid-cols-4 gap-2">
        {EQUIP_SLOTS.map(({ slot, label, icon }) => {
          const inst = equipment[slot];
          const eDef = inst ? itemDef(inst.defId) : null;
          const highlighted = drag?.target?.type === 'slot' && drag.target.slot === slot;
          const selectedHere = inst != null && selectedUid === inst.uid;
          const twoHandBlocked =
            slot === 'offHand' && isTwoHandedEquipped(equipment) && !inst;
          return (
            <div
              key={slot}
              ref={(el) => {
                slotRefs.current[slot] = el;
              }}
              onMouseEnter={() => {
                if (inst) setHoveredEquipSlot(slot);
              }}
              onMouseLeave={() => setHoveredEquipSlot((cur) => (cur === slot ? null : cur))}
              onClick={() => {
                if (inst) setSelectedUid(inst.uid);
              }}
              className={`relative flex min-h-[64px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded border p-1.5 text-center ${
                highlighted
                  ? drag?.target && 'valid' in drag.target && drag.target.valid
                    ? 'border-signal bg-signal/20'
                    : 'border-hiss bg-hiss/10'
                  : selectedHere
                    ? 'border-signal bg-signal/10'
                    : twoHandBlocked
                      ? 'border-white/5 bg-black/20 opacity-50'
                      : 'border-white/10 bg-black/40'
              } ${inst ? 'cursor-pointer' : ''}`}
              title={twoHandBlocked ? 'Blocked by two-handed weapon' : undefined}
            >
              <span className="text-2xs uppercase tracking-wide text-white/40">{label}</span>
              {eDef && inst ? (
                <Icon name={itemIcon(eDef)} size={18} />
              ) : twoHandBlocked ? (
                <span className="text-2xs text-white/25">2H</span>
              ) : (
                <Icon name={icon} size={24} className="opacity-20" />
              )}
              {inst && hasCondition(inst) && (
                <div className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${
                      conditionOf(inst) < 25
                        ? 'bg-hiss'
                        : conditionOf(inst) < 50
                          ? 'bg-amber-400'
                          : 'bg-signal'
                    }`}
                    style={{ width: `${conditionPct(inst)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <InventoryGrid
        grid={BACKPACK}
        title="Backpack"
        items={items}
        selectedUid={selectedUid}
        draggingUid={drag?.uid ?? null}
        preview={gridPreview(BACKPACK)}
        gridRef={(el) => (gridRefs.current[BACKPACK] = el)}
        onItemPointerDown={onItemPointerDown}
      />

      {hasTempStash && (
        <div className="rounded-lg border border-amber-300/30 bg-amber-300/5 p-2">
          <InventoryGrid
            grid="temp:crawl"
            title="Temp stash (tunnel)"
            items={items}
            selectedUid={selectedUid}
            draggingUid={drag?.uid ?? null}
            preview={gridPreview('temp:crawl')}
            gridRef={(el) => {
              gridRefs.current['temp:crawl'] = el;
            }}
            onItemPointerDown={onItemPointerDown}
          />
          <button
            type="button"
            onClick={() => confirmTempStash()}
            className="mt-2 w-full rounded bg-signal/80 py-1.5 text-xs font-bold text-black hover:bg-signal"
          >
            Confirm — abandon leftover & continue
          </button>
        </div>
      )}

      {tunnel && !hasTempStash && (
        <p className="text-2xs text-white/35">Location stash locked while in the tunnels.</p>
      )}

      {/* Carry gauge — compact under the backpack it measures */}
      <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="uppercase tracking-widest text-white/40">Carry</span>
          <span className="flex items-baseline gap-2">
            {hasFirearm && (
              <span className={rounds === 0 ? 'font-semibold text-hiss' : 'text-white/50'}>
                {rounds} rounds
              </span>
            )}
            <span className={encumbered ? 'font-semibold text-hiss' : 'text-white/60'}>
              {load.toFixed(1)} / {carry} kg{encumbered ? ' · Encumbered' : ''}
            </span>
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${
              encumbered ? 'bg-hiss' : loadPct > 80 ? 'bg-amber-400' : 'bg-signal'
            }`}
            style={{ width: `${Math.min(100, loadPct)}%` }}
          />
        </div>
      </div>

      {stashContainer && (
        <InventoryGrid
          grid={stashContainer}
          title={`Stash · ${hereLoc!.name}`}
          items={items}
          selectedUid={selectedUid}
          draggingUid={drag?.uid ?? null}
          preview={gridPreview(stashContainer)}
          gridRef={(el) => (gridRefs.current[stashContainer] = el)}
          onItemPointerDown={onItemPointerDown}
        />
      )}
    </div>
  );
}

function itemKind(def: ReturnType<typeof itemDef>): string {
  if (def.slot) return def.effect.kind === 'weapon' ? 'Weapon' : 'Armour';
  switch (def.effect.kind) {
    case 'food':
      return 'Food';
    case 'water':
      return 'Drink';
    case 'heal':
      return 'Medical';
    case 'cure':
      return 'Medical';
    case 'energy':
      return 'Stimulant';
    case 'fuel':
      return 'Fuel';
    default:
      return 'Misc';
  }
}

/**
 * Inspect rows with optional compare vs the piece currently in the same slot.
 * ▲ better · ＋ new affix · ▼ worse.
 */
function statLines(
  def: ReturnType<typeof itemDef>,
  inst: ItemInstance,
  equipment: Equipment,
): { key: string; label: string; value: string; delta?: 'up' | 'down' | 'new' }[] {
  const lines: { key: string; label: string; value: string; delta?: 'up' | 'down' | 'new' }[] = [];
  const e = def.effect;
  const compare =
    def.slot && equipment[def.slot]?.uid !== inst.uid ? equipment[def.slot] : null;
  const cmpDef = compare ? itemDef(compare.defId) : null;
  const cmpM = cmpDef?.modifiers ?? {};
  const m = def.modifiers ?? {};

  const numDelta = (mine: number, theirs: number | undefined): 'up' | 'down' | 'new' | undefined => {
    if (theirs === undefined || theirs === 0) return mine !== 0 ? 'new' : undefined;
    if (mine > theirs) return 'up';
    if (mine < theirs) return 'down';
    return undefined;
  };

  if (e.kind === 'weapon') {
    const dmg = effectiveDamage(inst);
    const theirs = compare ? effectiveDamage(compare) : undefined;
    lines.push({
      key: 'dmg',
      label: 'Damage',
      value: dmg === e.damage ? `${dmg}` : `${dmg} (of ${e.damage})`,
      delta: theirs !== undefined ? numDelta(dmg, theirs) : undefined,
    });
  }
  if (m.defenseBonus) {
    const v = equipDefenseBonus(inst);
    lines.push({
      key: 'def',
      label: 'Defence',
      value: `+${v}`,
      delta: numDelta(v, compare ? equipDefenseBonus(compare) : undefined),
    });
  }
  if (m.limbArmor) {
    lines.push({
      key: 'soak',
      label: 'Soak',
      value: `${m.limbArmor}`,
      delta: numDelta(m.limbArmor, cmpM.limbArmor),
    });
  }
  if (m.statusResist) {
    lines.push({
      key: 'status',
      label: 'Status resist',
      value: `${Math.round(m.statusResist * 100)}%`,
      delta: numDelta(m.statusResist, cmpM.statusResist),
    });
  }
  if (m.attackBonus) {
    lines.push({
      key: 'atk',
      label: 'Attack',
      value: `${m.attackBonus > 0 ? '+' : ''}${m.attackBonus}`,
      delta: numDelta(m.attackBonus, cmpM.attackBonus),
    });
  }
  if (m.accuracyBonus) {
    lines.push({
      key: 'acc',
      label: 'Accuracy',
      value: `+${m.accuracyBonus}`,
      delta: numDelta(m.accuracyBonus, cmpM.accuracyBonus),
    });
  }
  if (m.speedBonus) {
    lines.push({
      key: 'spd',
      label: 'Speed',
      value: `+${m.speedBonus.toFixed(1)}`,
      delta: numDelta(m.speedBonus, cmpM.speedBonus),
    });
  }
  if (m.dodgeBonus) {
    lines.push({
      key: 'dodge',
      label: 'Dodge',
      value: `${m.dodgeBonus > 0 ? '+' : ''}${Math.round(m.dodgeBonus * 100)}%`,
      delta: numDelta(m.dodgeBonus, cmpM.dodgeBonus),
    });
  }
  if (m.travelSpeedBonus) {
    lines.push({
      key: 'travel',
      label: 'Travel',
      value: `${m.travelSpeedBonus > 0 ? '+' : ''}${Math.round(m.travelSpeedBonus * 100)}%`,
      delta: numDelta(m.travelSpeedBonus, cmpM.travelSpeedBonus),
    });
  }
  if (m.encounterChanceMod) {
    lines.push({
      key: 'enc',
      label: 'Encounters',
      value: `${m.encounterChanceMod > 0 ? '+' : ''}${Math.round(m.encounterChanceMod * 100)}%`,
      delta: numDelta(-m.encounterChanceMod, cmpM.encounterChanceMod ? -cmpM.encounterChanceMod : undefined),
    });
  }
  if (m.weightCapacityBonus) {
    lines.push({
      key: 'carry',
      label: 'Carry',
      value: `+${m.weightCapacityBonus} kg`,
      delta: numDelta(m.weightCapacityBonus, cmpM.weightCapacityBonus),
    });
  }
  if (m.bagWidthBonus || m.bagHeightBonus) {
    lines.push({
      key: 'bag',
      label: 'Pack size',
      value: `+${m.bagWidthBonus ?? 0} col${m.bagHeightBonus ? ` +${m.bagHeightBonus} row` : ''}`,
      delta: numDelta(
        (m.bagWidthBonus ?? 0) + (m.bagHeightBonus ?? 0) * 10,
        (cmpM.bagWidthBonus ?? 0) + (cmpM.bagHeightBonus ?? 0) * 10,
      ),
    });
  }
  if (m.awarenessMod) {
    lines.push({
      key: 'aw',
      label: 'Awareness',
      value: `+${m.awarenessMod}`,
      delta: numDelta(m.awarenessMod, cmpM.awarenessMod),
    });
  }

  if (lines.length === 0) {
    switch (e.kind) {
      case 'food':
        lines.push({ key: 'food', label: 'Hunger', value: `+${e.hunger}` });
        break;
      case 'water':
        lines.push({ key: 'thirst', label: 'Thirst', value: `+${e.thirst}` });
        break;
      case 'heal':
        lines.push({ key: 'hp', label: 'Heal', value: `+${e.health} HP` });
        break;
      case 'cure':
        lines.push({ key: 'inf', label: 'Cure', value: `−${e.infection}` });
        break;
      case 'energy':
        lines.push({ key: 'en', label: 'Energy', value: `+${e.energy}` });
        break;
      case 'fuel':
        lines.push({ key: 'fuel', label: 'Fuel', value: 'Evac weight' });
        break;
      default:
        lines.push({ key: 'val', label: 'Value', value: `${def.value}` });
    }
  }
  return lines;
}
