import { useEffect, useRef } from 'react';
import { useGame } from '../game/store';
import { itemDef } from '../game/loot';
import { effectiveMaxHp } from '../game/survival';
import type { CombatLogEntry } from '../game/types';

const TONE_CLASS: Record<CombatLogEntry['tone'], string> = {
  player: 'text-sky-300',
  enemy: 'text-red-300',
  roll: 'text-white/45',
  info: 'text-amber-300/80',
  good: 'text-toxic',
  bad: 'text-red-400',
};

export function CombatScreen() {
  const combat = useGame((s) => s.combat);
  const meters = useGame((s) => s.meters);
  const baseMaxHp = useGame((s) => s.maxHp);
  const bodyParts = useGame((s) => s.bodyParts);
  const items = useGame((s) => s.items);
  const equipment = useGame((s) => s.equipment);
  const maxHp = effectiveMaxHp(baseMaxHp, bodyParts);
  const combatStep = useGame((s) => s.combatStep);
  const combatFlee = useGame((s) => s.combatFlee);
  const combatUseItem = useGame((s) => s.combatUseItem);
  const combatContinue = useGame((s) => s.combatContinue);
  const logRef = useRef<HTMLDivElement>(null);

  // auto-advance rounds
  useEffect(() => {
    if (!combat || combat.over) return;
    const t = setTimeout(() => combatStep(), 950);
    return () => clearTimeout(t);
  }, [combat, combatStep]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [combat?.log.length]);

  if (!combat) return null;
  const z = combat.zombie;
  const zPct = Math.max(0, (z.hp / z.maxHp) * 100);
  const hpPct = Math.max(0, (meters.health / maxHp) * 100);
  const weapon = equipment.mainHand ? itemDef(equipment.mainHand.defId) : null;
  const healItems = items.filter((i) => {
    if (i.container !== 'backpack') return false;
    const k = itemDef(i.defId).effect.kind;
    return k === 'heal' || k === 'cure';
  });

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 p-4 md:max-w-4xl md:p-6">
      <h2 className="text-center text-xl font-black tracking-wide text-red-400 md:text-2xl">
        {z.kind === 'human' ? 'HOSTILE SURVIVORS' : 'ENCOUNTER'}
      </h2>

      {/* Combatants */}
      <div className="grid grid-cols-2 gap-4 md:gap-8">
        <Combatant
          name="You"
          sub={weapon ? weapon.name : 'Fists'}
          pct={hpPct}
          hp={meters.health}
          max={maxHp}
          color="#c0392b"
          face="🧍"
        />
        <Combatant
          name={z.name}
          sub={z.kind === 'human' ? 'Hostile' : `Danger ${'☠'.repeat(Math.min(5, z.attack + 2))}`}
          pct={zPct}
          hp={z.hp}
          max={z.maxHp}
          color="#6b8e23"
          face={z.kind === 'human' ? '🧑‍🦲' : '🧟'}
        />
      </div>

      {meters.infection > 0 && (
        <div className="text-center text-sm text-toxic">
          ☣️ Infection {Math.round(meters.infection)} / 100
        </div>
      )}

      {/* Log */}
      <div
        ref={logRef}
        className="h-56 overflow-y-auto rounded-lg border border-white/10 bg-black/50 p-3 text-sm md:h-96 md:p-4 md:text-base"
      >
        {combat.log.map((e, i) => (
          <div key={i} className={`py-0.5 ${TONE_CLASS[e.tone]}`}>
            {e.round > 0 && <span className="mr-1 text-white/25">R{e.round}</span>}
            {e.text}
          </div>
        ))}
      </div>

      {/* Controls */}
      {!combat.over ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto animate-pulse text-xs text-white/40 md:text-sm">Rolling…</span>
          {healItems.slice(0, 5).map((i) => (
            <button
              key={i.uid}
              onClick={() => combatUseItem(i.uid)}
              className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 md:px-4 md:py-2 md:text-base"
            >
              Use {itemDef(i.defId).name}
            </button>
          ))}
          <button
            onClick={combatFlee}
            className="rounded bg-amber-600/80 px-4 py-1.5 text-sm font-semibold text-black hover:bg-amber-500 md:px-5 md:py-2 md:text-base"
          >
            🏃 Flee
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div
            className={`text-lg font-bold md:text-xl ${
              combat.outcome === 'dead' ? 'text-red-500' : 'text-toxic'
            }`}
          >
            {combat.outcome === 'win' && 'You survived the encounter.'}
            {combat.outcome === 'flee' && 'You got away.'}
            {combat.outcome === 'dead' && 'You have fallen.'}
          </div>
          <button
            onClick={combatContinue}
            className="rounded-lg bg-toxic/80 px-8 py-2.5 font-bold text-black hover:bg-toxic md:px-10 md:py-3 md:text-lg"
          >
            {combat.outcome === 'dead' ? 'See results' : 'Continue'}
          </button>
        </div>
      )}
    </div>
  );
}

function Combatant({
  name,
  sub,
  pct,
  hp,
  max,
  color,
  face,
}: {
  name: string;
  sub: string;
  pct: number;
  hp: number;
  max: number;
  color: string;
  face: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-center md:p-5">
      <div className="text-4xl md:text-6xl">{face}</div>
      <div className="mt-1 font-bold md:text-lg">{name}</div>
      <div className="mb-2 text-xs text-white/40 md:text-sm">{sub}</div>
      <div className="h-3 overflow-hidden rounded bg-black/60 ring-1 ring-white/10 md:h-4">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-1 text-xs tabular-nums text-white/60 md:text-sm">
        {Math.max(0, Math.round(hp))} / {max}
      </div>
    </div>
  );
}
