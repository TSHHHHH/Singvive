import { useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import {
  ATTRIBUTE_ICONS,
  ATTRIBUTE_KEYS,
  BASE_ATTRIBUTE,
  TRAITS,
  TRAIT_BUDGET,
  canPickTrait,
  getTrait,
  isLegalTraitBuild,
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
import { previewStartingSkills, SKILL_IDS } from '../game/skills';
import { TRAIT_TAG_ORDER, traitTags, type TraitTag } from '../game/traitTags';
import type { Occupation, Trait } from '../game/types';
import { Icon } from '../icons/Icon';
import { TipHint, useCoarsePointer } from '../components/TipHint';
import { traitDescription, traitEffects, traitHoverText, traitName, useT } from '../i18n';
import { tip } from '../components/tips';

type Side = 'positive' | 'negative';
type PointSort = 'asc' | 'desc';
type Step = 'background' | 'traits';

const TRAIT_TIP_PANEL =
  'max-w-[20rem] whitespace-pre-line break-words rounded border border-white/20 ' +
  'bg-concrete-900/95 px-3 py-2.5 text-read text-concrete-50 ' +
  'shadow-signage backdrop-blur-sm';

/** Same set, order-insensitive — an edited build is no longer that occupation. */
function sameTraits(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Sort by displayed point magnitude (1…5), then name. */
function sortTraitsByPoints(items: Trait[], dir: PointSort, locale: ReturnType<typeof useT>['locale']): Trait[] {
  const mul = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const d = Math.abs(a.cost) - Math.abs(b.cost);
    if (d !== 0) return d * mul;
    return traitName(a.id, locale).localeCompare(traitName(b.id, locale), locale);
  });
}

function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-label uppercase text-white/40">{children}</span>
      {right}
    </div>
  );
}

