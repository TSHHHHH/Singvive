import type { ItemInstance } from '../../game/types';
import { itemDef } from '../../game/loot';
import { itemWeight, LOOSE, LOOSE_WEIGHT_MULT } from '../../game/inventory';
import { tileColor } from '../../game/itemTileColor';
import { Icon } from '../../icons/Icon';
import { itemName, useLocale, useT } from '../../i18n';
import { itemIcon } from './itemIcon';
import { tip } from '../tips';

interface Props {
  items: ItemInstance[];
  selectedUid: string | null;
  draggingUid: string | null;
  /** True while something from the grid is being dragged over the pile. */
  dropActive: boolean;
  dropValid: boolean;
  pileRef: (el: HTMLDivElement | null) => void;
  onItemPointerDown: (e: React.PointerEvent, inst: ItemInstance) => void;
  onItemDoubleClick?: (inst: ItemInstance) => void;
  onItemContextMenu?: (e: React.MouseEvent, inst: ItemInstance) => void;
  onItemPointerEnter?: (e: React.PointerEvent, inst: ItemInstance) => void;
  onItemPointerLeave?: (inst: ItemInstance) => void;
  onItemPointerMove?: (e: React.PointerEvent, inst: ItemInstance) => void;
}

/**
 * What's carried outside the bag grid: no slots and no limit, so it's a list,
 * not a grid. A drop target too: drag a tile here to carry it loose, or drag a
 * chip into the grid to pack it.
 */
export function LoosePile({
  items,
  selectedUid,
  draggingUid,
  dropActive,
  dropValid,
  pileRef,
  onItemPointerDown,
  onItemDoubleClick,
  onItemContextMenu,
  onItemPointerEnter,
  onItemPointerLeave,
  onItemPointerMove,
}: Props) {
  const { t } = useT();
  const locale = useLocale();
  const loose = items.filter((i) => i.container === LOOSE);
  const kg = loose.reduce((s, i) => s + itemWeight(i), 0);

  return (
    <div
      ref={pileRef}
      className={`rounded-lg border p-2 transition-colors ${
        dropActive
          ? dropValid
            ? 'border-signal bg-signal/10'
            : 'border-white/15 bg-black/30'
          : loose.length
            ? 'border-amber-300/30 bg-amber-300/5'
            : 'border-dashed border-white/10 bg-black/20'
      }`}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span
          className="text-label uppercase tracking-widest text-white/50"
          {...tip(t('ui.inventory.looseHint', { mult: LOOSE_WEIGHT_MULT }))}
        >
          {t('ui.inventory.loose')}
        </span>
        {loose.length > 0 && (
          <span className="text-micro tabular-nums text-amber-200/80">
            {(kg * LOOSE_WEIGHT_MULT).toFixed(1)} kg
            <span className="text-white/35"> ({kg.toFixed(1)} × {LOOSE_WEIGHT_MULT})</span>
          </span>
        )}
      </div>
      {loose.length === 0 ? (
        <p className="text-micro text-white/30">{t('ui.inventory.looseEmpty')}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {loose.map((inst) => {
            const def = itemDef(inst.defId);
            const selected = inst.uid === selectedUid;
            const dragging = inst.uid === draggingUid;
            return (
              <div
                key={inst.uid}
                data-uid={inst.uid}
                onPointerDown={(e) => onItemPointerDown(e, inst)}
                onDoubleClick={() => onItemDoubleClick?.(inst)}
                onContextMenu={(e) => onItemContextMenu?.(e, inst)}
                onPointerEnter={(e) => onItemPointerEnter?.(e, inst)}
                onPointerLeave={() => onItemPointerLeave?.(inst)}
                onPointerMove={(e) => onItemPointerMove?.(e, inst)}
                className={`flex cursor-grab touch-none select-none items-center gap-1 rounded border px-1.5 py-0.5 text-micro ${
                  selected ? 'border-signal bg-signal/15' : 'border-white/10 bg-black/40'
                } ${dragging ? 'opacity-40' : ''}`}
                style={{ boxShadow: `inset 3px 0 0 ${tileColor(def)}` }}
              >
                <Icon name={itemIcon(def)} size={14} />
                <span className="max-w-[9rem] truncate text-white/80">{itemName(inst.defId, locale)}</span>
                {inst.stack > 1 && <span className="text-white/50">×{inst.stack}</span>}
                <span className="tabular-nums text-white/35">{itemWeight(inst).toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
