import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import {
  ATTRIBUTE_BLURB,
  ATTRIBUTE_ICONS,
  ATTRIBUTE_KEYS,
  BASE_ATTRIBUTE,
  TRAITS,
  TRAIT_BUDGET,
  canPickTrait,
  getTrait,
  isCurse,
  isIncompatible,
  isLegalTraitBuild,
  isSignature,
  pickBlockReason,
  traitBudgetUsed,
  attributesFromTraits,
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
import { randomSurvivorName, SURVIVOR_NAME_MAX } from '../game/randomNames';
import type { Occupation, Trait } from '../game/types';
import { Icon } from '../icons/Icon';
import { TipHint, useCoarsePointer } from '../components/TipHint';
import { traitHoverText, traitName, useT } from '../i18n';
import { tip } from '../components/tips';

type Side = 'positive' | 'negative';
type PointSort = 'asc' | 'desc';

const TRAIT_TIP_PANEL =
  'max-w-[20rem] whitespace-pre-line break-words rounded border border-white/20 ' +
  'bg-concrete-900/95 px-3 py-2.5 text-sm leading-snug text-concrete-50 ' +
  'shadow-signage backdrop-blur-sm';

/** Same set, order-insensitive — an edited build is no longer that occupation. */
function sameTraits(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Sort by displayed point magnitude (1…5), then name. */
function sortTraitsByPoints(items: Trait[], dir: PointSort): Trait[] {
  const mul = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const d = Math.abs(a.cost) - Math.abs(b.cost);
    if (d !== 0) return d * mul;
    return a.name.localeCompare(b.name);
  });
}

