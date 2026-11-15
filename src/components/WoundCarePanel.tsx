import { useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { BODY_PART_IDS } from '../game/survival';
import { isCarried, TEMP_STASH } from '../game/inventory';
import { CARE_MINUTES, canCareForPart, canCareWithItem, careForItem, type CareAction } from '../game/woundCare';
import type { BodyPartId, BodyParts, ItemInstance } from '../game/types';
import { itemName, useT } from '../i18n';

const ACTIONS: CareAction[] = ['bandage', 'clean', 'pain', 'splint', 'firstAid', 'support'];

export interface CareFeedback {
  partId: BodyPartId;
  action: CareAction;
  sequence: number;
}

function CareButton({ action, partName, supplies, locked, onUse }: {
  action: CareAction;
  partName: string;
  supplies: ItemInstance[];
  locked: boolean;
  onUse: (uid: string) => void;
}) {
  const { locale, t } = useT();
  const descriptionId = useId();
  // The standard dressing is the default, while improvised supplies stay a choice.
  const preferred = supplies.find(item => item.defId === 'bandage') ?? supplies[0];
  const [chosen, setChosen] = useState(preferred.defId);
  const selected = supplies.find(item => item.defId === chosen) ?? preferred;
  const variants = [...new Set(supplies.map(item => item.defId))];
  const quantity = (defId: string) => supplies.filter(item => item.defId === defId)
    .reduce((sum, item) => sum + (item.defId === 'medkit' ? (item.careUses ?? 3) + Math.max(0, item.stack - 1) * 3 : item.stack), 0);
  const effect = selected.defId === 'improvised_bandage'
    ? t('ui.care.improvisedEffect') : t(`ui.care.effect.${action}`);
  const shortEffect = selected.defId === 'improvised_bandage'
    ? t('ui.care.improvisedShort') : t(`ui.care.shortEffect.${action}`);
  const supplyLabel = (defId: string) => t(defId === 'medkit' ? 'ui.care.kitCost' : 'ui.care.supplyCost', {
    item: itemName(defId, locale), n: quantity(defId),
  });

  return (
    <div className="min-w-0 rounded border border-white/10 bg-black/15">
      <button
        type="button"
        className="care-action block min-h-[44px] w-full px-1.5 py-1 text-left disabled:cursor-not-allowed disabled:opacity-40"
        disabled={locked}
        aria-label={`${t(`ui.care.action.${action}`)} · ${partName} · ${supplyLabel(selected.defId)} · ${t('ui.care.minutes', { n: CARE_MINUTES[action] })}`}
        aria-describedby={descriptionId}
        title={`${supplyLabel(selected.defId)}. ${effect}`}
        onClick={() => onUse(selected.uid)}
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-1">
          <span className="text-body text-concrete-100">{t(`ui.care.action.${action}`)}</span>
          <span className="text-micro tabular-nums text-white/45">{t('ui.care.minutes', { n: CARE_MINUTES[action] })}</span>
        </span>
        <span className="mt-0.5 flex items-baseline justify-between gap-1 text-micro text-white/50">
          <span>{shortEffect}</span>
          <span className="shrink-0 tabular-nums" aria-label={supplyLabel(selected.defId)}>{t('ui.care.stock', { n: quantity(selected.defId) })}</span>
        </span>
        <span id={descriptionId} className="sr-only">{effect}</span>
      </button>
      {variants.length > 1 && (
        <select
          className="care-action w-full min-w-0 border-t border-white/10 bg-concrete-900 px-1 py-0.5 text-micro text-concrete-200"
          aria-label={`${partName} · ${t('ui.care.chooseSupply', { action: t(`ui.care.action.${action}`) })}`}
          value={selected.defId}
          onChange={event => setChosen(event.target.value)}
          disabled={locked}
        >
          {variants.map(defId => <option key={defId} value={defId}>{itemName(defId, locale)}</option>)}
        </select>
      )}
    </div>
  );
}

/** Direct optional care, kept beneath the existing six-part overview. */
export function WoundCarePanel({ bodyParts, feedback, onHighlight }: {
  bodyParts: BodyParts;
  feedback: CareFeedback | null;
  onHighlight: (id: BodyPartId | null) => void;
}) {
  const { t } = useT();
  const { supplies, currentPositionId, inTunnel, locked, applyItem } = useGame(useShallow(s => ({
    supplies: s.items,
    currentPositionId: s.currentPositionId,
    inTunnel: !!s.tunnel,
    locked: s.phase !== 'game' || !!(s.combat && !s.combat.over) || !!s.travelAnim || !!s.pendingEvent || !!s.pendingSearch,
    applyItem: s.applyItem,
  })));
  const available = supplies.filter(item => careForItem(item.defId) &&
    (isCarried(item.container) || item.container === TEMP_STASH || (!inTunnel && item.container === currentPositionId)));
  const affected = BODY_PART_IDS.filter(id => {
    const part = bodyParts[id];
    return part.hp < part.maxHp || part.bleed !== 'none' || part.fractured || part.crippled;
  });
  const recoveryPaused = BODY_PART_IDS.some(id => bodyParts[id].bleed === 'major');

  return (
    <div className={affected.length ? 'mb-2.5' : ''}>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {feedback && t(`ui.care.result.${feedback.action}`, { part: t(`ui.body.parts.${feedback.partId}`) })}
      </div>
      {affected.length > 0 && (
        <>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-label uppercase text-white/40">{t('ui.care.title')}</span>
            <span className="text-micro text-white/35">{t('ui.care.optional')}</span>
          </div>
          <div className="overflow-hidden rounded border border-white/10 bg-black/10">
            {affected.map(id => {
              const part = bodyParts[id];
              const eligible = ACTIONS.filter(action => canCareForPart(part, action));
              const offered = eligible.map(action => ({ action, items: available.filter(item => careForItem(item.defId) === action && canCareWithItem(part, item.defId)) }))
                .filter(offer => offer.items.length > 0);
              const missing = eligible.filter(action => !offered.some(offer => offer.action === action));
              const statuses = [
                part.dirty ? t('ui.care.dirtyHint') : null,
                part.dressing === 'clean' ? t('ui.care.dressingClean') : null,
                part.dressing === 'soiled' ? t('ui.care.dressingSoiled') : null,
                part.fractured ? t(part.splinted ? 'ui.care.fractureSupported' : 'ui.care.fractureUnsupported') : null,
                (part.painReliefHours ?? 0) > 0 ? t('ui.care.painActive', { n: Math.ceil(part.painReliefHours ?? 0) }) : null,
                (part.recoveryBoostHours ?? 0) > 0 ? t('ui.care.supportActive', { n: Math.ceil(part.recoveryBoostHours ?? 0) }) : null,
              ].filter(Boolean);
              return (
                <div
                  key={id}
                  className="border-b border-white/10 p-2 last:border-b-0"
                  onMouseEnter={() => onHighlight(id)}
                  onMouseLeave={() => onHighlight(null)}
                  onFocus={() => onHighlight(id)}
                  onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onHighlight(null); }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <span className="text-body text-concrete-100">{t(`ui.body.parts.${id}`)}
                      {part.wound && <span className="text-white/45"> · {t(`ui.care.wound.${part.wound}`)}</span>}
                    </span>
                    <span className={`text-micro ${part.bleed === 'major' ? 'text-hiss' : 'text-white/45'}`}>
                      {part.bleed !== 'none' ? t(part.bleed === 'major' ? 'ui.body.majorBleeding' : 'ui.body.bleeding') : t(recoveryPaused ? 'ui.care.recoveryPaused' : 'ui.care.recovering')}
                    </span>
                  </div>
                  {statuses.length > 0 && <p className="mt-1 text-micro text-white/50">{statuses.join(' · ')}</p>}
                  {offered.length > 0 && (
                    <div className="mt-1.5 grid grid-cols-2 gap-1">
                      {offered.map(({ action, items }) => <CareButton key={action} action={action} partName={t(`ui.body.parts.${id}`)} supplies={items} locked={locked} onUse={uid => applyItem(uid, id)} />)}
                    </div>
                  )}
                  {missing.length > 0 && <p className="mt-1 text-micro text-white/35">{t('ui.care.unavailable', { actions: missing.map(action => t(`ui.care.action.${action}`)).join(' / ') })}</p>}
                  {feedback?.partId === id && <p key={feedback.sequence} className="care-result mt-1.5 text-micro text-cyan-300">{t(`ui.care.result.${feedback.action}`, { part: t(`ui.body.parts.${id}`) })}</p>}
                </div>
              );
            })}
          </div>
          {locked && <p className="mt-1.5 text-micro text-white/50">{t('ui.care.busy')}</p>}
          <p className="mt-1.5 text-micro text-white/35">{t('ui.care.recoveryHint')}</p>
        </>
      )}
    </div>
  );
}
