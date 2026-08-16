import { useState } from 'react';
import { useGame } from '../game/store';
import {
  ATTRIBUTE_BLURB,
  ATTRIBUTE_ICONS,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  BASE_ATTRIBUTE,
  TRAITS,
  TRAIT_BUDGET,
  canPickTrait,
  getTrait,
  isIncompatible,
  isLegalTraitBuild,
  traitBudgetUsed,
  attributesFromTraits,
  withAttrEmojis,
} from '../game/character';
import { OCCUPATIONS, getOccupation } from '../game/occupations';
import {
  deletePreset,
  loadPresets,
  MAX_TRAIT_PRESETS,
  renamePreset,
  savePreset,
  type TraitPreset,
} from '../game/traitPresets';
import type { Occupation, Trait } from '../game/types';
import { Icon } from '../icons/Icon';

type Side = 'positive' | 'negative';
type Step = 'occupation' | 'custom';

/** Same set, order-insensitive — an edited build is no longer that occupation. */
function sameTraits(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export function CharacterCreate() {
  const { commitCharacter, resetToMenu } = useGame();
  const [name, setName] = useState('');
  const [step, setStep] = useState<Step>('occupation');
  const [traitIds, setTraitIds] = useState<string[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [myPresets, setMyPresets] = useState<TraitPreset[]>(() => loadPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [presetMsg, setPresetMsg] = useState<string | null>(null);

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

  const picked = pickedId ? getOccupation(pickedId) : null;
  const occupationId = picked && sameTraits(traitIds, picked.traitIds) ? picked.id : undefined;
  const selectedMyPreset = selectedPresetId
    ? myPresets.find((p) => p.id === selectedPresetId) ?? null
    : null;

  const start = () => {
    if (!isLegalTraitBuild(traitIds)) return;
    commitCharacter({
      name: name.trim() || 'Survivor',
      attributes: attrs,
      traitIds,
      occupationId,
    });
  };

  const refreshPresets = () => setMyPresets(loadPresets());

  const nameField = (
    <label className="flex flex-col items-start gap-1 text-left">
      <span className="text-2xs uppercase tracking-widest text-white/40">Name</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={16}
        placeholder="Survivor"
        className="w-48 rounded border border-white/15 bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-signal"
      />
    </label>
  );

  const attributeGrid = (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
      {ATTRIBUTE_KEYS.map((k) => {
        const delta = attrs[k] - BASE_ATTRIBUTE;
        return (
          <div key={k} className="min-w-0 rounded border border-white/10 bg-white/5 px-2 py-2">
            <div className="flex items-center justify-between gap-1">
              <span className="flex min-w-0 items-center gap-1 text-2xs font-semibold uppercase tracking-wider">
                <Icon
                  name={ATTRIBUTE_ICONS[k]}
                  size={13}
                  title={ATTRIBUTE_LABELS[k]}
                  className="shrink-0"
                />
                <span className="truncate">{ATTRIBUTE_LABELS[k]}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-1">
                <span className="text-base font-bold tabular-nums">{attrs[k]}</span>
                {delta !== 0 && (
                  <span
                    className={`text-2xs tabular-nums ${
                      delta > 0 ? 'text-signal' : 'text-hiss'
                    }`}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                )}
              </span>
            </div>
            <p className="mt-1 text-2xs leading-snug text-white/40">{ATTRIBUTE_BLURB[k]}</p>
          </div>
        );
      })}
    </div>
  );

  // ================= STEP 1 — presets =================

  const selectOccupation = (o: Occupation) => {
    setPickedId(o.id);
    setSelectedPresetId(null);
    setTraitIds(o.traitIds);
  };

  const selectMyPreset = (p: TraitPreset) => {
    setSelectedPresetId(p.id);
    setPickedId(null);
    setTraitIds(p.traitIds);
    setPresetNameDraft(p.name);
  };

  const startFromScratch = () => {
    setPickedId(null);
    setSelectedPresetId(null);
    setTraitIds([]);
    setLocked({ positive: null, negative: null });
    setPresetMsg(null);
    setStep('custom');
  };

  const openAdvanced = () => {
    setPresetMsg(null);
    setStep('custom');
  };

  const renderOccupationCard = (o: Occupation) => {
    const selected = pickedId === o.id;
    return (
      <button
        key={o.id}
        onClick={() => selectOccupation(o)}
        className={`flex flex-col rounded border px-3 py-2.5 text-left transition ${
          selected
            ? 'border-signal bg-signal/15'
            : 'border-white/10 bg-white/[0.03] hover:border-signal/50 hover:bg-white/[0.06]'
        }`}
      >
        <span className="text-sm font-bold uppercase tracking-wide">{o.name}</span>
        <span className="mt-1 text-2xs leading-relaxed text-white/50">{o.tagline}</span>
      </button>
    );
  };

  const renderTraitChips = (ids: string[]) => {
    const positives = ids.filter((id) => getTrait(id).category === 'positive');
    const negatives = ids.filter((id) => getTrait(id).category === 'negative');
    const chip = (id: string) => {
      const t = getTrait(id);
      return (
        <span
          key={id}
          title={withAttrEmojis(t.description)}
          className={`rounded border px-1.5 py-0.5 text-2xs ${
            t.category === 'positive'
              ? 'border-signal/30 bg-signal/10 text-signal'
              : 'border-hiss/30 bg-hiss/10 text-hiss'
          }`}
        >
          {t.name}
        </span>
      );
    };
    return (
      <div className="mt-3 space-y-2 border-t border-white/10 pt-2.5">
        {positives.length > 0 && (
          <div>
            <span className="mb-1 block text-2xs uppercase tracking-widest text-signal/70">
              Positive
            </span>
            <div className="flex flex-wrap gap-1">{positives.map(chip)}</div>
          </div>
        )}
        {negatives.length > 0 && (
          <div>
            <span className="mb-1 block text-2xs uppercase tracking-widest text-hiss/70">
              Negative
            </span>
            <div className="flex flex-wrap gap-1">{negatives.map(chip)}</div>
          </div>
        )}
      </div>
    );
  };

  const renderOccupationDetail = (o: Occupation) => (
    <div className="rounded border border-white/15 bg-concrete-900/80 px-4 py-3">
      <h3 className="text-base font-bold uppercase tracking-wide text-signal">{o.name}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-white/70">{o.blurb}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <span className="text-2xs uppercase tracking-widest text-signal">Good at</span>
          <ul className="mt-1 space-y-0.5">
            {o.goodAt.map((s) => (
              <li key={s} className="text-xs text-white/70">
                + {s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="text-2xs uppercase tracking-widest text-hiss">Struggles with</span>
          {o.strugglesWith.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {o.strugglesWith.map((s) => (
                <li key={s} className="text-xs text-white/70">
                  − {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-white/40">Nothing in particular.</p>
          )}
        </div>
      </div>

      {renderTraitChips(o.traitIds)}
    </div>
  );

  const renderMyPresetDetail = (p: TraitPreset) => (
    <div className="rounded border border-white/15 bg-concrete-900/80 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-bold uppercase tracking-wide text-signal">{p.name}</h3>
        <button
          onClick={() => {
            deletePreset(p.id);
            refreshPresets();
            if (selectedPresetId === p.id) {
              setSelectedPresetId(null);
              setTraitIds([]);
            }
          }}
          className="text-2xs uppercase tracking-wide text-hiss/70 hover:text-hiss"
        >
          Delete
        </button>
      </div>
      <p className="mt-1.5 text-xs text-white/50">
        Your saved build · {p.traitIds.length} traits ·{' '}
        {isLegalTraitBuild(p.traitIds) ? 'legal' : 'needs fixing in Advanced Mode'}
      </p>
      {renderTraitChips(p.traitIds)}
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={presetNameDraft}
          onChange={(e) => setPresetNameDraft(e.target.value)}
          maxLength={32}
          className="w-40 rounded border border-white/15 bg-black/40 px-2 py-1 text-xs outline-none focus:border-signal"
          placeholder="Rename…"
        />
        <button
          onClick={() => {
            const next = renamePreset(p.id, presetNameDraft);
            if (!next) {
              setPresetMsg('Could not rename — empty or duplicate name.');
              return;
            }
            refreshPresets();
            setPresetMsg(null);
          }}
          className="text-2xs uppercase tracking-wide text-white/50 hover:text-white/80"
        >
          Rename
        </button>
      </div>
    </div>
  );

  const canStartFromPreset =
    (picked != null || selectedMyPreset != null) && isLegalTraitBuild(traitIds);

  const renderOccupationStep = () => (
    <>
      <div className="mt-2 text-center">
        <h2 className="text-2xl font-bold uppercase tracking-[0.2em] text-signal">
          Before It Fell
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          Pick a starting preset — or open Advanced Mode to choose traits freely.
          <br />
          Negatives earn points; positives spend them. You start at 0.
        </p>
        <div className="mt-3 flex justify-center">{nameField}</div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openAdvanced}
              disabled={!picked && !selectedMyPreset}
              className="rounded-lg border border-signal/50 bg-signal/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-signal transition hover:bg-signal/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-white/25"
            >
              Advanced Mode
            </button>
            <button
              onClick={startFromScratch}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/70 transition hover:border-white/40 hover:text-white"
            >
              From scratch
            </button>
          </div>

          <div>
            <span className="mb-1.5 block text-2xs uppercase tracking-widest text-white/40">
              Job presets
            </span>
            <div className="grid gap-1.5 sm:grid-cols-2">{OCCUPATIONS.map(renderOccupationCard)}</div>
          </div>

          <div>
            <span className="mb-1.5 block text-2xs uppercase tracking-widest text-white/40">
              My presets ({myPresets.length}/{MAX_TRAIT_PRESETS})
            </span>
            {myPresets.length === 0 ? (
              <p className="rounded border border-dashed border-white/10 px-3 py-4 text-xs text-white/35">
                No saved builds yet. Open Advanced Mode, pick traits, then Save as preset.
              </p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {myPresets.map((p) => {
                  const selected = selectedPresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => selectMyPreset(p)}
                      className={`flex flex-col rounded border px-3 py-2.5 text-left transition ${
                        selected
                          ? 'border-signal bg-signal/15'
                          : 'border-white/10 bg-white/[0.03] hover:border-signal/50'
                      }`}
                    >
                      <span className="text-sm font-bold uppercase tracking-wide">{p.name}</span>
                      <span className="mt-1 text-2xs text-white/45">
                        {p.traitIds.length} traits
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {picked ? (
            renderOccupationDetail(picked)
          ) : selectedMyPreset ? (
            renderMyPresetDetail(selectedMyPreset)
          ) : (
            <div className="grid place-items-center rounded border border-dashed border-white/10 px-4 py-10 text-center">
              <p className="text-xs text-white/35">
                Choose a preset to see what it means for the run.
              </p>
            </div>
          )}

          {(picked || selectedMyPreset) && (
            <div>
              <span className="text-2xs uppercase tracking-widest text-white/40">Attributes</span>
              <div className="mt-1.5">{attributeGrid}</div>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto mt-6 flex w-full max-w-xl flex-col items-center gap-2">
        <button
          onClick={start}
          disabled={!canStartFromPreset}
          className="w-full max-w-sm rounded-lg bg-signal/80 px-6 py-3 font-bold uppercase tracking-widest text-black transition hover:bg-signal disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
        >
          Next →
        </button>
      </div>
    </>
  );

  // ================= STEP 2 — Advanced Mode =================

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

  const revert = () => {
    if (picked) setTraitIds(picked.traitIds);
    else if (selectedMyPreset) setTraitIds(selectedMyPreset.traitIds);
    else setTraitIds([]);
    setLocked({ positive: null, negative: null });
  };

  const handleSavePreset = () => {
    const label =
      presetNameDraft.trim() ||
      selectedMyPreset?.name ||
      picked?.name ||
      'My Build';
    const existing = myPresets.find((p) => p.name.toLowerCase() === label.toLowerCase());
    if (existing && !window.confirm(`Overwrite preset “${existing.name}”?`)) return;
    const saved = savePreset(label, traitIds);
    if (!saved) {
      setPresetMsg(
        budgetRemaining < 0
          ? 'Fix the budget (points left must be ≥ 0) before saving.'
          : myPresets.length >= MAX_TRAIT_PRESETS && !existing
            ? `Preset limit reached (${MAX_TRAIT_PRESETS}). Delete one first.`
            : 'Could not save preset.',
      );
      return;
    }
    refreshPresets();
    setSelectedPresetId(saved.id);
    setPickedId(null);
    setPresetNameDraft(saved.name);
    setPresetMsg(`Saved “${saved.name}”.`);
  };

  const tileClass = (t: Trait): string => {
    const selected = traitIds.includes(t.id);
    const incompatible = !selected && isIncompatible(t.id, traitIds);
    const disabled = !selected && !canPickTrait(t.id, traitIds);

    if (selected && t.category === 'positive') return 'border-signal bg-signal/15';
    if (selected && t.category === 'negative') return 'border-hiss bg-hiss/15';
    if (incompatible || disabled) {
      return 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed';
    }
    return t.category === 'positive'
      ? 'border-signal/20 bg-signal/[0.04] hover:border-signal/60'
      : 'border-hiss/20 bg-hiss/[0.04] hover:border-hiss/60';
  };

  const renderTile = (t: Trait, side: Side) => {
    const selected = traitIds.includes(t.id);
    const isLocked = locked[side] === t.id;
    const accent = side === 'positive' ? 'text-signal' : 'text-hiss';
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
            className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center border text-2xs leading-none ${
              selected ? `border-white/70 ${accent}` : 'border-white/25 text-transparent'
            }`}
          >
            ✕
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold uppercase tracking-wide">
              {t.name}
            </span>
            <span className={`text-2xs tabular-nums ${accent}`}>
              {sign}
              {Math.abs(t.cost)} pt
            </span>
          </span>
        </button>

        <button
          onClick={() => toggleLock(side, t.id)}
          title={isLocked ? 'Unpin details' : 'Pin details'}
          className={`absolute right-1 top-1 text-2xs leading-none transition ${
            isLocked ? 'text-white' : 'text-white/25 hover:text-white/70'
          }`}
        >
          {isLocked ? '📌' : '📍'}
        </button>
      </div>
    );
  };

  const renderDetail = (side: Side) => {
    const id = locked[side] ?? hovered[side];
    const t = id ? getTrait(id) : null;
    const accent = side === 'positive' ? 'text-signal' : 'text-hiss';
    const pinned = t != null && locked[side] === t.id;

    return (
      <div className="mt-2 min-h-[6.5rem] rounded border border-white/15 bg-concrete-900/80 px-3 py-2">
        {t ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold uppercase tracking-wide">{t.name}</span>
              <span className={`shrink-0 text-xs tabular-nums ${accent}`}>
                {side === 'positive' ? '−' : '+'}
                {Math.abs(t.cost)} pt
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-white/70">
              {withAttrEmojis(t.description)}
            </p>
            {t.conflicts.length > 0 && (
              <p className="mt-1.5 text-2xs text-white/40">
                Conflicts: {t.conflicts.map((c) => getTrait(c).name).join(', ')}
              </p>
            )}
            {pinned && (
              <button
                onClick={() => toggleLock(side, t.id)}
                className="mt-1.5 text-2xs text-white/40 hover:text-white/80"
              >
                📌 pinned — click to unpin
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-white/30">
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
            className={`text-sm font-bold uppercase tracking-widest ${isPos ? 'text-signal' : 'text-hiss'}`}
          >
            {isPos ? 'Positive (−)' : 'Negative (+)'}
          </span>
          <span className="text-2xs uppercase tracking-wide text-white/40">
            {isPos ? 'Spend' : 'Earn'} · {isPos ? positiveCount : negativeCount} picked
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-3">
          {list.map((t) => renderTile(t, side))}
        </div>
        {renderDetail(side)}
      </div>
    );
  };

  const renderCustomStep = () => (
    <>
      <div className="mt-2 text-center">
        <h2 className="text-2xl font-bold uppercase tracking-[0.2em] text-signal">
          Advanced Mode
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          {picked ? (
            <>
              Starting from <span className="text-white/70">{picked.name}</span>. Negatives earn
              points; positives spend them. Points left must stay at 0 or higher.
            </>
          ) : selectedMyPreset ? (
            <>
              Editing <span className="text-white/70">{selectedMyPreset.name}</span>. Negatives earn
              points; positives spend them. Start at 0.
            </>
          ) : (
            <>
              Build freely. You start at 0 points — take negatives to afford positives.
              <br />
              Trait count is uncapped; remaining points must stay ≥ 0.
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-center gap-6">
          {nameField}
          <div className="flex flex-col items-center">
            <span className="text-2xs uppercase tracking-widest text-white/40">Points left</span>
            <span
              className={`text-3xl font-bold tabular-nums ${
                budgetRemaining < 0 ? 'text-hiss' : 'text-signal'
              }`}
            >
              {budgetRemaining}
            </span>
          </div>
          <button
            onClick={revert}
            className="mb-1 text-xs uppercase tracking-widest text-white/40 hover:text-white/80"
          >
            ⟳ {picked || selectedMyPreset ? 'Revert' : 'Reset'}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <input
            value={presetNameDraft}
            onChange={(e) => setPresetNameDraft(e.target.value)}
            maxLength={32}
            placeholder="Preset name"
            className="w-44 rounded border border-white/15 bg-black/40 px-2 py-1.5 text-xs outline-none focus:border-signal"
          />
          <button
            onClick={handleSavePreset}
            disabled={budgetRemaining < 0}
            className="rounded border border-signal/40 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-signal hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save as preset
          </button>
          {myPresets.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const p = myPresets.find((x) => x.id === e.target.value);
                if (p) {
                  selectMyPreset(p);
                  setPresetMsg(`Loaded “${p.name}”.`);
                }
              }}
              className="rounded border border-white/15 bg-black/40 px-2 py-1.5 text-2xs text-white/70 outline-none"
            >
              <option value="">Load preset…</option>
              {myPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {presetMsg && <p className="mt-2 text-2xs text-white/50">{presetMsg}</p>}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {renderColumn('negative')}
        {renderColumn('positive')}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between border-b border-white/10 pb-1">
          <span className="text-sm font-bold uppercase tracking-widest text-white/60">
            Attributes
          </span>
          <span className="text-2xs uppercase tracking-wide text-white/40">
            Set by your modifiers
          </span>
        </div>
        {attributeGrid}
      </div>

      <button
        onClick={start}
        disabled={budgetRemaining < 0}
        className="mx-auto mt-6 block w-full max-w-sm rounded-lg bg-signal/80 px-6 py-3 font-bold uppercase tracking-widest text-black transition hover:bg-signal disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
      >
        Next →
      </button>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <button
        onClick={() => (step === 'custom' ? setStep('occupation') : resetToMenu())}
        className="text-xs text-white/40 hover:text-white/70"
      >
        ← Back
      </button>

      {step === 'occupation' ? renderOccupationStep() : renderCustomStep()}
    </div>
  );
}