export function CharacterCreate() {
  const { commitCharacter, resetToMenu } = useGame(
    useShallow((s) => ({ commitCharacter: s.commitCharacter, resetToMenu: s.resetToMenu })),
  );
  const { locale, t, tList } = useT();
  const coarsePointer = useCoarsePointer();
  const [step, setStep] = useState<Step>('background');
  const [name, setName] = useState('');
  const [traitIds, setTraitIds] = useState<string[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [myPresets, setMyPresets] = useState<TraitPreset[]>(() => loadPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [presetMsg, setPresetMsg] = useState<string | null>(null);
  const [pointSort, setPointSort] = useState<PointSort>('desc');
  const [side, setSide] = useState<Side>('negative');
  const [tagFilter, setTagFilter] = useState<TraitTag | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const attrs = attributesFromTraits(traitIds);
  const budgetRemaining = TRAIT_BUDGET - traitBudgetUsed(traitIds);
  const legal = isLegalTraitBuild(traitIds);

  const picked = pickedId ? getOccupation(pickedId) : null;
  const matchesOccupation = picked != null && sameTraits(traitIds, picked.traitIds);
  const occupationId = matchesOccupation ? picked.id : undefined;
  const selectedMyPreset = selectedPresetId
    ? (myPresets.find((p) => p.id === selectedPresetId) ?? null)
    : null;
  const matchesPreset =
    selectedMyPreset != null && sameTraits(traitIds, selectedMyPreset.traitIds);

  const positiveCount = traitIds.filter((id) => getTrait(id).category === 'positive').length;
  const negativeCount = traitIds.filter((id) => getTrait(id).category === 'negative').length;

  const identityLabel = matchesOccupation
    ? t(`occupation.${picked.id}.name`)
    : matchesPreset
      ? selectedMyPreset.name
      : picked
        ? t('ui.create.basedOn', { name: t(`occupation.${picked.id}.name`) })
        : selectedMyPreset
          ? t('ui.create.basedOn', { name: selectedMyPreset.name })
          : traitIds.length === 0
            ? t('ui.create.blank')
            : t('ui.create.custom');

  const budgetHint =
    budgetRemaining === 0 && traitIds.length === 2 && picked != null
      ? t('ui.create.budgetHint')
      : null;

  const start = () => {
    if (!legal) return;
    commitCharacter({
      name: name.trim() || t('ui.create.survivor'),
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
      setTraitIds(traitIds.filter((x) => x !== id));
    } else if (canPickTrait(id, traitIds)) {
      setTraitIds([...traitIds, id]);
    }
  };

  const handleSavePreset = () => {
    const label =
      presetNameDraft.trim() || selectedMyPreset?.name || (picked ? t(`occupation.${picked.id}.name`) : t('ui.create.myBuild'));
    const existing = myPresets.find((p) => p.name.toLowerCase() === label.toLowerCase());
    if (existing && !window.confirm(t('ui.create.overwrite', { name: existing.name }))) return;
    const saved = savePreset(label, traitIds);
    if (!saved) {
      setPresetMsg(
        budgetRemaining < 0
          ? t('ui.create.fixBudget')
          : myPresets.length >= MAX_TRAIT_PRESETS && !existing
            ? t('ui.create.presetLimit', { n: MAX_TRAIT_PRESETS })
            : t('ui.create.saveFailed'),
      );
      return;
    }
    refreshPresets();
    setSelectedPresetId(saved.id);
    setPickedId(null);
    setPresetNameDraft(saved.name);
    setPresetMsg(t('ui.create.saved', { name: saved.name }));
  };

  // ── Shared pieces ────────────────────────────────────────────────────────

  const pointsBadge = (
    <div className="flex items-baseline gap-2">
      <span className="text-label uppercase text-white/40">{t('ui.create.pointsLeft')}</span>
      <span
        className={`text-title tabular-nums ${budgetRemaining < 0 ? 'text-hiss' : 'text-signal'}`}
      >
        {budgetRemaining}
      </span>
    </div>
  );

  const stepper = (
    <ol className="flex items-center gap-2 text-plate uppercase">
      {(
        [
          ['background', t('ui.create.backgroundStep')],
          ['traits', t('ui.create.traitsStep')],
        ] as const
      ).map(([id, label], i) => (
        <li key={id} className="flex items-center gap-2">
          {i > 0 && <span className="text-white/20">—</span>}
          <button
            type="button"
            onClick={() => setStep(id)}
            aria-current={step === id ? 'step' : undefined}
            className={step === id ? 'text-signal' : 'text-white/40 hover:text-white/70'}
          >
            {label}
          </button>
        </li>
      ))}
    </ol>
  );

  const attributeRow = (
    <div className="grid grid-cols-5 gap-1">
      {ATTRIBUTE_KEYS.map((k) => {
        const delta = attrs[k] - BASE_ATTRIBUTE;
        return (
          <div
            key={k}
            {...tip(`${t(`ui.attributes.${k}`)} — ${t(`ui.attributes.blurb.${k}`)}`)}
            className="flex min-w-0 flex-col items-center rounded border border-white/10 bg-white/5 px-1 py-1.5"
          >
            <Icon name={ATTRIBUTE_ICONS[k]} size={14} title={t(`ui.attributes.${k}`)} />
            <span className="mt-0.5 flex items-baseline gap-0.5">
              <span className="text-read font-bold tabular-nums">{attrs[k]}</span>
              {delta !== 0 && (
                <span
                  className={`text-micro tabular-nums ${delta > 0 ? 'text-signal' : 'text-hiss'}`}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
            </span>
            <span className="w-full truncate text-center text-micro uppercase text-white/40">
              {t(`ui.attributes.${k}`)}
            </span>
          </div>
        );
      })}
    </div>
  );

  const startingSkills = previewStartingSkills(traitIds);
  const skillsLine = (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      {SKILL_IDS.map((id) => {
        const level = startingSkills[id].level;
        if (level <= 0) return null;
        return (
          <span key={id} className="text-body text-concrete-50">
            {t(`ui.skills.names.${id}`)} <span className="tabular-nums text-signal">{level}</span>
          </span>
        );
      })}
      {SKILL_IDS.every((id) => startingSkills[id].level <= 0) && (
        <span className="text-body text-white/40">—</span>
      )}
    </div>
  );

  const selectedChips =
    traitIds.length === 0 ? (
      <p className="text-micro text-white/35">{t('ui.create.noTraits')}</p>
    ) : (
      <div className="flex flex-wrap gap-1">
        {traitIds.map((id) => {
          const trait = getTrait(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggleTrait(id)}
              onMouseEnter={() => setFocusId(id)}
              {...tip(t('ui.create.remove', { name: traitName(id, locale) }))}
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-micro transition hover:opacity-80 ${
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

  /** The build summary — the right rail on desktop, below the picker on mobile. */
  const summary = (
    <div className="flex flex-col gap-3 rounded border border-white/15 bg-concrete-900/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-label uppercase text-white/40">{t('ui.create.identity')}</span>
          <p className="truncate text-read font-bold uppercase tracking-wide text-signal">
            {identityLabel}
          </p>
        </div>
        <div className="flex shrink-0 gap-3 pt-3">
          <button
            type="button"
            onClick={revert}
            className="text-label uppercase text-white/40 hover:text-white/80"
          >
            ⟳ {t(picked || selectedMyPreset ? 'ui.create.revert' : 'ui.create.reset')}
          </button>
          <button
            type="button"
            onClick={clearBuild}
            className="text-label uppercase text-white/40 hover:text-white/80"
          >
            {t('ui.create.clear')}
          </button>
        </div>
      </div>
      <div>
        <SectionLabel>{t('ui.create.removeHint')}</SectionLabel>
        {selectedChips}
        {budgetHint && <p className="mt-1 text-micro text-white/40">{budgetHint}</p>}
      </div>
      <div>
        <SectionLabel>{t('ui.create.attributes')}</SectionLabel>
        {attributeRow}
      </div>
      <div>
        <SectionLabel>{t('ui.skills.starting')}</SectionLabel>
        {skillsLine}
      </div>
    </div>
  );

  // ── Step 1: background ───────────────────────────────────────────────────

  const nameField = (
    <label className="flex flex-col items-start gap-1 text-left">
      <span className="text-label uppercase text-white/40">{t('ui.create.name')}</span>
      <div className="flex items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={SURVIVOR_NAME_MAX}
          placeholder={t('ui.create.survivor')}
          className="w-56 rounded border border-white/15 bg-black/40 px-3 py-1.5 text-read outline-none focus:border-signal sm:w-64"
        />
        <button
          type="button"
          onClick={() => setName(randomSurvivorName(name))}
          {...tip(t('ui.create.randomHint'))}
          className="rounded border border-white/15 bg-white/10 px-2.5 py-1.5 text-label uppercase text-white/70 transition hover:border-signal/50 hover:bg-signal/10 hover:text-signal"
        >
          {t('ui.create.random')}
        </button>
      </div>
    </label>
  );

  const renderJobCard = (o: Occupation) => {
    const selected = matchesOccupation && pickedId === o.id;
    const basedOn = !matchesOccupation && pickedId === o.id;
    return (
      <button
        key={o.id}
        type="button"
        onClick={() => selectOccupation(o)}
        aria-pressed={selected}
        className={`flex flex-col rounded border px-3 py-2 text-left transition ${
          selected
            ? 'border-signal bg-signal/15'
            : basedOn
              ? 'border-signal/40 bg-signal/5'
              : 'border-white/10 bg-white/[0.03] hover:border-signal/50 hover:bg-white/[0.06]'
        }`}
      >
        <span className="text-plate uppercase">{t(`occupation.${o.id}.name`)}</span>
        <span className="mt-0.5 line-clamp-2 text-micro text-white/55">{t(`occupation.${o.id}.tagline`)}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {o.traitIds.map((id) => {
            const tr = getTrait(id);
            return (
              <span
                key={id}
                className={`inline-flex items-center gap-1 whitespace-nowrap text-micro ${
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

  const presetsBlock = (
    <div>
      <SectionLabel>
        {t('ui.create.presets', { n: myPresets.length, max: MAX_TRAIT_PRESETS })}
      </SectionLabel>
      {myPresets.length === 0 ? (
        <p className="rounded border border-dashed border-white/10 px-3 py-2 text-body text-white/35">
          {t('ui.create.noPresets')}
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
                <span className="text-plate uppercase">{p.name}</span>
                <span className="ml-2 text-micro text-white/45">{t('ui.create.traitCount', { n: p.traitIds.length })}</span>
                {!isLegalTraitBuild(p.traitIds) && (
                  <span className="ml-2 text-micro text-hiss">{t('ui.create.needsFixing')}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {selectedMyPreset && matchesPreset && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={presetNameDraft}
            onChange={(e) => setPresetNameDraft(e.target.value)}
            maxLength={32}
            className="w-40 rounded border border-white/15 bg-black/40 px-2 py-1 text-body outline-none focus:border-signal"
            placeholder={t('ui.create.renamePlaceholder')}
          />
          <button
            type="button"
            onClick={() => {
              const next = renamePreset(selectedMyPreset.id, presetNameDraft);
              if (!next) {
                setPresetMsg(t('ui.create.renameFailed'));
                return;
              }
              refreshPresets();
              setPresetMsg(null);
            }}
            className="text-label uppercase text-white/50 hover:text-white/80"
          >
            {t('ui.create.rename')}
          </button>
          <button
            type="button"
            onClick={() => {
              deletePreset(selectedMyPreset.id);
              refreshPresets();
              setSelectedPresetId(null);
              setTraitIds([]);
              setPresetNameDraft('');
            }}
            className="text-label uppercase text-hiss/70 hover:text-hiss"
          >
            {t('ui.create.delete')}
          </button>
        </div>
      )}
    </div>
  );

  const jobDetail = picked ? (
    <div className="rounded border border-white/10 bg-white/[0.03] p-3">
      <p className="text-plate uppercase text-signal">{t(`occupation.${picked.id}.name`)}</p>
      <p className="mt-1 text-body leading-relaxed text-white/60">{t(`occupation.${picked.id}.blurb`)}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-micro">
        <div>
          <span className="block uppercase text-white/40">{t('ui.create.goodAt')}</span>
          <span className="text-signal">{tList(`occupation.${picked.id}.goodAt`).join(locale === 'zh-Hans' ? '、' : ', ')}</span>
        </div>
        <div>
          <span className="block uppercase text-white/40">{t('ui.create.strugglesWith')}</span>
          <span className="text-hiss">{tList(`occupation.${picked.id}.strugglesWith`).join(locale === 'zh-Hans' ? '、' : ', ')}</span>
        </div>
      </div>
    </div>
  ) : (
    <p className="rounded border border-dashed border-white/10 p-3 text-body text-white/40">
      {t('ui.create.jobHint')}
    </p>
  );

  const backgroundStep = (
    <div className="flex min-w-0 flex-col gap-4">
      {nameField}
      <div>
        <SectionLabel
          right={
            <button
              type="button"
              onClick={clearBuild}
              className={`text-label uppercase ${
                !picked && !selectedMyPreset && traitIds.length === 0
                  ? 'text-signal'
                  : 'text-white/40 hover:text-white/80'
              }`}
            >
              {t('ui.create.blank')}
            </button>
          }
        >
          {t('ui.create.backgroundPrompt')}
        </SectionLabel>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {OCCUPATIONS.map(renderJobCard)}
        </div>
      </div>
      {presetsBlock}
    </div>
  );

  // ── Step 2: traits ───────────────────────────────────────────────────────

  const tileClass = (tr: Trait, selected: boolean, blocked: boolean): string => {
    if (selected && tr.category === 'positive') return 'border-signal bg-signal/30';
    if (selected) return 'border-hiss bg-hiss/30';
    if (blocked) return 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed';
    return tr.category === 'positive'
      ? 'border-signal/20 bg-signal/[0.04] hover:border-signal/55 hover:bg-signal/[0.1]'
      : 'border-hiss/20 bg-hiss/[0.04] hover:border-hiss/55 hover:bg-hiss/[0.1]';
  };

  const renderTile = (tr: Trait) => {
    const selected = traitIds.includes(tr.id);
    const isPos = tr.category === 'positive';
    const blocked = !selected && !canPickTrait(tr.id, traitIds);
    const why = blocked ? pickBlockReason(tr.id, traitIds, locale) : null;
    const label = traitName(tr.id, locale);

    return (
      <div
        key={tr.id}
        onMouseEnter={() => setFocusId(tr.id)}
        className={`flex items-center gap-1 rounded border-2 transition ${tileClass(tr, selected, blocked)}`}
      >
        <button
          type="button"
          onClick={() => {
            setFocusId(tr.id);
            if (!blocked) toggleTrait(tr.id);
          }}
          onFocus={() => setFocusId(tr.id)}
          aria-pressed={selected}
          aria-disabled={blocked}
          className={`flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1.5 text-left lg:gap-2 lg:px-2 ${
            blocked ? 'cursor-not-allowed' : ''
          }`}
        >
          <Icon name={tr.icon} size={20} className="shrink-0" />
          <span className="min-w-0 flex-1 text-plate uppercase leading-tight max-lg:tracking-normal lg:truncate">
            {label}
          </span>
          <span
            className={`shrink-0 text-body font-semibold tabular-nums ${isPos ? 'text-signal' : 'text-hiss'}`}
          >
            {isPos ? '−' : '+'}
            {Math.abs(tr.cost)}
          </span>
        </button>
        {coarsePointer && (
          <TipHint
            tip={why ? `${traitHoverText(tr.id, locale)}\n(${why})` : traitHoverText(tr.id, locale)}
            tipClassName={TRAIT_TIP_PANEL}
            placement="top"
            className="shrink-0 pr-1"
          >
            <button
              type="button"
              aria-label={t('ui.create.about', { name: label })}
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-white/20 text-body font-semibold text-white/55 transition active:border-signal/50 active:text-signal"
            >
              ?
            </button>
          </TipHint>
        )}
      </div>
    );
  };

  const sideTraits = TRAITS.filter(
    (tr) => tr.category === side && (tagFilter == null || traitTags(tr.id).includes(tagFilter)),
  );

  const sideTab = (id: Side) => {
    const isPos = id === 'positive';
    const active = side === id;
    const count = isPos ? positiveCount : negativeCount;
    return (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => setSide(id)}
        className={`flex flex-1 items-baseline justify-center gap-2 border-b-2 px-3 py-2 text-read font-bold uppercase tracking-widest transition ${
          active
            ? isPos
              ? 'border-signal text-signal'
              : 'border-hiss text-hiss'
            : 'border-white/10 text-white/40 hover:text-white/70'
        }`}
      >
        {t(isPos ? 'ui.create.positives' : 'ui.create.negatives')}
        <span className="hidden text-label font-normal normal-case tracking-normal opacity-70 sm:inline">
          {t(isPos ? 'ui.create.spendPoints' : 'ui.create.earnPoints')}
          {count > 0 ? t('ui.create.picked', { n: count }) : ''}
        </span>
      </button>
    );
  };

  const filterChip = (tag: TraitTag | null) => {
    const active = tagFilter === tag;
    return (
      <button
        key={tag ?? 'all'}
        type="button"
        onClick={() => setTagFilter(tag)}
        aria-pressed={active}
        className={`rounded-full border px-2.5 py-0.5 text-label uppercase transition ${
          active
            ? 'border-signal bg-signal/15 text-signal'
            : 'border-white/15 text-white/50 hover:border-white/30 hover:text-white/80'
        }`}
      >
        {tag ? t(`ui.create.tags.${tag}`) : t('ui.create.all')}
      </button>
    );
  };

  const traitsStep = (
    <div className="flex min-w-0 flex-col gap-2">
      <div role="tablist" className="flex">
        {sideTab('negative')}
        {sideTab('positive')}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {filterChip(null)}
          {TRAIT_TAG_ORDER.map(filterChip)}
        </div>
        <div
          className="inline-flex overflow-hidden rounded border border-white/15"
          role="group"
          aria-label={t('ui.create.sortPoints')}
        >
          {(['asc', 'desc'] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => setPointSort(dir)}
              aria-pressed={pointSort === dir}
              {...tip(t(dir === 'asc' ? 'ui.create.pointsAsc' : 'ui.create.pointsDesc'))}
              className={`px-2 py-0.5 text-label uppercase transition ${
                dir === 'desc' ? 'border-l border-white/15' : ''
              } ${pointSort === dir ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              {t('ui.create.points')} {dir === 'asc' ? '↑' : '↓'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-4">
          {sortTraitsByPoints(sideTraits, pointSort, locale).map(renderTile)}
        </div>
        {sideTraits.length === 0 && (
          <p className="text-body text-white/40">{t('ui.create.noMatches')}</p>
        )}
      </div>
    </div>
  );

  const focusTrait = focusId ? getTrait(focusId) : null;
  const focusBlockedWhy =
    focusTrait && !traitIds.includes(focusTrait.id) && !canPickTrait(focusTrait.id, traitIds)
      ? pickBlockReason(focusTrait.id, traitIds, locale)
      : null;
  const traitDetail = focusTrait ? (
    <div className="rounded border border-white/15 bg-concrete-900/80 p-3">
      <div className="flex items-center gap-2">
        <Icon name={focusTrait.icon} size={24} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-plate uppercase">
          {traitName(focusTrait.id, locale)}
        </span>
        <span
          className={`text-read font-semibold tabular-nums ${
            focusTrait.category === 'positive' ? 'text-signal' : 'text-hiss'
          }`}
        >
          {focusTrait.category === 'positive' ? '−' : '+'}
          {Math.abs(focusTrait.cost)} {t('ui.create.pointUnit')}
        </span>
      </div>
      <p className="mt-1.5 text-body italic leading-snug text-white/50">
        {traitDescription(focusTrait.id, locale)}
      </p>
      <ul className="mt-1.5 space-y-0.5 text-body text-concrete-50">
        {traitEffects(focusTrait.id, locale).map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>
      {focusBlockedWhy && <p className="mt-1.5 text-micro text-hiss">{focusBlockedWhy}</p>}
    </div>
  ) : (
    <p className="rounded border border-dashed border-white/10 p-3 text-body text-white/40">
      {t('ui.create.traitHint')}
    </p>
  );

  const savePresetRow = (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          value={presetNameDraft}
          onChange={(e) => setPresetNameDraft(e.target.value)}
          maxLength={32}
          placeholder={t('ui.create.presetName')}
          className="min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-2 py-1 text-body outline-none focus:border-signal"
        />
        <button
          type="button"
          onClick={handleSavePreset}
          disabled={!legal}
          className="shrink-0 rounded border border-signal/40 px-2.5 py-1 text-label uppercase text-signal hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('ui.create.savePreset')}
        </button>
      </div>
      {presetMsg && <p className="mt-1 text-micro text-white/50">{presetMsg}</p>}
    </div>
  );

  const primaryButton =
    step === 'background' ? (
      <button
        type="button"
        onClick={() => setStep('traits')}
        className="w-full rounded-lg bg-signal/80 px-6 py-2.5 font-bold uppercase tracking-widest text-black transition hover:bg-signal"
      >
        {t('ui.create.nextTraits')}
      </button>
    ) : (
      <button
        type="button"
        onClick={start}
        disabled={!legal}
        className="w-full rounded-lg bg-signal/80 px-6 py-2.5 font-bold uppercase tracking-widest text-black transition hover:bg-signal disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
      >
        {t('ui.create.next')}
      </button>
    );

  const secondaryAction =
    step === 'background' ? (
      legal && traitIds.length > 0 ? (
        <button
          type="button"
          onClick={start}
          className="text-label uppercase text-white/40 hover:text-white/80"
        >
          {t('ui.create.skip')}
        </button>
      ) : null
    ) : (
      <button
        type="button"
        onClick={() => setStep('background')}
        className="text-label uppercase text-white/40 hover:text-white/80"
      >
        {t('ui.create.backBackground')}
      </button>
    );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 pb-24 pt-3 lg:h-full lg:px-6 lg:pb-4">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-white/10 pb-2">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={resetToMenu}
            className="text-body text-white/40 hover:text-white/70"
          >
            {t('ui.common.back')}
          </button>
          <h2 className="text-title uppercase tracking-signage text-signal">{t('ui.create.title')}</h2>
        </div>
        {stepper}
        <div className="hidden lg:block">{pointsBadge}</div>
      </header>

      <div className="mt-3 grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="min-h-0 lg:overflow-y-auto lg:pr-1">
          {step === 'background' ? backgroundStep : traitsStep}
        </main>
        <aside className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          {summary}
          {step === 'background' ? jobDetail : traitDetail}
          {step === 'traits' && savePresetRow}
          <div className="hidden flex-col items-center gap-2 lg:mt-auto lg:flex">
            {primaryButton}
            {secondaryAction}
          </div>
        </aside>
      </div>

      {/* Mobile: the primary action stays in reach without scrolling to the end. */}
      <div className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t border-white/10 bg-concrete-950/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="shrink-0">{pointsBadge}</div>
        <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
          {primaryButton}
          {secondaryAction}
        </div>
      </div>
    </div>
  );
}
