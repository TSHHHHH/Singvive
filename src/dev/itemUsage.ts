import { LOOT_TABLES } from '../game/loot';
import { RECIPES } from '../game/crafting';
import { FACTION_CONFIG } from '../game/factions';
import type { ItemDef } from '../game/types';

export type ItemUsageRef = {
  kind: 'loot_table' | 'recipe' | 'faction' | 'starting';
  label: string;
};

/** Read-only cross-references for the DEV loot browser. */
export function findItemUsage(defId: string, def?: ItemDef | null): ItemUsageRef[] {
  const out: ItemUsageRef[] = [];

  if (def?.startingItem) {
    const count = def.startingCount ?? 1;
    out.push({
      kind: 'starting',
      label: def.slot
        ? `Starting gear (equip ${def.slot})`
        : `Starting gear (backpack ×${count})`,
    });
  }

  for (const [category, rows] of Object.entries(LOOT_TABLES)) {
    for (const [id, weight] of rows) {
      if (id === defId) {
        out.push({ kind: 'loot_table', label: `Loot table · ${category} (weight ${weight})` });
      }
    }
  }

  for (const recipe of RECIPES) {
    if (recipe.outputDefId === defId) {
      out.push({ kind: 'recipe', label: `Recipe output · ${recipe.name}` });
    }
    if (recipe.inputs[defId] !== undefined) {
      out.push({
        kind: 'recipe',
        label: `Recipe input · ${recipe.name} (×${recipe.inputs[defId]})`,
      });
    }
    if (recipe.tool === defId) {
      out.push({ kind: 'recipe', label: `Recipe tool · ${recipe.name}` });
    }
  }

  for (const [fid, cfg] of Object.entries(FACTION_CONFIG)) {
    if (cfg.stock.includes(defId)) {
      out.push({ kind: 'faction', label: `${cfg.shortName} stock` });
    }
    if (cfg.exclusiveStock.includes(defId)) {
      out.push({ kind: 'faction', label: `${cfg.shortName} exclusive stock` });
    }
    if (cfg.wants.includes(defId)) {
      out.push({ kind: 'faction', label: `${cfg.shortName} wants` });
    }
    if (cfg.tribute.includes(defId)) {
      out.push({ kind: 'faction', label: `${cfg.shortName} tribute` });
    }
    void fid;
  }

  return out;
}
