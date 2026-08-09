import { useRef, useState } from 'react';
import { useGame } from '../../game/store';
import { itemDef } from '../../game/loot';
import {
  BACKPACK,
  canEquip,
  canPlace,
  containerWeight,
  dimsFor,
  footprint,
  isEncumbered,
  maxCarry,
  totalLootValue,
} from '../../game/inventory';
import type { Container, EquipSlot, ItemInstance } from '../../game/types';
import { CELL, InventoryGrid, type DragPreview } from './InventoryGrid';
import { itemGlyph } from './itemGlyph';

const EQUIP_SLOTS: { slot: EquipSlot; label: string; glyph: string }[] = [
  { slot: 'head', label: 'Head', glyph: '🪖' },
  { slot: 'body', label: 'Body', glyph: '🦺' },
  { slot: 'mainHand', label: 'Main Hand', glyph: '🗡️' },
  { slot: 'offHand', label: 'Off Hand', glyph: '🛡️' },
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

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const gridRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const slotRefs = useRef<Record<EquipSlot, HTMLDivElement | null>>({
    head: null,
    body: null,
    mainHand: null,
    offHand: null,
  });

  const hereLoc = currentPositionId ? locations[currentPositionId] : null;
  const stashContainer = hereLoc ? hereLoc.id : null;

  const hitTest = (clientX: number, clientY: number, inst: ItemInstance): DropTarget => {
    const def = itemDef(inst.defId);
    // equipment slots first
    for (const { slot } of EQUIP_SLOTS) {
      const el = slotRefs.current[slot];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return { type: 'slot', slot, valid: canEquip(def, slot) };
      }
    }
    // grids
    const { w, h } = footprint(def, inst.rotated);
    for (const container of [BACKPACK, ...(stashContainer ? [stashContainer] : [])]) {
      const el = gridRefs.current[container];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      const dims = dimsFor(container);
      let cellX = Math.round((clientX - r.left - (drag?.grabDX ?? 0)) / CELL);
      let cellY = Math.round((clientY - r.top - (drag?.grabDY ?? 0)) / CELL);
      cellX = Math.max(0, Math.min(dims.w - w, cellX));
      cellY = Math.max(0, Math.min(dims.h - h, cellY));
      const valid = canPlace(container, items, { x: cellX, y: cellY, w, h }, inst.uid);
      return { type: 'grid', container, cellX, cellY, w, h, valid };
    }
    return null;
  };

  const onItemPointerDown = (e: React.PointerEvent, inst: ItemInstance) => {
    e.preventDefault();
    setSelectedUid(inst.uid);
    const el = gridRefs.current[inst.container];
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDrag({
      uid: inst.uid,
      grabDX: e.clientX - (r.left + inst.x * CELL),
      grabDY: e.clientY - (r.top + inst.y * CELL),
      target: null,
    });
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const inst = items.find((i) => i.uid === drag.uid);
    if (!inst) return;
    setDrag({ ...drag, target: hitTest(e.clientX, e.clientY, inst) });
  };

  const onPointerUp = () => {
    if (!drag) return;
    const inst = items.find((i) => i.uid === drag.uid);
    const t = drag.target;
    if (inst && t) {
      if (t.type === 'grid' && t.valid) moveItem(drag.uid, t.container, t.cellX, t.cellY, inst.rotated);
      else if (t.type === 'slot' && t.valid) equipItem(drag.uid, t.slot);
    }
    setDrag(null);
  };

  const gridPreview = (container: Container): DragPreview | null => {
    if (!drag || drag.target?.type !== 'grid' || drag.target.container !== container) return null;
    const t = drag.target;
    return { grid: container, cellX: t.cellX, cellY: t.cellY, w: t.w, h: t.h, valid: t.valid };
  };

  const selected = items.find((i) => i.uid === selectedUid) ?? null;
  const def = selected ? itemDef(selected.defId) : null;
  const usable =
    def && def.effect.kind !== 'misc' && def.effect.kind !== 'weapon' && def.effect.kind !== 'fuel';
  const canRotate = def && def.w !== def.h;

  const carry = character ? maxCarry(character.attributes, equipment) : 0;
  const load = containerWeight(items, BACKPACK);
  const encumbered = character ? isEncumbered(items, character.attributes, equipment) : false;

  return (
    <div className="flex flex-col gap-3" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <span className={encumbered ? 'font-semibold text-red-400' : 'text-white/60'}>
            🎒 {load.toFixed(1)} / {carry} kg{encumbered ? ' · Encumbered' : ''}
          </span>
          <span className="text-white/40">Value {totalLootValue(items)}</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/50 hover:text-white">
            ✕
          </button>
        )}
      </div>

      {/* Equipment slots — drag items here to equip */}
      <div className="grid grid-cols-4 gap-2">
        {EQUIP_SLOTS.map(({ slot, label, glyph }) => {
          const inst = equipment[slot];
          const eDef = inst ? itemDef(inst.defId) : null;
          const highlighted = drag?.target?.type === 'slot' && drag.target.slot === slot;
          return (
            <div
              key={slot}
              ref={(el) => {
                slotRefs.current[slot] = el;
              }}
              className={`flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded border p-1.5 text-center ${
                highlighted
                  ? drag?.target && 'valid' in drag.target && drag.target.valid
                    ? 'border-toxic bg-toxic/20'
                    : 'border-red-500 bg-red-500/10'
                  : 'border-white/10 bg-black/40'
              }`}
            >
              <span className="text-[10px] uppercase tracking-wide text-white/40">{label}</span>
              {eDef ? (
                <>
                  <span className="text-lg leading-none">{itemGlyph(eDef)}</span>
                  <button
                    onClick={() => unequipItem(slot)}
                    className="mt-0.5 rounded bg-white/10 px-1 text-[10px] hover:bg-white/20"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <span className="text-2xl opacity-20">{glyph}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Grids */}
      <div className="flex flex-wrap gap-4">
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

      {/* Dedicated item detail box — always present */}
      <div className="rounded-lg border border-white/10 bg-black/40 p-3">
        {selected && def ? (
          <>
            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none">{itemGlyph(def)}</span>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{def.name}</div>
                <div className="text-xs uppercase tracking-wide text-white/40">
                  {itemKind(def)} · in {selected.container === BACKPACK ? 'backpack' : 'stash'}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-white/60">{describeItem(def)}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/40">
              <span>
                Size {def.w}×{def.h}
              </span>
              <span>{def.weight.toFixed(1)} kg</span>
              <span>Value {def.value}</span>
              {def.stackable && selected.stack > 1 && <span>×{selected.stack} stacked</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {usable && (
                <button
                  onClick={() => useItem(selected.uid)}
                  className="rounded bg-toxic/80 px-3 py-1.5 text-sm font-semibold text-black hover:bg-toxic"
                >
                  Use
                </button>
              )}
              {def.slot && (
                <button
                  onClick={() => {
                    equipItem(selected.uid, def.slot!);
                    setSelectedUid(null);
                  }}
                  className="rounded bg-sky-700/70 px-3 py-1.5 text-sm hover:bg-sky-600"
                >
                  Equip
                </button>
              )}
              {canRotate && (
                <button
                  onClick={() => rotateItem(selected.uid)}
                  className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
                >
                  ⟳ Rotate
                </button>
              )}
              {stashContainer && (
                <button
                  onClick={() =>
                    transferItem(selected.uid, selected.container === BACKPACK ? stashContainer : BACKPACK)
                  }
                  className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
                >
                  → {selected.container === BACKPACK ? 'Stash' : 'Backpack'}
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="py-3 text-center text-[12px] text-white/30">
            Select an item to inspect it. Drag onto an equipment slot to equip.
          </p>
        )}
      </div>
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

function describeItem(def: ReturnType<typeof itemDef>): string {
  const e = def.effect;
  if (def.slot) {
    const m = def.modifiers ?? {};
    const parts: string[] = [`${def.slot}`];
    if (e.kind === 'weapon') parts.push(`${e.damage} dmg`);
    if (m.defenseBonus) parts.push(`+${m.defenseBonus} def`);
    if (m.attackBonus) parts.push(`${m.attackBonus > 0 ? '+' : ''}${m.attackBonus} atk`);
    if (m.weightCapacityBonus) parts.push(`+${m.weightCapacityBonus}kg carry`);
    return parts.join(' · ');
  }
  switch (e.kind) {
    case 'food':
      return `Food +${e.hunger} hunger`;
    case 'water':
      return `Drink +${e.thirst} thirst`;
    case 'heal':
      return `Heal +${e.health} HP`;
    case 'cure':
      return `Cure −${e.infection} infection`;
    case 'energy':
      return `Stimulant +${e.energy} energy`;
    case 'fuel':
      return 'Fuel';
    default:
      return `Value ${def.value}`;
  }
}
