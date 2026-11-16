import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { tip } from './tips';
import { itemName, useT } from '../i18n';
import { itemDefOrNull } from '../game/loot';
import { itemIcon } from './Inventory/itemIcon';
import { summarizeTally, type CombatTally, type PartInjury } from '../game/combatTally';
import type { BodyPartId } from '../game/types';

const PART_ICON: Record<BodyPartId, IconName> = {
  head: 'slot.head',
  torso: 'slot.body',
  leftArm: 'slot.hands',
  rightArm: 'slot.hands',
  leftLeg: 'slot.legs',
  rightLeg: 'slot.legs',
};

const VERDICT_TONE = {
  flawless: 'border-astral/60 bg-astral/15 text-astral',
  clean: 'border-white/30 bg-white/10 text-concrete-50',
  bloodied: 'border-hiss/50 bg-hiss/10 text-hiss',
  barely: 'border-hiss/70 bg-hiss/25 text-hiss',
  escaped: 'border-white/30 bg-white/5 text-concrete-100',
} as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** One icon + number cell; the words live in the tooltip. */
function Stat({
  icon,
  glyph,
  value,
  sub,
  tipText,
  tone = 'text-concrete-50',
}: {
  icon?: IconName;
  glyph?: string;
  value: ReactNode;
  sub?: ReactNode;
  tipText: string;
  tone?: string;
}) {
  return (
    <span
      tabIndex={0}
      className={`inline-flex cursor-help items-center gap-1 whitespace-nowrap tabular-nums ${tone}`}
      {...tip(tipText)}
      aria-label={tipText.replace(/\n/g, ' ')}
    >
      {icon ? (
        <Icon name={icon} size={14} className="opacity-80" />
      ) : (
        <span aria-hidden className="w-3.5 text-center leading-none opacity-80">
          {glyph}
        </span>
      )}
      <span className="font-bold">{value}</span>
      {sub != null && <span className="text-micro font-normal text-white/40">{sub}</span>}
    </span>
  );
}

/**
 * The card that sits where the speed track was once a fight ends with you
 * alive. Reads the per-fight tally only — the log above it stays as it was.
 */
