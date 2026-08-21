/** Tiny DEV event bus so overlays can deep-link and stay mutually exclusive. */

export const OPEN_LOOT_EVENT = 'singvive:open-loot';
export const OPEN_ENEMY_EVENT = 'singvive:open-enemy';
export const OPEN_ICON_EVENT = 'singvive:open-icon';
export const OPEN_LOCALE_EVENT = 'singvive:open-locale';
export const CLOSE_DEV_TOOLS_EVENT = 'singvive:close-dev-tools';
export const DEV_TOOL_STATE_EVENT = 'singvive:dev-tool-state';

export type DevToolId = 'loot' | 'enemies' | 'icons' | 'locale';

export type OpenLootDetail = {
  itemId?: string;
  tab?: 'items' | 'tables' | 'recipes';
  recipeId?: string;
};
export type OpenEnemyDetail = {
  tab?: 'overview' | 'zombies' | 'humans' | 'animals' | 'spawn';
  zombieId?: string;
  eliteId?: string;
  factionId?: string;
  lonerId?: string;
};
export type OpenIconDetail = { key?: string };
export type CloseDevToolsDetail = { except?: DevToolId };
export type DevToolStateDetail = { tool: DevToolId; open: boolean };

/** Close every DEV overlay except the one about to open (if any). */
export function closeDevTools(except?: DevToolId): void {
  window.dispatchEvent(
    new CustomEvent<CloseDevToolsDetail>(CLOSE_DEV_TOOLS_EVENT, {
      detail: { except },
    }),
  );
}

export function reportDevToolState(tool: DevToolId, open: boolean): void {
  window.dispatchEvent(
    new CustomEvent<DevToolStateDetail>(DEV_TOOL_STATE_EVENT, {
      detail: { tool, open },
    }),
  );
}

export function openLootEditor(detail: OpenLootDetail = {}): void {
  closeDevTools('loot');
  window.dispatchEvent(
    new CustomEvent<OpenLootDetail>(OPEN_LOOT_EVENT, { detail }),
  );
}

export function openLootItem(itemId: string): void {
  openLootEditor({ itemId });
}

export function openLootRecipe(recipeId: string): void {
  openLootEditor({ tab: 'recipes', recipeId });
}

export function openEnemyEditor(detail: OpenEnemyDetail = {}): void {
  closeDevTools('enemies');
  window.dispatchEvent(
    new CustomEvent<OpenEnemyDetail>(OPEN_ENEMY_EVENT, { detail }),
  );
}

export function openIconBrowser(detail: OpenIconDetail = {}): void {
  closeDevTools('icons');
  window.dispatchEvent(
    new CustomEvent<OpenIconDetail>(OPEN_ICON_EVENT, { detail }),
  );
}

export function openLocaleEditor(): void {
  closeDevTools('locale');
  window.dispatchEvent(new CustomEvent(OPEN_LOCALE_EVENT));
}
