import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { BODY_PART_IDS, MAJOR_BLEED_DRAIN_PER_HOUR, partConditionPct } from '../game/survival';
import { isCarried, TEMP_STASH } from '../game/inventory';
import { itemDefOrNull } from '../game/loot';
import {
  CARE_MINUTES, canCareForPart, canCareWithItem, careForItem, isOpenWound, openWoundHpLoss,
  WOUND_CLOSE_HOURS, WOUND_INFECT_CHECK_HOURS, woundCloseRate, woundInfectChance, type CareAction,
} from '../game/woundCare';
import { partInjuryEffects, type InjuryEffectKey } from '../game/injuryEffects';
import { injuryEffectText } from './injuryCopy';
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
type Tone = 'danger' | 'warn' | 'good' | 'effect';

/** Red is danger, cyan is care working, white is something to see to, grey is what it costs you. */
const TONE: Record<Tone, string> = {
  danger: 'text-hiss bg-hiss/15 ring-1 ring-inset ring-hiss/50',
  warn: 'text-concrete-50 bg-white/[0.07] ring-1 ring-inset ring-white/25',
  good: 'text-astral bg-astral/10',
  effect: 'text-white/60',
};

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

const EFFECT_ICON: Record<InjuryEffectKey, IconName> = {
  accuracy: 'action.target',
  block: 'slot.offHand',
  dodge: 'stance.disengage',
  travel: 'action.travel',
  search: 'action.search',
  awareness: 'attr.perception',
  energy: 'meter.energy',
  carry: 'meta.weight',
  maxHp: 'meter.health',
  recovery: 'meter.infection',
};

function supplyIcon(defId: string, action: CareAction): IconName {
  const own = SUPPLY_ICON[defId];
  if (own) return own;
  const def = itemDefOrNull(defId);
  return def ? itemIcon(def) : ACTION_ICON[action];
}

interface Chip {
  key: string;
  icon: IconName;
  tone: Tone;
  /** What the chip says on the panel. */
  label: string;
  /** Floating detail on hover / tap. */
  detail: string;
  pulse?: boolean;
}

/** Everything wrong with (or helping) one part, as icon + words; the floating tip carries the numbers. */
function partChips(id: BodyPartId, part: BodyPart, parts: BodyParts, t: T): Chip[] {
  const out: Chip[] = [];
  const isArm = id === 'leftArm' || id === 'rightArm';
  const isLeg = id === 'leftLeg' || id === 'rightLeg';
  if (part.bleed === 'major') {
    out.push({ key: 'bleed', icon: 'status.bleeding', tone: 'danger', pulse: true, label: t('ui.body.majorBleeding'),
      detail: t('ui.body.majorDetail', { n: MAJOR_BLEED_DRAIN_PER_HOUR }) });
  } else if (part.bleed === 'minor') {
    out.push({ key: 'bleed', icon: 'status.bleeding', tone: 'warn', label: t('ui.body.bleeding'), detail: t('ui.body.minorDetail') });
  }
  if (part.crippled || part.hp <= 0) {
    const vital = id === 'head' || id === 'torso';
    out.push({ key: 'crippled', icon: 'status.crippled', tone: 'danger',
      label: t(vital ? 'ui.body.critical' : 'ui.body.crippled'),
      detail: id === 'torso' ? t('ui.body.criticalTorso') : id === 'head' ? t('ui.body.criticalHead')
        : isLeg ? t('ui.body.crippledLeg') : isArm ? t('ui.body.crippledArm') : t('ui.body.crippledOther') });
  }
  if (part.woundInfected) {
    out.push({ key: 'infected', icon: 'meter.infection', tone: 'danger', pulse: true, label: t('ui.care.chip.infected'), detail: t('ui.care.infectedHint') });
  }
  if (part.fractured) {
    out.push(part.splinted
      ? { key: 'fracture', icon: 'item.splint', tone: 'good', label: t('ui.care.chip.splinted'), detail: t('ui.care.fractureSupported') }
      : { key: 'fracture', icon: 'status.fractured', tone: 'warn', label: t('ui.body.fractured'),
        detail: `${t('ui.care.fractureUnsupported')}\n${isLeg ? t('ui.body.fracturedLeg') : isArm ? t('ui.body.fracturedArm') : t('ui.body.fracturedOther')}` });
  }
  if (part.dirty) out.push({ key: 'dirty', icon: 'hdb.hazard', tone: 'warn', label: t('ui.care.chip.dirty'), detail: t('ui.care.dirtyHint') });
  if (part.dressing === 'soiled') out.push({ key: 'dressing', icon: 'item.bandage', tone: 'warn', label: t('ui.care.chip.soiled'), detail: t('ui.care.dressingSoiled') });
  if (part.dressing === 'clean') out.push({ key: 'dressing', icon: 'item.bandage', tone: 'good', label: t('ui.care.chip.dressed'), detail: t('ui.care.dressingClean') });
  if (!part.woundInfected && isOpenWound(part)) {
    const age = part.woundAgeHours ?? 0;
    const h = Math.max(1, Math.ceil(WOUND_INFECT_CHECK_HOURS - (age % WOUND_INFECT_CHECK_HOURS)));
    const pct = Math.round(woundInfectChance(part) * 100);
    if (pct > 0) out.push({ key: 'risk', icon: 'meter.infection', tone: pct >= 25 ? 'warn' : 'effect', label: t('ui.care.chip.risk', { pct }), detail: t('ui.care.riskHint', { h, pct }) });
  }
  if (isOpenWound(part)) {
    const left = Math.max(1, Math.ceil((WOUND_CLOSE_HOURS[part.wound] - (part.woundCloseHours ?? 0)) / Math.max(0.05, woundCloseRate(part))));
    const n = openWoundHpLoss(part);
    out.push({ key: 'open', icon: 'meter.health', tone: 'effect', label: t('ui.injury.effect.maxHp', { n }), detail: t('ui.care.openHint', { n, left }) });
  }
  for (const effect of partInjuryEffects(parts, id)) {
    if (effect.key === 'maxHp') continue; // the open-wound chip already says it, with the healing time
    out.push({ key: `fx:${effect.key}`, icon: EFFECT_ICON[effect.key], tone: 'effect',
      label: injuryEffectText(effect, t), detail: t(`ui.injury.effectDetail.${effect.key}`, { n: effect.value }) });
  }
  const cover = Math.ceil(part.antibioticHours ?? 0);
  if (cover > 0 && (isOpenWound(part) || part.woundInfected)) {
    out.push({ key: 'cover', icon: 'item.cure', tone: 'good', label: t('ui.care.chip.cover', { n: cover }), detail: t('ui.care.coverActive', { n: cover }) });
  }
  const pain = Math.ceil(part.painReliefHours ?? 0);
  if (pain > 0) out.push({ key: 'pain', icon: 'item.painkillers', tone: 'good', label: t('ui.care.chip.pain', { n: pain }), detail: t('ui.care.painActive', { n: pain }) });
  const boost = Math.ceil(part.recoveryBoostHours ?? 0);
  if (boost > 0) out.push({ key: 'support', icon: 'item.cure', tone: 'good', label: t('ui.care.chip.support', { n: boost }), detail: t('ui.care.supportActive', { n: boost }) });
  return out;
}

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

