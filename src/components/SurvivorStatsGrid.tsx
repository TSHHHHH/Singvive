import { useShallow } from 'zustand/react/shallow';
import { tip } from './tips';
import { useGame } from '../game/store';
import { playerCombatStats, playerDodgeChance, STANCES, TERRAIN } from '../game/combat';
import { maxHpFor, sumTraitMod } from '../game/character';
import {
  carriedWeight,
  equipEncounterChanceMod,
  equipTravelSpeedFactor,
  loadEffectsFor,
  maxCarry,
} from '../game/inventory';
import {
  armCombatPenalty,
  legTravelFactor,
  totalHp,
  totalMaxHp,
  travelSpeedMultiplier,
  type MeterModifier,
} from '../game/survival';
import { useT } from '../i18n';
import { TipHint } from './TipHint';
import { LOAD_TIP_CLASS, loadModifierLines } from './loadTip';

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

interface StatCellProps {
  label: string;
  value: string;
  tip?: string;
  modifiers?: MeterModifier[];
}

function StatCell({ label, value, tip: tipText, modifiers }: StatCellProps) {
  const inner = (
    <>
      <div className="text-sm font-bold tabular-nums text-signal">{value}</div>
      <div className="text-2xs uppercase text-white/40">{label}</div>
    </>
  );
  if (modifiers?.length) {
    return (
      <TipHint
        className="rounded bg-black/30 py-1.5 text-center"
        placement="top"
        tipClassName={LOAD_TIP_CLASS}
        tip={
          <>
            <div className="mb-0.5 uppercase tracking-widest text-white/40">{label}</div>
            {modifiers.map((m) => (
              <div key={m.text} className={m.good ? 'text-emerald-300' : 'text-hiss'}>
                {m.text}
              </div>
            ))}
          </>
        }
      >
        {inner}
      </TipHint>
    );
  }
  return (
    <div className="rounded bg-black/30 py-1.5 text-center" {...tip(tipText)}>
      {inner}
    </div>
  );
}

/** Live combat and mobility numbers from stats, gear, traits, injuries, and load. */
export function SurvivorStatsGrid() {
  const { t } = useT();
  const { character, equipment, bodyParts, meters, rounds, items } = useGame(
    useShallow((s) => ({
      character: s.character,
      equipment: s.equipment,
      bodyParts: s.bodyParts,
      meters: s.meters,
      rounds: s.rounds,
      items: s.items,
    })),
  );
  if (!character) return null;

  const carryMod = sumTraitMod(character.traitIds, 'carryCapacityMod');
  const fx = loadEffectsFor(items, character.attributes, equipment, carryMod);
  const armPen = armCombatPenalty(bodyParts);
  const pStats = playerCombatStats(
    character.attributes,
    character.traitIds,
    equipment,
    armPen,
    rounds,
    fx.attackMod,
  );
  const dodge = playerDodgeChance(
    character.attributes,
    character.traitIds,
    equipment,
    meters.energy,
    bodyParts,
    STANCES.guarded,
    TERRAIN.open_ground,
    fx.dodgeMod,
  );
  const travel =
    (travelSpeedMultiplier(meters.energy) *
      legTravelFactor(bodyParts) *
      equipTravelSpeedFactor(equipment) *
      (1 + sumTraitMod(character.traitIds, 'travelSpeedMod'))) /
    fx.travelMult;
  const carry = maxCarry(character.attributes, equipment, carryMod);
  const loadKg = carriedWeight(items, equipment);
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
          tip={t('ui.survivor.defenceTip')}
        />
        <StatCell
          label={t('ui.survivor.dodge')}
          value={pct(dodge)}
          tip={t('ui.survivor.dodgeTip')}
        />
        <StatCell
          label={t('ui.survivor.attack')}
          value={`+${pStats.attack}`}
          tip={t('ui.survivor.attackTip')}
        />
        <StatCell
          label={t('ui.survivor.hp')}
          value={`${Math.round(totalHp(bodyParts))}/${totalMaxHp(bodyParts) || maxHpFor(character)}`}
          tip={t('ui.survivor.hpTip')}
        />
        <StatCell
          label={t('ui.survivor.travel')}
          value={`×${travel.toFixed(2)}`}
          tip={t('ui.survivor.travelTip')}
        />
        <StatCell
          label={t('ui.survivor.carry')}
          value={`${loadKg.toFixed(1)}/${carry} kg`}
          modifiers={loadModifierLines(fx, t)}
        />
        <StatCell
          label={t('ui.survivor.noise')}
          value={stealthLabel}
          tip={t('ui.survivor.noiseTip')}
        />
      </div>
    </div>
  );
}
