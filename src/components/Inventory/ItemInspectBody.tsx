import { itemDef } from '../../game/loot';
import {
  bagSwapFits,
  conditionFamily,
  conditionOf,
  conditionPct,
  hasCondition,
  instanceTierLabel,
  instanceValue,
  isBroken,
} from '../../game/inventory';
import { packGridUsableCount, resolveItemPackGrid } from '../../game/packGrid';
import { sumTraitMod } from '../../game/character';
import { useGame } from '../../game/store';
import { conditionBarColor } from '../../game/itemTileColor';
import type { Equipment, EquipSlot, ItemInstance } from '../../game/types';
import { Icon } from '../../icons/Icon';
import { itemName, useT } from '../../i18n';
import { itemIcon } from './itemIcon';
import { itemKind, itemStatLines } from './itemStatLines';
import { PackGridPreview } from './PackGridPreview';
import { tip } from '../tips';

function ConditionBlock({
  inst,
  compact,
}: {
  inst: ItemInstance;
  compact: boolean;
}) {
  const { t } = useT();
  if (!hasCondition(inst)) return null;
  const cond = conditionOf(inst);
  const broken = isBroken(inst);
  return (
    <div className={compact ? 'mt-1.5' : 'mt-2'}>
      <div className="flex items-baseline justify-between text-xs">
        <span
          className={
            broken
              ? 'font-semibold text-hiss'
              : 'uppercase tracking-wide text-white/50'
          }
        >
          {broken
            ? t(
                conditionFamily(itemDef(inst.defId)) === 'gear'
                  ? 'ui.inventory.broken'
                  : conditionFamily(itemDef(inst.defId)) === 'medicine'
                    ? 'ui.inventory.expired'
                    : 'ui.inventory.spoiled',
              )
            : instanceTierLabel(inst)}
        </span>
        <span className="tabular-nums text-white/40">{conditionPct(inst)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{
            width: `${conditionPct(inst)}%`,
            background: conditionBarColor(cond, broken),
          }}
        />
      </div>
    </div>
  );
}

/** Shared identity + stats block used by the phone inspect strip and PC hover card. */
export function ItemInspectBody({
  inst,
  equipment,
  equipSlot,
  compact = false,
  /** When true, skip the “Compared to equipped …” footnote (side-by-side hover shows both). */
  hideCompareNote = false,
  /** Optional ribbon above the name (e.g. Equipped / Candidate). */
  badge,
}: {
  inst: ItemInstance;
  equipment: Equipment;
  equipSlot: EquipSlot | null;
  compact?: boolean;
  hideCompareNote?: boolean;
  badge?: string;
}) {
  const { locale, t } = useT();
  const items = useGame((s) => s.items);
  const character = useGame((s) => s.character);
  const def = itemDef(inst.defId);
  const iconSize = compact ? 24 : 30;
  const kind = itemKind(def, t);
  const slotLabel = (slot: EquipSlot) => t(`ui.slots.${slot}`);
  // Location (backpack/stash) adds noise on hover — only slot label is useful.
  const kindLine = equipSlot ? `${kind} · ${slotLabel(equipSlot)}` : kind;
  const packGrid = def.slot === 'bag' ? resolveItemPackGrid(def) : undefined;
  const traitW = character ? sumTraitMod(character.traitIds, 'gridWidthBonus') : 0;
  const bagWontFit =
    def.slot === 'bag' && character
      ? !bagSwapFits(items, equipment, inst, traitW)
      : false;

  return (
    <div className={compact ? 'space-y-1.5' : undefined}>
      {badge && (
        <div className="text-2xs font-semibold uppercase tracking-widest text-white/40">{badge}</div>
      )}
      <div className="flex items-start gap-3">
        <Icon name={itemIcon(def)} size={iconSize} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`font-bold ${compact ? 'text-sm' : ''}`}>
              {itemName(inst.defId, locale)}
            </span>
            {def.exotic && (
              <span className="rounded bg-amber-300/15 px-1.5 text-2xs uppercase tracking-wide text-amber-300">
                {t('ui.inventory.exotic')}
              </span>
            )}
          </div>
          <div className="text-xs uppercase tracking-wide text-white/40">{kindLine}</div>
        </div>
      </div>

      <ConditionBlock inst={inst} compact={compact} />

      <div className={`space-y-1 ${compact ? 'mt-1.5' : 'mt-2'}`}>
        {itemStatLines(def, inst, equipment, t).map((line) => (
          <div
            key={line.key}
            className="flex items-center justify-between gap-2 text-xs text-white/70"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Icon name={line.icon} size={12} className="shrink-0 opacity-55" />
              <span className="truncate">{line.label}</span>
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <span>{line.value}</span>
              {line.delta === 'up' && (
                <span className="font-bold text-emerald-400" {...tip(t('ui.inventory.betterThanEquipped'))}>
                  ▲
                </span>
              )}
              {line.delta === 'new' && (
                <span className="font-bold text-emerald-400" {...tip(t('ui.inventory.newBonus'))}>
                  ＋
                </span>
              )}
              {line.delta === 'down' && (
                <span className="font-bold text-hiss" {...tip(t('ui.inventory.worseThanEquipped'))}>
                  ▼
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {packGrid && (
        <div className={compact ? 'mt-1.5' : 'mt-2'}>
          <PackGridPreview
            grid={packGrid}
            label={t('ui.stats.packCells', {
              n: packGridUsableCount(packGrid),
              w: packGrid.w,
              h: packGrid.h,
            })}
          />
          {bagWontFit && (
            <p className="mt-1 text-2xs text-hiss">
              {equipment.bag?.uid === inst.uid
                ? t('ui.inventory.bagWontUnequip')
                : t('ui.inventory.bagWontFit')}
            </p>
          )}
        </div>
      )}

      <div
        className={`flex items-center justify-between gap-3 text-xs text-white/50 ${compact ? 'mt-1.5' : 'mt-2'}`}
      >
        <span className="inline-flex min-w-0 items-center gap-1" {...tip('Grid size')}>
          <Icon name="meta.size" size={12} className="shrink-0 opacity-55" />
          <span className="tabular-nums">
            {def.w}×{def.h}
          </span>
        </span>
        <span className="inline-flex items-center gap-1" {...tip('Weight')}>
          <Icon name="meta.weight" size={12} className="shrink-0 opacity-55" />
          <span className="tabular-nums">{def.weight.toFixed(1)} kg</span>
        </span>
        <span className="inline-flex items-center gap-1" {...tip('Trade value')}>
          <Icon name="meta.value" size={12} className="shrink-0 opacity-55" />
          <span className="tabular-nums">{instanceValue(inst)}</span>
        </span>
      </div>
      {def.stackable && inst.stack > 1 && (
        <div className="text-xs text-white/40">×{inst.stack} stacked</div>
      )}

      {!hideCompareNote &&
        def.slot &&
        equipment[def.slot] &&
        equipment[def.slot]!.uid !== inst.uid && (
          <p className="mt-1.5 text-2xs text-white/35">
            Compared to equipped {slotLabel(def.slot)}
          </p>
        )}
    </div>
  );
}
