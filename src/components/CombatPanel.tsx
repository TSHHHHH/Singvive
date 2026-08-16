import { useEffect, useRef, type ReactNode } from 'react';
import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { armCombatPenalty, legTravelFactor, totalHp, totalMaxHp } from '../game/survival';
import { equipSpeedBonus } from '../game/inventory';
import {
  COMBAT_SPEEDS,
  FIGHT_STANCE_ORDER,
  GAUGE_FULL,
  STANCES,
  effectiveDefense,
  playerCombatStats,
  playerSpeed,
  secondsPerAction,
} from '../game/combat';
import type { CombatLogEntry, StanceId } from '../game/types';

const TONE_CLASS: Record<CombatLogEntry['tone'], string> = {
  player: 'text-astral',
  enemy: 'text-hiss',
  roll: 'text-white/35',
  info: 'text-concrete-200',
  good: 'text-signal',
  bad: 'text-hiss',
};

/** Wall-clock tick. Small enough that the markers read as sliding, not jumping. */
const TICK_MS = 50;

/**
 * The fight itself, in the right-hand column in place of the event log.
 *
 * This mounts once the player chooses Fight at contact — `EncounterPrompt`
 * sits in the timeline until then. The fight runs on one initiative track:
 * two markers racing left to right at each side's Speed, and whoever touches
 * the far end swings.
 *
 * Stance is live: switch Aggressive / Guarded / Precision any time and the
 * next swing uses the new profile. Break off flees on the disengage profile.
 * Items stay in the pack until the fight is over.
 */