export function CharacterCreate() {
  const { commitCharacter, resetToMenu } = useGame(
    useShallow((s) => ({ commitCharacter: s.commitCharacter, resetToMenu: s.resetToMenu })),
  );
  const { locale, t } = useT();
  const coarsePointer = useCoarsePointer();
  const [name, setName] = useState('');
  const [traitIds, setTraitIds] = useState<string[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [myPresets, setMyPresets] = useState<TraitPreset[]>(() => loadPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [presetMsg, setPresetMsg] = useState<string | null>(null);
  const [pointSort, setPointSort] = useState<PointSort>('desc');

  const attrs = attributesFromTraits(traitIds);
  const budgetRemaining = TRAIT_BUDGET - traitBudgetUsed(traitIds);

  const picked = pickedId ? getOccupation(pickedId) : null;
  const matchesOccupation = picked != null && sameTraits(traitIds, picked.traitIds);
  const occupationId = matchesOccupation ? picked.id : undefined;
  const selectedMyPreset = selectedPresetId
    ? (myPresets.find((p) => p.id === selectedPresetId) ?? null)
    : null;
  const matchesPreset =
    selectedMyPreset != null && sameTraits(traitIds, selectedMyPreset.traitIds);

  const positiveTraits = TRAITS.filter((t) => t.category === 'positive');
  const negativeTraits = TRAITS.filter((t) => t.category === 'negative');
  const positiveCount = traitIds.filter((id) => getTrait(id).category === 'positive').length;
  const negativeCount = traitIds.filter((id) => getTrait(id).category === 'negative').length;

  const identityLabel = matchesOccupation
    ? picked.name
    : matchesPreset
      ? selectedMyPreset.name
      : picked
        ? `Custom · based on ${picked.name}`
        : selectedMyPreset
          ? `Custom · based on ${selectedMyPreset.name}`
          : traitIds.length === 0
            ? 'Blank slate'
            : 'Custom';

  const remixHint = matchesOccupation
    ? `Loaded ${picked.name} — swap a trait to make it yours.`
    : matchesPreset
      ? `Loaded “${selectedMyPreset.name}” — edit freely, then save if you like it.`
      : picked || selectedMyPreset
        ? 'Build diverged from the seed. Revert to restore, or save as a preset.'
        : 'Load a job seed or pick traits from scratch. You start at 0 points.';

  const budgetHint =
    budgetRemaining === 0 &&
    traitIds.length === 2 &&
    (matchesOccupation || (picked != null && !matchesOccupation))
      ? 'A full signature + curse spends the whole pool. Swap the curse, or pick a cheaper signature, to free a point.'
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

  const selectOccupation = (o: Occupation) => {
    setPickedId(o.id);
    setSelectedPresetId(null);
    setTraitIds(o.traitIds);
    setPresetMsg(null);
  };

  const selectMyPreset = (p: TraitPreset) => {
    setSelectedPresetId(p.id);
    setPickedId(null);
    setTraitIds(p.traitIds);
    setPresetNameDraft(p.name);
    setPresetMsg(null);
  };

  const clearBuild = () => {
    setPickedId(null);
    setSelectedPresetId(null);
    setTraitIds([]);
    setPresetMsg(null);
    setPresetNameDraft('');
  };

  const revert = () => {
    if (picked) setTraitIds(picked.traitIds);
    else if (selectedMyPreset) setTraitIds(selectedMyPreset.traitIds);
    else setTraitIds([]);
  };

  const toggleTrait = (id: string) => {
    if (traitIds.includes(id)) {
      setTraitIds(traitIds.filter((t) => t !== id));
    } else if (canPickTrait(id, traitIds)) {
      setTraitIds([...traitIds, id]);
    }
  };

  const handleSavePreset = () => {
    const label =
      presetNameDraft.trim() || selectedMyPreset?.name || picked?.name || 'My Build';
    const existing = myPresets.find((p) => p.name.toLowerCase() === label.toLowerCase());
    if (existing && !window.confirm(`Overwrite preset “${existing.name}”?`)) return;
    const saved = savePreset(label, traitIds);
    if (!saved) {
      setPresetMsg(
        budgetRemaining < 0
          ? 'Fix the budget (points left must be ≥ 0) before saving.'
          : myPresets.length >= MAX_TRAIT_PRESETS && !existing
            ? `Preset limit reached (${MAX_TRAIT_PRESETS}). Delete one first.`
            : 'Could not save preset — build must be legal.',
      );
      return;
    }
    refreshPresets();
    setSelectedPresetId(saved.id);
    setPickedId(null);
    setPresetNameDraft(saved.name);
    setPresetMsg(`Saved “${saved.name}”.`);
  };

  const nameField = (
    <label className="flex flex-col items-start gap-1 text-left">
      <span className="text-2xs uppercase tracking-widest text-white/40">Name</span>
      <div className="flex items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={SURVIVOR_NAME_MAX}
          placeholder="Survivor"
          className="w-56 rounded border border-white/15 bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-signal sm:w-64"
        />
        <button
          type="button"
          onClick={() => setName(randomSurvivorName(name))}
          {...tip('Roll a Singapore-style full name')}
          className="rounded border border-white/15 bg-white/10 px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide text-white/70 transition hover:border-signal/50 hover:bg-signal/10 hover:text-signal"
        >
          Random
        </button>
      </div>
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
                  title={t(`ui.attributes.${k}`)}
                  className="shrink-0"
                />
                <span className="truncate">{t(`ui.attributes.${k}`)}</span>
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

  const renderOccupationSeed = (o: Occupation) => {
    const selected = matchesOccupation && pickedId === o.id;
    const basedOn = !matchesOccupation && pickedId === o.id;
    return (
      <button
        key={o.id}
        type="button"
        onClick={() => selectOccupation(o)}
        className={`flex flex-col rounded border px-2.5 py-2 text-left transition ${
          selected
            ? 'border-signal bg-signal/15'
            : basedOn
              ? 'border-signal/40 bg-signal/5'
              : 'border-white/10 bg-white/[0.03] hover:border-signal/50 hover:bg-white/[0.06]'
        }`}
      >
        <span className="text-xs font-bold uppercase tracking-wide">{o.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {o.traitIds.map((id) => {
            const tr = getTrait(id);
            return (
              <span
                key={id}
                className={`inline-flex items-center gap-1 whitespace-nowrap text-2xs ${
                  tr.category === 'positive' ? 'text-signal' : 'text-hiss'
                }`}
              >
                <Icon name={tr.icon} size={12} className="shrink-0" />
                {traitName(id, locale)}
              </span>
            );
          })}
        </span>
      </button>
    );
  };

  const renderSelectedChips = () => {
    if (traitIds.length === 0) {
      return <p className="text-2xs text-white/35">No traits yet — load a job or pick from the grid.</p>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {traitIds.map((id) => {
          const trait = getTrait(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggleTrait(id)}
              {...tip(`Remove ${traitName(id, locale)}`)}
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs transition hover:opacity-80 ${
                trait.category === 'positive'
                  ? 'border-signal/30 bg-signal/10 text-signal'
                  : 'border-hiss/30 bg-hiss/10 text-hiss'
              }`}
            >
              <Icon name={trait.icon} size={11} />
              {traitName(id, locale)}
              <span className="opacity-50">×</span>
            </button>
          );
        })}
      </div>
    );
  };

  const tileClass = (t: Trait): string => {
    const selected = traitIds.includes(t.id);
    const incompatible = !selected && isIncompatible(t.id, traitIds);
    const disabled = !selected && !canPickTrait(t.id, traitIds);

    if (selected && t.category === 'positive') {
      return 'border-2 border-signal bg-signal/30';
    }
    if (selected && t.category === 'negative') {
      return 'border-2 border-hiss bg-hiss/30';
    }
    if (incompatible || disabled) {
      return 'border-2 border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed';
    }
    return t.category === 'positive'
      ? 'border-2 border-signal/20 bg-signal/[0.04] hover:border-signal/55 hover:bg-signal/[0.1]'
      : 'border-2 border-hiss/20 bg-hiss/[0.04] hover:border-hiss/55 hover:bg-hiss/[0.1]';
  };

  const renderTile = (t: Trait, side: Side) => {
    const selected = traitIds.includes(t.id);
    const accent = side === 'positive' ? 'text-signal' : 'text-hiss';
    const sign = side === 'positive' ? '−' : '+';
    const blocked = !selected && !canPickTrait(t.id, traitIds);
    const why = blocked ? pickBlockReason(t.id, traitIds) : null;
    const detail = traitHoverText(t.id, locale);
    const tipText = why ? `${detail}\n(${why})` : detail;
    const label = traitName(t.id, locale);

    const body = (
      <button
        type="button"
        onClick={() => {
          if (!blocked) toggleTrait(t.id);
        }}
        aria-pressed={selected}
        aria-disabled={blocked}
        className={`flex min-w-0 flex-1 items-center gap-2.5 text-left ${
          blocked ? 'cursor-not-allowed' : ''
        }`}
      >
        <Icon name={t.icon} size={28} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold uppercase tracking-wide">
            {label}
          </span>
          <span className={`text-sm font-semibold tabular-nums ${accent}`}>
            {sign}
            {Math.abs(t.cost)} pt
          </span>
          {why && <span className="mt-0.5 block text-2xs leading-snug text-white/45">{why}</span>}
        </span>
      </button>
    );

    return (
      <div
        key={t.id}
        className={`flex items-center gap-1.5 rounded px-2 py-2 transition ${tileClass(t)}`}
      >
        {coarsePointer ? (
          body
        ) : (
          <TipHint
            tip={tipText}
            tipClassName={TRAIT_TIP_PANEL}
            placement="top"
            className="min-w-0 flex-1"
          >
            {body}
          </TipHint>
        )}

        {coarsePointer && (
          <TipHint tip={tipText} tipClassName={TRAIT_TIP_PANEL} placement="top" className="shrink-0">
            <button
              type="button"
              aria-label={`About ${label}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/20 text-xs font-semibold text-white/55 transition active:border-signal/50 active:text-signal"
            >
              ?
            </button>
          </TipHint>
        )}
      </div>
    );
  };

  const renderColumn = (side: Side) => {
    const isPos = side === 'positive';
    const list = isPos ? positiveTraits : negativeTraits;
    const groups = isPos
      ? [
          { label: 'Signature', items: sortTraitsByPoints(list.filter(isSignature), pointSort) },
          {
            label: 'Notable',
            items: sortTraitsByPoints(
              list.filter((tr) => !isSignature(tr) && tr.cost >= 2),
              pointSort,
            ),
          },
          {
            label: 'Minor',
            items: sortTraitsByPoints(
              list.filter((tr) => tr.cost === 1),
              pointSort,
            ),
          },
        ]
      : [
          { label: 'Curses', items: sortTraitsByPoints(list.filter(isCurse), pointSort) },
          {
            label: 'Flaws',
            items: sortTraitsByPoints(
              list.filter((tr) => !isCurse(tr)),
              pointSort,
            ),
          },
        ];
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
        <div className="flex flex-col gap-3">
          {groups.map((g) =>
            g.items.length === 0 ? null : (
              <div key={g.label}>
                <span className="mb-1 block text-2xs uppercase tracking-widest text-white/35">
                  {g.label}
                </span>
                <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-3">
                  {g.items.map((tr) => renderTile(tr, side))}
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <button
        type="button"
        onClick={resetToMenu}
        className="text-xs text-white/40 hover:text-white/70"
      >
        {t('ui.common.back')}
      </button>

      <div className="mt-2 text-center">
        <h2 className="text-2xl font-bold uppercase tracking-[0.2em] text-signal">
          Before It Fell
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          Jobs are starting seeds — load one, then swap traits on the grid.
          <br />
          Negatives earn points; positives spend them. Max one signature, one curse, two negatives.
          <br />
          Hover a trait for details — on touch, tap ?.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-center gap-6">
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
          type="button"
          onClick={revert}
          className="mb-1 text-xs uppercase tracking-widest text-white/40 hover:text-white/80"
        >
          ⟳ {picked || selectedMyPreset ? 'Revert seed' : 'Reset'}
        </button>
        <button
          type="button"
          onClick={clearBuild}
          className="mb-1 text-xs uppercase tracking-widest text-white/40 hover:text-white/80"
        >
          Clear
        </button>
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <span className="mb-1.5 block text-2xs uppercase tracking-widest text-white/40">
            Job seeds
          </span>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {OCCUPATIONS.map(renderOccupationSeed)}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-2xs uppercase tracking-widest text-white/40">
            My presets ({myPresets.length}/{MAX_TRAIT_PRESETS})
          </span>
          {myPresets.length === 0 ? (
            <p className="rounded border border-dashed border-white/10 px-3 py-3 text-xs text-white/35">
              No saved builds yet. Mix traits below, then Save as preset.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {myPresets.map((p) => {
                const selected = matchesPreset && selectedPresetId === p.id;
                const basedOn = !matchesPreset && selectedPresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectMyPreset(p)}
                    className={`rounded border px-2.5 py-1.5 text-left transition ${
                      selected
                        ? 'border-signal bg-signal/15'
                        : basedOn
                          ? 'border-signal/40 bg-signal/5'
                          : 'border-white/10 bg-white/[0.03] hover:border-signal/50'
                    }`}
                  >
                    <span className="text-xs font-bold uppercase tracking-wide">{p.name}</span>
                    <span className="ml-2 text-2xs text-white/45">{p.traitIds.length} traits</span>
                    {!isLegalTraitBuild(p.traitIds) && (
                      <span className="ml-2 text-2xs text-hiss">needs fixing</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded border border-white/15 bg-concrete-900/80 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-2xs uppercase tracking-widest text-white/40">Identity</span>
            <p className="text-sm font-bold uppercase tracking-wide text-signal">{identityLabel}</p>
            <p className="mt-1 text-xs text-white/50">{remixHint}</p>
            {budgetHint && <p className="mt-1 text-2xs text-white/40">{budgetHint}</p>}
            {matchesOccupation && picked && (
              <p className="mt-2 text-xs leading-relaxed text-white/60">{picked.blurb}</p>
            )}
          </div>
          {selectedMyPreset && matchesPreset && (
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => {
                  deletePreset(selectedMyPreset.id);
                  refreshPresets();
                  setSelectedPresetId(null);
                  setTraitIds([]);
                  setPresetNameDraft('');
                }}
                className="text-2xs uppercase tracking-wide text-hiss/70 hover:text-hiss"
              >
                Delete preset
              </button>
              <div className="flex flex-wrap items-center justify-end gap-1">
                <input
                  value={presetNameDraft}
                  onChange={(e) => setPresetNameDraft(e.target.value)}
                  maxLength={32}
                  className="w-36 rounded border border-white/15 bg-black/40 px-2 py-1 text-xs outline-none focus:border-signal"
                  placeholder="Rename…"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = renamePreset(selectedMyPreset.id, presetNameDraft);
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
          )}
        </div>
        <div className="mt-3 border-t border-white/10 pt-2.5">
          <span className="mb-1 block text-2xs uppercase tracking-widest text-white/40">
            Selected · click to remove
          </span>
          {renderSelectedChips()}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <span className="text-2xs uppercase tracking-widest text-white/40">Sort</span>
        <div
          className="inline-flex overflow-hidden rounded border border-white/15"
          role="group"
          aria-label="Sort traits by points"
        >
          <button
            type="button"
            onClick={() => setPointSort('asc')}
            aria-pressed={pointSort === 'asc'}
            {...tip('Points low → high within each group')}
            className={`px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition ${
              pointSort === 'asc' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            Pts ↑
          </button>
          <button
            type="button"
            onClick={() => setPointSort('desc')}
            aria-pressed={pointSort === 'desc'}
            {...tip('Points high → low within each group')}
            className={`border-l border-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition ${
              pointSort === 'desc' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            Pts ↓
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-6 lg:grid-cols-2">
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

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <input
          value={presetNameDraft}
          onChange={(e) => setPresetNameDraft(e.target.value)}
          maxLength={32}
          placeholder="Preset name"
          className="w-44 rounded border border-white/15 bg-black/40 px-2 py-1.5 text-xs outline-none focus:border-signal"
        />
        <button
          type="button"
          onClick={handleSavePreset}
          disabled={!isLegalTraitBuild(traitIds)}
          className="rounded border border-signal/40 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-signal hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save as preset
        </button>
      </div>
      {presetMsg && <p className="mt-2 text-center text-2xs text-white/50">{presetMsg}</p>}

      <button
        type="button"
        onClick={start}
        disabled={!isLegalTraitBuild(traitIds)}
        className="mx-auto mt-6 block w-full max-w-sm rounded-lg bg-signal/80 px-6 py-3 font-bold uppercase tracking-widest text-black transition hover:bg-signal disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
      >
        Next →
      </button>
    </div>
  );
}
