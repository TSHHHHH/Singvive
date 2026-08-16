import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../game/store';
import { itemDef } from '../game/loot';
import { TEAR_HOURS } from '../game/inventory';
import {
  canCraft,
  countOf,
  describeInputs,
  RECIPES,
  type Recipe,
} from '../game/crafting';
import { adjustCraftInputs } from '../game/character';
import type { ItemInstance } from '../game/types';
import { itemIcon } from './Inventory/itemIcon';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/keys';

/**
 * Workbench body for the slide-out. Recipes live here rather than buried under
 * the pack grid — repair and cutting a garment for rags stay on Inventory,
 * where you already have the item in hand.
 */
export function CraftingPanel() {
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
        onCraft={craftItem}
      />
      <RecipeGroup
        title="Shelter"
        recipes={bench}
        items={items}
        atShelter={atShelter}
        traitIds={traitIds}
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
        ready
          ? 'bg-signal/15 text-signal'
          : 'bg-white/5 text-white/40'
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
  onCraft,
}: {
  title: string;
  recipes: Recipe[];
  items: ItemInstance[];
  atShelter: boolean;
  traitIds: string[];
  onCraft: (recipeId: string) => void;
}) {
  return (
    <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
      <h4 className="mb-2 text-xs uppercase tracking-widest text-white/30">{title}</h4>
      <div className="flex flex-col gap-2">
        {recipes.map((recipe) => {
          const inputs = adjustCraftInputs(recipe.inputs, traitIds);
          const check = canCraft(recipe, items, atShelter, inputs);
          const out = itemDef(recipe.outputDefId);
          const inputLine = [
            describeInputs(inputs),
            recipe.tool ? itemDef(recipe.tool).name : null,
          ]
            .filter(Boolean)
            .join(' · ');
          const blurb =
            recipe.id === 'boil'
              ? `${recipe.blurb} Burning a jerry can lowers your extract gauge.`
              : recipe.blurb;

          return (
            <CraftActionRow
              key={recipe.id}
              icon={itemIcon(out)}
              name={`${recipe.name}${recipe.outputCount > 1 ? ` ×${recipe.outputCount}` : ''}`}
              hours={recipe.hours}
              ok={check.ok}
              onClick={() => onCraft(recipe.id)}
              lines={[inputLine, blurb]}
              blocker={check.ok ? undefined : check.reason}
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
  lines,
  blocker,
}: {
  icon: IconName;
  name: string;
  hours: number;
  ok: boolean;
  onClick: () => void;
  /** Inputs then blurb — both truncated to one line. */
  lines: string[];
  blocker?: string;
}) {
  return (
    <button
      type="button"
      disabled={!ok}
      onClick={onClick}
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
        {lines.map((line) => (
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
