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

  const aftermath =
    z.kind === 'human' ? ' blocks your way' : ' has found you';

  /** Timeline row — mirrors live-event title — body. */
  const prose = (
    <>
      <span className="font-semibold text-hiss">{t('ui.combat.contact')}</span>
      {' — '}
      {enemyIcon}{' '}
      <span className="font-semibold text-concrete-50">{zDisplay}</span>
      {aftermath} on the {terrain.name.toLowerCase()}. Nothing else happens until
      you decide.
    </>
  );

  /** Phone card already has a Contact eyebrow — skip the repeated label. */
  const cardProse = (
    <>
      {enemyIcon}{' '}
      <span className="font-semibold text-concrete-50">{zDisplay}</span>
      {aftermath} on the {terrain.name.toLowerCase()}. Nothing else happens until
      you decide.
    </>
  );

  const footnote = (
    <>
      It moves at <span className="text-hiss">{z.speed.toFixed(0)}</span> · {t('ui.combat.def')}{' '}
      {effectiveDefense(stats, STANCES.guarded, terrain)}–
      {effectiveDefense(stats, STANCES.aggressive, terrain)} · {stats.weaponName}
      {holsterRounds != null && (
        <>
          {' '}
          · {t('ui.combat.holstered', { n: holsterRounds })}
        </>
      )}
    </>
  );

  const choices = (
    <>
      <button
        type="button"
        onClick={combatEngage}
        className="flex w-full items-center gap-1.5 rounded border border-white/15 px-2 py-1 text-left text-xs leading-snug text-white/70 transition hover:bg-white/5"
      >
        <Icon name="combat.player" size={13} className="shrink-0" />
        <span className="min-w-0 flex-1 whitespace-normal break-words">
          <span className="font-semibold">{t('ui.combat.fight')}</span>{' '}
          <span className="text-white/40">{t('ui.combat.fightHint')}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={combatBreakOff}
        {...tip(STANCES.disengage.description)}
        className="flex w-full items-center gap-1.5 rounded border border-hiss/50 px-2 py-1 text-left text-xs leading-snug text-hiss transition hover:bg-hiss/10"
      >
        <Icon name={STANCES.disengage.icon} size={13} className="shrink-0" />
        <span className="min-w-0 flex-1 whitespace-normal break-words">
          <span className="font-semibold">{t('ui.combat.flee')}</span>{' '}
          <span className="text-hiss/70">{STANCES.disengage.description}</span>
        </span>
      </button>
    </>
  );

  if (variant === 'card') {
    return (
      <div className="space-y-2">
        <div className="text-2xs uppercase tracking-widest text-hiss/80">
          {t('ui.combat.contact')}
        </div>
        <p className="text-xs leading-snug text-white/70">
          <span className="mr-1.5 font-mono text-2xs tabular-nums text-white/35">
            {formatClock(hour, clock)}
          </span>
          {cardProse}
        </p>
        <div className="text-2xs text-white/40">{footnote}</div>
        <div className="flex flex-col gap-1">{choices}</div>
      </div>
    );
  }

  return (
    <li className="relative flex gap-2 rounded bg-white/[0.07] py-1 pl-6">
      <span className="absolute left-0 top-[7px] h-[11px] w-[11px] animate-pulse rounded-full border-2 border-concrete-900 bg-hiss" />
      <div className="min-w-0 flex-1">
        <div className="flex text-xs leading-snug text-white/70">
          <span
            className="shrink-0 font-mono text-2xs tabular-nums text-white/25"
            style={{ width: timeW }}
          >
            {formatClock(hour, clock)}
          </span>
          <p className="min-w-0 flex-1 whitespace-normal break-words">{prose}</p>
        </div>

        <div className="mt-1 text-2xs text-white/40" style={{ paddingLeft: timeW }}>
          {footnote}
        </div>

        <div className="mt-1.5 flex flex-col gap-1" style={{ paddingLeft: timeW }}>
          {choices}
        </div>
      </div>
    </li>
  );
}
