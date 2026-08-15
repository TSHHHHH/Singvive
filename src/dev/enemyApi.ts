import type { EnemiesCatalog } from '../game/enemies';
import { validateEnemiesCatalog } from './validateEnemies';

export type { EnemiesCatalog };

export async function fetchEnemiesCatalog(): Promise<EnemiesCatalog> {
  const res = await fetch('/__dev/enemies');
  if (!res.ok) throw new Error(`Failed to load enemies (${res.status})`);
  return (await res.json()) as EnemiesCatalog;
}

export async function saveEnemiesCatalog(
  catalog: EnemiesCatalog,
  knownItemIds?: ReadonlySet<string>,
): Promise<void> {
  const errors = validateEnemiesCatalog(catalog, knownItemIds);
  if (errors.length > 0) throw new Error(errors.slice(0, 5).join('\n'));
  const res = await fetch('/__dev/enemies', {
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

export function downloadEnemiesCatalog(
  catalog: EnemiesCatalog,
  filename = 'enemies.json',
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

export function parseImportedEnemies(
  text: string,
  knownItemIds?: ReadonlySet<string>,
): EnemiesCatalog {
  const parsed: unknown = JSON.parse(text);
  const errors = validateEnemiesCatalog(parsed, knownItemIds);
  if (errors.length > 0) throw new Error(errors.slice(0, 8).join('\n'));
  return parsed as EnemiesCatalog;
}
