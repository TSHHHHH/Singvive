import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../game/store';
import { itemDef } from '../../game/loot';
import {
  BACKPACK,
  bagWeightReduction,
  itemWeight,
  LOOSE,
  LOOSE_WEIGHT_MULT,
} from '../../game/inventory';
import type { ItemInstance } from '../../game/types';
import { tileColor } from '../../game/itemTileColor';
import { Icon } from '../../icons/Icon';
import { itemName, useT } from '../../i18n';
import { itemIcon } from './itemIcon';

const MAX_LISTED = 6;

const fmtKg = (kg: number) => kg.toFixed(kg < 1 ? 2 : 1);

/**
 * "Throw these away?" — shown before items leave the run for good. The
 * checkbox turns the `confirmDiscard` setting off; Settings → Gameplay turns
 * it back on.
 */
export function DiscardConfirm({
  uids,
  onCancel,
  onConfirm,
}: {
  uids: string[];
  onCancel: () => void;
  onConfirm: (dontAskAgain: boolean) => void;
}) {
  const { locale, t } = useT();
  const items = useGame((s) => s.items);
  const equipment = useGame((s) => s.equipment);
  const bagCut = bagWeightReduction(equipment);
  /** Weight it costs you now (bag cut / loose penalty), same as the list shows. */
  const felt = (i: ItemInstance) =>
    itemWeight(i) *
    (i.container === LOOSE ? LOOSE_WEIGHT_MULT : i.container === BACKPACK ? 1 - bagCut : 1);
  const [dontAsk, setDontAsk] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const list = uids
    .map((u) => items.find((i) => i.uid === u))
    .filter((i): i is NonNullable<typeof i> => i != null);
  const kg = list.reduce((s, i) => s + felt(i), 0);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (list.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-title"
        className="w-full max-w-sm rounded-xl border border-hiss/40 bg-concrete-900 p-4 shadow-signage"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="discard-title" className="mb-1 text-title text-hiss">
          {list.length > 1
            ? t('ui.inventory.discard.titleMany', { n: list.length })
            : t('ui.inventory.discard.title')}
        </h3>
        <p className="mb-3 text-body text-white/55">
          {t(list.length > 1 ? 'ui.inventory.discard.bodyMany' : 'ui.inventory.discard.body')}
        </p>

        <ul className="mb-2 flex flex-col gap-0.5">
          {list.slice(0, MAX_LISTED).map((inst) => {
            const def = itemDef(inst.defId);
            const hex = tileColor(def);
            return (
              <li
                key={inst.uid}
                className="flex items-center gap-2 rounded border border-white/[0.06] px-1.5 py-1"
                style={{ background: `linear-gradient(90deg, ${hex}33, transparent)` }}
              >
                <Icon name={itemIcon(def)} size={16} />
                <span className="min-w-0 flex-1 truncate text-body text-concrete-50">
                  {itemName(inst.defId, locale)}
                </span>
                {inst.stack > 1 && (
                  <span className="tabular-nums text-micro text-white/50">×{inst.stack}</span>
                )}
                <span className="w-12 text-right tabular-nums text-micro text-white/45">
                  {fmtKg(felt(inst))} kg
                </span>
              </li>
            );
          })}
        </ul>
        {list.length > MAX_LISTED && (
          <p className="mb-2 text-micro text-white/40">
            {t('ui.inventory.discard.more', { n: list.length - MAX_LISTED })}
          </p>
        )}
        <p className="mb-3 text-right text-micro tabular-nums text-white/55">
          {t('ui.inventory.discard.total', { kg: fmtKg(kg) })}
        </p>

        <label className="mb-4 flex cursor-pointer items-center gap-2 text-body text-white/60">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            className="h-4 w-4 accent-[#8fbf4b]"
          />
          {t('ui.inventory.discard.dontAsk')}
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-body font-semibold text-white/60 hover:bg-white/5 hover:text-white"
          >
            {t('ui.inventory.discard.cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onConfirm(dontAsk)}
            className="rounded bg-hiss/80 px-3 py-1.5 text-body font-bold text-black hover:bg-hiss"
          >
            {t('ui.inventory.discard.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
