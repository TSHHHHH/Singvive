import { useState } from 'react';
import { useGame } from '../game/store';
import {
  ATTRIBUTE_BLURB,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  BASE_ATTRIBUTE,
  TRAITS,
  TRAIT_BUDGET,
  MAX_POSITIVE_TRAITS,
  MAX_NEGATIVE_TRAITS,
  canPickTrait,
  getTrait,
  isIncompatible,
  traitBudgetUsed,
  attributesFromTraits,
} from '../game/character';
import type { Trait } from '../game/types';

type Side = 'positive' | 'negative';

export function CharacterCreate() {
  const { commitCharacter, resetToMenu } = useGame();
  const [name, setName] = useState('');
  const [traitIds, setTraitIds] = useState<string[]>([]);

  // Detail panels: one per side. `locked` pins a trait so you can browse the
  // other column and compare; `hovered` is the transient preview.
  const [hovered, setHovered] = useState<Record<Side, string | null>>({
    positive: null,
    negative: null,
  });
  const [locked, setLocked] = useState<Record<Side, string | null>>({
    positive: null,
    negative: null,
  });

  const attrs = attributesFromTraits(traitIds);
  const budgetRemaining = TRAIT_BUDGET - traitBudgetUsed(traitIds);

  const positiveTraits = TRAITS.filter((t) => t.category === 'positive');
  const negativeTraits = TRAITS.filter((t) => t.category === 'negative');
  const positiveCount = traitIds.filter((id) => getTrait(id).category === 'positive').length;
  const negativeCount = traitIds.filter((id) => getTrait(id).category === 'negative').length;

  const toggleTrait = (id: string) => {
    if (traitIds.includes(id)) {
      setTraitIds(traitIds.filter((t) => t !== id));
    } else if (canPickTrait(id, traitIds)) {
      setTraitIds([...traitIds, id]);
    }
  };

  const toggleLock = (side: Side, id: string) => {
    setLocked((prev) => ({ ...prev, [side]: prev[side] === id ? null : id }));
  };

  const reset = () => {
    setTraitIds([]);
    setLocked({ positive: null, negative: null });
  };

  const start = () => {
    commitCharacter({
      name: name.trim() || 'Survivor',
      attributes: attrs,
      traitIds,
    });
  };

  // ---- trait tile ----

  const tileClass = (t: Trait): string => {
    const selected = traitIds.includes(t.id);
    const incompatible = !selected && isIncompatible(t.id, traitIds);
    const disabled = !selected && !canPickTrait(t.id, traitIds);

    if (selected && t.category === 'positive') return 'border-toxic bg-toxic/15';
    if (selected && t.category === 'negative') return 'border-blood bg-blood/15';
    if (incompatible || disabled) {
      return 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed';
    }
    return t.category === 'positive'
      ? 'border-toxic/20 bg-toxic/[0.04] hover:border-toxic/60'
      : 'border-blood/20 bg-blood/[0.04] hover:border-blood/60';
  };

  const renderTile = (t: Trait, side: Side) => {
    const selected = traitIds.includes(t.id);
    const isLocked = locked[side] === t.id;
    const accent = side === 'positive' ? 'text-toxic' : 'text-blood';
    const sign = side === 'positive' ? '−' : '+';

    return (
      <div
        key={t.id}
        onMouseEnter={() => setHovered((h) => ({ ...h, [side]: t.id }))}
        onMouseLeave={() => setHovered((h) => (h[side] === t.id ? { ...h, [side]: null } : h))}
        className={`relative flex flex-col rounded border px-2.5 py-2 transition ${tileClass(t)} ${
          isLocked ? 'ring-1 ring-white/50' : ''
        }`}
      >
        <button
          onClick={() => toggleTrait(t.id)}
          disabled={!selected && !canPickTrait(t.id, traitIds)}
          className="flex flex-1 items-start gap-2 text-left disabled:cursor-not-allowed"
        >
          <span
            className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center border text-[9px] leading-none ${
              selected ? `border-white/70 ${accent}` : 'border-white/25 text-transparent'
            }`}
          >
            ✕
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold uppercase tracking-wide">
              {t.name}
            </span>
            <span className={`text-[10px] tabular-nums ${accent}`}>
              {sign}
              {Math.abs(t.cost)} pt
            </span>
          </span>
        </button>

        {/* pin the detail panel to this trait so you can browse the other column */}
        <button
          onClick={() => toggleLock(side, t.id)}
          title={isLocked ? 'Unpin details' : 'Pin details'}
          className={`absolute right-1 top-1 text-[10px] leading-none transition ${
            isLocked ? 'text-white' : 'text-white/25 hover:text-white/70'
          }`}
        >
          {isLocked ? '📌' : '📍'}
        </button>
      </div>
    );
  };

  // ---- detail panel ----

  const renderDetail = (side: Side) => {
    const id = locked[side] ?? hovered[side];
    const t = id ? getTrait(id) : null;
    const accent = side === 'positive' ? 'text-toxic' : 'text-blood';
    const pinned = t != null && locked[side] === t.id;

    return (
      <div className="mt-2 min-h-[6.5rem] rounded border border-white/10 bg-black/40 px-3 py-2">
        {t ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold uppercase tracking-wide">{t.name}</span>
              <span className={`shrink-0 text-xs tabular-nums ${accent}`}>
                {side === 'positive' ? '−' : '+'}
                {Math.abs(t.cost)} pt
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-white/70">{t.description}</p>
            {t.conflicts.length > 0 && (
              <p className="mt-1.5 text-[10px] text-white/40">
                Conflicts: {t.conflicts.map((c) => getTrait(c).name).join(', ')}
              </p>
            )}
            {pinned && (
              <button
                onClick={() => toggleLock(side, t.id)}
                className="mt-1.5 text-[10px] text-white/40 hover:text-white/80"
              >
                📌 pinned — click to unpin
              </button>
            )}
          </>
        ) : (
          <p className="text-[11px] text-white/30">
            Hover a modifier for details. Click 📍 to pin it here while you compare the other side.
          </p>
        )}
      </div>
    );
  };

  const renderColumn = (side: Side) => {
    const isPos = side === 'positive';
    const list = isPos ? positiveTraits : negativeTraits;
    return (
      <div className="flex min-w-0 flex-col">
        <div className="mb-2 flex items-baseline justify-between border-b border-white/10 pb-1">
          <span
            className={`text-sm font-bold uppercase tracking-widest ${isPos ? 'text-toxic' : 'text-blood'}`}
          >
            {isPos ? 'Positive (−)' : 'Negative (+)'}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-white/40">
            {isPos ? 'Cost points' : 'Grant points'} · {isPos ? positiveCount : negativeCount}/
            {isPos ? MAX_POSITIVE_TRAITS : MAX_NEGATIVE_TRAITS}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-3">
          {list.map((t) => renderTile(t, side))}
        </div>
        {renderDetail(side)}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <button onClick={resetToMenu} className="text-xs text-white/40 hover:text-white/70">
        ← Back
      </button>

      {/* ---- header ---- */}
      <div className="mt-2 text-center">
        <h2 className="text-2xl font-bold uppercase tracking-[0.2em] text-toxic">
          Personal Modifiers
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-white/45">
          Positive and negative traits that apply only to your character. Each modifier has a point
          cost.
          <br />
          To create a character, the total points must be 0 or higher.
        </p>
        <div className="mt-3 flex items-end justify-center gap-8">
          <label className="flex flex-col items-start gap-1 text-left">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              placeholder="Survivor"
              className="w-48 rounded border border-white/15 bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-toxic"
            />
          </label>
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Points left</span>
            <span
              className={`text-3xl font-bold tabular-nums ${
                budgetRemaining < 0 ? 'text-blood' : 'text-toxic'
              }`}
            >
              {budgetRemaining}
            </span>
          </div>
          <button
            onClick={reset}
            className="mb-1 text-[11px] uppercase tracking-widest text-white/40 hover:text-white/80"
          >
            ⟳ Reset
          </button>
        </div>
      </div>

      {/* ---- two modifier columns ---- */}
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {renderColumn('negative')}
        {renderColumn('positive')}
      </div>

      {/* ---- derived attributes ---- */}
      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between border-b border-white/10 pb-1">
          <span className="text-sm font-bold uppercase tracking-widest text-white/60">
            Attributes
          </span>
          <span className="text-[10px] uppercase tracking-wide text-white/40">
            Set by your modifiers
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {ATTRIBUTE_KEYS.map((k) => {
            const delta = attrs[k] - BASE_ATTRIBUTE;
            return (
              <div key={k} className="rounded border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide">
                    {ATTRIBUTE_LABELS[k]}
                  </span>
                  <span className="text-lg font-bold tabular-nums">{attrs[k]}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] text-white/40">{ATTRIBUTE_BLURB[k]}</span>
                  {delta !== 0 && (
                    <span
                      className={`shrink-0 text-[10px] tabular-nums ${
                        delta > 0 ? 'text-toxic' : 'text-blood'
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={start}
        className="mx-auto mt-6 block w-full max-w-sm rounded-lg bg-toxic/80 px-6 py-3 font-bold uppercase tracking-widest text-black transition hover:bg-toxic"
      >
        Next →
      </button>
    </div>
  );
}
