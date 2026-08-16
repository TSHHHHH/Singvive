import { itemDef } from '../../game/loot';
import {
  conditionOf,
  conditionPct,
  hasCondition,
  instanceValue,
  isBroken,
  tierLabel,
  tierOf,
} from '../../game/inventory';
import type { Equipment, EquipSlot, ItemInstance } from '../../game/types';
import { Icon } from '../../icons/Icon';
import { itemIcon } from './itemIcon';
import { EQUIP_SLOTS } from './equipSlots';
import { itemKind, itemStatLines } from './itemStatLines';

function ConditionBlock({
  inst,
  compact,
}: {
  inst: ItemInstance;
  compact: boolean;
}) {
  if (!hasCondition(inst)) return null;
  return (
    <div className={compact ? 'mt-1.5' : 'mt-2'}>
      <div className="flex items-baseline justify-between text-xs">
        <span
          className={
            isBroken(inst)
              ? 'font-semibold text-hiss'
              : 'uppercase tracking-wide text-white/50'
          }
        >
          {isBroken(inst) ? 'Broken — unusable until repaired' : tierLabel(tierOf(inst))}
        </span>
        <span className="tabular-nums text-white/40">{conditionPct(inst)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
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
  const def = itemDef(inst.defId);
  const iconSize = compact ? 24 : 30;
  const kind = itemKind(def);
  // Location (backpack/stash) adds noise on hover — only slot label is useful.
  const kindLine = equipSlot
    ? `${kind} · ${EQUIP_SLOTS.find((s) => s.slot === equipSlot)!.label}`
    : kind;

  return (
    <div className={compact ? 'space-y-1.5' : undefined}>
      {badge && (
        <div className="text-2xs font-semibold uppercase tracking-widest text-white/40">{badge}</div>
      )}
      <div className="flex items-start gap-3">
        <Icon name={itemIcon(def)} size={iconSize} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`font-bold ${compact ? 'text-sm' : ''}`}>{def.name}</span>
            {def.exotic && (
              <span className="rounded bg-amber-300/15 px-1.5 text-2xs uppercase tracking-wide text-amber-300">
                Exotic
              </span>
            )}
          </div>
          <div className="text-xs uppercase tracking-wide text-white/40">{kindLine}</div>
        </div>
      </div>

      <ConditionBlock inst={inst} compact={compact} />

      <div className={`space-y-1 ${compact ? 'mt-1.5' : 'mt-2'}`}>
        {itemStatLines(def, inst, equipment).map((line) => (
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
                <span className="font-bold text-emerald-400" title="Better than equipped">
                  ▲
                </span>
              )}
              {line.delta === 'new' && (
                <span className="font-bold text-emerald-400" title="New bonus vs equipped">
                  ＋
                </span>
              )}
              {line.delta === 'down' && (
                <span className="font-bold text-hiss" title="Worse than equipped">
                  ▼
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div
        className={`flex items-center justify-between gap-3 text-xs text-white/50 ${compact ? 'mt-1.5' : 'mt-2'}`}
      >
        <span className="inline-flex min-w-0 items-center gap-1" title="Grid size">
          <Icon name="meta.size" size={12} className="shrink-0 opacity-55" />
          <span className="tabular-nums">
            {def.w}×{def.h}
          </span>
        </span>
        <span className="inline-flex items-center gap-1" title="Weight">
          <Icon name="meta.weight" size={12} className="shrink-0 opacity-55" />
          <span className="tabular-nums">{def.weight.toFixed(1)} kg</span>
        </span>
        <span className="inline-flex items-center gap-1" title="Trade value">
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
            Compared to equipped {EQUIP_SLOTS.find((s) => s.slot === def.slot)?.label ?? 'item'}
          </p>
        )}
    </div>
  );
}
