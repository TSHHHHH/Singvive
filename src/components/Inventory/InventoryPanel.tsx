import { useState, type ReactNode } from 'react';
import { useGame } from '../../game/store';
import { itemDef } from '../../game/loot';
import {
  BACKPACK,
  canTearForRags,
  conditionOf,
  conditionPct,
  containerWeight,
  hasCondition,
  isEncumbered,
  isTwoHandedEquipped,
  maxCarry,
  TEMP_STASH,
  TEAR_CONDITION_COST,
  TEAR_RAGS_YIELD,
} from '../../game/inventory';
import { conditionBarColor } from '../../game/itemTileColor';
import type { EquipSlot } from '../../game/types';
import { sumTraitMod } from '../../game/character';
import {
  countOf,
  describeInputs,
  FIELD_REPAIRS,
  REPAIR_INPUTS,
  REPAIR_TOOL,
} from '../../game/crafting';
import { InventoryGrid } from './InventoryGrid';
import { itemIcon } from './itemIcon';
import { Icon } from '../../icons/Icon';
import { EQUIP_SLOTS } from './equipSlots';
import { isConsumableUsable } from './itemStatLines';
import { ItemInspectBody } from './ItemInspectBody';
import { useInventoryInteraction } from './InventoryInteractionContext';
import { TipHint } from '../TipHint';
import { useT } from '../../i18n';

const PC_INVENTORY_HINT_KEYS = [
  { actionKey: 'ui.inventory.inspect', keys: 'Hover' },
  { actionKey: 'ui.inventory.useOrEquip', keys: 'Double-click' },
  { actionKey: 'ui.inventory.stashOrPack', keys: 'Ctrl+click' },
  { actionKey: 'ui.inventory.quickActions', keys: 'Right-click' },
  { actionKey: 'ui.inventory.moveRotate', keys: 'Drag · R' },
] as const;

function InventoryControlsHint(): ReactNode {
  const { t } = useT();
  return (
    <TipHint
      tip={
        <div className="space-y-1 text-2xs normal-case tracking-normal">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/35">
            {t('ui.inventory.controls')}
          </div>
          {PC_INVENTORY_HINT_KEYS.map((row) => (
            <div key={row.actionKey} className="flex items-baseline justify-between gap-4">
              <span className="text-concrete-200">{t(row.actionKey)}</span>
              <span className="shrink-0 tabular-nums text-white/45">{row.keys}</span>
            </div>
          ))}
        </div>
      }
      tipClassName="absolute left-0 top-full z-[60] mt-1 w-max min-w-[12rem] rounded-lg border border-white/15 bg-concrete-900 p-2.5 text-left shadow-signage"
      className="inline-flex"
    >
      <button
        type="button"
        aria-label={t('ui.inventory.controlsAria')}
        className="inline-flex h-4 w-4 items-center justify-center rounded border border-white/15 text-[10px] font-semibold leading-none text-white/45 transition hover:border-signal/40 hover:text-signal"
      >
        ?
      </button>
    </TipHint>
  );
}

export type InventoryLayout = 'full' | 'backpack' | 'equipStash';

