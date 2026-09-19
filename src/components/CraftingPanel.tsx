import { useMemo, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { itemDef, ITEMS } from '../game/loot';
import { TEAR_HOURS } from '../game/inventory';
import {
  canCraft,
  countOf,
  RECIPES,
  waterCarried,
  waterInputFor,
  type CraftBlock,
  type Recipe,
  type RecipeAvailability,
} from '../game/crafting';
import { adjustCraftInputs } from '../game/character';
import type { ItemDef, ItemInstance } from '../game/types';
import { itemIcon } from './Inventory/itemIcon';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';
import { itemName, recipeBlurb, recipeName, useT } from '../i18n';
import type { LocaleId } from '../i18n';
import { tip } from './tips';

/**
 * Workbench body for the slide-out. Recipes live here rather than buried under
 * the pack grid — repair and cutting a garment for rags stay on Inventory,
 * where you already have the item in hand.
 *
 * Two dozen recipes do not fit a 360px column as a flat list, so the panel is
 * built around the only question a player actually asks at a bench: *what can
 * I make right now?* Craftable rows sort to the top of their group, a filter
 * collapses the list to just those, and a blocked row spends its blurb line
 * saying what is missing instead.
 */

type CraftFilter = 'all' | 'ready';

interface RecipeRow {
  recipe: Recipe;
  inputs: Record<string, number>;
  check: RecipeAvailability;
  waterId: string | null;
  waterHave: number;
}

export function CraftingPanel() {
  const { t } = useT();
  const { items, clothingTears, currentPositionId, hdb, craftItem, tearOwnClothes, character } =
    useGame(
      useShallow((s) => ({
        items: s.items,
        clothingTears: s.clothingTears,
        currentPositionId: s.currentPositionId,
        hdb: s.hdb,
        craftItem: s.craftItem,
        tearOwnClothes: s.tearOwnClothes,
        character: s.character,
      })),
    );
  const [filter, setFilter] = useState<CraftFilter>('all');

  // Match store.craftItem: a stash tile or an HDB room is somewhere to work.
  const atShelter = currentPositionId !== null || hdb !== null;
  const hasToolbox = countOf(items, 'toolbox') > 0;
  const traitIds = character?.traitIds ?? [];

  // `character.traitIds` is a fresh array on every store read; its contents are
  // what the craft-cost adjustment actually depends on.
  const traitKey = traitIds.join(',');
  // One availability pass for the whole catalog: the counts in the filter bar
  // and the ready-first ordering both read it, and `countOf` walks the pack.
  const rows = useMemo<RecipeRow[]>(
    () =>
      RECIPES.map((recipe) => {
        const inputs = adjustCraftInputs(recipe.inputs, traitIds);
        return {
          recipe,
          inputs,
          check: canCraft(recipe, items, atShelter, inputs),
          waterId: recipe.waterInput ? waterInputFor(items, recipe.waterInput) : null,
          waterHave: recipe.waterInput ? waterCarried(items) : 0,
        };
      }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [items, atShelter, traitKey],
  );

  const readyCount = rows.filter((r) => r.check.ok).length;
  const visible = filter === 'ready' ? rows.filter((r) => r.check.ok) : rows;
  const field = visible.filter((r) => !r.recipe.needsShelter);
  const bench = visible.filter((r) => r.recipe.needsShelter);
  const ragsIcon = itemIcon(itemDef('cloth_rags'));

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
        <h4 className="mb-2 text-plate uppercase text-white/30">
          {t('ui.craft.workbench')}
        </h4>
        <div className="flex flex-wrap gap-1.5">
          <StatusChip
            ready={atShelter}
            readyLabel={t('ui.craft.shelterOk')}
            missingLabel={t('ui.craft.shelterNo')}
          />
          <StatusChip
            ready={hasToolbox}
            readyLabel={t('ui.craft.toolboxOk')}
            missingLabel={t('ui.craft.toolboxNo')}
          />
        </div>
        <p className="mt-2 max-w-prose text-body text-white/35">{t('ui.craft.hint')}</p>
      </section>

      <div className="flex max-w-[420px] gap-1.5">
        <FilterTab
          label={t('ui.craft.filterAll')}
          count={rows.length}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <FilterTab
          label={t('ui.craft.filterReady')}
          count={readyCount}
          active={filter === 'ready'}
          onClick={() => setFilter('ready')}
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-concrete-900/80 p-3 text-body text-white/35">
          <span className="block max-w-prose">{t('ui.craft.noneReady')}</span>
        </p>
      ) : null}

      <RecipeGroup
        title={t('ui.craft.groupField')}
        rows={field}
        items={items}
        onCraft={craftItem}
      />
      <RecipeGroup
        title={t('ui.craft.groupShelter')}
        rows={bench}
        items={items}
        onCraft={craftItem}
      />

      <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
        <h4 className="mb-2 text-plate uppercase text-white/30">
          {t('ui.craft.groupDesperate')}
        </h4>
        {clothingTears > 0 ? (
          <CraftActionRow
            icon={ragsIcon}
            name={t('ui.craft.tearName')}
            hours={TEAR_HOURS}
            ok
            onClick={tearOwnClothes}
            lines={[t('ui.craft.tearCost', { n: clothingTears }), t('ui.craft.tearBlurb')]}
          />
        ) : (
          <p className="max-w-prose text-body text-white/35">{t('ui.craft.tearNone')}</p>
        )}
      </section>
    </div>
  );
}

