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
  maxCarry,
  tierLabel,
  tierOf,
  TEAR_CONDITION_COST,
  TEAR_HOURS,
  TEAR_RAGS_YIELD,
  totalLootValue,
} from '../../game/inventory';
import type { Container, EquipSlot, ItemInstance } from '../../game/types';
import {
  canCraft,
  countOf,
  describeInputs,
  FIELD_REPAIRS,
  RECIPES,
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
  { slot: 'mainHand', label: 'Main Hand', icon: 'slot.mainHand' },
  { slot: 'offHand', label: 'Off Hand', icon: 'slot.offHand' },
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
  const dropItem = useGame((s) => s.dropItem);
  const craftItem = useGame((s) => s.craftItem);
  const repairItem = useGame((s) => s.repairItem);
  const tearForRags = useGame((s) => s.tearForRags);
  const tearOwnClothes = useGame((s) => s.tearOwnClothes);
  const clothingTears = useGame((s) => s.clothingTears);
  const rounds = useGame((s) => s.rounds);

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

  // A whetstone or a bottle of gun oil fixes its own kind of weapon on the
  // spot; anything else needs the toolbox and a place to sit down.
  const fieldKit =
    def?.effect.kind === 'weapon'
      ? FIELD_REPAIRS.find(
          (f) => f.melee !== (def.effect as { ranged: boolean }).ranged && countOf(items, f.defId) > 0,
        )
      : undefined;
  const repairable = selected != null && hasCondition(selected) && conditionOf(selected) < 100;
  // Cloth is the last line against a bleed, so cutting a garment up is offered
  // right here rather than buried in crafting — you reach for it mid-crisis.
  const tearable =
    selected != null && def != null && canTearForRags(def) && conditionOf(selected) >= TEAR_CONDITION_COST;

  // Ammunition only matters once you're carrying something that eats it.
  const hasFirearm =
    (equipment.mainHand && (itemDef(equipment.mainHand.defId).effect as { ranged?: boolean }).ranged) ||
    items.some((i) => {
      const e = itemDef(i.defId).effect;
      return e.kind === 'weapon' && e.ranged;
    });
  const atShelter = stashContainer !== null;

  const craftable = RECIPES.map((recipe) => ({
    recipe,
    check: canCraft(recipe, items, atShelter),
    // Hide recipes you have none of the makings for — otherwise the panel is a
    // wall of things you can't do.
    known: Object.keys(recipe.inputs).some((defId) => countOf(items, defId) > 0),
  })).filter((r) => r.known);

  const carry = character ? maxCarry(character.attributes, equipment) : 0;
  const load = containerWeight(items, BACKPACK);
  const encumbered = character ? isEncumbered(items, character.attributes, equipment) : false;
  const loadPct = carry > 0 ? (load / carry) * 100 : 0;

  return (
    <div className="flex flex-col gap-3" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      {onClose && (
        <div className="flex justify-end">
          <button onClick={onClose} className="text-white/50 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Equipment slots — drag items here to equip */}
      <div className="grid grid-cols-4 gap-2">
        {EQUIP_SLOTS.map(({ slot, label, icon }) => {
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
                    ? 'border-signal bg-signal/20'
                    : 'border-hiss bg-hiss/10'
                  : 'border-white/10 bg-black/40'
              }`}
            >
              <span className="text-2xs uppercase tracking-wide text-white/40">{label}</span>
              {eDef ? (
                <>
                  <Icon name={itemIcon(eDef)} size={18} title={eDef.name} />
                  <button
                    onClick={() => unequipItem(slot)}
                    className="mt-0.5 rounded bg-white/10 px-1 text-2xs hover:bg-white/20"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <Icon name={icon} size={24} className="opacity-20" />
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

      {/* Carry gauge — sits directly under the backpack it measures */}
      <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="uppercase tracking-widest text-white/40">Carry weight</span>
          <span className={encumbered ? 'font-semibold text-hiss' : 'text-white/60'}>
            {load.toFixed(1)} / {carry} kg{encumbered ? ' · Encumbered' : ''}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${
              encumbered ? 'bg-hiss' : loadPct > 80 ? 'bg-amber-400' : 'bg-signal'
            }`}
            style={{ width: `${Math.min(100, loadPct)}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between text-xs text-white/40">
          <span>
            {items.filter((i) => i.container === BACKPACK).length} items carried
          </span>
          <span className="flex gap-3">
            {hasFirearm && (
              <span className={rounds === 0 ? 'font-semibold text-hiss' : 'text-white/60'}>
                {rounds} rounds
              </span>
            )}
            <span>Value {totalLootValue(items)}</span>
          </span>
        </div>
      </div>

      {/* Dedicated item detail box — always present */}
      <div className="rounded-lg border border-white/10 bg-black/40 p-3">
        {selected && def ? (
          <>
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
                  {itemKind(def)} · in {selected.container === BACKPACK ? 'backpack' : 'stash'}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-white/60">{describeItem(def, selected)}</p>

            {/* Wear is the item's headline stat once things start breaking, so
                it gets its own row rather than a footnote among the sizes. */}
            {hasCondition(selected) && (
              <div className="mt-2">
                <div className="flex items-baseline justify-between text-xs">
                  <span
                    className={
                      isBroken(selected)
                        ? 'font-semibold text-hiss'
                        : 'uppercase tracking-wide text-white/50'
                    }
                  >
                    {isBroken(selected) ? 'Broken — unusable until repaired' : tierLabel(tierOf(selected))}
                  </span>
                  <span className="text-white/40">{conditionPct(selected)}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${
                      conditionOf(selected) < 25
                        ? 'bg-hiss'
                        : conditionOf(selected) < 50
                          ? 'bg-amber-400'
                          : 'bg-signal'
                    }`}
                    style={{ width: `${conditionPct(selected)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/40">
              <span>
                Size {def.w}×{def.h}
              </span>
              <span>{def.weight.toFixed(1)} kg</span>
              <span>Value {instanceValue(selected)}</span>
              {def.stackable && selected.stack > 1 && <span>×{selected.stack} stacked</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {usable && (
                <button
                  onClick={() => useItem(selected.uid)}
                  className="rounded bg-signal/80 px-3 py-1.5 text-sm font-semibold text-black hover:bg-signal"
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
                  className="rounded border border-astral/40 bg-astral/10 text-astral px-3 py-1.5 text-sm hover:bg-astral/20"
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
              {repairable && (
                <button
                  onClick={() => repairItem(selected.uid, fieldKit?.defId)}
                  className="rounded border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-300/20"
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
                  onClick={() => tearForRags(selected.uid)}
                  className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
                  title={`Costs ${TEAR_CONDITION_COST}% condition — yields ${TEAR_RAGS_YIELD}× Cloth Rags for dressings`}
                >
                  ✂ Cut for Rags
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
              <button
                onClick={() => {
                  dropItem(selected.uid);
                  setSelectedUid(null);
                }}
                className="rounded border border-hiss/40 px-3 py-1.5 text-sm text-hiss/80 hover:bg-hiss/10"
                title="Gone for good — but the weight goes with it"
              >
                Drop
              </button>
            </div>
          </>
        ) : (
          <p className="py-3 text-center text-xs text-white/30">
            Select an item to inspect it. Drag onto an equipment slot to equip.
          </p>
        )}
      </div>

      {/* Workbench. Only the recipes you could plausibly run are worth showing,
          so anything you hold no inputs at all for stays hidden. */}
      {(craftable.length > 0 || clothingTears > 0) && (
        <div className="rounded-lg border border-white/10 bg-black/40 p-3">
          <div className="mb-2 text-xs uppercase tracking-widest text-white/40">Make</div>
          <div className="flex flex-col gap-1.5">
            {/* Always here, needing nothing. However badly the loot has gone,
                there is still a way to get cloth — it just costs the shirt off
                your back, and there are only so many of those. */}
            {clothingTears > 0 && (
              <button
                onClick={tearOwnClothes}
                title="Cut strips from what you're wearing. Costs nothing but the clothes."
                className="flex items-baseline justify-between gap-3 rounded bg-white/5 px-2 py-1.5 text-left text-xs hover:bg-white/15"
              >
                <span className="min-w-0">
                  <span className="font-semibold">Cut Up Your Clothes</span>
                  <span className="block truncate text-white/35">
                    Nothing — {clothingTears} left in them
                  </span>
                </span>
                <span className="shrink-0 text-right text-white/35">{TEAR_HOURS}h</span>
              </button>
            )}
            {craftable.map(({ recipe, check }) => (
              <button
                key={recipe.id}
                disabled={!check.ok}
                onClick={() => craftItem(recipe.id)}
                title={recipe.blurb}
                className={`flex items-baseline justify-between gap-3 rounded px-2 py-1.5 text-left text-xs ${
                  check.ok
                    ? 'bg-white/5 hover:bg-white/15'
                    : 'cursor-not-allowed bg-transparent text-white/25'
                }`}
              >
                <span className="min-w-0">
                  <span className={check.ok ? 'font-semibold' : ''}>{recipe.name}</span>
                  <span className="block truncate text-white/35">
                    {describeInputs(recipe.inputs)}
                  </span>
                </span>
                <span className="shrink-0 text-right text-white/35">
                  {check.ok ? `${recipe.hours}h` : check.reason}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

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
 * Gear is described by what it does *now*, with the printed value alongside
 * whenever wear has taken a bite out of it — the gap is the whole argument for
 * carrying repair materials.
 */
function describeItem(def: ReturnType<typeof itemDef>, inst: ItemInstance): string {
  const e = def.effect;
  if (def.slot) {
    const m = def.modifiers ?? {};
    const parts: string[] = [`${def.slot}`];
    if (e.kind === 'weapon') {
      const dmg = effectiveDamage(inst);
      parts.push(dmg === e.damage ? `${e.damage} dmg` : `${dmg} dmg (of ${e.damage})`);
    }
    if (m.defenseBonus) {
      const def_ = equipDefenseBonus(inst);
      parts.push(
        def_ === m.defenseBonus ? `+${m.defenseBonus} def` : `+${def_} def (of ${m.defenseBonus})`,
      );
    }
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
