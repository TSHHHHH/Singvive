import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../game/store';
import { Icon } from '../icons/Icon';
import { itemDef } from '../game/loot';
import { armCombatPenalty, effectiveMaxHp } from '../game/survival';
import { STANCES, STANCE_ORDER, effectiveDefense, playerCombatStats } from '../game/combat';
import type { CombatLogEntry, StanceId } from '../game/types';

const TONE_CLASS: Record<CombatLogEntry['tone'], string> = {
  player: 'text-astral',
  enemy: 'text-hiss',
  roll: 'text-white/35',
  info: 'text-concrete-200',
  good: 'text-signal',
  bad: 'text-hiss',
};

const CONSUMABLE_KINDS = ['heal', 'cure', 'food', 'water', 'energy'];

/** How long a resolved round sits on screen before the next one lands. */
const ROUND_MS = 800;

/**
 * Encounter UI, embedded in the right-hand column in place of the event log.
 * The map and the status panel stay live behind it — no screen transition.
 *
 * You commit a stance once; the fight then plays itself out. The only calls
 * left mid-fight are the ones that are actually decisions: burn a belt item,
 * or break off.
 */
export function CombatPanel() {
  const combat = useGame((s) => s.combat);
  const meters = useGame((s) => s.meters);
  const baseMaxHp = useGame((s) => s.maxHp);
  const bodyParts = useGame((s) => s.bodyParts);
  const items = useGame((s) => s.items);
  const equipment = useGame((s) => s.equipment);
  const character = useGame((s) => s.character);
  const combatSetStance = useGame((s) => s.combatSetStance);
  const combatSetBeltSlot = useGame((s) => s.combatSetBeltSlot);
  const combatUseItem = useGame((s) => s.combatUseItem);
  const combatBreakOff = useGame((s) => s.combatBreakOff);
  const combatContinue = useGame((s) => s.combatContinue);
  const combatStep = useGame((s) => s.combatStep);

  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const running = !!combat && !combat.over && !combat.awaitingStance;

  // Once a stance is committed the rounds tick themselves.
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => combatStep(), ROUND_MS);
    return () => clearTimeout(t);
  }, [running, combat?.round, combatStep]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [combat?.log.length]);

  if (!combat || !character) return null;

  const maxHp = effectiveMaxHp(baseMaxHp, bodyParts);
  const z = combat.zombie;
  const zPct = Math.max(0, (z.hp / z.maxHp) * 100);
  const hpPct = Math.max(0, (meters.health / maxHp) * 100);
  const stats = playerCombatStats(
    character.attributes,
    character.traitIds,
    equipment,
    armCombatPenalty(bodyParts),
  );
  const stance = STANCES[combat.selectedStance];
  const terrain = combat.terrain;

  const carried = items.filter(
    (i) => i.container === 'backpack' && CONSUMABLE_KINDS.includes(itemDef(i.defId).effect.kind),
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[11px]">
      {/* ---- header: who, where, which round ---- */}
      <div className="flex shrink-0 items-baseline justify-between">
        <h3 className="signage text-[10px] text-hiss">
          {z.kind === 'human' ? 'Hostiles' : 'Encounter'}
        </h3>
        <span className="text-[10px] text-white/35">
          {terrain.name} · R{combat.round}
        </span>
      </div>

      {/* ---- combatants: two bars, nothing more ---- */}
      <div className="shrink-0 space-y-1">
        <Bar
          label={character.name}
          icon="combat.player"
          right={`${Math.max(0, Math.round(meters.health))}/${Math.round(maxHp)}`}
          pct={hpPct}
          color="#d92d2d"
        />
        <Bar
          label={z.name}
          icon={z.kind === 'human' ? 'combat.enemyHuman' : 'combat.enemyZombie'}
          right={`${Math.max(0, Math.round(z.hp))}/${z.maxHp}`}
          pct={zPct}
          color="#8a867e"
        />
      </div>

      {/* ---- the committed plan, as one line ---- */}
      {!combat.awaitingStance && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-y border-white/10 py-1 text-[10px] text-white/45">
          <span className="truncate">
            <Icon name={stance.icon} /> {stance.name} · DEF{' '}
            {effectiveDefense(stats, stance, terrain)} · {stats.weaponName}
          </span>
          {meters.infection > 0 && (
            <span className="shrink-0 text-astral">☣ {Math.round(meters.infection)}</span>
          )}
        </div>
      )}

      {/* ---- log ---- */}
      <div
        ref={logRef}
        className="min-h-0 flex-1 overflow-y-auto border-l border-white/10 pl-2 text-[11px] leading-tight"
      >
        {combat.log.map((e, i) => (
          <div key={i} className={`py-px ${TONE_CLASS[e.tone]}`}>
            {e.text}
          </div>
        ))}
      </div>

      {combat.over ? (
        <button
          onClick={combatContinue}
          className="shrink-0 rounded bg-signal/90 py-1.5 text-xs font-bold text-black hover:bg-signal"
        >
          {combat.outcome === 'dead' ? 'See results' : 'Continue'}
        </button>
      ) : combat.awaitingStance ? (
        /* ---- the one decision: how to fight it ---- */
        <div className="shrink-0">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-white/30">
            Commit — the fight resolves from here
          </div>
          <div className="grid grid-cols-2 gap-1">
            {STANCE_ORDER.map((id) => (
              <StanceButton key={id} id={id} onClick={() => combatSetStance(id)} />
            ))}
          </div>
        </div>
      ) : (
        /* ---- mid-fight: belt + bail, no per-round clicking ---- */
        <div className="flex shrink-0 items-stretch gap-1">
          {combat.quickBeltItems.map((uid, idx) => {
            const inst = uid ? items.find((i) => i.uid === uid) : null;
            const def = inst ? itemDef(inst.defId) : null;
            return (
              <div key={idx} className="relative flex-1">
                <button
                  onClick={() =>
                    def && inst
                      ? combatUseItem(inst.uid)
                      : setPickingSlot(pickingSlot === idx ? null : idx)
                  }
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    setPickingSlot(pickingSlot === idx ? null : idx);
                  }}
                  title={def ? `Use ${def.name}` : 'Slot an item'}
                  className={`h-7 w-full truncate rounded border px-1 text-[9px] leading-tight transition ${
                    def
                      ? 'border-white/25 bg-white/10 hover:bg-white/20'
                      : 'border-dashed border-white/15 text-white/25 hover:bg-white/5'
                  }`}
                >
                  {def ? `${def.name}${inst!.stack > 1 ? ` ×${inst!.stack}` : ''}` : '+'}
                </button>
                {pickingSlot === idx && (
                  <div className="absolute bottom-full left-0 z-10 mb-1 max-h-36 w-36 overflow-y-auto rounded border border-white/15 bg-concrete-900 p-1 shadow-2xl">
                    {carried.length === 0 && (
                      <div className="px-2 py-1 text-[10px] text-white/40">Nothing to slot.</div>
                    )}
                    {carried.map((i) => (
                      <button
                        key={i.uid}
                        onClick={() => {
                          combatSetBeltSlot(idx, i.uid);
                          setPickingSlot(null);
                        }}
                        className="block w-full truncate rounded px-2 py-1 text-left text-[10px] hover:bg-white/10"
                      >
                        {itemDef(i.defId).name}
                      </button>
                    ))}
                    {uid && (
                      <button
                        onClick={() => {
                          combatSetBeltSlot(idx, null);
                          setPickingSlot(null);
                        }}
                        className="block w-full rounded px-2 py-1 text-left text-[10px] text-hiss hover:bg-white/10"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button
            onClick={combatBreakOff}
            title="Break contact — flee DC −4, they get one parting swing"
            className="h-7 shrink-0 rounded border border-hiss/50 px-2 text-[9px] font-bold uppercase tracking-wide text-hiss hover:bg-hiss/10"
          >
            Break off
          </button>
        </div>
      )}
    </div>
  );
}

function StanceButton({ id, onClick }: { id: StanceId; onClick: () => void }) {
  const s = STANCES[id];
  return (
    <button
      onClick={onClick}
      title={s.description}
      className={`rounded border px-1.5 py-1 text-left text-[10px] leading-tight transition hover:bg-white/10 ${
        id === 'disengage' ? 'border-hiss/40 text-hiss' : 'border-white/20'
      }`}
    >
      <Icon name={s.icon} /> {s.name}
    </button>
  );
}

function Bar({
  label,
  icon,
  right,
  pct,
  color,
}: {
  label: ReactNode;
  icon: Parameters<typeof Icon>[0]['name'];
  right: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon name={icon} size={11} className="shrink-0 text-white/50" />
      <span className="w-14 truncate text-[10px] text-white/70">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-black/60 ring-1 ring-white/10">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="shrink-0 text-right text-[10px] tabular-nums text-white/45">
        {right}
      </span>
    </div>
  );
}
