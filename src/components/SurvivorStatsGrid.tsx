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
import { useT } from '../i18n';

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
  const { t } = useT();
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
      <h4 className="mb-1.5 text-xs uppercase tracking-widest text-white/30">
        {t('ui.survivor.statsTitle')}
      </h4>
      <div className="grid grid-cols-3 gap-1">
        <StatCell
          label={t('ui.survivor.defence')}
          value={String(pStats.defense)}
          title={t('ui.survivor.defenceTip')}
        />
        <StatCell
          label={t('ui.survivor.dodge')}
          value={pct(dodge)}
          title={t('ui.survivor.dodgeTip')}
        />
        <StatCell
          label={t('ui.survivor.attack')}
          value={`+${pStats.attack}`}
          title={t('ui.survivor.attackTip')}
        />
        <StatCell
          label={t('ui.survivor.hp')}
          value={`${Math.round(totalHp(bodyParts))}/${totalMaxHp(bodyParts) || maxHpFor(character)}`}
          title={t('ui.survivor.hpTip')}
        />
        <StatCell
          label={t('ui.survivor.travel')}
          value={`×${travel.toFixed(2)}`}
          title={t('ui.survivor.travelTip')}
        />
        <StatCell
          label={t('ui.survivor.carry')}
          value={`${carry}kg`}
          title={t('ui.survivor.carryTip')}
        />
        <StatCell
          label={t('ui.survivor.noise')}
          value={stealthLabel}
          title={t('ui.survivor.noiseTip')}
        />
      </div>
    </div>
  );
}
