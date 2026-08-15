import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { playerCombatStats, playerDodgeChance, STANCES, TERRAIN } from '../game/combat';
import { maxHpFor, sumTraitMod } from '../game/character';
import {
  equipEncounterChanceMod,
  equipTravelSpeedFactor,
  maxCarry,
} from '../game/inventory';
import {
  armCombatPenalty,
  legTravelFactor,
  totalHp,
  totalMaxHp,
  travelSpeedMultiplier,
} from '../game/survival';

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

interface StatCellProps {
  label: string;
  value: string;
  title?: string;
}

function StatCell({ label, value, title }: StatCellProps) {
  return (
    <div className="rounded bg-black/30 py-1.5 text-center" title={title}>
      <div className="text-sm font-bold tabular-nums text-signal">{value}</div>
      <div className="text-2xs uppercase text-white/40">{label}</div>
    </div>
  );
}

/** Live combat and mobility numbers from stats, gear, traits, and injuries. */
export function SurvivorStatsGrid() {
  const { character, equipment, bodyParts, meters, rounds } = useGame(
    useShallow((s) => ({
      character: s.character,
      equipment: s.equipment,
      bodyParts: s.bodyParts,
      meters: s.meters,
      rounds: s.rounds,
    })),
  );
  if (!character) return null;

  const armPen = armCombatPenalty(bodyParts);
  const pStats = playerCombatStats(
    character.attributes,
    character.traitIds,
    equipment,
    armPen,
    rounds,
  );
  const dodge = playerDodgeChance(
    character.attributes,
    character.traitIds,
    equipment,
    meters.energy,
    bodyParts,
    STANCES.guarded,
    TERRAIN.open_ground,
  );
  const travel =
    travelSpeedMultiplier(meters.energy) *
    legTravelFactor(bodyParts) *
    equipTravelSpeedFactor(equipment) *
    (1 + sumTraitMod(character.traitIds, 'travelSpeedMod'));
  const carry = maxCarry(
    character.attributes,
    equipment,
    sumTraitMod(character.traitIds, 'carryCapacityMod'),
  );
  const stealth = equipEncounterChanceMod(equipment);
  const stealthLabel =
    stealth === 0 ? '±0%' : `${stealth > 0 ? '+' : ''}${Math.round(stealth * 100)}%`;

  return (
    <div>
      <h4 className="mb-1.5 text-xs uppercase tracking-widest text-white/30">Survivor stats</h4>
      <div className="grid grid-cols-3 gap-1">
        <StatCell label="Defence" value={String(pStats.defense)} title="Attack roll target" />
        <StatCell label="Dodge" value={pct(dodge)} title="Chance to slip a connecting hit" />
        <StatCell label="Attack" value={`+${pStats.attack}`} title="To-hit modifier" />
        <StatCell
          label="HP"
          value={`${Math.round(totalHp(bodyParts))}/${totalMaxHp(bodyParts) || maxHpFor(character)}`}
          title="Total limb vitality"
        />
        <StatCell
          label="Travel"
          value={`×${travel.toFixed(2)}`}
          title="Movement speed (energy, legs, footwear, traits)"
        />
        <StatCell label="Carry" value={`${carry}kg`} title="Max carry capacity with gear" />
        <StatCell
          label="Noise"
          value={stealthLabel}
          title="Encounter chance from gear (camo lowers, noisy boots raise)"
        />
      </div>
    </div>
  );
}
