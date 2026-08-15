import type { EnemiesCatalog } from '../game/enemies';

export type EnemyDiff = {
  added: string[];
  removed: string[];
  changed: { path: string; fields: string[] }[];
};

function leafDiff(path: string, a: unknown, b: unknown, out: EnemyDiff['changed']): void {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (
    typeof a === 'object' &&
    a !== null &&
    !Array.isArray(a) &&
    typeof b === 'object' &&
    b !== null &&
    !Array.isArray(b)
  ) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    const fields: string[] = [];
    for (const key of keys) {
      const va = (a as Record<string, unknown>)[key];
      const vb = (b as Record<string, unknown>)[key];
      if (JSON.stringify(va) !== JSON.stringify(vb)) fields.push(key);
    }
    if (fields.length) out.push({ path, fields: fields.sort() });
    return;
  }
  out.push({ path, fields: ['value'] });
}

export function diffEnemiesCatalogs(
  baseline: EnemiesCatalog,
  next: EnemiesCatalog,
): EnemyDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: EnemyDiff['changed'] = [];

  const baseZ = new Map(baseline.zombies.map((z) => [z.id, z]));
  const nextZ = new Map(next.zombies.map((z) => [z.id, z]));
  for (const id of nextZ.keys()) {
    if (!baseZ.has(id)) added.push(`zombie:${id}`);
    else leafDiff(`zombie:${id}`, baseZ.get(id), nextZ.get(id), changed);
  }
  for (const id of baseZ.keys()) {
    if (!nextZ.has(id)) removed.push(`zombie:${id}`);
  }

  // Tier order change (same ids, different sequence)
  const baseOrder = baseline.zombies.map((z) => z.id).join(',');
  const nextOrder = next.zombies.map((z) => z.id).join(',');
  if (baseOrder !== nextOrder) {
    changed.push({ path: 'zombies.order', fields: ['order'] });
  }

  for (const id of Object.keys(next.elites) as (keyof EnemiesCatalog['elites'])[]) {
    if (!(id in baseline.elites)) added.push(`elite:${id}`);
    else leafDiff(`elite:${id}`, baseline.elites[id], next.elites[id], changed);
  }
  for (const id of Object.keys(baseline.elites) as (keyof EnemiesCatalog['elites'])[]) {
    if (!(id in next.elites)) removed.push(`elite:${id}`);
  }

  leafDiff('humanDefaults', baseline.humanDefaults, next.humanDefaults, changed);

  for (const id of Object.keys(next.humans) as (keyof EnemiesCatalog['humans'])[]) {
    if (!(id in baseline.humans)) added.push(`human:${id}`);
    else leafDiff(`human:${id}`, baseline.humans[id], next.humans[id], changed);
  }
  for (const id of Object.keys(baseline.humans) as (keyof EnemiesCatalog['humans'])[]) {
    if (!(id in next.humans)) removed.push(`human:${id}`);
  }

  for (const id of Object.keys(next.loners) as (keyof EnemiesCatalog['loners'])[]) {
    if (!(id in baseline.loners)) added.push(`loner:${id}`);
    else leafDiff(`loner:${id}`, baseline.loners[id], next.loners[id], changed);
  }
  for (const id of Object.keys(baseline.loners) as (keyof EnemiesCatalog['loners'])[]) {
    if (!(id in next.loners)) removed.push(`loner:${id}`);
  }

  leafDiff('spawn', baseline.spawn, next.spawn, changed);

  added.sort();
  removed.sort();
  changed.sort((a, b) => a.path.localeCompare(b.path));
  return { added, removed, changed };
}

export function enemyDiffIsEmpty(diff: EnemyDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}

export function enemiesFingerprint(catalog: EnemiesCatalog): string {
  return JSON.stringify(catalog);
}