export function CombatPanel() {
  const combat = useGame((s) => s.combat);
  const meters = useGame((s) => s.meters);
  const bodyParts = useGame((s) => s.bodyParts);
  const equipment = useGame((s) => s.equipment);
  const character = useGame((s) => s.character);
  const combatBreakOff = useGame((s) => s.combatBreakOff);
  const combatContinue = useGame((s) => s.combatContinue);
  const combatTick = useGame((s) => s.combatTick);
  const combatTogglePause = useGame((s) => s.combatTogglePause);
  const combatSetSpeedIndex = useGame((s) => s.combatSetSpeedIndex);
  const combatSetStance = useGame((s) => s.combatSetStance);

  const logRef = useRef<HTMLDivElement>(null);

  const running = !!combat && !combat.over && !combat.awaitingStance && !combat.paused;
  const rate = combat ? COMBAT_SPEEDS[combat.speedIndex] : 1;

  // The track runs itself once a stance is committed. Real time in, fight time
  // out — the speed control is nothing more than the multiplier on this line.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => combatTick((TICK_MS / 1000) * rate), TICK_MS);
    return () => clearInterval(id);
  }, [running, rate, combatTick]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [combat?.log.length]);

  if (!combat || !character) return null;

  const maxHp = totalMaxHp(bodyParts);
  const currentHp = totalHp(bodyParts);
  const z = combat.zombie;
  const zPct = Math.max(0, (z.hp / z.maxHp) * 100);
  const hpPct = maxHp > 0 ? Math.max(0, (currentHp / maxHp) * 100) : 0;
  const stats = playerCombatStats(
    character.attributes,
    character.traitIds,
    equipment,
    armCombatPenalty(bodyParts),
  );
  const stance = STANCES[combat.selectedStance];
  const terrain = combat.terrain;
  const pSpeed = playerSpeed(
    character.attributes,
    stance,
    meters.energy,
    legTravelFactor(bodyParts),
    equipSpeedBonus(equipment),
  );

  const groups = groupLog(combat.log);

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-sm">
      {/* ---- the two corners, side by side ----
           Both fighters get the same three lines in the same order, so the
           comparison you actually care about mid-fight — am I hitting harder
           than it, am I slower than it — is a straight left-to-right read. */}
      <div className="flex shrink-0 gap-1.5">
        <Corner
          name={character.name}
          icon="combat.player"
          hp={Math.max(0, Math.round(currentHp))}
          maxHp={Math.round(maxHp)}
          pct={hpPct}
          color="#d92d2d"
          damage={stats.damage + stance.damageMod}
          defense={effectiveDefense(stats, stance, terrain)}
          speed={pSpeed}
          flash={combat.acting === 'player'}
        />
        <Corner
          name={z.name}
          icon={z.kind === 'human' ? 'combat.enemyHuman' : 'combat.enemyZombie'}
          hp={Math.max(0, Math.round(z.hp))}
          maxHp={z.maxHp}
          pct={zPct}
          color="#8a867e"
          damage={z.damage}
          defense={10 + z.defense}
          speed={z.speed}
          flash={combat.acting === 'enemy'}
          mirrored
        />
      </div>

      {/* ---- stance switcher + terrain / turn ---- */}
      {!combat.over && (
        <StanceSwitcher selected={combat.selectedStance} onSelect={combatSetStance} />
      )}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 pb-1 text-xs text-white/45">
        <span className="truncate text-white/30">{stats.weaponName}</span>
        <span className="shrink-0 text-white/30">
          {meters.infection > 0 && (
            <span className="mr-2 text-astral">☣ {Math.round(meters.infection)}</span>
          )}
          {terrain.name} · T{combat.round}
        </span>
      </div>

      {/* ---- log: one bubble per action ----
           Every row carries a marker gutter on *both* sides, occupied or not,
           so the bubbles share one left edge and one right edge no matter who
           threw the action. The arrows say whose turn it was; the column of
           identical boxes is what makes a run of them countable at a glance. */}
      <div
        ref={logRef}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5 text-sm leading-snug"
      >
        {groups.map((g, gi) =>
          g.side ? (
            <div key={gi} className="flex items-center gap-1">
              <span className="w-3 shrink-0 text-xs text-astral/70">
                {g.side === 'player' ? '▶' : ''}
              </span>
              <div
                className={`min-w-0 flex-1 rounded border px-1.5 py-1 ${
                  g.side === 'player'
                    ? 'border-astral/30 bg-astral/5'
                    : 'border-hiss/30 bg-hiss/5'
                }`}
              >
                {g.entries.map((e, i) => (
                  <div key={i} className={TONE_CLASS[e.tone]}>
                    {e.text}
                  </div>
                ))}
              </div>
              <span className="w-3 shrink-0 text-right text-xs text-hiss/70">
                {g.side === 'enemy' ? '◀' : ''}
              </span>
            </div>
          ) : (
            /* Scene notes belong to neither corner, so they take the same
               gutters and stay unboxed between the bubbles. */
            <div key={gi} className="px-4">
              {g.entries.map((e, i) => (
                <div key={i} className={`py-px text-xs ${TONE_CLASS[e.tone]}`}>
                  {e.text}
                </div>
              ))}
            </div>
          ),
        )}
      </div>

      {/* ---- the race track ---- */}
      {!combat.awaitingStance && !combat.over && (
        <SpeedTrack
          playerGauge={combat.playerGauge}
          enemyGauge={combat.enemyGauge}
          playerSpeedValue={pSpeed}
          enemySpeedValue={z.speed}
          acting={combat.acting}
        />
      )}

      {/* ---- playback controls ---- */}
      {!combat.awaitingStance && !combat.over && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={combatTogglePause}
            title={combat.paused ? 'Resume' : 'Pause'}
            className={`h-6 w-10 rounded border text-xs font-bold transition ${
              combat.paused
                ? 'border-signal/60 bg-signal/15 text-signal'
                : 'border-white/20 text-white/70 hover:bg-white/10'
            }`}
          >
            {combat.paused ? '▶' : '❚❚'}
          </button>
          <div className="flex flex-1 gap-1">
            {COMBAT_SPEEDS.map((sp, i) => (
              <button
                key={sp}
                onClick={() => combatSetSpeedIndex(i)}
                className={`h-6 flex-1 rounded border text-xs tabular-nums transition ${
                  i === combat.speedIndex
                    ? 'border-astral/60 bg-astral/15 text-astral'
                    : 'border-white/15 text-white/45 hover:bg-white/10'
                }`}
              >
                {sp}×
              </button>
            ))}
          </div>
        </div>
      )}

      {combat.over ? (
        <button
          onClick={combatContinue}
          className="shrink-0 rounded bg-signal/90 py-1.5 text-sm font-bold text-black hover:bg-signal"
        >
          {combat.outcome === 'dead' ? 'See results' : 'Continue'}
        </button>
      ) : (
        <button
          onClick={combatBreakOff}
          title="Break contact — flee DC −4, they get one parting swing"
          className="h-7 shrink-0 self-end rounded border border-hiss/50 px-2 text-xs font-bold uppercase tracking-wide text-hiss hover:bg-hiss/10"
        >
          Break off
        </button>
      )}
    </div>
  );
}

/**
 * One track, two markers. Both crawl right at their own Speed; the one that
 * touches the finish line swings and snaps back to the start. Reading it tells
 * you the thing a round counter never could — whether you are about to get hit
 * twice before you answer.
 */
function SpeedTrack({
  playerGauge,
  enemyGauge,
  playerSpeedValue,
  enemySpeedValue,
  acting,
}: {
  playerGauge: number;
  enemyGauge: number;
  playerSpeedValue: number;
  enemySpeedValue: number;
  acting: 'player' | 'enemy' | null;
}) {
  const pPct = Math.min(100, (playerGauge / GAUGE_FULL) * 100);
  const ePct = Math.min(100, (enemyGauge / GAUGE_FULL) * 100);
  return (
    <div className="shrink-0">
      <div className="mb-0.5 flex items-baseline justify-between text-xs text-white/30">
        <span>
          SPD <span className="text-astral">{playerSpeedValue.toFixed(0)}</span> ·{' '}
          {secondsPerAction(playerSpeedValue).toFixed(1)}s
        </span>
        <span>
          <span className="text-hiss">{enemySpeedValue.toFixed(0)}</span> ·{' '}
          {secondsPerAction(enemySpeedValue).toFixed(1)}s
        </span>
      </div>
      <div className="relative h-7 overflow-hidden rounded-sm bg-black/60 ring-1 ring-white/10">
        {/* lane hatching, so the markers have something to travel against */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0 9px, rgba(255,255,255,.35) 9px 10px)',
          }}
        />
        {/* the finish line */}
        <div className="absolute inset-y-0 right-0 w-0.5 bg-signal/70" />
        <Marker pct={pPct} color="#4ea3ff" glyph="▲" top hot={acting === 'player'} />
        <Marker pct={ePct} color="#d92d2d" glyph="▼" top={false} hot={acting === 'enemy'} />
      </div>
    </div>
  );
}

