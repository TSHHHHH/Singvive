import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { tip } from './tips';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { armCombatPenalty, guardArmFactor, headCombatPenalty, torsoCarryMult, totalHp, totalMaxHp } from '../game/survival';
import { sumTraitMod } from '../game/character';
import { equipSpeedBonus, loadEffectsFor } from '../game/inventory';
import {
  COMBAT_SPEEDS,
  FIGHT_STANCE_ORDER,
  GAUGE_FULL,
  STANCES,
  effectiveDefense,
  offHandCombatMods,
  playerCombatStats,
  playerSpeed,
  secondsPerAction,
} from '../game/combat';
import { canCombatReload, holsteredFirearm, isGunClubMainHand, loadedRoundsOf, magazineSizeFor } from '../game/firearms';
import { fullEquipment } from '../game/equipmentSlots';
import { conditionOf } from '../game/inventory';
import { itemDef } from '../game/loot';
import { combatantIcon } from '../game/enemies';
import type { CombatImpact, CombatLogEntry, Enemy, StanceId } from '../game/types';
import { enemyName, useT } from '../i18n';
import { GuideInfoButton } from './GuideInfoButton';
import type { GuideTopic } from '../content/guideContent';

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

const PLAYER_SHAKE_KINDS = new Set<CombatImpact['kind']>(['hit', 'crit', 'death']);
const HP_PUNCH_KINDS = new Set<CombatImpact['kind']>(['hit', 'crit', 'kill', 'death']);

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
export function CombatPanel({
  onOpenGuide,
}: {
  onOpenGuide?: (topic: GuideTopic) => void;
}) {
  const { locale, t } = useT();
  const combat = useGame((s) => s.combat);
  const meters = useGame((s) => s.meters);
  const bodyParts = useGame((s) => s.bodyParts);
  const equipment = useGame((s) => s.equipment);
  const character = useGame((s) => s.character);
  const items = useGame((s) => s.items);
  const combatPrepareFire = useGame((s) => s.combatPrepareFire);
  const combatBreakOff = useGame((s) => s.combatBreakOff);
  const combatContinue = useGame((s) => s.combatContinue);
  const combatTick = useGame((s) => s.combatTick);
  const combatTogglePause = useGame((s) => s.combatTogglePause);
  const combatSetSpeedIndex = useGame((s) => s.combatSetSpeedIndex);
  const combatSetStance = useGame((s) => s.combatSetStance);

  const logRef = useRef<HTMLDivElement>(null);
  const [shakeClass, setShakeClass] = useState('');
  const [outcomeClass, setOutcomeClass] = useState('');

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

  // Restart one-shot shake without remounting the log / track.
  useEffect(() => {
    const impact = combat?.impact;
    if (!impact || impact.side !== 'player' || !PLAYER_SHAKE_KINDS.has(impact.kind)) {
      return;
    }
    const next = impact.kind === 'crit' || impact.kind === 'death' ? 'combat-shake-hard' : 'combat-shake';
    setShakeClass('');
    const id = requestAnimationFrame(() => setShakeClass(next));
    return () => cancelAnimationFrame(id);
  }, [combat?.impact?.id, combat?.impact?.kind, combat?.impact?.side]);

  useEffect(() => {
    if (!combat?.over) {
      setOutcomeClass('');
      return;
    }
    const next =
      combat.outcome === 'win'
        ? 'combat-outcome-win'
        : combat.outcome === 'dead'
          ? 'combat-outcome-dead'
          : '';
    if (!next) return;
    setOutcomeClass('');
    const id = requestAnimationFrame(() => setOutcomeClass(next));
    return () => cancelAnimationFrame(id);
  }, [combat?.over, combat?.outcome]);

  if (!combat || !character) return null;

  const maxHp = totalMaxHp(bodyParts);
  const currentHp = totalHp(bodyParts);
  const z = combat.zombie;
  const zPct = Math.max(0, (z.hp / z.maxHp) * 100);
  const hpPct = maxHp > 0 ? Math.max(0, (currentHp / maxHp) * 100) : 0;
  const load = loadEffectsFor(
    items,
    character.attributes,
    equipment,
    sumTraitMod(character.traitIds, 'carryCapacityMod'),
    torsoCarryMult(bodyParts),
  );
  const eq = fullEquipment(equipment);
  const holstered = holsteredFirearm(eq);
  const holsterDef = holstered ? itemDef(holstered.defId) : null;
  const holsterLoaded = holstered ? loadedRoundsOf(holstered) : 0;
  const holsterCap = holsterDef ? magazineSizeFor(holsterDef) : 0;
  const gunClub = isGunClubMainHand(eq);
  const canFire =
    !!holstered &&
    conditionOf(holstered) > 0 &&
    !gunClub &&
    (holsterLoaded > 0 || canCombatReload(eq, items));
  const fireLabel =
    holsterLoaded > 0
      ? t('ui.combat.fire')
      : holsterLoaded === 0 && holstered && canCombatReload(eq, items)
        ? t('ui.combat.reload')
        : t('ui.combat.fire');
  const stats = playerCombatStats(
    character.attributes,
    character.traitIds,
    eq,
    armCombatPenalty(bodyParts) + headCombatPenalty(bodyParts),
    load.attackMod,
  );
  const stance = STANCES[combat.selectedStance];
  const terrain = combat.terrain;
  const pSpeed = playerSpeed(
    character.attributes,
    stance,
    meters.energy,
    1,
    equipSpeedBonus(equipment) + offHandCombatMods(equipment, guardArmFactor(bodyParts)).speed,
    stats.speedFactor,
    load.combatSpeedMult,
  );

  const groups = groupLog(combat.log);
  const impact = combat.impact;
  const playerPunch =
    impact && impact.side === 'player' && HP_PUNCH_KINDS.has(impact.kind) ? impact.id : 0;
  const enemyPunch =
    impact && impact.side === 'enemy' && HP_PUNCH_KINDS.has(impact.kind) ? impact.id : 0;
  const lowHp = !combat.over && hpPct <= 25;

  return (
    <div
      className={`combat-fx--force-motion flex h-full min-h-0 flex-col gap-1.5 text-sm ${shakeClass} ${outcomeClass}`}
    >
      {/* ---- fighter header ----
           Info columns share leftover width; names sit atop the portraits
           inside the portrait frame; bars / stats / weapon stay on the sides. */}
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1fr)] items-stretch gap-1.5">
        <FighterColumn
          hp={Math.max(0, Math.round(currentHp))}
          maxHp={Math.round(maxHp)}
          pct={hpPct}
          color="#d92d2d"
          damage={stats.damage + stance.damageMod}
          defense={effectiveDefense(stats, stance, terrain)}
          speed={pSpeed}
          weapon={stats.weaponName}
          dmgLabel={t('ui.combat.dmg')}
          defLabel={t('ui.combat.def')}
          spdLabel={t('ui.combat.spd')}
          spdTip={t('ui.combat.spdTip')}
          punchToken={playerPunch}
          lowHpPulse={lowHp}
        />
        <Portrait
          key={`p-${impact?.side === 'player' ? impact.id : 'idle'}`}
          name={character.name}
          icon="combat.player"
          flash={combat.acting === 'player'}
          impact={impact?.side === 'player' ? impact : null}
        />
        <Portrait
          key={`e-${impact?.side === 'enemy' ? impact.id : 'idle'}`}
          name={enemyName(z.templateId, z.name, locale)}
          icon={combatantIcon(z)}
          flash={combat.acting === 'enemy'}
          impact={impact?.side === 'enemy' ? impact : null}
        />
        <FighterColumn
          hp={Math.max(0, Math.round(z.hp))}
          maxHp={z.maxHp}
          pct={zPct}
          color="#8a867e"
          damage={z.damage}
          defense={10 + z.defense}
          speed={z.speed}
          weapon={enemyWeaponLabel(z.kind, t)}
          dmgLabel={t('ui.combat.dmg')}
          defLabel={t('ui.combat.def')}
          spdLabel={t('ui.combat.spd')}
          spdTip={t('ui.combat.spdTipEnemy')}
          mirrored
          punchToken={enemyPunch}
        />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-white/10 pb-1 text-xs text-white/30">
        {meters.infection > 0 && (
          <span className="text-astral">☣ {Math.round(meters.infection)}</span>
        )}
        {holstered && (
          <span className={holsterLoaded === 0 ? 'text-hiss' : 'text-white/45'}>
            {t('ui.combat.magCount', { n: holsterLoaded, cap: holsterCap })}
          </span>
        )}
        <span>
          {terrain.name} · T{combat.round}
        </span>
        {onOpenGuide && (
          <GuideInfoButton topic="fight" onOpen={onOpenGuide} label={t('ui.combat.guide')} />
        )}
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
            {...tip(combat.paused ? t('ui.combat.resume') : t('ui.combat.pause'), { label: true })}
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
          {combat.outcome === 'dead' ? t('ui.combat.seeResults') : t('ui.combat.continue')}
        </button>
      ) : (
        <div className="flex shrink-0 flex-col gap-1">
          <div className="flex items-stretch gap-1">
            <StanceSwitcher selected={combat.selectedStance} onSelect={combatSetStance} />
            {holstered && !gunClub && (
              <button
                type="button"
                onClick={combatPrepareFire}
                disabled={!canFire || combat.firePrepared || combat.reloadPrepared}
                {...tip(
                  conditionOf(holstered) <= 0
                    ? t('ui.combat.fireBroken')
                    : holsterLoaded > 0
                      ? t('ui.combat.fireTip')
                      : canCombatReload(eq, items)
                        ? t('ui.combat.reloadTip')
                        : t('ui.combat.noAmmo'),
                )}
                className={`h-7 shrink-0 rounded border px-2 text-xs font-bold uppercase tracking-wide transition ${
                  canFire && !combat.firePrepared && !combat.reloadPrepared
                    ? 'border-signal/60 text-signal hover:bg-signal/10'
                    : 'border-white/15 text-white/30'
                }`}
              >
                {fireLabel}
              </button>
            )}
            <button
              onClick={combatBreakOff}
              {...tip(t('ui.combat.breakOffTitle'))}
              className="h-7 shrink-0 rounded border border-hiss/50 px-2 text-xs font-bold uppercase tracking-wide text-hiss hover:bg-hiss/10"
            >
              {t('ui.combat.breakOff')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StanceSwitcher({
  selected,
  onSelect,
}: {
  selected: StanceId;
  onSelect: (id: StanceId) => void;
}) {
  const { t } = useT();
  return (
    <div className="flex min-w-0 flex-1 gap-1">
      {FIGHT_STANCE_ORDER.map((id) => {
        const s = STANCES[id];
        const on = id === selected;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            {...tip(s.description)}
            className={`h-7 min-w-0 flex-1 truncate rounded border px-1 text-xs font-bold uppercase tracking-wide transition ${
              on
                ? 'border-astral/70 bg-astral/20 text-astral'
                : 'border-white/15 text-white/50 hover:border-white/30 hover:text-white/80'
            }`}
          >
            {t(`ui.combat.${id}`)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Dual markers on a shared rail. `left` is a % of the full gauge; the 50ms
 * transition matches the tick so the markers look continuous rather than
 * stepping.
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
  const pSec = secondsPerAction(playerSpeedValue);
  const eSec = secondsPerAction(enemySpeedValue);

  return (
    <div className="shrink-0 space-y-0.5">
      <div className="flex justify-between text-2xs tabular-nums text-white/30">
        <span {...tip('Seconds per your action at current Speed')}>you {pSec.toFixed(1)}s</span>
        <span {...tip('Seconds per their action')}>them {eSec.toFixed(1)}s</span>
      </div>
      <div className="relative h-3 rounded-sm bg-black/50 ring-1 ring-white/10">
        <div
          className={`absolute top-0 h-full w-1.5 -translate-x-1/2 rounded-sm bg-astral transition-[left] duration-[50ms] linear ${
            acting === 'player' ? 'combat-marker-hot' : ''
          }`}
          style={{
            left: `${pPct}%`,
            boxShadow: acting === 'player' ? '0 0 8px 2px rgba(56, 189, 248, 0.7)' : undefined,
          }}
        />
        <div
          className={`absolute top-0 h-full w-1.5 -translate-x-1/2 rounded-sm bg-hiss transition-[left] duration-[50ms] linear ${
            acting === 'enemy' ? 'combat-marker-hot' : ''
          }`}
          style={{
            left: `${ePct}%`,
            boxShadow: acting === 'enemy' ? '0 0 8px 2px rgba(217, 45, 45, 0.7)' : undefined,
          }}
        />
      </div>
    </div>
  );
}

/** Consecutive log lines that share a `side` become one bubble. */
function groupLog(log: CombatLogEntry[]): { side?: 'player' | 'enemy'; entries: CombatLogEntry[] }[] {
  const out: { side?: 'player' | 'enemy'; entries: CombatLogEntry[] }[] = [];
  for (const e of log) {
    const last = out[out.length - 1];
    if (last && last.side === e.side && e.side) {
      last.entries.push(e);
    } else {
      out.push({ side: e.side, entries: [e] });
    }
  }
  return out;
}

/** Display-only kit label — enemies have no equipped weapon in the sim. */
function enemyWeaponLabel(kind: Enemy['kind'], t: (key: string) => string): string {
  if (kind === 'zombie') return t('ui.combat.teeth');
  if (kind === 'animal') return t('ui.combat.claws');
  return t('ui.combat.improvised');
}

function portraitHitClass(impact: CombatImpact | null | undefined): string {
  if (!impact) return '';
  if (impact.kind === 'dodge' || impact.kind === 'block') return 'combat-portrait-dodge';
  if (impact.kind === 'miss') return '';
  if (impact.side === 'player' && (impact.kind === 'hit' || impact.kind === 'crit' || impact.kind === 'death')) {
    return impact.kind === 'crit' || impact.kind === 'death'
      ? 'combat-portrait-hit-bad combat-portrait-hit-hard'
      : 'combat-portrait-hit-bad';
  }
  if (impact.side === 'enemy' && (impact.kind === 'hit' || impact.kind === 'crit' || impact.kind === 'kill')) {
    return impact.kind === 'crit' || impact.kind === 'kill'
      ? 'combat-portrait-hit combat-portrait-hit-hard'
      : 'combat-portrait-hit';
  }
  return '';
}

function Portrait({
  name,
  icon,
  flash,
  impact,
}: {
  name: string;
  icon: IconName;
  flash?: boolean;
  impact?: CombatImpact | null;
}) {
  const hitClass = portraitHitClass(impact);
  return (
    <div
      className={`flex w-14 min-h-14 flex-col items-stretch self-stretch rounded-sm bg-black/40 text-white/70 ring-1 transition ${
        flash ? 'ring-white/50' : 'ring-white/10'
      } ${hitClass}`}
    >
      <span className="truncate px-0.5 pt-0.5 text-center text-2xs leading-tight text-white/70" {...tip(name)}>
        {name}
      </span>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Icon name={icon} size={36} className="shrink-0" />
      </div>
    </div>
  );
}

/**
 * One fighter's info stack. HP count, bar, DMG / DEF / SPD, and weapon — names
 * live on the portraits. Outer edges keep HP readable at a glance.
 */
function FighterColumn({
  hp,
  maxHp,
  pct,
  color,
  damage,
  defense,
  speed,
  weapon,
  dmgLabel,
  defLabel,
  spdLabel,
  spdTip,
  mirrored,
  punchToken = 0,
  lowHpPulse = false,
}: {
  hp: number;
  maxHp: number;
  pct: number;
  color: string;
  damage: number;
  defense: number;
  speed: number;
  weapon: string;
  dmgLabel: string;
  defLabel: string;
  spdLabel: string;
  spdTip?: string;
  /** Enemy side: HP count and weapon to the left. */
  mirrored?: boolean;
  /** Non-zero when this side just took a damaging impact — restarts HP punch FX. */
  punchToken?: number;
  /** Player critical health — continuous pulse while the fight is live. */
  lowHpPulse?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-0.5">
      <div className={`flex items-baseline ${mirrored ? 'justify-start' : 'justify-end'}`}>
        <span className="shrink-0 text-xs tabular-nums text-white/45">
          {hp}/{maxHp}
        </span>
      </div>
      <div
        className={`h-2 overflow-hidden rounded-sm bg-black/60 ring-1 ring-white/10 ${
          lowHpPulse ? 'pulse-danger' : ''
        }`}
      >
        <div
          key={punchToken || 'bar'}
          className={`h-full origin-center transition-all ${mirrored ? 'ml-auto' : ''} ${
            punchToken ? 'combat-hp-punch' : ''
          }`}
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div
        className={`flex min-w-0 gap-1 overflow-hidden rounded-sm border border-white/10 px-1 py-0.5 text-2xs tabular-nums text-white/40 ${
          mirrored ? 'justify-end' : ''
        }`}
      >
        <span {...tip('Damage per hit')}>
          <span className="text-white/25">{dmgLabel}</span> {Math.round(damage)}
        </span>
        <span {...tip('What the other side has to beat')}>
          <span className="text-white/25">{defLabel}</span> {defense}
        </span>
        <span {...tip(spdTip ?? 'Gauge units per second on the track')}>
          <span className="text-white/25">{spdLabel}</span> {speed.toFixed(0)}
        </span>
      </div>
      <div className={`truncate text-xs text-white/30 ${mirrored ? 'text-right' : ''}`}>
        {weapon}
      </div>
    </div>
  );
}
