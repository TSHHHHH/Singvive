import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { combatantIcon } from '../game/enemies';
import { armCombatPenalty, formatClock, headCombatPenalty, torsoCarryMult } from '../game/survival';
import { useClockFormat } from '../game/settings';
import { sumTraitMod } from '../game/character';
import { loadEffectsFor } from '../game/inventory';
import { loadedRoundsOf, holsteredFirearm } from '../game/firearms';
import { fullEquipment } from '../game/equipmentSlots';
import {
  STANCES,
  effectiveDefense,
  playerCombatStats,
} from '../game/combat';
import { enemyName, useT } from '../i18n';
import { tip } from './tips';
import { combatWeaponLabel } from './combatLabels';
import { LIVE_NODE_BAND } from './logTimeline';
import { InjuryBrief } from './InjuryBrief';

type Variant = 'timeline' | 'card';

/**
 * The moment before a fight — timeline live node, or phone map interrupt card.
 *
 * Contact used to force a stance pick before anything moved. Stance now lives
 * inside the fight — here the only decision is whether to trade blows or break
 * away.
 *
 * Nothing else on the screen accepts input while this is up (contact gate).
 *
 * Layout note: do NOT put inline-flex / inline-block icons inside a
 * hanging-indent (`text-indent: -N`) paragraph. Browsers re-anchor those boxes
 * at the hang origin, so the enemy label lands on top of "Contact". Use a
 * real two-column flex instead — same visual, no indent math.
 */
export function EncounterPrompt({
  variant = 'timeline',
  /** Width of the timeline's timestamp gutter — owned by LogPanel. */
  timeW = '2.5rem',
}: {
  variant?: Variant;
  timeW?: string;
  /** Accepted for LogPanel call-site compat; unused (see layout note above). */
  hang?: { paddingLeft: string; textIndent: string };
}) {
  const { locale, t } = useT();
  const combat = useGame((s) => s.combat);
  const character = useGame((s) => s.character);
  const bodyParts = useGame((s) => s.bodyParts);
  const equipment = useGame((s) => s.equipment);
  const items = useGame((s) => s.items);
  const hour = useGame((s) => s.hour);
  const combatEngage = useGame((s) => s.combatEngage);
  const combatBreakOff = useGame((s) => s.combatBreakOff);
  const clock = useClockFormat();

  if (!combat || !character || !combat.awaitingStance) return null;

  const z = combat.zombie;
  const zDisplay = enemyName(z.templateId, z.name, locale);
  const terrain = combat.terrain;
  const load = loadEffectsFor(
    items,
    character.attributes,
    equipment,
    sumTraitMod(character.traitIds, 'carryCapacityMod'),
    torsoCarryMult(bodyParts),
  );
  const eq = fullEquipment(equipment);
  const holstered = holsteredFirearm(eq);
  const stats = playerCombatStats(
    character.attributes,
    character.traitIds,
    eq,
    armCombatPenalty(bodyParts) + headCombatPenalty(bodyParts),
    load.attackMod,
  );
  const holsterRounds = holstered ? loadedRoundsOf(holstered) : null;

  const enemyIcon = (
    <Icon
      name={combatantIcon(z)}
      size={12}
      className="mx-0.5 inline-block align-[-0.125em]"
    />
  );

  const contactText = t(z.kind === 'human' ? 'ui.combat.contactHuman' : 'ui.combat.contactOther', {
    enemy: zDisplay, terrain: t(`ui.combat.terrain.${terrain.id}`).toLocaleLowerCase(locale),
  });

  const prose = (
    <span className="text-concrete-50">{enemyIcon} {contactText}</span>
  );

  const footnote = (
    <>
      <span className="text-hiss">{t('ui.combat.movesAt', { speed: z.speed.toFixed(0) })}</span> · {t('ui.combat.def')}{' '}
      {effectiveDefense(stats, STANCES.guarded, terrain)}–
      {effectiveDefense(stats, STANCES.aggressive, terrain)} · {combatWeaponLabel(eq.mainHand, locale)}
      {holsterRounds != null && (
        <>
          {' '}
          · {t('ui.combat.holstered', { n: holsterRounds })}
        </>
      )}
    </>
  );

  const details = (
    <details className="mt-1 text-body text-white/60">
      <summary className="cursor-pointer text-label">{t('ui.combat.contactDetails')}</summary>
      <p className="mt-1 text-micro">{footnote}</p>
      <p className="text-micro">{t('ui.combat.fightHint')} {t('ui.combat.stanceHint.disengage')}</p>
      <InjuryBrief parts={bodyParts} className="mt-1" />
    </details>
  );

  const choices = (
    <>
      <button
        type="button"
        onClick={combatEngage}
        className="flex w-full items-center gap-1.5 rounded border border-white/15 px-2 py-1 text-left text-body text-white/70 transition hover:bg-white/5"
      >
        <Icon name="combat.player" size={13} className="shrink-0" />
        <span className="min-w-0 flex-1 whitespace-normal break-words">
          <span className="font-semibold">{t('ui.combat.fight')}</span>{' '}
        </span>
      </button>
      <button
        type="button"
        onClick={combatBreakOff}
        disabled={!load.canFlee}
        {...tip(load.canFlee ? t('ui.combat.stanceHint.disengage') : t('ui.load.noFlee'))}
        className={`flex w-full items-center gap-1.5 rounded border px-2 py-1 text-left text-body transition ${
          load.canFlee
            ? 'border-hiss/50 text-hiss hover:bg-hiss/10'
            : 'cursor-not-allowed border-white/10 text-white/30'
        }`}
      >
        <Icon name={STANCES.disengage.icon} size={13} className="shrink-0" />
        <span className="min-w-0 flex-1 whitespace-normal break-words">
          <span className="font-semibold">{t('ui.combat.flee')}</span>{' '}
          <span>{t(load.canFlee ? 'ui.combat.pursuit' : 'ui.combat.overloaded')}</span>
        </span>
      </button>
    </>
  );

  if (variant === 'card') {
    return (
      <div className="space-y-2">
        <p className="text-body text-white/70">
          <span className="mr-1.5 text-micro tabular-nums text-white/35">
            {formatClock(hour, clock)}
          </span>
          {prose}
        </p>
        <div className="flex flex-col gap-1">{choices}</div>
        {details}
      </div>
    );
  }

  return (
    <li data-timeline-live="" className={`relative flex gap-2 py-1 pl-6 ${LIVE_NODE_BAND}`}>
      <span className="absolute left-0 top-[7px] h-[11px] w-[11px] animate-pulse rounded-full border-2 border-concrete-900 bg-hiss" />
      <div className="min-w-0 flex-1">
        <div className="flex text-body text-white/70">
          <span
            className="shrink-0 text-micro tabular-nums text-white/25"
            style={{ width: timeW }}
          >
            {formatClock(hour, clock)}
          </span>
          <p className="min-w-0 flex-1 whitespace-normal break-words">{prose}</p>
        </div>

        <div className="mt-1.5 flex flex-col gap-1" style={{ paddingLeft: timeW }}>
          {choices}
          {details}
        </div>
      </div>
    </li>
  );
}
