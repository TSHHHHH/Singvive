import { describe, expect, it } from 'vitest';
import { t } from './t';
import { ATTRIBUTE_KEYS, TRAITS } from '../game/character';
import { SETTINGS_SCHEMA } from '../game/settings';
import { RECIPES } from '../game/crafting';
import { TOWN_TIER_ORDER } from '../game/townField';
import { EQUIP_SLOTS } from '../components/Inventory/equipSlots';
import items from '../game/data/items.json' with { type: 'json' };
import enemies from '../game/data/enemies.json' with { type: 'json' };

/**
 * The i18n surface is stringly typed: `t()` takes a `string`, and a key that
 * does not resolve falls through to `?? key` with no compile-time or runtime
 * signal. Roughly two dozen call sites build their key from a template
 * (`t(`ui.slots.${slot}`)`), so no static check can see them at all — that is
 * how the Holster slot shipped rendering as the literal `UI.SLOTS.FIREARM`.
 *
 * This walks each of those key families over its real id set. English only:
 * other locales fall back to English by design, so a missing translation is a
 * gap, not a bug.
 */

const unresolved = (key: string) => t(key) === key;

const enemyIds = (): string[] => {
  const cat = enemies as Record<string, unknown>;
  const ids: string[] = [];
  for (const group of ['zombies', 'elites', 'animals']) {
    const arr = cat[group];
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      if (row && typeof row === 'object' && 'id' in row) ids.push(String((row as { id: unknown }).id));
    }
  }
  return ids;
};

describe('every templated message key resolves in English', () => {
  it('item names', () => {
    expect(Object.keys(items).map((id) => `item.${id}`).filter(unresolved)).toEqual([]);
  });

  it('enemy names', () => {
    expect(enemyIds().map((id) => `enemy.${id}`).filter(unresolved)).toEqual([]);
  });

  it('trait names and descriptions', () => {
    const keys = TRAITS.flatMap((tr) => [`trait.${tr.id}.name`, `trait.${tr.id}.description`]);
    expect(keys.filter(unresolved)).toEqual([]);
  });

  it('recipe names and blurbs', () => {
    const keys = RECIPES.flatMap((r) => [`recipe.${r.id}.name`, `recipe.${r.id}.blurb`]);
    expect(keys.filter(unresolved)).toEqual([]);
  });

  it('settings labels and descriptions', () => {
    const keys = SETTINGS_SCHEMA.flatMap((d) => [
      `settings.${d.key}.label`,
      `settings.${d.key}.description`,
    ]);
    expect(keys.filter(unresolved)).toEqual([]);
  });

  it('UI enums (attributes, equip slots, town tiers)', () => {
    const keys = [
      ...ATTRIBUTE_KEYS.flatMap((k) => [`ui.attributes.${k}`, `ui.attributes.short.${k}`]),
      ...EQUIP_SLOTS.map(({ slot }) => `ui.slots.${slot}`),
      ...TOWN_TIER_ORDER.map((tier) => `ui.town.${tier}`),
    ];
    expect(keys.filter(unresolved)).toEqual([]);
  });
});
