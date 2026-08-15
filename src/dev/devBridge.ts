/** Tiny DEV event bus so Enemies ↔ Loot overlays can deep-link. */

export const OPEN_LOOT_EVENT = 'singvive:open-loot';
export const OPEN_ENEMY_EVENT = 'singvive:open-enemy';

export type OpenLootDetail = { itemId: string };
export type OpenEnemyDetail = {
  tab?: 'overview' | 'zombies' | 'humans' | 'spawn';
  zombieId?: string;
  eliteId?: string;
  factionId?: string;
  lonerId?: string;
};

export function openLootItem(itemId: string): void {
  window.dispatchEvent(
    new CustomEvent<OpenLootDetail>(OPEN_LOOT_EVENT, { detail: { itemId } }),
  );
}

export function openEnemyEditor(detail: OpenEnemyDetail = {}): void {
  window.dispatchEvent(
    new CustomEvent<OpenEnemyDetail>(OPEN_ENEMY_EVENT, { detail }),
  );
}
