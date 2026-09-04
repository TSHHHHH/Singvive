import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { itemDef, ITEMS } from '../game/loot';
import { TEAR_HOURS } from '../game/inventory';
import {
  canCraft,
  countOf,
  RECIPES,
  WATER_INPUT_IDS,
  waterInputFor,
  type Recipe,
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
 */
export function CraftingPanel() {
  const { locale } = useT();
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

  // Match store.craftItem: a stash tile or an HDB room is somewhere to work.
  const atShelter = currentPositionId !== null || hdb !== null;
  const hasToolbox = countOf(items, 'toolbox') > 0;
  const traitIds = character?.traitIds ?? [];

  const field = RECIPES.filter((r) => !r.needsShelter);
  const bench = RECIPES.filter((r) => r.needsShelter);
  const ragsIcon = itemIcon(itemDef('cloth_rags'));

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
        <h4 className="mb-2 text-xs uppercase tracking-widest text-white/30">Workbench</h4>
        <div className="flex flex-wrap gap-1.5">
          <StatusChip ready={atShelter} readyLabel="Shelter" missingLabel="No shelter" />
          <StatusChip ready={hasToolbox} readyLabel="Toolbox" missingLabel="No toolbox" />
        </div>
        <p className="mt-2 text-xs leading-snug text-white/35">
          Inputs from the pack. Shelter recipes need a stash or HDB. Tools stay in the pack.
        </p>
      </section>

      <RecipeGroup
        title="Field"
        recipes={field}
        items={items}
        atShelter={atShelter}
        traitIds={traitIds}
        locale={locale}
        onCraft={craftItem}
      />
      <RecipeGroup
        title="Shelter"
        recipes={bench}
        items={items}
        atShelter={atShelter}
        traitIds={traitIds}
        locale={locale}
        onCraft={craftItem}
      />

      <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
        <h4 className="mb-2 text-xs uppercase tracking-widest text-white/30">Desperate</h4>
        {clothingTears > 0 ? (
          <CraftActionRow
            icon={ragsIcon}
            name="Cut Up Your Clothes"
            hours={TEAR_HOURS}
            ok
            onClick={tearOwnClothes}
            lines={[
              `Nothing — ${clothingTears} left in them`,
              'Cut strips from what you are wearing. Costs nothing but the clothes.',
            ]}
          />
        ) : (
          <p className="text-xs leading-snug text-white/35">
            The clothes on your back are already stripped. Find cloth, or go without.
          </p>
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
      className={`rounded px-2 py-1 text-xs ${
        ready ? 'bg-signal/15 text-signal' : 'bg-white/5 text-white/40'
      }`}
    >
      {ready ? readyLabel : missingLabel}
    </span>
  );
}

function RecipeGroup({
  title,
  recipes,
  items,
  atShelter,
  traitIds,
  locale,
  onCraft,
}: {
  title: string;
  recipes: Recipe[];
  items: ItemInstance[];
  atShelter: boolean;
  traitIds: string[];
  locale: LocaleId;
  onCraft: (recipeId: string) => void;
}) {
  return (
    <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
      <h4 className="mb-2 text-xs uppercase tracking-widest text-white/30">{title}</h4>
      <div className="flex flex-col gap-2">
        {recipes.map((recipe) => {
          const inputs = adjustCraftInputs(recipe.inputs, traitIds);
          const waterId = recipe.waterInput
            ? waterInputFor(items, recipe.waterInput)
            : null;
          const waterHave = recipe.waterInput
            ? WATER_INPUT_IDS.reduce((total, id) => total + countOf(items, id), 0)
            : 0;
          const check = canCraft(recipe, items, atShelter, inputs);
          const out = itemDef(recipe.outputDefId);
          const baseBlurb = recipeBlurb(recipe.id, locale);
          const blurb =
            recipe.id === 'boil'
              ? `${baseBlurb} Burning a jerry can lowers your extract gauge.`
              : baseBlurb;
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
                    nameOverride="Any Water"
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
              lines={[blurb]}
              blocker={
                recipe.needsShelter && !atShelter ? 'Needs somewhere to work' : undefined
              }
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
  /** Blurb (recipes) or desperate copy — each truncated to one line. */
  lines?: string[];
  /** Shelter-only; mat/tool shortages live on the chips. */
  blocker?: string;
}) {
  return (
    <button
      type="button"
      aria-disabled={!ok}
      onClick={ok ? onClick : undefined}
      className={`flex min-h-11 w-full items-start gap-2.5 rounded px-2.5 py-2.5 text-left text-xs ${
        ok
          ? 'bg-white/5 hover:bg-white/15 active:bg-white/20'
          : 'cursor-not-allowed bg-transparent'
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
            ok ? 'font-semibold text-white' : 'font-medium text-white/55'
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
          <span className="mt-1 block leading-snug text-white/50">{blocker}</span>
        ) : null}
      </span>
      <span
        className={`shrink-0 pt-0.5 text-right tabular-nums ${
          ok ? 'text-white/50' : 'text-white/30'
        }`}
      >
        {hours}h
      </span>
    </button>
  );
}

/** Icon-only recipe input. Names and have/need live on the hover/hold tip. */
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
        className={`pointer-events-none absolute -bottom-px -right-px rounded-tl bg-black/75 px-0.5 text-2xs font-black leading-tight tabular-nums ${
          short ? 'text-hiss' : 'text-white'
        }`}
      >
        {need}
      </span>
    </span>
  );
}
