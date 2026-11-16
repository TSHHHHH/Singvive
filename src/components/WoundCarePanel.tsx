import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { BODY_PART_IDS } from '../game/survival';
import { isCarried, TEMP_STASH } from '../game/inventory';
import { itemDefOrNull } from '../game/loot';
import { CARE_MINUTES, canCareForPart, canCareWithItem, careForItem, type CareAction } from '../game/woundCare';
import type { BodyPart, BodyPartId, BodyParts, ItemInstance } from '../game/types';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { itemIcon } from './Inventory/itemIcon';
import { tip, useCoarsePointer } from './tips';
import { itemName, useT } from '../i18n';

const ACTIONS: CareAction[] = ['bandage', 'clean', 'pain', 'splint', 'firstAid', 'support'];

export interface CareFeedback {
  partId: BodyPartId;
  action: CareAction;
  sequence: number;
}

type T = ReturnType<typeof useT>['t'];
type Tone = 'danger' | 'warn' | 'good' | 'muted';

/** Text colour tints UI glyphs; the wash carries the tone for item art, which is drawn as authored. */
const TONE: Record<Tone, string> = {
  danger: 'text-hiss bg-hiss/20 ring-1 ring-inset ring-hiss/50',
  warn: 'text-concrete-50 bg-white/10 ring-1 ring-inset ring-white/35',
  good: 'text-astral bg-astral/15',
  muted: 'text-white/45',
};

/** The supply a missing action would have used, so the dimmed slot still reads at a glance. */
const ACTION_ICON: Record<CareAction, IconName> = {
  bandage: 'item.bandage',
  clean: 'item.antiseptic',
  pain: 'item.painkillers',
  splint: 'item.splint',
  firstAid: 'item.medkit',
  support: 'item.cure',
};

/** Supplies whose generic item glyph would read poorly at 18px. */
const SUPPLY_ICON: Partial<Record<string, IconName>> = {
  improvised_bandage: 'item.cloth_rags',
  plasters: 'item.bandage',
  ifak_pouch: 'item.medkit',
  vitamin_c: 'item.cure',
};

function supplyIcon(defId: string, action: CareAction): IconName {
  const own = SUPPLY_ICON[defId];
  if (own) return own;
  const def = itemDefOrNull(defId);
  return def ? itemIcon(def) : ACTION_ICON[action];
}

interface Status {
  key: string;
  icon: IconName;
  tone: Tone;
  /** Tooltip / accessible text. */
  text: string;
  /** Tiny visible tag next to the icon (hours left), optional. */
  tag?: string;
  pulse?: boolean;
}

function partStatuses(part: BodyPart, recoveryPaused: boolean, t: T): Status[] {
  const out: Status[] = [];
  if (part.bleed === 'major') {
    out.push({ key: 'bleed', icon: 'status.bleeding', tone: 'danger', pulse: true,
      text: `${t('ui.body.majorBleeding')}\n${t('ui.body.majorDetail')}` });
  } else if (part.bleed === 'minor') {
    out.push({ key: 'bleed', icon: 'status.bleeding', tone: 'warn',
      text: `${t('ui.body.bleeding')}\n${t('ui.body.minorDetail')}` });
  } else if (recoveryPaused) {
    out.push({ key: 'recovery', icon: 'status.blocked', tone: 'muted', text: t('ui.care.recoveryPaused') });
  } else {
    out.push({ key: 'recovery', icon: 'meter.health', tone: 'good', text: t('ui.care.recovering') });
  }
  if (part.dirty) out.push({ key: 'dirty', icon: 'hdb.hazard', tone: 'warn', text: t('ui.care.dirtyHint') });
  if (part.dressing === 'clean') out.push({ key: 'dressing', icon: 'item.bandage', tone: 'good', text: t('ui.care.dressingClean') });
  if (part.dressing === 'soiled') out.push({ key: 'dressing', icon: 'item.bandage', tone: 'warn', text: t('ui.care.dressingSoiled') });
  if (part.fractured) {
    out.push(part.splinted
      ? { key: 'fracture', icon: 'item.splint', tone: 'good', text: t('ui.care.fractureSupported') }
      : { key: 'fracture', icon: 'status.fractured', tone: 'warn', text: t('ui.care.fractureUnsupported') });
  }
  const pain = Math.ceil(part.painReliefHours ?? 0);
  if (pain > 0) out.push({ key: 'pain', icon: 'item.painkillers', tone: 'good', tag: `${pain}h`, text: t('ui.care.painActive', { n: pain }) });
  const boost = Math.ceil(part.recoveryBoostHours ?? 0);
  if (boost > 0) out.push({ key: 'support', icon: 'item.cure', tone: 'good', tag: `${boost}h`, text: t('ui.care.supportActive', { n: boost }) });
  return out;
}

