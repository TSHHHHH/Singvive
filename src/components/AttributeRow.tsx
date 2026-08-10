import { useState } from 'react';
import { useGame } from '../game/store';
import {
  ATTRIBUTE_BLURB,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  attributeSources,
  BASE_ATTRIBUTE,
} from '../game/character';
import type { AttributeKey } from '../game/types';

/**
 * The five attributes, always on the rail so the sheet isn't a panel away.
 * Hovering one opens what it actually does and which traits moved it off the
 * baseline — the "why is my Perception 7" question, answered in place.
 */
export function AttributeRow() {
  const character = useGame((s) => s.character);
  const [open, setOpen] = useState<AttributeKey | null>(null);
  if (!character) return null;

  return (
    <section className="relative rounded-lg border border-white/10 bg-black/30 p-2.5">
      <h4 className="mb-1.5 text-[11px] uppercase tracking-widest text-white/30">Attributes</h4>
      <div className="grid grid-cols-5 gap-1 text-center">
        {ATTRIBUTE_KEYS.map((k) => {
          const value = character.attributes[k];
          const delta = value - BASE_ATTRIBUTE;
          const active = open === k;
          return (
            <button
              key={k}
              onMouseEnter={() => setOpen(k)}
              onMouseLeave={() => setOpen((o) => (o === k ? null : o))}
              onClick={() => setOpen((o) => (o === k ? null : k))}
              className={`rounded py-1 transition ${
                active ? 'bg-signal/15 ring-1 ring-signal/40' : 'bg-black/30 hover:bg-white/5'
              }`}
            >
              <div
                className={`text-sm font-bold tabular-nums ${
                  delta > 0 ? 'text-signal' : delta < 0 ? 'text-hiss' : 'text-concrete-200'
                }`}
              >
                {value}
              </div>
              <div className="text-[10px] uppercase text-white/40">
                {ATTRIBUTE_LABELS[k].slice(0, 3)}
              </div>
            </button>
          );
        })}
      </div>

      {open && <AttributeTip attr={open} traitIds={character.traitIds} value={character.attributes[open]} />}
    </section>
  );
}

function AttributeTip({
  attr,
  traitIds,
  value,
}: {
  attr: AttributeKey;
  traitIds: string[];
  value: number;
}) {
  const sources = attributeSources(traitIds, attr);
  return (
    <div className="mt-1.5 rounded border border-signal/25 bg-black/60 px-2 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-signal">{ATTRIBUTE_LABELS[attr]}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-white/40">
          base {BASE_ATTRIBUTE} → {value}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-white/60">{ATTRIBUTE_BLURB[attr]}</p>
      {sources.length > 0 && (
        <ul className="mt-1 flex flex-col gap-px">
          {sources.map((s) => (
            <li key={s.name} className="flex justify-between gap-2 text-[10px]">
              <span className="truncate text-white/45">{s.name}</span>
              <span className={`shrink-0 tabular-nums ${s.mod > 0 ? 'text-signal' : 'text-hiss'}`}>
                {s.mod > 0 ? '+' : ''}
                {s.mod}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
