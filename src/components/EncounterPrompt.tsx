import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { armCombatPenalty, formatClock } from '../game/survival';
import { useClockFormat } from '../game/settings';
import {
  STANCES,
  effectiveDefense,
  playerCombatStats,
} from '../game/combat';

type Variant = 'timeline' | 'card';

/**
 * The moment before a fight — timeline live node, or phone map interrupt card.
 *
 * Contact used to force a stance pick before anything moved. Stance now lives
 * inside the fight — here the only decision is whether to trade blows or break
 * away.
 *
 * Nothing else on the screen accepts input while this is up (contact gate).
 */
export function EncounterPrompt({
  variant = 'timeline',
  /** Width of the timeline's timestamp gutter — owned by LogPanel. */
  timeW = '2.5rem',
  /** LogPanel's hanging-indent style, so prose keeps the column's left edge. */
  hang = { paddingLeft: '2.5rem', textIndent: '-2.5rem' },
}: {
  variant?: Variant;
  timeW?: string;
  hang?: { paddingLeft: string; textIndent: string };
}) {
  const combat = useGame((s) => s.combat);
  const character = useGame((s) => s.character);
  const bodyParts = useGame((s) => s.bodyParts);
  const equipment = useGame((s) => s.equipment);
  const hour = useGame((s) => s.hour);
  const combatEngage = useGame((s) => s.combatEngage);
  const combatBreakOff = useGame((s) => s.combatBreakOff);
  const clock = useClockFormat();

  if (!combat || !character || !combat.awaitingStance) return null;

  const z = combat.zombie;
  const terrain = combat.terrain;
  const stats = playerCombatStats(
    character.attributes,
    character.traitIds,
    equipment,
    armCombatPenalty(bodyParts),
  );

  const prose = (
    <>
      <span className="font-semibold text-hiss">Contact</span>
      {' — '}
      <Icon name={z.kind === 'human' ? 'combat.enemyHuman' : 'combat.enemyZombie'} />{' '}
      <span className="font-semibold text-concrete-50">{z.name}</span>
      {z.kind === 'human' ? ' blocks your way' : ' has found you'} on the{' '}
      {terrain.name.toLowerCase()}. Nothing else happens until you decide.
    </>
  );

  const footnote = (
    <>
      It moves at <span className="text-hiss">{z.speed.toFixed(0)}</span> · DEF{' '}
      {effectiveDefense(stats, STANCES.guarded, terrain)}–
      {effectiveDefense(stats, STANCES.aggressive, terrain)} · {stats.weaponName}
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
          <span className="font-semibold">Fight</span>{' '}
          <span className="text-white/40">
            Commit — open on Guarded, switch stance once the track is running.
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={combatBreakOff}
        title={STANCES.disengage.description}
        className="flex w-full items-center gap-1.5 rounded border border-hiss/50 px-2 py-1 text-left text-xs leading-snug text-hiss transition hover:bg-hiss/10"
      >
        <Icon name={STANCES.disengage.icon} size={13} className="shrink-0" />
        <span className="min-w-0 flex-1 whitespace-normal break-words">
          <span className="font-semibold">Flee</span>{' '}
          <span className="text-hiss/70">{STANCES.disengage.description}</span>
        </span>
      </button>
    </>
  );

  if (variant === 'card') {
    return (
      <div className="space-y-2">
        <div className="text-2xs uppercase tracking-widest text-hiss/80">Contact</div>
        <p className="text-xs leading-snug text-white/70">
          <span className="mr-1.5 font-mono text-2xs tabular-nums text-white/35">
            {formatClock(hour, clock)}
          </span>
          {prose}
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
        <p style={hang} className="whitespace-normal break-words text-xs leading-snug text-white/70">
          <span
            className="inline-block font-mono text-2xs tabular-nums text-white/25"
            style={{ width: timeW, textIndent: 0 }}
          >
            {formatClock(hour, clock)}
          </span>
          {prose}
        </p>

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