function StatusChip({
  ready,
  readyLabel,
  missingLabel,
}: {
  ready: boolean;
  readyLabel: string;
  missingLabel: string;
}) {
  return (
    <span
      className={`rounded px-2 py-1 text-body ${
        ready ? 'bg-signal/15 text-signal' : 'bg-white/5 text-white/40'
      }`}
    >
      {ready ? readyLabel : missingLabel}
    </span>
  );
}

/** All / Ready segment. The count is the point — it answers the question first. */
function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded border px-2 text-body ${
        active
          ? 'border-signal/50 bg-signal/15 font-semibold text-signal'
          : 'border-white/10 bg-white/5 text-white/45 hover:bg-white/10'
      }`}
    >
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}

/** Turn a `canCraft` blocker into a sentence in the player's language. */
function blockText(
  block: CraftBlock,
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: LocaleId,
): string {
  if (block.kind === 'shelter') return t('ui.craft.blockShelter');
  if (block.kind === 'tool') {
    return t('ui.craft.blockTool', { name: itemName(block.defId, locale) });
  }
  if (block.kind === 'water') {
    return t('ui.craft.blockWater', { need: block.need, have: block.have });
  }
  return t('ui.craft.blockInput', {
    need: block.need,
    have: block.have,
    name: itemName(block.defId, locale),
  });
}

function RecipeGroup({
  title,
  rows,
  items,
  onCraft,
}: {
  title: string;
  rows: RecipeRow[];
  items: ItemInstance[];
  onCraft: (recipeId: string) => void;
}) {
  const { t, locale } = useT();
  if (rows.length === 0) return null;

  // Ready first, catalog order within each bucket — the authored order still
  // reads top-to-bottom once you are past what you can actually make.
  const ordered = [...rows].sort((a, b) => Number(b.check.ok) - Number(a.check.ok));
  const readyHere = rows.filter((r) => r.check.ok).length;

  return (
    <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
      <h4 className="mb-2 flex items-baseline justify-between text-plate uppercase text-white/30">
        {title}
        <span className="tabular-nums">
          {readyHere}/{rows.length}
        </span>
      </h4>
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))]">
        {ordered.map(({ recipe, inputs, check, waterId, waterHave }) => {
          const out = itemDef(recipe.outputDefId);
          const baseBlurb = recipeBlurb(recipe.id, locale);
          const blurb =
            recipe.id === 'boil' ? `${baseBlurb} ${t('ui.craft.boilNote')}` : baseBlurb;
          const chips = [
            ...Object.entries(inputs)
              .filter(([, n]) => n > 0)
              .map(([defId, need]) => (
                <RecipeInputChip
                  key={defId}
                  defId={defId}
                  need={need}
                  have={countOf(items, defId)}
                />
              )),
            ...(recipe.tool
              ? [
                  <RecipeInputChip
                    key={`tool-${recipe.tool}`}
                    defId={recipe.tool}
                    need={1}
                    have={countOf(items, recipe.tool)}
                    role="tool"
                  />,
                ]
              : []),
            ...(recipe.waterInput
              ? [
                  <RecipeInputChip
                    key="water-input"
                    defId={waterId ?? 'water_bottle'}
                    need={recipe.waterInput}
                    have={waterHave}
                    nameOverride={t('ui.craft.anyWater')}
                  />,
                ]
              : []),
          ];

          return (
            <CraftActionRow
              key={recipe.id}
              icon={itemIcon(out)}
              name={`${recipeName(recipe.id, locale)}${recipe.outputCount > 1 ? ` ×${recipe.outputCount}` : ''}`}
              hours={recipe.hours}
              ok={check.ok}
              onClick={() => onCraft(recipe.id)}
              chips={chips}
              // A blocked row's blurb is the least useful line it could show.
              lines={check.ok ? [blurb] : undefined}
              blocker={check.block ? blockText(check.block, t, locale) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

/** Shared Field / Shelter / Desperate row: hours stay short on the right. */
function CraftActionRow({
  icon,
  name,
  hours,
  ok,
  onClick,
  chips,
  lines,
  blocker,
}: {
  icon: IconName;
  name: string;
  hours: number;
  ok: boolean;
  onClick: () => void;
  chips?: ReactNode;
  /** Blurb (craftable recipes) or desperate copy — each truncated to one line. */
  lines?: string[];
  /** Why this row is dead, in place of the blurb. */
  blocker?: string;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      aria-disabled={!ok}
      onClick={ok ? onClick : undefined}
      className={`flex min-h-11 w-full items-start gap-2.5 rounded border-l-2 px-2.5 py-2.5 text-left text-body ${
        ok
          ? 'border-signal/70 bg-white/[0.07] hover:bg-white/15 active:bg-white/20'
          : 'cursor-not-allowed border-transparent bg-transparent'
      }`}
    >
      <Icon
        name={icon}
        size={24}
        className={`mt-0.5 shrink-0 ${ok ? '' : 'opacity-40'}`}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block leading-snug ${
            ok ? 'font-semibold text-white' : 'text-white/55'
          }`}
        >
          {name}
        </span>
        {chips ? <span className="mt-1 flex flex-wrap gap-1">{chips}</span> : null}
        {lines?.map((line) => (
          <span key={line} className="mt-0.5 block truncate leading-snug text-white/35">
            {line}
          </span>
        ))}
        {blocker ? (
          <span className="mt-1 block leading-snug text-hiss/75">{blocker}</span>
        ) : null}
      </span>
      <span
        className={`shrink-0 pt-0.5 text-right tabular-nums ${
          ok ? 'text-white/50' : 'text-white/30'
        }`}
      >
        {t('ui.craft.hoursShort', { h: hours })}
      </span>
    </button>
  );
}

