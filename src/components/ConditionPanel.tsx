import { useGame } from '../game/store';
import { MeterBar } from './MeterBar';
import { BodyDoll } from './BodyDoll';
import { effectiveMaxHp, totalInjuryPenalty } from '../game/survival';

/**
 * Condition at a glance: the figure on the left carries limb damage, the bars on
 * the right carry the survival meters. Nothing here is interactive beyond
 * inspecting a limb — acting on any of it happens through the inventory.
 */
export function ConditionPanel({ dollHeight = 132 }: { dollHeight?: number }) {
  const { meters, maxHp, bodyParts } = useGame();
  const effMax = effectiveMaxHp(maxHp, bodyParts);
  const injuryPenalty = Math.round(totalInjuryPenalty(maxHp, bodyParts));

  return (
    <section className="rounded-lg border border-white/10 bg-black/30 p-2.5">
      <h4 className="mb-2 text-[11px] uppercase tracking-widest text-white/30">Condition</h4>
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <BodyDoll bodyParts={bodyParts} height={dollHeight} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <MeterBar label="Health" icon="meter.health" value={meters.health} max={effMax} color="#d92d2d" />
          <MeterBar label="Hunger" icon="meter.hunger" value={meters.hunger} max={100} color="#b7b3a9" />
          <MeterBar label="Thirst" icon="meter.thirst" value={meters.thirst} max={100} color="#2bc4d9" />
          <MeterBar label="Energy" icon="meter.energy" value={meters.energy} max={100} color="#e8e5dd" />
          <MeterBar
            label="Infection"
            icon="meter.infection"
            value={meters.infection}
            max={100}
            color="#2bc4d9"
            danger
          />
          {injuryPenalty > 0 && (
            <div className="text-[10px] text-hiss/80">−{injuryPenalty} max HP from injuries</div>
          )}
        </div>
      </div>
    </section>
  );
}
