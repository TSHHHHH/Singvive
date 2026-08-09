import { useGame } from '../game/store';
import { MeterBar } from './MeterBar';
import {
  BODY_PART_IDS,
  BODY_PART_LABEL,
  effectiveMaxHp,
  totalInjuryPenalty,
} from '../game/survival';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, getTraits } from '../game/character';

function partColor(condition: number): string {
  if (condition >= 80) return '#4c8f3a';
  if (condition >= 50) return '#c9b03f';
  if (condition >= 25) return '#d98c3f';
  return '#c0392b';
}

/** Survival meters, injuries and the character sheet — the "Status" tab. */
export function StatusPanel() {
  const { meters, maxHp, bodyParts, character } = useGame();
  const effMax = effectiveMaxHp(maxHp, bodyParts);
  const injuryPenalty = Math.round(totalInjuryPenalty(maxHp, bodyParts));
  const traits = character ? getTraits(character.traitIds) : [];

  return (
    <div className="flex flex-col gap-3">
      {/* Survival meters */}
      <section className="rounded-lg border border-white/10 bg-black/30 p-3">
        <h4 className="mb-2 text-[11px] uppercase tracking-widest text-white/30">Condition</h4>
        <div className="flex flex-col gap-1.5">
          <MeterBar label="Health" icon="❤️" value={meters.health} max={effMax} color="#c0392b" />
          {injuryPenalty > 0 && (
            <div className="-mt-1 pl-7 text-[11px] text-red-400/80">
              −{injuryPenalty} max HP from injuries
            </div>
          )}
          <MeterBar label="Hunger" icon="🍖" value={meters.hunger} max={100} color="#c9843f" />
          <MeterBar label="Thirst" icon="💧" value={meters.thirst} max={100} color="#3a8fb5" />
          <MeterBar label="Energy" icon="⚡" value={meters.energy} max={100} color="#c9b03f" />
          <MeterBar label="Infection" icon="☣️" value={meters.infection} max={100} color="#7fbf4b" danger />
        </div>
      </section>

      {/* Body / injuries */}
      <section className="rounded-lg border border-white/10 bg-black/30 p-3">
        <h4 className="mb-2 text-[11px] uppercase tracking-widest text-white/30">Body</h4>
        <div className="grid grid-cols-2 gap-1.5">
          {BODY_PART_IDS.map((id) => {
            const p = bodyParts[id];
            return (
              <div
                key={id}
                className="rounded bg-black/30 px-2 py-1"
                title={`${BODY_PART_LABEL[id]}: ${Math.round(p.condition)}%${p.bleeding ? ' · bleeding' : ''}`}
              >
                <div className="flex items-center justify-between text-[11px] text-white/50">
                  <span>{BODY_PART_LABEL[id]}</span>
                  <span>
                    {p.bleeding && <span className="mr-1 text-red-500">🩸</span>}
                    {Math.round(p.condition)}%
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-black/50">
                  <div
                    className={`h-full ${p.bleeding ? 'pulse-danger' : ''}`}
                    style={{ width: `${p.condition}%`, background: partColor(p.condition) }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Character sheet */}
      {character && (
        <section className="rounded-lg border border-white/10 bg-black/30 p-3">
          <h4 className="mb-2 text-[11px] uppercase tracking-widest text-white/30">Survivor</h4>
          <div className="grid grid-cols-5 gap-1 text-center">
            {ATTRIBUTE_KEYS.map((k) => (
              <div key={k} className="rounded bg-black/30 py-1">
                <div className="text-sm font-bold tabular-nums text-toxic">
                  {character.attributes[k]}
                </div>
                <div className="text-[10px] uppercase text-white/40">
                  {ATTRIBUTE_LABELS[k].slice(0, 3)}
                </div>
              </div>
            ))}
          </div>
          {traits.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {traits.map((t) => (
                <span
                  key={t.id}
                  title={t.description}
                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                    t.category === 'positive'
                      ? 'bg-toxic/15 text-toxic'
                      : 'bg-blood/15 text-red-300'
                  }`}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