function barColor(pct: number): string {
  if (pct >= 90) return '#5a5a5e';
  if (pct >= 70) return '#8a7250';
  if (pct >= 40) return '#a5522f';
  return '#d92d2d';
}

function needsAttention(part: BodyPart): boolean {
  return part.hp < part.maxHp || part.bleed !== 'none' || !!part.fractured || !!part.crippled || !!part.wound || !!part.woundInfected;
}

/**
 * The limb list and wound care in one: every part's HP bar, and under an injured
 * part what is wrong with it (icon + words, numbers in the floating tip) and the
 * supplies on hand that would help. Supplies you don't have are not shown.
 */
export function BodyCareList({ bodyParts, feedback, highlighted, onHover }: {
  bodyParts: BodyParts;
  feedback: CareFeedback | null;
  highlighted: BodyPartId | null;
  onHover: (id: BodyPartId | null) => void;
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
  /** Touch: the tapped chip or supply whose detail shows under its row (supplies arm first, apply on the second tap). */
  const [picked, setPicked] = useState<{ partId: BodyPartId; key: string; text: string; armed: boolean } | null>(null);
  useEffect(() => { if (locked) setPicked(null); }, [locked]);

  const available = supplies.filter(item => careForItem(item.defId) &&
    (isCarried(item.container) || item.container === TEMP_STASH || (!inTunnel && item.container === currentPositionId)));
  const anyInjured = BODY_PART_IDS.some(id => needsAttention(bodyParts[id]));

  const offerText = (offer: Offer, partName: string) => {
    const effect = offer.defId === 'improvised_bandage' ? t('ui.care.improvisedEffect') : t(`ui.care.effect.${offer.action}`);
    const cost = t(offer.defId === 'medkit' ? 'ui.care.kitCost' : 'ui.care.supplyCost', {
      item: itemName(offer.defId, locale), n: offer.stock,
    });
    return `${t(`ui.care.action.${offer.action}`)} · ${partName} · ${t('ui.care.minutes', { n: CARE_MINUTES[offer.action] })}\n${effect}\n${cost}`;
  };

  return (
    <div className="care-overview flex h-full min-w-0 flex-col justify-center rounded border border-white/10 bg-black/25 p-1">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {feedback && t(`ui.care.result.${feedback.action}`, { part: t(`ui.body.parts.${feedback.partId}`) })}
      </div>
      {BODY_PART_IDS.map(id => {
        const part = bodyParts[id];
        const partName = t(`ui.body.parts.${id}`);
        const hurt = needsAttention(part);
        const pct = partConditionPct(part);
        const hpText = `${Math.round(part.hp)}/${part.maxHp}`;
        const offers: Offer[] = hurt ? ACTIONS.filter(action => canCareForPart(part, action)).flatMap(action => {
          const items = available.filter(item => careForItem(item.defId) === action && canCareWithItem(part, item.defId));
          const ids = [...new Set(items.map(item => item.defId))];
          ids.sort((a, b) => (a === 'bandage' ? -1 : b === 'bandage' ? 1 : 0));
          return ids.map(defId => ({ key: `${action}:${defId}`, action, defId,
            item: items.find(item => item.defId === defId)!, stock: stockOf(items, defId) }));
        }) : [];
        const chips = hurt ? partChips(id, part, bodyParts, t) : [];
        const woundText = part.wound && part.wound !== 'bruise' ? t(`ui.care.wound.${part.wound}`) : null;
        const rowPick = picked?.partId === id ? picked : null;
        const lit = highlighted === id;
        return (
          <div
            key={id}
            className={`rounded px-1 transition ${hurt ? 'py-1' : 'py-0.5'} ${lit ? 'bg-white/10' : 'hover:bg-white/5'} ${part.bleed === 'major' ? 'bg-hiss/10' : ''}`}
            onMouseEnter={() => onHover(id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(id)}
            onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onHover(null); }}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-9 shrink-0 text-label uppercase text-white/45">{partName}</span>
              <div className="relative min-h-[1em] min-w-0 flex-1 overflow-hidden rounded bg-black/50 ring-1 ring-white/10" aria-label={`${partName} ${hpText}`}>
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-300 ${part.bleed === 'major' ? 'pulse-danger' : ''}`}
                  style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: barColor(pct) }}
                />
                <span className="relative z-[1] flex items-center justify-between gap-1 px-1.5 py-0.5 text-body tabular-nums leading-none text-white/80 [text-shadow:0_1px_1px_rgba(0,0,0,0.85)]">
                  <span className="truncate text-micro text-white/70">{woundText}</span>
                  <span>{hpText}</span>
                </span>
              </div>
              {offers.length > 0 && (
                <div className="flex shrink-0 gap-1" aria-label={`${partName} · ${t('ui.care.title')}`}>
                  {offers.map(offer => {
                    const text = offerText(offer, partName);
                    const armed = rowPick?.key === offer.key && rowPick.armed;
                    return (
                      <button key={offer.key} type="button" disabled={locked}
                        className={`care-action relative flex ${coarse ? 'h-9 w-9' : 'h-7 w-7'} items-center justify-center rounded border text-concrete-100 disabled:cursor-not-allowed disabled:opacity-40 ${armed ? 'border-astral/80 bg-astral/15' : 'border-white/20 bg-white/[0.07] hover:bg-white/15'}`}
                        {...tip(text)} aria-label={text.replace(/\n/g, '. ')} aria-pressed={coarse ? armed : undefined}
                        onClick={() => {
                          if (coarse && !armed) { setPicked({ partId: id, key: offer.key, text, armed: true }); return; }
                          setPicked(null);
                          applyItem(offer.item.uid, id);
                        }}
                      >
                        <Icon name={supplyIcon(offer.defId, offer.action)} size={16} />
                        <span className="absolute -bottom-px right-0.5 text-micro tabular-nums leading-none text-white/70 [text-shadow:0_1px_1px_rgba(0,0,0,0.9)]">{offer.stock}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {chips.length > 0 && (
              <ul className="ml-[2.625rem] mt-1 flex flex-wrap gap-1" aria-label={`${partName} · ${t('ui.care.statusLabel')}`}>
                {chips.map(chip => (
                  <li key={chip.key}>
                    <button type="button"
                      className={`care-action inline-flex h-[18px] cursor-help items-center gap-1 rounded px-1 text-micro leading-none ${TONE[chip.tone]} ${chip.pulse ? 'pulse-danger' : ''} ${rowPick?.key === chip.key ? 'bg-white/15' : ''}`}
                      {...tip(`${chip.label}\n${chip.detail}`)} aria-label={`${chip.label}. ${chip.detail.replace(/\n/g, '. ')}`}
                      onClick={() => coarse && setPicked(p => p?.partId === id && p.key === chip.key ? null : { partId: id, key: chip.key, text: `${chip.label}\n${chip.detail}`, armed: false })}
                    >
                      <Icon name={chip.icon} size={12} />
                      <span className="whitespace-nowrap">{chip.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {rowPick && (
              <p className="care-result ml-[2.625rem] mt-1 whitespace-pre-line rounded bg-white/5 px-1.5 py-1 text-micro text-concrete-200">
                {rowPick.text}
                {rowPick.armed && <span className="mt-0.5 block text-astral">{t('ui.care.tapAgain')}</span>}
              </p>
            )}
            {feedback?.partId === id && <p key={feedback.sequence} className="care-result ml-[2.625rem] mt-1 text-micro text-astral">{t(`ui.care.result.${feedback.action}`, { part: partName })}</p>}
          </div>
        );
      })}
      {anyInjured && locked && <p className="mt-1 px-1 text-micro text-white/50">{t('ui.care.busy')}</p>}
    </div>
  );
}