/** One tap target per supply; fine pointers apply on click, coarse pointers arm first so the detail can be read. */
interface Offer {
  key: string;
  action: CareAction;
  item: ItemInstance;
  defId: string;
  stock: number;
}

function stockOf(supplies: ItemInstance[], defId: string): number {
  return supplies.filter(item => item.defId === defId)
    .reduce((sum, item) => sum + (item.defId === 'medkit' ? (item.careUses ?? 3) + Math.max(0, item.stack - 1) * 3 : item.stack), 0);
}

/** Wound care as an icon strip per injured part: statuses left, supplies right, words in tooltips. */
export function WoundCarePanel({ bodyParts, feedback, onHighlight }: {
  bodyParts: BodyParts;
  feedback: CareFeedback | null;
  onHighlight: (id: BodyPartId | null) => void;
}) {
  const { locale, t } = useT();
  const coarse = useCoarsePointer();
  const { supplies, currentPositionId, inTunnel, locked, applyItem } = useGame(useShallow(s => ({
    supplies: s.items,
    currentPositionId: s.currentPositionId,
    inTunnel: !!s.tunnel,
    locked: s.phase !== 'game' || !!(s.combat && !s.combat.over) || !!s.travelAnim || !!s.pendingEvent || !!s.pendingSearch,
    applyItem: s.applyItem,
  })));
  /** Touch: the tapped icon whose detail is showing under its row (and, for supplies, armed to apply). */
  const [picked, setPicked] = useState<{ partId: BodyPartId; key: string; text: string; armed: boolean } | null>(null);
  useEffect(() => { if (locked) setPicked(null); }, [locked]);

  const available = supplies.filter(item => careForItem(item.defId) &&
    (isCarried(item.container) || item.container === TEMP_STASH || (!inTunnel && item.container === currentPositionId)));
  const affected = BODY_PART_IDS.filter(id => {
    const part = bodyParts[id];
    return part.hp < part.maxHp || part.bleed !== 'none' || part.fractured || part.crippled;
  });
  const recoveryPaused = BODY_PART_IDS.some(id => bodyParts[id].bleed === 'major');
  const aboutText = `${t('ui.care.optional')}\n${t('ui.care.recoveryHint')}`;

  const offerText = (offer: Offer, partName: string) => {
    const effect = offer.defId === 'improvised_bandage' ? t('ui.care.improvisedEffect') : t(`ui.care.effect.${offer.action}`);
    const cost = t(offer.defId === 'medkit' ? 'ui.care.kitCost' : 'ui.care.supplyCost', {
      item: itemName(offer.defId, locale), n: offer.stock,
    });
    return `${t(`ui.care.action.${offer.action}`)} · ${partName} · ${t('ui.care.minutes', { n: CARE_MINUTES[offer.action] })}\n${effect}\n${cost}`;
  };

  return (
    <div className={affected.length ? 'mb-2.5' : ''}>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {feedback && t(`ui.care.result.${feedback.action}`, { part: t(`ui.body.parts.${feedback.partId}`) })}
      </div>
      {affected.length > 0 && (
        <>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-label uppercase text-white/40">{t('ui.care.title')}</span>
            <button type="button"
              className="care-action inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-white/20 text-micro text-white/50"
              {...tip(aboutText, { placement: 'left' })} aria-label={aboutText}
              onClick={() => coarse && setPicked(p => p?.key === 'about' ? null : { partId: affected[0], key: 'about', text: aboutText, armed: false })}
            >i</button>
          </div>
          <div className="overflow-hidden rounded border border-white/10 bg-black/10">
            {affected.map(id => {
              const part = bodyParts[id];
              const partName = t(`ui.body.parts.${id}`);
              const eligible = ACTIONS.filter(action => canCareForPart(part, action));
              const offers: Offer[] = eligible.flatMap(action => {
                const items = available.filter(item => careForItem(item.defId) === action && canCareWithItem(part, item.defId));
                const ids = [...new Set(items.map(item => item.defId))];
                // The standard dressing first; improvised supplies stay a separate choice.
                ids.sort((a, b) => (a === 'bandage' ? -1 : b === 'bandage' ? 1 : 0));
                return ids.map(defId => ({ key: `${action}:${defId}`, action, defId,
                  item: items.find(item => item.defId === defId)!, stock: stockOf(items, defId) }));
              });
              const missing = eligible.filter(action => !offers.some(offer => offer.action === action));
              const statuses = partStatuses(part, recoveryPaused, t);
              const woundText = part.wound ? t(`ui.care.wound.${part.wound}`) : null;
              const rowPick = picked?.partId === id ? picked : null;
              return (
                <div
                  key={id}
                  className="border-b border-white/10 px-1.5 py-1 last:border-b-0"
                  onMouseEnter={() => onHighlight(id)}
                  onMouseLeave={() => onHighlight(null)}
                  onFocus={() => onHighlight(id)}
                  onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onHighlight(null); }}
                >
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <div className="min-w-[5.5rem] flex-1">
                      <div className="text-body leading-tight text-concrete-100">
                        <span className="whitespace-nowrap">{partName}</span>
                        {woundText && <span className="text-micro text-white/40"> · {woundText}</span>}
                      </div>
                      <ul className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5" aria-label={`${partName} · ${t('ui.care.statusLabel')}`}>
                        {statuses.map(status => (
                          <li key={status.key}>
                            <button type="button"
                              className={`care-action inline-flex h-[18px] cursor-help items-center gap-0.5 rounded px-1 ${TONE[status.tone]} ${status.pulse ? 'pulse-danger' : ''} ${rowPick?.key === status.key ? 'bg-white/10' : ''}`}
                              {...tip(status.text)} aria-label={status.text.replace('\n', '. ')}
                              onClick={() => coarse && setPicked(p => p?.partId === id && p.key === status.key ? null : { partId: id, key: status.key, text: status.text, armed: false })}
                            >
                              <Icon name={status.icon} size={13} />
                              {status.tag && <span className="text-micro tabular-nums leading-none">{status.tag}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="ml-auto flex flex-wrap justify-end gap-1">
                      {offers.map(offer => {
                        const text = offerText(offer, partName);
                        const armed = rowPick?.key === offer.key && rowPick.armed;
                        return (
                          <button key={offer.key} type="button" disabled={locked}
                            className={`care-action relative flex ${coarse ? 'h-9 w-9' : 'h-8 w-8'} items-center justify-center rounded border text-concrete-100 disabled:cursor-not-allowed disabled:opacity-40 ${armed ? 'border-astral/80 bg-astral/15' : 'border-white/15 bg-white/[0.06]'}`}
                            {...tip(text)} aria-label={text.replace(/\n/g, '. ')} aria-pressed={coarse ? armed : undefined}
                            onClick={() => {
                              if (coarse && !armed) { setPicked({ partId: id, key: offer.key, text, armed: true }); return; }
                              setPicked(null);
                              applyItem(offer.item.uid, id);
                            }}
                          >
                            <Icon name={supplyIcon(offer.defId, offer.action)} size={18} />
                            <span className="absolute -bottom-px right-0.5 text-micro tabular-nums leading-none text-white/70 [text-shadow:0_1px_1px_rgba(0,0,0,0.9)]">{offer.stock}</span>
                          </button>
                        );
                      })}
                      {missing.map(action => {
                        const text = `${t(`ui.care.action.${action}`)}\n${t('ui.care.noSupplyFor')}`;
                        return (
                          <button key={action} type="button"
                            className={`care-action flex ${coarse ? 'h-9 w-9' : 'h-8 w-8'} cursor-help items-center justify-center rounded border border-dashed border-white/10 text-white/25 ${rowPick?.key === action ? 'bg-white/10' : ''}`}
                            {...tip(text)} aria-label={text.replace('\n', '. ')} aria-disabled="true"
                            onClick={() => coarse && setPicked(p => p?.partId === id && p.key === action ? null : { partId: id, key: action, text, armed: false })}
                          >
                            <Icon name={ACTION_ICON[action]} size={16} className="opacity-40 grayscale" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {rowPick && (
                    <p className="care-result mt-1 whitespace-pre-line rounded bg-white/5 px-1.5 py-1 text-micro text-concrete-200">
                      {rowPick.text}
                      {rowPick.armed && <span className="mt-0.5 block text-astral">{t('ui.care.tapAgain')}</span>}
                    </p>
                  )}
                  {feedback?.partId === id && <p key={feedback.sequence} className="care-result mt-1 text-micro text-astral">{t(`ui.care.result.${feedback.action}`, { part: partName })}</p>}
                </div>
              );
            })}
          </div>
          {locked && <p className="mt-1.5 text-micro text-white/50">{t('ui.care.busy')}</p>}
        </>
      )}
    </div>
  );
}