function Marker({
  pct,
  color,
  glyph,
  top,
  hot,
}: {
  pct: number;
  color: string;
  glyph: string;
  top: boolean;
  hot: boolean;
}) {
  return (
    <div
      // The transition matches the tick, so a 50ms hop reads as a slide. It is
      // deliberately not longer: a marker must never lag behind the swing it
      // is supposed to be explaining.
      className={`absolute text-xs leading-none transition-[left] duration-[50ms] ease-linear ${
        top ? 'top-0.5' : 'bottom-0.5'
      }`}
      style={{
        // Half a glyph, so the marker's point sits on the gauge value rather
        // than trailing it — the finish line has to mean exactly what it looks
        // like it means.
        left: `calc(${pct}% - 5px)`,
        color,
        textShadow: hot ? `0 0 6px ${color}` : undefined,
      }}
    >
      {glyph}
    </div>
  );
}

/**
 * One bubble per *action*, not per side. The store stamps every action with its
 * own turn number, so three swings from the same fast enemy stay three separate
 * boxes — which is the whole thing the track is trying to show you. Only the
 * lines within a single swing (the roll, then what it did) share a box.
 */
function groupLog(log: CombatLogEntry[]) {
  const out: { side?: 'player' | 'enemy'; turn: number; entries: CombatLogEntry[] }[] = [];
  for (const e of log) {
    const last = out[out.length - 1];
    if (last && last.side === e.side && last.turn === e.round) last.entries.push(e);
    else out.push({ side: e.side, turn: e.round, entries: [e] });
  }
  return out;
}

/**
 * Live fight stances. Switching mid-track only changes what the next swing
 * uses — gauges keep their place on the race.
 */
function StanceSwitcher({
  selected,
  onSelect,
}: {
  selected: StanceId;
  onSelect: (id: StanceId) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      {FIGHT_STANCE_ORDER.map((id) => {
        const s = STANCES[id];
        const active = id === selected;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            title={s.description}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded border px-1 py-1 text-xs transition ${
              active
                ? 'border-astral/60 bg-astral/15 text-astral'
                : 'border-white/15 text-white/50 hover:bg-white/5 hover:text-white/70'
            }`}
          >
            <Icon name={s.icon} size={12} className="shrink-0" />
            <span className="truncate font-semibold">{s.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One fighter's corner: name and HP count on the top line, the bar under it,
 * then the three numbers that decide the fight. The enemy's corner is mirrored
 * so the two names sit at the outer edges and the pair reads as one header.
 */
function Corner({
  name,
  icon,
  hp,
  maxHp,
  pct,
  color,
  damage,
  defense,
  speed,
  flash,
  mirrored,
}: {
  name: ReactNode;
  icon: Parameters<typeof Icon>[0]['name'];
  hp: number;
  maxHp: number;
  pct: number;
  color: string;
  damage: number;
  defense: number;
  speed: number;
  /** This side is mid-swing — the corner lights so the log has a source. */
  flash?: boolean;
  /** Enemy side: name to the right, HP count to the left. */
  mirrored?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-0.5">
      <div
        className={`flex items-baseline gap-1 ${mirrored ? 'flex-row-reverse' : ''}`}
      >
        <Icon name={icon} size={11} className="shrink-0 text-white/50" />
        <span className="min-w-0 flex-1 truncate text-xs text-white/70">{name}</span>
        <span className="shrink-0 text-xs tabular-nums text-white/45">
          {hp}/{maxHp}
        </span>
      </div>
      <div
        className={`h-1.5 overflow-hidden rounded-sm bg-black/60 ring-1 transition ${
          flash ? 'ring-white/50' : 'ring-white/10'
        }`}
      >
        <div
          className={`h-full transition-all ${mirrored ? 'ml-auto' : ''}`}
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {/* The name mirrors to the outer edge, but the numbers never do — three
          stats in a fixed order is what makes the two corners comparable at a
          glance, and a reversed row breaks that for no gain. */}
      <div
        className={`flex gap-2 rounded-sm border border-white/10 px-1 py-0.5 text-xs tabular-nums text-white/40 ${
          mirrored ? 'justify-end' : ''
        }`}
      >
        <span title="Damage per hit">
          <span className="text-white/25">DMG</span> {Math.round(damage)}
        </span>
        <span title="What the other side has to beat">
          <span className="text-white/25">DEF</span> {defense}
        </span>
        <span title="Gauge units per second on the track">
          <span className="text-white/25">SPD</span> {speed.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
