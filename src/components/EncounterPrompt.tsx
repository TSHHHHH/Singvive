import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { armCombatPenalty, formatClock, legTravelFactor } from '../game/survival';
import { useClockFormat } from '../game/settings';
import {
  STANCES,
  STANCE_ORDER,
  effectiveDefense,
  playerCombatStats,
  playerSpeed,
} from '../game/combat';
import type { StanceId } from '../game/types';

/**
 * The moment before a fight, as a row in the timeline.
 *
 * Combat used to open by replacing the whole timeline column the instant
 * something found you — the fight had already started and you were reading
 * about it. Then it became a bordered card above the log, which stopped the
 * teleport but still made the column lurch: a different type size, a different
 * box, a different set of margins for the one entry that mattered most.
 *
 * So it is now a timeline node like any other, and deliberately built from the
 * same parts as the live-event node directly above it — same dot, same
 * timestamp gutter, same hanging indent, same choice buttons under the text.
 * Being interrupted by a Brute and being interrupted by a stranger at a door
 * are the same kind of event, and they should read as one.
 *
 * Nothing else on the screen accepts input while this is up. That is not only
 * for emphasis — with the encounter pending and the world still live, you could
 * search, stash, craft or walk away from something already standing in front of
 * you.
 */
export function EncounterPrompt({
  /** Width of the timeline's timestamp gutter — owned by LogPanel. */
  timeW,
  /** LogPanel's hanging-indent style, so prose keeps the column's left edge. */
  hang,
}: {
  timeW: string;
  hang: { paddingLeft: string; textIndent: string };
}) {
  const combat = useGame((s) => s.combat);
  const character = useGame((s) => s.character);
  const meters = useGame((s) => s.meters);
  const bodyParts = useGame((s) => s.bodyParts);
  const equipment = useGame((s) => s.equipment);
  const hour = useGame((s) => s.hour);
  const combatSetStance = useGame((s) => s.combatSetStance);
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

  const speedFor = (id: StanceId) =>
    playerSpeed(character.attributes, STANCES[id], meters.energy, legTravelFactor(bodyParts));

  return (
    <li className="relative flex gap-2 rounded bg-white/[0.07] py-1 pl-6">
      {/* Same dot as a live event, in the danger colour rather than the
          go-ahead one — it is the same kind of moment, with a worse cause. */}
      <span className="absolute left-0 top-[7px] h-[11px] w-[11px] animate-pulse rounded-full border-2 border-concrete-900 bg-hiss" />
      <div className="min-w-0 flex-1">
        <p style={hang} className="whitespace-normal break-words text-xs leading-snug text-white/70">
          <span
            className="inline-block font-mono text-2xs tabular-nums text-white/25"
            style={{ width: timeW, textIndent: 0 }}
          >
            {formatClock(hour, clock)}
          </span>
          <span className="font-semibold text-hiss">Contact</span>
          {' — '}
          <Icon name={z.kind === 'human' ? 'combat.enemyHuman' : 'combat.enemyZombie'} />{' '}
          <span className="font-semibold text-concrete-50">{z.name}</span>
          {z.kind === 'human' ? ' blocks your way' : ' has found you'} on the{' '}
          {terrain.name.toLowerCase()}. Nothing else happens until you decide.
        </p>

        {/* The numbers the decision turns on, sized and indented like the
            "left behind" note a haul prints — a footnote to the sentence. */}
        <div className="mt-1 text-2xs text-white/40" style={{ paddingLeft: timeW }}>
          It moves at <span className="text-hiss">{z.speed.toFixed(0)}</span> · DEF{' '}
          {effectiveDefense(stats, STANCES.guarded, terrain)}–
          {effectiveDefense(stats, STANCES.aggressive, terrain)} · {stats.weaponName}
        </div>

        {/* Lined up under the text, exactly like an event's choices. */}
        <div className="mt-1.5 flex flex-col gap-1" style={{ paddingLeft: timeW }}>
          {STANCE_ORDER.map((id) => (
            <StanceChoice
              key={id}
              id={id}
              /* "Disengage" reads as jargon at the gate. */
              label={id === 'disengage' ? 'Flee' : undefined}
              speed={speedFor(id)}
              onClick={() => combatSetStance(id)}
            />
          ))}
        </div>
      </div>
    </li>
  );
}

/**
 * Built to the same spec as an event choice: icon, label, then the price at the
 * far end. Here the price is Speed — the number that decides how often you get
 * to act, and the one thing a stance costs you that isn't in its description.
 */
function StanceChoice({
  id,
  label,
  speed,
  onClick,
}: {
  id: StanceId;
  label?: string;
  speed: number;
  onClick: () => void;
}) {
  const s = STANCES[id];
  const tone =
    id === 'disengage'
      ? 'border-hiss/50 text-hiss hover:bg-hiss/10'
      : 'border-white/15 text-white/70 hover:bg-white/5';
  return (
    <button
      onClick={onClick}
      title={s.description}
      className={`flex w-full items-center gap-1.5 rounded border px-2 py-1 text-left text-xs leading-snug transition ${tone}`}
    >
      <Icon name={s.icon} size={13} className="shrink-0" />
      <span className="min-w-0 flex-1 whitespace-normal break-words">
        <span className="font-semibold">{label ?? s.name}</span>{' '}
        <span className="text-white/40">{s.description}</span>
      </span>
      <span className="shrink-0 tabular-nums opacity-60">SPD {speed.toFixed(0)}</span>
    </button>
  );
}
