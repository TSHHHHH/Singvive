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

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border border-white/15 bg-concrete-900/80 p-3">
        <h4 className="mb-2 text-xs uppercase tracking-widest text-white/30">Workbench</h4>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className={atShelter ? 'text-signal' : 'text-white/40'}>
            {atShelter ? 'Shelter' : 'No shelter'}
          </span>
          <span className={hasToolbox ? 'text-signal' : 'text-white/40'}>
            {hasToolbox ? 'Toolbox' : 'No toolbox'}
          </span>
        </div>
        <p className="mt-2 text-xs text-white/35">
          Inputs come from the backpack. Shelter recipes need a stash or an HDB
          room; tools stay in the pack and are not consumed.
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
          <button
            onClick={tearOwnClothes}
            title="Cut strips from what you're wearing. Costs nothing but the clothes."
            className="flex w-full items-baseline justify-between gap-3 rounded bg-white/5 px-2 py-1.5 text-left text-xs hover:bg-white/15"
          >
            <span className="min-w-0">
              <span className="font-semibold">Cut Up Your Clothes</span>
              <span className="block truncate text-white/35">
                Nothing — {clothingTears} left in them
              </span>
            </span>
            <span className="shrink-0 text-right text-white/35">{TEAR_HOURS}h</span>
          </button>
        ) : (
          <p className="text-xs text-white/35">
            The clothes on your back are already stripped. Find cloth, or go without.
          </p>
        )}
      </section>
    </div>
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
      <div className="flex flex-col gap-1.5">
        {recipes.map((recipe) => {
          const inputs = adjustCraftInputs(recipe.inputs, traitIds);
          const check = canCraft(recipe, items, atShelter, inputs);
          const out = itemDef(recipe.outputDefId);
          return (
            <button
              key={recipe.id}
              disabled={!check.ok}
              onClick={() => onCraft(recipe.id)}
              title={
                recipe.id === 'boil'
                  ? `${recipe.blurb} Burning a jerry can lowers your extract gauge.`
                  : recipe.blurb
              }
              className={`flex items-start gap-2 rounded px-2 py-1.5 text-left text-xs ${
                check.ok
                  ? 'bg-white/5 hover:bg-white/15'
                  : 'cursor-not-allowed bg-transparent text-white/25'
              }`}
            >
              <Icon name={itemIcon(out)} size={22} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className={`block ${check.ok ? 'font-semibold' : ''}`}>
                  {recipe.name}
                  {recipe.outputCount > 1 ? ` ×${recipe.outputCount}` : ''}
                </span>
                <span className="block truncate text-white/35">
                  {describeInputs(inputs)}
                  {recipe.tool ? ` · ${itemDef(recipe.tool).name}` : ''}
                  {recipe.id === 'boil' ? ' · burns evac fuel' : ''}
                </span>
              </span>
              <span className="shrink-0 text-right text-white/35">
                {check.ok ? `${recipe.hours}h` : check.reason}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