/**
 * Icon-only recipe input. A satisfied chip shows what it costs; a short one
 * shows the shortfall as `have/need`, because "you are missing some" is not
 * actionable and the hover tip is a press-and-hold on a phone.
 */
export function RecipeInputChip({
  defId,
  need,
  have,
  role = 'input',
  def,
  nameOverride,
}: {
  defId: string;
  need: number;
  have: number;
  role?: 'input' | 'tool';
  def?: ItemDef;
  nameOverride?: string;
}) {
  const { t, locale } = useT();
  const resolved = def ?? ITEMS[defId];
  if (!resolved) return null;

  const name = nameOverride ?? itemName(defId, locale);
  const short = have < need;
  const text =
    role === 'tool'
      ? t('ui.craft.toolTip', { name, have })
      : t('ui.craft.needHave', { name, need, have });

  return (
    <span
      className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center border ${
        role === 'tool' ? 'border-dashed' : ''
      } ${short ? 'border-hiss/50 bg-hiss/10' : 'border-white/15 bg-black/40'}`}
      {...tip(text)}
    >
      <Icon name={itemIcon(resolved)} size={18} className={short ? 'opacity-40' : undefined} />
      {role === 'tool' ? (
        <span className="pointer-events-none absolute -left-0.5 -top-0.5 rounded bg-black/80 text-white/80">
          <Icon name="action.craft" size={10} />
        </span>
      ) : null}
      <span
        className={`pointer-events-none absolute -bottom-px -right-px rounded-tl bg-black/75 px-0.5 text-micro font-bold tabular-nums ${
          short ? 'text-hiss' : 'text-white'
        }`}
      >
        {short ? `${have}/${need}` : need}
      </span>
    </span>
  );
}
