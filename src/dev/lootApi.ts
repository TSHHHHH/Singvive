import type { ItemDef } from '../game/types';
import { validateItemsCatalog } from './validateItems';
import {
  validateLootTablesCatalog,
  type LootTablesCatalog,
} from './validateLootTables';

export type { LootTablesCatalog, LootTableEntry } from './validateLootTables';
export type ItemsCatalog = Record<string, ItemDef>;

export const MAX_ICON_BYTES = 64 * 1024;
/** Either edge of an uploaded icon must be ≤ this (inventory tiles). */
export const MAX_ICON_EDGE = 256;

export async function fetchItemsCatalog(): Promise<ItemsCatalog> {
  const res = await fetch('/__dev/items');
  if (!res.ok) {
    throw new Error(`Failed to load items (${res.status})`);
  }
  return (await res.json()) as ItemsCatalog;
}

export async function saveItemsCatalog(catalog: ItemsCatalog): Promise<void> {
  const errors = validateItemsCatalog(catalog);
  if (errors.length > 0) {
    throw new Error(errors.slice(0, 5).join('\n'));
  }
  const res = await fetch('/__dev/items', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(catalog),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      errors?: string[];
    } | null;
    const detail =
      body?.errors?.slice(0, 5).join('\n') ?? body?.error ?? `HTTP ${res.status}`;
    throw new Error(detail);
  }
}

export type ItemIconInfo = { key: string; file: string; bytes: number };

export async function fetchItemIcons(): Promise<{
  maxBytes: number;
  icons: ItemIconInfo[];
}> {
  const res = await fetch('/__dev/item-icons');
  if (!res.ok) throw new Error(`Failed to list icons (${res.status})`);
  return (await res.json()) as { maxBytes: number; icons: ItemIconInfo[] };
}

export async function uploadItemIcon(
  itemId: string,
  file: File,
): Promise<{ key: string; file: string; bytes: number; keysUpdated: boolean }> {
  if (file.size > MAX_ICON_BYTES) {
    throw new Error(`Icon exceeds ${MAX_ICON_BYTES} byte limit (${file.size} bytes)`);
  }
  if (file.type !== 'image/png' && file.type !== 'image/webp') {
    throw new Error('Only PNG and WebP uploads are allowed');
  }
  const size = await readImageSize(file);
  if (size.w > MAX_ICON_EDGE || size.h > MAX_ICON_EDGE) {
    throw new Error(
      `Icon too large (${size.w}×${size.h}). Max edge is ${MAX_ICON_EDGE}px.`,
    );
  }
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const dataBase64 = btoa(binary);

  const res = await fetch('/__dev/item-icon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId,
      mime: file.type,
      dataBase64,
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    key?: string;
    file?: string;
    bytes?: number;
    keysUpdated?: boolean;
  } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `Upload failed (${res.status})`);
  }
  return {
    key: body!.key!,
    file: body!.file!,
    bytes: body!.bytes!,
    keysUpdated: !!body!.keysUpdated,
  };
}

function readImageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve({ w, h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    img.src = url;
  });
}

export function downloadCatalog(catalog: ItemsCatalog, filename = 'items.json'): void {
  const blob = new Blob([`${JSON.stringify(catalog, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportedCatalog(text: string): ItemsCatalog {
  const parsed: unknown = JSON.parse(text);
  const errors = validateItemsCatalog(parsed);
  if (errors.length > 0) {
    throw new Error(errors.slice(0, 8).join('\n'));
  }
  return parsed as ItemsCatalog;
}

export function blankItem(id: string): ItemDef {
  return {
    id,
    name: 'New Item',
    w: 1,
    h: 1,
    weight: 0.1,
    effect: { kind: 'misc' },
    value: 1,
    stackable: true,
    maxStack: 1,
    color: '#7f8c8d',
  };
}

export function catalogFingerprint(catalog: ItemsCatalog): string {
  return JSON.stringify(catalog);
}

export async function fetchLootTablesCatalog(): Promise<LootTablesCatalog> {
  const res = await fetch('/__dev/loot-tables');
  if (!res.ok) throw new Error(`Failed to load loot tables (${res.status})`);
  return (await res.json()) as LootTablesCatalog;
}

export async function saveLootTablesCatalog(
  catalog: LootTablesCatalog,
  knownItemIds?: ReadonlySet<string>,
): Promise<void> {
  const errors = validateLootTablesCatalog(catalog, knownItemIds);
  if (errors.length > 0) throw new Error(errors.slice(0, 5).join('\n'));
  const res = await fetch('/__dev/loot-tables', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(catalog),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      errors?: string[];
    } | null;
    throw new Error(
      body?.errors?.slice(0, 5).join('\n') ?? body?.error ?? `HTTP ${res.status}`,
    );
  }
}

export function downloadLootTables(
  catalog: LootTablesCatalog,
  filename = 'lootTables.json',
): void {
  const blob = new Blob([`${JSON.stringify(catalog, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportedLootTables(
  text: string,
  knownItemIds?: ReadonlySet<string>,
): LootTablesCatalog {
  const parsed: unknown = JSON.parse(text);
  const errors = validateLootTablesCatalog(parsed, knownItemIds);
  if (errors.length > 0) throw new Error(errors.slice(0, 8).join('\n'));
  return parsed as LootTablesCatalog;
}