export function InventoryPanel({
  onClose,
  layout = 'full',
}: {
  onClose?: () => void;
  layout?: InventoryLayout;
}) {
  const { t } = useT();
  const items = useGame((s) => s.items);
  const equipment = useGame((s) => s.equipment);
  const character = useGame((s) => s.character);
  const currentPositionId = useGame((s) => s.currentPositionId);
  const locations = useGame((s) => s.locations);
  const applyItem = useGame((s) => s.applyItem);
  const rotateItem = useGame((s) => s.rotateItem);
  const transferItem = useGame((s) => s.transferItem);
  const equipItem = useGame((s) => s.equipItem);
  const unequipItem = useGame((s) => s.unequipItem);
  const dropItem = useGame((s) => s.dropItem);
  const repairItem = useGame((s) => s.repairItem);
  const tearForRags = useGame((s) => s.tearForRags);
  const rounds = useGame((s) => s.rounds);
  const confirmTempStash = useGame((s) => s.confirmTempStash);
  const inCombat = useGame((s) => !!s.combat && !s.combat.over);

  const {
    selectedUid,
    setSelectedUid,
    dragUid,
    drag,
    stashContainer,
    hasTempStash,
    inTunnel,
    pcShortcuts,
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
  } = useInventoryInteraction();

  // Phone inspect strip: hover peeks without locking actions (legacy behavior).
  const [hoveredEquipSlot, setHoveredEquipSlot] = useState<EquipSlot | null>(null);

  const hereLoc = currentPositionId ? locations[currentPositionId] : null;

  const equippedList = EQUIP_SLOTS.map(({ slot }) => equipment[slot]).filter(
    (i): i is NonNullable<typeof i> => i != null,
  );
  const selected =
    items.find((i) => i.uid === selectedUid) ??
    equippedList.find((i) => i.uid === selectedUid) ??
    null;

  const showInspect = layout === 'full';
  const showEquip = layout === 'full' || layout === 'equipStash';
  const showBackpack = layout === 'full' || layout === 'backpack';
  const showStash = layout === 'full' || layout === 'equipStash';

  const hoveredEquip =
    showInspect && !drag && hoveredEquipSlot ? equipment[hoveredEquipSlot] : null;
  const inspected = hoveredEquip ?? selected;
  const showActions = selected != null && inspected?.uid === selected.uid;
  const inspectedEquipSlot = inspected ? equippedSlotOf(inspected.uid) : null;
  const def = inspected ? itemDef(inspected.defId) : null;
  const usable = def != null && isConsumableUsable(def) && !inspectedEquipSlot;
  const canRotate = def != null && def.w !== def.h && !inspectedEquipSlot;

  const fieldKit =
    def?.effect.kind === 'weapon'
      ? FIELD_REPAIRS.find(
          (f) => f.melee !== (def.effect as { ranged: boolean }).ranged && countOf(items, f.defId) > 0,
        )
      : undefined;
  const repairable = inspected != null && hasCondition(inspected) && conditionOf(inspected) < 100;
  const tearable =
    inspected != null &&
    def != null &&
    canTearForRags(def) &&
    conditionOf(inspected) >= TEAR_CONDITION_COST;

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

  const gridHandlers = {
    onItemPointerDown,
    onItemDoubleClick: pcShortcuts ? onItemDoubleClick : undefined,
    onItemContextMenu: pcShortcuts ? onItemContextMenu : undefined,
    onItemPointerEnter: pcShortcuts ? onItemPointerEnter : undefined,
    onItemPointerLeave: pcShortcuts ? onItemPointerLeave : undefined,
    onItemPointerMove: pcShortcuts ? onItemPointerMove : undefined,
    suppressNativeTitle: pcShortcuts,
  };

  return (
    <div className="flex flex-col gap-3">
      {onClose && (
        <div className="flex justify-end">
          <button onClick={onClose} className="text-white/50 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {showInspect && (
        <div className="flex h-44 overflow-hidden rounded-lg border border-white/15 bg-concrete-900/80 p-3">
          {inspected && def ? (
            <div className="flex min-h-0 w-full gap-3">
              <div className="min-h-0 w-4/5 overflow-y-auto pr-1">
                <ItemInspectBody
                  inst={inspected}
                  equipment={equipment}
                  equipSlot={inspectedEquipSlot}
                />
              </div>
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
                        {t('ui.inventory.unequip')}
                      </button>
                    ) : (
                      <>
                        {usable && (
                          <button
                            onClick={() => applyItem(inspected.uid)}
                            disabled={inCombat}
                            title={inCombat ? t('ui.inventory.cannotUseCombat') : undefined}
                            className={`w-full rounded px-1.5 py-1 text-xs font-semibold leading-tight ${
                              inCombat
                                ? 'cursor-not-allowed bg-white/10 text-white/30'
                                : 'bg-signal/80 text-black hover:bg-signal'
                            }`}
                          >
                            {t('ui.inventory.use')}
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
                            {t('ui.inventory.equip')}
                          </button>
                        )}
                        {canRotate && (
                          <button
                            onClick={() => rotateItem(inspected.uid)}
                            className="w-full rounded bg-white/10 px-1.5 py-1 text-xs leading-tight hover:bg-white/20"
                            title={t('ui.inventory.rotateHint')}
                          >
                            {t('ui.inventory.rotate')}
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
                            →{' '}
                            {inspected.container === BACKPACK
                              ? t('ui.inventory.stash')
                              : t('ui.inventory.pack')}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            dropItem(inspected.uid);
                            setSelectedUid(null);
                          }}
                          className="w-full rounded border border-hiss/40 px-1.5 py-1 text-xs leading-tight text-hiss/80 hover:bg-hiss/10"
                          title={t('ui.inventory.dropGone')}
                        >
                          {t('ui.inventory.drop')}
                        </button>
                      </>
                    )}
                    {repairable && (
                      <button
                        onClick={() => repairItem(inspected.uid, fieldKit?.defId)}
                        className="w-full rounded border border-amber-300/40 bg-amber-300/10 px-1.5 py-1 text-xs leading-tight text-amber-200 hover:bg-amber-300/20"
                        title={
                          fieldKit
                            ? t('ui.inventory.usesOne', { name: itemDef(fieldKit.defId).name })
                            : t('ui.inventory.usesInputs', {
                                inputs: describeInputs(REPAIR_INPUTS),
                                tool: itemDef(REPAIR_TOOL).name,
                              })
                        }
                      >
                        {t('ui.inventory.repair')}
                      </button>
                    )}
                    {tearable && (
                      <button
                        onClick={() => tearForRags(inspected.uid)}
                        className="w-full rounded bg-white/10 px-1.5 py-1 text-xs leading-tight hover:bg-white/20"
                        title={t('ui.inventory.tearTitle', {
                          cost: TEAR_CONDITION_COST,
                          yield: TEAR_RAGS_YIELD,
                        })}
                      >
                        {t('ui.inventory.rags')}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-center text-2xs leading-snug text-white/25">
                    {t('ui.inventory.clickToAct')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="m-auto text-center text-xs text-white/30">{t('ui.inventory.selectHint')}</p>
          )}
        </div>
      )}

      {showEquip && (
        <div className="grid grid-cols-4 gap-2">
          {EQUIP_SLOTS.map(({ slot, icon }) => {
            const inst = equipment[slot];
            const eDef = inst ? itemDef(inst.defId) : null;
            const highlighted = drag?.target?.type === 'slot' && drag.target.slot === slot;
            const selectedHere = inst != null && selectedUid === inst.uid;
            const twoHandBlocked =
              slot === 'offHand' && isTwoHandedEquipped(equipment) && !inst;
            const cond = inst && hasCondition(inst) ? conditionPct(inst) : null;
            const condWash =
              cond == null
                ? null
                : `${conditionBarColor(conditionOf(inst!), false)}59`;
            return (
              <div
                key={slot}
                ref={(el) => registerSlot(slot, el)}
                onPointerDown={(e) => {
                  if (inst) onItemPointerDown(e, inst);
                }}
                onDoubleClick={() => {
                  if (inst && pcShortcuts) onItemDoubleClick(inst);
                }}
                onContextMenu={(e) => {
                  if (inst && pcShortcuts) onItemContextMenu(e, inst);
                }}
                onPointerEnter={(e) => {
                  if (inst && pcShortcuts) onItemPointerEnter(e, inst);
                  if (showInspect && inst) setHoveredEquipSlot(slot);
                }}
                onPointerLeave={() => {
                  if (inst && pcShortcuts) onItemPointerLeave(inst);
                  if (showInspect) {
                    setHoveredEquipSlot((cur) => (cur === slot ? null : cur));
                  }
                }}
                onPointerMove={(e) => {
                  if (inst && pcShortcuts) onItemPointerMove(e, inst);
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
                title={twoHandBlocked ? t('ui.inventory.twoHandBlocked') : undefined}
              >
                {cond != null && condWash && (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0"
                    style={{ height: `${cond}%`, background: condWash }}
                    aria-hidden
                  />
                )}
                <span className="relative z-[1] text-2xs uppercase tracking-wide text-white/40">
                  {t(`ui.slots.${slot}`)}
                </span>
                {eDef && inst ? (
                  <Icon name={itemIcon(eDef)} size={18} className="relative z-[1]" />
                ) : twoHandBlocked ? (
                  <span className="relative z-[1] text-2xs text-white/25">2H</span>
                ) : (
                  <Icon name={icon} size={24} className="relative z-[1] opacity-20" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {showBackpack && (
        <>
          <InventoryGrid
            grid={BACKPACK}
            title={t('ui.inventory.backpack')}
            titleAccessory={pcShortcuts ? <InventoryControlsHint /> : undefined}
            items={items}
            selectedUid={selectedUid}
            draggingUid={dragUid}
            preview={gridPreview(BACKPACK)}
            gridRef={(el) => registerGrid(BACKPACK, el)}
            {...gridHandlers}
          />

          <div className="flex items-center gap-2 text-xs">
            <span className="shrink-0 uppercase tracking-widest text-white/40">
              {t('ui.inventory.carry')}
            </span>
            <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-[width] duration-200 ${
                  encumbered ? 'bg-hiss' : loadPct > 80 ? 'bg-amber-400' : 'bg-signal'
                }`}
                style={{ width: `${Math.min(100, loadPct)}%` }}
              />
            </div>
            <span className="flex shrink-0 items-baseline gap-2">
              {hasFirearm && (
                <span className={rounds === 0 ? 'font-semibold text-hiss' : 'text-white/50'}>
                  {t('ui.inventory.rounds', { n: rounds })}
                </span>
              )}
              <span className={encumbered ? 'font-semibold text-hiss' : 'text-white/60'}>
                {encumbered
                  ? t('ui.inventory.loadEncumbered', {
                      load: load.toFixed(1),
                      carry,
                    })
                  : t('ui.inventory.loadKg', { load: load.toFixed(1), carry })}
              </span>
            </span>
          </div>
        </>
      )}

      {showStash && hasTempStash && (
        <div className="rounded-lg border border-amber-300/30 bg-amber-300/5 p-2">
          <InventoryGrid
            grid="temp:crawl"
            title={t('ui.inventory.tempStash')}
            items={items}
            selectedUid={selectedUid}
            draggingUid={dragUid}
            preview={gridPreview(TEMP_STASH)}
            gridRef={(el) => registerGrid(TEMP_STASH, el)}
            {...gridHandlers}
          />
          <button
            type="button"
            onClick={() => confirmTempStash()}
            className="mt-2 w-full rounded bg-signal/80 py-1.5 text-xs font-bold text-black hover:bg-signal"
          >
            {t('ui.inventory.confirmAbandon')}
          </button>
        </div>
      )}

      {showStash && inTunnel && !hasTempStash && (
        <p className="text-2xs text-white/35">{t('ui.inventory.stashLocked')}</p>
      )}

      {showStash && stashContainer && (
        <InventoryGrid
          grid={stashContainer}
          title={t('ui.inventory.stashNamed', { name: hereLoc!.name })}
          items={items}
          selectedUid={selectedUid}
          draggingUid={dragUid}
          preview={gridPreview(stashContainer)}
          gridRef={(el) => registerGrid(stashContainer, el)}
          {...gridHandlers}
        />
      )}
    </div>
  );
}
