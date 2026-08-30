import { useMemo } from 'react';
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
import {
  sheetLinesAsModifiers,
  sheetRow,
  sheetSourceLines,
  useLiveStatSheet,
} from './StatBonusesPanel';

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
      <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
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
  const { locale, t } = useT();
  const sheet = useLiveStatSheet();
  const { character, equipment, bodyParts, meters, items } = useGame(
    useShallow((s) => ({
      character: s.character,
      equipment: s.equipment,
      bodyParts: s.bodyParts,
      meters: s.meters,
      items: s.items,
    })),
  );
  // Two full `items` walks plus the whole derived combat block. This panel is
  // subscribed to items/meters/bodyParts, so without the memo every hunger or
  // HP tick re-ran all of it. Hook sits above the `character` guard so the hook
  // order stays stable (oxlint react/rules-of-hooks).
  const derived = useMemo(() => {
    if (!character) return null;
    const carryMod = sumTraitMod(character.traitIds, 'carryCapacityMod');
    const fx = loadEffectsFor(items, character.attributes, equipment, carryMod);
    const armPen = armCombatPenalty(bodyParts);
    const pStats = playerCombatStats(
      character.attributes,
      character.traitIds,
      equipment,
      armPen,
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
    return { carryMod, fx, armPen, pStats, dodge, travel, carry, loadKg, stealth };
  }, [character, items, equipment, bodyParts, meters.energy]);

  if (!character || !derived) return null;

  const { fx, pStats, dodge, travel, carry, loadKg, stealth } = derived;
  const stealthLabel =
    stealth === 0 ? '±0%' : `${stealth > 0 ? '+' : ''}${Math.round(stealth * 100)}%`;

  const modsFor = (id: string) => {
    if (!sheet) return undefined;
    const r = sheetRow(sheet, id);
    if (!r?.sources.length) return undefined;
    return sheetLinesAsModifiers(sheetSourceLines(r, t, locale));
  };
  const atkRow = sheet ? sheetRow(sheet, 'attack') : undefined;
  const ddgRow = sheet ? sheetRow(sheet, 'dodge') : undefined;
  const trvRow = sheet ? sheetRow(sheet, 'travel') : undefined;
  const encRow = sheet ? sheetRow(sheet, 'encounters') : undefined;
  const atk = atkRow?.total ?? pStats.attack;
  const ddg = ddgRow?.total ?? dodge;
  const trv = trvRow?.total ?? travel;
  const noise = encRow ? encRow.total : stealth;
  const noiseLabel =
    noise === 0 ? '±0%' : `${noise > 0 ? '+' : ''}${Math.round(noise * 100)}%`;

  return (
    <div>
      <h4 className="mb-1.5 text-xs uppercase tracking-widest text-white/30">
        {t('ui.survivor.statsTitle')}
      </h4>
      <div className="grid grid-cols-3 gap-1">
        <StatCell
          label={t('ui.survivor.defence')}
          value={String(pStats.defense)}
          modifiers={modsFor('defence')}
          tip={t('ui.survivor.defenceTip')}
        />
        <StatCell
          label={t('ui.survivor.dodge')}
          value={pct(ddg)}
          modifiers={modsFor('dodge')}
          tip={t('ui.survivor.dodgeTip')}
        />
        <StatCell
          label={t('ui.survivor.attack')}
          value={`${atk >= 0 ? '+' : ''}${Math.round(atk)}`}
          modifiers={modsFor('attack')}
          tip={t('ui.survivor.attackTip')}
        />
        <StatCell
          label={t('ui.survivor.hp')}
          value={`${Math.round(totalHp(bodyParts))}/${totalMaxHp(bodyParts) || maxHpFor(character)}`}
          modifiers={modsFor('maxHp')}
          tip={t('ui.survivor.hpTip')}
        />
        <StatCell
          label={t('ui.survivor.travel')}
          value={`×${trv.toFixed(2)}`}
          modifiers={modsFor('travel')}
          tip={t('ui.survivor.travelTip')}
        />
        <StatCell
          label={t('ui.survivor.carry')}
          value={`${loadKg.toFixed(1)}/${carry} kg`}
          modifiers={loadModifierLines(fx, t)}
        />
        <StatCell
          label={t('ui.survivor.noise')}
          value={encRow ? noiseLabel : stealthLabel}
          modifiers={modsFor('encounters')}
          tip={t('ui.survivor.noiseTip')}
        />
      </div>
    </div>
  );
}
