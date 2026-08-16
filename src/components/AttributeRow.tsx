import { useGame } from '../game/store';
import {
  ATTRIBUTE_BLURB,
  ATTRIBUTE_ICONS,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  attributeEffects,
  attributeSources,
  BASE_ATTRIBUTE,
} from '../game/character';
import type { AttributeKey } from '../game/types';
import { Icon } from '../icons/Icon';
import { TipHint } from './TipHint';

/**
 * The five attributes, inline on the Condition rail so the sheet isn't a panel
 * away. Hovering (or tapping on touch) floats the same style of tooltip the
 * weather badge and meters use: what the stat buys you right now, and which
 * traits moved it off 5.
 */
export function AttributeRow() {
  const character = useGame((s) => s.character);
  if (!character) return null;

  return (
    <div className="grid grid-cols-5 gap-1 text-center">
      {ATTRIBUTE_KEYS.map((k, i) => {
        const value = character.attributes[k];
        const delta = value - BASE_ATTRIBUTE;
        // Keep the tooltip inside the rail: edge cells anchor to their side.
        const anchor =
          i < 2 ? 'left-0' : i > 2 ? 'right-0' : 'left-1/2 -translate-x-1/2';
        return (
          <TipHint
            key={k}
            tipClassName={`absolute top-full mt-1 w-max min-w-[11rem] max-w-[15rem] rounded-lg border border-white/15 bg-concrete-900 p-2 text-left shadow-signage ${anchor}`}
            tip={<AttributeTip attr={k} traitIds={character.traitIds} value={value} />}
          >
            <div className="cursor-help rounded bg-black/30 py-1 transition group-hover:bg-white/5">
              <div className="mx-auto mb-0.5 flex justify-center text-white/50">
                <Icon name={ATTRIBUTE_ICONS[k]} size={12} title={ATTRIBUTE_LABELS[k]} />
              </div>
              <div
                className={`text-sm font-bold tabular-nums ${
                  delta > 0 ? 'text-signal' : delta < 0 ? 'text-hiss' : 'text-concrete-200'
                }`}
              >
                {value}
              </div>
              <div className="text-2xs uppercase text-white/40">
                {ATTRIBUTE_LABELS[k].slice(0, 3)}
              </div>
            </div>
          </TipHint>
        );
      })}
    </div>
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
  const effects = attributeEffects(attr, value);
  return (
    <>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-white/40">
          <Icon name={ATTRIBUTE_ICONS[attr]} size={12} />
          {ATTRIBUTE_LABELS[attr]}
        </span>
        <span className="shrink-0 text-2xs tabular-nums text-white/40">
          base {BASE_ATTRIBUTE} → {value}
        </span>
      </div>
      <p className="text-xs leading-snug text-white/60">{ATTRIBUTE_BLURB[attr]}</p>

      {effects.length > 0 ? (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {effects.map((e) => (
            <li key={e.label} className={`text-xs ${e.good ? 'text-signal' : 'text-hiss'}`}>
              {e.good ? '▲' : '▼'} {e.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs text-white/35">At baseline — no bonus or penalty.</p>
      )}

      {sources.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-px border-t border-white/10 pt-1.5">
          {sources.map((s) => (
            <li key={s.name} className="flex justify-between gap-2 text-2xs">
              <span className="truncate text-white/45">{s.name}</span>
              <span className={`shrink-0 tabular-nums ${s.mod > 0 ? 'text-signal' : 'text-hiss'}`}>
                {s.mod > 0 ? '+' : ''}
                {s.mod}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