export function CombatSummary({
  tally,
  outcome,
  round,
  hpBefore,
  hpAfter,
  hpMax,
  drops,
  animate,
}: {
  tally: CombatTally;
  outcome: 'win' | 'flee';
  round: number;
  hpBefore: number;
  hpAfter: number;
  hpMax: number;
  drops: string[];
  animate: boolean;
}) {
  const { locale, t } = useT();
  const s = summarizeTally(tally, outcome, hpAfter, hpMax);
  const minutes = Math.max(1, Math.round(tally.minutes));
  const before = Math.round(hpBefore);
  const after = Math.max(0, Math.round(hpAfter));
  const max = Math.max(1, Math.round(hpMax));
  /** Staggered settle-in for a row; merges with the row's own classes. */
  const anim = (i: number, className = '') =>
    animate
      ? { className: `combat-summary-row ${className}`, style: { animationDelay: `${i * 70}ms` } }
      : { className };

  const injuryIcons = (inj: PartInjury) => {
    const out: { key: string; icon: IconName; tone: string; text: string }[] = [];
    if (inj.crippled) out.push({ key: 'crip', icon: 'status.crippled', tone: 'text-hiss', text: t('ui.combat.summary.crippled') });
    if (inj.fractured) out.push({ key: 'frac', icon: 'status.fractured', tone: 'text-hiss', text: t('ui.combat.summary.fractured') });
    if (inj.bleed) {
      out.push({
        key: 'bleed',
        icon: 'status.bleeding',
        tone: inj.bleed === 'major' ? 'text-hiss pulse-danger' : 'text-concrete-50',
        text: t(inj.bleed === 'major' ? 'ui.combat.summary.bleedMajor' : 'ui.combat.summary.bleedMinor'),
      });
    }
    return out;
  };

  const dropDefs = drops.map((id) => ({ id, def: itemDefOrNull(id) })).filter((d) => d.def);
  const lostPct = Math.max(0, Math.min(100, ((before - after) / max) * 100));
  const afterPct = Math.max(0, Math.min(100, (after / max) * 100));

  return (
    <section
      aria-label={t('ui.combat.summary.title')}
      className="shrink-0 space-y-1.5 rounded border border-white/15 bg-black/40 p-1.5 text-body"
    >
      {/* ---- verdict + time ---- */}
      <div {...anim(0)}>
        <div className="flex items-center justify-between gap-2">
          <span
            tabIndex={0}
            className={`cursor-help rounded border px-1.5 py-px text-plate font-bold uppercase ${VERDICT_TONE[s.verdict]}`}
            {...tip(t(`ui.combat.summary.verdictTip.${s.verdict}`))}
          >
            {t(`ui.combat.summary.verdict.${s.verdict}`)}
          </span>
          <span
            tabIndex={0}
            className="cursor-help whitespace-nowrap text-micro tabular-nums text-white/40"
            {...tip(t('ui.combat.summary.timeTip', { turns: round, min: minutes }))}
          >
            ⏱ {t('ui.combat.summary.turns', { n: round })} · {t('ui.combat.summary.minutes', { n: minutes })}
          </span>
        </div>
      </div>

      {/* ---- you | them ---- */}
      <div {...anim(1, 'grid grid-cols-2 gap-1.5')}>
        <div className="space-y-1 rounded border border-astral/25 bg-astral/5 px-1.5 py-1">
          <div className="text-micro uppercase text-astral/70">{t('ui.combat.summary.you')}</div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Stat icon="choice.fight" value={tally.damageDealt} tipText={t('ui.combat.summary.dealtTip')} />
            {s.hitRate != null && s.hitOdds != null && (
              <Stat
                icon="action.target"
                value={t('ui.combat.summary.hits', { hits: tally.hits, swings: tally.swings })}
                sub={pct(s.hitOdds)}
                tipText={t(tally.shots > 0 ? 'ui.combat.summary.hitsTipShots' : 'ui.combat.summary.hitsTip', {
                  hits: tally.hits,
                  swings: tally.swings,
                  shots: tally.shots,
                  rate: pct(s.hitRate),
                  odds: pct(s.hitOdds),
                })}
              />
            )}
            {tally.crits > 0 && (
              <Stat
                glyph="✦"
                tone="text-signal"
                value={tally.crits}
                sub={t('ui.combat.summary.best', { n: tally.bestHit })}
                tipText={t('ui.combat.summary.critsTip', { best: tally.bestHit })}
              />
            )}
            {outcome === 'win' && (
              <Stat icon="action.kills" value={t('ui.combat.summary.kill')} tone="text-signal" tipText={t('ui.combat.summary.killTip')} />
            )}
          </div>
        </div>
        <div className="space-y-1 rounded border border-hiss/25 bg-hiss/5 px-1.5 py-1">
          <div className="text-micro uppercase text-hiss/70">{t('ui.combat.summary.them')}</div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Stat
              icon="meter.health"
              value={tally.damageTaken > 0 ? `−${Math.round(tally.damageTaken)}` : '0'}
              tone={tally.damageTaken > 0 ? 'text-hiss' : 'text-concrete-50'}
              tipText={t('ui.combat.summary.takenTip')}
            />
            {s.enemyHitRate != null && (
              <Stat
                icon="choice.fight"
                tone="text-hiss"
                value={t('ui.combat.summary.landed', { hits: tally.enemyHits, attacks: tally.enemyAttacks })}
                sub={s.enemyOdds != null ? pct(s.enemyOdds) : undefined}
                tipText={
                  s.enemyOdds != null
                    ? t('ui.combat.summary.landedTip', {
                        hits: tally.enemyHits,
                        attacks: tally.enemyAttacks,
                        rate: pct(s.enemyHitRate),
                        odds: pct(s.enemyOdds),
                      })
                    : t('ui.combat.summary.landedTipFlee', {
                        hits: tally.enemyHits,
                        attacks: tally.enemyAttacks,
                        rate: pct(s.enemyHitRate),
                      })
                }
              />
            )}
            {tally.dodges > 0 && (
              <Stat icon="stance.disengage" value={tally.dodges} tone="text-astral" tipText={t('ui.combat.summary.dodgesTip')} />
            )}
            {tally.blocks > 0 && (
              <Stat icon="slot.offHand" value={tally.blocks} tone="text-astral" tipText={t('ui.combat.summary.blocksTip')} />
            )}
            {tally.infection > 0 && (
              <Stat
                icon="meter.infection"
                value={t('ui.combat.summary.infection', { n: Math.round(tally.infection) })}
                tone="text-hiss"
                tipText={t('ui.combat.summary.infectionTip')}
              />
            )}
          </div>
        </div>
      </div>

      {/* ---- injuries ---- */}
      <ul {...anim(2, 'flex flex-wrap items-center gap-1')}>
        {s.injuries.length === 0 ? (
          <li
            tabIndex={0}
            className="inline-flex cursor-help items-center gap-1 rounded bg-astral/10 px-1.5 py-px text-astral"
            {...tip(t('ui.combat.summary.noWoundsTip'))}
          >
            ✓ {t('ui.combat.summary.noWounds')}
          </li>
        ) : (
          s.injuries.map(({ part, injury }) => {
            const partName = t(`ui.body.parts.${part}`);
            const flags = injuryIcons(injury);
            const lines = [
              t('ui.combat.summary.partTip', { part: partName, hits: injury.hits, dmg: Math.round(injury.damage) }),
              injury.wound ? t('ui.combat.summary.woundNew', { wound: t(`ui.care.wound.${injury.wound}`) }) : null,
              ...flags.map((f) => f.text),
            ].filter(Boolean);
            const serious = injury.crippled || injury.fractured || injury.bleed === 'major';
            return (
              <li
                key={part}
                tabIndex={0}
                className={`inline-flex cursor-help items-center gap-1 rounded px-1.5 py-px ring-1 ring-inset ${
                  serious ? 'bg-hiss/20 ring-hiss/50' : 'bg-white/5 ring-white/15'
                }`}
                {...tip(lines.join('\n'))}
                aria-label={lines.join('. ')}
              >
                <Icon name={PART_ICON[part]} size={13} className="opacity-70" />
                <span className="text-concrete-100">{partName}</span>
                {injury.wound && <span className="text-micro text-white/45">{t(`ui.care.wound.${injury.wound}`)}</span>}
                {flags.map((f) => (
                  <Icon key={f.key} name={f.icon} size={13} className={f.tone} />
                ))}
                <span className="tabular-nums text-hiss">{t('ui.combat.summary.partHits', { n: Math.round(injury.damage) })}</span>
              </li>
            );
          })
        )}
      </ul>

      {/* ---- health before → after, and what's on the body ---- */}
      <div {...anim(3, 'flex items-center gap-2')}>
        <span
          tabIndex={0}
          className="flex min-w-0 flex-1 cursor-help items-center gap-1.5"
          {...tip(t('ui.combat.summary.healthTip', { max }))}
        >
          <Icon name="meter.health" size={14} className="shrink-0 text-hiss" />
          <span className="relative h-1.5 min-w-[3rem] flex-1 overflow-hidden rounded-sm bg-black/60 ring-1 ring-white/10">
            <span className="absolute inset-y-0 left-0 bg-[#d92d2d]" style={{ width: `${afterPct}%` }} />
            <span
              className="absolute inset-y-0 bg-white/35"
              style={{ left: `${afterPct}%`, width: `${lostPct}%` }}
            />
          </span>
          <span className="whitespace-nowrap tabular-nums text-concrete-100">
            {t('ui.combat.summary.health', { before, after })}
          </span>
        </span>
        {dropDefs.length > 0 && (
          <span
            tabIndex={0}
            className="inline-flex shrink-0 cursor-help items-center gap-1"
            {...tip(`${t('ui.combat.summary.drops')} · ${t('ui.combat.summary.dropsTip')}\n${dropDefs.map((d) => itemName(d.id, locale)).join(', ')}`)}
          >
            <span className="text-micro uppercase text-white/40">{t('ui.combat.summary.drops')}</span>
            {dropDefs.slice(0, 5).map((d, i) => (
              <Icon key={`${d.id}-${i}`} name={itemIcon(d.def!)} size={16} />
            ))}
            {dropDefs.length > 5 && <span className="text-micro text-white/40">+{dropDefs.length - 5}</span>}
          </span>
        )}
      </div>
    </section>
  );
}
