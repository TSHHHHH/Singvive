import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { MeterBar } from './MeterBar';
import { BodyDoll } from './BodyDoll';
import { LimbDetailPanel } from './LimbDetailPanel';
import { AttributeRow } from './AttributeRow';
import { SurvivorStatsGrid } from './SurvivorStatsGrid';
import { countBleeding, meterModifiers, totalHp, totalMaxHp } from '../game/survival';
import type { BodyPartId } from '../game/types';

/**
 * Condition at a glance: body doll + all-limb overview up top, survival meters
 * and attributes in the middle, live derived stats along the bottom.
 */
export function ConditionPanel({ dollHeight = 120 }: { dollHeight?: number }) {
  const { meters, bodyParts } = useGame(
    useShallow((s) => ({ meters: s.meters, bodyParts: s.bodyParts })),
  );
  const [hovered, setHovered] = useState<BodyPartId | null>(null);
  const hp = totalHp(bodyParts);
  const hpMax = totalMaxHp(bodyParts);
  const minorCount = countBleeding(bodyParts, 'minor');
  const majorCount = countBleeding(bodyParts, 'major');

  return (
    <section className="rounded-lg border border-white/10 bg-black/30 p-2.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h4 className="text-xs uppercase tracking-widest text-white/30">Condition</h4>
        <div className="flex items-baseline gap-1.5">
          {majorCount > 0 && (
            <span className="pulse-danger rounded-sm bg-hiss/20 px-1.5 py-px text-2xs font-semibold uppercase tracking-widest text-hiss">
              Bleeding out{majorCount > 1 ? ` ×${majorCount}` : ''}
            </span>
          )}
          {minorCount > 0 && (
            <span className="rounded-sm bg-white/10 px-1.5 py-px text-2xs font-semibold uppercase tracking-widest text-concrete-200">
              Bleeding{minorCount > 1 ? ` ×${minorCount}` : ''}
            </span>
          )}
        </div>
      </div>

      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <div className="flex items-center justify-center rounded border border-white/10 bg-black/20 py-1">
          <BodyDoll
            bodyParts={bodyParts}
            height={dollHeight}
            selectedPart={hovered}
            onHover={setHovered}
          />
        </div>
        <LimbDetailPanel bodyParts={bodyParts} highlighted={hovered} onHover={setHovered} />
      </div>

      <div className="mb-2.5 flex flex-col gap-1.5">
        <MeterBar label="Health" icon="meter.health" value={hp} max={hpMax} color="#d92d2d" />
        <MeterBar
          label="Hunger"
          icon="meter.hunger"
          value={meters.hunger}
          max={100}
          color="#b7b3a9"
          dynamic
          modifiers={meterModifiers('hunger', meters)}
        />
        <MeterBar
          label="Thirst"
          icon="meter.thirst"
          value={meters.thirst}
          max={100}
          color="#2bc4d9"
          dynamic
          modifiers={meterModifiers('thirst', meters)}
        />
        <MeterBar
          label="Energy"
          icon="meter.energy"
          value={meters.energy}
          max={100}
          color="#e8e5dd"
          dynamic
          modifiers={meterModifiers('energy', meters)}
        />
        <MeterBar
          label="Infection"
          icon="meter.infection"
          value={meters.infection}
          max={100}
          color="#2bc4d9"
          danger
        />
      </div>

      <div className="mb-2.5">
        <AttributeRow />
      </div>

      <SurvivorStatsGrid />
    </section>
  );
}
