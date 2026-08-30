import { describe, expect, it } from 'vitest';
import items from '../game/data/items.json' with { type: 'json' };
import lootTables from '../game/data/lootTables.json' with { type: 'json' };
import recipes from '../game/data/recipes.json' with { type: 'json' };
import enemies from '../game/data/enemies.json' with { type: 'json' };
import itemTileColors from '../game/data/itemTileColors.json' with { type: 'json' };
import { validateItemsCatalog } from './validateItems';
import { validateLootTablesCatalog } from './validateLootTables';
import { validateRecipesCatalog } from './validateRecipes';
import { validateEnemiesCatalog } from './validateEnemies';
import { validateItemTileColors } from './validateItemTileColors';

/**
 * The committed content catalogs are loaded into the game through
 * `as unknown as` casts, so TypeScript checks nothing about them. The DEV
 * editors already validate on save, and `loot.ts` logs problems — but only
 * under `import.meta.env.DEV`, so a shipped build never checks at all.
 *
 * This is that missing gate. It runs the same validators the editors use
 * against what is actually on disk, so a bad catalog fails CI rather than a
 * player's search. (A stale `lootTables.json` entry pointing at a deleted item
 * previously crashed ~6% of residential rolls; this suite is what catches it.)
 */

const knownItemIds: ReadonlySet<string> = new Set(Object.keys(items));

describe('content catalogs', () => {
  it('items.json is valid', () => {
    expect(validateItemsCatalog(items)).toEqual([]);
  });

  it('lootTables.json is valid and references only real items', () => {
    expect(validateLootTablesCatalog(lootTables, knownItemIds)).toEqual([]);
  });

  it('recipes.json is valid and references only real items', () => {
    expect(validateRecipesCatalog(recipes, knownItemIds)).toEqual([]);
  });

  it('enemies.json is valid and drops only real items', () => {
    expect(validateEnemiesCatalog(enemies, knownItemIds)).toEqual([]);
  });

  it('itemTileColors.json is valid', () => {
    expect(validateItemTileColors(itemTileColors)).toEqual([]);
  });
});
